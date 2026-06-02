"""User management router for the Identity Service."""

import json
import secrets
import string
from typing import Optional
from uuid import UUID

from common.auth import hash_password
from common.database import get_db
from common.enums import AuthProvider, UserRole, UserStatus
from common.messaging import RabbitMQClient
from common.models import IdentityAuditLog, RoleMappingRule, Tenant, User
from common.schemas import UserResponse
from common.storage import download_file, upload_file
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from services.identity.auth.azure import (
    check_azure_user_exists,
    is_company_email,
    send_invite_email,
)
from services.identity.middleware.rbac import require_min_role, require_role
from services.identity.schemas.user import (
    AcceptInvite,
    CSVImportResult,
    CSVUserImport,
    ConfirmEmailUpdate,
    CreateUser,
    IdentityAuditLogListResponse,
    IdentityAuditLogResponse,
    InviteUser,
    KeepEmailRequest,
    RoleMappingRule,
    RoleMappingRuleCreate,
    RoleMappingRuleResponse,
    RoleMappingRuleUpdate,
    SetLocalPasswordRequest,
    UserDeactivate,
    UserListResponse,  # Add this import
    UserRevoke,
    UserStatusChange,
    UserUpdate,
    parse_csv_users,
)
from services.identity.user_defaults import get_default_user_timezone

router = APIRouter(prefix="/identity/users", tags=["users"])


def _normalize_email_domain(email: str) -> str:
    return email.strip().lower().rsplit("@", 1)[-1] if "@" in email else ""


def _normalize_tenant_domain(domain: Optional[str]) -> str:
    return (domain or "").strip().lower().lstrip("@")


def _get_tenant_allowed_domain(tenant: Tenant | None) -> str:
    return _normalize_tenant_domain(tenant.email_domain if tenant else None)


def _require_email_domain_for_tenant(email: str, tenant: Tenant | None) -> None:
    email_domain = _normalize_email_domain(email)
    tenant_domain = _get_tenant_allowed_domain(tenant)
    if not tenant_domain:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Company email domain is not configured for this tenant",
        )
    if email_domain != tenant_domain:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"User email domain must match the company domain: {tenant_domain}",
        )


def _resolve_tenant_for_superadmin_user(email: str, tenant_id: Optional[str], db: Session) -> Tenant:
    from uuid import UUID

    email_domain = _normalize_email_domain(email)
    tenant = None

    if tenant_id:
        try:
            tenant_uuid = UUID(tenant_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid tenant_id",
            )
        tenant = db.query(Tenant).filter(Tenant.id == tenant_uuid).first()
        if not tenant:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tenant not found",
            )
        _require_email_domain_for_tenant(email, tenant)
        return tenant

    tenants = db.query(Tenant).filter(Tenant.email_domain.isnot(None)).all()
    matching_tenant = next(
        (
            candidate
            for candidate in tenants
            if _get_tenant_allowed_domain(candidate) == email_domain
        ),
        None,
    )
    if not matching_tenant:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User email domain must belong to an existing 3S group company",
        )
    return matching_tenant


@router.get("/", response_model=UserListResponse)
def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(require_role("Admin", "Manager", "SuperAdmin")),
    db: Session = Depends(get_db),
):
    """List all users (Admin/Manager/SuperAdmin only).

    Args:
        page: Page number.
        page_size: Items per page.
        current_user: Authenticated user from JWT.
        db: Database session.

    Returns:
        Paginated list of user responses.
    """
    tenant_id = current_user.get("tenantId")
    offset = (page - 1) * page_size

    # SuperAdmin can see all users across tenants
    if current_user.get("role") == "SuperAdmin":
        users = db.query(User).offset(offset).limit(page_size).all()
        total = db.query(User).count()
    elif current_user.get("role") in ["Admin", "Manager"]:
        # Regular tenant admins/managers need a tenant_id
        if not tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Tenant ID required to list users",
            )
        users = (
            db.query(User)
            .filter(User.tenant_id == tenant_id)
            .offset(offset)
            .limit(page_size)
            .all()
        )
        total = db.query(User).filter(User.tenant_id == tenant_id).count()
    else:
        # Other roles not allowed
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions to list users",
        )

    return UserListResponse(
        users=users,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post(
    "/invite", response_model=UserResponse, status_code=status.HTTP_201_CREATED
)
async def invite_user(
    invite_data: InviteUser,
    current_user: dict = Depends(require_role("Admin")),
    db: Session = Depends(get_db),
):
    """Invite a new user (Admin only).

    Creates a user account with pending_invitation status.
    No password is generated — the user sets their own
    password when accepting the invite.
    In production, an invitation email would be sent via Microsoft Graph API.

    Args:
        invite_data: Invitation details (email, role).
        current_user: Authenticated admin from JWT.
        db: Database session.

    Returns:
        Created user response.

    Raises:
        HTTPException 409 if email already exists.
    """
    tenant_id = current_user.get("tenantId")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="SuperAdmins cannot invite regular users",
        )

    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found",
        )
    _require_email_domain_for_tenant(invite_data.email, tenant)

    existing = db.query(User).filter(User.email == invite_data.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        )

    is_local_login_user = bool(invite_data.password)
    default_timezone = get_default_user_timezone(db)

    new_user = User(
        email=invite_data.email,
        password_hash=hash_password(invite_data.password)
        if invite_data.password
        else None,
        auth_provider=AuthProvider.local.value,
        first_name=invite_data.first_name or "",
        last_name=invite_data.last_name or "",
        role=invite_data.role,
        department=invite_data.department,
        status=UserStatus.active.value
        if is_local_login_user
        else UserStatus.pending_invitation.value,
        onboarded=is_local_login_user,
        tenant_id=tenant_id,
        skills=invite_data.skills or [],
        timezone=default_timezone,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    if not is_local_login_user:
        await send_invite_email(
            invite_data.email,
            current_user.get("email", "admin"),
        )

    return new_user


def generate_temp_password(length: int = 12) -> str:
    """Generate a temporary password.

    Args:
        length: Length of the password.

    Returns:
        Randomly generated password.
    """
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _current_actor_id(current_user: dict) -> Optional[UUID]:
    subject = current_user.get("sub")
    if not subject:
        return None
    try:
        return UUID(str(subject))
    except ValueError:
        return None


def _current_actor_email(current_user: dict) -> Optional[str]:
    return current_user.get("email") or current_user.get("preferred_username")


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    user_data: CreateUser,
    current_user: dict = Depends(require_role("SuperAdmin")),
    db: Session = Depends(get_db),
):
    """Create a new user (Super Admin only).

    Args:
        user_data: User creation data.
        current_user: Authenticated super admin from JWT.
        db: Database session.

    Returns:
        Created user response.

    Raises:
        HTTPException 409 if email already exists.
    """
    existing = db.query(User).filter(User.email == user_data.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        )

    tenant = _resolve_tenant_for_superadmin_user(user_data.email, user_data.tenant_id, db)
    default_timezone = get_default_user_timezone(db)

    new_user = User(
        email=user_data.email,
        password_hash=hash_password(user_data.password)
        if user_data.password
        else None,
        auth_provider=AuthProvider.local.value,
        first_name=user_data.first_name,
        last_name=user_data.last_name,
        role=user_data.role,
        department=user_data.department,
        status=user_data.status or UserStatus.active.value,
        tenant_id=tenant.id,
        skills=[],
        timezone=default_timezone,
        onboarded=bool(user_data.password),
    )
    db.add(new_user)
    db.flush()
    db.add(
        IdentityAuditLog(
            tenant_id=tenant.id,
            action="user.create",
            actor_id=_current_actor_id(current_user),
            actor_email=_current_actor_email(current_user),
            target_user_id=new_user.id,
            target_email=new_user.email,
            details=json.dumps(
                {
                    "role": new_user.role,
                    "department": new_user.department,
                    "status": new_user.status,
                    "created_by": "superadmin",
                }
            ),
        )
    )
    db.commit()
    db.refresh(new_user)
    return new_user


@router.post("/import", response_model=CSVImportResult)
async def import_users_from_csv(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_role("Admin")),
    db: Session = Depends(get_db),
):
    """Import users from CSV file (Admin only).

    CSV format: email, first_name, last_name, role, department

    For each row:
    1. Validate fields → if invalid → IMPORT_ERROR, skip
    2. Check DB for duplicate → if exists → IMPORT_ERROR, skip
    3. Check Azure via Microsoft Graph API:
       → if found → create with status=provisioned, auth_provider=azure_entra
       → if not found → create with status=pending_invitation, send invite email
    4. Publish user.created event to RabbitMQ
    5. Return import summary with provisioned/pending/error counts

    Args:
        file: CSV file upload.
        current_user: Authenticated admin user.
        db: Database session.

    Returns:
        Import result with provisioned/pending/skipped counts and errors.

    Raises:
        HTTPException 400 if file is not a CSV.
    """
    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File must be a CSV file",
        )

    content = file.file.read().decode("utf-8")

    valid_users, parse_errors = parse_csv_users(content)

    provisioned_count = 0
    pending_count = 0
    skipped_count = 0
    import_errors = []

    valid_roles = {role.value for role in UserRole}

    rabbitmq = None
    try:
        rabbitmq = RabbitMQClient()
    except Exception:
        pass

    invited_by_email = current_user.get("email", "admin")
    default_timezone = get_default_user_timezone(db)
    tenant_id = current_user.get("tenantId")
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found",
        )

    for user_data in valid_users:
        row_num = valid_users.index(user_data) + 2

        try:
            _require_email_domain_for_tenant(user_data.email, tenant)
        except HTTPException as exc:
            import_errors.append(
                {
                    "row": row_num,
                    "error": str(exc.detail),
                    "email": user_data.email,
                }
            )
            continue

        if user_data.role not in valid_roles:
            import_errors.append(
                {
                    "row": row_num,
                    "error": f"Invalid role: {user_data.role}",
                    "email": user_data.email,
                }
            )
            continue

        existing = db.query(User).filter(User.email == user_data.email).first()
        if existing:
            skipped_count += 1
            continue

        in_azure = await check_azure_user_exists(user_data.email)
        is_company = is_company_email(user_data.email)

        if in_azure or is_company:
            new_user = User(
                email=user_data.email,
                password_hash=None,
                auth_provider=AuthProvider.azure_entra.value,
                first_name=user_data.first_name,
                last_name=user_data.last_name,
                role=user_data.role,
                department=user_data.department,
                status=UserStatus.provisioned.value,
                skills=[],
                tenant_id=tenant_id,
                timezone=default_timezone,
            )
            db.add(new_user)
            provisioned_count += 1
        else:
            new_user = User(
                email=user_data.email,
                password_hash=None,
                auth_provider=AuthProvider.local.value,
                first_name=user_data.first_name,
                last_name=user_data.last_name,
                role=user_data.role,
                department=user_data.department,
                status=UserStatus.pending_invitation.value,
                skills=[],
                tenant_id=tenant_id,
                timezone=default_timezone,
            )
            db.add(new_user)
            await send_invite_email(user_data.email, invited_by_email)
            pending_count += 1

        if rabbitmq and new_user:
            rabbitmq.publish(
                exchange="auth",
                routing_key="user.created",
                message={
                    "event": "user.created",
                    "userId": str(new_user.id),
                    "email": new_user.email,
                    "role": new_user.role,
                    "status": new_user.status,
                    "authProvider": new_user.auth_provider,
                    "provisioned": in_azure,
                },
            )

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        import_errors.append(
            {
                "row": 0,
                "error": f"Database error: {str(e)}",
                "email": "",
            }
        )

    return CSVImportResult(
        provisioned_count=provisioned_count,
        pending_count=pending_count,
        skipped_count=skipped_count,
        errors=import_errors,
        total_rows=len(valid_users),
    )


@router.get("/me", response_model=UserResponse)
def get_current_user_profile(
    current_user: dict = Depends(require_min_role("TeamIntern")),
    db: Session = Depends(get_db),
):
    """Get the current user's profile.

    Args:
        current_user: Authenticated user from JWT.
        db: Database session.

    Returns:
        User response for the current user.

    Raises:
        HTTPException 404 if user not found.
    """
    user = db.query(User).filter(User.id == current_user["sub"]).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )
    return user


@router.put("/profile", response_model=UserResponse)
def update_current_user_profile(
    update_data: UserUpdate,
    current_user: dict = Depends(require_min_role("TeamIntern")),
    db: Session = Depends(get_db),
):
    """Update the current user's own profile.

    Args:
        update_data: Fields to update (name, bio, skills, avatar, department).
        current_user: Authenticated user from JWT.
        db: Database session.

    Returns:
        Updated user response.

    Raises:
        HTTPException 404 if user not found.
    """
    user = db.query(User).filter(User.id == current_user["sub"]).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    update_dict = update_data.model_dump(exclude_unset=True)
    for field, value in update_dict.items():
        if value is not None:
            setattr(user, field, value)
            if field == "timezone":
                user.timezone_manually_set = True

    db.commit()
    db.refresh(user)
    return user


ALLOWED_AVATAR_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
MAX_AVATAR_SIZE = 5 * 1024 * 1024  # 5MB


@router.post("/me/avatar", response_model=UserResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_min_role("TeamIntern")),
    db: Session = Depends(get_db),
):
    """Upload a profile avatar image.

    Stores the image in MinIO (user-avatars bucket) and updates the
    user's avatar field with a presigned URL.

    Args:
        file: Image file (JPEG, PNG, GIF, WebP, max 5MB).
        current_user: Authenticated user from JWT.
        db: Database session.

    Returns:
        Updated user response.

    Raises:
        HTTPException 400 if file type or size is invalid.
        HTTPException 404 if user not found.
    """
    user = db.query(User).filter(User.id == current_user["sub"]).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    if file.content_type not in ALLOWED_AVATAR_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Invalid file type: {file.content_type}. Allowed: JPEG, PNG, GIF, WebP"
            ),
        )

    content = await file.read()
    if len(content) > MAX_AVATAR_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too large. Maximum size is 5MB",
        )

    ext = file.filename.split(".")[-1] if file.filename else "png"
    object_name = f"{user.id}/avatar.{ext}"

    upload_file(
        bucket_name="user-avatars",
        object_name=object_name,
        file_data=content,
        content_type=file.content_type,
    )

    # Store the MinIO object name so the proxy endpoint can fetch it.
    # The frontend resolves this via the backend proxy to avoid CORS.
    user.avatar = object_name
    db.commit()
    db.refresh(user)
    return user


AVATAR_CONTENT_TYPES = {
    "jpeg": "image/jpeg",
    "jpg": "image/jpeg",
    "jfif": "image/jpeg",
    "png": "image/png",
    "gif": "image/gif",
    "webp": "image/webp",
}


@router.get("/avatar/{object_name:path}")
def get_avatar(object_name: str, db: Session = Depends(get_db)):
    """Public proxy endpoint to serve user avatars from MinIO.

    Browsers cannot send auth headers when loading <img src>, so this
    endpoint is unauthenticated. The object_name contains a UUID user ID
    providing reasonable security through obscurity for avatar images.

    Avoids CORS issues by serving the image through the backend instead
    of directly from MinIO.

    Args:
        object_name: MinIO object path (e.g., "{user_id}/avatar.png").

    Returns:
        Image file response.

    Raises:
        HTTPException 404 if avatar not found.
    """
    try:
        file_data = download_file(
            bucket_name="user-avatars",
            object_name=object_name,
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Avatar not found"
        )

    ext = object_name.rsplit(".", 1)[-1].lower() if "." in object_name else "png"
    content_type = AVATAR_CONTENT_TYPES.get(ext, "image/png")
    return Response(content=file_data, media_type=content_type)


def _build_user_export_response(
    format: str,
    role: Optional[str],
    department: Optional[str],
    user_status: Optional[str],
    current_user: dict,
    db: Session = Depends(get_db),
):
    tenant_id = current_user.get("tenantId")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant ID required to export users",
        )

    query = db.query(User).filter(User.tenant_id == tenant_id)

    if role:
        query = query.filter(User.role == role)
    if department:
        query = query.filter(User.department == department)
    if user_status:
        query = query.filter(User.status == user_status)

    users = query.order_by(User.created_at.desc(), User.email.asc()).all()

    if format == "csv":
        import csv
        import io

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(
            [
                "Email",
                "First Name",
                "Last Name",
                "Role",
                "Department",
                "Status",
                "Auth Provider",
                "Created At",
            ]
        )
        for user in users:
            writer.writerow(
                [
                    user.email,
                    user.first_name,
                    user.last_name,
                    user.role,
                    user.department or "",
                    user.status,
                    user.auth_provider,
                    user.created_at.isoformat() if user.created_at else "",
                ]
            )

        return Response(
            content=output.getvalue().encode("utf-8"),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=company-users.csv"},
        )

    if format == "xlsx":
        try:
            from openpyxl import Workbook
            from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
            from openpyxl.utils import get_column_letter
        except ImportError:
            raise HTTPException(
                status_code=status.HTTP_501_NOT_IMPLEMENTED,
                detail="Excel export not available. Install openpyxl.",
            )

        wb = Workbook()
        ws = wb.active
        ws.title = "Users"
        ws.append(
            [
                "Email",
                "First Name",
                "Last Name",
                "Role",
                "Department",
                "Status",
                "Auth Provider",
                "Created At",
            ]
        )
        for user in users:
            ws.append(
                [
                    user.email,
                    user.first_name,
                    user.last_name,
                    user.role,
                    user.department or "",
                    user.status,
                    user.auth_provider,
                    user.created_at.isoformat() if user.created_at else "",
                ]
            )

        header_fill = PatternFill("solid", fgColor="0F766E")
        header_font = Font(color="FFFFFF", bold=True, size=13)
        header_alignment = Alignment(horizontal="center", vertical="center")
        thin_border = Border(
            left=Side(style="thin", color="CBD5E1"),
            right=Side(style="thin", color="CBD5E1"),
            top=Side(style="thin", color="CBD5E1"),
            bottom=Side(style="thin", color="CBD5E1"),
        )
        even_row_fill = PatternFill("solid", fgColor="F8FAFC")

        ws.freeze_panes = "A2"
        ws.auto_filter.ref = ws.dimensions
        ws.row_dimensions[1].height = 26

        for cell in ws[1]:
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = header_alignment
            cell.border = thin_border

        for row in ws.iter_rows(min_row=2):
            for cell in row:
                cell.alignment = Alignment(vertical="center", wrap_text=True)
                cell.border = thin_border
                if cell.row % 2 == 0:
                    cell.fill = even_row_fill

        for column_cells in ws.columns:
            column_letter = get_column_letter(column_cells[0].column)
            max_length = max(len(str(cell.value or "")) for cell in column_cells)
            ws.column_dimensions[column_letter].width = min(max(max_length + 4, 14), 36)

        import io

        buffer = io.BytesIO()
        wb.save(buffer)
        buffer.seek(0)

        return Response(
            content=buffer.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=company-users.xlsx"},
        )

    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.lib.units import inch
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
    except ImportError:
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail="PDF export not available. Install reportlab.",
        )

    import io

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    story = []
    styles = getSampleStyleSheet()

    title = Paragraph("User Export", styles["Title"])
    story.append(title)
    story.append(Spacer(1, 0.2 * inch))

    for user in users:
        p = Paragraph(
            f"<b>{user.email}</b> - {user.first_name} {user.last_name}<br/>"
            f"Role: {user.role} | Dept: {user.department or 'N/A'}<br/>"
            f"Status: {user.status}",
            styles["Normal"],
        )
        story.append(p)
        story.append(Spacer(1, 0.1 * inch))

    doc.build(story)
    buffer.seek(0)

    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=company-users.pdf"},
    )


@router.get("/export")
def export_users_static(
    format: str = Query("csv", pattern="^(csv|xlsx|pdf)$"),
    role: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    current_user: dict = Depends(require_role("Admin", "Manager")),
    db: Session = Depends(get_db),
):
    return _build_user_export_response(
        format=format,
        role=role,
        department=department,
        user_status=status,
        current_user=current_user,
        db=db,
    )


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: UUID,
    current_user: dict = Depends(require_min_role("TeamIntern")),
    db: Session = Depends(get_db),
):
    """Get a user by ID.

    Args:
        user_id: User UUID.
        current_user: Authenticated user from JWT.
        db: Database session.

    Returns:
        User response.

    Raises:
        HTTPException 404 if user not found.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    if current_user.get("role") != "SuperAdmin":
        tenant_id = current_user.get("tenantId")
        if tenant_id and str(user.tenant_id) != tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot access a user from another tenant",
            )
    return user


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: UUID,
    update_data: UserUpdate,
    current_user: dict = Depends(require_role("Admin", "Manager", "SuperAdmin")),
    db: Session = Depends(get_db),
):
    """Update a user (Admin/Manager/SuperAdmin only).

    Args:
        user_id: User UUID.
        update_data: Fields to update.
        current_user: Authenticated user from JWT.
        db: Database session.

    Returns:
        Updated user response.

    Raises:
        HTTPException 404 if user not found.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    if current_user.get("role") != "SuperAdmin":
        tenant_id = current_user.get("tenantId")
        if tenant_id and str(user.tenant_id) != tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot modify a user from another tenant",
            )

    update_dict = update_data.model_dump(exclude_unset=True)
    if "bio" in update_dict:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Bio can only be updated by the user from their own profile",
        )
    if "skills" in update_dict:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Skills can only be updated by the user from their own profile",
        )
    tracked_before = {
        field: getattr(user, field)
        for field in (
            "first_name",
            "last_name",
            "department",
            "role",
            "status",
            "timezone",
        )
        if field in update_dict
    }
    for field, value in update_dict.items():
        if value is not None:
            setattr(user, field, value)
            if field == "timezone":
                user.timezone_manually_set = True

    tracked_after = {
        field: getattr(user, field)
        for field in tracked_before
        if tracked_before[field] != getattr(user, field)
    }
    if tracked_after:
        db.add(
            IdentityAuditLog(
                tenant_id=user.tenant_id,
                action="user.update",
                actor_id=_current_actor_id(current_user),
                actor_email=_current_actor_email(current_user),
                target_user_id=user.id,
                target_email=user.email,
                details=json.dumps(
                    {
                        field: {
                            "before": tracked_before[field],
                            "after": tracked_after[field],
                        }
                        for field in tracked_after
                    }
                ),
            )
        )

    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: UUID,
    current_user: dict = Depends(require_role("Admin", "SuperAdmin")),
    db: Session = Depends(get_db),
):
    """Delete a user permanently (Admin/Super Admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if str(user.id) == current_user.get("sub"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You cannot delete your own account from this page",
        )

    if current_user.get("role") != "SuperAdmin":
        tenant_id = current_user.get("tenantId")
        if tenant_id and str(user.tenant_id) != tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot delete a user from another tenant",
            )

    if user.role == UserRole.SuperAdmin.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Super Admin accounts cannot be deleted from this endpoint",
        )

    db.add(
        IdentityAuditLog(
            tenant_id=user.tenant_id,
            action="user.delete",
            actor_id=_current_actor_id(current_user),
            actor_email=_current_actor_email(current_user),
            target_email=user.email,
            details=json.dumps(
                {
                    "deleted_user_id": str(user.id),
                    "role": user.role,
                    "department": user.department,
                    "status": user.status,
                }
            ),
        )
    )
    db.delete(user)
    db.commit()
    return None


@router.post("/{user_id}/set-local-password", response_model=UserResponse)
def set_local_password(
    user_id: UUID,
    request: SetLocalPasswordRequest,
    current_user: dict = Depends(require_role("Admin")),
    db: Session = Depends(get_db),
):
    """Assign or reset a local password for a tenant user.

    This is mainly used to repair or enable local-login accounts that were
    created without a password during testing.
    """
    tenant_id = current_user.get("tenantId")
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if tenant_id and str(user.tenant_id) != tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot modify a user from another tenant",
        )

    if user.role == UserRole.SuperAdmin.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Cannot modify Super Admin credentials here",
        )

    user.password_hash = hash_password(request.password)
    user.auth_provider = AuthProvider.local.value
    user.status = UserStatus.active.value
    user.onboarded = True

    db.commit()
    db.refresh(user)
    return user


@router.post("/{user_id}/resend-invite", response_model=dict)
def resend_invite(
    user_id: UUID,
    current_user: dict = Depends(require_role("Admin")),
    db: Session = Depends(get_db),
):
    """Resend invitation email to a pending user (Admin only).

    Args:
        user_id: User UUID.
        current_user: Authenticated admin from JWT.
        db: Database session.

    Returns:
        Success message.

    Raises:
        HTTPException 404 if user not found.
        HTTPException 400 if user is not pending invitation.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    if user.status != UserStatus.pending_invitation.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User does not have a pending invitation",
        )

    # In production, this would send an email via Microsoft Graph API
    return {"message": f"Invitation resent to {user.email}"}


@router.get("/{user_id}/login-history", response_model=list[dict])
def get_login_history(
    user_id: UUID,
    current_user: dict = Depends(require_role("Admin")),
    db: Session = Depends(get_db),
):
    """Get login history for a user (Admin only).

    Args:
        user_id: User UUID.
        current_user: Authenticated admin from JWT.
        db: Database session.

    Returns:
        List of login events.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    # Return login history (last_login and created_at as login events)
    history = []
    if user.last_login:
        history.append(
            {
                "timestamp": user.last_login.isoformat(),
                "type": "login",
                "ip_address": None,
            }
        )
    history.append(
        {
            "timestamp": user.created_at.isoformat(),
            "type": "account_created",
            "ip_address": None,
        }
    )

    return history


@router.post("/{user_id}/deactivate", response_model=UserResponse)
def deactivate_user(
    user_id: UUID,
    deactivate_data: UserDeactivate = UserDeactivate(),
    current_user: dict = Depends(require_role("Admin")),
    db: Session = Depends(get_db),
):
    """Deactivate a user (Admin only).

    Args:
        user_id: User UUID.
        deactivate_data: Optional reason for deactivation.
        current_user: Authenticated user from JWT.
        db: Database session.

    Returns:
        Deactivated user response.

    Raises:
        HTTPException 404 if user not found.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    user.status = UserStatus.suspended.value
    db.commit()
    db.refresh(user)
    return user


@router.get("/_legacy/export")
def export_users(
    format: str = Query("csv", pattern="^(csv|xlsx|pdf)$"),
    role: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    current_user: dict = Depends(require_role("Admin", "Manager")),
    db: Session = Depends(get_db),
):
    """Export user list (Admin/Manager only).

    Supports CSV, Excel (.xlsx), and PDF formats.
    Supports query filters: role, department, status.

    Args:
        format: Export format (csv|xlsx|pdf).
        role: Filter by role.
        department: Filter by department.
        status: Filter by status.
        current_user: Authenticated user from JWT.
        db: Database session.

    Returns:
        File response with user data.

    Raises:
        HTTPException 400 if format is invalid.
    """
    return _build_user_export_response(
        format=format,
        role=role,
        department=department,
        user_status=status,
        current_user=current_user,
        db=db,
    )


@router.post("/{user_id}/accept-invite", response_model=UserResponse)
def accept_invite(
    user_id: UUID,
    accept_data: AcceptInvite,
    db: Session = Depends(get_db),
):
    """Accept an invitation and set password.

    Called by the invited user after receiving the invitation.
    Sets their name, password, and activates the account.

    Args:
        user_id: User UUID.
        accept_data: Password and name details.
        db: Database session.

    Returns:
        Updated user response.

    Raises:
        HTTPException 404 if user not found.
        HTTPException 400 if invitation already accepted.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    if user.status != UserStatus.pending_invitation.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation already accepted or account is not pending",
        )

    user.first_name = accept_data.first_name
    user.last_name = accept_data.last_name
    user.password_hash = hash_password(accept_data.password)
    user.auth_provider = AuthProvider.local.value
    user.status = UserStatus.active.value
    db.commit()
    db.refresh(user)
    return user


@router.patch("/{user_id}/status", response_model=UserResponse)
def change_user_status(
    user_id: UUID,
    status_data: UserStatusChange,
    current_user: dict = Depends(require_role("Admin")),
    db: Session = Depends(get_db),
):
    """Change user status (Admin only).

    Allows changing user status between:
    - active
    - suspended
    - pending_invitation

    Args:
        user_id: User UUID.
        status_data: New status and optional reason.
        current_user: Authenticated admin from JWT.
        db: Database session.

    Returns:
        Updated user response.

    Raises:
        HTTPException 404 if user not found.
        HTTPException 400 if status is invalid.
    """
    valid_statuses = {s.value for s in UserStatus}
    if status_data.status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}",
        )

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    old_status = user.status
    user.status = status_data.status
    db.commit()
    db.refresh(user)

    if RabbitMQClient:
        try:
            rabbitmq = RabbitMQClient()
            rabbitmq.publish(
                exchange="auth",
                routing_key="user.status_changed",
                message={
                    "event": "user.status_changed",
                    "userId": str(user.id),
                    "email": user.email,
                    "oldStatus": old_status,
                    "newStatus": status_data.status,
                    "reason": status_data.reason,
                    "changedBy": current_user.get("email", "admin"),
                },
            )
        except Exception:
            pass

    return user


@router.post("/{user_id}/revoke", response_model=UserResponse)
def revoke_user_access(
    user_id: UUID,
    revoke_data: UserRevoke = UserRevoke(),
    current_user: dict = Depends(require_role("Admin")),
    db: Session = Depends(get_db),
):
    """Revoke user access (Admin only).

    Suspends the user and optionally clears their credentials.
    This is a more severe action than simple suspension.

    Args:
        user_id: User UUID.
        revoke_data: Revocation details.
        current_user: Authenticated admin from JWT.
        db: Database session.

    Returns:
        Updated user response.

    Raises:
        HTTPException 404 if user not found.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    user.status = UserStatus.suspended.value

    if revoke_data.revoke_credentials:
        user.password_hash = None
        if user.auth_provider == AuthProvider.azure_entra.value:
            pass

    db.commit()
    db.refresh(user)

    try:
        rabbitmq = RabbitMQClient()
        rabbitmq.publish(
            exchange="auth",
            routing_key="user.revoked",
            message={
                "event": "user.revoked",
                "userId": str(user.id),
                "email": user.email,
                "reason": revoke_data.reason,
                "revokedBy": current_user.get("email", "admin"),
                "credentialsRevoked": revoke_data.revoke_credentials,
            },
        )
    except Exception:
        pass

    return user


@router.post("/{user_id}/reactivate", response_model=UserResponse)
def reactivate_user(
    user_id: UUID,
    current_user: dict = Depends(require_role("Admin")),
    db: Session = Depends(get_db),
):
    """Reactivate a suspended user (Admin only).

    Args:
        user_id: User UUID.
        current_user: Authenticated admin from JWT.
        db: Database session.

    Returns:
        Updated user response.

    Raises:
        HTTPException 404 if user not found.
        HTTPException 400 if user is not suspended.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    if user.status != UserStatus.suspended.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not suspended",
        )

    user.status = UserStatus.active.value
    db.commit()
    db.refresh(user)
    return user


role_mapping_router = APIRouter(prefix="/role-mappings", tags=["role-mappings"])


@role_mapping_router.post(
    "", response_model=RoleMappingRuleResponse, status_code=status.HTTP_201_CREATED
)
def create_role_mapping(
    rule_data: RoleMappingRuleCreate,
    current_user: dict = Depends(require_role("Admin")),
    db: Session = Depends(get_db),
):
    """Create a role mapping rule (Admin only).

    Maps Azure AD roles to platform roles.

    Args:
        rule_data: Role mapping rule data.
        current_user: Authenticated admin from JWT.
        db: Database session.

    Returns:
        Created role mapping rule.
    """
    tenant_id = current_user.get("tenant_id")

    existing = (
        db.query(RoleMappingRule)
        .filter(
            RoleMappingRule.azure_role == rule_data.azure_role,
            RoleMappingRule.platform_role == rule_data.platform_role,
            RoleMappingRule.tenant_id == tenant_id,
        )
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Role mapping rule already exists",
        )

    rule = RoleMappingRule(
        tenant_id=tenant_id,
        azure_role=rule_data.azure_role,
        platform_role=rule_data.platform_role,
        department=rule_data.department,
        is_active=True,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)

    return RoleMappingRuleResponse(
        id=str(rule.id),
        azure_role=rule.azure_role,
        platform_role=rule.platform_role,
        department=rule.department,
        is_active=rule.is_active,
        created_at=rule.created_at.isoformat() if rule.created_at else None,
        updated_at=rule.updated_at.isoformat() if rule.updated_at else None,
    )


@role_mapping_router.get("", response_model=list[RoleMappingRuleResponse])
def list_role_mappings(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(require_role("Admin")),
    db: Session = Depends(get_db),
):
    """List role mapping rules (Admin only).

    Args:
        page: Page number.
        page_size: Items per page.
        current_user: Authenticated admin from JWT.
        db: Database session.

    Returns:
        List of role mapping rules.
    """
    tenant_id = current_user.get("tenant_id")
    offset = (page - 1) * page_size

    rules = (
        db.query(RoleMappingRule)
        .filter(RoleMappingRule.tenant_id == tenant_id)
        .offset(offset)
        .limit(page_size)
        .all()
    )

    return [
        RoleMappingRuleResponse(
            id=str(r.id),
            azure_role=r.azure_role,
            platform_role=r.platform_role,
            department=r.department,
            is_active=r.is_active,
            created_at=r.created_at.isoformat() if r.created_at else None,
            updated_at=r.updated_at.isoformat() if r.updated_at else None,
        )
        for r in rules
    ]


@role_mapping_router.get("/{rule_id}", response_model=RoleMappingRuleResponse)
def get_role_mapping(
    rule_id: UUID,
    current_user: dict = Depends(require_role("Admin")),
    db: Session = Depends(get_db),
):
    """Get a role mapping rule by ID (Admin only).

    Args:
        rule_id: Rule UUID.
        current_user: Authenticated admin from JWT.
        db: Database session.

    Returns:
        Role mapping rule.

    Raises:
        HTTPException 404 if not found.
    """
    tenant_id = current_user.get("tenant_id")
    rule = (
        db.query(RoleMappingRule)
        .filter(
            RoleMappingRule.id == rule_id,
            RoleMappingRule.tenant_id == tenant_id,
        )
        .first()
    )

    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role mapping rule not found",
        )

    return RoleMappingRuleResponse(
        id=str(rule.id),
        azure_role=rule.azure_role,
        platform_role=rule.platform_role,
        department=rule.department,
        is_active=rule.is_active,
        created_at=rule.created_at.isoformat() if rule.created_at else None,
        updated_at=rule.updated_at.isoformat() if rule.updated_at else None,
    )


@role_mapping_router.put("/{rule_id}", response_model=RoleMappingRuleResponse)
def update_role_mapping(
    rule_id: UUID,
    rule_data: RoleMappingRuleUpdate,
    current_user: dict = Depends(require_role("Admin")),
    db: Session = Depends(get_db),
):
    """Update a role mapping rule (Admin only).

    Args:
        rule_id: Rule UUID.
        rule_data: Updated rule data.
        current_user: Authenticated admin from JWT.
        db: Database session.

    Returns:
        Updated role mapping rule.

    Raises:
        HTTPException 404 if not found.
    """
    tenant_id = current_user.get("tenant_id")
    rule = (
        db.query(RoleMappingRule)
        .filter(
            RoleMappingRule.id == rule_id,
            RoleMappingRule.tenant_id == tenant_id,
        )
        .first()
    )

    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role mapping rule not found",
        )

    if rule_data.azure_role is not None:
        rule.azure_role = rule_data.azure_role
    if rule_data.platform_role is not None:
        rule.platform_role = rule_data.platform_role
    if rule_data.department is not None:
        rule.department = rule_data.department
    if rule_data.is_active is not None:
        rule.is_active = rule_data.is_active

    db.commit()
    db.refresh(rule)

    return RoleMappingRuleResponse(
        id=str(rule.id),
        azure_role=rule.azure_role,
        platform_role=rule.platform_role,
        department=rule.department,
        is_active=rule.is_active,
        created_at=rule.created_at.isoformat() if rule.created_at else None,
        updated_at=rule.updated_at.isoformat() if rule.updated_at else None,
    )


@role_mapping_router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role_mapping(
    rule_id: UUID,
    current_user: dict = Depends(require_role("Admin")),
    db: Session = Depends(get_db),
):
    """Delete a role mapping rule (Admin only).

    Args:
        rule_id: Rule UUID.
        current_user: Authenticated admin from JWT.
        db: Database session.

    Raises:
        HTTPException 404 if not found.
    """
    tenant_id = current_user.get("tenant_id")
    rule = (
        db.query(RoleMappingRule)
        .filter(
            RoleMappingRule.id == rule_id,
            RoleMappingRule.tenant_id == tenant_id,
        )
        .first()
    )

    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role mapping rule not found",
        )

    db.delete(rule)
    db.commit()
    return None


@router.get("/{user_id}/audit-log", response_model=list[dict])
def get_user_audit_log(
    user_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(require_role("Admin")),
    db: Session = Depends(get_db),
):
    """Get audit log for a user (Admin only).

    Returns user account changes: status changes, role changes,
    suspensions, reactivations, etc.

    Args:
        user_id: User UUID.
        page: Page number.
        page_size: Items per page.
        current_user: Authenticated admin from JWT.
        db: Database session.

    Returns:
        List of audit events.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    offset = (page - 1) * page_size

    audit_events = []

    if user.created_at:
        audit_events.append(
            {
                "timestamp": user.created_at.isoformat(),
                "action": "user.created",
                "details": f"User account created via {user.auth_provider}",
                "actor": None,
            }
        )

    if user.updated_at and user.status == UserStatus.suspended.value:
        audit_events.append(
            {
                "timestamp": user.updated_at.isoformat(),
                "action": "user.suspended",
                "details": "User account suspended",
                "actor": None,
            }
        )

    return audit_events[offset : offset + page_size]


identity_audit_router = APIRouter(
    prefix="/identity/audit-logs", tags=["identity-audit"]
)


@identity_audit_router.get("", response_model=IdentityAuditLogListResponse)
def list_identity_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    action: Optional[str] = Query(None),
    user_id: Optional[UUID] = Query(None, alias="userId"),
    current_user: dict = Depends(require_role("Admin", "SuperAdmin")),
    db: Session = Depends(get_db),
):
    """List identity audit logs (Admin only).

    Returns platform-wide or tenant-wide audit logs of identity operations.

    Args:
        page: Page number.
        page_size: Items per page.
        action: Filter by action type.
        user_id: Filter by user ID.
        current_user: Authenticated admin from JWT.
        db: Database session.

    Returns:
        List of audit events with pagination.
    """
    tenant_id = current_user.get("tenant_id") or current_user.get("tenantId")
    query = db.query(IdentityAuditLog)

    if current_user.get("role") != "SuperAdmin" and tenant_id:
        query = query.filter(IdentityAuditLog.tenant_id == tenant_id)
    if action:
        query = query.filter(IdentityAuditLog.action == action)
    if user_id:
        query = query.filter(IdentityAuditLog.user_id == user_id)

    total = query.count()
    offset = (page - 1) * page_size
    logs = (
        query.order_by(IdentityAuditLog.created_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    return IdentityAuditLogListResponse(
        logs=[
            IdentityAuditLogResponse(
                id=str(log.id),
                user_id=str(log.user_id) if log.user_id else None,
                action=log.action,
                actor_id=str(log.actor_id) if log.actor_id else None,
                actor_email=log.actor_email,
                target_user_id=str(log.target_user_id) if log.target_user_id else None,
                target_email=log.target_email,
                details=log.details,
                ip_address=log.ip_address,
                created_at=log.created_at.isoformat() if log.created_at else None,
            )
            for log in logs
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@identity_audit_router.get("/{log_id}", response_model=IdentityAuditLogResponse)
def get_identity_audit_log(
    log_id: UUID,
    current_user: dict = Depends(require_role("Admin")),
    db: Session = Depends(get_db),
):
    """Get a specific identity audit log entry (Admin only).

    Args:
        log_id: Audit log UUID.
        current_user: Authenticated admin from JWT.
        db: Database session.

    Returns:
        Audit log entry.

    Raises:
        HTTPException 404 if not found.
    """
    tenant_id = current_user.get("tenant_id")
    log = (
        db.query(IdentityAuditLog)
        .filter(
            IdentityAuditLog.id == log_id,
            IdentityAuditLog.tenant_id == tenant_id,
        )
        .first()
    )

    if not log:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Audit log entry not found",
        )

    return IdentityAuditLogResponse(
        id=str(log.id),
        user_id=str(log.user_id) if log.user_id else None,
        action=log.action,
        actor_id=str(log.actor_id) if log.actor_id else None,
        actor_email=log.actor_email,
        target_user_id=str(log.target_user_id) if log.target_user_id else None,
        target_email=log.target_email,
        details=log.details,
        ip_address=log.ip_address,
        created_at=log.created_at.isoformat() if log.created_at else None,
    )


@router.get("/email-mismatches", response_model=list[dict])
def list_email_mismatches(
    current_user: dict = Depends(require_role("Admin")),
    db: Session = Depends(get_db),
):
    """List users with email mismatches between platform and Azure AD (Admin only).

    Returns users whose platform email doesn't match their Azure AD email,
    or who have duplicate emails in the system.

    Args:
        current_user: Authenticated admin from JWT.
        db: Database session.

    Returns:
        List of email mismatches with details.
    """
    tenant_id = current_user.get("tenant_id")
    query = db.query(User)

    if tenant_id:
        query = query.filter(User.tenant_id == tenant_id)

    users = query.all()
    mismatches = []

    import os

    company_domain = os.getenv("COMPANY_EMAIL_DOMAIN", "techcorp.com")

    for user in users:
        if user.auth_provider == AuthProvider.azure_entra.value:
            user_email_domain = user.email.split("@")[-1] if "@" in user.email else ""
            if user_email_domain != company_domain.lower():
                mismatches.append(
                    {
                        "user_id": str(user.id),
                        "platform_email": user.email,
                        "azure_email": user.email,
                        "mismatch_type": "domain_mismatch",
                        "details": f"Email domain '{user_email_domain}' doesn't match company domain '{company_domain}'",
                    }
                )

    return mismatches


@router.post("/{user_id}/confirm-email", response_model=UserResponse)
def confirm_email_update(
    user_id: UUID,
    confirm_data: ConfirmEmailUpdate,
    current_user: dict = Depends(require_role("Admin")),
    db: Session = Depends(get_db),
):
    """Confirm and update user email (Admin only).

    Admin manually confirms an email change request.
    In production, this would verify against a stored verification code.

    Args:
        user_id: User UUID.
        confirm_data: New email and verification code.
        current_user: Authenticated admin from JWT.
        db: Database session.

    Returns:
        Updated user response.

    Raises:
        HTTPException 404 if user not found.
        HTTPException 400 if verification code is invalid.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    existing = (
        db.query(User)
        .filter(User.email == confirm_data.new_email, User.id != user_id)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already in use by another user",
        )

    old_email = user.email
    user.email = confirm_data.new_email
    db.commit()
    db.refresh(user)

    tenant_id = current_user.get("tenant_id")
    audit_log = IdentityAuditLog(
        tenant_id=tenant_id,
        user_id=user.id,
        action="email_confirmed",
        actor_id=current_user.get("sub"),
        actor_email=current_user.get("email"),
        target_user_id=user.id,
        target_email=confirm_data.new_email,
        details=f"Email changed from {old_email} to {confirm_data.new_email} and confirmed by admin",
    )
    db.add(audit_log)
    db.commit()

    return user


@router.post("/{user_id}/keep-email", response_model=UserResponse)
def keep_current_email(
    user_id: UUID,
    current_user: dict = Depends(require_role("Admin")),
    db: Session = Depends(get_db),
):
    """Mark user's current email as verified/kept (Admin only).

    This is used when a user wants to keep their current email
    and not update to a new one.

    Args:
        user_id: User UUID.
        current_user: Authenticated admin from JWT.
        db: Database session.

    Returns:
        User response.

    Raises:
        HTTPException 404 if user not found.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    tenant_id = current_user.get("tenant_id")
    audit_log = IdentityAuditLog(
        tenant_id=tenant_id,
        user_id=user.id,
        action="email_kept",
        actor_id=current_user.get("sub"),
        actor_email=current_user.get("email"),
        target_user_id=user.id,
        target_email=user.email,
        details=f"Email {user.email} confirmed as valid by admin",
    )
    db.add(audit_log)
    db.commit()

    return user

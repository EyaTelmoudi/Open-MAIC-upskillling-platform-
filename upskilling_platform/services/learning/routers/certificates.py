"""Certificate routes for secure issuance, verification, and revocation."""

import hashlib
import html
import json
import os
import secrets
import time
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jws
from sqlalchemy.orm import Session

from common.auth import decode_token
from common.database import get_db
from common.models import (
    Certificate,
    CertificateVerificationAudit,
    Course,
    Enrollment,
    User,
)
from services.learning.schemas.certificate import (
    CertificateListResponse,
    CertificateResponse,
    CertificateRevocationRequest,
    CertificateVerifyResponse,
)

router = APIRouter(prefix="/certificates", tags=["certificates"])
public_router = APIRouter(tags=["certificates"])
admin_router = APIRouter(prefix="/admin/certificates", tags=["certificates"])

security = HTTPBearer()

VERIFY_RATE_LIMIT_MAX_REQUESTS = 30
VERIFY_RATE_LIMIT_WINDOW_SECONDS = 60
_verification_rate_window: dict[str, list[float]] = {}


def get_current_user_from_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Extract and validate the current user from JWT token."""
    token = credentials.credentials
    payload = decode_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


def _generate_certificate_number() -> str:
    """Generate a human-readable certificate number."""
    year = datetime.now(timezone.utc).year
    random_str = "".join(
        secrets.choice("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789") for _ in range(8)
    )
    return f"CERT-{year}-{random_str}"


def _normalize_pem(pem_value: str) -> str:
    """Normalize PEM values loaded from environment variables."""
    return pem_value.replace("\\n", "\n").strip()


def _get_private_key() -> str:
    private_key = os.getenv("CERT_PRIVATE_KEY", "").strip()
    if not private_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Certificate private key is not configured",
        )
    return _normalize_pem(private_key)


def _get_public_key() -> str:
    public_key = os.getenv("CERT_PUBLIC_KEY", "").strip()
    if not public_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Certificate public key is not configured",
        )
    return _normalize_pem(public_key)


def _canonicalize_payload(payload: dict) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def _build_certificate_payload(
    certificate: Certificate,
    completion_date: datetime | None = None,
) -> dict:
    """Build the canonical signed payload from DB-backed fields."""
    effective_completion_date = (
        completion_date
        or getattr(certificate.enrollment, "completed_at", None)
        or certificate.issued_at
    )

    return {
        "certificate_id": str(certificate.id),
        "full_name": certificate.learner_name,
        "course_name": certificate.course_title,
        "completion_date": effective_completion_date.isoformat()
        if effective_completion_date
        else None,
        "grade": certificate.grade,
        "score": certificate.score,
        "issued_at": certificate.issued_at.isoformat() if certificate.issued_at else None,
        "expires_at": certificate.expires_at.isoformat()
        if certificate.expires_at
        else None,
        "issuing_org": certificate.issuing_org,
        "course_version": certificate.course_version,
        "certificate_number": certificate.certificate_number,
    }


def _sign_certificate_payload(payload: dict) -> tuple[str, str]:
    """Return content hash and RS256 signature for the canonical payload."""
    canonical_payload = _canonicalize_payload(payload)
    content_hash = hashlib.sha256(canonical_payload.encode("utf-8")).hexdigest()
    signature = jws.sign(
        canonical_payload.encode("utf-8"),
        _get_private_key(),
        algorithm="RS256",
    )
    return content_hash, signature


def _verify_certificate_signature(certificate: Certificate) -> tuple[bool, str]:
    """Verify stored signature against the canonical payload rebuilt from DB fields."""
    if certificate.signature_algorithm != "RS256":
        return False, "Unsupported certificate signature algorithm"

    payload = _build_certificate_payload(certificate)
    canonical_payload = _canonicalize_payload(payload)
    expected_hash = hashlib.sha256(canonical_payload.encode("utf-8")).hexdigest()

    if certificate.content_hash != expected_hash:
        return False, "Certificate payload hash mismatch"

    try:
        verified_payload = jws.verify(
            certificate.signature,
            _get_public_key(),
            algorithms=["RS256"],
        )
    except Exception:
        return False, "Signature mismatch"

    if isinstance(verified_payload, bytes):
        verified_payload = verified_payload.decode("utf-8")

    if verified_payload != canonical_payload:
        return False, "Signed payload mismatch"

    return True, "Certificate is valid"


def _get_frontend_base_url() -> str:
    return (
        os.getenv("NEXT_PUBLIC_FRONTEND_URL")
        or os.getenv("FRONTEND_URL")
        or "http://localhost:3000"
    ).rstrip("/")


def _get_verification_url(certificate_id: UUID | str) -> str:
    return f"{_get_frontend_base_url()}/verify/{certificate_id}"


def _get_request_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _enforce_verification_rate_limit(request: Request) -> None:
    client_ip = _get_request_ip(request)
    now_ts = time.time()
    window_start = now_ts - VERIFY_RATE_LIMIT_WINDOW_SECONDS
    active_requests = [
        timestamp
        for timestamp in _verification_rate_window.get(client_ip, [])
        if timestamp >= window_start
    ]
    if len(active_requests) >= VERIFY_RATE_LIMIT_MAX_REQUESTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many verification requests. Please try again later.",
        )

    active_requests.append(now_ts)
    _verification_rate_window[client_ip] = active_requests


def _log_verification_attempt(
    db: Session,
    certificate_id_raw: str,
    certificate_id: UUID | None,
    request: Request,
    result: str,
    message: str,
) -> None:
    audit = CertificateVerificationAudit(
        certificate_id=certificate_id,
        certificate_id_raw=certificate_id_raw,
        result=result,
        ip_address=_get_request_ip(request),
        user_agent=request.headers.get("user-agent"),
        message=message,
    )
    db.add(audit)
    db.commit()


def _build_verification_response(
    certificate: Certificate | None,
    status_value: str,
    message: str,
    *,
    reason: str | None = None,
) -> CertificateVerifyResponse:
    if certificate is None:
        return CertificateVerifyResponse(status=status_value, message=message, reason=reason)

    completion_date = (
        getattr(certificate.enrollment, "completed_at", None) or certificate.issued_at
    )

    return CertificateVerifyResponse(
        status=status_value,
        message=message,
        certificate_id=certificate.id,
        full_name=certificate.learner_name,
        course_name=certificate.course_title,
        completion_date=completion_date,
        grade=certificate.grade,
        score=certificate.score,
        issued_at=certificate.issued_at,
        expires_at=certificate.expires_at,
        reason=reason,
        certificate=CertificateResponse.model_validate(certificate),
    )


def _render_verification_html(response: CertificateVerifyResponse) -> str:
    state_styles = {
        "valid": ("Valid Certificate", "#0f766e", "#ccfbf1", "✅"),
        "revoked": ("Revoked Certificate", "#b45309", "#fef3c7", "⚠️"),
        "expired": ("Expired Certificate", "#1d4ed8", "#dbeafe", "⏳"),
        "invalid": ("Invalid Certificate", "#b91c1c", "#fee2e2", "❌"),
    }
    heading, accent, surface, icon = state_styles.get(
        response.status,
        ("Verification Result", "#334155", "#e2e8f0", "ℹ️"),
    )

    details = ""
    if response.full_name or response.course_name:
        details = f"""
        <div class="details">
          <div><strong>Certificate ID</strong><span>{html.escape(str(response.certificate_id or ""))}</span></div>
          <div><strong>Learner</strong><span>{html.escape(response.full_name or "N/A")}</span></div>
          <div><strong>Course</strong><span>{html.escape(response.course_name or "N/A")}</span></div>
          <div><strong>Completion</strong><span>{html.escape(response.completion_date.isoformat() if response.completion_date else "N/A")}</span></div>
          <div><strong>Issued</strong><span>{html.escape(response.issued_at.isoformat() if response.issued_at else "N/A")}</span></div>
          <div><strong>Expires</strong><span>{html.escape(response.expires_at.isoformat() if response.expires_at else "No expiry")}</span></div>
        </div>
        """

    reason_html = ""
    if response.reason:
        reason_html = f"<p class='reason'><strong>Reason:</strong> {html.escape(response.reason)}</p>"

    return f"""<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{html.escape(heading)}</title>
    <style>
      body {{
        margin: 0;
        font-family: Arial, sans-serif;
        background: linear-gradient(180deg, #f8fafc, #e2e8f0);
        color: #0f172a;
      }}
      .wrap {{
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }}
      .card {{
        width: min(760px, 100%);
        background: white;
        border-radius: 24px;
        padding: 32px;
        box-shadow: 0 25px 60px rgba(15, 23, 42, 0.15);
        border: 1px solid rgba(148, 163, 184, 0.25);
      }}
      .pill {{
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: {surface};
        color: {accent};
        border-radius: 999px;
        padding: 8px 14px;
        font-weight: 700;
        margin-bottom: 18px;
      }}
      h1 {{
        margin: 0 0 8px;
        font-size: 32px;
      }}
      p {{
        margin: 0;
        line-height: 1.6;
      }}
      .lead {{
        color: #475569;
        margin-bottom: 24px;
      }}
      .details {{
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 14px;
        margin-top: 24px;
      }}
      .details div {{
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 16px;
        padding: 14px;
      }}
      .details strong {{
        display: block;
        margin-bottom: 6px;
        color: #475569;
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }}
      .reason {{
        margin-top: 20px;
        color: #7c2d12;
      }}
    </style>
  </head>
  <body>
    <div class="wrap">
      <section class="card">
        <div class="pill">{icon}<span>{html.escape(response.status.upper())}</span></div>
        <h1>{html.escape(heading)}</h1>
        <p class="lead">{html.escape(response.message)}</p>
        {reason_html}
        {details}
      </section>
    </div>
  </body>
</html>"""


def _to_public_response(
    response: CertificateVerifyResponse,
    request: Request,
) -> JSONResponse | HTMLResponse:
    wants_json = request.query_params.get("format") == "json" or "application/json" in (
        request.headers.get("accept", "")
    )
    if wants_json:
        return JSONResponse(content=response.model_dump(mode="json"))
    return HTMLResponse(content=_render_verification_html(response))


def _ensure_certificate_access(certificate: Certificate, current_user: dict) -> None:
    role = current_user.get("role")
    current_user_id = current_user.get("sub") or current_user.get("id")
    tenant_id = current_user.get("tenantId")

    if role == "SuperAdmin":
        return

    if role in {"Admin", "Manager", "LearningExpert", "TeamManager"}:
        course_tenant_id = str(certificate.course.tenant_id) if certificate.course and certificate.course.tenant_id else None
        if tenant_id and course_tenant_id == str(tenant_id):
            return

    if current_user_id and str(certificate.user_id) == str(current_user_id):
        return

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You do not have access to this certificate",
    )


def _rehydrate_certificate_security(
    certificate: Certificate,
    enrollment: Enrollment,
    user: User,
    course: Course,
) -> None:
    """Backfill legacy certificate rows into the secure signing format."""
    certificate.learner_name = certificate.learner_name or f"{user.first_name} {user.last_name}"
    certificate.course_title = certificate.course_title or course.title
    certificate.issuing_org = certificate.issuing_org or os.getenv(
        "PLATFORM_NAME", "SkillForge Learning Platform"
    )
    certificate.status = "revoked" if certificate.is_revoked else (certificate.status or "active")
    certificate.signature_algorithm = "RS256"

    payload = _build_certificate_payload(certificate, completion_date=enrollment.completed_at)
    content_hash, signature = _sign_certificate_payload(payload)
    certificate.payload_json = payload
    certificate.content_hash = content_hash
    certificate.signature = signature


@router.get("/", response_model=CertificateListResponse)
def list_certificates(
    user_id: UUID | None = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    """List certificates for the current user or a specific user."""
    user_id_from_token = current_user.get("sub") or current_user.get("id")
    role = current_user.get("role")

    query = db.query(Certificate)
    if user_id:
        if role not in {"SuperAdmin", "Admin", "Manager", "LearningExpert", "TeamManager"} and str(user_id) != str(user_id_from_token):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to these certificates",
            )
        query = query.filter(Certificate.user_id == user_id)
    else:
        query = query.filter(Certificate.user_id == user_id_from_token)

    certificates = query.order_by(Certificate.issued_at.desc()).all()
    return CertificateListResponse(
        certificates=[CertificateResponse.model_validate(c) for c in certificates],
        total=len(certificates),
    )


@router.get("/{certificate_id}", response_model=CertificateResponse)
def get_certificate(
    certificate_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    """Get certificate by ID."""
    certificate = db.query(Certificate).filter(Certificate.id == certificate_id).first()
    if not certificate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate not found",
        )

    _ensure_certificate_access(certificate, current_user)
    return CertificateResponse.model_validate(certificate)


@router.get("/{certificate_id}/download")
def download_certificate_pdf(
    certificate_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    """Return a presigned URL for an already stored PDF, if one exists."""
    certificate = db.query(Certificate).filter(Certificate.id == certificate_id).first()
    if not certificate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate not found",
        )

    _ensure_certificate_access(certificate, current_user)

    if not certificate.pdf_url:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PDF not generated yet",
        )

    from common.storage import get_presigned_url

    return {"url": get_presigned_url(certificate.pdf_url, expires=3600)}


@router.get("/{certificate_id}/qr")
def get_certificate_qr(
    certificate_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    """Get verification metadata for certificate QR generation."""
    certificate = db.query(Certificate).filter(Certificate.id == certificate_id).first()
    if not certificate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate not found",
        )

    _ensure_certificate_access(certificate, current_user)
    verify_url = _get_verification_url(certificate.id)
    return {
        "qr_data": verify_url,
        "certificate_id": str(certificate.id),
        "certificate_number": certificate.certificate_number,
    }


def _verify_certificate_core(
    certificate_id_raw: str,
    request: Request,
    db: Session,
) -> JSONResponse | HTMLResponse:
    try:
        _enforce_verification_rate_limit(request)
    except HTTPException as exc:
        _log_verification_attempt(
            db,
            certificate_id_raw,
            None,
            request,
            "rate_limited",
            exc.detail,
        )
        response = CertificateVerifyResponse(status="invalid", message=exc.detail)
        wants_json = request.query_params.get("format") == "json" or "application/json" in (
            request.headers.get("accept", "")
        )
        if wants_json:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content=response.model_dump(mode="json"),
            )
        return HTMLResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            content=_render_verification_html(response),
        )

    try:
        certificate_uuid = UUID(certificate_id_raw)
    except ValueError:
        _log_verification_attempt(
            db,
            certificate_id_raw,
            None,
            request,
            "invalid",
            "Certificate ID is not a valid UUID",
        )
        response = CertificateVerifyResponse(
            status="invalid",
            message="Certificate not found",
        )
        return _to_public_response(response, request)

    certificate = (
        db.query(Certificate)
        .filter(Certificate.id == certificate_uuid)
        .first()
    )
    if not certificate:
        _log_verification_attempt(
            db,
            certificate_id_raw,
            certificate_uuid,
            request,
            "invalid",
            "Certificate not found",
        )
        response = CertificateVerifyResponse(
            status="invalid",
            message="Certificate not found",
        )
        return _to_public_response(response, request)

    if not certificate.payload_json or certificate.signature_algorithm != "RS256":
        _rehydrate_certificate_security(
            certificate,
            certificate.enrollment,
            certificate.user,
            certificate.course,
        )
        db.commit()
        db.refresh(certificate)

    if certificate.status == "revoked" or certificate.is_revoked:
        response = _build_verification_response(
            certificate,
            "revoked",
            "Certificate has been revoked",
            reason=certificate.revoked_reason,
        )
        _log_verification_attempt(
            db,
            certificate_id_raw,
            certificate.id,
            request,
            "revoked",
            certificate.revoked_reason or "Certificate revoked",
        )
        return _to_public_response(response, request)

    if certificate.expires_at and certificate.expires_at < datetime.now(timezone.utc).replace(tzinfo=None):
        response = _build_verification_response(
            certificate,
            "expired",
            "Certificate has expired",
        )
        _log_verification_attempt(
            db,
            certificate_id_raw,
            certificate.id,
            request,
            "expired",
            "Certificate expired",
        )
        return _to_public_response(response, request)

    is_valid, verification_message = _verify_certificate_signature(certificate)
    if not is_valid:
        response = CertificateVerifyResponse(
            status="invalid",
            message=verification_message,
        )
        _log_verification_attempt(
            db,
            certificate_id_raw,
            certificate.id,
            request,
            "invalid",
            verification_message,
        )
        return _to_public_response(response, request)

    response = _build_verification_response(
        certificate,
        "valid",
        "Certificate is valid and has passed signature verification",
    )
    _log_verification_attempt(
        db,
        certificate_id_raw,
        certificate.id,
        request,
        "valid",
        "Certificate verified successfully",
    )
    return _to_public_response(response, request)


@router.get("/verify/{certificate_id}")
def verify_certificate_legacy_path(
    certificate_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Backward-compatible verification API under /certificates/verify/{id}."""
    return _verify_certificate_core(certificate_id, request, db)


@public_router.get("/verify/{certificate_id}")
def verify_certificate_public(
    certificate_id: str,
    request: Request,
    db: Session = Depends(get_db),
):
    """Public verification endpoint with JSON or HTML response."""
    return _verify_certificate_core(certificate_id, request, db)


@admin_router.patch("/{certificate_id}/revoke", response_model=CertificateResponse)
def revoke_certificate(
    certificate_id: UUID,
    payload: CertificateRevocationRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_from_token),
):
    """Admin-only certificate revocation endpoint."""
    if current_user.get("role") not in {"Admin", "SuperAdmin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Admin or SuperAdmin can revoke certificates",
        )

    certificate = db.query(Certificate).filter(Certificate.id == certificate_id).first()
    if not certificate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Certificate not found",
        )

    if current_user.get("role") != "SuperAdmin":
        tenant_id = current_user.get("tenantId")
        certificate_tenant_id = (
            str(certificate.course.tenant_id) if certificate.course and certificate.course.tenant_id else None
        )
        if tenant_id and certificate_tenant_id != str(tenant_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this certificate",
            )

    certificate.status = "revoked"
    certificate.is_revoked = True
    certificate.revoked_at = datetime.utcnow()
    certificate.revoked_reason = payload.reason
    db.commit()
    db.refresh(certificate)
    return CertificateResponse.model_validate(certificate)


def generate_certificate_for_enrollment(
    enrollment_id: UUID,
    db: Session,
) -> Certificate:
    """Generate or upgrade a secure certificate for a completed enrollment."""
    import logging
    from common.messaging import RabbitMQClient

    logger = logging.getLogger(__name__)
    enrollment = db.query(Enrollment).filter(Enrollment.id == enrollment_id).first()
    if not enrollment:
        raise ValueError("Enrollment not found")
    if enrollment.status != "completed":
        raise ValueError("Enrollment not completed")

    user = db.query(User).filter(User.id == enrollment.user_id).first()
    course = db.query(Course).filter(Course.id == enrollment.course_id).first()
    if not user or not course:
        raise ValueError("User or course not found")

    existing_cert = (
        db.query(Certificate)
        .filter(Certificate.enrollment_id == enrollment_id)
        .first()
    )
    if existing_cert:
        _rehydrate_certificate_security(existing_cert, enrollment, user, course)
        db.commit()
        db.refresh(existing_cert)
        return existing_cert

    issuing_org = os.getenv("PLATFORM_NAME", "SkillForge Learning Platform")

    certificate = Certificate(
        certificate_number=_generate_certificate_number(),
        user_id=enrollment.user_id,
        course_id=enrollment.course_id,
        enrollment_id=enrollment.id,
        learner_name=f"{user.first_name} {user.last_name}",
        course_title=course.title,
        issuing_org=issuing_org,
        status="active",
        is_revoked=False,
        content_hash="",
        signature="",
        signature_algorithm="RS256",
    )

    db.add(certificate)
    db.flush()

    payload = _build_certificate_payload(certificate, completion_date=enrollment.completed_at)
    content_hash, signature = _sign_certificate_payload(payload)
    certificate.payload_json = payload
    certificate.content_hash = content_hash
    certificate.signature = signature

    db.commit()
    db.refresh(certificate)

    mq = RabbitMQClient()
    mq.publish(
        "learning.exchange",
        "certificate.generated",
        {
            "event": "certificate.generated",
            "userId": str(user.id),
            "courseId": str(course.id),
            "certificateId": str(certificate.id),
            "certificateNumber": certificate.certificate_number,
            "timestamp": datetime.utcnow().isoformat(),
        },
    )

    logger.info(
        "Generated secure certificate %s for enrollment %s",
        certificate.id,
        enrollment_id,
    )
    return certificate

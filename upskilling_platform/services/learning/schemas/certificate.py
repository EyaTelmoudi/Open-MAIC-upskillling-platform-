"""Pydantic schemas for certificates."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class CertificateResponse(BaseModel):
    """Schema for certificate response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    certificate_number: str
    user_id: UUID
    course_id: UUID
    enrollment_id: UUID
    learner_name: str
    course_title: str
    course_version: Optional[str] = None
    issuing_org: Optional[str] = None
    grade: Optional[str] = None
    score: Optional[float] = None
    issued_at: datetime
    expires_at: Optional[datetime] = None
    content_hash: str
    signature: str
    signature_algorithm: str = "RS256"
    pdf_url: Optional[str] = None
    status: str = "active"
    is_revoked: bool = False
    revoked_at: Optional[datetime] = None
    revoked_reason: Optional[str] = None


class CertificateVerifyResponse(BaseModel):
    """Schema for certificate verification response."""

    status: str
    message: str
    certificate_id: Optional[UUID] = None
    full_name: Optional[str] = None
    course_name: Optional[str] = None
    completion_date: Optional[datetime] = None
    grade: Optional[str] = None
    score: Optional[float] = None
    issued_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    reason: Optional[str] = None
    certificate: Optional[CertificateResponse] = None


class CertificateRevocationRequest(BaseModel):
    """Request body for certificate revocation."""

    reason: str


class CertificateListResponse(BaseModel):
    """Schema for certificate list response."""

    certificates: list[CertificateResponse]
    total: int

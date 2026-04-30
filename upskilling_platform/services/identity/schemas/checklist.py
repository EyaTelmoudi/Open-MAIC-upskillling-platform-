from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime


class ChecklistItem(BaseModel):
    id: str
    title: str
    description: str
    auto_checked: bool = False
    completed: bool = False
    action_url: Optional[str] = None


class ChecklistState(BaseModel):
    items: List[ChecklistItem]
    completed_count: int
    total_count: int


class ChecklistUpdateRequest(BaseModel):
    item_id: str


class GeneralSettings(BaseModel):
    platform_name: Optional[str] = None
    platform_logo_url: Optional[str] = None
    group_website: Optional[str] = None
    platform_language: Optional[str] = Field(None, max_length=20)
    default_timezone: Optional[str] = Field(None, max_length=100)
    support_email: Optional[str] = None


class SecuritySettings(BaseModel):
    mfa_required_for_superadmin: Optional[bool] = None
    mfa_required_for_tenant_admins: Optional[bool] = None
    security_alerts: Optional[Dict[str, bool]] = None


class NotificationSettings(BaseModel):
    email_templates: Optional[Dict[str, bool]] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from_name: Optional[str] = None


class AISettings(BaseModel):
    groq_api_key: Optional[str] = None
    demo_mode: Optional[bool] = None
    agent_toggles: Optional[Dict[str, bool]] = None


class SuperAdminSettingsBase(BaseModel):
    platform_language: Optional[str] = Field(None, max_length=20)
    mfa_required_for_superadmin: Optional[bool] = None
    mfa_required_for_tenant_admins: Optional[bool] = None
    security_alerts: Optional[Dict[str, bool]] = None
    groq_api_key: Optional[str] = None
    demo_mode: Optional[bool] = None
    agent_toggles: Optional[Dict[str, bool]] = None
    support_email: Optional[str] = None


class SuperAdminSettingsUpdate(SuperAdminSettingsBase):
    pass


class SuperAdminSettingsResponse(SuperAdminSettingsBase):
    id: int
    platform_name: str
    platform_logo_url: Optional[str]
    default_timezone: str
    platform_language: str
    superadmin_onboarded: bool
    setup_completed: bool

    class Config:
        from_attributes = True

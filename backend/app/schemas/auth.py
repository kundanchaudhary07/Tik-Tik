from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr = Field(..., description="User's valid email address")
    password: str = Field(..., min_length=8, max_length=128, description="Strong password (at least 8 characters)")
    name: Optional[str] = Field(None, max_length=100, description="Optional display name")
    role: Optional[str] = Field("USER", description="Initial role (USER or ADMIN)")


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in_seconds: int
    user_id: int
    email: str
    role: str
    email_verified: bool


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., description="Password reset token received via email/dev")
    new_password: str = Field(..., min_length=8, max_length=128, description="New strong password")


class VerifyEmailRequest(BaseModel):
    token: str = Field(..., description="Email verification token")


class MessageResponse(BaseModel):
    message: str
    detail: Optional[str] = None
    dev_token: Optional[str] = None  # Exposed in dev mode for testing without real email server

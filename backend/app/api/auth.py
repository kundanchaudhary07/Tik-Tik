from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session
from typing import Optional

from app.api.deps import get_db, get_current_user, security_scheme
from app.core.config import settings
from app.core.rate_limit import auth_rate_limiter
from app.core.logging import logger
from app.models.user import User
from app.schemas.auth import (
    RegisterRequest,
    LoginRequest,
    TokenResponse,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    VerifyEmailRequest,
    MessageResponse,
)
from app.schemas.user import UserResponse
from app.services.auth_service import auth_service

router = APIRouter(prefix="/auth", tags=["Authentication & Security"])


@router.post(
    "/register",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="User Registration with Argon2id & Email Verification",
)
def register(request: Request, data: RegisterRequest, db: Session = Depends(get_db)):
    """
    Step 8 Email/Password Registration:
    - Normalizes email address
    - Validates password length and complexity
    - Hashes password using Argon2id (resistant to GPU attacks)
    - Rejects duplicate emails with 409 Conflict
    - Generates expiring single-use verification token (SHA-256 hash stored in DB)
    - Protected by sliding-window rate limiting
    """
    auth_rate_limiter.check_request(request, custom_key="register")
    user, _ = auth_service.register_user(db, data)
    return MessageResponse(
        message="Registration successful. A verification link has been dispatched to your email address.",
        detail=f"Verification email dispatched to {user.email}",
        dev_token=None,
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="User Login with Argon2id verification and JWT issuance",
)
def login(request: Request, data: LoginRequest, db: Session = Depends(get_db)):
    """
    Step 9 Login:
    - Compares provided credentials against Argon2id hash
    - Employs generic error message ("Invalid email or password") to prevent user enumeration
    - Issues cryptographically signed JWT access token containing subject (user_id) and role
    - Rate limited to prevent brute-force credential stuffing
    """
    auth_rate_limiter.check_request(request, custom_key="login")
    user, access_token = auth_service.authenticate_user(db, data)
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in_seconds=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user_id=user.id,
        email=user.email,
        role=user.role.value,
        email_verified=user.email_verified,
    )


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get authenticated user profile (Protected endpoint)",
)
def get_me(current_user: User = Depends(get_current_user)):
    """
    Step 10 Protected /me:
    - Demonstrates authentication dependency
    - Validates Bearer JWT header, signature, expiration, and revocation status
    - Returns 401 Unauthorized if missing, expired, or invalid
    - Authoritative user record retrieved directly from database
    """
    return current_user


@router.post(
    "/verify-email",
    response_model=MessageResponse,
    summary="Verify user email with secure token",
)
def verify_email(data: VerifyEmailRequest, db: Session = Depends(get_db)):
    """
    Step 13 Email Verification:
    - Verifies SHA-256 hash of token against database record
    - Ensures token is not expired
    - Marks email_verified=True and records email_verified_at timestamp
    - Clears token hash to enforce single-use property
    """
    user = auth_service.verify_email(db, data.token)
    return MessageResponse(
        message="Email successfully verified! You may now sign in.",
        detail=f"Account {user.email} is now fully verified.",
    )


@router.post(
    "/forgot-password",
    response_model=MessageResponse,
    summary="Request password reset token (Generic response)",
)
def forgot_password(request: Request, data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """
    Step 14 Password Reset:
    - Rate limited to prevent spamming
    - Generates cryptographically secure, expiring reset token
    - Hashes token before saving in database
    - Always returns generic success response to prevent account enumeration
    """
    auth_rate_limiter.check_request(request, custom_key="forgot-password")
    auth_service.request_password_reset(db, data.email)
    return MessageResponse(
        message="If an account exists with this email address, a password reset link has been dispatched.",
        detail="Please check your inbox.",
        dev_token=None,
    )


@router.post(
    "/reset-password",
    response_model=MessageResponse,
    summary="Confirm password reset with secure token",
)
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    """
    Step 14 Password Reset Confirm:
    - Matches token hash and checks expiration
    - Re-hashes new password using Argon2id
    - Immediately clears reset token to prevent replay attacks
    """
    auth_service.reset_password(db, data.token, data.new_password)
    return MessageResponse(
        message="Password has been successfully updated. You can now log in with your new password."
    )


@router.post(
    "/logout",
    response_model=MessageResponse,
    summary="Revoke current session token (Logout lifecycle)",
)
def logout(
    current_user: User = Depends(get_current_user),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
):
    """
    Step 15 Logout & Token Lifecycle:
    - Addresses the limitation of stateless JWTs by persisting the token's unique jti
      in a server-side revocation list until its natural expiration.
    - Subsequent requests with this token are rejected with 401 Token Revoked.
    """
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ")[1]
        auth_service.revoke_token(db, token)

    return MessageResponse(
        message="Successfully logged out.",
        detail="Session token has been invalidated on the server.",
    )

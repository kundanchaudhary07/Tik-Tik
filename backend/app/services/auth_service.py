from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from app.core.config import settings
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    generate_secure_token,
    hash_token,
    decode_token,
)
from app.core.logging import logger
from app.models.user import User, UserRole, RevokedToken
from app.schemas.auth import RegisterRequest, LoginRequest
from app.services.notification_service import notification_service


class AuthService:
    @staticmethod
    def register_user(db: Session, data: RegisterRequest) -> Tuple[User, str]:
        # Normalize email (lowercase, stripped)
        email = data.email.strip().lower()

        # Check existing user
        existing_user = db.query(User).filter(User.email == email).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "error": {
                        "code": "EMAIL_ALREADY_EXISTS",
                        "message": "An account with this email address already exists.",
                    }
                },
            )

        # Hash password with Argon2id
        hashed_pwd = hash_password(data.password)

        # Generate email verification token
        raw_verification_token = generate_secure_token(32)
        verification_hash = hash_token(raw_verification_token)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.TOKEN_EXPIRE_HOURS)

        # Determine role: first registered user in system or explicit ADMIN request
        user_count = db.query(User).count()
        assigned_role = UserRole.USER
        if user_count == 0:
            assigned_role = UserRole.ADMIN
        elif getattr(data, "role", None):
            try:
                assigned_role = UserRole(data.role.upper())
            except Exception:
                assigned_role = UserRole.USER

        new_user = User(
            email=email,
            hashed_password=hashed_pwd,
            name=data.name.strip() if data.name else None,
            role=assigned_role,
            is_active=True,
            email_verified=False,
            verification_token_hash=verification_hash,
            verification_token_expires_at=expires_at,
        )

        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        # Dispatch real asynchronous email job via Redis queue & worker
        notification_service.queue_verification_email(db, new_user, raw_verification_token)

        logger.info(f"User registered successfully: id={new_user.id} role={new_user.role}")
        return new_user, raw_verification_token

    @staticmethod
    def authenticate_user(db: Session, data: LoginRequest) -> Tuple[User, str]:
        email = data.email.strip().lower()
        user = db.query(User).filter(User.email == email).first()

        # Generic authentication failure to prevent account enumeration
        if not user or not verify_password(data.password, user.hashed_password):
            logger.warning(f"Failed authentication attempt for email: {email}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "error": {
                        "code": "INVALID_CREDENTIALS",
                        "message": "Invalid email or password.",
                    }
                },
                headers={"WWW-Authenticate": "Bearer"},
            )

        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "error": {
                        "code": "ACCOUNT_DISABLED",
                        "message": "This account has been deactivated.",
                    }
                },
            )

        access_token = create_access_token(
            subject=user.id,
            role=user.role.value,
        )

        logger.info(f"User logged in successfully: id={user.id}")
        return user, access_token

    @staticmethod
    def verify_email(db: Session, raw_token: str) -> User:
        token_hash = hash_token(raw_token)
        user = db.query(User).filter(User.verification_token_hash == token_hash).first()

        now = datetime.now(timezone.utc)
        if not user or not user.verification_token_expires_at or user.verification_token_expires_at < now:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": {
                        "code": "INVALID_OR_EXPIRED_TOKEN",
                        "message": "Verification token is invalid or has expired.",
                    }
                },
            )

        user.email_verified = True
        user.email_verified_at = now
        # Invalidate single-use token
        user.verification_token_hash = None
        user.verification_token_expires_at = None

        db.commit()
        db.refresh(user)
        logger.info(f"User email verified: id={user.id}")
        return user

    @staticmethod
    def request_password_reset(db: Session, email: str) -> Optional[str]:
        normalized_email = email.strip().lower()
        user = db.query(User).filter(User.email == normalized_email).first()

        # Always return generic message to caller to prevent account enumeration
        if not user:
            logger.info("Password reset requested for non-existent email (silent generic response)")
            return None

        raw_reset_token = generate_secure_token(32)
        reset_hash = hash_token(raw_reset_token)
        expires_at = datetime.now(timezone.utc) + timedelta(hours=settings.TOKEN_EXPIRE_HOURS)

        user.reset_token_hash = reset_hash
        user.reset_token_expires_at = expires_at
        db.commit()

        # Enqueue real password reset email via Redis queue & worker
        notification_service.queue_password_reset_email(db, user, raw_reset_token)
        return raw_reset_token

    @staticmethod
    def reset_password(db: Session, raw_token: str, new_password: str) -> User:
        token_hash = hash_token(raw_token)
        user = db.query(User).filter(User.reset_token_hash == token_hash).first()

        now = datetime.now(timezone.utc)
        if not user or not user.reset_token_expires_at or user.reset_token_expires_at < now:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "error": {
                        "code": "INVALID_OR_EXPIRED_TOKEN",
                        "message": "Password reset token is invalid or has expired.",
                    }
                },
            )

        # Hash new password with Argon2id
        user.hashed_password = hash_password(new_password)
        # Single-use: immediately invalidate reset token
        user.reset_token_hash = None
        user.reset_token_expires_at = None

        db.commit()
        db.refresh(user)
        logger.info(f"Password reset successful for user id={user.id}")
        return user

    @staticmethod
    def revoke_token(db: Session, raw_jwt_token: str):
        try:
            payload = decode_token(raw_jwt_token)
            jti = payload.get("jti")
            exp_timestamp = payload.get("exp")
            if jti and exp_timestamp:
                exp_dt = datetime.fromtimestamp(exp_timestamp, tz=timezone.utc)
                revoked = RevokedToken(jti=jti, expires_at=exp_dt)
                db.add(revoked)
                db.commit()
                logger.info(f"Token revoked: jti={jti}")
        except Exception as e:
            logger.warning(f"Failed to record token revocation: {e}")


auth_service = AuthService()

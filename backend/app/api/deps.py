from typing import Generator, Optional
from fastapi import Depends, HTTPException, Header, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
import jwt

from app.core.config import settings
from app.core.security import decode_token
from app.core.logging import logger
from app.db.database import get_db
from app.models.user import User, UserRole, RevokedToken

# HTTP Bearer scheme
security_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    Validates JWT token from Authorization: Bearer <token> header.
    Checks:
    1. Header presence & format
    2. Cryptographic signature (HS256)
    3. Expiration claim (exp)
    4. Revocation status in revoked_tokens table (Step 15 Logout)
    5. Database existence and active status (Step 10 Protected /me)
    """
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": {
                    "code": "AUTHENTICATION_REQUIRED",
                    "message": "Authorization header with Bearer token is required.",
                }
            },
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    try:
        payload = decode_token(token)
        user_id_str: str = payload.get("sub")
        jti: str = payload.get("jti")
        if not user_id_str:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": {"code": "INVALID_TOKEN", "message": "Token payload missing subject."}},
                headers={"WWW-Authenticate": "Bearer"},
            )
        user_id = int(user_id_str)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "TOKEN_EXPIRED", "message": "Access token has expired. Please log in again."}},
            headers={"WWW-Authenticate": "Bearer"},
        )
    except (jwt.PyJWTError, ValueError) as e:
        logger.warning(f"Invalid token supplied: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "INVALID_TOKEN", "message": "Could not validate authentication credentials."}},
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if token was explicitly revoked via logout
    if jti:
        revoked = db.query(RevokedToken).filter(RevokedToken.jti == jti).first()
        if revoked:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={"error": {"code": "TOKEN_REVOKED", "message": "This session has been logged out."}},
                headers={"WWW-Authenticate": "Bearer"},
            )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "USER_NOT_FOUND", "message": "User associated with token no longer exists."}},
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": {"code": "ACCOUNT_DISABLED", "message": "User account is disabled."}},
        )

    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """
    Step 11 Authorization: Enforces ADMIN role.
    Rejects normal USER with 403 Forbidden.
    Never trusts client role claims; verifies authoritative database role.
    """
    if current_user.role != UserRole.ADMIN:
        logger.warning(f"Unauthorized access attempt to admin endpoint by user id={current_user.id}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": {
                    "code": "FORBIDDEN",
                    "message": "Administrator privileges required to access this resource.",
                }
            },
        )
    return current_user

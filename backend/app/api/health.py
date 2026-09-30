import time
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin
from app.models.user import User
from app.core.logging import logger

router = APIRouter(tags=["Health & Diagnostics"])
START_TIME = time.time()


@router.get("/health", summary="Basic service health")
def basic_health():
    """
    Step 1 HTTP Foundation:
    Basic ping endpoint confirming FastAPI application is receiving and responding to HTTP requests.
    """
    return {
        "status": "healthy",
        "service": "productivity-platform-api",
        "timestamp": time.time(),
        "uptime_seconds": round(time.time() - START_TIME, 2),
    }


@router.get("/health/live", summary="Kubernetes / Cloud liveness probe")
def liveness_probe():
    """
    Step 22 Health / Readiness:
    Liveness probe answers: Is the application process running and capable of executing code?
    If this fails or crashes, the orchestrator / container engine should restart the container.
    """
    return {
        "status": "alive",
        "timestamp": time.time(),
    }


@router.get("/health/ready", summary="Kubernetes / Cloud readiness probe")
def readiness_probe(db: Session = Depends(get_db)):
    """
    Step 22 Health / Readiness:
    Readiness probe answers: Can the application fulfill user requests and reach its dependencies (PostgreSQL)?
    If this fails, the load balancer stops routing traffic to this instance until it recovers.
    """
    try:
        # Execute lightweight ping query to verify database connection pool viability
        db.execute(text("SELECT 1"))
        return {
            "status": "ready",
            "database": "connected",
            "timestamp": time.time(),
        }
    except Exception as e:
        logger.error(f"Readiness probe failed database ping: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": {
                    "code": "DATABASE_UNAVAILABLE",
                    "message": "Service is not ready. Database connectivity failure.",
                }
            },
        )


@router.get("/admin/health", summary="Admin-only diagnostics health")
def admin_health(current_admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """
    Step 11 Authorization:
    Demonstrates Role-Based Access Control (RBAC).
    - USER role receives 403 Forbidden.
    - ADMIN role receives 200 OK.
    Authorization is enforced by authoritative backend checks, not frontend state.
    """
    user_count = db.execute(text("SELECT count(*) FROM users")).scalar()
    return {
        "status": "admin_healthy",
        "admin_user": current_admin.email,
        "total_registered_users": user_count,
        "system_status": "operational",
    }

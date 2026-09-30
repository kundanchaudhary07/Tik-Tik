from contextlib import asynccontextmanager
import secrets
import time
from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import api_router
from app.core.config import settings
from app.core.logging import logger
from app.db.database import engine, Base
from app.worker import start_background_worker, stop_background_worker

# Create tables if not already created by Alembic
Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Launch background email and reminder worker thread
    start_background_worker()
    yield
    # Shutdown: Stop worker thread cleanly
    stop_background_worker()


app = FastAPI(
    title=settings.PROJECT_NAME,
    description="Production Engineering Learning Lab API covering HTTP, Authentication, Authorization, Database Transactions, and Security.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# Step 16: CORS Middleware Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "Retry-After", "X-Idempotency-Replayed"],
)


# Step 21: Structured Logging & Request ID Middleware
@app.middleware("http")
async def logging_and_request_id_middleware(request: Request, call_next):
    # Propagate or generate request ID
    request_id = request.headers.get("X-Request-ID", secrets.token_hex(8))
    request.state.request_id = request_id

    start_time = time.time()
    method = request.method
    path = request.url.path
    client_ip = request.client.host if request.client else "unknown"

    try:
        response: Response = await call_next(request)
        latency_ms = round((time.time() - start_time) * 1000, 2)
        response.headers["X-Request-ID"] = request_id

        # Structured log
        logger.info(
            f"HTTP {method} {path} -> {response.status_code} ({latency_ms}ms)",
            extra={
                "request_id": request_id,
                "method": method,
                "endpoint": path,
                "status_code": response.status_code,
                "latency_ms": latency_ms,
                "ip": client_ip,
            },
        )
        return response
    except Exception as exc:
        latency_ms = round((time.time() - start_time) * 1000, 2)
        logger.error(
            f"Unhandled exception during HTTP {method} {path}: {exc}",
            exc_info=True,
            extra={
                "request_id": request_id,
                "method": method,
                "endpoint": path,
                "status_code": 500,
                "latency_ms": latency_ms,
                "ip": client_ip,
            },
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "An internal server error occurred. Diagnostic details recorded.",
                },
                "request_id": request_id,
            },
            headers={"X-Request-ID": request_id},
        )


# Step 20: Safe Consistent Error Handlers (No stack traces to client)
@app.exception_handler(HTTPException)
async def custom_http_exception_handler(request: Request, exc: HTTPException):
    request_id = getattr(request.state, "request_id", "unknown")
    detail = exc.detail
    if isinstance(detail, dict) and "error" in detail:
        content = detail
        content["request_id"] = request_id
    else:
        content = {
            "error": {
                "code": f"HTTP_{exc.status_code}",
                "message": str(detail),
            },
            "request_id": request_id,
        }
    return JSONResponse(
        status_code=exc.status_code,
        content=content,
        headers=exc.headers or {"X-Request-ID": request_id},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handles HTTP 422 Unprocessable Entity with clean field-level error messages."""
    request_id = getattr(request.state, "request_id", "unknown")
    errors = []
    for err in exc.errors():
        field_path = " -> ".join([str(loc) for loc in err.get("loc", [])])
        errors.append({
            "field": field_path,
            "message": err.get("msg"),
            "type": err.get("type"),
        })

    logger.warning(f"Request validation failure on {request.url.path}: {errors}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": {
                "code": "VALIDATION_ERROR",
                "message": "The request payload failed input validation.",
                "details": errors,
            },
            "request_id": request_id,
        },
        headers={"X-Request-ID": request_id},
    )


# Step 1: Root Greeting Endpoint
@app.get("/", summary="Lab Root & Overview")
def root_endpoint():
    """
    Step 1 HTTP Foundation:
    Browser -> HTTP -> Uvicorn -> FastAPI -> Response
    """
    return {
        "project": "Productivity Platform — Production Engineering Learning Lab",
        "phase": 1,
        "status": "operational",
        "documentation": "/docs",
        "health": "/health",
        "architecture": {
            "web_server": "Uvicorn (ASGI)",
            "framework": "FastAPI",
            "database": "PostgreSQL",
            "orm": "SQLAlchemy 2.0",
            "migrations": "Alembic",
            "auth": "Argon2id + JWT",
        },
    }


# Include all routers
app.include_router(api_router)

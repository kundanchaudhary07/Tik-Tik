from fastapi import APIRouter
from app.api.health import router as health_router
from app.api.auth import router as auth_router
from app.api.users import router as users_router
from app.api.demo import router as demo_router
from app.api.activities import router as activities_router
from app.api.subtasks import router as subtasks_router
from app.api.reminders import router as reminders_router
from app.api.followups import router as followups_router
from app.api.admin import router as admin_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(auth_router)
api_router.include_router(users_router, prefix="/api")
api_router.include_router(demo_router, prefix="/api")
api_router.include_router(activities_router, prefix="/api")
api_router.include_router(subtasks_router, prefix="/api")
api_router.include_router(reminders_router, prefix="/api")
api_router.include_router(followups_router, prefix="/api")
api_router.include_router(admin_router, prefix="/api")

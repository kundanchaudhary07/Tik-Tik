import os
from datetime import datetime, timezone
from app.db.database import SessionLocal
from app.models.user import User, UserRole
from app.core.security import hash_password
from app.core.logging import logger


def seed_data():
    db = SessionLocal()
    try:
        admin_email = os.getenv("INITIAL_ADMIN_EMAIL", "").strip().lower()
        admin_password = os.getenv("INITIAL_ADMIN_PASSWORD", "")
        if not admin_email or not admin_password:
            logger.info("Initial admin bootstrap skipped because its environment variables are not configured.")
            return

        admin = db.query(User).filter(User.email == admin_email).first()
        if not admin:
            db.add(User(
                email=admin_email,
                name="Platform Administrator",
                hashed_password=hash_password(admin_password),
                role=UserRole.ADMIN,
                is_active=True,
                email_verified=True,
                email_verified_at=datetime.now(timezone.utc),
            ))
            logger.info("Created initial administrator from configured environment.")
        else:
            logger.info("Initial administrator already exists; credentials were left unchanged.")

        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    seed_data()

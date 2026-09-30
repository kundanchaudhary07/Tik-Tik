from datetime import datetime, timezone
from app.db.database import SessionLocal
from app.models.user import User, UserRole
from app.core.security import hash_password
from app.core.logging import logger


def seed_data():
    db = SessionLocal()
    try:
        # Check if admin already exists
        admin = db.query(User).filter(User.email == "admin@example.com").first()
        if not admin:
            admin = User(
                email="admin@example.com",
                name="Admin User",
                hashed_password=hash_password("AdminPassword123!"),
                role=UserRole.ADMIN,
                is_active=True,
                email_verified=True,
                email_verified_at=datetime.now(timezone.utc),
            )
            db.add(admin)
            logger.info("Created default administrator user: admin@example.com / AdminPassword123!")

        # Check if test regular user exists
        user = db.query(User).filter(User.email == "user@example.com").first()
        if not user:
            user = User(
                email="user@example.com",
                name="Alex Learner",
                hashed_password=hash_password("UserPassword123!"),
                role=UserRole.USER,
                is_active=True,
                email_verified=True,
                email_verified_at=datetime.now(timezone.utc),
            )
            db.add(user)
            logger.info("Created default standard user: user@example.com / UserPassword123!")

        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    seed_data()

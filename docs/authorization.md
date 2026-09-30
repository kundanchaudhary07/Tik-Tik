# Authorization & Access Control

## 1. Authentication vs. Authorization

| Concept | Question Answered | Example Mechanism | Failure Code |
| :--- | :--- | :--- | :--- |
| **Authentication (401)** | "Who are you?" | Bearer JWT token, Argon2id password check | `401 Unauthorized` |
| **Authorization (403)** | "What are you permitted to do?" | Role checks (USER vs. ADMIN), Resource ownership | `403 Forbidden` |

---

## 2. Role-Based Access Control (RBAC)

FastAPI dependencies cleanly enforce roles before handler execution:

```python
def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": {"code": "FORBIDDEN", "message": "Admin privileges required."}},
        )
    return current_user
```

---

## 3. Insecure Direct Object References (IDOR) Protection

### The Vulnerability
A common security flaw occurs when an API accepts an object identifier (e.g., `/api/demo/{item_id}`) and performs updates or fetches without validating that the authenticated user owns the resource:

```python
# VULNERABLE CODE (IDOR Bug)
@router.get("/items/{id}")
def get_item(id: int, db: Session = Depends(get_db)):
    return db.query(Item).filter(Item.id == id).first()
```

### The Fix: Explicit Ownership Check
```python
# SECURE IMPLEMENTATION (Step 12)
@router.get("/{item_id}")
def get_demo_item(item_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.query(DemoItem).filter(DemoItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    if item.owner_id != user.id:
        logger.warning(f"[IDOR BLOCKED] User {user.id} tried to access item {item_id}")
        raise HTTPException(status_code=403, detail="Forbidden: You do not own this resource")
    return item
```

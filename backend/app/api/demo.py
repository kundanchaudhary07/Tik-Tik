import json
import time
from typing import List, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response, status
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.api.deps import get_db, get_current_user
from app.models.user import User
from app.models.demo_item import DemoItem, IdempotencyRecord
from app.schemas.demo import (
    DemoItemCreate,
    DemoItemUpdate,
    DemoItemResponse,
    ConcurrencyIncrementRequest,
    TransactionDemoRequest,
)
from app.core.logging import logger

router = APIRouter(prefix="/demo", tags=["Educational Lab Endpoints"])


@router.get("", response_model=List[DemoItemResponse], summary="List demo items (Query parameters demonstration)")
def list_demo_items(
    status_filter: Optional[str] = Query(None, alias="status", description="Filter by status (e.g., 'active', 'archived')"),
    limit: int = Query(20, ge=1, le=100, description="Pagination limit"),
    skip: int = Query(0, ge=0, description="Pagination offset"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Step 2 & Step 12:
    Lists items belonging to the current authenticated user (enforcing ownership boundary).
    Demonstrates query parameter parsing, validation (ge, le), and database filtering.
    """
    query = db.query(DemoItem).filter(DemoItem.owner_id == current_user.id)
    if status_filter:
        query = query.filter(DemoItem.status == status_filter)
    items = query.offset(skip).limit(limit).all()
    return items


@router.post("", response_model=DemoItemResponse, status_code=status.HTTP_201_CREATED, summary="Create demo item (Idempotency demonstration)")
def create_demo_item(
    item_in: DemoItemCreate,
    response: Response,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key", description="Unique key for safe request retry"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Step 2 & Step 18 Idempotency:
    - Creates a new DemoItem owned by current_user.
    - Demonstrates HTTP 201 Created.
    - If Idempotency-Key header is provided:
      Checks whether this exact operation was already executed.
      If yes, returns the saved response without duplicate creation!
    """
    if idempotency_key:
        cached_record = (
            db.query(IdempotencyRecord)
            .filter(IdempotencyRecord.idempotency_key == idempotency_key)
            .first()
        )
        if cached_record:
            logger.info(f"[IDEMPOTENCY] Replaying response for key={idempotency_key}")
            response.status_code = cached_record.status_code
            response.headers["X-Idempotency-Replayed"] = "true"
            return json.loads(cached_record.response_body)

    new_item = DemoItem(
        title=item_in.title,
        description=item_in.description,
        status="active",
        owner_id=current_user.id,
    )
    db.add(new_item)
    db.commit()
    db.refresh(new_item)

    resp_data = DemoItemResponse.model_validate(new_item).model_dump(mode="json")

    # Record idempotency key if supplied
    if idempotency_key:
        record = IdempotencyRecord(
            idempotency_key=idempotency_key,
            user_id=current_user.id,
            status_code=201,
            response_body=json.dumps(resp_data),
        )
        db.add(record)
        db.commit()

    return new_item


@router.get("/{item_id}", response_model=DemoItemResponse, summary="Get demo item by ID (IDOR & 404 demonstration)")
def get_demo_item(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Step 2 & Step 12 IDOR Prevention:
    - Path parameter parsing.
    - Returns 404 Not Found if item does not exist.
    - Returns 403 Forbidden if item exists but is owned by another user (preventing Insecure Direct Object References).
    """
    item = db.query(DemoItem).filter(DemoItem.id == item_id).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "ITEM_NOT_FOUND", "message": f"Demo item with ID {item_id} does not exist."}},
        )

    # Step 12: IDOR Ownership Check
    if item.owner_id != current_user.id:
        logger.warning(
            f"[SECURITY IDOR] User id={current_user.id} attempted to access item id={item_id} owned by user id={item.owner_id}"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": {
                    "code": "IDOR_PROTECTION_TRIGGERED",
                    "message": "Access denied. You do not own this resource.",
                }
            },
        )

    return item


@router.patch("/{item_id}", response_model=DemoItemResponse, summary="Update demo item (Partial update)")
def update_demo_item(
    item_id: int,
    item_in: DemoItemUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Step 2 HTTP PATCH:
    Updates only specified fields on existing resource.
    Guards against IDOR.
    """
    item = db.query(DemoItem).filter(DemoItem.id == item_id).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "ITEM_NOT_FOUND", "message": f"Demo item with ID {item_id} not found."}},
        )

    if item.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": {"code": "IDOR_FORBIDDEN", "message": "You cannot modify another user's item."}},
        )

    if item_in.title is not None:
        item.title = item_in.title
    if item_in.description is not None:
        item.description = item_in.description
    if item_in.status is not None:
        item.status = item_in.status

    item.version += 1
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", summary="Delete demo item (DELETE method demonstration)")
def delete_demo_item(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Step 2 HTTP DELETE:
    Deletes resource if owned by caller.
    """
    item = db.query(DemoItem).filter(DemoItem.id == item_id).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "ITEM_NOT_FOUND", "message": f"Demo item with ID {item_id} not found."}},
        )

    if item.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": {"code": "IDOR_FORBIDDEN", "message": "You cannot delete another user's item."}},
        )

    db.delete(item)
    db.commit()
    return {"message": f"Demo item {item_id} deleted successfully."}


@router.post("/transactions/test", summary="Step 7 Transaction ACID & Rollback Demonstration")
def test_transaction_rollback(
    req: TransactionDemoRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Step 7 Transaction & ACID Demonstration:
    - Atomicity: Both Operation A and Operation B must succeed, or neither must persist.
    - If fail_second_operation is True, Operation B deliberately fails.
    - We verify that Operation A was completely rolled back and never committed to the database!
    """
    item_a_id = None
    try:
        # Explicit transaction block
        # Operation A: insert first item
        item_a = DemoItem(
            title=req.title_a,
            description="Transaction step 1",
            owner_id=current_user.id,
        )
        db.add(item_a)
        db.flush()  # Flushes to get generated ID within transaction, but does not commit
        item_a_id = item_a.id

        if req.fail_second_operation:
            # Operation B deliberately fails
            logger.info("[TRANSACTION LAB] Simulating deliberate failure during Operation B")
            raise ValueError("Deliberate failure in Operation B to trigger transaction ROLLBACK")

        # Operation B: insert second item
        item_b = DemoItem(
            title=req.title_b,
            description="Transaction step 2",
            owner_id=current_user.id,
        )
        db.add(item_b)

        db.commit()
        return {
            "status": "committed",
            "message": "Transaction committed successfully! Both Operation A and B persisted.",
            "item_a_id": item_a.id,
            "item_b_id": item_b.id,
        }

    except Exception as e:
        db.rollback()
        logger.info(f"[TRANSACTION LAB] Transaction was rolled back: {e}")

        # Verify rollback: confirm item_a was NOT saved to the database
        persisted = None
        if item_a_id:
            persisted = db.query(DemoItem).filter(DemoItem.id == item_a_id).first()

        return {
            "status": "rolled_back",
            "message": "Transaction failed and was safely rolled back.",
            "error_encountered": str(e),
            "operation_a_rolled_back": persisted is None,
            "acid_guarantee": "Atomicity preserved: no partial changes were saved to PostgreSQL.",
        }


@router.post("/{item_id}/increment", summary="Step 19 Concurrency & Row Locking Demonstration")
def increment_counter_concurrency(
    item_id: int,
    req: ConcurrencyIncrementRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Step 19 Concurrency & Race Conditions:
    Demonstrates:
    1. 'pessimistic': Uses SELECT ... FOR UPDATE (row-level lock in PostgreSQL).
       Prevents lost updates even under high concurrency.
    2. 'optimistic': Uses version column check. If version changed, raises 409 Conflict.
    3. 'none': Unprotected read-modify-write, demonstrating the classical lost-update race condition.
    """
    if req.strategy == "pessimistic":
        # Acquire PostgreSQL row lock: SELECT * FROM demo_items WHERE id = :id FOR UPDATE
        item = (
            db.query(DemoItem)
            .filter(DemoItem.id == item_id, DemoItem.owner_id == current_user.id)
            .with_for_update()
            .first()
        )
        if not item:
            raise HTTPException(status_code=404, detail="Item not found or not owned by caller.")

        item.counter += 1
        item.version += 1
        db.commit()
        return {
            "strategy": "pessimistic_row_lock",
            "counter": item.counter,
            "version": item.version,
            "explanation": "Acquired PostgreSQL row lock with SELECT ... FOR UPDATE. Safe against simultaneous writes.",
        }

    elif req.strategy == "optimistic":
        item = db.query(DemoItem).filter(DemoItem.id == item_id, DemoItem.owner_id == current_user.id).first()
        if not item:
            raise HTTPException(status_code=404, detail="Item not found.")

        if req.expected_version is not None and item.version != req.expected_version:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "error": {
                        "code": "CONCURRENT_MODIFICATION",
                        "message": f"Conflict: Item was modified by another request. Current version is {item.version}, expected {req.expected_version}.",
                    }
                },
            )

        item.counter += 1
        item.version += 1
        db.commit()
        return {
            "strategy": "optimistic_concurrency",
            "counter": item.counter,
            "version": item.version,
            "explanation": "Optimistic lock verified version tag before writing.",
        }

    else:
        # Strategy 'none' demonstrates lost update
        item = db.query(DemoItem).filter(DemoItem.id == item_id, DemoItem.owner_id == current_user.id).first()
        if not item:
            raise HTTPException(status_code=404, detail="Item not found.")
        current_val = item.counter
        time.sleep(0.05)  # artificial window to allow interleaved execution
        item.counter = current_val + 1
        db.commit()
        return {
            "strategy": "unprotected_lost_update_risk",
            "counter": item.counter,
            "version": item.version,
        }

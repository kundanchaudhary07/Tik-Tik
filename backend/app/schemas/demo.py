from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class DemoItemCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=255, description="Item title")
    description: Optional[str] = Field(None, description="Item description")


class DemoItemUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    status: Optional[str] = None


class DemoItemResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    status: str
    counter: int
    version: int
    owner_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class ConcurrencyIncrementRequest(BaseModel):
    strategy: str = Field("pessimistic", description="'pessimistic' (row lock) or 'optimistic' or 'none' (lost update demo)")
    expected_version: Optional[int] = None


class TransactionDemoRequest(BaseModel):
    fail_second_operation: bool = Field(False, description="Set to True to force failure on Op B and test transaction ROLLBACK")
    title_a: str = Field("Item A - First transaction step")
    title_b: str = Field("Item B - Second transaction step")

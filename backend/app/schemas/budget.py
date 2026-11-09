from decimal import Decimal

from pydantic import BaseModel, Field


class BudgetCreate(BaseModel):
    category_id: int
    monthly_limit: Decimal = Field(gt=0)


class BudgetUpdate(BaseModel):
    monthly_limit: Decimal = Field(gt=0)


class BudgetRead(BaseModel):
    id: int
    category_id: int
    category_name: str
    category_color: str
    category_icon: str | None
    monthly_limit: Decimal


class BudgetStatus(BaseModel):
    """One budgeted category's actual spend for a given month, compared
    against its limit."""

    budget_id: int
    category_id: int
    category_name: str
    category_color: str
    category_icon: str | None
    monthly_limit: Decimal
    spent: Decimal
    remaining: Decimal
    # Can exceed 100 — this number is never clamped, so "spent 150% of
    # budget" stays visible in the raw value. The UI reads it for the caption
    # beside the progress bar and for how far past the limit the overrun is;
    # the bar itself rescales once the limit is passed instead of clamping.
    percent: float
    is_over_budget: bool


class BudgetStatusResponse(BaseModel):
    year: int
    month: int
    items: list[BudgetStatus]

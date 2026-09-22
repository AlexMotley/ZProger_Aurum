"""Aggregation logic behind the Overview dashboard."""
import calendar
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import TransactionType
from app.models.transaction import Transaction
from app.schemas.dashboard import CategoryBreakdownChildItem, CategoryBreakdownItem, DashboardSummary
from app.services.category_rollup import rollup_spending_by_top_level_category

# Categorical slots are capped at 8 (dataviz skill: a 9th series folds into "Other",
# never a generated hue) — this is also the exact size of the default category set.
MAX_CHART_SLICES = 8
OTHER_SLICE_COLOR = "#898781"  # muted ink, reserved for the non-categorical rollup


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


async def _category_breakdown(
    session: AsyncSession, *, transaction_type: TransactionType, start: date, end: date, total: Decimal
) -> list[CategoryBreakdownItem]:
    """Shared by the spending and income donuts below — same top-N-plus-Other
    shape, just keyed off a different transaction type and its own total as
    the percent denominator."""
    # A subcategory's amount rolls up into its parent's slice, and a split
    # transaction's category_id=NULL means its category lives on its split
    # lines instead — rollup_spending_by_top_level_category handles both
    # the same way a plain transaction's category already was.
    rows = await rollup_spending_by_top_level_category(
        session, transaction_type=transaction_type, start_date=start, end_date=end
    )

    top_rows, rest_rows = rows[:MAX_CHART_SLICES], rows[MAX_CHART_SLICES:]

    def _percent(amount: Decimal) -> float:
        return float(amount / total * 100) if total else 0.0

    breakdown = [
        CategoryBreakdownItem(
            category_id=row.category_id, name=row.name, color=row.color, icon=row.icon,
            amount=row.amount, percent=_percent(row.amount),
            children=[
                CategoryBreakdownChildItem(
                    category_id=child.category_id, name=child.name, color=child.color, icon=child.icon,
                    amount=child.amount,
                )
                for child in row.children
            ],
        )
        for row in top_rows
    ]

    if rest_rows:
        other_amount = sum((row.amount for row in rest_rows), Decimal("0"))
        breakdown.append(
            CategoryBreakdownItem(
                category_id=None, name="Other", color=OTHER_SLICE_COLOR, icon="more-horizontal",
                amount=other_amount, percent=_percent(other_amount),
            )
        )

    return breakdown


async def get_dashboard_summary(session: AsyncSession, year: int, month: int) -> DashboardSummary:
    start, end = _month_bounds(year, month)

    totals_stmt = (
        select(Transaction.type, func.coalesce(func.sum(Transaction.amount), 0))
        .where(Transaction.date >= start, Transaction.date <= end)
        .group_by(Transaction.type)
    )
    totals_result = await session.execute(totals_stmt)
    totals: dict[TransactionType, Decimal] = {row[0]: row[1] for row in totals_result.all()}

    real_income = totals.get(TransactionType.INCOME, Decimal("0"))
    spent = totals.get(TransactionType.EXPENSE, Decimal("0"))
    transferred_out = totals.get(TransactionType.TRANSFER, Decimal("0"))

    spending_by_category = await _category_breakdown(
        session, transaction_type=TransactionType.EXPENSE, start=start, end=end, total=spent
    )
    income_by_category = await _category_breakdown(
        session, transaction_type=TransactionType.INCOME, start=start, end=end, total=real_income
    )

    return DashboardSummary(
        year=year,
        month=month,
        real_income=real_income,
        spent=spent,
        net=real_income - spent,
        transferred_out=transferred_out,
        spending_by_category=spending_by_category,
        income_by_category=income_by_category,
    )

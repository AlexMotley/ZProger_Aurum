"""Turning the period a caller asked for into concrete date bounds.

Every dashboard-style endpoint offers the same two ways to say "which
days": a year+month pair (the default, one whole month) or an explicit
start_date/end_date range picked day by day in the UI. Both end up as the
same inclusive (start, end) tuple, so the aggregation below them never has
to know which form the request used.
"""
import calendar
from datetime import date

from fastapi import HTTPException


def month_bounds(year: int, month: int) -> tuple[date, date]:
    """First and last day of a month, both inclusive."""
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


def resolve_period(
    year: int,
    month: int,
    start_date: date | None = None,
    end_date: date | None = None,
) -> tuple[date, date]:
    """An explicit day range wins over year/month; without one, the whole
    selected month is used.

    Both ends of a range are required together — a half-open range would
    silently mean "this month plus everything after the 5th", which is not
    something any caller actually wants and would be read as a bug.
    """
    if (start_date is None) != (end_date is None):
        raise HTTPException(status_code=400, detail="start_date and end_date must be given together")
    if start_date is not None and end_date is not None:
        if start_date > end_date:
            raise HTTPException(status_code=400, detail="start_date must not be after end_date")
        return start_date, end_date
    return month_bounds(year, month)

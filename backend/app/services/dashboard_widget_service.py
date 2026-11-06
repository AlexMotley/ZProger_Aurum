"""CRUD for user-added Dashboard widgets, plus turning a stored config into
live chart data via services/diagrams.py at read time — a widget's numbers
are never cached/stored, they're recomputed against the current month's
transactions every time the Dashboard loads, the same "derive it, don't
duplicate it" approach account_service.py uses for balances."""
from datetime import date as date_

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.models.dashboard_widget import DashboardWidget
from app.models.enums import WidgetType
from app.services.period import resolve_period
from app.schemas.dashboard_widget import (
    DashboardWidgetCreate,
    DashboardWidgetRead,
    DiagramDataRead,
    DiagramPointRead,
    WidgetTypeManifestEntry,
)
from app.services.diagrams import DIAGRAM_REGISTRY, Diagram


def list_widget_types() -> list[WidgetTypeManifestEntry]:
    return [
        WidgetTypeManifestEntry(
            type=diagram_cls.type,
            allowed_dimensions=diagram_cls.allowed_dimensions,
            allowed_metrics=diagram_cls.allowed_metrics,
            needs_granularity=diagram_cls.type == WidgetType.LINE,
        )
        for diagram_cls in DIAGRAM_REGISTRY.values()
    ]


def _build_diagram(widget_type: WidgetType, fields: dict, start: date_ | None, end: date_ | None) -> Diagram:
    diagram_cls = DIAGRAM_REGISTRY[widget_type]
    return diagram_cls(
        dimension=fields["dimension"],
        metric=fields["metric"],
        transaction_type=fields["transaction_type"],
        granularity=fields["granularity"],
        account_id=fields["account_id"],
        start=start,
        end=end,
    )


def _validate_widget_config(payload: DashboardWidgetCreate) -> None:
    try:
        _build_diagram(
            payload.type,
            {
                "dimension": payload.dimension,
                "metric": payload.metric,
                "transaction_type": payload.transaction_type,
                "granularity": payload.granularity,
                "account_id": payload.account_id,
            },
            start=None,
            end=None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


async def _to_read(session: AsyncSession, widget: DashboardWidget, start: date_, end: date_) -> DashboardWidgetRead:
    diagram = _build_diagram(
        widget.type,
        {
            "dimension": widget.dimension,
            "metric": widget.metric,
            "transaction_type": widget.transaction_type,
            "granularity": widget.granularity,
            "account_id": widget.account_id,
        },
        start=start,
        end=end,
    )
    data = await diagram.fetch(session)
    return DashboardWidgetRead(
        id=widget.id,
        type=widget.type,
        title=widget.title,
        dimension=widget.dimension,
        metric=widget.metric,
        transaction_type=widget.transaction_type,
        granularity=widget.granularity,
        account_id=widget.account_id,
        sort_order=widget.sort_order,
        data=DiagramDataRead(
            points=[DiagramPointRead(label=p.label, value=p.value, color=p.color) for p in data.points]
        ),
    )


async def list_widgets(
    session: AsyncSession,
    year: int,
    month: int,
    start_date: date_ | None = None,
    end_date: date_ | None = None,
) -> list[DashboardWidgetRead]:
    """`start_date`/`end_date` recompute every widget against that day
    range instead of the whole month — see services/period.py."""
    start, end = resolve_period(year, month, start_date, end_date)
    rows = (
        (await session.execute(select(DashboardWidget).order_by(DashboardWidget.sort_order, DashboardWidget.id)))
        .scalars()
        .all()
    )
    return [await _to_read(session, widget, start, end) for widget in rows]


async def _validate_and_check_account(session: AsyncSession, payload: DashboardWidgetCreate) -> None:
    _validate_widget_config(payload)
    if payload.account_id is not None and await session.get(Account, payload.account_id) is None:
        raise HTTPException(status_code=400, detail="Account not found")


def _apply_fields(widget: DashboardWidget, payload: DashboardWidgetCreate) -> None:
    widget.type = payload.type
    widget.title = payload.title
    widget.dimension = payload.dimension
    widget.metric = payload.metric
    widget.transaction_type = payload.transaction_type
    widget.granularity = payload.granularity
    widget.account_id = payload.account_id


async def create_widget(
    session: AsyncSession,
    payload: DashboardWidgetCreate,
    year: int,
    month: int,
    start_date: date_ | None = None,
    end_date: date_ | None = None,
) -> DashboardWidgetRead:
    await _validate_and_check_account(session, payload)

    max_sort_order = (await session.execute(select(func.max(DashboardWidget.sort_order)))).scalar_one()
    widget = DashboardWidget(sort_order=(max_sort_order or 0) + 1)
    _apply_fields(widget, payload)
    session.add(widget)
    await session.commit()
    await session.refresh(widget)

    start, end = resolve_period(year, month, start_date, end_date)
    return await _to_read(session, widget, start, end)


async def update_widget(
    session: AsyncSession,
    widget_id: int,
    payload: DashboardWidgetCreate,
    year: int,
    month: int,
    start_date: date_ | None = None,
    end_date: date_ | None = None,
) -> DashboardWidgetRead:
    widget = await session.get(DashboardWidget, widget_id)
    if widget is None:
        raise HTTPException(status_code=404, detail="Widget not found")
    await _validate_and_check_account(session, payload)

    _apply_fields(widget, payload)
    await session.commit()
    await session.refresh(widget)

    start, end = resolve_period(year, month, start_date, end_date)
    return await _to_read(session, widget, start, end)


async def delete_widget(session: AsyncSession, widget_id: int) -> None:
    widget = await session.get(DashboardWidget, widget_id)
    if widget is None:
        raise HTTPException(status_code=404, detail="Widget not found")
    await session.delete(widget)
    await session.commit()

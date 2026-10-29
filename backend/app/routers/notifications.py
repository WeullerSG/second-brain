from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ScheduleNotification
from app.schemas import (
    ScheduleNotificationCreate,
    ScheduleNotificationOut,
    ScheduleNotificationUpdate,
)

router = APIRouter(prefix="/api/notifications", tags=["Agenda & Notificações"])

WEEKDAY_MAP = {
    0: "mon",
    1: "tue",
    2: "wed",
    3: "thu",
    4: "fri",
    5: "sat",
    6: "sun",
}


def _normalize_offsets(offsets: Optional[list[int]]) -> Optional[list[int]]:
    """Remove negativos e duplicados e ordena do aviso mais cedo para o mais tarde."""
    if offsets is None:
        return None
    return sorted({int(o) for o in offsets if int(o) >= 0}, reverse=True)


def _apply_offsets(item: ScheduleNotification, offsets: Optional[list[int]]) -> None:
    clean = _normalize_offsets(offsets)
    if clean is None:
        return
    item.reminder_offsets = clean
    # Mantém o campo antigo com o primeiro aviso (compatibilidade)
    item.remind_minutes_before = clean[0] if clean else 0


@router.get("", response_model=list[ScheduleNotificationOut])
def list_notifications(
    category: Optional[str] = None,
    enabled_only: bool = False,
    db: Session = Depends(get_db),
):
    q = db.query(ScheduleNotification)
    if category:
        q = q.filter(ScheduleNotification.category == category)
    if enabled_only:
        q = q.filter(ScheduleNotification.enabled.is_(True))
    return q.order_by(ScheduleNotification.notify_time.asc(), ScheduleNotification.id.desc()).all()


@router.get("/today")
def get_today_schedule(db: Session = Depends(get_db)):
    """
    Retorna todas as aulas recorrentes do dia da semana atual + entrevistas/compromissos
    agendados para a data de hoje (YYYY-MM-DD).
    """
    now = datetime.now()
    today_str = now.strftime("%Y-%m-%d")
    today_weekday = WEEKDAY_MAP[now.weekday()]

    all_active = (
        db.query(ScheduleNotification)
        .filter(ScheduleNotification.enabled.is_(True))
        .order_by(ScheduleNotification.notify_time.asc())
        .all()
    )

    today_items = []
    for item in all_active:
        if item.schedule_type == "daily":
            today_items.append(ScheduleNotificationOut.model_validate(item))
        elif item.schedule_type == "one_time" and item.target_date == today_str:
            today_items.append(ScheduleNotificationOut.model_validate(item))
        elif item.schedule_type == "recurring_weekly" and item.days_of_week:
            days = [d.strip().lower() for d in item.days_of_week.split(",") if d.strip()]
            if today_weekday in days:
                today_items.append(ScheduleNotificationOut.model_validate(item))

    return {
        "today_date": today_str,
        "today_weekday": today_weekday,
        "count": len(today_items),
        "items": today_items,
    }


@router.post("", response_model=ScheduleNotificationOut)
def create_notification(
    payload: ScheduleNotificationCreate,
    db: Session = Depends(get_db),
):
    data = payload.model_dump()
    offsets = data.pop("reminder_offsets", None)
    item = ScheduleNotification(**data)
    _apply_offsets(item, offsets if offsets is not None else [payload.remind_minutes_before])
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/{notification_id}", response_model=ScheduleNotificationOut)
def update_notification(
    notification_id: int,
    payload: ScheduleNotificationUpdate,
    db: Session = Depends(get_db),
):
    item = (
        db.query(ScheduleNotification)
        .filter(ScheduleNotification.id == notification_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    data = payload.model_dump(exclude_unset=True)
    offsets = data.pop("reminder_offsets", None)
    for field, value in data.items():
        setattr(item, field, value)
    if offsets is not None:
        _apply_offsets(item, offsets)
    elif "remind_minutes_before" in data:
        _apply_offsets(item, [data["remind_minutes_before"]])
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{notification_id}")
def delete_notification(notification_id: int, db: Session = Depends(get_db)):
    item = (
        db.query(ScheduleNotification)
        .filter(ScheduleNotification.id == notification_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Agendamento não encontrado")
    db.delete(item)
    db.commit()
    return {"status": "deleted", "id": notification_id}

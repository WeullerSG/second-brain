from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import AppSettingsOut, AppSettingsUpdate
from app.services.app_settings_store import (
    AGENT_MODEL_KEY,
    available_agent_models,
    get_agent_model,
    set_setting,
)

router = APIRouter(prefix="/api/settings", tags=["Configurações"])


def _settings_out(db: Session) -> AppSettingsOut:
    return AppSettingsOut(agent_model=get_agent_model(db), available_models=available_agent_models(db))


@router.get("", response_model=AppSettingsOut)
def read_settings(db: Session = Depends(get_db)):
    return _settings_out(db)


@router.put("", response_model=AppSettingsOut)
def update_settings(payload: AppSettingsUpdate, db: Session = Depends(get_db)):
    set_setting(db, AGENT_MODEL_KEY, payload.agent_model.strip())
    return _settings_out(db)

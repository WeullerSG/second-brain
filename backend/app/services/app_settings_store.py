"""Leitura e gravação das configurações do app (tabela app_settings)."""
from typing import Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.models import AppSetting

AGENT_MODEL_KEY = "agent_model"

# Modelos sugeridos no menu de configurações (o usuário também pode digitar outro)
SUGGESTED_AGENT_MODELS = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-3.8-flash",
    "gemini-4-argon",
]


def get_setting(db: Session, key: str) -> Optional[str]:
    row = db.get(AppSetting, key)
    return row.value if row else None


def set_setting(db: Session, key: str, value: str) -> None:
    row = db.get(AppSetting, key)
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=key, value=value))
    db.commit()


def get_agent_model(db: Session) -> str:
    return get_setting(db, AGENT_MODEL_KEY) or settings.GEMINI_AGENT_MODEL


def available_agent_models(db: Session) -> list[str]:
    models = [get_agent_model(db), settings.GEMINI_AGENT_MODEL, *SUGGESTED_AGENT_MODELS]
    return list(dict.fromkeys(m for m in models if m))

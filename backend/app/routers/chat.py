from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import ChatRequest, ChatResponse
from app.services.agent import run_agent_interaction

router = APIRouter(prefix="/api/chat", tags=["Chat & Agente Gemini"])


@router.post("", response_model=ChatResponse)
def chat_with_agent(payload: ChatRequest, db: Session = Depends(get_db)):
    return run_agent_interaction(
        db=db,
        user_message=payload.message,
        previous_interaction_id=payload.previous_interaction_id,
        model_override=payload.model,
        save_for_finetune=payload.save_for_finetune,
    )

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Conversation, ConversationMessage, utcnow
from app.schemas import (
    ChatRequest,
    ChatResponse,
    ConversationDetailOut,
    ConversationMessageOut,
    ConversationOut,
    ConversationRename,
)
from app.services.agent import run_agent_interaction
from app.services.app_settings_store import get_agent_model

router = APIRouter(prefix="/api/chat", tags=["Chat & Agente Gemini"])


def _title_from_message(text: str) -> str:
    clean = " ".join(text.split())
    return (clean[:57] + "...") if len(clean) > 60 else (clean or "Nova conversa")


def _conversation_out(conv: Conversation, message_count: int) -> ConversationOut:
    return ConversationOut(
        id=conv.id,
        title=conv.title,
        model=conv.model,
        agent_id=conv.agent_id,
        message_count=message_count,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
    )


def _get_conversation(db: Session, conversation_id: int) -> Conversation:
    conv = db.get(Conversation, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversa não encontrada")
    return conv


@router.post("", response_model=ChatResponse)
def chat_with_agent(payload: ChatRequest, db: Session = Depends(get_db)):
    if payload.conversation_id:
        conv = _get_conversation(db, payload.conversation_id)
        if payload.agent_id is not None:
            conv.agent_id = payload.agent_id
    else:
        conv = Conversation(
            title=_title_from_message(payload.message),
            agent_id=payload.agent_id,
        )
        db.add(conv)
        db.flush()

    db.add(ConversationMessage(conversation_id=conv.id, role="user", text=payload.message))
    db.commit()

    model = payload.model or get_agent_model(db)
    response = run_agent_interaction(
        db=db,
        user_message=payload.message,
        previous_interaction_id=conv.last_interaction_id or payload.previous_interaction_id,
        model_override=model,
        save_for_finetune=payload.save_for_finetune,
        agent_id=payload.agent_id or conv.agent_id,
    )

    db.add(
        ConversationMessage(
            conversation_id=conv.id,
            role="agent",
            text=response.reply,
            meta={
                "model": response.model,
                "agent_id": response.agent_id,
                "agent_name": response.agent_name,
                "tools": [t.model_dump() for t in response.tools_called],
                "rag_sources": response.rag_sources,
                "tokens": response.tokens_used,
                "latency_ms": response.latency_ms,
            },
        )
    )
    if response.interaction_id:
        conv.last_interaction_id = response.interaction_id
    if response.agent_id:
        conv.agent_id = response.agent_id
    conv.model = response.model
    conv.updated_at = utcnow()
    db.commit()

    response.conversation_id = conv.id
    return response


@router.get("/conversations", response_model=list[ConversationOut])
def list_conversations(db: Session = Depends(get_db)):
    counts = dict(
        db.query(ConversationMessage.conversation_id, func.count(ConversationMessage.id))
        .group_by(ConversationMessage.conversation_id)
        .all()
    )
    convs = db.query(Conversation).order_by(Conversation.updated_at.desc()).all()
    return [_conversation_out(c, counts.get(c.id, 0)) for c in convs]


@router.get("/conversations/{conversation_id}", response_model=ConversationDetailOut)
def get_conversation(conversation_id: int, db: Session = Depends(get_db)):
    conv = _get_conversation(db, conversation_id)
    base = _conversation_out(conv, len(conv.messages))
    return ConversationDetailOut(
        **base.model_dump(),
        last_interaction_id=conv.last_interaction_id,
        messages=[ConversationMessageOut.model_validate(m) for m in conv.messages],
    )


@router.patch("/conversations/{conversation_id}", response_model=ConversationOut)
def rename_conversation(conversation_id: int, payload: ConversationRename, db: Session = Depends(get_db)):
    conv = _get_conversation(db, conversation_id)
    conv.title = payload.title.strip()
    db.commit()
    db.refresh(conv)
    return _conversation_out(conv, len(conv.messages))


@router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: int, db: Session = Depends(get_db)):
    conv = _get_conversation(db, conversation_id)
    db.delete(conv)
    db.commit()
    return {"status": "deleted", "id": conversation_id}

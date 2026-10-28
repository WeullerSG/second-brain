from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import MemoryFact
from app.schemas import MemoryFactCreate, MemoryFactOut, MemoryFactUpdate
from app.services.embeddings import generate_embedding, search_memory_facts

router = APIRouter(prefix="/api/memories", tags=["Memória Core (Fatos)"])


def _to_out(fact: MemoryFact) -> MemoryFactOut:
    return MemoryFactOut(
        id=fact.id,
        category=fact.category,
        key=fact.key,
        content=fact.content,
        importance=fact.importance,
        source=fact.source,
        pinned=fact.pinned,
        has_embedding=bool(fact.embedding),
        created_at=fact.created_at,
        updated_at=fact.updated_at,
    )


@router.get("", response_model=list[MemoryFactOut])
def list_memories(
    category: Optional[str] = None,
    q: Optional[str] = None,
    db: Session = Depends(get_db),
):
    if q and q.strip():
        facts = search_memory_facts(db, query=q.strip(), top_k=20)
        if category:
            facts = [f for f in facts if f.category == category]
        return [_to_out(f) for f in facts]

    query = db.query(MemoryFact)
    if category:
        query = query.filter(MemoryFact.category == category)
    facts = query.order_by(
        MemoryFact.pinned.desc(),
        MemoryFact.importance.desc(),
        MemoryFact.updated_at.desc(),
    ).all()
    return [_to_out(f) for f in facts]


@router.post("", response_model=MemoryFactOut)
def create_memory(payload: MemoryFactCreate, db: Session = Depends(get_db)):
    emb = generate_embedding(
        f"[{payload.category}] {payload.key}: {payload.content}",
        db=db,
        operation="memory_embedding",
    )
    fact = MemoryFact(
        category=payload.category,
        key=payload.key,
        content=payload.content,
        importance=payload.importance,
        pinned=payload.pinned,
        source=payload.source,
        embedding=emb,
    )
    db.add(fact)
    db.commit()
    db.refresh(fact)
    return _to_out(fact)


@router.put("/{fact_id}", response_model=MemoryFactOut)
def update_memory(fact_id: int, payload: MemoryFactUpdate, db: Session = Depends(get_db)):
    fact = db.query(MemoryFact).filter(MemoryFact.id == fact_id).first()
    if not fact:
        raise HTTPException(status_code=404, detail="Memória não encontrada")

    reembed = False
    if payload.category is not None:
        fact.category = payload.category
        reembed = True
    if payload.key is not None:
        fact.key = payload.key
        reembed = True
    if payload.content is not None:
        fact.content = payload.content
        reembed = True
    if payload.importance is not None:
        fact.importance = payload.importance
    if payload.pinned is not None:
        fact.pinned = payload.pinned

    if reembed:
        new_emb = generate_embedding(
            f"[{fact.category}] {fact.key}: {fact.content}",
            db=db,
            operation="memory_reembed",
        )
        if new_emb:
            fact.embedding = new_emb

    db.commit()
    db.refresh(fact)
    return _to_out(fact)


@router.delete("/{fact_id}")
def delete_memory(fact_id: int, db: Session = Depends(get_db)):
    fact = db.query(MemoryFact).filter(MemoryFact.id == fact_id).first()
    if not fact:
        raise HTTPException(status_code=404, detail="Memória não encontrada")
    db.delete(fact)
    db.commit()
    return {"status": "deleted", "id": fact_id}

from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import DocumentChunk, DocumentFile
from app.routers.finances import sync_financial_documents_to_db
from app.services.embeddings import generate_embedding, hybrid_search_chunks
from app.services.ingestion import ingest_uploaded_file

router = APIRouter(prefix="/api/documents", tags=["Arquivos & RAG Vetorial"])


class ChunkUpdatePayload(BaseModel):
    content: str


@router.get("")
def list_documents(db: Session = Depends(get_db)):
    docs = db.query(DocumentFile).order_by(DocumentFile.created_at.desc()).all()
    return [
        {
            "id": d.id,
            "filename": d.filename,
            "mime_type": d.mime_type,
            "category": d.category,
            "size_bytes": d.size_bytes,
            "char_count": d.char_count,
            "chunk_count": d.chunk_count,
            "created_at": d.created_at,
        }
        for d in docs
    ]


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    category: str = Form("geral"),
    db: Session = Depends(get_db),
):
    doc = await ingest_uploaded_file(db=db, upload=file, category=category)
    finance_sync = sync_financial_documents_to_db(db=db, force_account_update=True)
    return {
        "id": doc.id,
        "filename": doc.filename,
        "category": doc.category,
        "size_bytes": doc.size_bytes,
        "char_count": doc.char_count,
        "chunk_count": doc.chunk_count,
        "created_at": doc.created_at,
        "finance_sync": finance_sync,
    }


@router.get("/search")
def search_rag(
    q: str,
    category: Optional[str] = None,
    top_k: int = 6,
    db: Session = Depends(get_db),
):
    return hybrid_search_chunks(db=db, query=q, top_k=top_k, category=category)


@router.get("/{doc_id}/chunks")
def get_document_chunks(doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(DocumentFile).filter(DocumentFile.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    chunks = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.document_id == doc_id)
        .order_by(DocumentChunk.chunk_index.asc())
        .all()
    )
    return {
        "document": {
            "id": doc.id,
            "filename": doc.filename,
            "category": doc.category,
            "size_bytes": doc.size_bytes,
            "chunk_count": doc.chunk_count,
        },
        "chunks": [
            {
                "id": c.id,
                "chunk_index": c.chunk_index,
                "content": c.content,
                "token_estimate": c.token_estimate,
                "has_embedding": bool(c.embedding),
                "embedding_dim": len(c.embedding) if c.embedding else 0,
            }
            for c in chunks
        ],
    }


@router.put("/chunks/{chunk_id}")
def update_chunk_content(
    chunk_id: int,
    payload: ChunkUpdatePayload,
    db: Session = Depends(get_db),
):
    """Permite editar diretamente um chunk da memória RAG e regerar seu embedding."""
    chunk = db.query(DocumentChunk).filter(DocumentChunk.id == chunk_id).first()
    if not chunk:
        raise HTTPException(status_code=404, detail="Chunk não encontrado")
    chunk.content = payload.content.strip()
    chunk.token_estimate = max(1, len(chunk.content) // 4)
    new_emb = generate_embedding(chunk.content, db=db, operation="chunk_reembed")
    if new_emb:
        chunk.embedding = new_emb
    db.commit()
    db.refresh(chunk)
    return {
        "id": chunk.id,
        "chunk_index": chunk.chunk_index,
        "content": chunk.content,
        "token_estimate": chunk.token_estimate,
        "has_embedding": bool(chunk.embedding),
    }


@router.delete("/{doc_id}")
def delete_document(doc_id: int, db: Session = Depends(get_db)):
    doc = db.query(DocumentFile).filter(DocumentFile.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Arquivo não encontrado")
    if doc.storage_path:
        try:
            p = Path(doc.storage_path)
            if p.exists():
                p.unlink()
        except Exception:
            pass
    db.delete(doc)
    db.commit()
    return {"status": "deleted", "id": doc_id}

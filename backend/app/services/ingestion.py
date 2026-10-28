import io
import time
from pathlib import Path
from fastapi import UploadFile
from pypdf import PdfReader
from sqlalchemy.orm import Session

from app.config import settings
from app.models import DocumentChunk, DocumentFile
from app.services.embeddings import generate_embedding


def extract_text_from_bytes(filename: str, mime_type: str, raw_bytes: bytes) -> str:
    """Extrai texto de arquivos PDF, TXT, Markdown, CSV ou JSON."""
    ext = Path(filename).suffix.lower()

    if ext == ".pdf" or "pdf" in (mime_type or "").lower():
        reader = PdfReader(io.BytesIO(raw_bytes))
        pages_text = []
        for idx, page in enumerate(reader.pages):
            page_txt = page.extract_text() or ""
            if page_txt.strip():
                pages_text.append(f"[Página {idx + 1}]\n{page_txt.strip()}")
        return "\n\n".join(pages_text)

    # Texto plano, Markdown, CSV, JSON, etc.
    for encoding in ("utf-8", "latin-1", "cp1252"):
        try:
            return raw_bytes.decode(encoding)
        except UnicodeDecodeError:
            continue
    return raw_bytes.decode("utf-8", errors="ignore")


def split_into_chunks(text: str, chunk_size: int = 900, overlap: int = 150) -> list[str]:
    """Divide texto em chunks com sobreposição preservando quebras de parágrafo quando possível."""
    cleaned = (text or "").replace("\r\n", "\n").strip()
    if not cleaned:
        return []

    if len(cleaned) <= chunk_size:
        return [cleaned]

    chunks: list[str] = []
    start = 0
    length = len(cleaned)

    while start < length:
        end = min(start + chunk_size, length)
        if end < length:
            # Tenta quebrar em parágrafo ou fim de frase
            break_pos = cleaned.rfind("\n\n", start, end)
            if break_pos == -1 or break_pos <= start + (chunk_size // 2):
                break_pos = cleaned.rfind(". ", start, end)
            if break_pos != -1 and break_pos > start + (chunk_size // 3):
                end = break_pos + 1

        piece = cleaned[start:end].strip()
        if piece:
            chunks.append(piece)

        if end >= length:
            break
        start = max(start + 1, end - overlap)

    return chunks


async def ingest_uploaded_file(
    db: Session,
    upload: UploadFile,
    category: str = "geral",
) -> DocumentFile:
    """
    Salva o arquivo enviado em disco, extrai o texto, divide em chunks,
    gera embeddings com `gemini-embedding-001` e persiste no banco.
    """
    raw_bytes = await upload.read()
    filename = upload.filename or f"documento_{int(time.time())}.txt"
    mime_type = upload.content_type or "text/plain"

    safe_name = f"{int(time.time())}_{Path(filename).name}"
    dest_path = settings.UPLOAD_DIR / safe_name
    dest_path.write_bytes(raw_bytes)

    extracted_text = extract_text_from_bytes(filename, mime_type, raw_bytes)
    text_chunks = split_into_chunks(extracted_text, chunk_size=900, overlap=150)

    doc = DocumentFile(
        filename=filename,
        mime_type=mime_type,
        category=category,
        size_bytes=len(raw_bytes),
        char_count=len(extracted_text),
        chunk_count=len(text_chunks),
        storage_path=str(dest_path),
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)

    for idx, chunk_text in enumerate(text_chunks):
        contextualized = f"Arquivo: {filename} ({category})\nTrecho {idx + 1}:\n{chunk_text}"
        emb = generate_embedding(contextualized, db=db, operation="rag_ingest")
        chunk_obj = DocumentChunk(
            document_id=doc.id,
            chunk_index=idx,
            content=chunk_text,
            token_estimate=max(1, len(chunk_text) // 4),
            embedding=emb,
        )
        db.add(chunk_obj)

    db.commit()
    db.refresh(doc)
    return doc

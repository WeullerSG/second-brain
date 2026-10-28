import math
import time
from typing import Optional
from google import genai
from sqlalchemy.orm import Session

from app.config import settings
from app.models import DocumentChunk, DocumentFile, MemoryFact, UsageLog


def get_genai_client() -> Optional[genai.Client]:
    key = (settings.GEMINI_API_KEY or "").strip()
    if not key or key == "sua_chave_gemini_aqui":
        return None
    try:
        return genai.Client(
            api_key=key,
            http_options={"timeout": 30000},  # 60s (ms): o agente com tools/contexto grande precisa de mais tempo
        )
    except Exception:
        try:
            return genai.Client(api_key=key)
        except Exception as exc:
            print(f"[GenAI Client Warning] Falha ao inicializar cliente: {exc}")
            return None


def generate_embedding(
    text_content: str,
    db: Optional[Session] = None,
    operation: str = "embedding",
) -> Optional[list[float]]:
    """
    Gera vetor de embedding usando o modelo oficial `gemini-embedding-001` via SDK `google-genai`.
    Registra telemetria na tabela UsageLog se uma sessão de banco for informada.
    """
    clean_text = (text_content or "").strip()
    if not clean_text:
        return None

    client = get_genai_client()
    if client is None:
        return None

    start_ts = time.perf_counter()
    try:
        response = client.models.embed_content(
            model=settings.GEMINI_EMBEDDING_MODEL,
            contents=clean_text,
        )
        latency_ms = int((time.perf_counter() - start_ts) * 1000)
        values = list(response.embeddings[0].values) if response.embeddings else None

        if db is not None and values:
            est_tokens = max(1, len(clean_text) // 4)
            log = UsageLog(
                model=settings.GEMINI_EMBEDDING_MODEL,
                operation=operation,
                input_tokens=est_tokens,
                output_tokens=0,
                total_tokens=est_tokens,
                tools_called=[],
                latency_ms=latency_ms,
                user_Preview=clean_text[:120],
            )
            db.add(log)
            db.commit()

        return values
    except Exception as exc:
        print(f"[Embedding Warning] Falha ao gerar embedding: {exc}")
        return None


def cosine_similarity(vec_a: Optional[list[float]], vec_b: Optional[list[float]]) -> float:
    if not vec_a or not vec_b or len(vec_a) != len(vec_b):
        return 0.0
    dot = sum(a * b for a, b in zip(vec_a, vec_b))
    norm_a = math.sqrt(sum(a * a for a in vec_a))
    norm_b = math.sqrt(sum(b * b for b in vec_b))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


def keyword_overlap_score(query: str, text_body: str) -> float:
    q_terms = {w.lower() for w in query.split() if len(w) > 2}
    if not q_terms:
        return 0.0
    body_lower = text_body.lower()
    matches = sum(1 for term in q_terms if term in body_lower)
    return matches / len(q_terms)


def hybrid_search_chunks(
    db: Session,
    query: str,
    top_k: int = 5,
    category: Optional[str] = None,
) -> list[dict]:
    """
    Executa Busca Híbrida (Semântica com `gemini-embedding-001` + Lexical por palavras-chave)
    sobre todos os chunks de documentos enviados pelo usuário.
    Otimizado: só chama a API de embeddings se realmente existirem chunks vetorizados no banco!
    """
    q = db.query(DocumentChunk, DocumentFile).join(
        DocumentFile, DocumentChunk.document_id == DocumentFile.id
    )
    if category:
        q = q.filter(DocumentFile.category == category)

    rows = q.all()
    if not rows:
        return []

    has_any_vector = any(bool(chunk.embedding) for chunk, _ in rows)
    query_vec = (
        generate_embedding(query, db=db, operation="rag_query_embedding")
        if has_any_vector
        else None
    )

    scored_results = []
    for chunk, doc in rows:
        sem_score = (
            cosine_similarity(query_vec, chunk.embedding)
            if query_vec and chunk.embedding
            else 0.0
        )
        kw_score = keyword_overlap_score(query, f"{doc.filename} {chunk.content}")
        final_score = (0.75 * sem_score + 0.25 * kw_score) if query_vec else kw_score

        if final_score > 0.05 or not query.strip():
            scored_results.append(
                {
                    "chunk_id": chunk.id,
                    "document_id": doc.id,
                    "filename": doc.filename,
                    "category": doc.category,
                    "chunk_index": chunk.chunk_index,
                    "content": chunk.content,
                    "semantic_score": round(sem_score, 4),
                    "keyword_score": round(kw_score, 4),
                    "score": round(final_score, 4),
                }
            )

    scored_results.sort(key=lambda item: item["score"], reverse=True)
    return scored_results[:top_k]


def search_memory_facts(
    db: Session,
    query: str,
    top_k: int = 8,
) -> list[MemoryFact]:
    """Busca fatos na Core Memory combinando importância, fixação e similaridade."""
    facts = db.query(MemoryFact).all()
    if not facts:
        return []

    has_any_vector = any(bool(f.embedding) for f in facts)
    query_vec = (
        generate_embedding(query, db=db, operation="memory_search_embedding")
        if has_any_vector
        else None
    )

    scored = []
    for fact in facts:
        text_repr = f"[{fact.category}] {fact.key}: {fact.content}"
        sem = (
            cosine_similarity(query_vec, fact.embedding)
            if query_vec and fact.embedding
            else 0.0
        )
        kw = keyword_overlap_score(query, text_repr)
        score = (0.65 * sem) + (0.25 * kw) + (0.02 * fact.importance)
        scored.append((score, fact))

    scored.sort(key=lambda x: x[0], reverse=True)
    return [f for _, f in scored[:top_k]]

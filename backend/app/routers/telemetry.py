from pathlib import Path
import psutil
from fastapi import APIRouter, Depends, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import BASE_DIR, settings
from app.database import IS_POSTGRES, get_db
from app.models import (
    AcademicTask,
    DocumentChunk,
    DocumentFile,
    FinanceAccount,
    FinanceRecord,
    FineTuneExample,
    MemoryFact,
    UsageLog,
)
from app.schemas import FineTuneExampleCreate, FineTuneExampleOut
from app.services.finetune import generate_finetune_jsonl

router = APIRouter(prefix="/api/telemetry", tags=["Monitoramento de Memória, Uso & Fine-Tune"])


@router.get("/overview")
def get_telemetry_overview(db: Session = Depends(get_db)):
    """
    Retorna métricas completas de:
    - Memória Core (quantidade de fatos, fatos com embedding, distribuição por categoria)
    - Arquivos enviados para o RAG (quantidade de arquivos, bytes totais, chunks indexados, tokens nos chunks)
    - Uso da API Gemini (total de chamadas, tokens de entrada/saída/total, latência média, logs recentes)
    - Saúde do Sistema/Servidor (uso de RAM do processo, RAM da máquina, CPU e tamanho do banco)
    """
    total_facts = db.query(func.count(MemoryFact.id)).scalar() or 0
    facts_list = db.query(MemoryFact).all()
    embedded_facts = sum(1 for f in facts_list if f.embedding)
    facts_chars = sum(len(f.content or "") + len(f.key or "") for f in facts_list)

    docs_list = db.query(DocumentFile).all()
    total_files = len(docs_list)
    total_files_bytes = sum(d.size_bytes or 0 for d in docs_list)
    total_files_chars = sum(d.char_count or 0 for d in docs_list)

    chunks_list = db.query(DocumentChunk).all()
    total_chunks = len(chunks_list)
    embedded_chunks = sum(1 for c in chunks_list if c.embedding)
    total_chunk_tokens = sum(c.token_estimate or 0 for c in chunks_list)

    total_accounts = db.query(func.count(FinanceAccount.id)).scalar() or 0
    total_finance_records = db.query(func.count(FinanceRecord.id)).scalar() or 0
    total_academic_tasks = db.query(func.count(AcademicTask.id)).scalar() or 0
    total_finetune_examples = db.query(func.count(FineTuneExample.id)).scalar() or 0

    usage_logs = db.query(UsageLog).order_by(UsageLog.created_at.desc()).limit(100).all()
    all_usage_count = db.query(func.count(UsageLog.id)).scalar() or 0
    total_input_tokens = db.query(func.sum(UsageLog.input_tokens)).scalar() or 0
    total_output_tokens = db.query(func.sum(UsageLog.output_tokens)).scalar() or 0
    total_tokens_all = db.query(func.sum(UsageLog.total_tokens)).scalar() or 0
    avg_latency_ms = int(db.query(func.avg(UsageLog.latency_ms)).scalar() or 0)

    # Estimativa de memória ocupada pelos vetores e textos (768 floats * 4 bytes ~ 3KB por vetor)
    vector_memory_bytes = (embedded_facts + embedded_chunks) * 768 * 4
    text_memory_bytes = facts_chars + total_files_chars
    total_memory_footprint_bytes = vector_memory_bytes + text_memory_bytes

    # Tamanho do banco SQLite em disco (se aplicável)
    db_file_path = BASE_DIR / "data" / "second_brain.db"
    db_disk_bytes = db_file_path.stat().st_size if db_file_path.exists() else total_memory_footprint_bytes

    # Métricas de RAM e CPU via psutil
    proc = psutil.Process()
    process_ram_mb = round(proc.memory_info().rss / (1024 * 1024), 2)
    vm = psutil.virtual_memory()

    return {
        "engine": {
            "database_backend": "PostgreSQL + pgvector" if IS_POSTGRES else "SQLite + Local Vector Engine",
            "agent_model": settings.GEMINI_AGENT_MODEL,
            "embedding_model": settings.GEMINI_EMBEDDING_MODEL,
            "api_key_configured": bool(
                settings.GEMINI_API_KEY and settings.GEMINI_API_KEY != "sua_chave_gemini_aqui"
            ),
        },
        "memory_stats": {
            "total_memory_facts": total_facts,
            "embedded_facts": embedded_facts,
            "total_files_uploaded": total_files,
            "total_files_bytes": total_files_bytes,
            "total_rag_chunks": total_chunks,
            "embedded_chunks": embedded_chunks,
            "total_chunk_tokens": total_chunk_tokens,
            "vector_memory_bytes": vector_memory_bytes,
            "text_memory_bytes": text_memory_bytes,
            "total_memory_footprint_bytes": total_memory_footprint_bytes,
            "db_disk_bytes": db_disk_bytes,
            "structured_records": {
                "finance_accounts": total_accounts,
                "finance_records": total_finance_records,
                "academic_tasks": total_academic_tasks,
                "finetune_examples": total_finetune_examples,
            },
        },
        "usage_stats": {
            "total_api_calls": all_usage_count,
            "total_input_tokens": int(total_input_tokens),
            "total_output_tokens": int(total_output_tokens),
            "total_tokens": int(total_tokens_all),
            "avg_latency_ms": avg_latency_ms,
            "recent_logs": [
                {
                    "id": u.id,
                    "model": u.model,
                    "operation": u.operation,
                    "input_tokens": u.input_tokens,
                    "output_tokens": u.output_tokens,
                    "total_tokens": u.total_tokens,
                    "tools_called": u.tools_called or [],
                    "latency_ms": u.latency_ms,
                    "preview": u.user_Preview,
                    "created_at": u.created_at,
                }
                for u in usage_logs[:25]
            ],
        },
        "system_health": {
            "process_ram_mb": process_ram_mb,
            "system_ram_percent": vm.percent,
            "system_ram_total_gb": round(vm.total / (1024**3), 2),
            "system_ram_used_gb": round(vm.used / (1024**3), 2),
        },
    }


@router.get("/finetune/examples", response_model=list[FineTuneExampleOut])
def list_finetune_examples(db: Session = Depends(get_db)):
    return db.query(FineTuneExample).order_by(FineTuneExample.created_at.desc()).all()


@router.post("/finetune/examples", response_model=FineTuneExampleOut)
def create_finetune_example(payload: FineTuneExampleCreate, db: Session = Depends(get_db)):
    ex = FineTuneExample(**payload.model_dump())
    db.add(ex)
    db.commit()
    db.refresh(ex)
    return ex


@router.delete("/finetune/examples/{example_id}")
def delete_finetune_example(example_id: int, db: Session = Depends(get_db)):
    ex = db.query(FineTuneExample).filter(FineTuneExample.id == example_id).first()
    if ex:
        db.delete(ex)
        db.commit()
    return {"status": "deleted", "id": example_id}


@router.get("/finetune/export.jsonl")
def export_finetune_dataset(db: Session = Depends(get_db)):
    jsonl_content = generate_finetune_jsonl(db, include_synthetic_from_memory=True)
    return Response(
        content=jsonl_content,
        media_type="application/x-ndjson",
        headers={
            "Content-Disposition": 'attachment; filename="second_brain_gemini_finetune.jsonl"'
        },
    )

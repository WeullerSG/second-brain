from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import SessionLocal, init_db
from app.services.auth import get_user_by_token, token_from_header
from app.models import (
    AcademicTask,
    FinanceAccount,
    FinanceRecord,
    FineTuneExample,
    MemoryFact,
    ScheduleNotification,
)
from app.routers import academic, app_settings, auth as auth_router, chat, documents, finances, memories, notifications, telemetry


# Dados de exemplo antigos (versões anteriores populavam o banco com eles sempre que
# uma tabela ficava vazia). Só removemos linhas idênticas às de exemplo, então o que
# o usuário editou ou cadastrou nunca é apagado.
DEMO_MEMORY_KEYS = {
    "Perfil Principal": "Weuller é estudante universitário e desenvolvedor. Usa o Second Brain AI para controlar finanças, cartões e prazos da faculdade.",
    "Regra de Orçamento Mensal": "Meta de manter gastos variáveis no cartão de crédito abaixo de R$ 1.800,00 por mês e reservar pelo menos 20% da renda.",
    "Rotina de Estudos": "Revisar disciplinas técnicas e projetos de IA/RAG toda noite às 20h e priorizar entregas com prazo inferior a 5 dias.",
}
DEMO_MEMORY_KEY_PREFIXES = ("Fatura Cartão Nubank - Setembro/Outubro (Histórico)",)
DEMO_ACCOUNTS = {("Nubank (Conta + Cartão)", 2450.0), ("Itaú Conta Corrente", 1820.5)}
DEMO_RECORDS = {
    ("Fatura Cartão Nubank", 945.80),
    ("Internet Fibra + Energia", 265.00),
    ("Bolsa / Receita Mensal", 3800.00),
}
DEMO_TASK_TITLES = {
    "Projeto Prático: Agente RAG com Memória Vetorial",
    "Prova P2 - Índices Vetoriais (HNSW / IVFFlat) e Otimização",
}
DEMO_NOTIFICATION_TITLES = {
    "Aula: Inteligência Artificial & NLP",
    "Aula: Banco de Dados II",
    "Aula: Engenharia de Software & Arquitetura",
    "Entrevista Técnica - Desenvolvedor Fullstack & IA",
}
DEMO_FINETUNE_INPUT = "Resumo rápido do meu dia: como estão minhas contas e faculdade?"


def remove_demo_data() -> None:
    """Remove os dados de exemplo que versões antigas inseriam automaticamente."""
    db = SessionLocal()
    try:
        for fact in db.query(MemoryFact).all():
            if DEMO_MEMORY_KEYS.get(fact.key) == fact.content or fact.key in DEMO_MEMORY_KEY_PREFIXES:
                db.delete(fact)
        for acc in db.query(FinanceAccount).all():
            if (acc.name, round(acc.balance or 0, 2)) in DEMO_ACCOUNTS:
                db.delete(acc)
        for rec in db.query(FinanceRecord).all():
            if (rec.title, round(rec.amount or 0, 2)) in DEMO_RECORDS:
                db.delete(rec)
        for task in db.query(AcademicTask).filter(AcademicTask.title.in_(DEMO_TASK_TITLES)).all():
            db.delete(task)
        for notif in db.query(ScheduleNotification).filter(
            ScheduleNotification.title.in_(DEMO_NOTIFICATION_TITLES)
        ).all():
            db.delete(notif)
        for ex in db.query(FineTuneExample).filter(
            FineTuneExample.user_input == DEMO_FINETUNE_INPUT,
            FineTuneExample.category == "assistant_style",
        ).all():
            db.delete(ex)
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    remove_demo_data()
    yield


app = FastAPI(
    title="Second Brain AI API",
    description="Backend Híbrido (Agentic Gemini + SQL + RAG Vetorial + Telemetria de Memória & Fine-Tune)",
    version="1.0.0",
    lifespan=lifespan,
)

# Rotas da API que funcionam sem login
PUBLIC_API_PATHS = {"/api/health", "/api/auth/status", "/api/auth/setup", "/api/auth/login", "/api/auth/logout"}


@app.middleware("http")
async def require_login(request: Request, call_next):
    """Bloqueia toda a API para quem não estiver logado."""
    path = request.url.path
    if request.method == "OPTIONS" or not path.startswith("/api/") or path in PUBLIC_API_PATHS:
        return await call_next(request)
    db = SessionLocal()
    try:
        user = get_user_by_token(db, token_from_header(request.headers.get("authorization")))
    finally:
        db.close()
    if user is None:
        return JSONResponse(status_code=401, content={"detail": "Login necessário."})
    request.state.user_id = user.id
    return await call_next(request)


# Adicionado depois do require_login para ficar por fora (respostas 401 também levam os cabeçalhos CORS)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(chat.router)
app.include_router(memories.router)
app.include_router(finances.router)
app.include_router(academic.router)
app.include_router(documents.router)
app.include_router(notifications.router)
app.include_router(telemetry.router)
app.include_router(app_settings.router)


@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "service": "second-brain-ai",
    }

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import SessionLocal, init_db
from app.models import (
    AcademicTask,
    FinanceAccount,
    FinanceRecord,
    FineTuneExample,
    MemoryFact,
    ScheduleNotification,
)
from app.routers import academic, chat, documents, finances, memories, notifications, telemetry


def seed_initial_data() -> None:
    """Popula dados iniciais de exemplo caso o banco esteja vazio."""
    db = SessionLocal()
    try:
        if db.query(MemoryFact).count() == 0:
            db.add_all(
                [
                    MemoryFact(
                        category="pessoal",
                        key="Perfil Principal",
                        content="Weuller é estudante universitário e desenvolvedor. Usa o Second Brain AI para controlar finanças, cartões e prazos da faculdade.",
                        importance=5,
                        source="user",
                        pinned=True,
                    ),
                    MemoryFact(
                        category="financas",
                        key="Regra de Orçamento Mensal",
                        content="Meta de manter gastos variáveis no cartão de crédito abaixo de R$ 1.800,00 por mês e reservar pelo menos 20% da renda.",
                        importance=5,
                        source="user",
                        pinned=True,
                    ),
                    MemoryFact(
                        category="financas",
                        key="Fatura Cartão Nubank - Setembro/Outubro (Histórico)",
                        content=(
                            "04/10 iFood Delivery - R$ 68,90\n"
                            "08/10 Uber *Trip Faculdade - R$ 34,50\n"
                            "12/10 Amazon Prime & Livros - R$ 119,90\n"
                            "16/10 Supermercado Verdemar - R$ 412,30\n"
                            "21/10 Drogaria Araujo - R$ 89,40\n"
                            "25/10 Spotify Student - R$ 11,90"
                        ),
                        importance=4,
                        source="user",
                        pinned=True,
                    ),
                    MemoryFact(
                        category="faculdade",
                        key="Rotina de Estudos",
                        content="Revisar disciplinas técnicas e projetos de IA/RAG toda noite às 20h e priorizar entregas com prazo inferior a 5 dias.",
                        importance=4,
                        source="user",
                        pinned=True,
                    ),
                ]
            )

        if db.query(FinanceAccount).count() == 0:
            db.add_all(
                [
                    FinanceAccount(
                        name="Nubank (Conta + Cartão)",
                        account_type="checking",
                        balance=2450.00,
                        credit_limit=4500.00,
                        closing_day=3,
                        due_day=10,
                    ),
                    FinanceAccount(
                        name="Itaú Conta Corrente",
                        account_type="checking",
                        balance=1820.50,
                        credit_limit=3000.00,
                        closing_day=18,
                        due_day=25,
                    ),
                ]
            )

        if db.query(FinanceRecord).count() == 0:
            db.add_all(
                [
                    FinanceRecord(
                        title="Fatura Cartão Nubank",
                        category="cartao",
                        record_type="card_bill",
                        amount=945.80,
                        account_name="Nubank (Conta + Cartão)",
                        due_date="2026-11-10",
                        status="pending",
                        notes="Inclui assinaturas, mercado e transporte",
                    ),
                    FinanceRecord(
                        title="Internet Fibra + Energia",
                        category="moradia",
                        record_type="expense",
                        amount=265.00,
                        account_name="Itaú Conta Corrente",
                        due_date="2026-11-05",
                        status="pending",
                        notes="Contas fixas mensais",
                    ),
                    FinanceRecord(
                        title="Bolsa / Receita Mensal",
                        category="salario",
                        record_type="income",
                        amount=3800.00,
                        account_name="Itaú Conta Corrente",
                        due_date="2026-10-05",
                        status="paid",
                        notes="Entrada mensal confirmada",
                    ),
                ]
            )

        if db.query(AcademicTask).count() == 0:
            db.add_all(
                [
                    AcademicTask(
                        subject="Inteligência Artificial & NLP",
                        title="Projeto Prático: Agente RAG com Memória Vetorial",
                        task_type="project",
                        due_date="2026-11-12",
                        status="in_progress",
                        priority="critical",
                        grade_weight=10.0,
                        notes="Entregar código + apresentação da arquitetura híbrida",
                    ),
                    AcademicTask(
                        subject="Banco de Dados II",
                        title="Prova P2 - Índices Vetoriais (HNSW / IVFFlat) e Otimização",
                        task_type="exam",
                        due_date="2026-11-18",
                        status="todo",
                        priority="high",
                        grade_weight=10.0,
                        notes="Estudar pgvector, planos de execução EXPLAIN ANALYZE e transações",
                    ),
                ]
            )

        if db.query(FineTuneExample).count() == 0:
            db.add(
                FineTuneExample(
                    category="assistant_style",
                    system_instruction="Você é o Second Brain AI, assistente pessoal financeiro e acadêmico do Weuller.",
                    user_input="Resumo rápido do meu dia: como estão minhas contas e faculdade?",
                    ideal_output=(
                        "### 📊 Resumo do Seu Dia\n\n"
                        "- **Saldo Disponível**: R$ 4.270,50 somando Nubank e Itaú.\n"
                        "- **Próximos Vencimentos**: Internet + Energia (R$ 265,00 em 05/11) e Fatura Nubank (R$ 945,80 em 10/11).\n"
                        "- **Prioridade da Faculdade**: Finalizar o *Projeto Prático de Agente RAG* até 12/11."
                    ),
                    approved=True,
                )
            )

        if db.query(ScheduleNotification).count() == 0:
            db.add_all(
                [
                    ScheduleNotification(
                        title="Aula: Inteligência Artificial & NLP",
                        message="Hoje você tem aula de Inteligência Artificial & NLP às 19:00 (Sala 302).",
                        category="aula",
                        schedule_type="recurring_weekly",
                        days_of_week="mon,wed",
                        notify_time="19:00",
                        remind_minutes_before=30,
                        location_or_link="Bloco B - Sala 302",
                        enabled=True,
                    ),
                    ScheduleNotification(
                        title="Aula: Banco de Dados II",
                        message="Hoje é dia de Banco de Dados II às 19:00. Revise índices pgvector!",
                        category="aula",
                        schedule_type="recurring_weekly",
                        days_of_week="tue,thu",
                        notify_time="19:00",
                        remind_minutes_before=30,
                        location_or_link="Laboratório 4",
                        enabled=True,
                    ),
                    ScheduleNotification(
                        title="Aula: Engenharia de Software & Arquitetura",
                        message="Sexta-feira: Aula de Engenharia de Software às 19:00.",
                        category="aula",
                        schedule_type="recurring_weekly",
                        days_of_week="fri",
                        notify_time="19:00",
                        remind_minutes_before=30,
                        location_or_link="Sala 205",
                        enabled=True,
                    ),
                    ScheduleNotification(
                        title="Entrevista Técnica - Desenvolvedor Fullstack & IA",
                        message="Lembrete: Sua entrevista técnica começa em 30 minutos! Confira microfone e câmera.",
                        category="entrevista",
                        schedule_type="one_time",
                        target_date="2026-11-04",
                        notify_time="14:30",
                        remind_minutes_before=30,
                        location_or_link="Google Meet",
                        enabled=True,
                    ),
                ]
            )

        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    seed_initial_data()
    yield


app = FastAPI(
    title="Second Brain AI API",
    description="Backend Híbrido (Agentic Gemini + SQL + RAG Vetorial + Telemetria de Memória & Fine-Tune)",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router)
app.include_router(memories.router)
app.include_router(finances.router)
app.include_router(academic.router)
app.include_router(documents.router)
app.include_router(notifications.router)
app.include_router(telemetry.router)


@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "service": "second-brain-ai",
        "agent_model": settings.GEMINI_AGENT_MODEL,
        "embedding_model": settings.GEMINI_EMBEDDING_MODEL,
    }

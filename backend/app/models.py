from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import relationship
from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class MemoryFact(Base):
    """
    Core Memory (Memória Episódica / Fatos sobre o Usuário):
    Armazena fatos importantes, preferências, regras financeiras, rotinas e lembretes
    que são injetados no contexto do Gemini e editáveis pelo painel.
    """
    __tablename__ = "memory_facts"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(64), index=True, default="geral")  # financas, faculdade, pessoal, preferencia, meta
    key = Column(String(140), index=True, nullable=False)
    content = Column(Text, nullable=False)
    importance = Column(Integer, default=3)  # 1 (baixa) a 5 (crítica)
    source = Column(String(64), default="user")  # user | agent_auto
    pinned = Column(Boolean, default=True)
    embedding = Column(JSON, nullable=True)  # Vetor de embedding para busca semântica de memórias
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class FinanceAccount(Base):
    """
    Saldos de Contas Bancárias e Cartões de Crédito.
    """
    __tablename__ = "finance_accounts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)  # Ex: "Nubank", "Itaú Conta Corrente", "Inter"
    account_type = Column(String(50), default="checking")  # checking (conta), credit_card (cartão), investment
    balance = Column(Float, default=0.0)  # Saldo atual da conta
    credit_limit = Column(Float, default=0.0)  # Limite do cartão (se aplicável)
    closing_day = Column(Integer, nullable=True)  # Dia de fechamento da fatura
    due_day = Column(Integer, nullable=True)  # Dia de vencimento da fatura
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class FinanceRecord(Base):
    """
    Lançamentos Financeiros: Contas de cartão, despesas avulsas, receitas, faturas.
    """
    __tablename__ = "finance_records"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(160), nullable=False)  # Ex: "Fatura Cartão Nubank", "Mercado Livre", "Salário"
    category = Column(String(80), default="outros")  # cartao, moradia, alimentacao, faculdade, lazer, salario
    record_type = Column(String(32), default="expense")  # expense | income | card_bill
    amount = Column(Float, nullable=False)
    account_name = Column(String(100), default="Principal")  # Ex: "Nubank", "Itaú"
    due_date = Column(String(32), nullable=True)  # YYYY-MM-DD
    status = Column(String(32), default="pending")  # pending | paid
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)


class AcademicTask(Base):
    """
    Atividades da Faculdade: Provas, Trabalhos, Listas de Exercícios, Leituras e Prazos.
    """
    __tablename__ = "academic_tasks"

    id = Column(Integer, primary_key=True, index=True)
    subject = Column(String(120), nullable=False, index=True)  # Ex: "Estrutura de Dados", "IA", "Cálculo II"
    title = Column(String(200), nullable=False)  # Ex: "Trabalho Prático 1 - Árvores AVL"
    task_type = Column(String(50), default="assignment")  # exam (prova), assignment (trabalho), project, reading
    due_date = Column(String(32), nullable=True)  # YYYY-MM-DD HH:MM
    status = Column(String(32), default="todo")  # todo | in_progress | done
    priority = Column(String(32), default="medium")  # low | medium | high | critical
    grade_weight = Column(Float, nullable=True)  # Peso ou valor da nota (ex: 10.0)
    grade_obtained = Column(Float, nullable=True)  # Nota obtida
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)


class DocumentFile(Base):
    """
    Arquivos enviados pelo usuário para o RAG (PDFs de faturas, apostilas da faculdade, notas, CSVs).
    Permite monitorar quantos arquivos foram enviados, tamanho em bytes e quantidade de chunks.
    """
    __tablename__ = "document_files"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), nullable=False)
    mime_type = Column(String(120), default="text/plain")
    category = Column(String(64), default="geral")  # financas, faculdade, pessoal, documento
    size_bytes = Column(Integer, default=0)
    char_count = Column(Integer, default=0)
    chunk_count = Column(Integer, default=0)
    storage_path = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=utcnow)

    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")


class DocumentChunk(Base):
    """
    Chunks vetorizados dos documentos enviados para busca RAG (Semântica + Palavra-chave).
    """
    __tablename__ = "document_chunks"

    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("document_files.id", ondelete="CASCADE"), nullable=False, index=True)
    chunk_index = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    token_estimate = Column(Integer, default=0)
    embedding = Column(JSON, nullable=True)  # Lista de floats (ex: 768 dimensões do gemini-embedding-001)
    created_at = Column(DateTime, default=utcnow)

    document = relationship("DocumentFile", back_populates="chunks")


class UsageLog(Base):
    """
    Histórico de uso da API Gemini, tokens gastos, ferramentas acionadas e latência.
    """
    __tablename__ = "usage_logs"

    id = Column(Integer, primary_key=True, index=True)
    interaction_id = Column(String(120), nullable=True)
    model = Column(String(80), nullable=False)
    operation = Column(String(64), default="chat_agent")  # chat_agent | embedding | rag_ingest
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)
    tools_called = Column(JSON, default=list)
    latency_ms = Column(Integer, default=0)
    user_Preview = Column(String(240), nullable=True)
    created_at = Column(DateTime, default=utcnow)


class FineTuneExample(Base):
    """
    Dataset curado pelo usuário para Supervised Fine-Tuning (SFT) no Gemini.
    Guarda pares (system_instruction, user_prompt, ideal_model_response) para exportar em JSONL.
    """
    __tablename__ = "finetune_examples"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(64), default="assistant_style")
    system_instruction = Column(Text, nullable=False)
    user_input = Column(Text, nullable=False)
    ideal_output = Column(Text, nullable=False)
    approved = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)


class ScheduleNotification(Base):
    """
    Agenda & Notificações Inteligentes:
    Suporta grade semanal de aulas (segunda a sexta), entrevistas em data/hora específica,
    lembretes de faturas e alertas diários configurados pelo usuário ou pelo Agente Gemini.
    """
    __tablename__ = "schedule_notifications"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(180), nullable=False)  # Ex: "Aula: Inteligência Artificial", "Entrevista Backend"
    message = Column(Text, nullable=False)  # Texto enviado na notificação Push/PWA
    category = Column(String(50), default="aula")  # aula | entrevista | financas | faculdade | pessoal
    schedule_type = Column(String(32), default="recurring_weekly")  # recurring_weekly | one_time | daily
    days_of_week = Column(String(64), nullable=True)  # Ex: "mon,wed" ou "mon,tue,wed,thu,fri"
    target_date = Column(String(32), nullable=True)  # YYYY-MM-DD (para entrevistas / eventos únicos)
    notify_time = Column(String(16), nullable=False, default="08:00")  # HH:MM (ex: "07:30", "18:30")
    remind_minutes_before = Column(Integer, default=15)  # Quantos minutos antes avisar (0 = na hora exata)
    # Vários avisos, em minutos antes do evento (ex: [1440, 60, 0] = 1 dia antes, 1h antes e na hora).
    # Quando vazio, vale só remind_minutes_before.
    reminder_offsets = Column(JSON, nullable=True)
    location_or_link = Column(String(240), nullable=True)  # Sala de aula, link do Google Meet/Teams, etc.
    enabled = Column(Boolean, default=True)
    last_triggered_at = Column(String(40), nullable=True)
    created_at = Column(DateTime, default=utcnow)



class Conversation(Base):
    """Conversa salva com o agente (lista de mensagens que pode ser reaberta ou excluída)."""
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(160), nullable=False, default="Nova conversa")
    model = Column(String(80), nullable=True)
    agent_id = Column(Integer, ForeignKey("agent_profiles.id", ondelete="SET NULL"), nullable=True, index=True)
    last_interaction_id = Column(String(160), nullable=True)  # continua o contexto no Gemini
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    messages = relationship(
        "ConversationMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="ConversationMessage.id",
    )


class ConversationMessage(Base):
    __tablename__ = "conversation_messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(16), nullable=False)  # user | agent
    text = Column(Text, nullable=False)
    meta = Column(JSON, nullable=True)  # modelo, tools, fontes RAG, tokens, latência
    created_at = Column(DateTime, default=utcnow)

    conversation = relationship("Conversation", back_populates="messages")


class AgentProfile(Base):
    """
    Perfis de Agentes IA gerenciáveis pelo usuário (Orquestrador, Personal Trainer / SmartWorkout Coach,
    Consultor Financeiro, Tutor Acadêmico e agentes customizados).
    """
    __tablename__ = "agent_profiles"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(80), unique=True, index=True, nullable=False)
    name = Column(String(120), nullable=False)
    role = Column(String(160), nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String(50), index=True, default="geral")  # treino | geral | financas | faculdade | personalizado
    avatar_icon = Column(String(40), default="bot")  # dumbbell | brain | wallet | graduation | bot | flame | sparkles
    accent_color = Column(String(32), default="#3454d1")
    model = Column(String(80), nullable=True)  # Se vazio/null, usa o modelo padrão do sistema
    system_prompt = Column(Text, nullable=False)
    tools_enabled = Column(JSON, default=list)  # Lista de nomes das tools habilitadas
    quick_prompts = Column(JSON, default=list)  # Sugestões de comandos rápidos para este agente
    is_default = Column(Boolean, default=False)
    is_system = Column(Boolean, default=False)
    enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class WorkoutExercise(Base):
    """
    Biblioteca de Exercícios inspirada no SmartWorkout (https://smartworkout.app/pt/biblioteca-de-exercicios).
    Catalogado por grupo muscular, equipamento, mecânica e instruções de execução.
    """
    __tablename__ = "workout_exercises"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(120), unique=True, index=True, nullable=False)
    name = Column(String(160), nullable=False, index=True)
    muscle_group = Column(String(60), index=True, nullable=False)  # Peito, Costas, Pernas, Glúteos, Ombros, Bíceps, Tríceps, Antebraço, Abdômen, Cardio
    secondary_muscles = Column(String(160), nullable=True)
    equipment = Column(String(60), index=True, nullable=False)  # Barra, Halteres, Máquina, Polia / Cabo, Peso Corporal, Smith, Kettlebell, Barra W
    difficulty = Column(String(32), default="Intermediário")  # Iniciante | Intermediário | Avançado
    mechanic = Column(String(32), default="Composto")  # Composto | Isolado
    instructions = Column(Text, nullable=False)
    common_mistakes = Column(Text, nullable=True)
    video_url = Column(String(300), nullable=True)
    is_custom = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow)


class WorkoutPlan(Base):
    """
    Fichas / Rotinas de Treino (criadas pelo Agente de Treinos ou pelo Usuário).
    """
    __tablename__ = "workout_plans"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(160), nullable=False)
    split_label = Column(String(60), default="ABC")  # ABC | ABCD | Push/Pull/Legs | Upper/Lower | Full Body
    target_muscles = Column(String(160), nullable=False)
    goal = Column(String(80), default="Hipertrofia")  # Hipertrofia | Força | Definição | Condicionamento
    scheduled_days = Column(String(80), nullable=True)  # Ex: "Seg, Qui" ou "mon,thu"
    estimated_duration_min = Column(Integer, default=60)
    created_by_agent = Column(String(120), default="SmartWorkout Coach IA")
    notes = Column(Text, nullable=True)
    exercises = Column(JSON, default=list)  # Lista de exercícios prescritos com séries, reps, carga alvo, descanso, RIR
    active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class WorkoutSession(Base):
    """
    Diário de Treinos Realizados: registra os dias em que o usuário treinou,
    quantos exercícios fez, séries, repetições e as cargas (kg) que pegou.
    """
    __tablename__ = "workout_sessions"

    id = Column(Integer, primary_key=True, index=True)
    session_date = Column(String(32), index=True, nullable=False)  # YYYY-MM-DD
    title = Column(String(160), nullable=False)
    plan_id = Column(Integer, ForeignKey("workout_plans.id", ondelete="SET NULL"), nullable=True, index=True)
    muscle_groups = Column(String(160), nullable=True)
    duration_minutes = Column(Integer, default=60)
    perceived_effort = Column(Integer, default=8)  # RPE 1..10
    exercises_count = Column(Integer, default=0)
    total_sets = Column(Integer, default=0)
    total_reps = Column(Integer, default=0)
    total_volume_kg = Column(Float, default=0.0)
    max_weight_kg = Column(Float, default=0.0)
    exercises_performed = Column(JSON, default=list)  # Lista detalhada de exercícios e cargas de cada série
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)


class AppSetting(Base):
    """Configurações simples do app guardadas como chave/valor (ex: modelo do agente)."""
    __tablename__ = "app_settings"

    key = Column(String(80), primary_key=True)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)


class User(Base):
    """Usuário do app (login). O app é pessoal: só existe um."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(60), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime, default=utcnow)


class AuthSession(Base):
    """Sessão de login (guarda só o hash do token)."""
    __tablename__ = "auth_sessions"

    token_hash = Column(String(64), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    expires_at = Column(DateTime(timezone=True), nullable=False)

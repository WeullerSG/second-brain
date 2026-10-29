from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field


# --- Memory Facts (Core Memory) ---
class MemoryFactCreate(BaseModel):
    category: str = Field(default="geral", description="Categoria: financas, faculdade, pessoal, preferencia, meta")
    key: str = Field(..., description="Título curto ou chave do fato")
    content: str = Field(..., description="Conteúdo detalhado da memória")
    importance: int = Field(default=3, ge=1, le=5)
    pinned: bool = Field(default=True)
    source: str = Field(default="user")


class MemoryFactUpdate(BaseModel):
    category: Optional[str] = None
    key: Optional[str] = None
    content: Optional[str] = None
    importance: Optional[int] = Field(default=None, ge=1, le=5)
    pinned: Optional[bool] = None


class MemoryFactOut(BaseModel):
    id: int
    category: str
    key: str
    content: str
    importance: int
    source: str
    pinned: bool
    has_embedding: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Finance Accounts & Records ---
class FinanceAccountUpsert(BaseModel):
    name: str
    account_type: str = "checking"  # checking | credit_card | investment
    balance: float = 0.0
    credit_limit: float = 0.0
    closing_day: Optional[int] = None
    due_day: Optional[int] = None


class FinanceAccountOut(FinanceAccountUpsert):
    id: int
    updated_at: datetime

    model_config = {"from_attributes": True}


class FinanceRecordCreate(BaseModel):
    title: str
    category: str = "outros"
    record_type: str = "expense"  # expense | income | card_bill
    amount: float
    account_name: str = "Principal"
    due_date: Optional[str] = None
    status: str = "pending"  # pending | paid
    notes: Optional[str] = None


class FinanceRecordUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    record_type: Optional[str] = None
    amount: Optional[float] = None
    account_name: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class FinanceRecordOut(FinanceRecordCreate):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


class InstallmentCreate(BaseModel):
    title: str
    installment_amount: float
    current_installment: int = Field(default=1, ge=1)
    total_installments: int = Field(default=2, ge=1)
    account_name: str = "Cartão Mercado Pago Visa"
    category: str = "parcelado"
    first_due_date: Optional[str] = None
    current_month_paid: bool = False
    notes: Optional[str] = None


class InstallmentGroupUpdate(BaseModel):
    """Edita todas as parcelas de um parcelamento/financiamento de uma vez."""
    record_ids: list[int]
    title: Optional[str] = None
    installment_amount: Optional[float] = Field(default=None, gt=0)
    account_name: Optional[str] = None


class InstallmentGroupDelete(BaseModel):
    record_ids: list[int]


class SalaryUpdatePayload(BaseModel):
    monthly_salary: float = Field(..., gt=0)
    account_name: str = "Conta PicPay"
    pay_day: int = Field(default=6, ge=1, le=31)



# --- Academic Tasks ---
class AcademicTaskCreate(BaseModel):
    subject: str
    title: str
    task_type: str = "assignment"  # exam | assignment | project | reading
    due_date: Optional[str] = None
    status: str = "todo"  # todo | in_progress | done
    priority: str = "medium"  # low | medium | high | critical
    grade_weight: Optional[float] = None
    grade_obtained: Optional[float] = None
    notes: Optional[str] = None


class AcademicTaskUpdate(BaseModel):
    subject: Optional[str] = None
    title: Optional[str] = None
    task_type: Optional[str] = None
    due_date: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    grade_weight: Optional[float] = None
    grade_obtained: Optional[float] = None
    notes: Optional[str] = None


class AcademicTaskOut(AcademicTaskCreate):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Chat / Agent ---
class ChatRequest(BaseModel):
    message: str
    previous_interaction_id: Optional[str] = None
    model: Optional[str] = None
    save_for_finetune: bool = False
    conversation_id: Optional[int] = None
    agent_id: Optional[int] = None


class ToolCallTrace(BaseModel):
    name: str
    arguments: dict[str, Any]
    result_summary: str


class ChatResponse(BaseModel):
    interaction_id: Optional[str]
    reply: str
    model: str
    tools_called: list[ToolCallTrace] = []
    rag_sources: list[dict[str, Any]] = []
    tokens_used: int = 0
    latency_ms: int = 0
    conversation_id: Optional[int] = None
    agent_id: Optional[int] = None
    agent_name: Optional[str] = None


# --- Conversas salvas do chat ---
class ConversationOut(BaseModel):
    id: int
    title: str
    model: Optional[str] = None
    agent_id: Optional[int] = None
    message_count: int = 0
    created_at: datetime
    updated_at: datetime


class ConversationMessageOut(BaseModel):
    id: int
    role: str
    text: str
    meta: Optional[dict[str, Any]] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationDetailOut(ConversationOut):
    last_interaction_id: Optional[str] = None
    messages: list[ConversationMessageOut] = []


class ConversationRename(BaseModel):
    title: str = Field(..., min_length=1, max_length=160)


# --- Configurações do app ---
class AppSettingsOut(BaseModel):
    agent_model: str
    available_models: list[str]


class AppSettingsUpdate(BaseModel):
    agent_model: str = Field(..., min_length=1, max_length=80)


# --- Fine-Tune Dataset ---
class FineTuneExampleCreate(BaseModel):
    category: str = "assistant_style"
    system_instruction: str = "Você é o Second Brain AI, assistente pessoal financeiro e acadêmico do Weuller."
    user_input: str
    ideal_output: str
    approved: bool = True


class FineTuneExampleOut(FineTuneExampleCreate):
    id: int
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Agenda & Notificações ---
class ScheduleNotificationCreate(BaseModel):
    title: str
    message: str
    category: str = "aula"  # aula | entrevista | financas | faculdade | pessoal
    schedule_type: str = "recurring_weekly"  # recurring_weekly | one_time | daily
    days_of_week: Optional[str] = None  # "mon,tue,wed,thu,fri"
    target_date: Optional[str] = None  # "YYYY-MM-DD"
    notify_time: str = "08:00"  # "HH:MM"
    remind_minutes_before: int = Field(default=15, ge=0)
    reminder_offsets: Optional[list[int]] = None  # minutos antes de cada aviso
    location_or_link: Optional[str] = None
    enabled: bool = True


class ScheduleNotificationUpdate(BaseModel):
    title: Optional[str] = None
    message: Optional[str] = None
    category: Optional[str] = None
    schedule_type: Optional[str] = None
    days_of_week: Optional[str] = None
    target_date: Optional[str] = None
    notify_time: Optional[str] = None
    remind_minutes_before: Optional[int] = Field(default=None, ge=0)
    reminder_offsets: Optional[list[int]] = None
    location_or_link: Optional[str] = None
    enabled: Optional[bool] = None
    last_triggered_at: Optional[str] = None


class ScheduleNotificationOut(ScheduleNotificationCreate):
    id: int
    last_triggered_at: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Gerenciador de Agentes IA ---
class AgentProfileCreate(BaseModel):
    slug: Optional[str] = None
    name: str
    role: str
    description: str
    category: str = "personalizado"  # treino | geral | financas | faculdade | personalizado
    avatar_icon: str = "bot"
    accent_color: str = "#3454d1"
    model: Optional[str] = None
    system_prompt: str
    tools_enabled: list[str] = Field(default_factory=list)
    quick_prompts: list[str] = Field(default_factory=list)
    is_default: bool = False
    enabled: bool = True


class AgentProfileUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    avatar_icon: Optional[str] = None
    accent_color: Optional[str] = None
    model: Optional[str] = None
    system_prompt: Optional[str] = None
    tools_enabled: Optional[list[str]] = None
    quick_prompts: Optional[list[str]] = None
    is_default: Optional[bool] = None
    enabled: Optional[bool] = None


class AgentProfileOut(BaseModel):
    id: int
    slug: str
    name: str
    role: str
    description: str
    category: str
    avatar_icon: str
    accent_color: str
    model: Optional[str] = None
    system_prompt: str
    tools_enabled: list[str] = []
    quick_prompts: list[str] = []
    is_default: bool
    is_system: bool
    enabled: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# --- Biblioteca de Exercícios (SmartWorkout) & Treinos ---
class WorkoutExerciseCreate(BaseModel):
    name: str
    muscle_group: str
    secondary_muscles: Optional[str] = None
    equipment: str = "Halteres"
    difficulty: str = "Intermediário"
    mechanic: str = "Composto"
    instructions: str
    common_mistakes: Optional[str] = None
    video_url: Optional[str] = None
    image_urls: list[str] = Field(default_factory=list)


class WorkoutExerciseOut(BaseModel):
    id: int
    slug: str
    name: str
    muscle_group: str
    secondary_muscles: Optional[str] = None
    equipment: str
    difficulty: str
    mechanic: str
    instructions: str
    common_mistakes: Optional[str] = None
    video_url: Optional[str] = None
    image_urls: list[str] = Field(default_factory=list)
    is_custom: bool = False
    personal_record_kg: float = 0.0
    last_weight_kg: float = 0.0
    last_trained_date: Optional[str] = None
    estimated_1rm_kg: float = 0.0
    times_trained: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class WorkoutPlanExerciseItem(BaseModel):
    exercise_id: Optional[int] = None
    exercise_name: str
    muscle_group: str = "Geral"
    equipment: str = "Halteres"
    sets: int = 4
    reps: str = "8-12"
    target_weight_kg: float = 0.0
    rest_seconds: int = 90
    rir: str = "1-2 RIR"
    notes: Optional[str] = None


class WorkoutPlanCreate(BaseModel):
    title: str
    split_label: str = "ABC"
    target_muscles: str
    goal: str = "Hipertrofia"
    scheduled_days: Optional[str] = None
    estimated_duration_min: int = 60
    created_by_agent: str = "SmartWorkout Coach IA"
    notes: Optional[str] = None
    exercises: list[WorkoutPlanExerciseItem] = Field(default_factory=list)
    active: bool = True


class WorkoutPlanUpdate(BaseModel):
    title: Optional[str] = None
    split_label: Optional[str] = None
    target_muscles: Optional[str] = None
    goal: Optional[str] = None
    scheduled_days: Optional[str] = None
    estimated_duration_min: Optional[int] = None
    notes: Optional[str] = None
    exercises: Optional[list[WorkoutPlanExerciseItem]] = None
    active: Optional[bool] = None


class WorkoutPlanOut(WorkoutPlanCreate):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WorkoutSetDetail(BaseModel):
    set_number: int = 1
    reps: int = 10
    weight_kg: float = 0.0
    rir: Optional[int] = None
    is_warmup: bool = False


class WorkoutSessionExerciseItem(BaseModel):
    exercise_id: Optional[int] = None
    exercise_name: str
    muscle_group: str = "Geral"
    equipment: str = "Halteres"
    sets_count: int = 3
    reps: str = "10"
    weight_kg: float = 0.0
    max_weight_kg: Optional[float] = None
    set_details: list[WorkoutSetDetail] = Field(default_factory=list)
    volume_kg: Optional[float] = None
    notes: Optional[str] = None


class WorkoutSessionCreate(BaseModel):
    session_date: str  # YYYY-MM-DD
    title: str
    plan_id: Optional[int] = None
    muscle_groups: Optional[str] = None
    duration_minutes: int = 60
    perceived_effort: int = Field(default=8, ge=1, le=10)
    exercises_performed: list[WorkoutSessionExerciseItem] = Field(default_factory=list)
    notes: Optional[str] = None


class WorkoutSessionUpdate(BaseModel):
    session_date: Optional[str] = None
    title: Optional[str] = None
    plan_id: Optional[int] = None
    muscle_groups: Optional[str] = None
    duration_minutes: Optional[int] = None
    perceived_effort: Optional[int] = Field(default=None, ge=1, le=10)
    exercises_performed: Optional[list[WorkoutSessionExerciseItem]] = None
    notes: Optional[str] = None


class WorkoutSessionOut(BaseModel):
    id: int
    session_date: str
    title: str
    plan_id: Optional[int] = None
    muscle_groups: Optional[str] = None
    duration_minutes: int
    perceived_effort: int
    exercises_count: int
    total_sets: int
    total_reps: int
    total_volume_kg: float
    max_weight_kg: float
    exercises_performed: list[dict[str, Any]] = []
    notes: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AIWorkoutGenerateRequest(BaseModel):
    goal: str = "Hipertrofia"
    split_type: str = "ABC"  # ABC | ABCD | Push/Pull/Legs | Upper/Lower | Full Body | Ficha Específica
    days_per_week: int = Field(default=4, ge=1, le=7)
    experience_level: str = "Intermediário"  # Iniciante | Intermediário | Avançado
    available_equipment: str = "Academia Completa"  # Academia Completa | Halteres e Barra | Peso Corporal / Casa
    focus_muscles: Optional[str] = None
    custom_instructions: Optional[str] = None
    agent_id: Optional[int] = None



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


# --- Conversas salvas do chat ---
class ConversationOut(BaseModel):
    id: int
    title: str
    model: Optional[str] = None
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
    remind_minutes_before: int = 15
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
    remind_minutes_before: Optional[int] = None
    location_or_link: Optional[str] = None
    enabled: Optional[bool] = None
    last_triggered_at: Optional[str] = None


class ScheduleNotificationOut(ScheduleNotificationCreate):
    id: int
    last_triggered_at: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


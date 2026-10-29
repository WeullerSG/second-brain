export interface MemoryFact {
  id: number;
  category: string;
  key: string;
  content: string;
  importance: number;
  source: string;
  pinned: boolean;
  has_embedding: boolean;
  created_at: string;
  updated_at: string;
}

export interface FinanceAccount {
  id: number;
  name: string;
  account_type: string;
  balance: number;
  credit_limit: number;
  closing_day?: number | null;
  due_day?: number | null;
  updated_at: string;
}

export interface FinanceRecord {
  id: number;
  title: string;
  category: string;
  record_type: "expense" | "income" | "card_bill" | string;
  amount: number;
  account_name: string;
  due_date?: string | null;
  status: "pending" | "paid" | string;
  notes?: string | null;
  created_at: string;
}

export interface InstallmentScheduleItem {
  record_id: number;
  title: string;
  installment_number: number;
  total_installments: number;
  amount: number;
  due_date?: string | null;
  month_label: string;
  status: string;
}

export interface InstallmentContractItem {
  id: number;
  title: string;
  account_name: string;
  category: string;
  installment_amount: number;
  paid_installments: number;
  total_installments: number;
  remaining_installments: number;
  total_purchase_amount: number;
  remaining_total_amount: number;
  next_due_date?: string | null;
  status: string;
  notes?: string | null;
  schedule: InstallmentScheduleItem[];
}

export interface UpcomingMonthForecast {
  month_key: string;
  month_label: string;
  expected_salary: number;
  installments_total: number;
  card_accumulated_total: number;
  recurring_bills_total: number;
  total_committed: number;
  projected_leftover: number;
  projected_leftover_after_cards_only: number;
  committed_percent: number;
  items: FinanceRecord[];
}

export interface SalaryForecast {
  monthly_salary: number;
  current_checking_balance: number;
  total_credit_limit: number;
  total_credit_used: number;
  total_credit_available: number;
  current_month_label: string;
  spent_this_month: number;
  extra_income_this_month?: number;
  current_month_leftover?: number;
  next_month_label: string;
  next_month_installments_total: number;
  next_month_card_accumulated: number;
  next_month_cards_and_installments: number;
  next_month_fixed_bills: number;
  next_month_total_committed: number;
  projected_salary_leftover: number;
  projected_leftover_after_cards_only: number;
  committed_percent: number;
  savings_goal_20pct: number;
  free_after_savings_goal: number;
}

export interface CurrentMonthSummary {
  month_key: string;
  month_label: string;
  salary_received: number;
  total_spent_this_month: number;
  paid_this_month: number;
  pending_this_month: number;
  card_bills_paid_this_month: number;
  direct_expenses_this_month: number;
  new_card_spend_next_bill: number;
  categories: Array<{ category: string; total: number }>;
  items: FinanceRecord[];
  card_statement_items: ExtractedStatementExpense[];
}

export interface FinanceSummary {
  total_balance: number;
  total_credit_limit: number;
  total_credit_used?: number;
  total_credit_available?: number;
  pending_bills: number;
  paid_expenses: number;
  total_income: number;
  monthly_salary?: number;
  current_month_summary?: CurrentMonthSummary;
  installments_summary?: {
    active_count: number;
    monthly_total: number;
    total_remaining_debt: number;
    items: InstallmentContractItem[];
  };
  upcoming_months?: UpcomingMonthForecast[];
  salary_forecast?: SalaryForecast;
  accounts: FinanceAccount[];
  records: FinanceRecord[];
}

export interface ExtractedStatementExpense {
  id: string;
  title: string;
  amount: number;
  date: string;
  date_iso?: string;
  category: string;
  source_name: string;
  source_type: "rag_document" | "core_memory" | "finance_record" | string;
  source_id: number;
  account_name?: string;
  status?: string;
  raw_line?: string;
  is_installment?: boolean;
  current_installment?: number;
  total_installments?: number;
  remaining_installments?: number;
}

export interface StatementMemorySource {
  source_id: number;
  source_type: "rag_document" | "core_memory" | string;
  title: string;
  category: string;
  created_at: string;
  chunk_count: number;
  items_count: number;
  total_amount: number;
  preview_text: string;
  items: ExtractedStatementExpense[];
}

export interface StatementHistoryResponse {
  total_sources_in_memory: number;
  total_extracted_items: number;
  total_extracted_amount: number;
  category_breakdown: Array<{
    category: string;
    total: number;
  }>;
  memory_statements: StatementMemorySource[];
  extracted_items: ExtractedStatementExpense[];
}

export interface AcademicTask {
  id: number;
  subject: string;
  title: string;
  task_type: "exam" | "assignment" | "project" | "reading" | string;
  due_date?: string | null;
  status: "todo" | "in_progress" | "done" | string;
  priority: "low" | "medium" | "high" | "critical" | string;
  grade_weight?: number | null;
  grade_obtained?: number | null;
  notes?: string | null;
  created_at: string;
}

export interface DocumentItem {
  id: number;
  filename: string;
  mime_type: string;
  category: string;
  size_bytes: number;
  char_count: number;
  chunk_count: number;
  created_at: string;
}

export interface DocumentChunkItem {
  id: number;
  chunk_index: number;
  content: string;
  token_estimate: number;
  has_embedding: boolean;
  embedding_dim?: number;
}

export interface ToolCallTrace {
  name: string;
  arguments: Record<string, unknown>;
  result_summary: string;
}

export interface ChatResponse {
  interaction_id: string | null;
  reply: string;
  model: string;
  tools_called: ToolCallTrace[];
  rag_sources: Array<{
    chunk_id: number;
    filename: string;
    chunk_index: number;
    content: string;
    score: number;
  }>;
  tokens_used: number;
  latency_ms: number;
  conversation_id?: number | null;
  agent_id?: number | null;
  agent_name?: string | null;
}

export interface ConversationSummary {
  id: number;
  title: string;
  model?: string | null;
  agent_id?: number | null;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface ConversationMessageItem {
  id: number;
  role: "user" | "agent";
  text: string;
  meta?: {
    model?: string;
    agent_id?: number | null;
    agent_name?: string | null;
    tools?: ToolCallTrace[];
    rag_sources?: ChatResponse["rag_sources"];
    tokens?: number;
    latency_ms?: number;
  } | null;
  created_at: string;
}

export interface ConversationDetail extends ConversationSummary {
  last_interaction_id?: string | null;
  messages: ConversationMessageItem[];
}

export interface AppSettings {
  agent_model: string;
  available_models: string[];
}

export interface FineTuneExample {
  id: number;
  category: string;
  system_instruction: string;
  user_input: string;
  ideal_output: string;
  approved: boolean;
  created_at: string;
}

export interface ScheduleNotificationItem {
  id: number;
  title: string;
  message: string;
  category: "aula" | "entrevista" | "financas" | "faculdade" | "pessoal" | string;
  schedule_type: "recurring_weekly" | "one_time" | "daily" | string;
  days_of_week?: string | null; // "mon,tue,wed,thu,fri"
  target_date?: string | null; // "YYYY-MM-DD"
  notify_time: string; // "HH:MM"
  remind_minutes_before: number;
  reminder_offsets?: number[] | null; // minutos antes de cada aviso
  location_or_link?: string | null;
  enabled: boolean;
  last_triggered_at?: string | null;
  created_at: string;
}

export interface TelemetryOverview {
  engine: {
    database_backend: string;
    agent_model: string;
    embedding_model: string;
    api_key_configured: boolean;
  };
  memory_stats: {
    total_memory_facts: number;
    embedded_facts: number;
    total_files_uploaded: number;
    total_files_bytes: number;
    total_rag_chunks: number;
    embedded_chunks: number;
    total_chunk_tokens: number;
    vector_memory_bytes: number;
    text_memory_bytes: number;
    total_memory_footprint_bytes: number;
    db_disk_bytes: number;
    structured_records: {
      finance_accounts: number;
      finance_records: number;
      academic_tasks: number;
      finetune_examples: number;
    };
  };
  usage_stats: {
    total_api_calls: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_tokens: number;
    avg_latency_ms: number;
    recent_logs: Array<{
      id: number;
      model: string;
      operation: string;
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
      tools_called: string[];
      latency_ms: number;
      preview?: string;
      created_at: string;
    }>;
  };
  system_health: {
    process_ram_mb: number;
    system_ram_percent: number;
    system_ram_total_gb: number;
    system_ram_used_gb: number;
  };
}

// --- Seção de Agentes IA ---
export interface AgentToolMeta {
  name: string;
  label: string;
  category: string;
  description: string;
}

export interface AgentProfile {
  id: number;
  slug: string;
  name: string;
  role: string;
  description: string;
  category: "treino" | "geral" | "financas" | "faculdade" | "personalizado" | string;
  avatar_icon: string;
  accent_color: string;
  model?: string | null;
  system_prompt: string;
  tools_enabled: string[];
  quick_prompts: string[];
  is_default: boolean;
  is_system: boolean;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

// --- Seção de Treinos & Biblioteca SmartWorkout ---
export interface WorkoutExercise {
  id: number;
  slug: string;
  name: string;
  muscle_group: string;
  secondary_muscles?: string | null;
  equipment: string;
  difficulty: string;
  mechanic: string;
  instructions: string;
  common_mistakes?: string | null;
  video_url?: string | null;
  image_urls?: string[];
  is_custom: boolean;
  personal_record_kg: number;
  last_weight_kg: number;
  last_trained_date?: string | null;
  estimated_1rm_kg: number;
  times_trained: number;
  created_at: string;
}

export interface WorkoutPlanExerciseItem {
  exercise_id?: number | null;
  exercise_name: string;
  muscle_group: string;
  equipment: string;
  sets: number;
  reps: string;
  target_weight_kg: number;
  rest_seconds: number;
  rir: string;
  notes?: string | null;
}

export interface WorkoutPlan {
  id: number;
  title: string;
  split_label: string;
  target_muscles: string;
  goal: string;
  scheduled_days?: string | null;
  estimated_duration_min: number;
  created_by_agent: string;
  notes?: string | null;
  exercises: WorkoutPlanExerciseItem[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface WorkoutSetDetail {
  set_number: number;
  reps: number;
  weight_kg: number;
  rir?: number | null;
  is_warmup?: boolean;
}

export interface WorkoutSessionExerciseItem {
  exercise_id?: number | null;
  exercise_name: string;
  muscle_group: string;
  equipment: string;
  sets_count: number;
  reps: string;
  weight_kg: number;
  max_weight_kg?: number;
  set_details?: WorkoutSetDetail[];
  volume_kg?: number;
  notes?: string | null;
}

export interface TodayWorkoutSuggestion {
  title: string;
  plan_id: number | null;
  muscle_groups: string;
  reason: string;
  trained_today: boolean;
  exercises: Array<WorkoutSessionExerciseItem & { image_urls?: string[] }>;
}

export interface WorkoutSession {
  id: number;
  session_date: string;
  title: string;
  plan_id?: number | null;
  muscle_groups?: string | null;
  duration_minutes: number;
  perceived_effort: number;
  exercises_count: number;
  total_sets: number;
  total_reps: number;
  total_volume_kg: number;
  max_weight_kg: number;
  exercises_performed: WorkoutSessionExerciseItem[];
  notes?: string | null;
  created_at: string;
}

export interface PersonalRecordItem {
  exercise_name: string;
  muscle_group: string;
  equipment: string;
  personal_record_kg: number;
  best_reps: number;
  last_weight_kg: number;
  last_trained_date?: string | null;
  estimated_1rm_kg: number;
  times_trained: number;
}

export interface WorkoutsSummary {
  total_sessions: number;
  days_trained_total: number;
  days_trained_this_month: number;
  days_trained_this_week: number;
  trained_dates: string[];
  trained_dates_detail: Record<
    string,
    Array<{
      id: number;
      title: string;
      muscle_groups?: string | null;
      exercises_count: number;
      total_sets: number;
      max_weight_kg: number;
      total_volume_kg: number;
    }>
  >;
  total_exercises_done: number;
  exercises_done_this_month: number;
  total_sets_done: number;
  total_volume_kg: number;
  heaviest_lift?: PersonalRecordItem | null;
  personal_records: PersonalRecordItem[];
  muscle_group_breakdown: Array<{
    muscle_group: string;
    exercises_done: number;
    sets_done: number;
    volume_kg: number;
    max_weight_kg: number;
  }>;
  library_count: number;
  active_plans_count: number;
  plans: WorkoutPlan[];
  recent_sessions: WorkoutSession[];
}

export interface AIWorkoutGenerateRequest {
  goal: string;
  split_type: string;
  days_per_week: number;
  experience_level: string;
  available_equipment: string;
  focus_muscles?: string;
  custom_instructions?: string;
  agent_id?: number | null;
}


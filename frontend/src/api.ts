import type {
  AcademicTask,
  AgentProfile,
  AgentToolMeta,
  AIWorkoutGenerateRequest,
  AppSettings,
  ChatResponse,
  ConversationDetail,
  ConversationSummary,
  DocumentChunkItem,
  DocumentItem,
  FinanceSummary,
  FineTuneExample,
  MemoryFact,
  ScheduleNotificationItem,
  StatementHistoryResponse,
  TelemetryOverview,
  WorkoutExercise,
  WorkoutPlan,
  WorkoutPlanExerciseItem,
  WorkoutSession,
  WorkoutSessionExerciseItem,
  WorkoutsSummary,
} from "./types";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

// ---------- Sessão de login ----------
const TOKEN_KEY = "sb_token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // armazenamento indisponível: a sessão dura só enquanto a aba estiver aberta
  }
}

/** Avisado quando o servidor responde 401 (sessão expirada ou inválida). */
export const UNAUTHORIZED_EVENT = "sb-unauthorized";

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function errorMessage(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const detail = JSON.parse(text)?.detail;
    if (typeof detail === "string") return detail;
  } catch {
    // resposta não é JSON
  }
  return text || `HTTP Error ${res.status}`;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(),
        ...((options?.headers as Record<string, string>) || {}),
      },
      signal: controller.signal,
    });
    if (res.status === 401 && !path.startsWith("/auth/")) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    if (!res.ok) {
      throw new Error(await errorMessage(res));
    }
    return res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export const api = {
  // Login
  authStatus: () =>
    request<{ has_user: boolean; authenticated: boolean; username: string | null }>("/auth/status"),
  setupAccount: (username: string, password: string) =>
    request<{ token: string; username: string }>("/auth/setup", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  login: (username: string, password: string) =>
    request<{ token: string; username: string }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  logout: () => request("/auth/logout", { method: "POST" }),
  changePassword: (current_password: string, new_password: string) =>
    request("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password, new_password }),
    }),

  // Chat Agent
  sendChat: (payload: {
    message: string;
    previous_interaction_id?: string | null;
    model?: string;
    save_for_finetune?: boolean;
    conversation_id?: number | null;
    agent_id?: number | null;
  }) =>
    request<ChatResponse>("/chat", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getConversations: () => request<ConversationSummary[]>("/chat/conversations"),
  getConversation: (id: number) =>
    request<ConversationDetail>(`/chat/conversations/${id}`),
  renameConversation: (id: number, title: string) =>
    request<ConversationSummary>(`/chat/conversations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }),
  deleteConversation: (id: number) =>
    request(`/chat/conversations/${id}`, { method: "DELETE" }),

  // Configurações
  getSettings: () => request<AppSettings>("/settings"),
  updateSettings: (data: { agent_model: string }) =>
    request<AppSettings>("/settings", {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  // Core Memory Facts
  getMemories: (params?: { category?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.category) qs.set("category", params.category);
    if (params?.q) qs.set("q", params.q);
    return request<MemoryFact[]>(`/memories?${qs.toString()}`);
  },
  createMemory: (data: {
    category: string;
    key: string;
    content: string;
    importance: number;
    pinned: boolean;
  }) =>
    request<MemoryFact>("/memories", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateMemory: (
    id: number,
    data: Partial<{
      category: string;
      key: string;
      content: string;
      importance: number;
      pinned: boolean;
    }>
  ) =>
    request<MemoryFact>(`/memories/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteMemory: (id: number) =>
    request<{ status: string }>(`/memories/${id}`, { method: "DELETE" }),

  // Finances
  getFinanceSummary: () => request<FinanceSummary>("/finances/summary"),
  syncStatements: () =>
    request<{
      status: string;
      sync_result: {
        synced: boolean;
        updated_accounts: number;
        created_records: number;
        installments_registered: number;
      };
      summary: FinanceSummary;
    }>("/finances/sync-statements", { method: "POST" }),
  createInstallmentPurchase: (data: {
    title: string;
    installment_amount: number;
    current_installment: number;
    total_installments: number;
    account_name: string;
    category?: string;
    first_due_date?: string;
    current_month_paid?: boolean;
    notes?: string;
  }) =>
    request<{
      status: string;
      created_installments_count: number;
      title: string;
      installment_amount: number;
      total_installments: number;
      category: string;
    }>("/finances/installments", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateSalary: (data: {
    monthly_salary: number;
    account_name?: string;
    pay_day?: number;
  }) =>
    request<{ status: string; monthly_salary: number }>("/finances/salary", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getStatementHistory: () =>
    request<StatementHistoryResponse>("/finances/statement-history"),
  extractExpensesFromMemory: (autoImport = true) =>
    request<{
      status: string;
      extracted_count: number;
      imported_count: number;
      extracted: Array<{
        title: string;
        amount: number;
        date: string;
        category: string;
        account_name: string;
      }>;
    }>(`/finances/extract-from-memory?auto_import_to_records=${autoImport}`, {
      method: "POST",
    }),
  upsertAccount: (data: {
    name: string;
    account_type: string;
    balance: number;
    credit_limit: number;
    closing_day?: number | null;
    due_day?: number | null;
  }) =>
    request("/finances/accounts", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateAccount: (
    id: number,
    data: {
      name: string;
      account_type: string;
      balance: number;
      credit_limit: number;
      closing_day?: number | null;
      due_day?: number | null;
    }
  ) =>
    request(`/finances/accounts/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteAccount: (id: number) =>
    request(`/finances/accounts/${id}`, { method: "DELETE" }),
  updateInstallmentGroup: (data: {
    record_ids: number[];
    title?: string;
    installment_amount?: number;
    account_name?: string;
  }) =>
    request("/finances/installments", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteInstallmentGroup: (recordIds: number[]) =>
    request("/finances/installments/delete", {
      method: "POST",
      body: JSON.stringify({ record_ids: recordIds }),
    }),
  createFinanceRecord: (data: {
    title: string;
    category: string;
    record_type: string;
    amount: number;
    account_name: string;
    due_date?: string;
    status: string;
    notes?: string;
  }) =>
    request("/finances/records", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateFinanceRecord: (id: number, data: Record<string, unknown>) =>
    request(`/finances/records/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteFinanceRecord: (id: number) =>
    request(`/finances/records/${id}`, { method: "DELETE" }),

  // Academic Tasks
  getAcademicTasks: () => request<AcademicTask[]>("/academic"),
  createAcademicTask: (data: {
    subject: string;
    title: string;
    task_type: string;
    due_date?: string;
    priority: string;
    grade_weight?: number;
    notes?: string;
  }) =>
    request<AcademicTask>("/academic", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateAcademicTask: (id: number, data: Record<string, unknown>) =>
    request<AcademicTask>(`/academic/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteAcademicTask: (id: number) =>
    request(`/academic/${id}`, { method: "DELETE" }),

  // Documents & RAG Chunks
  getDocuments: () => request<DocumentItem[]>("/documents"),
  uploadDocument: async (file: File, category: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("category", category);
    const res = await fetch(`${API_BASE}/documents/upload`, {
      method: "POST",
      headers: authHeaders(),
      body: form,
    });
    if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    if (!res.ok) throw new Error(await errorMessage(res));
    return res.json();
  },
  getDocumentChunks: (docId: number) =>
    request<{ document: DocumentItem; chunks: DocumentChunkItem[] }>(
      `/documents/${docId}/chunks`
    ),
  updateChunkContent: (chunkId: number, content: string) =>
    request<DocumentChunkItem>(`/documents/chunks/${chunkId}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
  deleteDocument: (docId: number) =>
    request(`/documents/${docId}`, { method: "DELETE" }),

  // Telemetry & Fine-Tuning
  getTelemetryOverview: () => request<TelemetryOverview>("/telemetry/overview"),
  getFineTuneExamples: () =>
    request<FineTuneExample[]>("/telemetry/finetune/examples"),
  createFineTuneExample: (data: {
    category: string;
    user_input: string;
    ideal_output: string;
  }) =>
    request<FineTuneExample>("/telemetry/finetune/examples", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteFineTuneExample: (id: number) =>
    request(`/telemetry/finetune/examples/${id}`, { method: "DELETE" }),
  /** Baixa o dataset .jsonl (precisa do token, por isso não é um link direto). */
  downloadFineTuneExport: async () => {
    const res = await fetch(`${API_BASE}/telemetry/finetune/export.jsonl`, { headers: authHeaders() });
    if (res.status === 401) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    if (!res.ok) throw new Error(await errorMessage(res));
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement("a");
    a.href = url;
    a.download = "second_brain_gemini_finetune.jsonl";
    a.click();
    URL.revokeObjectURL(url);
  },

  // Schedule & Notifications (Agenda de Aulas, Entrevistas e Lembretes)
  getNotifications: () => request<ScheduleNotificationItem[]>("/notifications"),
  getTodaySchedule: () =>
    request<{
      today_date: string;
      today_weekday: string;
      count: number;
      items: ScheduleNotificationItem[];
    }>("/notifications/today"),
  createNotification: (data: {
    title: string;
    message: string;
    category: string;
    schedule_type: string;
    days_of_week?: string | null;
    target_date?: string | null;
    notify_time: string;
    remind_minutes_before: number;
    reminder_offsets?: number[];
    location_or_link?: string | null;
    enabled?: boolean;
  }) =>
    request<ScheduleNotificationItem>("/notifications", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateNotification: (
    id: number,
    data: Partial<ScheduleNotificationItem>
  ) =>
    request<ScheduleNotificationItem>(`/notifications/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteNotification: (id: number) =>
    request(`/notifications/${id}`, { method: "DELETE" }),

  // Gerenciador de Agentes IA
  getAgents: () => request<AgentProfile[]>("/agents"),
  getAgentTools: () => request<AgentToolMeta[]>("/agents/tools"),
  createAgent: (data: {
    name: string;
    role: string;
    description: string;
    category: string;
    avatar_icon: string;
    accent_color: string;
    model?: string | null;
    system_prompt: string;
    tools_enabled: string[];
    quick_prompts: string[];
    is_default?: boolean;
    enabled?: boolean;
  }) =>
    request<AgentProfile>("/agents", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateAgent: (id: number, data: Partial<AgentProfile>) =>
    request<AgentProfile>(`/agents/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteAgent: (id: number) =>
    request<{ status: string }>(`/agents/${id}`, { method: "DELETE" }),
  resetDefaultAgents: () =>
    request<AgentProfile[]>("/agents/reset-defaults", { method: "POST" }),

  // Treinos & Biblioteca SmartWorkout
  getWorkoutsSummary: () => request<WorkoutsSummary>("/workouts/summary"),
  getWorkoutExercises: (params?: {
    muscle_group?: string;
    equipment?: string;
    q?: string;
  }) => {
    const qs = new URLSearchParams();
    if (params?.muscle_group && params.muscle_group !== "Todos") {
      qs.set("muscle_group", params.muscle_group);
    }
    if (params?.equipment && params.equipment !== "Todos") {
      qs.set("equipment", params.equipment);
    }
    if (params?.q) qs.set("q", params.q);
    return request<WorkoutExercise[]>(`/workouts/exercises?${qs.toString()}`);
  },
  createWorkoutExercise: (data: {
    name: string;
    muscle_group: string;
    secondary_muscles?: string;
    equipment: string;
    difficulty: string;
    mechanic: string;
    instructions: string;
    common_mistakes?: string;
    video_url?: string;
  }) =>
    request<WorkoutExercise>("/workouts/exercises", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteWorkoutExercise: (id: number) =>
    request<{ status: string }>(`/workouts/exercises/${id}`, {
      method: "DELETE",
    }),
  getWorkoutPlans: () => request<WorkoutPlan[]>("/workouts/plans"),
  createWorkoutPlan: (data: {
    title: string;
    split_label: string;
    target_muscles: string;
    goal: string;
    scheduled_days?: string;
    estimated_duration_min: number;
    created_by_agent?: string;
    notes?: string;
    exercises: WorkoutPlanExerciseItem[];
    active?: boolean;
  }) =>
    request<WorkoutPlan>("/workouts/plans", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateWorkoutPlan: (id: number, data: Partial<WorkoutPlan>) =>
    request<WorkoutPlan>(`/workouts/plans/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteWorkoutPlan: (id: number) =>
    request<{ status: string }>(`/workouts/plans/${id}`, { method: "DELETE" }),
  getWorkoutSessions: () => request<WorkoutSession[]>("/workouts/sessions"),
  createWorkoutSession: (data: {
    session_date: string;
    title: string;
    plan_id?: number | null;
    muscle_groups?: string;
    duration_minutes: number;
    perceived_effort: number;
    exercises_performed: WorkoutSessionExerciseItem[];
    notes?: string;
  }) =>
    request<WorkoutSession>("/workouts/sessions", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateWorkoutSession: (id: number, data: Partial<WorkoutSession>) =>
    request<WorkoutSession>(`/workouts/sessions/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteWorkoutSession: (id: number) =>
    request<{ status: string }>(`/workouts/sessions/${id}`, {
      method: "DELETE",
    }),
  generateAIWorkoutPlan: (data: AIWorkoutGenerateRequest) =>
    request<{
      status: string;
      agent_name: string;
      coach_reply: string;
      created_plans_count: number;
      created_plans: WorkoutPlan[];
    }>("/workouts/generate-ai-plan", {
      method: "POST",
      body: JSON.stringify(data),
    }),
};

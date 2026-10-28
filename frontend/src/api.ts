import type {
  AcademicTask,
  ChatResponse,
  DocumentChunkItem,
  DocumentItem,
  FinanceSummary,
  FineTuneExample,
  MemoryFact,
  ScheduleNotificationItem,
  StatementHistoryResponse,
  TelemetryOverview,
} from "./types";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
      signal: controller.signal,
      ...options,
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || `HTTP Error ${res.status}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

export const api = {
  // Chat Agent
  sendChat: (payload: {
    message: string;
    previous_interaction_id?: string | null;
    model?: string;
    save_for_finetune?: boolean;
  }) =>
    request<ChatResponse>("/chat", {
      method: "POST",
      body: JSON.stringify(payload),
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
  deleteAccount: (id: number) =>
    request(`/finances/accounts/${id}`, { method: "DELETE" }),
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
      body: form,
    });
    if (!res.ok) throw new Error(await res.text());
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
  getFineTuneExportUrl: () => `${API_BASE}/telemetry/finetune/export.jsonl`,

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
};

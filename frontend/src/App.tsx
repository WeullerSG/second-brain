import React, { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Bell,
  BookOpen,
  Bot,
  Brain,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Cpu,
  CreditCard,
  Database,
  Download,
  Dumbbell,
  Edit3,
  FileText,
  GraduationCap,
  HardDrive,
  LayoutDashboard,
  Layers,
  Menu,
  MessageSquare,
  Moon,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  Wallet,
  Wrench,
} from "lucide-react";
import { api } from "./api";
import { formatReminderOffset, getDueReminders } from "./reminders";
import { AgendaNotificationsView } from "./components/AgendaNotificationsView";
import { AgentsSection, renderAgentIcon } from "./components/AgentsSection";
import { CurrentFinancesSection } from "./components/CurrentFinancesSection";
import { MemoryDonutChart, PaymentAndUsageChart } from "./components/DuraluxCharts";
import { StatementHistorySection } from "./components/StatementHistorySection";
import { WorkoutsSection } from "./components/WorkoutsSection";
import { Markdown } from "./components/Markdown";
import type {
  AcademicTask,
  AgentProfile,
  AgentToolMeta,
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
  ToolCallTrace,
  WorkoutExercise,
  WorkoutsSummary,
} from "./types";

type ActiveTab =
  | "overview"
  | "chat"
  | "workouts"
  | "agents"
  | "agenda"
  | "finances"
  | "academic"
  | "memory"
  | "telemetry";

interface ChatMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  model?: string;
  tools?: ToolCallTrace[];
  ragSources?: Array<{
    chunk_id: number;
    filename: string;
    chunk_index: number;
    content: string;
    score: number;
  }>;
  tokens?: number;
  latencyMs?: number;
}

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "agent",
  text: "Olá, **Weuller**! Bem-vindo ao seu **Second Brain AI**.\n\nEstou conectado ao **Gemini** com *Function Calling* e **Hybrid RAG**. Você pode pedir para:\n- 💳 Registrar gastos de cartão, atualizar saldo de conta ou quitar faturas;\n- 🎓 Cadastrar provas, trabalhos e prazos da faculdade;\n- 🧠 Salvar fatos na **Memória Core** ou consultar seus **Arquivos PDF/TXT no RAG**.\n\nSuas conversas ficam salvas e podem ser reabertas ou excluídas na lista de conversas.",
};

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

export default function App({ username, onLogout }: { username: string; onLogout: () => void }) {
  // Duralux Skin State (Light Mode by default, like duralux-react-dashboard.vercel.app, with Dark Skin toggle)
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("sb_dark_mode");
      if (saved !== null) return saved === "1";
    } catch {
      // armazenamento indisponível
    }
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    document.documentElement.style.colorScheme = darkMode ? "dark" : "light";
    try {
      localStorage.setItem("sb_dark_mode", darkMode ? "1" : "0");
    } catch {
      // armazenamento indisponível
    }
  }, [darkMode]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview");
  const [loading, setLoading] = useState(false);

  // Chat State
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [chatInput, setChatInput] = useState("");
  const [selectedModel, setSelectedModel] = useState("gemini-3.5-flash-lite");
  const [saveForFinetune, setSaveForFinetune] = useState(false);

  // Conversas salvas
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [showConversationsMobile, setShowConversationsMobile] = useState(false);

  // Menu de configurações (modelo do agente)
  const [showSettings, setShowSettings] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [settingsModelDraft, setSettingsModelDraft] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwMessage, setPwMessage] = useState<string | null>(null);

  // Data States
  const [finance, setFinance] = useState<FinanceSummary | null>(null);
  const [statementHistory, setStatementHistory] =
    useState<StatementHistoryResponse | null>(null);
  const [financeSubTab, setFinanceSubTab] = useState<
    "current" | "statement_history"
  >("current");
  const [tasks, setTasks] = useState<AcademicTask[]>([]);
  const [memories, setMemories] = useState<MemoryFact[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetryOverview | null>(null);
  const [ftExamples, setFtExamples] = useState<FineTuneExample[]>([]);
  const [schedules, setSchedules] = useState<ScheduleNotificationItem[]>([]);
  const [workoutsSummary, setWorkoutsSummary] =
    useState<WorkoutsSummary | null>(null);
  const [workoutExercises, setWorkoutExercises] = useState<WorkoutExercise[]>(
    []
  );
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [agentTools, setAgentTools] = useState<AgentToolMeta[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null);
  const [workoutInitialSubTab, setWorkoutInitialSubTab] = useState<
    "diary" | "plans" | "library"
  >("diary");
  const [permissionStatus, setPermissionStatus] = useState<
    NotificationPermission | "unsupported"
  >(
    typeof window !== "undefined" && "Notification" in window
      ? Notification.permission
      : "unsupported"
  );
  const firedReminders = useRef<Set<string>>(new Set());
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const [activeToastAlert, setActiveToastAlert] = useState<{
    title: string;
    message: string;
    time: string;
  } | null>(null);

  // Memory & RAG Sub-states
  const [memorySearch, setMemorySearch] = useState("");
  const [editingMemory, setEditingMemory] = useState<MemoryFact | null>(null);
  const [newMemKey, setNewMemKey] = useState("");
  const [newMemCategory, setNewMemCategory] = useState("pessoal");
  const [newMemContent, setNewMemContent] = useState("");
  const [newMemImportance, setNewMemImportance] = useState(4);

  // Document Chunks Inspector
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [docChunks, setDocChunks] = useState<DocumentChunkItem[]>([]);
  const [editingChunkId, setEditingChunkId] = useState<number | null>(null);
  const [editingChunkText, setEditingChunkText] = useState("");
  const [uploadCategory, setUploadCategory] = useState("geral");
  const [uploadingFile, setUploadingFile] = useState(false);

  // Finance Forms
  const [accName, setAccName] = useState("");
  const [accBalance, setAccBalance] = useState("");
  const [accLimit, setAccLimit] = useState("");
  const [recTitle, setRecTitle] = useState("");
  const [recAmount, setRecAmount] = useState("");
  const [recType, setRecType] = useState("card_bill");
  const [recCategory, setRecCategory] = useState("cartao");
  const [recAccount, setRecAccount] = useState("Nubank (Conta + Cartão)");
  const [recDueDate, setRecDueDate] = useState("");

  // Academic Form
  const [taskSubject, setTaskSubject] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskType, setTaskType] = useState("assignment");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskPriority, setTaskPriority] = useState("high");

  const refreshAll = async () => {
    try {
      const [
        finData,
        stmtData,
        taskData,
        memData,
        docData,
        telData,
        ftData,
        schedData,
        workoutSumData,
        workoutExData,
        agentsData,
        toolsData,
      ] = await Promise.all([
        api.getFinanceSummary(),
        api.getStatementHistory(),
        api.getAcademicTasks(),
        api.getMemories({ q: memorySearch || undefined }),
        api.getDocuments(),
        api.getTelemetryOverview(),
        api.getFineTuneExamples(),
        api.getNotifications(),
        api.getWorkoutsSummary(),
        api.getWorkoutExercises(),
        api.getAgents(),
        api.getAgentTools(),
      ]);
      setFinance(finData);
      setStatementHistory(stmtData);
      setTasks(taskData);
      setMemories(memData);
      setDocuments(docData);
      setTelemetry(telData);
      setFtExamples(ftData);
      setSchedules(schedData);
      setWorkoutsSummary(workoutSumData);
      setWorkoutExercises(workoutExData);
      setAgents(agentsData);
      setAgentTools(toolsData);
      setSelectedAgentId((prev) => {
        if (prev && agentsData.some((a) => a.id === prev)) return prev;
        const def = agentsData.find((a) => a.is_default) || agentsData[0];
        return def ? def.id : null;
      });
    } catch (err) {
      console.error("Erro ao sincronizar dados com backend:", err);
    }
  };

  const requestPushPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setPermissionStatus("unsupported");
      return;
    }
    const perm = await Notification.requestPermission();
    setPermissionStatus(perm);
  };

  const fireBrowserAndToastNotification = async (
    title: string,
    body: string,
    timeLabel: string
  ) => {
    setActiveToastAlert({ title, message: body, time: timeLabel });
    // Alerta sonoro suave via Web Audio API
    try {
      const ctx = new (window.AudioContext ||
        (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {
      // Ignora se autoplay de áudio estiver bloqueado
    }

    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        if (reg && "showNotification" in reg) {
          await reg.showNotification(title, {
            body,
            tag: `sb_${Date.now()}`,
          });
          return;
        }
      } catch {
        // Fallback para new Notification()
      }
      new Notification(title, { body });
    }
  };

  const handleTriggerTestNotification = (item?: ScheduleNotificationItem) => {
    if (item) {
      fireBrowserAndToastNotification(
        `🔔 ${item.title}`,
        item.message,
        item.notify_time
      );
    } else {
      fireBrowserAndToastNotification(
        "🧠 Second Brain AI — Alerta de Agenda",
        "Suas notificações de aulas (segunda a sexta) e lembretes de entrevista estão funcionando perfeitamente!",
        new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    }
  };

  // Verificador automático em background (a cada 20s): dispara cada aviso
  // (ex: 1 dia antes, 1h antes, na hora) no minuto certo, uma única vez.
  useEffect(() => {
    const timer = setInterval(() => {
      for (const due of getDueReminders(schedules, new Date())) {
        if (due.item.last_triggered_at === due.stamp || firedReminders.current.has(due.stamp)) continue;
        firedReminders.current.add(due.stamp);
        const whenLabel =
          due.offset === 0
            ? `agora (${due.item.notify_time})`
            : `${formatReminderOffset(due.offset).replace(" antes", "")} • ${due.eventDate.split("-").reverse().join("/")} às ${due.item.notify_time}`;
        fireBrowserAndToastNotification(`🔔 ${due.item.title}`, `${due.item.message} (${whenLabel})`, due.item.notify_time);
        api
          .updateNotification(due.item.id, { last_triggered_at: due.stamp })
          .then(() => refreshAll())
          .catch(() => {});
      }
    }, 20000);

    return () => clearInterval(timer);
  }, [schedules]);

  const loadConversations = async () => {
    try {
      setConversations(await api.getConversations());
    } catch (err) {
      console.error("Erro ao carregar conversas:", err);
    }
  };

  useEffect(() => {
    refreshAll();
    loadConversations();
    api
      .getSettings()
      .then((cfg) => {
        setSelectedModel(cfg.agent_model);
        setAvailableModels(cfg.available_models);
      })
      .catch((err) => console.error("Erro ao carregar configurações:", err));
  }, []);

  // Mantém o chat rolado até a última mensagem
  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading, activeTab]);

  const startNewConversation = () => {
    setActiveConversationId(null);
    setMessages([WELCOME_MESSAGE]);
    setShowConversationsMobile(false);
  };

  const openConversation = async (id: number) => {
    const conv: ConversationDetail = await api.getConversation(id);
    setActiveConversationId(conv.id);
    setMessages(
      conv.messages.length
        ? conv.messages.map((m) => ({
            id: `db_${m.id}`,
            role: m.role,
            text: m.text,
            model: m.meta?.model,
            tools: m.meta?.tools,
            ragSources: m.meta?.rag_sources,
            tokens: m.meta?.tokens,
            latencyMs: m.meta?.latency_ms,
          }))
        : [WELCOME_MESSAGE]
    );
    setShowConversationsMobile(false);
  };

  const deleteConversation = async (conv: ConversationSummary) => {
    if (!window.confirm(`Excluir a conversa "${conv.title}"?`)) return;
    await api.deleteConversation(conv.id);
    if (conv.id === activeConversationId) startNewConversation();
    await loadConversations();
  };

  const openSettings = () => {
    setSettingsModelDraft(selectedModel);
    setShowSettings(true);
    setMobileMenuOpen(false);
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const model = settingsModelDraft.trim();
    if (!model) return;
    setSavingSettings(true);
    try {
      const cfg = await api.updateSettings({ agent_model: model });
      setSelectedModel(cfg.agent_model);
      setAvailableModels(cfg.available_models);
      setShowSettings(false);
    } catch (err: any) {
      window.alert(`Erro ao salvar configurações: ${err.message || err}`);
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSendMessage = async (
    customPrompt?: string,
    agentIdOverride?: number | null
  ) => {
    const promptText = (customPrompt ?? chatInput).trim();
    if (!promptText || loading) return;

    const effectiveAgentId =
      agentIdOverride !== undefined ? agentIdOverride : selectedAgentId;

    const userMsg: ChatMessage = {
      id: `u_${Date.now()}`,
      role: "user",
      text: promptText,
    };
    setMessages((prev) => [...prev, userMsg]);
    if (!customPrompt) setChatInput("");
    setLoading(true);

    try {
      const res = await api.sendChat({
        message: promptText,
        conversation_id: activeConversationId,
        model: selectedModel,
        save_for_finetune: saveForFinetune,
        agent_id: effectiveAgentId,
      });
      if (res.conversation_id) {
        setActiveConversationId(res.conversation_id);
      }
      loadConversations();
      setMessages((prev) => [
        ...prev,
        {
          id: `a_${Date.now()}`,
          role: "agent",
          text: res.reply,
          model: res.model,
          tools: res.tools_called,
          ragSources: res.rag_sources,
          tokens: res.tokens_used,
          latencyMs: res.latency_ms,
        },
      ]);
      await refreshAll();
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          role: "agent",
          text: `❌ Erro ao comunicar com o backend: ${err.message || err}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingMemory) {
      await api.updateMemory(editingMemory.id, {
        category: editingMemory.category,
        key: editingMemory.key,
        content: editingMemory.content,
        importance: editingMemory.importance,
        pinned: editingMemory.pinned,
      });
      setEditingMemory(null);
    } else {
      if (!newMemKey.trim() || !newMemContent.trim()) return;
      await api.createMemory({
        category: newMemCategory,
        key: newMemKey.trim(),
        content: newMemContent.trim(),
        importance: newMemImportance,
        pinned: true,
      });
      setNewMemKey("");
      setNewMemContent("");
    }
    await refreshAll();
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      await api.uploadDocument(file, uploadCategory);
      await refreshAll();
    } catch (err: any) {
      alert(`Erro ao enviar arquivo: ${err.message}`);
    } finally {
      setUploadingFile(false);
      e.target.value = "";
    }
  };

  const handleInspectChunks = async (docId: number) => {
    if (selectedDocId === docId) {
      setSelectedDocId(null);
      setDocChunks([]);
      return;
    }
    const res = await api.getDocumentChunks(docId);
    setSelectedDocId(docId);
    setDocChunks(res.chunks);
  };

  const handleSaveChunkEdit = async (chunkId: number) => {
    await api.updateChunkContent(chunkId, editingChunkText);
    setEditingChunkId(null);
    if (selectedDocId) {
      const res = await api.getDocumentChunks(selectedDocId);
      setDocChunks(res.chunks);
    }
    await refreshAll();
  };

  const renderConversationList = () =>
    conversations.length === 0 ? (
      <p className="text-xs text-slate-400">
        Nenhuma conversa salva ainda. Envie uma mensagem para começar.
      </p>
    ) : (
      <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`group flex items-center gap-1 rounded-lg border text-xs ${
              conv.id === activeConversationId
                ? "border-[#3454d1] bg-[#3454d1]/10"
                : "border-transparent hover:border-slate-300 dark:hover:border-slate-700"
            }`}
          >
            <button
              onClick={() => openConversation(conv.id)}
              className="flex-1 min-w-0 text-left px-2.5 py-2"
            >
              <div className="font-semibold truncate">{conv.title}</div>
              <div className="text-[10px] text-slate-400">
                {new Date(conv.updated_at).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                • {conv.message_count} msgs
              </div>
            </button>
            <button
              onClick={() => deleteConversation(conv)}
              title="Excluir conversa"
              className="p-2 text-slate-400 hover:text-[#ea4d4d] shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    );

  // Duralux Theme Classes
  const bgCanvas = darkMode ? "bg-[#0f172a] text-slate-100" : "bg-[#f4f6f9] text-[#283c50]";
  const cardSurface = darkMode
    ? "bg-[#182235] border-slate-800 text-slate-100"
    : "bg-white border-slate-200/90 text-[#283c50]";
  const inputSurface = darkMode
    ? "bg-[#0f172a] border-slate-700 text-slate-100 placeholder-slate-500"
    : "bg-[#f8fafc] border-slate-200 text-[#283c50] placeholder-slate-400";
  const subtleSurface = darkMode
    ? "bg-slate-900/70 border-slate-800"
    : "bg-[#f8fafc] border-slate-200/80";

  const pendingTasksCount = tasks.filter((t) => t.status !== "done").length;
  const doneTasksCount = tasks.filter((t) => t.status === "done").length;
  const tasksProgressPct =
    tasks.length > 0 ? Math.round((doneTasksCount / tasks.length) * 100) : 0;

  const tabTitles: Record<ActiveTab, { title: string; section: string }> = {
    overview: { title: "Dashboard Geral", section: "Visão Geral CRM & Vida" },
    chat: { title: "Agente Gemini AI", section: "Assistente Conversacional" },
    workouts: {
      title: "Treinos & Academia (SmartWorkout)",
      section: "Diário de Treinos, Cargas, Fichas IA & Biblioteca de Exercícios",
    },
    agents: {
      title: "Central de Agentes IA",
      section: "Gerenciamento de Agentes, Prompts & Ferramentas (Tools)",
    },
    agenda: {
      title: "Agenda & Notificações",
      section: "Grade de Aulas, Entrevistas & Alertas Push",
    },
    finances: { title: "Finanças & Cartões", section: "Controle Financeiro" },
    academic: { title: "Faculdade & Estudos", section: "Gestão Acadêmica" },
    memory: { title: "Memória, RAG & Fine-Tune", section: "Base de Conhecimento" },
    telemetry: { title: "Monitoramento & Uso", section: "Telemetria do Sistema" },
  };

  return (
    <div className={`min-h-screen w-full overflow-x-hidden flex flex-col md:flex-row ${bgCanvas} transition-colors duration-200`}>
      {/* =====================================================================
          MOBILE SLIDE-OVER DRAWER MENU (< md)
      ====================================================================== */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div
            className={`relative w-[280px] max-w-[82vw] h-full flex flex-col justify-between p-4 overflow-y-auto z-10 border-r shadow-2xl ${
              darkMode
                ? "bg-[#182235] border-slate-800 text-slate-100"
                : "bg-white border-slate-200 text-[#283c50]"
            }`}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#3454d1] flex items-center justify-center text-white font-extrabold text-base">
                    B
                  </div>
                  <div className="leading-tight">
                    <div className="font-extrabold text-sm tracking-wider uppercase">
                      SECOND <span className="text-[#3454d1]">BRAIN</span>
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                      Duralux Mobile
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white text-sm font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Busca rápida no menu mobile */}
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${inputSurface}`}
              >
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={memorySearch}
                  onChange={(e) => setMemorySearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      refreshAll();
                      setActiveTab("memory");
                      setMobileMenuOpen(false);
                    }
                  }}
                  placeholder="Buscar memórias ou RAG..."
                  className="bg-transparent focus:outline-none w-full text-xs"
                />
              </div>

              {/* Configurações (modelo do agente) no mobile */}
              <button
                onClick={openSettings}
                className={`w-full flex items-center justify-between gap-2 text-xs font-semibold rounded-lg px-3 py-2.5 border ${inputSurface}`}
              >
                <span className="flex items-center gap-2">
                  <Settings className="w-4 h-4" />
                  Configurações
                </span>
                <span className="text-slate-400 truncate">{selectedModel}</span>
              </button>

              {/* Lista completa de seções */}
              <div className="space-y-1 pt-1">
                {[
                  { id: "overview", label: "Visão Geral (Dashboard)", icon: LayoutDashboard },
                  { id: "chat", label: "Agente Gemini AI", icon: MessageSquare },
                  { id: "workouts", label: "Treinos & Academia (SmartWorkout)", icon: Dumbbell },
                  { id: "agents", label: "Gerenciar Agentes IA", icon: Bot },
                  { id: "agenda", label: "Agenda & Notificações", icon: Calendar },
                  { id: "finances", label: "Finanças & Cartões", icon: Wallet },
                  { id: "academic", label: "Faculdade & Prazos", icon: GraduationCap },
                  { id: "memory", label: "Memória Core & RAG", icon: Database },
                  { id: "telemetry", label: "Monitoramento & Uso", icon: Activity },
                ].map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id as ActiveTab);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-bold transition-all ${
                        active
                          ? "bg-[#3454d1] text-white shadow-xs"
                          : darkMode
                          ? "text-slate-300 hover:bg-slate-800"
                          : "text-slate-600 hover:bg-slate-100"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  api.downloadFineTuneExport().catch((err) => window.alert(err.message));
                }}
                className="w-full py-2.5 px-3 rounded-lg bg-[#3454d1]/10 text-[#3454d1] font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                Baixar Dataset SFT (.jsonl)
              </a>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          DURALUX SIDEBAR NAVIGATION (nxl-navigation)
      ====================================================================== */}
      <aside
        className={`hidden md:flex flex-col justify-between shrink-0 border-r transition-all duration-200 select-none z-30 ${
          sidebarCollapsed ? "w-[80px]" : "w-[270px]"
        } ${
          darkMode
            ? "bg-[#182235] border-slate-800 text-slate-200"
            : "bg-white border-slate-200/90 text-[#283c50]"
        }`}
      >
        <div>
          {/* Brand Logo Header (h-16) */}
          <div
            className={`h-16 px-5 flex items-center gap-3 border-b ${
              darkMode ? "border-slate-800" : "border-slate-100"
            }`}
          >
            <div className="w-9 h-9 rounded-lg bg-[#3454d1] flex items-center justify-center text-white font-extrabold text-lg shadow-md shadow-[#3454d1]/25 shrink-0">
              B
            </div>
            {!sidebarCollapsed && (
              <div className="leading-tight overflow-hidden">
                <div className="font-extrabold text-[15px] tracking-wider uppercase flex items-center gap-1.5">
                  <span>SECOND</span>
                  <span className="text-[#3454d1]">BRAIN</span>
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                  Duralux AI Workspace
                </span>
              </div>
            )}
          </div>

          {/* Menu Groups */}
          <div className="p-3.5 space-y-5 overflow-y-auto max-h-[calc(100vh-230px)]">
            {[
              {
                group: "NAVEGAÇÃO",
                items: [
                  {
                    id: "overview",
                    label: "Visão Geral",
                    icon: LayoutDashboard,
                    badge: "CRM",
                    badgeColor: "bg-[#3454d1]/10 text-[#3454d1]",
                  },
                  {
                    id: "chat",
                    label: "Agente Gemini",
                    icon: MessageSquare,
                    badge: "IA",
                    badgeColor: "bg-[#17c666]/15 text-[#17c666]",
                  },
                ],
              },
              {
                group: "GESTÃO DO DIA A DIA",
                items: [
                  {
                    id: "workouts",
                    label: "Treinos & Academia",
                    icon: Dumbbell,
                    badge: workoutsSummary ? `${workoutsSummary.days_trained_total}d` : "IA",
                    badgeColor: "bg-[#17c666]/15 text-[#17c666]",
                  },
                  {
                    id: "agenda",
                    label: "Agenda & Notificações",
                    icon: Calendar,
                    badge: `${schedules.filter((s) => s.enabled).length}`,
                    badgeColor: "bg-[#3454d1]/15 text-[#3454d1]",
                  },
                  {
                    id: "finances",
                    label: "Finanças & Cartões",
                    icon: Wallet,
                    badge: finance ? `${finance.records.length}` : "3",
                    badgeColor: "bg-[#ffa21d]/15 text-[#ffa21d]",
                  },
                  {
                    id: "academic",
                    label: "Faculdade & Prazos",
                    icon: GraduationCap,
                    badge: `${pendingTasksCount}`,
                    badgeColor: "bg-[#ea4d4d]/15 text-[#ea4d4d]",
                  },
                ],
              },
              {
                group: "INTELIGÊNCIA & DADOS",
                items: [
                  {
                    id: "agents",
                    label: "Agentes IA",
                    icon: Bot,
                    badge: `${agents.filter((a) => a.enabled).length}`,
                    badgeColor: "bg-[#3454d1]/15 text-[#3454d1]",
                  },
                  {
                    id: "memory",
                    label: "Memória & RAG",
                    icon: Database,
                    badge: `${memories.length + documents.length}`,
                    badgeColor: "bg-[#3454d1]/10 text-[#3454d1]",
                  },
                  {
                    id: "telemetry",
                    label: "Monitoramento & Uso",
                    icon: Activity,
                    badge: "Live",
                    badgeColor: "bg-[#3dc7be]/15 text-[#3dc7be]",
                  },
                ],
              },
            ].map((section) => (
              <div key={section.group} className="space-y-1">
                {!sidebarCollapsed && (
                  <div className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {section.group}
                  </div>
                )}
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveTab(item.id as ActiveTab)}
                      title={item.label}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-all ${
                        active
                          ? darkMode
                            ? "bg-[#3454d1]/20 text-white border-l-4 border-[#3454d1]"
                            : "bg-[#3454d1]/10 text-[#3454d1] border-l-4 border-[#3454d1]"
                          : darkMode
                          ? "text-slate-400 hover:bg-slate-800/70 hover:text-slate-100"
                          : "text-slate-600 hover:bg-slate-100/80 hover:text-[#283c50]"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon
                          className={`w-4 h-4 shrink-0 ${
                            active ? "text-[#3454d1]" : "text-slate-400"
                          }`}
                        />
                        {!sidebarCollapsed && (
                          <span className="truncate">{item.label}</span>
                        )}
                      </div>
                      {!sidebarCollapsed && item.badge && (
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${item.badgeColor}`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Duralux Bottom Promo / Memory Center Card */}
        {!sidebarCollapsed && (
          <div className="p-4">
            <div
              className={`rounded-xl p-4 border text-center space-y-2.5 ${
                darkMode
                  ? "bg-slate-900/90 border-slate-800"
                  : "bg-[#f8fafc] border-slate-200/80"
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-[#3454d1]/10 text-[#3454d1] flex items-center justify-center mx-auto">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-bold text-xs">Centro de Memória RAG</h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {telemetry?.memory_stats.total_files_uploaded ?? 0} arquivos •{" "}
                  {telemetry?.memory_stats.total_rag_chunks ?? 0} chunks ativos
                </p>
              </div>
              <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#3454d1] rounded-full"
                  style={{ width: "68%" }}
                />
              </div>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  api.downloadFineTuneExport().catch((err) => window.alert(err.message));
                }}
                className="w-full py-2 px-3 rounded-lg bg-[#3454d1] hover:bg-[#2945b8] text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Baixar Dataset SFT
              </a>
            </div>
          </div>
        )}
      </aside>

      {/* =====================================================================
          MAIN CONTENT WRAPPER (Header + Subheader + Page Viewport)
      ====================================================================== */}
      <div className="flex-1 flex flex-col min-w-0 pb-24 md:pb-8">
        {/* DURALUX TOP HEADER BAR (h-14 md:h-16) */}
        <header
          className={`h-14 md:h-16 px-3 sm:px-4 md:px-6 border-b flex items-center justify-between gap-2 sticky top-0 z-20 ${
            darkMode
              ? "bg-[#182235]/95 border-slate-800"
              : "bg-white/95 border-slate-200/90"
          } backdrop-blur`}
        >
          {/* Left Controls: Mobile Drawer Button + Brand / Desktop Hamburger + Search + Mega CTA */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Mobile Hamburger Button */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className={`md:hidden p-2 rounded-lg border shrink-0 transition-colors ${
                darkMode
                  ? "border-slate-700 hover:bg-slate-800 text-slate-300"
                  : "border-slate-200 hover:bg-slate-100 text-slate-600"
              }`}
              title="Abrir menu"
            >
              <Menu className="w-4 h-4" />
            </button>

            {/* Mobile Compact Brand Logo */}
            <div
              onClick={() => setActiveTab("overview")}
              className="md:hidden flex items-center gap-2 cursor-pointer min-w-0"
            >
              <div className="w-7 h-7 rounded-lg bg-[#3454d1] flex items-center justify-center text-white font-extrabold text-xs shrink-0">
                B
              </div>
              <span className="font-extrabold text-xs tracking-wider uppercase whitespace-nowrap">
                SECOND <span className="text-[#3454d1]">BRAIN</span>
              </span>
            </div>

            {/* Desktop Sidebar Collapse Button */}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className={`hidden md:flex p-2 rounded-lg border transition-colors ${
                darkMode
                  ? "border-slate-700 hover:bg-slate-800 text-slate-300"
                  : "border-slate-200 hover:bg-slate-100 text-slate-600"
              }`}
              title="Alternar menu lateral"
            >
              <Menu className="w-4 h-4" />
            </button>

            <div
              className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs w-48 lg:w-64 ${inputSurface}`}
            >
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                value={memorySearch}
                onChange={(e) => setMemorySearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    refreshAll();
                    setActiveTab("memory");
                  }
                }}
                placeholder="Buscar memórias, contas ou RAG..."
                className="bg-transparent focus:outline-none w-full text-xs"
              />
            </div>

            <button
              onClick={() => setActiveTab("chat")}
              className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#3454d1]/10 text-[#3454d1] hover:bg-[#3454d1] hover:text-white text-xs font-bold transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Perguntar ao Gemini
            </button>
          </div>

          {/* Right Controls: Model Pill + Theme Skin Toggle + Notifications + Profile */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <button
              onClick={openSettings}
              title="Configurações"
              className={`flex items-center gap-1.5 p-2 rounded-lg border transition-colors ${
                darkMode
                  ? "border-slate-700 bg-slate-800 text-slate-300"
                  : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Settings className="w-4 h-4" />
              <span className="hidden md:inline text-xs font-semibold max-w-[140px] truncate">
                {selectedModel}
              </span>
            </button>

            {/* Light / Dark Skin Toggle (Duralux Header Feature) */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              title={darkMode ? "Mudar para Tema Claro Duralux" : "Mudar para Tema Escuro Duralux"}
              className={`p-2 rounded-lg border transition-colors ${
                darkMode
                  ? "border-slate-700 bg-slate-800 text-amber-400"
                  : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              onClick={refreshAll}
              title="Sincronizar Dados"
              className={`hidden sm:block p-2 rounded-lg border transition-colors ${
                darkMode
                  ? "border-slate-700 bg-slate-800 text-slate-300"
                  : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {/* Notification Bell with Badge -> Opens Agenda & Notifications */}
            <button
              onClick={() => setActiveTab("agenda")}
              title="Abrir Agenda de Aulas, Entrevistas e Notificações"
              className={`relative p-2 rounded-lg border transition-colors ${
                darkMode
                  ? "border-slate-700 bg-slate-800 text-slate-300"
                  : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Bell className="w-4 h-4" />
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#ea4d4d] text-white text-[10px] font-bold flex items-center justify-center">
                {schedules.filter((s) => s.enabled).length}
              </span>
            </button>

            {/* User Profile Chip */}
            <div
              className={`hidden sm:flex items-center gap-2 pl-2 border-l ${
                darkMode ? "border-slate-800" : "border-slate-200"
              }`}
            >
              <div className="relative">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-tr from-[#3454d1] to-[#3dc7be] text-white font-bold text-xs flex items-center justify-center">
                  W
                </div>
                <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#17c666] border-2 border-white dark:border-slate-900 absolute -bottom-0.5 -right-0.5" />
              </div>
              <div className="hidden sm:block leading-tight">
                <div className="text-xs font-bold capitalize">{username}</div>
                <div className="text-[10px] text-slate-400 font-medium">
                  Second Brain Admin
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* DURALUX SUB-HEADER / BREADCRUMB BAR (page-header) */}
        <div
          className={`px-3 sm:px-4 md:px-6 py-2.5 sm:py-3.5 border-b flex flex-wrap items-center justify-between gap-2 ${
            darkMode
              ? "bg-[#182235]/60 border-slate-800"
              : "bg-white border-slate-200/80"
          }`}
        >
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <h1 className="font-bold text-sm sm:text-base tracking-tight truncate">
              {tabTitles[activeTab].title}
            </h1>
            <span className="hidden sm:inline text-slate-300 dark:text-slate-700">|</span>
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 font-medium truncate">
              <span>Home</span>
              <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              <span className="text-[#3454d1] font-semibold truncate">
                {tabTitles[activeTab].section}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setActiveTab("memory")}
              className={`hidden sm:flex px-2.5 sm:px-3 py-1.5 rounded-lg border text-[11px] sm:text-xs font-semibold items-center gap-1.5 transition-colors ${
                darkMode
                  ? "border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200"
                  : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700"
              }`}
            >
              <Upload className="w-3.5 h-3.5 text-[#3454d1] shrink-0" />
              <span className="hidden xs:inline sm:inline">Arquivo</span> RAG
            </button>
            <button
              onClick={() => setActiveTab("chat")}
              className="px-2.5 sm:px-3.5 py-1.5 rounded-lg bg-[#3454d1] hover:bg-[#2945b8] text-white text-[11px] sm:text-xs font-semibold flex items-center gap-1 shadow-sm transition-colors"
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              Comando IA
            </button>
          </div>
        </div>

        {/* ===================================================================
            VIEW 1: OVERVIEW (DURALUX MAIN CRM / PERSONAL DASHBOARD)
        ==================================================================== */}
        {activeTab === "overview" && (
          <div className="p-4 md:p-6 max-w-[1440px] w-full mx-auto space-y-6">
            {/* 4 DURALUX SIGNATURE KPI CARDS WITH PROGRESS BARS */}
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-5">
              {/* KPI 1: Meu Saldo Atual & Limite Disponível */}
              <div className={`duralux-card rounded-xl border p-3.5 sm:p-5 ${cardSurface}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="hidden sm:flex w-11 h-11 rounded-full bg-[#3454d1]/10 text-[#3454d1] items-center justify-center shrink-0">
                      <Wallet className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-base sm:text-xl font-extrabold tracking-tight leading-tight">
                        R${" "}
                        {(finance?.total_balance ?? 0).toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                        })}
                      </div>
                      <div className="text-[11px] sm:text-xs font-semibold text-slate-400 leading-snug">
                        Meu Saldo Atual em Conta
                      </div>
                    </div>
                  </div>
                  <MoreVertical className="hidden sm:block w-4 h-4 text-slate-400" />
                </div>

                <div className="mt-3 sm:mt-5 pt-3 border-t border-dashed border-slate-200 dark:border-slate-800">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-0.5 text-[11px] sm:text-xs mb-1.5">
                    <span className="text-slate-400 font-medium">
                      Limite Cartões Disponível
                    </span>
                    <span className="font-bold text-[#3454d1]">
                      R${" "}
                      {(
                        finance?.total_credit_available ??
                        finance?.total_credit_limit ??
                        0
                      ).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#3454d1] rounded-full"
                      style={{
                        width: `${
                          finance?.total_credit_limit
                            ? Math.round(
                                ((finance.total_credit_available ?? 0) / finance.total_credit_limit) * 100
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* KPI 2: Previsão de Quanto Vai Sobrar do Salário */}
              <div className={`duralux-card rounded-xl border p-3.5 sm:p-5 ${cardSurface}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="hidden sm:flex w-11 h-11 rounded-full bg-[#17c666]/15 text-[#17c666] items-center justify-center shrink-0">
                      <CreditCard className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-base sm:text-xl font-extrabold tracking-tight leading-tight text-[#17c666]">
                        R${" "}
                        {(
                          finance?.salary_forecast?.current_month_leftover ?? 0
                        ).toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                        })}
                      </div>
                      <div className="text-[11px] sm:text-xs font-semibold text-slate-400 leading-snug">
                        Sobra do Salário no Mês (R${" "}
                        {(finance?.monthly_salary ?? 0).toFixed(0)})
                      </div>
                    </div>
                  </div>
                  <MoreVertical className="hidden sm:block w-4 h-4 text-slate-400" />
                </div>

                <div className="mt-3 sm:mt-5 pt-3 border-t border-dashed border-slate-200 dark:border-slate-800">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-0.5 text-[11px] sm:text-xs mb-1.5">
                    <span className="text-slate-400 font-medium">
                      Parcelas + Cartão p/ Próx. Mês
                    </span>
                    <span className="font-bold text-[#ffa21d]">
                      R${" "}
                      {(
                        finance?.salary_forecast
                          ?.next_month_cards_and_installments ?? 0
                      ).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#17c666] rounded-full"
                      style={{
                        width: `${Math.max(
                          10,
                          100 -
                            (finance?.salary_forecast?.committed_percent ?? 0)
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* KPI 3: Atividades da Faculdade */}
              <div className={`duralux-card rounded-xl border p-3.5 sm:p-5 ${cardSurface}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="hidden sm:flex w-11 h-11 rounded-full bg-[#17c666]/15 text-[#17c666] items-center justify-center shrink-0">
                      <GraduationCap className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-base sm:text-xl font-extrabold tracking-tight leading-tight">
                        {pendingTasksCount} Pendentes
                      </div>
                      <div className="text-[11px] sm:text-xs font-semibold text-slate-400 leading-snug">
                        Provas & Projetos Faculdade
                      </div>
                    </div>
                  </div>
                  <MoreVertical className="hidden sm:block w-4 h-4 text-slate-400" />
                </div>

                <div className="mt-3 sm:mt-5 pt-3 border-t border-dashed border-slate-200 dark:border-slate-800">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-0.5 text-[11px] sm:text-xs mb-1.5">
                    <span className="text-slate-400 font-medium">
                      Taxa de Conclusão do Semestre
                    </span>
                    <span className="font-bold text-[#17c666]">
                      {tasksProgressPct}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#17c666] rounded-full"
                      style={{ width: `${tasksProgressPct}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* KPI 4: Memória Core & Arquivos RAG */}
              <div className={`duralux-card rounded-xl border p-3.5 sm:p-5 ${cardSurface}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="hidden sm:flex w-11 h-11 rounded-full bg-[#ea4d4d]/15 text-[#ea4d4d] items-center justify-center shrink-0">
                      <Brain className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-base sm:text-xl font-extrabold tracking-tight leading-tight">
                        {memories.length} Fatos /{" "}
                        {telemetry?.memory_stats.total_files_uploaded ?? 0} Arqs
                      </div>
                      <div className="text-[11px] sm:text-xs font-semibold text-slate-400 leading-snug">
                        Memória Core & Vetores RAG
                      </div>
                    </div>
                  </div>
                  <MoreVertical className="hidden sm:block w-4 h-4 text-slate-400" />
                </div>

                <div className="mt-3 sm:mt-5 pt-3 border-t border-dashed border-slate-200 dark:border-slate-800">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-0.5 text-[11px] sm:text-xs mb-1.5">
                    <span className="text-slate-400 font-medium">
                      Espaço de Memória ({formatBytes(telemetry?.memory_stats.db_disk_bytes ?? 0)})
                    </span>
                    <span className="font-bold text-[#ea4d4d]">
                      {telemetry?.memory_stats.total_rag_chunks ?? 0} chunks
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#ea4d4d] rounded-full"
                      style={{
                        width: `${Math.min(100, (telemetry?.memory_stats.total_rag_chunks ?? 0) / 5)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* BARRA DE COMANDO RÁPIDO DO AGENTE GEMINI NO TOPO DO DASHBOARD */}
            <div
              className={`duralux-card rounded-xl border p-4 flex flex-col md:flex-row items-center gap-3 ${cardSurface}`}
            >
              <div className="flex items-center gap-2.5 shrink-0">
                <div className="w-9 h-9 rounded-lg bg-[#3454d1] text-white flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold">Comando Rápido para o Gemini</div>
                  <div className="text-[11px] text-slate-400">
                    Registra contas, atualiza saldos ou consulta o RAG automaticamente
                  </div>
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!chatInput.trim()) return;
                  setActiveTab("chat");
                  handleSendMessage();
                }}
                className="flex-1 w-full flex gap-2"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ex: 'Gastei R$ 82 no mercado' ou 'Prova dia 22/11'..."
                  className={`flex-1 min-w-0 rounded-lg px-3.5 py-2 text-xs border focus:outline-none focus:border-[#3454d1] ${inputSurface}`}
                />
                <button
                  type="submit"
                  className="bg-[#3454d1] hover:bg-[#2945b8] text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0"
                >
                  <Send className="w-3.5 h-3.5" />
                  Executar
                </button>
              </form>
            </div>

            {/* ROW 2: CHARTS (8 COLS PAYMENT/USAGE RECORD + 4 COLS MEMORY DONUT) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8">
                <PaymentAndUsageChart
                  finance={finance}
                  telemetry={telemetry}
                  darkMode={darkMode}
                />
              </div>
              <div className="lg:col-span-4">
                <MemoryDonutChart telemetry={telemetry} darkMode={darkMode} />
              </div>
            </div>

            {/* ROW 3: DURALUX TABLES (LATEST BILLS & UPCOMING UNIVERSITY TASKS) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Tabela de Contas de Cartão e Lançamentos (7 colunas) */}
              <div className={`lg:col-span-7 duralux-card rounded-xl border ${cardSurface}`}>
                <div
                  className={`px-4 sm:px-6 py-4 border-b flex items-center justify-between gap-2 ${
                    darkMode ? "border-slate-800" : "border-slate-100"
                  }`}
                >
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm sm:text-[15px] truncate">
                      Últimas Contas de Cartão & Lançamentos
                    </h3>
                    <p className="text-xs text-slate-400">
                      Toque no status para alternar entre Pendente e Pago
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab("finances")}
                    className="text-xs font-bold text-[#3454d1] hover:underline flex items-center gap-1 shrink-0"
                  >
                    Ver Tudo <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Lista Mobile Compacta (< md) */}
                <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                  {(finance?.records ?? []).slice(0, 6).map((rec) => (
                    <div key={rec.id} className="p-3.5 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-xs truncate">{rec.title}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                          <span>{rec.account_name}</span>
                          <span>•</span>
                          <span>{rec.due_date || "—"}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <span
                          className={`text-xs font-extrabold whitespace-nowrap ${
                            rec.record_type === "income"
                              ? "text-[#17c666]"
                              : "text-[#ea4d4d]"
                          }`}
                        >
                          {rec.record_type === "income" ? "+" : "-"} R${" "}
                          {rec.amount.toFixed(2)}
                        </span>
                        <button
                          onClick={async () => {
                            await api.updateFinanceRecord(rec.id, {
                              status: rec.status === "paid" ? "pending" : "paid",
                            });
                            refreshAll();
                          }}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            rec.status === "paid"
                              ? "bg-[#17c666]/15 text-[#17c666]"
                              : "bg-[#ffa21d]/15 text-[#ffa21d]"
                          }`}
                        >
                          {rec.status === "paid" ? "Pago" : "Pendente"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Tabela Desktop (>= md) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr
                        className={`border-b uppercase text-[11px] font-bold text-slate-400 ${
                          darkMode ? "border-slate-800 bg-slate-900/40" : "border-slate-100 bg-slate-50/70"
                        }`}
                      >
                        <th className="py-3 px-5">Lançamento</th>
                        <th className="py-3 px-4">Conta / Cartão</th>
                        <th className="py-3 px-4">Vencimento</th>
                        <th className="py-3 px-4">Valor</th>
                        <th className="py-3 px-5 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {(finance?.records ?? []).slice(0, 6).map((rec) => (
                        <tr key={rec.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="py-3.5 px-5">
                            <div className="font-bold text-[13px]">{rec.title}</div>
                            <div className="text-[11px] text-slate-400 capitalize">
                              {rec.category}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 font-medium text-slate-500 dark:text-slate-300">
                            {rec.account_name}
                          </td>
                          <td className="py-3.5 px-4 text-slate-400">
                            {rec.due_date || "—"}
                          </td>
                          <td
                            className={`py-3.5 px-4 font-extrabold whitespace-nowrap ${
                              rec.record_type === "income"
                                ? "text-[#17c666]"
                                : "text-[#ea4d4d]"
                            }`}
                          >
                            {rec.record_type === "income" ? "+" : "-"} R${" "}
                            {rec.amount.toFixed(2)}
                          </td>
                          <td className="py-3.5 px-5 text-right">
                            <button
                              onClick={async () => {
                                await api.updateFinanceRecord(rec.id, {
                                  status: rec.status === "paid" ? "pending" : "paid",
                                });
                                refreshAll();
                              }}
                              className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${
                                rec.status === "paid"
                                  ? "bg-[#17c666]/15 text-[#17c666]"
                                  : "bg-[#ffa21d]/15 text-[#ffa21d]"
                              }`}
                            >
                              {rec.status === "paid" ? "Pago" : "Pendente"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Card de Atividades da Faculdade & Memórias Recentes (5 colunas) */}
              <div className={`lg:col-span-5 duralux-card rounded-xl border ${cardSurface}`}>
                <div
                  className={`px-4 sm:px-6 py-4 border-b flex items-center justify-between gap-2 ${
                    darkMode ? "border-slate-800" : "border-slate-100"
                  }`}
                >
                  <div className="min-w-0">
                    <h3 className="font-bold text-sm sm:text-[15px]">
                      Prazos da Faculdade & Projetos
                    </h3>
                    <p className="text-xs text-slate-400">
                      Entregas prioritárias monitoradas pelo Agente
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab("academic")}
                    className="text-xs font-bold text-[#3454d1] hover:underline flex items-center gap-1 shrink-0"
                  >
                    Gerenciar <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="p-4 sm:p-5 space-y-3.5">
                  {tasks.slice(0, 5).map((t) => (
                    <div
                      key={t.id}
                      className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${subtleSurface}`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-[#3454d1]/10 text-[#3454d1]">
                            {t.subject}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              t.priority === "critical" || t.priority === "high"
                                ? "bg-[#ea4d4d]/15 text-[#ea4d4d]"
                                : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                            }`}
                          >
                            {t.priority}
                          </span>
                        </div>
                        <div className="font-bold text-xs mt-1.5 break-words">
                          {t.title}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3 shrink-0" />
                          Entrega: {t.due_date || "Sem data"}
                        </div>
                      </div>

                      <select
                        value={t.status}
                        onChange={async (e) => {
                          await api.updateAcademicTask(t.id, {
                            status: e.target.value,
                          });
                          refreshAll();
                        }}
                        className={`w-full sm:w-auto text-[11px] font-bold rounded-lg px-2.5 py-1.5 border shrink-0 ${inputSurface}`}
                      >
                        <option value="todo">Pendente</option>
                        <option value="in_progress">Andamento</option>
                        <option value="done">Concluído</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            VIEW 2: GEMINI CHAT AGENT (DURALUX APPS > CHAT LAYOUT)
        ==================================================================== */}
        {activeTab === "chat" && (
          <div className="p-3 sm:p-4 md:p-6 max-w-[1440px] w-full mx-auto flex flex-col lg:flex-row gap-3 lg:gap-6 h-[calc(100dvh-201px)] md:h-auto md:flex-1">
            {/* Barra Horizontal de Comandos Rápidos no Mobile (< lg) */}
            <div className="lg:hidden shrink-0 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              {(
                agents.find((a) => a.id === selectedAgentId)?.quick_prompts ?? [
                  "Qual o valor do meu salário?",
                  "Monte um treino ABC de hipertrofia para mim",
                  "Anote meu treino de hoje: Supino Reto 4x10 com 80kg",
                  "Gastei R$ 64,90 no iFood hoje",
                  "Resumo completo das contas, treinos e faculdade",
                ]
              ).map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => handleSendMessage(prompt)}
                  className={`shrink-0 text-xs px-3 py-2 rounded-full border font-semibold transition-all active:scale-95 ${cardSurface}`}
                >
                  ✨ {prompt}
                </button>
              ))}
            </div>

            {/* Conversas salvas no mobile (< lg) */}
            <div className="lg:hidden shrink-0 flex items-center gap-2">
              <button
                onClick={() => setShowConversationsMobile(!showConversationsMobile)}
                className={`flex-1 text-xs font-bold px-3 py-2 rounded-lg border flex items-center justify-between ${cardSurface}`}
              >
                <span className="flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" />
                  Conversas ({conversations.length})
                </span>
                <ChevronRight
                  className={`w-3.5 h-3.5 transition-transform ${showConversationsMobile ? "rotate-90" : ""}`}
                />
              </button>
              <button
                onClick={startNewConversation}
                className="text-xs font-bold px-3 py-2 rounded-lg bg-[#3454d1] text-white flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Nova
              </button>
            </div>
            {showConversationsMobile && (
              <div className={`lg:hidden duralux-card rounded-xl border p-3 ${cardSurface}`}>
                {renderConversationList()}
              </div>
            )}

            {/* Painel Lateral Esquerdo Estilo Duralux Chat Sidebar (Desktop >= lg) */}
            <div className={`hidden lg:block lg:w-80 shrink-0 duralux-card rounded-xl border p-5 space-y-5 ${cardSurface}`}>
              {/* Seletor de Agente Especialista */}
              <div className="space-y-2 pb-3 border-b border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Agente Ativo
                  </span>
                  <button
                    onClick={() => setActiveTab("agents")}
                    className="text-[11px] font-bold text-[#3454d1] hover:underline flex items-center gap-1"
                  >
                    <Bot className="w-3 h-3" /> Gerenciar Agentes
                  </button>
                </div>
                <div className="space-y-1.5">
                  {agents
                    .filter((a) => a.enabled)
                    .map((ag) => {
                      const isSel = ag.id === selectedAgentId;
                      return (
                        <button
                          key={ag.id}
                          onClick={() => setSelectedAgentId(ag.id)}
                          className={`w-full flex items-center gap-2.5 p-2 rounded-lg border text-left text-xs transition-all ${
                            isSel
                              ? "border-[#3454d1] bg-[#3454d1]/10"
                              : "border-transparent hover:border-slate-300 dark:hover:border-slate-700"
                          }`}
                        >
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0"
                            style={{ backgroundColor: ag.color || "#3454d1" }}
                          >
                            {renderAgentIcon(ag.icon, "w-3.5 h-3.5")}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="font-bold truncate">{ag.name}</div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {ag.role}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-sm flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-[#3454d1]" />
                    Conversas Salvas
                  </h3>
                  <button
                    onClick={startNewConversation}
                    className="text-xs font-bold px-2.5 py-1.5 rounded-lg bg-[#3454d1] text-white flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Nova
                  </button>
                </div>
                {renderConversationList()}
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#3454d1]" />
                  Comandos Rápidos do Agente
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Clique para acionar as tools deste agente
                </p>
              </div>

              <div className="space-y-2">
                {(
                  agents.find((a) => a.id === selectedAgentId)?.quick_prompts ?? [
                    "Monte um treino ABC de hipertrofia usando halteres, barra e polia",
                    "Anote meu treino de hoje: Supino Reto 4x10 com 80kg e Tríceps Polia 4x12 com 35kg",
                    "Gastei R$ 64,90 no iFood pelo cartão Nubank hoje",
                    "Tenho prova de Inteligência Artificial dia 20/11 valendo 10 pontos",
                    "Me dê um resumo completo das minhas contas, treinos e faculdade",
                  ]
                ).map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSendMessage(prompt)}
                    className={`w-full text-left text-xs p-2.5 rounded-lg border transition-all hover:border-[#3454d1] ${subtleSurface}`}
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3 text-xs">
                <div className="font-bold text-xs">Configurações da Interação</div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveForFinetune}
                    onChange={(e) => setSaveForFinetune(e.target.checked)}
                    className="rounded border-slate-300 text-[#3454d1]"
                  />
                  <span className="text-slate-500 dark:text-slate-300">
                    Salvar respostas no dataset de Fine-Tuning (.jsonl)
                  </span>
                </label>

              </div>
            </div>

            {/* Área Principal de Mensagens Duralux Chat */}
            <div className={`flex-1 min-h-0 duralux-card rounded-xl border flex flex-col overflow-hidden ${cardSurface}`}>
              <div
                className={`px-4 sm:px-6 py-3.5 sm:py-4 border-b flex flex-wrap items-center justify-between gap-2 ${
                  darkMode ? "border-slate-800" : "border-slate-100"
                }`}
              >
                {(() => {
                  const activeAg = agents.find((a) => a.id === selectedAgentId);
                  return (
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                      <div
                        className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-white flex items-center justify-center font-bold text-xs sm:text-sm shrink-0 shadow-sm"
                        style={{ backgroundColor: activeAg?.color || "#3454d1" }}
                      >
                        {activeAg ? renderAgentIcon(activeAg.icon, "w-5 h-5") : "AI"}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-xs sm:text-sm truncate">
                          {activeAg ? activeAg.name : "Second Brain Agent"} ({selectedModel})
                        </div>
                        <div className="text-[10px] sm:text-[11px] text-[#17c666] font-semibold flex items-center gap-1 truncate">
                          <span className="w-2 h-2 rounded-full bg-[#17c666] shrink-0" />
                          Online • {activeAg ? activeAg.tools_enabled.length : 14} Tools + Busca Híbrida RAG
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="flex items-center gap-2">
                  <select
                    value={selectedAgentId ?? ""}
                    onChange={(e) =>
                      setSelectedAgentId(e.target.value ? Number(e.target.value) : null)
                    }
                    className={`lg:hidden rounded-lg px-2.5 py-1.5 text-xs font-bold border ${inputSurface}`}
                  >
                    {agents
                      .filter((a) => a.enabled)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          🤖 {a.name}
                        </option>
                      ))}
                  </select>
                  <button
                    onClick={() => setActiveTab("agents")}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold hover:border-[#3454d1] flex items-center gap-1.5"
                  >
                    <Bot className="w-3.5 h-3.5 text-[#3454d1]" />
                    <span className="hidden sm:inline">Agentes</span>
                  </button>
                </div>
              </div>

              <div
                ref={chatScrollRef}
                className="flex-1 min-h-0 p-3 sm:p-5 overflow-y-auto space-y-4 md:min-h-[50vh] lg:max-h-[64vh]"
              >
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex flex-col ${
                      m.role === "user" ? "items-end" : "items-start"
                    }`}
                  >
                    <div
                      className={`max-w-[92%] sm:max-w-3xl rounded-2xl px-3.5 sm:px-4 py-3 sm:py-3.5 text-xs sm:text-sm leading-relaxed break-words ${
                        m.role === "user"
                          ? "bg-[#3454d1] text-white shadow-sm"
                          : darkMode
                          ? "bg-slate-900 border border-slate-800 text-slate-100"
                          : "bg-[#f8fafc] border border-slate-200/90 text-[#283c50]"
                      }`}
                    >
                      {m.role === "agent" ? (
                        <Markdown text={m.text} />
                      ) : (
                        <span className="whitespace-pre-wrap">{m.text}</span>
                      )}

                      {/* Tool Calls Executadas */}
                      {m.tools && m.tools.length > 0 && (
                        <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-800 space-y-1.5">
                          <div className="text-[11px] font-bold text-[#3454d1] flex items-center gap-1">
                            <Wrench className="w-3.5 h-3.5 shrink-0" />
                            Tools Acionadas pelo Gemini:
                          </div>
                          {m.tools.map((t, idx) => (
                            <div
                              key={idx}
                              className="text-xs bg-[#3454d1]/10 border border-[#3454d1]/20 rounded-lg px-2.5 py-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 sm:gap-2"
                            >
                              <span className="font-mono font-bold text-[11px] text-[#3454d1]">
                                {t.name}()
                              </span>
                              <span className="font-medium break-words">{t.result_summary}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Fontes do RAG */}
                      {m.ragSources && m.ragSources.length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                          <div className="text-[11px] font-bold text-[#17c666] mb-1">
                            📄 Fontes recuperadas do RAG:
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {m.ragSources.map((s, idx) => (
                              <span
                                key={idx}
                                className="text-[11px] bg-[#17c666]/10 border border-[#17c666]/30 text-[#17c666] px-2 py-0.5 rounded-md font-semibold break-all"
                              >
                                {s.filename} (Chunk #{s.chunk_index + 1} • {s.score})
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {m.role === "agent" && (m.tokens || m.latencyMs) ? (
                        <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-3">
                          {m.tokens ? <span>⚡ {m.tokens} tokens</span> : null}
                          {m.latencyMs ? <span>⏱️ {m.latencyMs} ms</span> : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="text-xs font-semibold text-[#3454d1] animate-pulse px-2">
                    🧠 Gemini está consultando sua memória e executando tools...
                  </div>
                )}
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className={`p-3 sm:p-4 border-t flex gap-2 ${
                  darkMode ? "border-slate-800 bg-slate-900/40" : "border-slate-100 bg-slate-50/60"
                }`}
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Digite sua pergunta ou comando..."
                  className={`flex-1 min-w-0 rounded-xl px-3.5 py-2.5 text-sm border focus:outline-none focus:border-[#3454d1] ${inputSurface}`}
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-[#3454d1] hover:bg-[#2945b8] disabled:opacity-50 text-white px-4 sm:px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm shrink-0"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Enviar</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* MENU DE CONFIGURAÇÕES */}
        {showSettings && (
          <div
            className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
            onClick={() => setShowSettings(false)}
          >
            <form
              onSubmit={saveSettings}
              onClick={(e) => e.stopPropagation()}
              className={`w-full max-w-md rounded-xl border p-5 space-y-4 shadow-2xl ${cardSurface}`}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Settings className="w-4 h-4 text-[#3454d1]" />
                  Configurações
                </h3>
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="text-xs text-slate-400 hover:text-slate-200 font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Versão do modelo do agente
                </label>
                <div className="space-y-1.5">
                  {availableModels.map((m) => (
                    <label
                      key={m}
                      className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg border cursor-pointer ${
                        settingsModelDraft === m
                          ? "border-[#3454d1] bg-[#3454d1]/10"
                          : "border-slate-200 dark:border-slate-700"
                      }`}
                    >
                      <input
                        type="radio"
                        name="agent-model"
                        checked={settingsModelDraft === m}
                        onChange={() => setSettingsModelDraft(m)}
                      />
                      <span className="font-mono">{m}</span>
                    </label>
                  ))}
                </div>
                <label className="block text-[11px] text-slate-400 pt-1">
                  Ou digite o nome de outro modelo:
                </label>
                <input
                  value={settingsModelDraft}
                  onChange={(e) => setSettingsModelDraft(e.target.value)}
                  placeholder="ex: gemini-3.8-flash"
                  className={`w-full rounded-lg px-3 py-2 text-xs border font-mono ${inputSurface}`}
                />
                <p className="text-[11px] text-slate-400">
                  Se o modelo escolhido falhar, o agente tenta automaticamente um modelo reserva.
                </p>
              </div>

              <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Conta ({username})
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="password"
                    autoComplete="current-password"
                    placeholder="Senha atual"
                    value={pwCurrent}
                    onChange={(e) => setPwCurrent(e.target.value)}
                    className={`rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
                  />
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder="Nova senha (mín. 8)"
                    value={pwNew}
                    onChange={(e) => setPwNew(e.target.value)}
                    className={`rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
                  />
                </div>
                {pwMessage && <p className="text-[11px] text-slate-400">{pwMessage}</p>}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={!pwCurrent || pwNew.length < 8}
                    onClick={async () => {
                      try {
                        await api.changePassword(pwCurrent, pwNew);
                        setPwCurrent("");
                        setPwNew("");
                        setPwMessage("✅ Senha alterada. Outros aparelhos foram desconectados.");
                      } catch (err: any) {
                        setPwMessage(`❌ ${err.message || err}`);
                      }
                    }}
                    className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold disabled:opacity-40"
                  >
                    Trocar senha
                  </button>
                  <button
                    type="button"
                    onClick={onLogout}
                    className="px-3 py-2 rounded-lg text-xs font-bold text-[#ea4d4d] border border-[#ea4d4d]/40 hover:bg-[#ea4d4d]/10"
                  >
                    Sair da conta
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="px-3 py-2 text-xs font-bold text-slate-400"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-4 py-2 rounded-lg bg-[#3454d1] hover:bg-[#2945b8] text-white text-xs font-bold disabled:opacity-50"
                >
                  {savingSettings ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TOAST FLUTUANTE DE NOTIFICAÇÃO DISPARADA */}
        {activeToastAlert && (
          <div className="fixed top-16 sm:top-20 inset-x-3 sm:left-auto sm:right-6 z-50 sm:max-w-sm bg-[#283c50] text-white rounded-xl shadow-2xl border border-[#3454d1] p-4 flex items-start justify-between gap-3 animate-bounce">
            <div className="space-y-1">
              <div className="text-xs font-extrabold text-[#3dc7be] flex items-center gap-1.5">
                <Bell className="w-3.5 h-3.5" />
                {activeToastAlert.title} ({activeToastAlert.time})
              </div>
              <p className="text-xs text-slate-200 leading-relaxed">
                {activeToastAlert.message}
              </p>
            </div>
            <button
              onClick={() => setActiveToastAlert(null)}
              className="text-xs text-slate-300 hover:text-white font-bold px-2 py-0.5 rounded bg-white/10"
            >
              OK
            </button>
          </div>
        )}

        {/* ===================================================================
            VIEW 2.2: TREINOS & ACADEMIA (SMARTWORKOUT)
        ==================================================================== */}
        {activeTab === "workouts" && (
          <WorkoutsSection
            summary={workoutsSummary}
            exercises={workoutExercises}
            darkMode={darkMode}
            onRefresh={refreshAll}
            onOpenCoachInChat={(prompt) => {
              const coachAgent = agents.find((a) => a.slug === "smartworkout-coach");
              if (coachAgent) setSelectedAgentId(coachAgent.id);
              setActiveTab("chat");
              if (prompt) handleSendMessage(prompt, coachAgent?.id);
            }}
            onManageAgents={() => setActiveTab("agents")}
          />
        )}

        {/* ===================================================================
            VIEW 2.4: SEÇÃO DE AGENTES IA (GERENCIAMENTO & TOOLS)
        ==================================================================== */}
        {activeTab === "agents" && (
          <AgentsSection
            agents={agents}
            availableTools={agentTools}
            availableModels={
              availableModels.length > 0
                ? availableModels
                : ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"]
            }
            darkMode={darkMode}
            selectedAgentId={selectedAgentId}
            onSelectAgentForChat={(agent, initialPrompt) => {
              setSelectedAgentId(agent.id);
              setActiveTab("chat");
              if (initialPrompt) {
                handleSendMessage(initialPrompt, agent.id);
              }
            }}
            onRefresh={refreshAll}
          />
        )}

        {/* ===================================================================
            VIEW 2.5: AGENDA & NOTIFICATIONS (AULAS SEG-SEX & ENTREVISTAS)
        ==================================================================== */}
        {activeTab === "agenda" && (
          <AgendaNotificationsView
            schedules={schedules}
            darkMode={darkMode}
            permissionStatus={permissionStatus}
            onRequestPermission={requestPushPermission}
            onTriggerTestNotification={handleTriggerTestNotification}
            onSendAICommand={(prompt) => {
              setActiveTab("chat");
              handleSendMessage(prompt);
            }}
            onRefresh={refreshAll}
          />
        )}

        {/* ===================================================================
            VIEW 3: FINANCES & CREDIT CARDS (COM SUB-SEÇÃO DE FATURAS ANTERIORES NA MEMÓRIA)
        ==================================================================== */}
        {activeTab === "finances" && finance && (
          <div className="p-4 md:p-6 max-w-[1440px] w-full mx-auto space-y-6">
            {/* Duralux Sub-Navigation Bar: Contas Atuais vs Gastos Anteriores (Faturas na Memória) */}
            <div
              className={`duralux-card rounded-xl border p-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${cardSurface}`}
            >
              <div className="grid grid-cols-1 sm:flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
                <button
                  onClick={() => setFinanceSubTab("current")}
                  className={`w-full sm:w-auto px-3.5 py-2.5 sm:py-2 rounded-lg text-xs font-bold flex items-center justify-center sm:justify-start gap-2 transition-all ${
                    financeSubTab === "current"
                      ? "bg-[#3454d1] text-white shadow-sm"
                      : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  <Wallet className="w-4 h-4 shrink-0" />
                  <span>Saldos, Cartões & Contas Atuais</span>
                </button>

                <button
                  onClick={() => setFinanceSubTab("statement_history")}
                  className={`w-full sm:w-auto px-3.5 py-2.5 sm:py-2 rounded-lg text-xs font-bold flex items-center justify-center sm:justify-start gap-2 transition-all ${
                    financeSubTab === "statement_history"
                      ? "bg-[#3454d1] text-white shadow-sm"
                      : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  <FileText className="w-4 h-4 shrink-0" />
                  <span className="truncate">Gastos Anteriores (Faturas)</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold shrink-0 ${
                      financeSubTab === "statement_history"
                        ? "bg-white/20 text-white"
                        : "bg-[#3454d1]/10 text-[#3454d1]"
                    }`}
                  >
                    {statementHistory?.total_extracted_items ?? 0} itens
                  </span>
                </button>
              </div>

              <div className="px-3 text-xs text-slate-400 font-medium hidden sm:block">
                {financeSubTab === "current"
                  ? "Gerencie seus saldos bancários e lançamentos do mês"
                  : "Histórico extraído automaticamente dos PDFs/textos de faturas na sua memória"}
              </div>
            </div>

            {financeSubTab === "statement_history" ? (
              <StatementHistorySection
                statementHistory={statementHistory}
                darkMode={darkMode}
                onRefresh={refreshAll}
              />
            ) : (
              <CurrentFinancesSection
                finance={finance}
                darkMode={darkMode}
                onRefresh={refreshAll}
              />
            )}
          </div>
        )}

        {/* ===================================================================
            VIEW 4: ACADEMIC (FACULDADE)
        ==================================================================== */}
        {activeTab === "academic" && (
          <div className="p-4 md:p-6 max-w-[1440px] w-full mx-auto space-y-6">
            <div className={`duralux-card rounded-xl border p-6 space-y-4 ${cardSurface}`}>
              <h3 className="font-bold text-[15px] flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#3454d1]" />
                Cadastrar Prova, Trabalho ou Projeto da Faculdade
              </h3>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!taskSubject.trim() || !taskTitle.trim()) return;
                  await api.createAcademicTask({
                    subject: taskSubject.trim(),
                    title: taskTitle.trim(),
                    task_type: taskType,
                    due_date: taskDueDate || undefined,
                    priority: taskPriority,
                  });
                  setTaskSubject("");
                  setTaskTitle("");
                  setTaskDueDate("");
                  refreshAll();
                }}
                className="grid grid-cols-1 sm:grid-cols-6 gap-2.5"
              >
                <input
                  type="text"
                  placeholder="Disciplina (ex: IA, Cálculo II)"
                  value={taskSubject}
                  onChange={(e) => setTaskSubject(e.target.value)}
                  className={`rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
                />
                <input
                  type="text"
                  placeholder="Título da Atividade / Prova"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  className={`sm:col-span-2 rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
                />
                <select
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value)}
                  className={`rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
                >
                  <option value="exam">Prova</option>
                  <option value="assignment">Trabalho / Lista</option>
                  <option value="project">Projeto Prático</option>
                  <option value="reading">Leitura / Artigo</option>
                </select>
                <input
                  type="date"
                  value={taskDueDate}
                  onChange={(e) => setTaskDueDate(e.target.value)}
                  className={`rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
                />
                <button
                  type="submit"
                  className="bg-[#3454d1] hover:bg-[#2945b8] text-white rounded-lg px-4 py-2 text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" /> Cadastrar
                </button>
              </form>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {tasks.map((t) => (
                <div
                  key={t.id}
                  className={`duralux-card rounded-xl border p-5 flex flex-col justify-between gap-3 ${cardSurface}`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-extrabold text-[#3454d1] uppercase tracking-wider">
                        {t.subject}
                      </span>
                      <span
                        className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold ${
                          t.priority === "critical" || t.priority === "high"
                            ? "bg-[#ea4d4d]/15 text-[#ea4d4d]"
                            : "bg-slate-200 dark:bg-slate-800 text-slate-500"
                        }`}
                      >
                        Prioridade: {t.priority}
                      </span>
                    </div>
                    <h4 className="font-bold text-base mt-1">{t.title}</h4>
                    {t.notes && (
                      <p className="text-xs text-slate-400 mt-1">{t.notes}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                    <span className="text-slate-400 font-medium flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Prazo: {t.due_date || "Sem data"}
                    </span>

                    <div className="flex items-center gap-2">
                      <select
                        value={t.status}
                        onChange={async (e) => {
                          await api.updateAcademicTask(t.id, {
                            status: e.target.value,
                          });
                          refreshAll();
                        }}
                        className={`rounded-lg px-2.5 py-1 text-xs font-bold border ${inputSurface}`}
                      >
                        <option value="todo">Pendente</option>
                        <option value="in_progress">Em Andamento</option>
                        <option value="done">Concluído ✅</option>
                      </select>

                      <button
                        onClick={async () => {
                          await api.deleteAcademicTask(t.id);
                          refreshAll();
                        }}
                        className="text-slate-400 hover:text-[#ea4d4d]"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ===================================================================
            VIEW 5: MEMORY, RAG FILES & FINE-TUNING
        ==================================================================== */}
        {activeTab === "memory" && (
          <div className="p-4 md:p-6 max-w-[1440px] w-full mx-auto space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Coluna 1: Core Memory CRUD */}
              <div className={`duralux-card rounded-xl border p-4 sm:p-6 space-y-4 ${cardSurface}`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm sm:text-[15px] flex items-center gap-2">
                    <Brain className="w-4 h-4 text-[#3454d1] shrink-0" />
                    Memória Core do Agente ({memories.length} fatos)
                  </h3>
                </div>

                <form
                  onSubmit={handleSaveMemory}
                  className={`rounded-xl border p-3.5 sm:p-4 space-y-3 ${subtleSurface}`}
                >
                  <div className="text-xs font-bold text-[#3454d1]">
                    {editingMemory
                      ? `✏️ Editando Memória #${editingMemory.id}`
                      : "➕ Novo Fato para a Memória Core"}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <select
                      value={
                        editingMemory ? editingMemory.category : newMemCategory
                      }
                      onChange={(e) =>
                        editingMemory
                          ? setEditingMemory({
                              ...editingMemory,
                              category: e.target.value,
                            })
                          : setNewMemCategory(e.target.value)
                      }
                      className={`rounded-lg px-2.5 py-2 sm:py-1.5 text-xs border ${inputSurface}`}
                    >
                      <option value="pessoal">Pessoal</option>
                      <option value="financas">Finanças</option>
                      <option value="faculdade">Faculdade</option>
                      <option value="preferencia">Preferência</option>
                      <option value="meta">Meta</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Título / Chave do Fato"
                      value={editingMemory ? editingMemory.key : newMemKey}
                      onChange={(e) =>
                        editingMemory
                          ? setEditingMemory({
                              ...editingMemory,
                              key: e.target.value,
                            })
                          : setNewMemKey(e.target.value)
                      }
                      className={`sm:col-span-2 rounded-lg px-3 py-2 sm:py-1.5 text-xs border ${inputSurface}`}
                    />
                  </div>
                  <textarea
                    rows={2}
                    placeholder="Descreva o fato, regra ou preferência permanente..."
                    value={
                      editingMemory ? editingMemory.content : newMemContent
                    }
                    onChange={(e) =>
                      editingMemory
                        ? setEditingMemory({
                            ...editingMemory,
                            content: e.target.value,
                          })
                        : setNewMemContent(e.target.value)
                    }
                    className={`w-full rounded-lg p-2.5 text-xs border ${inputSurface}`}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs text-slate-400 font-medium flex items-center gap-2">
                      Importância (1-5):
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={
                          editingMemory
                            ? editingMemory.importance
                            : newMemImportance
                        }
                        onChange={(e) =>
                          editingMemory
                            ? setEditingMemory({
                                ...editingMemory,
                                importance: Number(e.target.value),
                              })
                            : setNewMemImportance(Number(e.target.value))
                        }
                        className={`w-14 rounded-lg px-2 py-1 text-xs border ${inputSurface}`}
                      />
                    </label>
                    <div className="flex gap-2 w-full sm:w-auto justify-end">
                      {editingMemory && (
                        <button
                          type="button"
                          onClick={() => setEditingMemory(null)}
                          className="text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700"
                        >
                          Cancelar
                        </button>
                      )}
                      <button
                        type="submit"
                        className="w-full sm:w-auto text-xs px-4 py-2 sm:py-1.5 rounded-lg bg-[#3454d1] hover:bg-[#2945b8] text-white font-bold"
                      >
                        {editingMemory ? "Atualizar" : "Salvar na Memória"}
                      </button>
                    </div>
                  </div>
                </form>

                <div className="space-y-2.5 max-h-[420px] overflow-y-auto">
                  {memories.map((m) => (
                    <div
                      key={m.id}
                      className={`rounded-xl border p-3.5 space-y-1.5 ${subtleSurface}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#3454d1]/10 text-[#3454d1]">
                            {m.category}
                          </span>
                          <span className="font-bold text-xs sm:text-sm break-words">{m.key}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] font-bold text-[#ffa21d]">
                            ★ {m.importance}/5
                          </span>
                          <button
                            onClick={() => setEditingMemory(m)}
                            className="text-slate-400 hover:text-[#3454d1]"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={async () => {
                              await api.deleteMemory(m.id);
                              refreshAll();
                            }}
                            className="text-slate-400 hover:text-[#ea4d4d]"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-300 leading-relaxed break-words">
                        {m.content}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Coluna 2: Upload RAG & Editor de Chunks */}
              <div className={`duralux-card rounded-xl border p-4 sm:p-6 space-y-4 ${cardSurface}`}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-bold text-sm sm:text-[15px] flex items-center gap-2">
                    <FileText className="w-4 h-4 text-[#17c666] shrink-0" />
                    Arquivos Enviados ao RAG ({documents.length})
                  </h3>
                  <span className="text-xs font-bold text-slate-400 shrink-0">
                    Total:{" "}
                    {formatBytes(
                      documents.reduce((acc, d) => acc + d.size_bytes, 0)
                    )}
                  </span>
                </div>

                <div
                  className={`rounded-xl border border-dashed p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${subtleSurface}`}
                >
                  <div>
                    <div className="text-xs font-bold">
                      Indexar PDF, TXT, Markdown ou CSV
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Extrai texto, divide em chunks e gera embeddings automaticamente
                    </div>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <select
                      value={uploadCategory}
                      onChange={(e) => setUploadCategory(e.target.value)}
                      className={`flex-1 sm:flex-initial rounded-lg px-2.5 py-2 sm:py-1.5 text-xs border ${inputSurface}`}
                    >
                      <option value="geral">Geral</option>
                      <option value="financas">Finanças / Fatura</option>
                      <option value="faculdade">Faculdade</option>
                    </select>
                    <label className="cursor-pointer bg-[#17c666] hover:brightness-95 text-white px-3.5 py-2 sm:py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shrink-0">
                      <Upload className="w-3.5 h-3.5" />
                      {uploadingFile ? "Indexando..." : "Enviar Arquivo"}
                      <input
                        type="file"
                        accept=".pdf,.txt,.md,.csv,.json"
                        onChange={handleUploadFile}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                <div className="space-y-2.5 max-h-[420px] overflow-y-auto">
                  {documents.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-400">
                      Nenhum documento indexado ainda. Envie um arquivo acima!
                    </div>
                  ) : (
                    documents.map((doc) => (
                      <div
                        key={doc.id}
                        className={`rounded-xl border p-3.5 space-y-2 ${subtleSurface}`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <div className="min-w-0">
                            <div className="font-bold text-xs sm:text-sm flex flex-wrap items-center gap-1.5 break-all">
                              <span>{doc.filename}</span>
                              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#3454d1]/10 text-[#3454d1]">
                                {doc.category}
                              </span>
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              {formatBytes(doc.size_bytes)} • {doc.chunk_count}{" "}
                              chunks vetorizados
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2 shrink-0">
                            <button
                              onClick={() => handleInspectChunks(doc.id)}
                              className="text-xs px-2.5 py-1.5 sm:py-1 rounded-lg bg-[#3454d1]/10 text-[#3454d1] font-bold"
                            >
                              {selectedDocId === doc.id
                                ? "Ocultar Chunks"
                                : "Editar Chunks"}
                            </button>
                            <button
                              onClick={async () => {
                                await api.deleteDocument(doc.id);
                                if (selectedDocId === doc.id)
                                  setSelectedDocId(null);
                                refreshAll();
                              }}
                              className="text-slate-400 hover:text-[#ea4d4d] p-1"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {selectedDocId === doc.id && (
                          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                            {docChunks.map((c) => (
                              <div
                                key={c.id}
                                className={`rounded-lg border p-2.5 text-xs space-y-1.5 ${cardSurface}`}
                              >
                                <div className="flex items-center justify-between text-[11px] text-slate-400">
                                  <span className="font-bold text-[#3454d1]">
                                    Chunk #{c.chunk_index + 1} (~
                                    {c.token_estimate} tokens)
                                  </span>
                                  <button
                                    onClick={() => {
                                      setEditingChunkId(c.id);
                                      setEditingChunkText(c.content);
                                    }}
                                    className="text-[#3454d1] font-semibold hover:underline flex items-center gap-1"
                                  >
                                    <Edit3 className="w-3 h-3" /> Editar
                                  </button>
                                </div>

                                {editingChunkId === c.id ? (
                                  <div className="space-y-2">
                                    <textarea
                                      rows={3}
                                      value={editingChunkText}
                                      onChange={(e) =>
                                        setEditingChunkText(e.target.value)
                                      }
                                      className={`w-full rounded-lg p-2 text-xs border ${inputSurface}`}
                                    />
                                    <div className="flex justify-end gap-2">
                                      <button
                                        onClick={() => setEditingChunkId(null)}
                                        className="px-2.5 py-1 rounded border text-xs"
                                      >
                                        Cancelar
                                      </button>
                                      <button
                                        onClick={() =>
                                          handleSaveChunkEdit(c.id)
                                        }
                                        className="px-3 py-1 rounded bg-[#3454d1] text-white font-bold text-xs"
                                      >
                                        Salvar & Re-Vetorizar
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <p className="text-xs whitespace-pre-wrap">
                                    {c.content}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            VIEW 6: TELEMETRY & SYSTEM MONITORING
        ==================================================================== */}
        {activeTab === "telemetry" && telemetry && (
          <div className="p-4 md:p-6 max-w-[1440px] w-full mx-auto space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className={`duralux-card rounded-xl border p-5 space-y-1 ${cardSurface}`}>
                <div className="text-xs text-slate-400 font-semibold flex items-center justify-between">
                  <span>Arquivos Enviados (RAG)</span>
                  <FileText className="w-4 h-4 text-[#3454d1]" />
                </div>
                <div className="text-2xl font-extrabold">
                  {telemetry.memory_stats.total_files_uploaded} arquivos
                </div>
                <div className="text-xs text-slate-400">
                  {formatBytes(telemetry.memory_stats.total_files_bytes)} •{" "}
                  {telemetry.memory_stats.total_rag_chunks} chunks ativos
                </div>
              </div>

              <div className={`duralux-card rounded-xl border p-5 space-y-1 ${cardSurface}`}>
                <div className="text-xs text-slate-400 font-semibold flex items-center justify-between">
                  <span>Memória Ocupada (DB + Vetores)</span>
                  <Database className="w-4 h-4 text-[#17c666]" />
                </div>
                <div className="text-2xl font-extrabold text-[#17c666]">
                  {formatBytes(telemetry.memory_stats.db_disk_bytes)}
                </div>
                <div className="text-xs text-slate-400">
                  Vetores: {formatBytes(telemetry.memory_stats.vector_memory_bytes)} •{" "}
                  {telemetry.memory_stats.total_memory_facts} fatos Core
                </div>
              </div>

              <div className={`duralux-card rounded-xl border p-5 space-y-1 ${cardSurface}`}>
                <div className="text-xs text-slate-400 font-semibold flex items-center justify-between">
                  <span>Tokens Consumidos (Gemini)</span>
                  <Layers className="w-4 h-4 text-[#ffa21d]" />
                </div>
                <div className="text-2xl font-extrabold text-[#ffa21d]">
                  {telemetry.usage_stats.total_tokens.toLocaleString("pt-BR")}
                </div>
                <div className="text-xs text-slate-400">
                  {telemetry.usage_stats.total_api_calls} chamadas • Média{" "}
                  {telemetry.usage_stats.avg_latency_ms} ms
                </div>
              </div>

              <div className={`duralux-card rounded-xl border p-5 space-y-1 ${cardSurface}`}>
                <div className="text-xs text-slate-400 font-semibold flex items-center justify-between">
                  <span>RAM Processo / Servidor</span>
                  <Cpu className="w-4 h-4 text-[#3dc7be]" />
                </div>
                <div className="text-2xl font-extrabold text-[#3dc7be]">
                  {telemetry.system_health.process_ram_mb} MB
                </div>
                <div className="text-xs text-slate-400">
                  Sistema: {telemetry.system_health.system_ram_used_gb} /{" "}
                  {telemetry.system_health.system_ram_total_gb} GB (
                  {telemetry.system_health.system_ram_percent}%)
                </div>
              </div>
            </div>

            <div className={`duralux-card rounded-xl border p-6 space-y-4 ${cardSurface}`}>
              <h3 className="font-bold text-[15px]">
                Log de Auditoria de Uso, Tokens e Ferramentas Acionadas
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr
                      className={`border-b uppercase text-[11px] font-bold text-slate-400 ${
                        darkMode ? "border-slate-800" : "border-slate-100"
                      }`}
                    >
                      <th className="py-2.5 pr-4">Operação</th>
                      <th className="py-2.5 pr-4">Modelo</th>
                      <th className="py-2.5 pr-4">Tokens (In / Out / Total)</th>
                      <th className="py-2.5 pr-4">Tools Executadas</th>
                      <th className="py-2.5 pr-4">Latência</th>
                      <th className="py-2.5">Resumo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {telemetry.usage_stats.recent_logs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-slate-400">
                          Nenhuma chamada registrada ainda.
                        </td>
                      </tr>
                    ) : (
                      telemetry.usage_stats.recent_logs.map((log) => (
                        <tr key={log.id}>
                          <td className="py-2.5 pr-4 font-bold text-[#3454d1]">
                            {log.operation}
                          </td>
                          <td className="py-2.5 pr-4">{log.model}</td>
                          <td className="py-2.5 pr-4">
                            {log.input_tokens} / {log.output_tokens} /{" "}
                            <strong>{log.total_tokens}</strong>
                          </td>
                          <td className="py-2.5 pr-4">
                            {log.tools_called.length > 0
                              ? log.tools_called.join(", ")
                              : "—"}
                          </td>
                          <td className="py-2.5 pr-4">{log.latency_ms} ms</td>
                          <td className="py-2.5 text-slate-400 truncate max-w-xs">
                            {log.preview || "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Nav Mobile (PWA) */}
      <nav
        className={`md:hidden fixed bottom-0 inset-x-0 border-t grid grid-cols-6 pt-1.5 pb-safe z-30 ${
          darkMode
            ? "bg-[#182235]/95 border-slate-800"
            : "bg-white/95 border-slate-200"
        } backdrop-blur`}
      >
        {[
          { id: "overview", label: "Home", icon: LayoutDashboard },
          { id: "chat", label: "Chat IA", icon: MessageSquare },
          { id: "workouts", label: "Treinos", icon: Dumbbell },
          { id: "agents", label: "Agentes", icon: Bot },
          { id: "finances", label: "Finanças", icon: Wallet },
          { id: "agenda", label: "Agenda", icon: Calendar },
        ].map((item) => {
          const Icon = item.icon;
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as ActiveTab)}
              className={`flex flex-col items-center justify-center gap-1 py-1.5 text-[10px] font-bold transition-colors ${
                active ? "text-[#3454d1]" : "text-slate-400"
              }`}
            >
              <Icon className={`w-4 h-4 ${active ? "stroke-[2.5]" : ""}`} />
              <span className="truncate max-w-full px-0.5">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

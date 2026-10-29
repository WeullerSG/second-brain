import React, { useState } from "react";
import {
  Activity,
  Bot,
  Brain,
  CheckCircle2,
  Dumbbell,
  Edit3,
  Flame,
  GraduationCap,
  MessageSquare,
  Plus,
  RefreshCw,
  Sparkles,
  Star,
  Trash2,
  Wallet,
  Wrench,
} from "lucide-react";
import { api } from "../api";
import type { AgentProfile, AgentToolMeta } from "../types";

interface AgentsSectionProps {
  agents: AgentProfile[];
  availableTools: AgentToolMeta[];
  availableModels: string[];
  darkMode: boolean;
  onSelectAgentForChat: (agent: AgentProfile, initialPrompt?: string) => void;
  onOpenWorkoutGenerator: (agent: AgentProfile) => void;
  onRefresh: () => Promise<void>;
}

const ACCENT_COLORS = [
  { label: "Verde SmartWorkout", value: "#17c666" },
  { label: "Azul Duralux", value: "#3454d1" },
  { label: "Laranja Energia", value: "#ffa21d" },
  { label: "Vermelho Força", value: "#ea4d4d" },
  { label: "Ciano Tech", value: "#3dc7be" },
  { label: "Roxo Neural", value: "#8b5cf6" },
];

const AVATAR_ICONS = [
  { id: "dumbbell", label: "Haltere (Treino)" },
  { id: "brain", label: "Cérebro (Orquestrador)" },
  { id: "wallet", label: "Carteira (Finanças)" },
  { id: "graduation", label: "Capelo (Faculdade)" },
  { id: "flame", label: "Chama (Performance)" },
  { id: "sparkles", label: "Estrelas (IA Criativa)" },
  { id: "bot", label: "Robô (Geral)" },
];

export function renderAgentIcon(iconName: string, className = "w-5 h-5") {
  switch (iconName) {
    case "dumbbell":
      return <Dumbbell className={className} />;
    case "brain":
      return <Brain className={className} />;
    case "wallet":
      return <Wallet className={className} />;
    case "graduation":
      return <GraduationCap className={className} />;
    case "flame":
      return <Flame className={className} />;
    case "sparkles":
      return <Sparkles className={className} />;
    default:
      return <Bot className={className} />;
  }
}

export const AgentsSection: React.FC<AgentsSectionProps> = ({
  agents,
  availableTools,
  availableModels,
  darkMode,
  onSelectAgentForChat,
  onOpenWorkoutGenerator,
  onRefresh,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<string>("todos");
  const [showEditor, setShowEditor] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Form states
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("treino");
  const [avatarIcon, setAvatarIcon] = useState("dumbbell");
  const [accentColor, setAccentColor] = useState("#17c666");
  const [model, setModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [toolsEnabled, setToolsEnabled] = useState<string[]>([
    "create_workout_plan",
    "log_workout_session",
    "search_workout_exercises",
    "save_memory_fact",
  ]);
  const [quickPromptsText, setQuickPromptsText] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  const cardSurface = darkMode
    ? "bg-[#182235] border-slate-800 text-slate-100"
    : "bg-white border-slate-200/90 text-[#283c50]";
  const inputSurface = darkMode
    ? "bg-[#0f172a] border-slate-700 text-slate-100 placeholder-slate-500"
    : "bg-[#f8fafc] border-slate-200 text-[#283c50] placeholder-slate-400";
  const subtleSurface = darkMode
    ? "bg-slate-900/70 border-slate-800"
    : "bg-[#f8fafc] border-slate-200/80";

  const openCreateModal = (preset?: "workout" | "custom") => {
    setEditingAgentId(null);
    if (preset === "workout") {
      setName("Personal Trainer Hipertrofia & Força");
      setRole("Especialista em Periodização e Biblioteca SmartWorkout");
      setDescription(
        "Cria fichas de treino periodizadas (ABC, Push/Pull/Legs, Upper/Lower), sugere exercícios por equipamento e registra cargas e PRs."
      );
      setCategory("treino");
      setAvatarIcon("dumbbell");
      setAccentColor("#17c666");
      setModel("");
      setSystemPrompt(
        "Você é um Personal Trainer especialista em musculação e hipertrofia baseado na Biblioteca SmartWorkout.\n" +
          "1. Crie fichas completas usando `create_workout_plan` com séries, repetições, descanso e RIR.\n" +
          "2. Registre os treinos realizados e as cargas em kg usando `log_workout_session`.\n" +
          "3. Busque exercícios ideais para o equipamento do aluno com `search_workout_exercises`."
      );
      setToolsEnabled([
        "create_workout_plan",
        "log_workout_session",
        "search_workout_exercises",
        "save_memory_fact",
        "upsert_schedule_notification",
      ]);
      setQuickPromptsText(
        "Monte um treino ABC focado em hipertrofia\nCrie uma ficha de Costas e Bíceps com halteres e polia\nRegistre meu treino de hoje: Supino Reto 4x8 com 80kg e Supino Inclinado 4x10 com 30kg"
      );
      setIsDefault(false);
    } else {
      setName("");
      setRole("");
      setDescription("");
      setCategory("personalizado");
      setAvatarIcon("bot");
      setAccentColor("#3454d1");
      setModel("");
      setSystemPrompt(
        "Você é um agente especialista do Second Brain AI. Ajude o usuário com respostas objetivas e acione as ferramentas necessárias."
      );
      setToolsEnabled(availableTools.map((t) => t.name));
      setQuickPromptsText("");
      setIsDefault(false);
    }
    setShowEditor(true);
  };

  const openEditModal = (agent: AgentProfile) => {
    setEditingAgentId(agent.id);
    setName(agent.name);
    setRole(agent.role);
    setDescription(agent.description);
    setCategory(agent.category);
    setAvatarIcon(agent.avatar_icon);
    setAccentColor(agent.accent_color);
    setModel(agent.model || "");
    setSystemPrompt(agent.system_prompt);
    setToolsEnabled(agent.tools_enabled || []);
    setQuickPromptsText((agent.quick_prompts || []).join("\n"));
    setIsDefault(agent.is_default);
    setShowEditor(true);
  };

  const toggleTool = (toolName: string) => {
    setToolsEnabled((prev) =>
      prev.includes(toolName)
        ? prev.filter((t) => t !== toolName)
        : [...prev, toolName]
    );
  };

  const handleSaveAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !role.trim() || !systemPrompt.trim()) return;
    setSaving(true);
    try {
      const quickPrompts = quickPromptsText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      if (editingAgentId) {
        await api.updateAgent(editingAgentId, {
          name: name.trim(),
          role: role.trim(),
          description: description.trim() || role.trim(),
          category,
          avatar_icon: avatarIcon,
          accent_color: accentColor,
          model: model.trim() || null,
          system_prompt: systemPrompt.trim(),
          tools_enabled: toolsEnabled,
          quick_prompts: quickPrompts,
          is_default: isDefault,
        });
      } else {
        await api.createAgent({
          name: name.trim(),
          role: role.trim(),
          description: description.trim() || role.trim(),
          category,
          avatar_icon: avatarIcon,
          accent_color: accentColor,
          model: model.trim() || null,
          system_prompt: systemPrompt.trim(),
          tools_enabled: toolsEnabled,
          quick_prompts: quickPrompts,
          is_default: isDefault,
          enabled: true,
        });
      }
      setShowEditor(false);
      await onRefresh();
    } catch (err: any) {
      window.alert(`Erro ao salvar agente: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  const filteredAgents = agents.filter((a) =>
    categoryFilter === "todos" ? true : a.category === categoryFilter
  );

  const defaultAgent = agents.find((a) => a.is_default) || agents[0];
  const workoutAgentsCount = agents.filter((a) => a.category === "treino").length;

  return (
    <div className="p-4 md:p-6 max-w-[1440px] w-full mx-auto space-y-6">
      {/* KPI HEADER CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
        <div className={`duralux-card rounded-xl border p-4 sm:p-5 ${cardSurface}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-semibold">
              Agentes Configurados
            </span>
            <Bot className="w-4 h-4 text-[#3454d1]" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold mt-1">
            {agents.length} Agentes
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {agents.filter((a) => a.enabled).length} ativos •{" "}
            {agents.filter((a) => !a.is_system).length} customizados
          </div>
        </div>

        <div className={`duralux-card rounded-xl border p-4 sm:p-5 ${cardSurface}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-semibold">
              Agente de Treinos IA
            </span>
            <Dumbbell className="w-4 h-4 text-[#17c666]" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-[#17c666] mt-1 truncate">
            {workoutAgentsCount} Coach{workoutAgentsCount > 1 ? "es" : ""}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Conectado à Biblioteca SmartWorkout
          </div>
        </div>

        <div className={`duralux-card rounded-xl border p-4 sm:p-5 ${cardSurface}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-semibold">
              Agente Padrão do Chat
            </span>
            <Star className="w-4 h-4 text-[#ffa21d]" />
          </div>
          <div className="text-base sm:text-lg font-extrabold text-[#3454d1] mt-1 truncate">
            {defaultAgent?.name || "Second Brain"}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5 truncate">
            {defaultAgent?.role || "Orquestrador Geral"}
          </div>
        </div>

        <div className={`duralux-card rounded-xl border p-4 sm:p-5 ${cardSurface}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-semibold">
              Tools Disponíveis
            </span>
            <Wrench className="w-4 h-4 text-[#3dc7be]" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-[#3dc7be] mt-1">
            {availableTools.length} Tools
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Treinos, Finanças, Faculdade, Agenda & RAG
          </div>
        </div>
      </div>

      {/* BARRA DE CONTROLE & FILTROS DA SEÇÃO DE AGENTES */}
      <div
        className={`duralux-card rounded-xl border p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${cardSurface}`}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: "todos", label: "Todos os Agentes" },
            { id: "treino", label: "🏋️ Treinos & Academia" },
            { id: "geral", label: "🧠 Orquestrador Geral" },
            { id: "financas", label: "💳 Finanças" },
            { id: "faculdade", label: "🎓 Faculdade & RAG" },
            { id: "personalizado", label: "✨ Personalizados" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setCategoryFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                categoryFilter === tab.id
                  ? "bg-[#3454d1] text-white shadow-xs"
                  : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={async () => {
              await api.resetDefaultAgents();
              await onRefresh();
            }}
            className={`px-3 py-2 rounded-lg border text-xs font-bold flex items-center gap-1.5 ${subtleSurface}`}
            title="Restaurar configuração original dos agentes de sistema"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Restaurar Padrões
          </button>

          <button
            onClick={() => openCreateModal("workout")}
            className="px-3.5 py-2 rounded-lg bg-[#17c666] hover:brightness-95 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
          >
            <Dumbbell className="w-3.5 h-3.5" />
            + Novo Agente de Treino
          </button>

          <button
            onClick={() => openCreateModal("custom")}
            className="px-3.5 py-2 rounded-lg bg-[#3454d1] hover:bg-[#2945b8] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            Criar Agente IA
          </button>
        </div>
      </div>

      {/* MODAL / PAINEL DE CRIAÇÃO E EDIÇÃO DE AGENTE */}
      {showEditor && (
        <form
          onSubmit={handleSaveAgent}
          className={`duralux-card rounded-xl border p-5 sm:p-6 space-y-5 shadow-lg ${cardSurface}`}
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-white"
                style={{ backgroundColor: accentColor }}
              >
                {renderAgentIcon(avatarIcon, "w-5 h-5")}
              </div>
              <div>
                <h3 className="font-bold text-sm sm:text-base">
                  {editingAgentId
                    ? `Editar Agente IA #${editingAgentId}`
                    : "Criar Novo Agente IA"}
                </h3>
                <p className="text-xs text-slate-400">
                  Personalize o System Prompt, modelo Gemini e as ferramentas que este agente pode executar
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowEditor(false)}
              className="text-xs font-bold text-slate-400 hover:text-slate-200 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700"
            >
              Fechar ✕
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Nome do Agente *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: SmartWorkout Coach IA"
                className={`w-full rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Papel / Especialidade *
              </label>
              <input
                type="text"
                required
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="Ex: Personal Trainer & Criador de Fichas"
                className={`w-full rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Categoria
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className={`w-full rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
              >
                <option value="treino">🏋️ Treino & Academia (SmartWorkout)</option>
                <option value="geral">🧠 Geral / Orquestrador</option>
                <option value="financas">💳 Finanças & Cartões</option>
                <option value="faculdade">🎓 Faculdade & Estudos</option>
                <option value="personalizado">✨ Personalizado</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Ícone do Agente
              </label>
              <select
                value={avatarIcon}
                onChange={(e) => setAvatarIcon(e.target.value)}
                className={`w-full rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
              >
                {AVATAR_ICONS.map((ic) => (
                  <option key={ic.id} value={ic.id}>
                    {ic.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Cor de Destaque
              </label>
              <div className="flex items-center gap-2 pt-1">
                {ACCENT_COLORS.map((c) => (
                  <button
                    type="button"
                    key={c.value}
                    onClick={() => setAccentColor(c.value)}
                    title={c.label}
                    className={`w-7 h-7 rounded-full border-2 transition-transform ${
                      accentColor === c.value
                        ? "scale-110 border-white ring-2 ring-[#3454d1]"
                        : "border-transparent opacity-80 hover:opacity-100"
                    }`}
                    style={{ backgroundColor: c.value }}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
                Modelo Gemini (Opcional)
              </label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className={`w-full rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
              >
                <option value="">Usar modelo padrão do sistema</option>
                {availableModels.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
              Descrição Resumida
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva em uma frase o que este agente faz..."
              className={`w-full rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
              System Prompt (Instruções e Regras do Agente) *
            </label>
            <textarea
              rows={4}
              required
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="Defina a personalidade, metodologia de treino/análise e regras que o agente deve seguir..."
              className={`w-full rounded-lg p-3 text-xs border font-mono leading-relaxed ${inputSurface}`}
            />
          </div>

          {/* SELEÇÃO DE TOOLS HABILITADAS */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-[11px] font-bold uppercase text-slate-400">
                Ferramentas (Function Calling) Permitidas para este Agente ({toolsEnabled.length})
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setToolsEnabled([
                      "create_workout_plan",
                      "log_workout_session",
                      "search_workout_exercises",
                      "save_memory_fact",
                      "upsert_schedule_notification",
                    ])
                  }
                  className="text-[11px] font-bold text-[#17c666] hover:underline"
                >
                  Kit Treinos SmartWorkout
                </button>
                <span className="text-slate-400">•</span>
                <button
                  type="button"
                  onClick={() =>
                    setToolsEnabled(availableTools.map((t) => t.name))
                  }
                  className="text-[11px] font-bold text-[#3454d1] hover:underline"
                >
                  Marcar Todas
                </button>
                <span className="text-slate-400">•</span>
                <button
                  type="button"
                  onClick={() => setToolsEnabled([])}
                  className="text-[11px] font-bold text-slate-400 hover:underline"
                >
                  Limpar
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {availableTools.map((tool) => {
                const checked = toolsEnabled.includes(tool.name);
                return (
                  <label
                    key={tool.name}
                    className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer text-xs transition-all ${
                      checked
                        ? "border-[#3454d1] bg-[#3454d1]/10"
                        : subtleSurface
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTool(tool.name)}
                      className="mt-0.5 rounded text-[#3454d1]"
                    />
                    <div className="min-w-0">
                      <div className="font-bold text-xs truncate">
                        {tool.label}
                      </div>
                      <div className="text-[10px] font-mono text-[#3454d1]">
                        {tool.name}()
                      </div>
                      <div className="text-[11px] text-slate-400 line-clamp-2 mt-0.5">
                        {tool.description}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase text-slate-400 mb-1">
              Comandos Rápidos Sugeridos (1 por linha)
            </label>
            <textarea
              rows={3}
              value={quickPromptsText}
              onChange={(e) => setQuickPromptsText(e.target.value)}
              placeholder={
                "Crie um treino ABC de hipertrofia\nRegistre meu treino de hoje: Supino Reto 4x10 com 80kg"
              }
              className={`w-full rounded-lg p-2.5 text-xs border ${inputSurface}`}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="rounded text-[#3454d1]"
              />
              <span>Definir como Agente Padrão ao abrir o Chat</span>
            </label>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowEditor(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-bold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-lg bg-[#3454d1] hover:bg-[#2945b8] text-white text-xs font-bold disabled:opacity-50"
              >
                {saving
                  ? "Salvando..."
                  : editingAgentId
                  ? "Salvar Alterações"
                  : "Criar Agente"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* GRID DE AGENTES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 containment-region">
        {filteredAgents.map((agent) => (
          <div
            key={agent.id}
            className={`duralux-card rounded-xl border p-5 flex flex-col justify-between gap-4 ${cardSurface} ${
              !agent.enabled ? "opacity-60" : ""
            }`}
          >
            <div className="space-y-3">
              {/* Top Row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm"
                    style={{ backgroundColor: agent.accent_color || "#3454d1" }}
                  >
                    {renderAgentIcon(agent.avatar_icon, "w-5 h-5")}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="font-extrabold text-sm sm:text-base truncate">
                        {agent.name}
                      </h3>
                      {agent.is_default && (
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-[#ffa21d]/15 text-[#ffa21d] flex items-center gap-1">
                          <Star className="w-3 h-3 fill-current" /> Padrão
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          agent.category === "treino"
                            ? "bg-[#17c666]/15 text-[#17c666]"
                            : "bg-[#3454d1]/10 text-[#3454d1]"
                        }`}
                      >
                        {agent.category}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-400 truncate mt-0.5">
                      {agent.role}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEditModal(agent)}
                    title="Editar instruções e tools do agente"
                    className="p-2 rounded-lg text-slate-400 hover:text-[#3454d1] hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  {!agent.is_default && (
                    <button
                      onClick={async () => {
                        if (
                          !window.confirm(
                            `Deseja excluir o agente "${agent.name}"?`
                          )
                        )
                          return;
                        await api.deleteAgent(agent.id);
                        await onRefresh();
                      }}
                      title="Excluir agente"
                      className="p-2 rounded-lg text-slate-400 hover:text-[#ea4d4d] hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Description */}
              <p className="text-xs text-slate-500 dark:text-slate-300 leading-relaxed">
                {agent.description}
              </p>

              {/* System Prompt Preview */}
              <div className={`rounded-xl border p-3 space-y-1 ${subtleSurface}`}>
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span>System Prompt (Instruções)</span>
                  <span className="font-mono text-[#3454d1]">
                    {agent.model || "Modelo Padrão"}
                  </span>
                </div>
                <p className="text-[11px] font-mono text-slate-500 dark:text-slate-300 line-clamp-2 whitespace-pre-wrap">
                  {agent.system_prompt}
                </p>
              </div>

              {/* Tools Badges */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Wrench className="w-3 h-3 text-[#3454d1]" />
                  {agent.tools_enabled?.length || 0} Ferramentas Conectadas:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(agent.tools_enabled || []).slice(0, 6).map((tName) => (
                    <span
                      key={tName}
                      className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                    >
                      {tName}()
                    </span>
                  ))}
                  {(agent.tools_enabled?.length || 0) > 6 && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#3454d1]/10 text-[#3454d1]">
                      +{(agent.tools_enabled?.length || 0) - 6} mais
                    </span>
                  )}
                </div>
              </div>

              {/* Quick Prompts */}
              {agent.quick_prompts && agent.quick_prompts.length > 0 && (
                <div className="space-y-1 pt-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Testar Comando Rápido com {agent.name}:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {agent.quick_prompts.slice(0, 2).map((qp, idx) => (
                      <button
                        key={idx}
                        onClick={() => onSelectAgentForChat(agent, qp)}
                        className={`text-left text-[11px] px-2.5 py-1.5 rounded-lg border transition-all hover:border-[#3454d1] truncate max-w-full ${subtleSurface}`}
                      >
                        ✨ {qp}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer Action Buttons */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {!agent.is_default && (
                  <button
                    onClick={async () => {
                      await api.updateAgent(agent.id, { is_default: true });
                      await onRefresh();
                    }}
                    className="text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-[#ffa21d] text-slate-500 dark:text-slate-300 flex items-center gap-1"
                  >
                    <Star className="w-3.5 h-3.5 text-[#ffa21d]" />
                    Tornar Padrão
                  </button>
                )}

                <button
                  onClick={async () => {
                    await api.updateAgent(agent.id, { enabled: !agent.enabled });
                    await onRefresh();
                  }}
                  className={`text-[11px] font-bold px-2.5 py-1.5 rounded-lg border flex items-center gap-1 ${
                    agent.enabled
                      ? "border-[#17c666]/30 bg-[#17c666]/10 text-[#17c666]"
                      : "border-slate-300 dark:border-slate-700 text-slate-400"
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {agent.enabled ? "Ativo" : "Inativo"}
                </button>
              </div>

              <div className="flex items-center gap-2">
                {agent.category === "treino" && (
                  <button
                    onClick={() => onOpenWorkoutGenerator(agent)}
                    className="px-3 py-1.5 rounded-lg bg-[#17c666] hover:brightness-95 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
                  >
                    <Dumbbell className="w-3.5 h-3.5" />
                    Criar Treino
                  </button>
                )}

                <button
                  onClick={() => onSelectAgentForChat(agent)}
                  className="px-3.5 py-1.5 rounded-lg bg-[#3454d1] hover:bg-[#2945b8] text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Conversar
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

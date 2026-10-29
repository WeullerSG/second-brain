import React, { useEffect, useMemo, useState } from "react";
import {
  Award,
  BookOpen,
  Calendar,
  CheckCircle2,
  Dumbbell,
  ExternalLink,
  Filter,
  Flame,
  Layers,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { api } from "../api";
import { Markdown } from "./Markdown";
import type {
  AgentProfile,
  WorkoutExercise,
  WorkoutPlan,
  WorkoutPlanExerciseItem,
  WorkoutSessionExerciseItem,
  WorkoutsSummary,
} from "../types";

interface WorkoutsSectionProps {
  summary: WorkoutsSummary | null;
  exercises: WorkoutExercise[];
  agents: AgentProfile[];
  darkMode: boolean;
  initialSubTab?: "diary" | "plans" | "library";
  onRefresh: () => Promise<void>;
  onOpenAgentsTab: () => void;
}

const MUSCLE_GROUPS = [
  "Todos",
  "Peito",
  "Costas",
  "Pernas",
  "Glúteos",
  "Ombros",
  "Bíceps",
  "Tríceps",
  "Antebraço",
  "Abdômen",
];

const EQUIPMENTS = [
  "Todos",
  "Barra",
  "Halteres",
  "Máquina",
  "Polia / Cabo",
  "Peso Corporal",
  "Barra W",
];

const MUSCLE_BADGE_COLORS: Record<string, string> = {
  Peito: "bg-[#3454d1]/15 text-[#3454d1]",
  Costas: "bg-[#17c666]/15 text-[#17c666]",
  Pernas: "bg-[#ea4d4d]/15 text-[#ea4d4d]",
  Glúteos: "bg-[#ec4899]/15 text-[#ec4899]",
  Ombros: "bg-[#ffa21d]/15 text-[#ffa21d]",
  Bíceps: "bg-[#3dc7be]/15 text-[#3dc7be]",
  Tríceps: "bg-[#8b5cf6]/15 text-[#8b5cf6]",
  Antebraço: "bg-amber-500/15 text-amber-500",
  Abdômen: "bg-emerald-500/15 text-emerald-500",
};

export const WorkoutsSection: React.FC<WorkoutsSectionProps> = ({
  summary,
  exercises,
  agents,
  darkMode,
  initialSubTab,
  onRefresh,
  onOpenAgentsTab,
}) => {
  const [subTab, setSubTab] = useState<"diary" | "plans" | "library">(
    initialSubTab || "diary"
  );

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  // ---------- Estados do Diário de Treino (Anotar Treino do Dia) ----------
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [sessionDate, setSessionDate] = useState(todayIso);
  const [sessionTitle, setSessionTitle] = useState("Treino A — Peito, Ombro e Tríceps");
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [perceivedEffort, setPerceivedEffort] = useState(8);
  const [sessionNotes, setSessionNotes] = useState("");
  const [loggedExercises, setLoggedExercises] = useState<
    WorkoutSessionExerciseItem[]
  >([
    {
      exercise_name: "Supino Inclinado com Halteres",
      muscle_group: "Peito",
      equipment: "Halteres",
      sets_count: 4,
      reps: "10",
      weight_kg: 30,
    },
    {
      exercise_name: "Supino Reto com Barra",
      muscle_group: "Peito",
      equipment: "Barra",
      sets_count: 4,
      reps: "8",
      weight_kg: 70,
    },
    {
      exercise_name: "Elevação Lateral com Halteres",
      muscle_group: "Ombros",
      equipment: "Halteres",
      sets_count: 4,
      reps: "12",
      weight_kg: 14,
    },
    {
      exercise_name: "Tríceps na Polia com Corda (Pushdown)",
      muscle_group: "Tríceps",
      equipment: "Polia / Cabo",
      sets_count: 4,
      reps: "12",
      weight_kg: 35,
    },
  ]);
  const [quickPickExerciseId, setQuickPickExerciseId] = useState<string>("");
  const [savingSession, setSavingSession] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(
    null
  );

  // ---------- Estados do Criador de Treinos com Agente IA ----------
  const workoutAgents = useMemo(
    () => agents.filter((a) => a.enabled),
    [agents]
  );
  const defaultCoach = useMemo(
    () =>
      workoutAgents.find((a) => a.category === "treino") ||
      workoutAgents[0] ||
      null,
    [workoutAgents]
  );
  const [aiAgentId, setAiAgentId] = useState<number | null>(
    defaultCoach?.id ?? null
  );
  const [aiGoal, setAiGoal] = useState("Hipertrofia");
  const [aiSplit, setAiSplit] = useState("ABC");
  const [aiDays, setAiDays] = useState(4);
  const [aiLevel, setAiLevel] = useState("Intermediário");
  const [aiEquipment, setAiEquipment] = useState("Academia Completa");
  const [aiFocusMuscles, setAiFocusMuscles] = useState("");
  const [aiCustomInstructions, setAiCustomInstructions] = useState("");
  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiCoachReply, setAiCoachReply] = useState<string | null>(null);

  // Criador manual de ficha
  const [showManualPlanForm, setShowManualPlanForm] = useState(false);
  const [manualPlanTitle, setManualPlanTitle] = useState("");
  const [manualPlanSplit, setManualPlanSplit] = useState("ABC");
  const [manualPlanMuscles, setManualPlanMuscles] = useState("Peito, Ombros, Tríceps");
  const [manualPlanDays, setManualPlanDays] = useState("Seg, Qui");
  const [manualPlanItems, setManualPlanItems] = useState<
    WorkoutPlanExerciseItem[]
  >([]);

  // ---------- Estados da Biblioteca de Exercícios SmartWorkout ----------
  const [libMuscleFilter, setLibMuscleFilter] = useState("Todos");
  const [libEquipmentFilter, setLibEquipmentFilter] = useState("Todos");
  const [libSearch, setLibSearch] = useState("");
  const [showNewExerciseForm, setShowNewExerciseForm] = useState(false);
  const [newExName, setNewExName] = useState("");
  const [newExMuscle, setNewExMuscle] = useState("Peito");
  const [newExSecondary, setNewExSecondary] = useState("");
  const [newExEquipment, setNewExEquipment] = useState("Halteres");
  const [newExMechanic, setNewExMechanic] = useState("Composto");
  const [newExDifficulty, setNewExDifficulty] = useState("Intermediário");
  const [newExInstructions, setNewExInstructions] = useState("");

  const cardSurface = darkMode
    ? "bg-[#182235] border-slate-800 text-slate-100"
    : "bg-white border-slate-200/90 text-[#283c50]";
  const inputSurface = darkMode
    ? "bg-[#0f172a] border-slate-700 text-slate-100 placeholder-slate-500"
    : "bg-[#f8fafc] border-slate-200 text-[#283c50] placeholder-slate-400";
  const subtleSurface = darkMode
    ? "bg-slate-900/70 border-slate-800"
    : "bg-[#f8fafc] border-slate-200/80";

  // Mapa rápido de PR por nome de exercício
  const prByExerciseName = useMemo(() => {
    const map: Record<string, number> = {};
    for (const ex of exercises) {
      if (ex.personal_record_kg > 0) {
        map[ex.name.toLowerCase()] = ex.personal_record_kg;
      }
    }
    for (const pr of summary?.personal_records || []) {
      map[pr.exercise_name.toLowerCase()] = Math.max(
        map[pr.exercise_name.toLowerCase()] || 0,
        pr.personal_record_kg
      );
    }
    return map;
  }, [exercises, summary]);

  // Últimos 28 dias para o Calendário de Frequência de Treino
  const last28Days = useMemo(() => {
    const days: Array<{
      dateIso: string;
      dayNum: string;
      monthShort: string;
      weekdayShort: string;
      sessions: Array<{
        id: number;
        title: string;
        muscle_groups?: string | null;
        exercises_count: number;
        total_sets: number;
        max_weight_kg: number;
        total_volume_kg: number;
      }>;
    }> = [];
    const now = new Date();
    for (let i = 27; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const sessionsOnDate = summary?.trained_dates_detail?.[iso] || [];
      days.push({
        dateIso: iso,
        dayNum: String(d.getDate()).padStart(2, "0"),
        monthShort: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
        weekdayShort: d
          .toLocaleDateString("pt-BR", { weekday: "short" })
          .replace(".", ""),
        sessions: sessionsOnDate,
      });
    }
    return days;
  }, [summary]);

  // Filtro da biblioteca SmartWorkout
  const filteredLibrary = useMemo(() => {
    return exercises.filter((ex) => {
      if (libMuscleFilter !== "Todos" && ex.muscle_group !== libMuscleFilter) {
        return false;
      }
      if (libEquipmentFilter !== "Todos" && ex.equipment !== libEquipmentFilter) {
        return false;
      }
      if (libSearch.trim()) {
        const q = libSearch.toLowerCase();
        const match =
          ex.name.toLowerCase().includes(q) ||
          ex.muscle_group.toLowerCase().includes(q) ||
          ex.equipment.toLowerCase().includes(q) ||
          (ex.secondary_muscles || "").toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [exercises, libMuscleFilter, libEquipmentFilter, libSearch]);

  // Carregar exercícios de uma Ficha para o Diário de Hoje
  const loadPlanIntoSessionLogger = (plan: WorkoutPlan) => {
    setSelectedPlanId(plan.id);
    setSessionTitle(plan.title);
    setDurationMinutes(plan.estimated_duration_min || 60);
    setLoggedExercises(
      (plan.exercises || []).map((pe) => {
        const knownPr = prByExerciseName[pe.exercise_name.toLowerCase()] || 0;
        return {
          exercise_id: pe.exercise_id,
          exercise_name: pe.exercise_name,
          muscle_group: pe.muscle_group,
          equipment: pe.equipment,
          sets_count: pe.sets || 4,
          reps: pe.reps?.split("-")[0] || "10",
          weight_kg: pe.target_weight_kg > 0 ? pe.target_weight_kg : knownPr,
          notes: pe.notes || undefined,
        };
      })
    );
    setSubTab("diary");
  };

  // Adicionar exercício da Biblioteca direto no Treino do Dia
  const addExerciseToLogger = (ex: WorkoutExercise) => {
    setLoggedExercises((prev) => [
      ...prev,
      {
        exercise_id: ex.id,
        exercise_name: ex.name,
        muscle_group: ex.muscle_group,
        equipment: ex.equipment,
        sets_count: 4,
        reps: "10",
        weight_kg: ex.last_weight_kg || ex.personal_record_kg || 20,
      },
    ]);
    setSubTab("diary");
  };

  // Totais em tempo real do formulário de treino
  const draftMetrics = useMemo(() => {
    let totalSets = 0;
    let maxWeight = 0;
    let totalVol = 0;
    for (const item of loggedExercises) {
      const s = Number(item.sets_count) || 0;
      const r = parseInt(String(item.reps || "10"), 10) || 10;
      const w = Number(item.weight_kg) || 0;
      totalSets += s;
      if (w > maxWeight) maxWeight = w;
      totalVol += s * r * w;
    }
    return {
      exercisesCount: loggedExercises.length,
      totalSets,
      maxWeight,
      totalVol: Math.round(totalVol),
    };
  }, [loggedExercises]);

  const handleSaveWorkoutSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionTitle.trim() || loggedExercises.length === 0) {
      window.alert("Adicione pelo menos 1 exercício ao treino antes de salvar.");
      return;
    }
    setSavingSession(true);
    try {
      await api.createWorkoutSession({
        session_date: sessionDate,
        title: sessionTitle.trim(),
        plan_id: selectedPlanId,
        duration_minutes: Number(durationMinutes) || 60,
        perceived_effort: Number(perceivedEffort) || 8,
        exercises_performed: loggedExercises,
        notes: sessionNotes.trim() || undefined,
      });
      setSessionNotes("");
      await onRefresh();
    } catch (err: any) {
      window.alert(`Erro ao registrar treino: ${err.message || err}`);
    } finally {
      setSavingSession(false);
    }
  };

  const handleGenerateAIWorkout = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneratingAI(true);
    setAiCoachReply(null);
    try {
      const res = await api.generateAIWorkoutPlan({
        goal: aiGoal,
        split_type: aiSplit,
        days_per_week: Number(aiDays) || 4,
        experience_level: aiLevel,
        available_equipment: aiEquipment,
        focus_muscles: aiFocusMuscles.trim() || undefined,
        custom_instructions: aiCustomInstructions.trim() || undefined,
        agent_id: aiAgentId,
      });
      setAiCoachReply(res.coach_reply);
      await onRefresh();
    } catch (err: any) {
      window.alert(`Erro ao gerar treino com IA: ${err.message || err}`);
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleCreateManualPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualPlanTitle.trim() || manualPlanItems.length === 0) return;
    await api.createWorkoutPlan({
      title: manualPlanTitle.trim(),
      split_label: manualPlanSplit,
      target_muscles: manualPlanMuscles.trim() || "Geral",
      goal: "Hipertrofia",
      scheduled_days: manualPlanDays.trim() || undefined,
      estimated_duration_min: 60,
      created_by_agent: "Criado pelo Usuário",
      exercises: manualPlanItems,
      active: true,
    });
    setManualPlanTitle("");
    setManualPlanItems([]);
    setShowManualPlanForm(false);
    await onRefresh();
  };

  const handleCreateCustomExercise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExName.trim() || !newExInstructions.trim()) return;
    await api.createWorkoutExercise({
      name: newExName.trim(),
      muscle_group: newExMuscle,
      secondary_muscles: newExSecondary.trim() || undefined,
      equipment: newExEquipment,
      difficulty: newExDifficulty,
      mechanic: newExMechanic,
      instructions: newExInstructions.trim(),
    });
    setNewExName("");
    setNewExSecondary("");
    setNewExInstructions("");
    setShowNewExerciseForm(false);
    await onRefresh();
  };

  const sessionsToDisplay = useMemo(() => {
    const list = summary?.recent_sessions || [];
    if (!selectedCalendarDate) return list;
    return list.filter((s) => s.session_date === selectedCalendarDate);
  }, [summary, selectedCalendarDate]);

  return (
    <div className="p-4 md:p-6 max-w-[1440px] w-full mx-auto space-y-6">
      {/* =====================================================================
          4 KPI CARDS: DIAS QUE TREINEI, QUANTOS EXERCÍCIOS FIZ, CARGA (PR) & FICHAS
      ====================================================================== */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-5">
        {/* KPI 1: Dias que Treinei */}
        <div className={`duralux-card rounded-xl border p-4 sm:p-5 ${cardSurface}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-semibold">
              Dias que Treinei (Mês)
            </span>
            <Calendar className="w-4 h-4 text-[#17c666]" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-[#17c666] mt-1">
            {summary?.days_trained_this_month ?? 0} dias
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>Nesta semana: {summary?.days_trained_this_week ?? 0}d</span>
            <span className="font-bold text-[#3454d1]">
              Total: {summary?.days_trained_total ?? 0} dias
            </span>
          </div>
        </div>

        {/* KPI 2: Quantos Exercícios Fiz */}
        <div className={`duralux-card rounded-xl border p-4 sm:p-5 ${cardSurface}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-semibold">
              Quantos Exercícios Fiz
            </span>
            <Dumbbell className="w-4 h-4 text-[#3454d1]" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold mt-1">
            {summary?.total_exercises_done ?? 0} exercícios
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>No mês: {summary?.exercises_done_this_month ?? 0} ex.</span>
            <span className="font-bold text-[#17c666]">
              {summary?.total_sets_done ?? 0} séries
            </span>
          </div>
        </div>

        {/* KPI 3: Maior Carga que Peguei (PR) */}
        <div className={`duralux-card rounded-xl border p-4 sm:p-5 ${cardSurface}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-semibold">
              Maior Carga que Peguei (PR)
            </span>
            <Award className="w-4 h-4 text-[#ffa21d]" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-[#ffa21d] mt-1">
            {summary?.heaviest_lift
              ? `${summary.heaviest_lift.personal_record_kg} kg`
              : "0 kg"}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 truncate">
            {summary?.heaviest_lift
              ? `${summary.heaviest_lift.exercise_name} (1RM ~${summary.heaviest_lift.estimated_1rm_kg}kg)`
              : "Registre seu 1º treino abaixo"}
          </div>
        </div>

        {/* KPI 4: Volume Total & Biblioteca SmartWorkout */}
        <div className={`duralux-card rounded-xl border p-4 sm:p-5 ${cardSurface}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-semibold">
              Volume Total & Fichas IA
            </span>
            <Flame className="w-4 h-4 text-[#ea4d4d]" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-[#ea4d4d] mt-1">
            {(summary?.total_volume_kg ?? 0).toLocaleString("pt-BR")} kg
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>{summary?.active_plans_count ?? 0} fichas ativas</span>
            <span className="font-bold text-[#3dc7be]">
              {summary?.library_count ?? exercises.length} ex. na biblioteca
            </span>
          </div>
        </div>
      </div>

      {/* =====================================================================
          SUB-NAVIGATION BAR: DIÁRIO DE TREINO | CRIADOR IA & FICHAS | BIBLIOTECA SMARTWORKOUT
      ====================================================================== */}
      <div
        className={`duralux-card rounded-xl border p-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${cardSurface}`}
      >
        <div className="grid grid-cols-1 sm:flex items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => setSubTab("diary")}
            className={`px-3.5 py-2.5 sm:py-2 rounded-lg text-xs font-bold flex items-center justify-center sm:justify-start gap-2 transition-all ${
              subTab === "diary"
                ? "bg-[#3454d1] text-white shadow-xs"
                : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Calendar className="w-4 h-4 shrink-0" />
            <span>Diário: Dias que Treinei & Cargas</span>
          </button>

          <button
            onClick={() => setSubTab("plans")}
            className={`px-3.5 py-2.5 sm:py-2 rounded-lg text-xs font-bold flex items-center justify-center sm:justify-start gap-2 transition-all ${
              subTab === "plans"
                ? "bg-[#17c666] text-white shadow-xs"
                : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>Agente Criador de Treinos & Fichas</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                subTab === "plans"
                  ? "bg-white/20 text-white"
                  : "bg-[#17c666]/15 text-[#17c666]"
              }`}
            >
              {summary?.plans?.length ?? 0}
            </span>
          </button>

          <button
            onClick={() => setSubTab("library")}
            className={`px-3.5 py-2.5 sm:py-2 rounded-lg text-xs font-bold flex items-center justify-center sm:justify-start gap-2 transition-all ${
              subTab === "library"
                ? "bg-[#3454d1] text-white shadow-xs"
                : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            }`}
          >
            <BookOpen className="w-4 h-4 shrink-0" />
            <span>Biblioteca de Exercícios (SmartWorkout)</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                subTab === "library"
                  ? "bg-white/20 text-white"
                  : "bg-[#3454d1]/15 text-[#3454d1]"
              }`}
            >
              {exercises.length}
            </span>
          </button>
        </div>

        <a
          href="https://smartworkout.app/pt/biblioteca-de-exercicios"
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1.5 text-xs font-bold text-[#3454d1] hover:underline flex items-center justify-center gap-1"
        >
          <span>Referência SmartWorkout</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* =====================================================================
          SUB-ABA 1: DIÁRIO DE TREINOS (DIAS QUE TREINEI, CARGAS & QUANTOS EXERCÍCIOS FIZ)
      ====================================================================== */}
      {subTab === "diary" && (
        <div className="space-y-6">
          {/* CALENDÁRIO DE FREQUÊNCIA DOS DIAS TREINADOS (ÚLTIMOS 28 DIAS) */}
          <div className={`duralux-card rounded-xl border p-4 sm:p-6 space-y-4 ${cardSurface}`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-bold text-sm sm:text-[15px] flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#17c666]" />
                  Mapa de Frequência — Os Dias em que Treinei (Últimos 28 Dias)
                </h3>
                <p className="text-xs text-slate-400">
                  Clique em qualquer dia verde para filtrar o treino daquele dia ou em um dia vazio para anotar o treino naquela data
                </p>
              </div>
              {selectedCalendarDate && (
                <button
                  onClick={() => setSelectedCalendarDate(null)}
                  className="text-xs font-bold text-[#3454d1] hover:underline self-start sm:self-auto"
                >
                  Mostrar todos os dias ({summary?.total_sessions ?? 0} treinos)
                </button>
              )}
            </div>

            <div className="grid grid-cols-7 sm:grid-cols-14 gap-1.5 sm:gap-2">
              {last28Days.map((day) => {
                const trained = day.sessions.length > 0;
                const isSelected = selectedCalendarDate === day.dateIso;
                const dayExercises = day.sessions.reduce(
                  (acc, s) => acc + s.exercises_count,
                  0
                );
                const dayMaxKg = Math.max(
                  0,
                  ...day.sessions.map((s) => s.max_weight_kg || 0)
                );

                return (
                  <button
                    key={day.dateIso}
                    type="button"
                    onClick={() => {
                      setSessionDate(day.dateIso);
                      if (trained) {
                        setSelectedCalendarDate(
                          isSelected ? null : day.dateIso
                        );
                      } else {
                        setSelectedCalendarDate(null);
                      }
                    }}
                    title={
                      trained
                        ? `${day.dateIso}: ${day.sessions.map((s) => s.title).join(", ")} (${dayExercises} exercícios • Máx ${dayMaxKg}kg)`
                        : `${day.dateIso}: Sem treino registrado (clique para escolher esta data)`
                    }
                    className={`rounded-xl border p-2 flex flex-col items-center justify-center transition-all text-center ${
                      trained
                        ? "bg-[#17c666] border-[#17c666] text-white shadow-sm"
                        : subtleSurface
                    } ${
                      isSelected || sessionDate === day.dateIso
                        ? "ring-2 ring-[#3454d1] scale-[1.03]"
                        : ""
                    }`}
                  >
                    <span
                      className={`text-[9px] font-bold uppercase ${
                        trained ? "text-white/85" : "text-slate-400"
                      }`}
                    >
                      {day.weekdayShort}
                    </span>
                    <span className="text-xs sm:text-sm font-extrabold leading-tight mt-0.5">
                      {day.dayNum}
                    </span>
                    {trained ? (
                      <span className="text-[9px] font-extrabold bg-black/20 px-1.5 py-0.5 rounded-full mt-1 truncate max-w-full">
                        {dayExercises}ex • {dayMaxKg}kg
                      </span>
                    ) : (
                      <span className="text-[9px] text-slate-400 mt-1">
                        {day.monthShort}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* GRID PRINCIPAL: FORMULÁRIO "ANOTAR MEU TREINO" (7 COLS) + PRs DE CARGA (5 COLS) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* COLUNA ESQUERDA: REGISTRADOR DE TREINO DO DIA */}
            <form
              onSubmit={handleSaveWorkoutSession}
              className={`lg:col-span-7 duralux-card rounded-xl border p-4 sm:p-6 space-y-4 ${cardSurface}`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="font-bold text-sm sm:text-[15px] flex items-center gap-2">
                    <Dumbbell className="w-4 h-4 text-[#3454d1]" />
                    Anotar Meu Treino (Dia, Exercícios, Séries & Carga que Peguei)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Escolha uma ficha pronta abaixo ou selecione exercícios da Biblioteca SmartWorkout
                  </p>
                </div>

                {/* Seletor rápido para carregar uma ficha */}
                {summary?.plans && summary.plans.length > 0 && (
                  <select
                    value={selectedPlanId || ""}
                    onChange={(e) => {
                      const pid = Number(e.target.value);
                      const found = summary.plans.find((p) => p.id === pid);
                      if (found) loadPlanIntoSessionLogger(found);
                    }}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-bold border ${inputSurface}`}
                  >
                    <option value="">📋 Carregar de uma Ficha...</option>
                    {summary.plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} ({p.exercises.length} ex.)
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Dados gerais da sessão */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                    Dia que Treinei *
                  </label>
                  <input
                    type="date"
                    required
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                    className={`w-full rounded-lg px-3 py-2 text-xs border font-bold ${inputSurface}`}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                    Nome do Treino / Ficha *
                  </label>
                  <input
                    type="text"
                    required
                    value={sessionTitle}
                    onChange={(e) => setSessionTitle(e.target.value)}
                    placeholder="Ex: Treino A — Peito, Ombro e Tríceps"
                    className={`w-full rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                    Duração (min)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={240}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className={`w-full rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
                  />
                </div>
              </div>

              {/* Barra para adicionar exercício da biblioteca SmartWorkout */}
              <div
                className={`rounded-xl border p-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 ${subtleSurface}`}
              >
                <select
                  value={quickPickExerciseId}
                  onChange={(e) => {
                    const exId = Number(e.target.value);
                    const found = exercises.find((x) => x.id === exId);
                    if (found) {
                      addExerciseToLogger(found);
                      setQuickPickExerciseId("");
                    }
                  }}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs border font-semibold ${inputSurface}`}
                >
                  <option value="">
                    ➕ Adicionar exercício da Biblioteca SmartWorkout ({exercises.length} disponíveis)...
                  </option>
                  {MUSCLE_GROUPS.filter((m) => m !== "Todos").map((mg) => (
                    <optgroup key={mg} label={`── ${mg.toUpperCase()} ──`}>
                      {exercises
                        .filter((ex) => ex.muscle_group === mg)
                        .map((ex) => (
                          <option key={ex.id} value={ex.id}>
                            {ex.name} ({ex.equipment})
                            {ex.personal_record_kg > 0
                              ? ` • PR: ${ex.personal_record_kg}kg`
                              : ""}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() =>
                    setLoggedExercises((prev) => [
                      ...prev,
                      {
                        exercise_name: "",
                        muscle_group: "Peito",
                        equipment: "Halteres",
                        sets_count: 4,
                        reps: "10",
                        weight_kg: 20,
                      },
                    ])
                  }
                  className="px-3 py-2 rounded-lg bg-[#3454d1]/10 text-[#3454d1] hover:bg-[#3454d1] hover:text-white text-xs font-bold flex items-center justify-center gap-1 shrink-0 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Linha Manual
                </button>
              </div>

              {/* Lista de Exercícios do Treino do Dia */}
              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {loggedExercises.map((item, idx) => {
                  const currentPr =
                    prByExerciseName[(item.exercise_name || "").toLowerCase()] ||
                    0;
                  const isNewPr =
                    currentPr > 0 && Number(item.weight_kg) > currentPr;

                  return (
                    <div
                      key={idx}
                      className={`rounded-xl border p-3 space-y-2 ${subtleSurface}`}
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                        <div className="sm:col-span-5">
                          <label className="block text-[10px] font-bold text-slate-400">
                            Exercício #{idx + 1} ({item.muscle_group} • {item.equipment})
                          </label>
                          <input
                            type="text"
                            required
                            value={item.exercise_name}
                            onChange={(e) => {
                              const val = e.target.value;
                              setLoggedExercises((prev) =>
                                prev.map((row, i) =>
                                  i === idx ? { ...row, exercise_name: val } : row
                                )
                              );
                            }}
                            placeholder="Nome do exercício"
                            className={`w-full rounded-lg px-2.5 py-1.5 text-xs font-bold border mt-0.5 ${inputSurface}`}
                          />
                        </div>

                        <div className="grid grid-cols-3 sm:col-span-6 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-400">
                              Séries
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={20}
                              value={item.sets_count}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setLoggedExercises((prev) =>
                                  prev.map((row, i) =>
                                    i === idx ? { ...row, sets_count: val } : row
                                  )
                                );
                              }}
                              className={`w-full rounded-lg px-2.5 py-1.5 text-xs font-bold border mt-0.5 ${inputSurface}`}
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-400">
                              Reps
                            </label>
                            <input
                              type="text"
                              value={item.reps}
                              onChange={(e) => {
                                const val = e.target.value;
                                setLoggedExercises((prev) =>
                                  prev.map((row, i) =>
                                    i === idx ? { ...row, reps: val } : row
                                  )
                                );
                              }}
                              placeholder="10"
                              className={`w-full rounded-lg px-2.5 py-1.5 text-xs font-bold border mt-0.5 ${inputSurface}`}
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-[#17c666]">
                              Carga (kg)
                            </label>
                            <input
                              type="number"
                              step="0.5"
                              min={0}
                              value={item.weight_kg}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setLoggedExercises((prev) =>
                                  prev.map((row, i) =>
                                    i === idx ? { ...row, weight_kg: val } : row
                                  )
                                );
                              }}
                              className={`w-full rounded-lg px-2.5 py-1.5 text-xs font-extrabold border mt-0.5 border-[#17c666]/40 ${inputSurface}`}
                            />
                          </div>
                        </div>

                        <div className="sm:col-span-1 flex justify-end pt-3">
                          <button
                            type="button"
                            onClick={() =>
                              setLoggedExercises((prev) =>
                                prev.filter((_, i) => i !== idx)
                              )
                            }
                            className="p-1.5 text-slate-400 hover:text-[#ea4d4d]"
                            title="Remover exercício"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Dica de PR anterior / Novo Recorde */}
                      {(currentPr > 0 || isNewPr) && (
                        <div className="flex items-center justify-between text-[11px] px-1">
                          <span className="text-slate-400">
                            Seu recorde anterior neste exercício:{" "}
                            <strong className="text-[#ffa21d]">
                              {currentPr} kg
                            </strong>
                          </span>
                          {isNewPr && (
                            <span className="font-extrabold text-[#17c666] flex items-center gap-1">
                              🏆 Novo PR Pessoal (+
                              {(Number(item.weight_kg) - currentPr).toFixed(1)}{" "}
                              kg)!
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Observações + Resumo Instantâneo do Treino */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <input
                  type="text"
                  value={sessionNotes}
                  onChange={(e) => setSessionNotes(e.target.value)}
                  placeholder="Observações do treino (ex: ótima evolução de carga no supino, RIR 1)..."
                  className={`w-full rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
                />

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="px-2.5 py-1 rounded-lg bg-[#3454d1]/10 text-[#3454d1] font-extrabold">
                      {draftMetrics.exercisesCount} exercícios
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-[#17c666]/15 text-[#17c666] font-extrabold">
                      {draftMetrics.totalSets} séries
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-[#ffa21d]/15 text-[#ffa21d] font-extrabold">
                      Máx: {draftMetrics.maxWeight} kg
                    </span>
                    <span className="text-slate-400 font-semibold">
                      Volume: {draftMetrics.totalVol.toLocaleString("pt-BR")} kg
                    </span>
                  </div>

                  <button
                    type="submit"
                    disabled={savingSession}
                    className="px-5 py-2.5 rounded-xl bg-[#17c666] hover:brightness-95 text-white text-xs font-extrabold flex items-center gap-2 shadow-sm disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {savingSession
                      ? "Salvando..."
                      : "Salvar Treino & Cargas no Diário"}
                  </button>
                </div>
              </div>
            </form>

            {/* COLUNA DIREITA: RECORDES DE CARGA (PRs & 1RM) + VOLUME POR MÚSCULO */}
            <div className="lg:col-span-5 space-y-6">
              <div className={`duralux-card rounded-xl border p-4 sm:p-6 space-y-4 ${cardSurface}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-sm sm:text-[15px] flex items-center gap-2">
                      <Award className="w-4 h-4 text-[#ffa21d]" />
                      Recordes de Carga (PRs) por Exercício
                    </h3>
                    <p className="text-xs text-slate-400">
                      Maiores cargas registradas e 1RM estimado (Fórmula de Epley)
                    </p>
                  </div>
                </div>

                {(!summary?.personal_records ||
                  summary.personal_records.length === 0) ? (
                  <div className="text-center py-8 text-xs text-slate-400">
                    Salve seu primeiro treino ao lado para calcular seus Recordes Pessoais (PRs) e 1RM!
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                    {summary.personal_records.map((pr, i) => (
                      <div
                        key={pr.exercise_name}
                        className={`rounded-xl border p-3 flex items-center justify-between gap-3 ${subtleSurface}`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-[#ffa21d]/15 text-[#ffa21d]">
                              #{i + 1}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                                MUSCLE_BADGE_COLORS[pr.muscle_group] ||
                                "bg-[#3454d1]/10 text-[#3454d1]"
                              }`}
                            >
                              {pr.muscle_group}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {pr.equipment}
                            </span>
                          </div>
                          <div className="font-bold text-xs sm:text-sm truncate mt-1">
                            {pr.exercise_name}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Último treino: {pr.last_trained_date || "—"} (
                            {pr.times_trained}x realizado)
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-sm sm:text-base font-extrabold text-[#17c666]">
                            {pr.personal_record_kg} kg
                          </div>
                          <div className="text-[10px] font-bold text-[#3454d1]">
                            1RM Est.: {pr.estimated_1rm_kg} kg
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Divisão de Exercícios e Séries por Grupo Muscular */}
              <div className={`duralux-card rounded-xl border p-4 sm:p-6 space-y-3 ${cardSurface}`}>
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#3454d1]" />
                  Volume por Grupo Muscular
                </h3>
                {(!summary?.muscle_group_breakdown ||
                  summary.muscle_group_breakdown.length === 0) ? (
                  <p className="text-xs text-slate-400">
                    Os grupos musculares treinados aparecerão aqui conforme você registrar seus treinos.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    {summary.muscle_group_breakdown.map((mg) => {
                      const maxSets = Math.max(
                        1,
                        ...summary.muscle_group_breakdown.map((x) => x.sets_done)
                      );
                      const pct = Math.round((mg.sets_done / maxSets) * 100);
                      return (
                        <div key={mg.muscle_group} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold">{mg.muscle_group}</span>
                            <span className="text-slate-400">
                              <strong>{mg.exercises_done} ex.</strong> •{" "}
                              {mg.sets_done} séries • Máx{" "}
                              <strong className="text-[#17c666]">
                                {mg.max_weight_kg} kg
                              </strong>
                            </span>
                          </div>
                          <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#3454d1] rounded-full"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* TABELA DE HISTÓRICO DE TREINOS REALIZADOS (Modern Web Guidance: responsive-table) */}
          <div className={`duralux-card rounded-xl border p-4 sm:p-6 space-y-4 ${cardSurface}`}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3
                  id="workout-history-caption"
                  className="font-bold text-sm sm:text-[15px] flex items-center gap-2"
                >
                  <Layers className="w-4 h-4 text-[#3454d1]" />
                  Histórico de Treinos Anotados ({sessionsToDisplay.length})
                </h3>
                <p className="text-xs text-slate-400">
                  Registro detalhado dos dias treinados, quantos exercícios você fez e as cargas de cada série
                </p>
              </div>
            </div>

            {sessionsToDisplay.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400">
                Nenhum treino registrado para o filtro selecionado. Use o formulário acima ou peça ao Agente IA no chat!
              </div>
            ) : (
              <div
                tabIndex={0}
                role="region"
                aria-labelledby="workout-history-caption"
                className="table-wrapper"
              >
                <table
                  className="responsive-stacked-table text-left text-xs"
                  style={
                    {
                      "--label-2": '"Foco & Duração"',
                      "--label-3": '"Quantos Exercícios"',
                      "--label-4": '"Cargas que Peguei"',
                      "--label-5": '"Maior Carga / Volume"',
                    } as React.CSSProperties
                  }
                >
                  <thead>
                    <tr
                      className={`border-b uppercase text-[11px] font-bold text-slate-400 ${
                        darkMode
                          ? "border-slate-800 bg-[#182235]"
                          : "border-slate-100 bg-slate-50"
                      }`}
                    >
                      <th className="py-3 px-4">Dia & Treino</th>
                      <th className="py-3 px-4">Foco & Duração</th>
                      <th className="py-3 px-4">Quantos Exercícios</th>
                      <th className="py-3 px-4">Exercícios & Cargas que Peguei</th>
                      <th className="py-3 px-4 text-right">Maior Carga / Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {sessionsToDisplay.map((sess) => (
                      <tr
                        key={sess.id}
                        className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                      >
                        <th
                          scope="row"
                          className={`py-3.5 px-4 font-bold ${
                            darkMode ? "bg-[#182235]" : "bg-white"
                          }`}
                        >
                          <div className="text-[#17c666] font-mono text-xs">
                            📅 {sess.session_date}
                          </div>
                          <div className="text-sm font-extrabold mt-0.5">
                            {sess.title}
                          </div>
                        </th>

                        <td className="py-3.5 px-4">
                          <div className="font-semibold">
                            {sess.muscle_groups || "Geral"}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            ⏱️ {sess.duration_minutes} min • RPE{" "}
                            {sess.perceived_effort}/10
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="px-2.5 py-1 rounded-full bg-[#3454d1]/15 text-[#3454d1] font-extrabold text-xs">
                            {sess.exercises_count} exercícios
                          </span>
                          <div className="text-[11px] text-slate-400 mt-1">
                            {sess.total_sets} séries • {sess.total_reps} reps
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap gap-1.5 max-w-xl">
                            {(sess.exercises_performed || []).map((ex, idx) => (
                              <span
                                key={idx}
                                className={`text-[11px] px-2.5 py-1 rounded-lg border font-medium ${subtleSurface}`}
                              >
                                <strong>{ex.exercise_name}</strong>:{" "}
                                {ex.sets_count}x{ex.reps} •{" "}
                                <strong className="text-[#17c666]">
                                  {ex.weight_kg} kg
                                </strong>
                              </span>
                            ))}
                          </div>
                          {sess.notes && (
                            <p className="text-[11px] text-slate-400 italic mt-1">
                              "{sess.notes}"
                            </p>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <div>
                              <div className="font-extrabold text-sm text-[#ffa21d]">
                                Máx: {sess.max_weight_kg} kg
                              </div>
                              <div className="text-[11px] text-slate-400">
                                Vol:{" "}
                                {sess.total_volume_kg.toLocaleString("pt-BR")} kg
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setSessionTitle(sess.title);
                                setLoggedExercises(
                                  (sess.exercises_performed || []).map((e) => ({
                                    ...e,
                                  }))
                                );
                                window.scrollTo({ top: 0, behavior: "smooth" });
                              }}
                              title="Repetir este treino hoje"
                              className="p-1.5 rounded-lg text-[#3454d1] hover:bg-[#3454d1]/10"
                            >
                              <Play className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                if (
                                  !window.confirm(
                                    `Excluir o registro de treino "${sess.title}" (${sess.session_date})?`
                                  )
                                )
                                  return;
                                await api.deleteWorkoutSession(sess.id);
                                await onRefresh();
                              }}
                              title="Excluir registro"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-[#ea4d4d]"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-ABA 2: AGENTE CRIADOR DE TREINOS IA & MINHAS FICHAS
      ====================================================================== */}
      {subTab === "plans" && (
        <div className="space-y-6">
          {/* CARD DO AGENTE CRIADOR DE TREINOS (SMARTWORKOUT COACH IA) */}
          <form
            onSubmit={handleGenerateAIWorkout}
            className={`duralux-card rounded-xl border p-5 sm:p-6 space-y-4 ${cardSurface}`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-[#17c666] text-white flex items-center justify-center shadow-sm shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base">
                    Agente Criador de Treinos IA (SmartWorkout Coach)
                  </h3>
                  <p className="text-xs text-slate-400">
                    O agente monta automaticamente suas fichas completas com exercícios da Biblioteca SmartWorkout, séries, repetições, RIR e descanso
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onOpenAgentsTab}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold ${subtleSurface}`}
                >
                  ⚙️ Gerenciar Agentes
                </button>
                <button
                  type="button"
                  onClick={() => setShowManualPlanForm(!showManualPlanForm)}
                  className="px-3 py-1.5 rounded-lg bg-[#3454d1]/10 text-[#3454d1] text-xs font-bold"
                >
                  {showManualPlanForm ? "Ocultar Manual" : "+ Ficha Manual"}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Agente Especialista
                </label>
                <select
                  value={aiAgentId || ""}
                  onChange={(e) =>
                    setAiAgentId(e.target.value ? Number(e.target.value) : null)
                  }
                  className={`w-full rounded-lg px-2.5 py-2 text-xs font-bold border ${inputSurface}`}
                >
                  {workoutAgents.map((ag) => (
                    <option key={ag.id} value={ag.id}>
                      {ag.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Divisão de Treino (Split)
                </label>
                <select
                  value={aiSplit}
                  onChange={(e) => setAiSplit(e.target.value)}
                  className={`w-full rounded-lg px-2.5 py-2 text-xs font-bold border ${inputSurface}`}
                >
                  <option value="ABC">ABC (Push / Pull / Legs)</option>
                  <option value="ABCD">ABCD (4 Divisões)</option>
                  <option value="Upper/Lower">Upper / Lower (Sup / Inf)</option>
                  <option value="Full Body">Full Body (Corpo Todo)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Objetivo Principal
                </label>
                <select
                  value={aiGoal}
                  onChange={(e) => setAiGoal(e.target.value)}
                  className={`w-full rounded-lg px-2.5 py-2 text-xs font-bold border ${inputSurface}`}
                >
                  <option value="Hipertrofia">Hipertrofia Muscular</option>
                  <option value="Força">Força Pura (Strength)</option>
                  <option value="Definição">Definição & Metabolismo</option>
                  <option value="Condicionamento">Condicionamento Geral</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Dias por Semana
                </label>
                <select
                  value={aiDays}
                  onChange={(e) => setAiDays(Number(e.target.value))}
                  className={`w-full rounded-lg px-2.5 py-2 text-xs font-bold border ${inputSurface}`}
                >
                  {[2, 3, 4, 5, 6].map((d) => (
                    <option key={d} value={d}>
                      {d} dias / semana
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Nível de Experiência
                </label>
                <select
                  value={aiLevel}
                  onChange={(e) => setAiLevel(e.target.value)}
                  className={`w-full rounded-lg px-2.5 py-2 text-xs font-bold border ${inputSurface}`}
                >
                  <option value="Iniciante">Iniciante</option>
                  <option value="Intermediário">Intermediário</option>
                  <option value="Avançado">Avançado</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Equipamento Disponível
                </label>
                <select
                  value={aiEquipment}
                  onChange={(e) => setAiEquipment(e.target.value)}
                  className={`w-full rounded-lg px-2.5 py-2 text-xs font-bold border ${inputSurface}`}
                >
                  <option value="Academia Completa">Academia Completa</option>
                  <option value="Halteres e Barra">Só Halteres e Barra</option>
                  <option value="Peso Corporal / Casa">Peso Corporal / Casa</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-4">
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Foco Muscular (Opcional)
                </label>
                <input
                  type="text"
                  value={aiFocusMuscles}
                  onChange={(e) => setAiFocusMuscles(e.target.value)}
                  placeholder="Ex: Peitoral superior, Dorsal e Ombro lateral"
                  className={`w-full rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
                />
              </div>

              <div className="md:col-span-5">
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
                  Instruções / Restrições para o Agente
                </label>
                <input
                  type="text"
                  value={aiCustomInstructions}
                  onChange={(e) => setAiCustomInstructions(e.target.value)}
                  placeholder="Ex: Treino de 50 min, evitar impacto no joelho..."
                  className={`w-full rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
                />
              </div>

              <div className="md:col-span-3">
                <button
                  type="submit"
                  disabled={generatingAI}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#17c666] hover:brightness-95 text-white text-xs font-extrabold flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                >
                  <Sparkles className="w-4 h-4" />
                  {generatingAI
                    ? "Agente Criando Fichas..."
                    : "Criar Meu Treino com IA"}
                </button>
              </div>
            </div>

            {aiCoachReply && (
              <div
                className={`rounded-xl border border-[#17c666]/40 bg-[#17c666]/5 p-4 text-xs space-y-2`}
              >
                <div className="font-extrabold text-[#17c666] flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  Prescrição do Agente de Treinos:
                </div>
                <Markdown text={aiCoachReply} />
              </div>
            )}
          </form>

          {/* FORMULÁRIO MANUAL DE FICHA (OPCIONAL) */}
          {showManualPlanForm && (
            <form
              onSubmit={handleCreateManualPlan}
              className={`duralux-card rounded-xl border p-5 space-y-4 ${cardSurface}`}
            >
              <h4 className="font-bold text-sm">Criar Ficha de Treino Manualmente</h4>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Nome da Ficha (ex: Treino A — Peito e Tríceps)"
                  value={manualPlanTitle}
                  onChange={(e) => setManualPlanTitle(e.target.value)}
                  className={`sm:col-span-2 rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
                />
                <input
                  type="text"
                  placeholder="Músculos (ex: Peito, Tríceps)"
                  value={manualPlanMuscles}
                  onChange={(e) => setManualPlanMuscles(e.target.value)}
                  className={`rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
                />
                <input
                  type="text"
                  placeholder="Dias (ex: Seg, Qui)"
                  value={manualPlanDays}
                  onChange={(e) => setManualPlanDays(e.target.value)}
                  className={`rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  onChange={(e) => {
                    const ex = exercises.find(
                      (x) => x.id === Number(e.target.value)
                    );
                    if (ex) {
                      setManualPlanItems((prev) => [
                        ...prev,
                        {
                          exercise_id: ex.id,
                          exercise_name: ex.name,
                          muscle_group: ex.muscle_group,
                          equipment: ex.equipment,
                          sets: 4,
                          reps: "8-12",
                          target_weight_kg: ex.personal_record_kg || 0,
                          rest_seconds: 90,
                          rir: "1-2 RIR",
                        },
                      ]);
                      e.target.value = "";
                    }
                  }}
                  className={`flex-1 rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
                >
                  <option value="">
                    + Selecionar exercício da Biblioteca SmartWorkout para a ficha...
                  </option>
                  {exercises.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      [{ex.muscle_group}] {ex.name} ({ex.equipment})
                    </option>
                  ))}
                </select>

                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#3454d1] text-white text-xs font-bold"
                >
                  Salvar Ficha ({manualPlanItems.length} ex.)
                </button>
              </div>

              {manualPlanItems.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {manualPlanItems.map((it, i) => (
                    <span
                      key={i}
                      className={`text-xs px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${subtleSurface}`}
                    >
                      <strong>{it.exercise_name}</strong> ({it.sets}x {it.reps})
                      <button
                        type="button"
                        onClick={() =>
                          setManualPlanItems((prev) =>
                            prev.filter((_, idx) => idx !== i)
                          )
                        }
                        className="text-slate-400 hover:text-[#ea4d4d]"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </form>
          )}

          {/* LISTA DE FICHAS DE TREINO SALVAS */}
          {(!summary?.plans || summary.plans.length === 0) ? (
            <div
              className={`duralux-card rounded-xl border p-8 text-center space-y-3 ${cardSurface}`}
            >
              <Dumbbell className="w-8 h-8 text-[#17c666] mx-auto" />
              <div className="font-bold text-sm">
                Nenhuma ficha de treino criada ainda
              </div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Clique no botão verde <strong>"Criar Meu Treino com IA"</strong> acima para que o{" "}
                <strong>SmartWorkout Coach IA</strong> monte suas fichas completas agora mesmo!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 containment-region">
              {summary.plans.map((plan) => (
                <div
                  key={plan.id}
                  className={`duralux-card rounded-xl border p-5 flex flex-col justify-between gap-4 ${cardSurface}`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-[#17c666]/15 text-[#17c666]">
                            {plan.split_label}
                          </span>
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#3454d1]/10 text-[#3454d1]">
                            {plan.goal}
                          </span>
                          {plan.scheduled_days && (
                            <span className="text-[10px] font-semibold text-slate-400">
                              📅 {plan.scheduled_days}
                            </span>
                          )}
                        </div>
                        <h4 className="font-extrabold text-sm sm:text-base mt-1">
                          {plan.title}
                        </h4>
                        <div className="text-xs text-slate-400">
                          Músculos: <strong>{plan.target_muscles}</strong> • Criado por:{" "}
                          <span className="text-[#17c666] font-semibold">
                            {plan.created_by_agent}
                          </span>
                        </div>
                      </div>

                      <button
                        onClick={async () => {
                          if (
                            !window.confirm(`Excluir a ficha "${plan.title}"?`)
                          )
                            return;
                          await api.deleteWorkoutPlan(plan.id);
                          await onRefresh();
                        }}
                        className="p-1.5 text-slate-400 hover:text-[#ea4d4d]"
                        title="Excluir ficha"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      {(plan.exercises || []).map((ex, idx) => {
                        const userPr =
                          prByExerciseName[ex.exercise_name.toLowerCase()] || 0;
                        return (
                          <div
                            key={idx}
                            className={`rounded-lg border px-3 py-2 flex items-center justify-between gap-2 text-xs ${subtleSurface}`}
                          >
                            <div className="min-w-0">
                              <div className="font-bold truncate">
                                {idx + 1}. {ex.exercise_name}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {ex.muscle_group} • {ex.equipment} • Descanso:{" "}
                                {ex.rest_seconds}s ({ex.rir || "1-2 RIR"})
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-extrabold text-[#3454d1]">
                                {ex.sets}x {ex.reps}
                              </span>
                              {userPr > 0 && (
                                <div className="text-[10px] font-bold text-[#17c666]">
                                  Seu PR: {userPr} kg
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-slate-400">
                      {(plan.exercises || []).length} exercícios • ~
                      {plan.estimated_duration_min} min
                    </span>
                    <button
                      type="button"
                      onClick={() => loadPlanIntoSessionLogger(plan)}
                      className="px-4 py-2 rounded-xl bg-[#17c666] hover:brightness-95 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-xs"
                    >
                      <Play className="w-3.5 h-3.5" />
                      Iniciar / Anotar Cargas Hoje
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          SUB-ABA 3: BIBLIOTECA DE EXERCÍCIOS (ESTILO SMARTWORKOUT)
      ====================================================================== */}
      {subTab === "library" && (
        <div className="space-y-5">
          {/* BARRA DE BUSCA E FILTROS POR GRUPO MUSCULAR E EQUIPAMENTO */}
          <div className={`duralux-card rounded-xl border p-4 sm:p-5 space-y-4 ${cardSurface}`}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h3 className="font-extrabold text-sm sm:text-base flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-[#3454d1]" />
                  Biblioteca de Exercícios SmartWorkout ({filteredLibrary.length} de{" "}
                  {exercises.length})
                </h3>
                <p className="text-xs text-slate-400">
                  Filtre por grupo muscular e equipamento, veja instruções de postura e acompanhe sua maior carga (PR) em cada exercício
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs w-full sm:w-64 ${inputSurface}`}
                >
                  <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={libSearch}
                    onChange={(e) => setLibSearch(e.target.value)}
                    placeholder="Buscar exercício, músculo ou equipamento..."
                    className="bg-transparent focus:outline-none w-full text-xs"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setShowNewExerciseForm(!showNewExerciseForm)}
                  className="px-3.5 py-2 rounded-lg bg-[#3454d1] hover:bg-[#2945b8] text-white text-xs font-bold flex items-center gap-1.5 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Novo Exercício
                </button>
              </div>
            </div>

            {/* Filtro por Grupo Muscular */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Filter className="w-3 h-3" /> Grupo Muscular:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {MUSCLE_GROUPS.map((mg) => {
                  const active = libMuscleFilter === mg;
                  return (
                    <button
                      key={mg}
                      type="button"
                      onClick={() => setLibMuscleFilter(mg)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        active
                          ? "bg-[#3454d1] text-white shadow-xs"
                          : subtleSurface
                      }`}
                    >
                      {mg}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Filtro por Equipamento */}
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Equipamento:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {EQUIPMENTS.map((eq) => {
                  const active = libEquipmentFilter === eq;
                  return (
                    <button
                      key={eq}
                      type="button"
                      onClick={() => setLibEquipmentFilter(eq)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                        active
                          ? "bg-[#17c666] text-white shadow-xs"
                          : subtleSurface
                      }`}
                    >
                      {eq}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* FORMULÁRIO PARA CADASTRAR EXERCÍCIO PERSONALIZADO NA BIBLIOTECA */}
          {showNewExerciseForm && (
            <form
              onSubmit={handleCreateCustomExercise}
              className={`duralux-card rounded-xl border p-5 space-y-4 ${cardSurface}`}
            >
              <h4 className="font-bold text-sm">
                Adicionar Novo Exercício à Biblioteca SmartWorkout
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Nome do Exercício (ex: Supino Declinado com Barra)"
                  value={newExName}
                  onChange={(e) => setNewExName(e.target.value)}
                  className={`rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
                />
                <select
                  value={newExMuscle}
                  onChange={(e) => setNewExMuscle(e.target.value)}
                  className={`rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
                >
                  {MUSCLE_GROUPS.filter((m) => m !== "Todos").map((mg) => (
                    <option key={mg} value={mg}>
                      Grupo: {mg}
                    </option>
                  ))}
                </select>
                <select
                  value={newExEquipment}
                  onChange={(e) => setNewExEquipment(e.target.value)}
                  className={`rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
                >
                  {EQUIPMENTS.filter((e) => e !== "Todos").map((eq) => (
                    <option key={eq} value={eq}>
                      Equipamento: {eq}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Músculos secundários (ex: Tríceps, Deltoide Anterior)"
                  value={newExSecondary}
                  onChange={(e) => setNewExSecondary(e.target.value)}
                  className={`rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
                />
                <select
                  value={newExMechanic}
                  onChange={(e) => setNewExMechanic(e.target.value)}
                  className={`rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
                >
                  <option value="Composto">Mecânica: Composto (Multiarticular)</option>
                  <option value="Isolado">Mecânica: Isolado (Uniarticular)</option>
                </select>
                <select
                  value={newExDifficulty}
                  onChange={(e) => setNewExDifficulty(e.target.value)}
                  className={`rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
                >
                  <option value="Iniciante">Nível: Iniciante</option>
                  <option value="Intermediário">Nível: Intermediário</option>
                  <option value="Avançado">Nível: Avançado</option>
                </select>
              </div>

              <textarea
                rows={2}
                required
                placeholder="Instruções de execução e postura..."
                value={newExInstructions}
                onChange={(e) => setNewExInstructions(e.target.value)}
                className={`w-full rounded-lg p-2.5 text-xs border ${inputSurface}`}
              />

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewExerciseForm(false)}
                  className="px-3 py-1.5 rounded-lg border text-xs font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-[#3454d1] text-white text-xs font-bold"
                >
                  Salvar na Biblioteca
                </button>
              </div>
            </form>
          )}

          {/* GRID DE EXERCÍCIOS DA BIBLIOTECA SMARTWORKOUT (Modern Web Guidance: interactions-in-complex-layouts) */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 containment-region">
            {filteredLibrary.map((ex) => (
              <div
                key={ex.id}
                className={`duralux-card rounded-xl border p-4 sm:p-5 flex flex-col justify-between gap-3.5 ${cardSurface}`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md ${
                          MUSCLE_BADGE_COLORS[ex.muscle_group] ||
                          "bg-[#3454d1]/15 text-[#3454d1]"
                        }`}
                      >
                        {ex.muscle_group}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {ex.equipment}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-400">
                        {ex.mechanic} • {ex.difficulty}
                      </span>
                    </div>

                    {ex.is_custom && (
                      <button
                        onClick={async () => {
                          await api.deleteWorkoutExercise(ex.id);
                          await onRefresh();
                        }}
                        className="text-slate-400 hover:text-[#ea4d4d]"
                        title="Excluir exercício customizado"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div>
                    <h4 className="font-extrabold text-sm sm:text-[15px] leading-snug">
                      {ex.name}
                    </h4>
                    {ex.secondary_muscles && (
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Secundários: {ex.secondary_muscles}
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-300 leading-relaxed">
                    {ex.instructions}
                  </p>

                  {ex.common_mistakes && (
                    <div className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-1.5">
                      <strong>⚠️ Evite:</strong> {ex.common_mistakes}
                    </div>
                  )}
                </div>

                <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  {/* Box de Histórico Pessoal de Carga neste Exercício */}
                  <div
                    className={`rounded-lg border px-3 py-2 grid grid-cols-3 gap-2 text-center ${subtleSurface}`}
                  >
                    <div>
                      <div className="text-[10px] text-slate-400 font-semibold">
                        Maior Carga (PR)
                      </div>
                      <div className="text-xs font-extrabold text-[#17c666]">
                        {ex.personal_record_kg > 0
                          ? `${ex.personal_record_kg} kg`
                          : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-semibold">
                        1RM Estimado
                      </div>
                      <div className="text-xs font-extrabold text-[#3454d1]">
                        {ex.estimated_1rm_kg > 0
                          ? `${ex.estimated_1rm_kg} kg`
                          : "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400 font-semibold">
                        Treinado
                      </div>
                      <div className="text-xs font-extrabold">
                        {ex.times_trained}x
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <a
                      href={
                        ex.video_url ||
                        "https://smartworkout.app/pt/biblioteca-de-exercicios"
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] font-bold text-slate-400 hover:text-[#3454d1] flex items-center gap-1"
                    >
                      <span>Guia SmartWorkout</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>

                    <button
                      type="button"
                      onClick={() => addExerciseToLogger(ex)}
                      className="px-3 py-1.5 rounded-lg bg-[#17c666] hover:brightness-95 text-white text-xs font-bold flex items-center gap-1 shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Anotar Carga Hoje
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

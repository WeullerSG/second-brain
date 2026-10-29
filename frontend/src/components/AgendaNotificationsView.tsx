import React, { useState } from "react";
import {
  Bell,
  BellRing,
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock,
  Edit3,
  GraduationCap,
  MapPin,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Volume2,
} from "lucide-react";
import { api } from "../api";
import type { ScheduleNotificationItem } from "../types";
import { formatReminderOffset, getReminderOffsets } from "../reminders";
import { ReminderPicker } from "./ReminderPicker";

interface AgendaNotificationsViewProps {
  schedules: ScheduleNotificationItem[];
  darkMode: boolean;
  permissionStatus: NotificationPermission | "unsupported";
  onRequestPermission: () => Promise<void>;
  onTriggerTestNotification: (item?: ScheduleNotificationItem) => void;
  onSendAICommand: (prompt: string) => void;
  onRefresh: () => Promise<void>;
}

const WEEKDAYS = [
  { code: "mon", short: "SEG", full: "Segunda-feira" },
  { code: "tue", short: "TER", full: "Terça-feira" },
  { code: "wed", short: "QUA", full: "Quarta-feira" },
  { code: "thu", short: "QUI", full: "Quinta-feira" },
  { code: "fri", short: "SEX", full: "Sexta-feira" },
  { code: "sat", short: "SÁB", full: "Sábado" },
];

export const AgendaNotificationsView: React.FC<
  AgendaNotificationsViewProps
> = ({
  schedules,
  darkMode,
  permissionStatus,
  onRequestPermission,
  onTriggerTestNotification,
  onSendAICommand,
  onRefresh,
}) => {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState("aula");
  const [scheduleType, setScheduleType] = useState("recurring_weekly");
  const [selectedDays, setSelectedDays] = useState<string[]>(["mon", "wed"]);
  const [targetDate, setTargetDate] = useState("");
  const [notifyTime, setNotifyTime] = useState("19:00");
  const [reminders, setReminders] = useState<number[]>([30]);
  const [editingRemindersId, setEditingRemindersId] = useState<number | null>(null);
  const [editingReminders, setEditingReminders] = useState<number[]>([]);
  const [locationOrLink, setLocationOrLink] = useState("");
  const [aiSchedulePrompt, setAiSchedulePrompt] = useState("");

  const cardSurface = darkMode
    ? "bg-[#182235] border-slate-800 text-slate-100"
    : "bg-white border-slate-200/90 text-[#283c50]";
  const subtleSurface = darkMode
    ? "bg-slate-900/70 border-slate-800"
    : "bg-[#f8fafc] border-slate-200/80";
  const inputSurface = darkMode
    ? "bg-[#0f172a] border-slate-700 text-slate-100 placeholder-slate-500"
    : "bg-[#f8fafc] border-slate-200 text-[#283c50] placeholder-slate-400";

  const toggleDay = (code: string) => {
    setSelectedDays((prev) =>
      prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code]
    );
  };

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const autoMessage =
      message.trim() ||
      (category === "aula"
        ? `Lembrete de Aula: ${title.trim()} às ${notifyTime}.`
        : `Lembrete: ${title.trim()} às ${notifyTime}.`);

    await api.createNotification({
      title: title.trim(),
      message: autoMessage,
      category,
      schedule_type: scheduleType,
      days_of_week:
        scheduleType === "recurring_weekly" ? selectedDays.join(",") : null,
      target_date: scheduleType === "one_time" ? targetDate || null : null,
      notify_time: notifyTime,
      remind_minutes_before: reminders[0] ?? 0,
      reminder_offsets: reminders,
      location_or_link: locationOrLink.trim() || null,
      enabled: true,
    });

    setTitle("");
    setMessage("");
    setLocationOrLink("");
    await onRefresh();
  };

  const weeklyClasses = schedules.filter(
    (s) => s.schedule_type === "recurring_weekly"
  );
  const oneTimeEvents = schedules.filter(
    (s) => s.schedule_type === "one_time" || s.schedule_type === "daily"
  );

  return (
    <div className="p-4 md:p-6 max-w-[1440px] w-full mx-auto space-y-6">
      {/* BANNER SUPERIOR DE PERMISSÃO PUSH PWA & TESTE IMEDIATO */}
      <div
        className={`duralux-card rounded-xl border p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 ${cardSurface}`}
      >
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-[#3454d1]/10 text-[#3454d1] flex items-center justify-center shrink-0">
            <BellRing className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-bold text-base">
                Central de Notificações Inteligentes & Agenda (PWA Push)
              </h2>
              <span
                className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-full ${
                  permissionStatus === "granted"
                    ? "bg-[#17c666]/15 text-[#17c666]"
                    : "bg-[#ffa21d]/15 text-[#ffa21d]"
                }`}
              >
                {permissionStatus === "granted"
                  ? "Push Nativo Ativo"
                  : "Permissão Pendente"}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              O aplicativo verifica sua grade de aulas (segunda a sexta) e entrevistas a cada minuto e envia notificações nativas no Windows/Celular + alerta sonoro.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto shrink-0">
          {permissionStatus !== "granted" && (
            <button
              onClick={onRequestPermission}
              className="w-full sm:w-auto justify-center px-4 py-2.5 sm:py-2 rounded-lg bg-[#17c666] hover:brightness-95 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              <Bell className="w-3.5 h-3.5 shrink-0" />
              Permitir Notificações no Dispositivo
            </button>
          )}

          <button
            onClick={() => onTriggerTestNotification()}
            className="w-full sm:w-auto justify-center px-4 py-2.5 sm:py-2 rounded-lg bg-[#3454d1] hover:bg-[#2945b8] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
          >
            <Volume2 className="w-3.5 h-3.5 shrink-0" />
            Testar Disparo de Notificação Agora
          </button>
        </div>
      </div>

      {/* BARRA DE AGENDAMENTO RÁPIDO POR CONVERSA COM O GEMINI */}
      <div className={`duralux-card rounded-xl border p-5 space-y-3 ${cardSurface}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#3454d1]" />
            <h3 className="font-bold text-sm">
              Configurar Grade de Aulas ou Entrevistas Falando com o Agente Gemini
            </h3>
          </div>
          <span className="text-[11px] text-slate-400 hidden sm:inline">
            O agente entende dias da semana, matérias, datas e antecedência
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            "Tenho aula segunda e quarta de Inteligência Artificial às 19:00, me avise 30 minutos antes",
            "Tenho aula toda sexta-feira de Segurança da Informação às 19:00 na Sala 104",
            "Tenho entrevista dia 06/11/2026 às 15:00 pelo Google Meet, me mande notificação de lembrança 30 min antes",
            "Me lembre todo dia às 08:00 de revisar minhas entregas da faculdade e saldo bancário",
          ].map((example) => (
            <button
              key={example}
              onClick={() => onSendAICommand(example)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors hover:border-[#3454d1] ${subtleSurface}`}
            >
              "{example}"
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!aiSchedulePrompt.trim()) return;
            onSendAICommand(aiSchedulePrompt.trim());
            setAiSchedulePrompt("");
          }}
          className="flex gap-2 pt-1"
        >
          <input
            type="text"
            value={aiSchedulePrompt}
            onChange={(e) => setAiSchedulePrompt(e.target.value)}
            placeholder="Digite para o Gemini configurar: ex. 'Tenho aula segunda a sexta: seg Cálculo às 19h, ter IA às 19h...' ou 'Tenho entrevista amanhã às 14h'..."
            className={`flex-1 rounded-lg px-3.5 py-2 text-xs border focus:outline-none focus:border-[#3454d1] ${inputSurface}`}
          />
          <button
            type="submit"
            className="bg-[#3454d1] hover:bg-[#2945b8] text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            Agendar com IA
          </button>
        </form>
      </div>

      {/* GRADE HORÁRIA SEMANAL DE AULAS (SEGUNDA A SÁBADO) — VISUAL DURALUX */}
      <div className={`duralux-card rounded-xl border p-6 space-y-4 ${cardSurface}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-[15px] flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-[#3454d1]" />
              Grade Semanal de Aulas (Notificação Automática por Dia da Semana)
            </h3>
            <p className="text-xs text-slate-400">
              Todo dia o sistema verifica qual matéria você tem hoje e dispara o lembrete no horário configurado
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3.5">
          {WEEKDAYS.map((day) => {
            const dayClasses = weeklyClasses.filter((c) =>
              (c.days_of_week || "")
                .toLowerCase()
                .split(",")
                .map((x) => x.trim())
                .includes(day.code)
            );
            return (
              <div
                key={day.code}
                className={`rounded-xl border p-3.5 flex flex-col justify-between sm:min-h-[160px] ${subtleSurface}`}
              >
                <div>
                  <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-slate-200 dark:border-slate-800">
                    <span className="font-extrabold text-xs text-[#3454d1]">
                      {day.short}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {day.full.split("-")[0]}
                    </span>
                  </div>

                  {dayClasses.length === 0 ? (
                    <div className="text-[11px] text-slate-400 py-2 sm:py-6 text-center">
                      Sem aula configurada
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {dayClasses.map((cls) => (
                        <div
                          key={`${day.code}_${cls.id}`}
                          className={`rounded-lg border p-2.5 text-xs space-y-1 ${cardSurface}`}
                        >
                          <div className="font-bold text-xs leading-snug">
                            {cls.title}
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-[#3454d1] font-semibold">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {cls.notify_time}
                            </span>
                            <span title={getReminderOffsets(cls).map(formatReminderOffset).join(", ")}>
                              🔔 {getReminderOffsets(cls).length}
                            </span>
                          </div>
                          {cls.location_or_link && (
                            <div className="text-[10px] text-slate-400 flex items-center gap-1 truncate">
                              <MapPin className="w-3 h-3 shrink-0" />
                              {cls.location_or_link}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* GRID INFERIOR: FORMULÁRIO DE CONFIGURAÇÃO (5 COLS) + LISTA DE ENTREVISTAS E AGENDAMENTOS (7 COLS) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Coluna 1 (5 cols): Formulário Manual de Nova Notificação / Aula / Entrevista */}
        <div className={`lg:col-span-5 duralux-card rounded-xl border p-6 space-y-4 ${cardSurface}`}>
          <h3 className="font-bold text-[15px] flex items-center gap-2">
            <Plus className="w-4 h-4 text-[#3454d1]" />
            Novo Lembrete, Aula ou Entrevista
          </h3>

          <form onSubmit={handleCreateSchedule} className="space-y-3.5 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Categoria
                </label>
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    if (e.target.value === "entrevista") {
                      setScheduleType("one_time");
                    } else if (e.target.value === "aula") {
                      setScheduleType("recurring_weekly");
                    }
                  }}
                  className={`w-full rounded-lg px-3 py-2 border font-semibold ${inputSurface}`}
                >
                  <option value="aula">🎓 Aula da Faculdade</option>
                  <option value="entrevista">💼 Entrevista / Reunião</option>
                  <option value="faculdade">📚 Entrega / Prova</option>
                  <option value="financas">💳 Vencimento de Conta</option>
                  <option value="pessoal">⚡ Lembrete Pessoal</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Frequência do Alerta
                </label>
                <select
                  value={scheduleType}
                  onChange={(e) => setScheduleType(e.target.value)}
                  className={`w-full rounded-lg px-3 py-2 border font-semibold ${inputSurface}`}
                >
                  <option value="recurring_weekly">Semanal (Seg a Sex)</option>
                  <option value="one_time">Data Específica (Entrevista)</option>
                  <option value="daily">Todos os Dias</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                Título da Matéria, Entrevista ou Compromisso
              </label>
              <input
                type="text"
                placeholder="Ex: Aula de Compiladores / Entrevista Técnica Empresa X"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={`w-full rounded-lg px-3 py-2 border ${inputSurface}`}
              />
            </div>

            {scheduleType === "recurring_weekly" && (
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1.5">
                  Dias da Semana da Aula / Alerta
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAYS.map((d) => {
                    const active = selectedDays.includes(d.code);
                    return (
                      <button
                        type="button"
                        key={d.code}
                        onClick={() => toggleDay(d.code)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                          active
                            ? "bg-[#3454d1] border-[#3454d1] text-white"
                            : subtleSurface
                        }`}
                      >
                        {d.short}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {scheduleType === "one_time" && (
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Data da Entrevista / Evento
                </label>
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className={`w-full rounded-lg px-3 py-2 border ${inputSurface}`}
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                Horário (HH:MM)
              </label>
              <input
                type="time"
                value={notifyTime}
                onChange={(e) => setNotifyTime(e.target.value)}
                className={`w-full rounded-lg px-3 py-2 border ${inputSurface}`}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                Avisos (quantos quiser, com qualquer antecedência)
              </label>
              <ReminderPicker value={reminders} onChange={setReminders} inputSurface={inputSurface} />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                Sala / Local / Link da Entrevista (Opcional)
              </label>
              <input
                type="text"
                placeholder="Ex: Sala 302 ou link do Google Meet / Teams"
                value={locationOrLink}
                onChange={(e) => setLocationOrLink(e.target.value)}
                className={`w-full rounded-lg px-3 py-2 border ${inputSurface}`}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                Mensagem Personalizada da Notificação
              </label>
              <textarea
                rows={2}
                placeholder="Texto que aparecerá no alerta Push..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className={`w-full rounded-lg p-2.5 border ${inputSurface}`}
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-[#3454d1] hover:bg-[#2945b8] text-white font-bold text-xs shadow-sm transition-colors"
            >
              Salvar Agendamento de Notificação
            </button>
          </form>
        </div>

        {/* Coluna 2 (7 cols): Lista de Todas as Notificações, Entrevistas e Aulas Cadastradas */}
        <div className={`lg:col-span-7 duralux-card rounded-xl border p-6 space-y-4 ${cardSurface}`}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-[15px] flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#17c666]" />
                Entrevistas, Aulas & Alertas Programados ({schedules.length})
              </h3>
              <p className="text-xs text-slate-400">
                Gerencie ou dispare um teste individual de qualquer lembrete
              </p>
            </div>
          </div>

          <div className="space-y-3 max-h-[520px] overflow-y-auto">
            {schedules.map((item) => (
              <div
                key={item.id}
                className={`rounded-xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${subtleSurface}`}
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded ${
                        item.category === "entrevista"
                          ? "bg-[#ffa21d]/15 text-[#ffa21d]"
                          : item.category === "aula"
                          ? "bg-[#3454d1]/15 text-[#3454d1]"
                          : "bg-[#17c666]/15 text-[#17c666]"
                      }`}
                    >
                      {item.category}
                    </span>
                    <span className="font-bold text-sm">{item.title}</span>
                    <span className="text-xs font-extrabold text-[#3454d1]">
                      ⏰ {item.notify_time}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1">
                    {getReminderOffsets(item).map((m) => (
                      <span
                        key={m}
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#3454d1]/10 text-[#3454d1]"
                      >
                        🔔 {formatReminderOffset(m)}
                      </span>
                    ))}
                    <button
                      onClick={() => {
                        setEditingRemindersId(item.id);
                        setEditingReminders(getReminderOffsets(item));
                      }}
                      className="text-[10px] font-bold text-slate-400 hover:text-[#3454d1] flex items-center gap-0.5 px-1"
                    >
                      <Edit3 className="w-3 h-3" /> Editar avisos
                    </button>
                  </div>

                  {editingRemindersId === item.id && (
                    <div className="pt-2 space-y-2 text-xs">
                      <ReminderPicker
                        value={editingReminders}
                        onChange={setEditingReminders}
                        inputSurface={inputSurface}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            await api.updateNotification(item.id, {
                              reminder_offsets: editingReminders,
                            });
                            setEditingRemindersId(null);
                            await onRefresh();
                          }}
                          className="px-3 py-1.5 rounded-lg bg-[#17c666] text-white font-bold"
                        >
                          Salvar avisos
                        </button>
                        <button
                          onClick={() => setEditingRemindersId(null)}
                          className="px-3 py-1.5 text-slate-400 font-bold"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-slate-500 dark:text-slate-300">
                    {item.message}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 pt-1">
                    {item.schedule_type === "recurring_weekly" && (
                      <span className="font-semibold">
                        📅 Dias: {(item.days_of_week || "").toUpperCase()}
                      </span>
                    )}
                    {item.schedule_type === "one_time" && (
                      <span className="font-semibold text-[#ffa21d]">
                        📆 Data: {item.target_date || "Não definida"}
                      </span>
                    )}
                    {item.schedule_type === "daily" && (
                      <span className="font-semibold text-[#17c666]">
                        🔁 Diariamente
                      </span>
                    )}
                    {item.location_or_link && (
                      <span>📍 {item.location_or_link}</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onTriggerTestNotification(item)}
                    title="Disparar esta notificação agora para testar"
                    className="px-2.5 py-1.5 rounded-lg bg-[#3454d1]/10 hover:bg-[#3454d1] text-[#3454d1] hover:text-white text-xs font-bold transition-colors"
                  >
                    Testar
                  </button>

                  <button
                    onClick={async () => {
                      await api.updateNotification(item.id, {
                        enabled: !item.enabled,
                      });
                      await onRefresh();
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold ${
                      item.enabled
                        ? "bg-[#17c666]/15 text-[#17c666]"
                        : "bg-slate-200 dark:bg-slate-800 text-slate-400"
                    }`}
                  >
                    {item.enabled ? "Ativo" : "Pausado"}
                  </button>

                  <button
                    onClick={async () => {
                      if (!window.confirm(`Excluir "${item.title}"?`)) return;
                      await api.deleteNotification(item.id);
                      await onRefresh();
                    }}
                    className="text-slate-400 hover:text-[#ea4d4d] p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

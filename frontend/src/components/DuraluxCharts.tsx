import React from "react";
import type { FinanceSummary, TelemetryOverview } from "../types";

interface PaymentChartProps {
  finance: FinanceSummary | null;
  telemetry: TelemetryOverview | null;
  darkMode: boolean;
}

export const PaymentAndUsageChart: React.FC<PaymentChartProps> = ({
  finance,
  telemetry,
  darkMode,
}) => {
  // Últimos 6 meses com dados reais: entradas (salário + receitas) e saídas lançadas
  const MONTH_ABBR = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
  const now = new Date();
  const records = finance?.records ?? [];
  const salary = finance?.monthly_salary ?? 0;
  const months = Array.from({ length: 6 }, (_, k) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + k, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const inMonth = records.filter((r) => (r.due_date || "").startsWith(key));
    const extraIncome = inMonth
      .filter((r) => r.record_type === "income" && r.category !== "salario")
      .reduce((sum, r) => sum + r.amount, 0);
    const expense = inMonth
      .filter((r) => r.record_type === "expense" || r.record_type === "card_bill")
      .reduce((sum, r) => sum + r.amount, 0);
    return { label: MONTH_ABBR[d.getMonth()], income: salary + extraIncome, expense };
  });

  const maxVal = Math.max(...months.map((m) => Math.max(m.income, m.expense)), 100);

  const totalBalance = finance?.total_balance ?? 0;
  const pendingBills = finance?.pending_bills ?? 0;
  const totalTokens = telemetry?.usage_stats.total_tokens ?? 0;

  return (
    <div
      className={`duralux-card rounded-xl border flex flex-col justify-between ${
        darkMode
          ? "bg-[#182235] border-slate-800 text-slate-100"
          : "bg-white border-slate-200/90 text-[#283c50]"
      }`}
    >
      {/* Header do Card Duralux */}
      <div
        className={`px-4 sm:px-6 py-4 border-b flex flex-wrap items-center justify-between gap-2 ${
          darkMode ? "border-slate-800" : "border-slate-100"
        }`}
      >
        <div>
          <h3 className="font-bold text-sm sm:text-[15px] tracking-tight">
            Fluxo Financeiro
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Entradas e saídas dos últimos 6 meses
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-[11px] sm:text-xs font-medium">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#3454d1]" />
            Entradas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ea4d4d]" />
            Saídas
          </span>
        </div>
      </div>

      {/* Área do Gráfico Combinado (Barras + Linha Suave estilo ApexCharts do Duralux) */}
      <div className="px-4 sm:px-6 pt-6 pb-4">
        <div className="relative h-56 flex items-end justify-between gap-2 sm:gap-6 pt-6 pl-10 sm:pl-12 border-b border-dashed border-slate-200 dark:border-slate-800">
          {/* Linhas horizontais de grade */}
          <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
            {[1, 0.75, 0.5, 0.25, 0].map((ratio, idx) => (
              <div
                key={idx}
                className={`w-full border-b border-dashed flex items-center ${
                  darkMode ? "border-slate-800/80" : "border-slate-100"
                }`}
              >
                <span className="text-[10px] text-slate-400 -mt-4">
                  R$ {Math.round(maxVal * ratio)}
                </span>
              </div>
            ))}
          </div>

          {months.map((m) => {
            const incHeight = m.income > 0 ? Math.max(4, Math.round((m.income / maxVal) * 170)) : 0;
            const expHeight = m.expense > 0 ? Math.max(4, Math.round((m.expense / maxVal) * 170)) : 0;
            return (
              <div
                key={m.label}
                className="relative z-10 flex-1 flex flex-col items-center group"
              >
                {/* Tooltip no hover */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-9 bg-[#283c50] text-white text-[10px] px-2 py-1 rounded shadow-md whitespace-nowrap pointer-events-none">
                  +R$ {m.income.toFixed(0)} / -R$ {m.expense.toFixed(0)}
                </div>

                <div className="flex items-end gap-1.5 sm:gap-2 h-[175px]">
                  <div
                    style={{ height: `${incHeight}px` }}
                    className="w-3 sm:w-4 rounded-t-md bg-[#3454d1] transition-all duration-300 group-hover:brightness-110"
                  />
                  <div
                    style={{ height: `${expHeight}px` }}
                    className="w-3 sm:w-4 rounded-t-md bg-[#ea4d4d]/85 transition-all duration-300 group-hover:brightness-110"
                  />
                </div>
                <span className="text-[11px] font-semibold text-slate-400 mt-2.5">
                  {m.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rodapé de 4 Colunas Bordeado — Assinatura Visual Clássica do Duralux */}
      <div
        className={`grid grid-cols-2 lg:grid-cols-4 border-t ${
          darkMode ? "border-slate-800 divide-slate-800" : "border-slate-100 divide-slate-100"
        } divide-x divide-y lg:divide-y-0`}
      >
        <div className="p-4">
          <div className="text-xs text-slate-400 font-medium">Saldo em Contas</div>
          <div className="text-base font-bold mt-1">
            R$ {totalBalance.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-400 font-medium">Faturas Aguardando</div>
          <div className="text-base font-bold mt-1">
            R$ {pendingBills.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-400 font-medium">Despesas Quitadas</div>
          <div className="text-base font-bold mt-1">
            R${" "}
            {(finance?.paid_expenses ?? 0).toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
            })}
          </div>
        </div>

        <div className="p-4">
          <div className="text-xs text-slate-400 font-medium">Tokens IA Utilizados</div>
          <div className="text-base font-bold mt-1">
            {totalTokens.toLocaleString("pt-BR")}
          </div>
        </div>
      </div>
    </div>
  );
};

interface MemoryDonutProps {
  telemetry: TelemetryOverview | null;
  darkMode: boolean;
}

export const MemoryDonutChart: React.FC<MemoryDonutProps> = ({
  telemetry,
  darkMode,
}) => {
  const facts = telemetry?.memory_stats.total_memory_facts ?? 3;
  const chunks = telemetry?.memory_stats.total_rag_chunks ?? 0;
  const finRecs = telemetry?.memory_stats.structured_records.finance_records ?? 3;
  const acadTasks = telemetry?.memory_stats.structured_records.academic_tasks ?? 2;
  const ftCount = telemetry?.memory_stats.structured_records.finetune_examples ?? 1;

  const totalItems = Math.max(1, facts + chunks + finRecs + acadTasks + ftCount);

  const items = [
    { label: "Core Memory (Fatos)", count: facts, color: "#3454d1" },
    { label: "Chunks RAG Vetorizados", count: chunks, color: "#17c666" },
    { label: "Registros Financeiros", count: finRecs, color: "#ffa21d" },
    { label: "Atividades Faculdade", count: acadTasks, color: "#ea4d4d" },
    { label: "Exemplos Fine-Tune", count: ftCount, color: "#3dc7be" },
  ];

  // Cálculo dos arcos do SVG Donut
  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  let accumulatedPercent = 0;

  return (
    <div
      className={`duralux-card rounded-xl border flex flex-col justify-between ${
        darkMode
          ? "bg-[#182235] border-slate-800 text-slate-100"
          : "bg-white border-slate-200/90 text-[#283c50]"
      }`}
    >
      <div
        className={`px-6 py-4 border-b flex items-center justify-between ${
          darkMode ? "border-slate-800" : "border-slate-100"
        }`}
      >
        <div>
          <h3 className="font-bold text-[15px] tracking-tight">
            Composição da Memória
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Distribuição Híbrida (SQL + Vetores RAG)
          </p>
        </div>
        <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full bg-[#3454d1]/10 text-[#3454d1]">
          {telemetry?.memory_stats.total_files_uploaded ?? 0} arquivos
        </span>
      </div>

      {/* SVG Donut Central */}
      <div className="p-6 flex flex-col items-center">
        <div className="relative w-44 h-44 flex items-center justify-center">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 160 160">
            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="transparent"
              stroke={darkMode ? "#1e293b" : "#f1f5f9"}
              strokeWidth="18"
            />
            {items.map((item) => {
              const pct = Math.max(0.04, item.count / totalItems);
              const strokeDasharray = `${pct * circumference} ${circumference}`;
              const strokeDashoffset = -accumulatedPercent * circumference;
              accumulatedPercent += pct;
              return (
                <circle
                  key={item.label}
                  cx="80"
                  cy="80"
                  r={radius}
                  fill="transparent"
                  stroke={item.color}
                  strokeWidth="18"
                  strokeDasharray={strokeDasharray}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="butt"
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-extrabold">{totalItems}</span>
            <span className="text-[11px] text-slate-400 font-medium">
              Itens na Memória
            </span>
          </div>
        </div>

        {/* Lista de Legendas em Grid Estilo Duralux */}
        <div className="w-full grid grid-cols-1 gap-2 mt-4">
          {items.map((item) => (
            <div
              key={item.label}
              className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs ${
                darkMode
                  ? "bg-slate-900/60 border-slate-800"
                  : "bg-slate-50/70 border-slate-200/70"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: item.color }}
                />
                <span className="font-medium">{item.label}</span>
              </div>
              <span className="font-bold">{item.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

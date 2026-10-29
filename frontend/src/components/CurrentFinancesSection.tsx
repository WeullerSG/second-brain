import React, { useState } from "react";
import {
  Calendar,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Edit3,
  FileText,
  Layers,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  TrendingUp,
  Upload,
  Wallet,
} from "lucide-react";
import { api } from "../api";
import type { FinanceRecord, FinanceSummary, InstallmentContractItem } from "../types";
import { FinanceRecordEditor, RECORD_CATEGORIES } from "./FinanceRecordEditor";

interface CurrentFinancesSectionProps {
  finance: FinanceSummary;
  darkMode: boolean;
  onRefresh: () => Promise<void>;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export const CurrentFinancesSection: React.FC<CurrentFinancesSectionProps> = ({
  finance,
  darkMode,
  onRefresh,
}) => {
  // Estados de upload / sincronização de fatura
  const [uploadingFatura, setUploadingFatura] = useState(false);
  const [syncingFatura, setSyncingFatura] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  // Estado para editar Salário Mensal e Saldo Atual rapidamente
  const [editingSalary, setEditingSalary] = useState(false);
  const [salaryInput, setSalaryInput] = useState(
    String(finance.salary_forecast?.monthly_salary ?? finance.monthly_salary ?? 0)
  );
  const defaultCardName =
    finance.accounts.find((a) => a.account_type === "credit_card")?.name ?? "";
  const [editingBalanceAccId, setEditingBalanceAccId] = useState<number | null>(null);
  const [quickBalanceInput, setQuickBalanceInput] = useState("");

  // Estado para cadastrar Compra Parcelada manualmente
  const [showInstallmentModal, setShowInstallmentModal] = useState(false);
  const [instTitle, setInstTitle] = useState("");
  const [instAmount, setInstAmount] = useState("");
  const [instCurrent, setInstCurrent] = useState("1");
  const [instTotal, setInstTotal] = useState("2");
  const [instCardName, setInstCardName] = useState(defaultCardName);
  const [instDueDate, setInstDueDate] = useState(todayISO());
  const [instCurrentPaid, setInstCurrentPaid] = useState(false);
  const [instKind, setInstKind] = useState<"parcelado" | "financiamento">("parcelado");
  const isFinancing = instKind === "financiamento";

  // Estados de edição (lançamentos, contas e parcelamentos)
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [editingInstId, setEditingInstId] = useState<number | null>(null);
  const [editInstTitle, setEditInstTitle] = useState("");
  const [editInstAmount, setEditInstAmount] = useState("");
  const [editInstAccount, setEditInstAccount] = useState("");

  const saveRecordEdit = async (id: number, data: Partial<FinanceRecord>) => {
    await api.updateFinanceRecord(id, data);
    setEditingRecordId(null);
    await onRefresh();
  };

  const deleteRecord = async (rec: { id: number; title: string }) => {
    if (!window.confirm(`Excluir "${rec.title}"?`)) return;
    await api.deleteFinanceRecord(rec.id);
    await onRefresh();
  };

  const startInstEdit = (inst: InstallmentContractItem) => {
    setEditingInstId(inst.id);
    setEditInstTitle(inst.title);
    setEditInstAmount(String(inst.installment_amount));
    setEditInstAccount(inst.account_name);
  };

  const saveInstEdit = async (inst: InstallmentContractItem) => {
    const amt = parseFloat(editInstAmount.replace(",", "."));
    await api.updateInstallmentGroup({
      record_ids: inst.schedule.map((s) => s.record_id),
      title: editInstTitle.trim() || undefined,
      installment_amount: amt > 0 ? amt : undefined,
      account_name: editInstAccount,
    });
    setEditingInstId(null);
    await onRefresh();
  };

  const deleteInstGroup = async (inst: InstallmentContractItem) => {
    const label = inst.category === "financiamento" ? "o financiamento" : "o parcelamento";
    if (!window.confirm(`Excluir ${label} "${inst.title}" e todas as ${inst.schedule.length} parcelas?`)) return;
    await api.deleteInstallmentGroup(inst.schedule.map((s) => s.record_id));
    await onRefresh();
  };

  // Estado para cadastrar Conta / Cartão
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [accName, setAccName] = useState("");
  const [accType, setAccType] = useState("checking");
  const [accBalance, setAccBalance] = useState("");
  const [accLimit, setAccLimit] = useState("");
  const [accClosingDay, setAccClosingDay] = useState("");
  const [accDueDay, setAccDueDay] = useState("");

  // Estado para cadastrar Lançamento avulso
  const [recTitle, setRecTitle] = useState("");
  const [recAmount, setRecAmount] = useState("");
  const [recType, setRecType] = useState("expense");
  const [recCategory, setRecCategory] = useState("alimentacao");
  const [recAccount, setRecAccount] = useState(finance.accounts[0]?.name ?? "Principal");
  const [recDueDate, setRecDueDate] = useState(todayISO());
  const [recStatus, setRecStatus] = useState("paid");

  // Aba de visualização dos gastos do mês atual e mês selecionado na projeção futura
  const [monthSpendView, setMonthSpendView] = useState<
    "consolidated" | "card_details" | "all_records"
  >("consolidated");
  const [selectedUpcomingMonthIdx, setSelectedUpcomingMonthIdx] = useState(0);

  const cardSurface = darkMode
    ? "bg-[#182235] border-slate-800 text-slate-100"
    : "bg-white border-slate-200/90 text-[#283c50]";
  const subtleSurface = darkMode
    ? "bg-slate-900/70 border-slate-800"
    : "bg-[#f8fafc] border-slate-200/80";
  const inputSurface = darkMode
    ? "bg-[#0f172a] border-slate-700 text-slate-100 placeholder-slate-500"
    : "bg-[#f8fafc] border-slate-200 text-[#283c50] placeholder-slate-400";

  const sf = finance.salary_forecast ?? {
    monthly_salary: finance.monthly_salary ?? 0,
    current_checking_balance: finance.total_balance,
    total_credit_limit: finance.total_credit_limit,
    total_credit_used: finance.total_credit_used ?? 0,
    total_credit_available:
      finance.total_credit_available ?? finance.total_credit_limit,
    current_month_label: "",
    spent_this_month: finance.paid_expenses,
    next_month_label: "",
    next_month_installments_total: 0,
    next_month_card_accumulated: 0,
    next_month_cards_and_installments: 0,
    next_month_fixed_bills: 0,
    next_month_total_committed: 0,
    projected_salary_leftover: 0,
    projected_leftover_after_cards_only: 0,
    committed_percent: 0,
    savings_goal_20pct: 0,
    free_after_savings_goal: 0,
  };
  const currentMonthLeftover =
    sf.current_month_leftover ?? sf.monthly_salary - sf.spent_this_month;

  const cm = finance.current_month_summary ?? {
    month_key: "",
    month_label: "",
    salary_received: sf.monthly_salary,
    total_spent_this_month: finance.paid_expenses,
    paid_this_month: finance.paid_expenses,
    pending_this_month: 0,
    card_bills_paid_this_month: 0,
    direct_expenses_this_month: 0,
    new_card_spend_next_bill: 0,
    categories: [],
    items: finance.records.filter((r) => r.status === "paid" && r.record_type !== "income"),
    card_statement_items: [],
  };
  const cardStatementTotal = cm.card_statement_items.reduce((sum, it) => sum + it.amount, 0);

  const instSummary = finance.installments_summary ?? {
    active_count: 0,
    monthly_total: 0,
    total_remaining_debt: 0,
    items: [],
  };

  const upcomingMonths = finance.upcoming_months ?? [];
  const activeUpcomingMonth =
    upcomingMonths[selectedUpcomingMonthIdx] ?? upcomingMonths[0] ?? null;

  const formatBRL = (val: number) =>
    val.toLocaleString("pt-BR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const handleUploadFatura = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFatura(true);
    setFeedbackBanner(null);
    try {
      // O upload já importa os lançamentos deste arquivo
      await api.uploadDocument(file, "financas");
      await onRefresh();
      setFeedbackBanner(
        `✅ Fatura/Extrato "${file.name}" processado! Saldo atual, gastos do mês, compras parceladas e previsão dos próximos meses foram atualizados automaticamente.`
      );
    } catch (err: any) {
      setFeedbackBanner(`❌ Erro ao processar fatura: ${err.message || err}`);
    } finally {
      setUploadingFatura(false);
      e.target.value = "";
    }
  };

  const handleSyncStatements = async () => {
    setSyncingFatura(true);
    setFeedbackBanner(null);
    try {
      const res = await api.syncStatements();
      await onRefresh();
      setFeedbackBanner(
        `✨ Faturas e extratos sincronizados! Contas atualizadas: ${res.sync_result.updated_accounts} • Novos registros/parcelas: ${res.sync_result.created_records}.`
      );
    } catch (err: any) {
      setFeedbackBanner(`❌ Erro ao sincronizar: ${err.message || err}`);
    } finally {
      setSyncingFatura(false);
    }
  };

  const handleSaveSalary = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(salaryInput.replace(",", "."));
    if (!val || val <= 0) return;
    await api.updateSalary({ monthly_salary: val });
    setEditingSalary(false);
    setFeedbackBanner(
      `✅ Salário mensal atualizado para R$ ${formatBRL(val)}! A previsão de sobra foi recalculada.`
    );
    await onRefresh();
  };

  const handleCreateInstallment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!instTitle.trim() || !instAmount) return;
    const amt = parseFloat(instAmount.replace(",", "."));
    const curr = parseInt(instCurrent || "1", 10);
    const tot = parseInt(instTotal || "2", 10);
    if (!amt || amt <= 0) return;

    const res = await api.createInstallmentPurchase({
      title: instTitle.trim(),
      installment_amount: amt,
      current_installment: curr,
      total_installments: tot,
      account_name: instCardName,
      category: instKind,
      first_due_date: instDueDate || undefined,
      current_month_paid: instCurrentPaid,
    });
    setInstTitle("");
    setInstAmount("");
    setShowInstallmentModal(false);
    setFeedbackBanner(
      `✅ ${isFinancing ? "Financiamento" : "Compra parcelada"} "${res.title}" (${tot}x de R$ ${formatBRL(amt)}) anotada! ${res.created_installments_count} parcelas foram registradas nos próximos meses.`
    );
    await onRefresh();
  };

  return (
    <div className="space-y-6">
      {/* =====================================================================
          BARRA DE AÇÃO RÁPIDA: ENVIAR FATURA PDF, ANOTAR PARCELADO & SALÁRIO
      ====================================================================== */}
      <div
        className={`duralux-card rounded-xl border p-4 md:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${cardSurface}`}
      >
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-[#17c666]/15 text-[#17c666] text-[10px] font-extrabold uppercase tracking-wider">
              Sincronizado c/ PDFs Reais
            </span>
            <h3 className="font-extrabold text-sm md:text-[15px]">
              Controle de Saldo Atual, Gastos de {cm.month_label}, Parcelados & Sobra do Salário
            </h3>
          </div>
          <p className="text-xs text-slate-400">
            Ao enviar sua fatura ou extrato em PDF, o sistema anota automaticamente o que tem parcelado, registra os próximos meses e calcula quanto vai sobrar do seu salário.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto shrink-0">
          <button
            onClick={() => setShowInstallmentModal(!showInstallmentModal)}
            className="w-full sm:w-auto px-3.5 py-2.5 sm:py-2 rounded-lg bg-[#3454d1]/10 hover:bg-[#3454d1] text-[#3454d1] hover:text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
          >
            <Layers className="w-3.5 h-3.5 shrink-0" />
            + Anotar Compra Parcelada
          </button>

          <button
            onClick={handleSyncStatements}
            disabled={syncingFatura}
            className={`w-full sm:w-auto px-3 py-2.5 sm:py-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
              darkMode
                ? "border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200"
                : "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"
            }`}
          >
            <RefreshCw
              className={`w-3.5 h-3.5 shrink-0 ${syncingFatura ? "animate-spin" : ""}`}
            />
            {syncingFatura ? "Sincronizando..." : "Reprocessar Faturas"}
          </button>

          <label className="w-full sm:w-auto cursor-pointer bg-[#17c666] hover:brightness-95 text-white px-4 py-2.5 sm:py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all">
            <Upload className="w-3.5 h-3.5 shrink-0" />
            {uploadingFatura
              ? "Lendo Fatura e Parcelas..."
              : "Enviar Fatura / Extrato PDF"}
            <input
              type="file"
              accept=".pdf,.txt,.csv,.md"
              onChange={handleUploadFatura}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {feedbackBanner && (
        <div className="rounded-xl border border-[#17c666]/40 bg-[#17c666]/10 px-4 py-3 text-xs font-bold text-[#17c666] flex items-center justify-between gap-3">
          <span>{feedbackBanner}</span>
          <button
            onClick={() => setFeedbackBanner(null)}
            className="text-xs underline shrink-0"
          >
            Fechar
          </button>
        </div>
      )}

      {/* MODAL / FORMULÁRIO INLINE PARA REGISTRAR COMPRA PARCELADA */}
      {showInstallmentModal && (
        <form
          onSubmit={handleCreateInstallment}
          className={`duralux-card rounded-xl border p-5 space-y-4 ${cardSurface} border-[#3454d1]/40`}
        >
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-bold text-sm text-[#3454d1] flex items-center gap-2">
                <Layers className="w-4 h-4" />
                {isFinancing ? "Anotar Financiamento" : "Anotar Compra Parcelada"} (Registra Automaticamente nos Próximos Meses)
              </h4>
              <p className="text-xs text-slate-400">
                {isFinancing
                  ? "Informe a parcela atual e o total de parcelas (sem limite, ex: 120x, 360x) para registrar as prestações mensais"
                  : "Informe a parcela atual e o total de parcelas para deixar registrado tudo o que vai vir nas próximas faturas"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowInstallmentModal(false)}
              className="text-xs text-slate-400 hover:text-slate-200 font-bold"
            >
              ✕ Fechar
            </button>
          </div>

          <div className="inline-flex rounded-lg border border-slate-300 dark:border-slate-700 p-0.5 text-xs font-bold">
            {(
              [
                ["parcelado", "Parcelado no Cartão"],
                ["financiamento", "Financiamento"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setInstKind(value);
                  setInstCardName(value === "financiamento" ? "" : defaultCardName);
                }}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  instKind === value ? "bg-[#3454d1] text-white" : "text-slate-400 hover:text-[#3454d1]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <div className=" lg:col-span-2">
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                {isFinancing ? "O que foi financiado" : "Estabelecimento / Compra"}
              </label>
              <input
                type="text"
                required
                placeholder={isFinancing ? "Ex: Carro, Apartamento, Empréstimo" : "Ex: Amazon BR, Mercado Livre, Notebook"}
                value={instTitle}
                onChange={(e) => setInstTitle(e.target.value)}
                className={`w-full rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                Valor da Parcela (R$)
              </label>
              <input
                type="number"
                step="0.01"
                required
                placeholder="Ex: 54.70"
                value={instAmount}
                onChange={(e) => setInstAmount(e.target.value)}
                className={`w-full rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Parcela Atual
                </label>
                <input
                  type="number"
                  min={1}
                  value={instCurrent}
                  onChange={(e) => setInstCurrent(e.target.value)}
                  className={`w-full rounded-lg px-2.5 py-2 text-xs border ${inputSurface}`}
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Total Parcelas
                </label>
                <input
                  type="number"
                  min={1}
                  value={instTotal}
                  onChange={(e) => setInstTotal(e.target.value)}
                  className={`w-full rounded-lg px-2.5 py-2 text-xs border ${inputSurface}`}
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                {isFinancing ? "Banco / Financeira" : "Cartão de Crédito"}
              </label>
              <input
                type="text"
                required
                placeholder={isFinancing ? "Ex: Caixa, Banco do Brasil" : undefined}
                value={instCardName}
                onChange={(e) => setInstCardName(e.target.value)}
                className={`w-full rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                Próx. Vencimento
              </label>
              <input
                type="date"
                value={instDueDate}
                onChange={(e) => setInstDueDate(e.target.value)}
                className={`w-full rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={instCurrentPaid}
                onChange={(e) => setInstCurrentPaid(e.target.checked)}
                className="rounded text-[#3454d1]"
              />
              <span>
                A parcela atual ({instCurrent}/{instTotal}) já foi paga neste mês (gerar a partir da parcela{" "}
                {Math.min(Number(instTotal), Number(instCurrent) + 1)}/{instTotal})
              </span>
            </label>

            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-[#3454d1] hover:bg-[#2945b8] text-white text-xs font-bold shadow-sm"
            >
              {isFinancing ? "Salvar Financiamento" : "Salvar Parcelamento"} & Agendar Próximos Meses
            </button>
          </div>
        </form>
      )}

      {/* =====================================================================
          4 KPI CARDS PRINCIPAIS (MEU SALDO ATUAL, GASTO NO MÊS, PARCELADOS, PREVISÃO DO SALÁRIO)
      ====================================================================== */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-5">
        {/* Card 1: Meu Saldo Atual */}
        <div className={`duralux-card rounded-xl border p-3.5 sm:p-5 ${cardSurface}`}>
          <div className="flex items-start justify-between gap-3 min-w-0">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="hidden sm:flex w-11 h-11 rounded-full bg-[#3454d1]/15 text-[#3454d1] items-center justify-center shrink-0">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 leading-snug">
                  Meu Saldo Atual em Conta
                </div>
                <div className="text-lg sm:text-2xl font-extrabold text-[#3454d1] mt-0.5">
                  R$ {formatBRL(sf.current_checking_balance)}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-dashed border-slate-200 dark:border-slate-800 text-[11px] sm:text-xs space-y-1.5 sm:space-y-1">
            <div className="flex flex-col sm:flex-row sm:justify-between">
              <span className="text-slate-400">Limite Disponível Cartões:</span>
              <span className="font-bold text-[#17c666]">
                R$ {formatBRL(sf.total_credit_available)}
              </span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between">
              <span className="text-slate-400">Limite em Uso (Próx. Fatura):</span>
              <span className="font-bold text-[#ffa21d]">
                R$ {formatBRL(sf.total_credit_used)}
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: O Que Já Gastei Esse Mês */}
        <div className={`duralux-card rounded-xl border p-3.5 sm:p-5 ${cardSurface}`}>
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="hidden sm:flex w-11 h-11 rounded-full bg-[#ea4d4d]/15 text-[#ea4d4d] items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 leading-snug">
                O Que Já Gastei ({cm.month_label})
              </div>
              <div className="text-lg sm:text-2xl font-extrabold text-[#ea4d4d] mt-0.5">
                R$ {formatBRL(cm.total_spent_this_month)}
              </div>
            </div>
          </div>
          <div className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-dashed border-slate-200 dark:border-slate-800 text-[11px] sm:text-xs space-y-1.5 sm:space-y-1">
            <div className="flex flex-col sm:flex-row sm:justify-between">
              <span className="text-slate-400">Faturas de Cartão Pagas:</span>
              <span className="font-bold">
                R$ {formatBRL(cm.card_bills_paid_this_month)}
              </span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between">
              <span className="text-slate-400">Contas Fixas & Pix no Mês:</span>
              <span className="font-bold">
                R$ {formatBRL(cm.direct_expenses_this_month)}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: O Que Tem Parcelado & Próx. Fatura */}
        <div className={`duralux-card rounded-xl border p-3.5 sm:p-5 ${cardSurface}`}>
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="hidden sm:flex w-11 h-11 rounded-full bg-[#ffa21d]/15 text-[#ffa21d] items-center justify-center shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 leading-snug">
                Parcelado + Cartão p/ {sf.next_month_label}
              </div>
              <div className="text-lg sm:text-2xl font-extrabold text-[#ffa21d] mt-0.5">
                R$ {formatBRL(sf.next_month_cards_and_installments)}
              </div>
            </div>
          </div>
          <div className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-dashed border-slate-200 dark:border-slate-800 text-[11px] sm:text-xs space-y-1.5 sm:space-y-1">
            <div className="flex flex-col sm:flex-row sm:justify-between">
              <span className="text-slate-400">
                Compras Parceladas ({instSummary.active_count}):
              </span>
              <span className="font-bold text-[#ffa21d]">
                R$ {formatBRL(sf.next_month_installments_total)}/mês
              </span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between">
              <span className="text-slate-400">Cartão Acumulado:</span>
              <span className="font-bold">
                R$ {formatBRL(sf.next_month_card_accumulated)}
              </span>
            </div>
          </div>
        </div>

        {/* Card 4: Previsão de Quanto Vai Sobrar do Salário */}
        <div className={`duralux-card rounded-xl border p-3.5 sm:p-5 ${cardSurface}`}>
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="hidden sm:flex w-11 h-11 rounded-full bg-[#17c666]/15 text-[#17c666] items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-slate-400 leading-snug">
                Sobra do Salário ({cm.month_label})
              </div>
              <div
                className={`text-lg sm:text-2xl font-extrabold mt-0.5 ${
                  currentMonthLeftover < 0 ? "text-[#ea4d4d]" : "text-[#17c666]"
                }`}
              >
                R$ {formatBRL(currentMonthLeftover)}
              </div>
            </div>
          </div>
          <div className="mt-3 sm:mt-4 pt-2.5 sm:pt-3 border-t border-dashed border-slate-200 dark:border-slate-800 text-[11px] sm:text-xs space-y-1.5 sm:space-y-1">
            <div className="flex flex-col sm:flex-row sm:justify-between">
              <span className="text-slate-400">Gasto lançado no mês:</span>
              <span className="font-bold text-[#ea4d4d]">
                - R$ {formatBRL(cm.total_spent_this_month)}
              </span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between">
              <span className="text-slate-400">Previsão p/ {sf.next_month_label}:</span>
              <span className="font-bold text-[#17c666]">
                R$ {formatBRL(sf.projected_salary_leftover)}
              </span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between">
              <span className="text-slate-400">Salário Base Mensal:</span>
              <span className="font-bold">R$ {formatBRL(sf.monthly_salary)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          SEÇÃO 1: PREVISÃO DE QUANTO VAI SOBRAR DO MEU SALÁRIO + MEU SALDO E CARTÕES ATUAIS
      ====================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Coluna Esquerda (7 cols): Simulador & Previsão de Quanto Vai Sobrar do Salário */}
        <div
          className={`lg:col-span-7 duralux-card rounded-xl border p-4 sm:p-6 space-y-5 ${cardSurface}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-[#17c666]/15 text-[#17c666]">
                Projeção Realista do Próximo Pagamento
              </span>
              <h3 className="font-bold text-sm sm:text-[15px] mt-1">
                Previsão de Quanto Vai Sobrar do Meu Salário ({sf.next_month_label})
              </h3>
              <p className="text-xs text-slate-400">
                Cálculo automático descontando as parcelas anotadas da fatura, gastos no cartão e contas fixas mensais
              </p>
            </div>

            {!editingSalary ? (
              <button
                onClick={() => {
                  setSalaryInput(String(sf.monthly_salary));
                  setEditingSalary(true);
                }}
                className="w-full sm:w-auto justify-center px-3 py-2 sm:py-1.5 rounded-lg border border-[#3454d1]/30 bg-[#3454d1]/10 text-[#3454d1] text-xs font-bold flex items-center gap-1.5 hover:bg-[#3454d1] hover:text-white transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Salário: R$ {formatBRL(sf.monthly_salary)}
              </button>
            ) : (
              <form onSubmit={handleSaveSalary} className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="number"
                  step="0.01"
                  value={salaryInput}
                  onChange={(e) => setSalaryInput(e.target.value)}
                  className={`flex-1 sm:w-28 rounded-lg px-2.5 py-1.5 text-xs border font-bold ${inputSurface}`}
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-[#17c666] text-white text-xs font-bold"
                >
                  Salvar
                </button>
                <button
                  type="button"
                  onClick={() => setEditingSalary(false)}
                  className="text-xs text-slate-400 px-1"
                >
                  ✕
                </button>
              </form>
            )}
          </div>

          {/* Barra visual de comprometimento do salário */}
          <div className={`p-3.5 sm:p-4 rounded-xl border space-y-2.5 ${subtleSurface}`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
              <span className="font-bold">
                Comprometimento Previsto em {sf.next_month_label}:{" "}
                <span className="text-[#ffa21d]">{sf.committed_percent}%</span>
              </span>
              <span className="font-extrabold text-[#17c666]">
                Livre: {(100 - sf.committed_percent).toFixed(1)}% (R${" "}
                {formatBRL(sf.projected_salary_leftover)})
              </span>
            </div>
            <div className="w-full h-3 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden flex">
              <div
                className="h-full bg-[#ffa21d]"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round(
                      (sf.next_month_cards_and_installments / sf.monthly_salary) *
                        100
                    )
                  )}%`,
                }}
                title="Parcelas + Cartão Acumulado"
              />
              <div
                className="h-full bg-[#3454d1]"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((sf.next_month_fixed_bills / sf.monthly_salary) * 100)
                  )}%`,
                }}
                title="Contas Fixas (Faculdade + Luz + Assinaturas)"
              />
              <div
                className="h-full bg-[#17c666]"
                style={{
                  width: `${Math.max(0, 100 - sf.committed_percent)}%`,
                }}
                title="Saldo que vai sobrar livre"
              />
            </div>
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-1.5 sm:gap-4 text-[11px] text-slate-400 pt-1">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ffa21d] shrink-0" />
                Parcelas & Cartões: R${" "}
                {formatBRL(sf.next_month_cards_and_installments)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#3454d1] shrink-0" />
                Contas Fixas: R${" "}
                {formatBRL(sf.next_month_fixed_bills)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#17c666] shrink-0" />
                Sobra Livre: R${" "}
                {formatBRL(sf.projected_salary_leftover)}
              </span>
            </div>
          </div>

          {/* Demonstrativo passo a passo da sobra do salário */}
          <div className="space-y-2.5 text-xs">
            <div className="flex flex-row items-center justify-between gap-3 py-2.5 px-3 rounded-lg bg-[#17c666]/10 border border-[#17c666]/20">
              <span className="font-bold text-[#17c666]">
                (+) Salário Mensal
              </span>
              <span className="font-extrabold text-sm text-[#17c666] whitespace-nowrap">
                + R$ {formatBRL(sf.monthly_salary)}
              </span>
            </div>

            <div className="flex flex-row items-center justify-between gap-3 py-2.5 px-3 rounded-lg border border-slate-200/70 dark:border-slate-800">
              <div className="min-w-0">
                <div className="font-bold">
                  (-) Compras Parceladas Anotadas da Fatura ({sf.next_month_label})
                </div>
                <div className="text-[11px] text-slate-400">
                  Parcelamentos e financiamentos com vencimento no mês
                </div>
              </div>
              <span className="font-extrabold text-[#ea4d4d] whitespace-nowrap shrink-0">
                - R$ {formatBRL(sf.next_month_installments_total)}
              </span>
            </div>

            <div className="flex flex-row items-center justify-between gap-3 py-2.5 px-3 rounded-lg border border-slate-200/70 dark:border-slate-800">
              <div className="min-w-0">
                <div className="font-bold">
                  (-) Gastos no Cartão já Acumulados para a Próxima Fatura
                </div>
                <div className="text-[11px] text-slate-400">
                  Compras no cartão lançadas para a próxima fatura
                </div>
              </div>
              <span className="font-extrabold text-[#ea4d4d] whitespace-nowrap shrink-0">
                - R$ {formatBRL(sf.next_month_card_accumulated)}
              </span>
            </div>

            <div className="flex flex-row items-center justify-between gap-3 py-2.5 px-3 rounded-lg bg-[#3454d1]/10 border border-[#3454d1]/20">
              <span className="font-bold text-[#3454d1]">
                (=) Sobra do Salário após quitar Parcelas e Cartões já lançados
              </span>
              <span className="font-extrabold text-sm text-[#3454d1] whitespace-nowrap shrink-0">
                R$ {formatBRL(sf.projected_leftover_after_cards_only)}
              </span>
            </div>

            <div className="flex flex-row items-center justify-between gap-3 py-2.5 px-3 rounded-lg border border-slate-200/70 dark:border-slate-800">
              <div className="min-w-0">
                <div className="font-bold">
                  (-) Contas Fixas Mensais Previstas ({sf.next_month_label})
                </div>
                <div className="text-[11px] text-slate-400">
                  Contas e gastos no saldo previstos para o mês
                </div>
              </div>
              <span className="font-extrabold text-[#ea4d4d] whitespace-nowrap shrink-0">
                - R$ {formatBRL(sf.next_month_fixed_bills)}
              </span>
            </div>

            <div className="flex flex-row items-center justify-between gap-3 py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#17c666]/20 to-[#3dc7be]/15 border-2 border-[#17c666]/40">
              <div className="min-w-0">
                <div className="font-extrabold text-xs sm:text-sm text-[#17c666]">
                  (=) PREVISÃO DE QUANTO VAI SOBRAR DO SEU SALÁRIO
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Reservando sua meta de 20% (R$ {formatBRL(sf.savings_goal_20pct)}), ainda ficam{" "}
                  <strong className="text-[#17c666]">
                    R$ {formatBRL(sf.free_after_savings_goal)}
                  </strong>{" "}
                  livres para outros gastos no mês!
                </div>
              </div>
              <span className="font-extrabold text-lg sm:text-xl text-[#17c666] whitespace-nowrap shrink-0">
                R$ {formatBRL(sf.projected_salary_leftover)}
              </span>
            </div>
          </div>
        </div>

        {/* Coluna Direita (5 cols): Meu Saldo Atual & Cartões de Crédito */}
        <div
          className={`lg:col-span-5 duralux-card rounded-xl border p-4 sm:p-6 flex flex-col justify-between space-y-5 ${cardSurface}`}
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-bold text-sm sm:text-[15px] flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-[#3454d1] shrink-0" />
                  Meu Saldo Atual & Cartões
                </h3>
                <p className="text-xs text-slate-400">
                  Cadastrados por você ou extraídos dos PDFs enviados
                </p>
              </div>
              <button
                onClick={() => {
                  setShowAccountForm(!showAccountForm);
                  setEditingAccountId(null);
                  setAccName("");
                  setAccBalance("");
                  setAccLimit("");
                  setAccClosingDay("");
                  setAccDueDay("");
                }}
                className="px-2.5 py-1.5 rounded-lg bg-[#3454d1]/10 text-[#3454d1] hover:bg-[#3454d1] hover:text-white text-xs font-bold transition-colors shrink-0"
              >
                {showAccountForm ? "Fechar" : "+ Conta / Cartão"}
              </button>
            </div>

            <div className="space-y-3">
              {finance.accounts.map((acc) => {
                const isCard = acc.account_type === "credit_card";
                const availableLim = Math.max(0, acc.credit_limit - acc.balance);
                const usedPct =
                  isCard && acc.credit_limit > 0
                    ? Math.min(100, Math.round((acc.balance / acc.credit_limit) * 100))
                    : 0;

                return (
                  <div
                    key={acc.id}
                    className={`rounded-xl border p-3.5 sm:p-4 space-y-2.5 ${subtleSurface}`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-sm">{acc.name}</span>
                          <span
                            className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded ${
                              isCard
                                ? "bg-[#ffa21d]/15 text-[#ffa21d]"
                                : "bg-[#17c666]/15 text-[#17c666]"
                            }`}
                          >
                            {isCard ? "Cartão de Crédito" : "Saldo em Conta"}
                          </span>
                        </div>
                        {isCard ? (
                          <div className="text-xs text-slate-400 mt-1">
                            Limite Total: <strong>R$ {formatBRL(acc.credit_limit)}</strong> • Disponível:{" "}
                            <strong className="text-[#17c666]">
                              R$ {formatBRL(availableLim)}
                            </strong>
                            {acc.closing_day
                              ? ` • Fecha dia ${acc.closing_day}`
                              : ""}
                            {acc.due_day ? ` • Vence dia ${acc.due_day}` : ""}
                          </div>
                        ) : (
                          <div className="text-xs text-slate-400 mt-1">
                            Saldo disponível atualizado pelo último extrato enviado
                          </div>
                        )}
                      </div>

                      <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-200/60 dark:border-slate-800 shrink-0">
                        <div className="text-[10px] font-bold uppercase text-slate-400">
                          {isCard ? "Comprometido p/ Próx." : "Saldo Atual"}
                        </div>
                        <div
                          className={`text-base font-extrabold whitespace-nowrap ${
                            isCard ? "text-[#ffa21d]" : "text-[#17c666]"
                          }`}
                        >
                          R$ {formatBRL(acc.balance)}
                        </div>
                      </div>
                    </div>

                    {isCard && acc.credit_limit > 0 && (
                      <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#ffa21d] rounded-full"
                          style={{ width: `${Math.max(4, usedPct)}%` }}
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      {editingBalanceAccId === acc.id ? (
                        <div className="flex items-center gap-2 w-full">
                          <input
                            type="number"
                            step="0.01"
                            value={quickBalanceInput}
                            onChange={(e) => setQuickBalanceInput(e.target.value)}
                            placeholder="Novo valor R$"
                            className={`flex-1 rounded-lg px-2.5 py-1 text-xs border ${inputSurface}`}
                          />
                          <button
                            onClick={async () => {
                              const val = parseFloat(quickBalanceInput || "0");
                              await api.upsertAccount({
                                name: acc.name,
                                account_type: acc.account_type,
                                balance: val,
                                credit_limit: acc.credit_limit,
                                closing_day: acc.closing_day,
                                due_day: acc.due_day,
                              });
                              setEditingBalanceAccId(null);
                              await onRefresh();
                            }}
                            className="px-2.5 py-1 rounded bg-[#17c666] text-white text-[11px] font-bold"
                          >
                            Salvar
                          </button>
                          <button
                            onClick={() => setEditingBalanceAccId(null)}
                            className="text-xs text-slate-400"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => {
                              setEditingBalanceAccId(acc.id);
                              setQuickBalanceInput(String(acc.balance));
                            }}
                            className="text-[11px] text-[#3454d1] hover:underline font-bold flex items-center gap-1"
                          >
                            <Edit3 className="w-3 h-3" />
                            {isCard ? "Ajustar valor em aberto" : "Atualizar saldo atual"}
                          </button>
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => {
                                setEditingAccountId(acc.id);
                                setAccName(acc.name);
                                setAccType(acc.account_type);
                                setAccBalance(String(acc.balance));
                                setAccLimit(String(acc.credit_limit));
                                setAccClosingDay(acc.closing_day ? String(acc.closing_day) : "");
                                setAccDueDay(acc.due_day ? String(acc.due_day) : "");
                                setShowAccountForm(true);
                              }}
                              className="text-[11px] text-slate-400 hover:text-[#3454d1] font-semibold"
                            >
                              Editar
                            </button>
                            <button
                              onClick={async () => {
                                if (!window.confirm(`Remover "${acc.name}"?`)) return;
                                await api.deleteAccount(acc.id);
                                await onRefresh();
                              }}
                              className="text-[11px] text-slate-400 hover:text-[#ea4d4d] font-semibold"
                            >
                              Remover
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {showAccountForm && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!accName.trim()) return;
                const accData = {
                  name: accName.trim(),
                  account_type: accType,
                  balance: parseFloat(accBalance || "0"),
                  credit_limit: parseFloat(accLimit || "0"),
                  closing_day: accClosingDay ? parseInt(accClosingDay, 10) : null,
                  due_day: accDueDay ? parseInt(accDueDay, 10) : null,
                };
                try {
                  if (editingAccountId) {
                    await api.updateAccount(editingAccountId, accData);
                  } else {
                    await api.upsertAccount(accData);
                  }
                } catch (err: any) {
                  window.alert(`Não foi possível salvar: ${err.message || err}`);
                  return;
                }
                setEditingAccountId(null);
                setAccName("");
                setAccBalance("");
                setAccLimit("");
                setAccClosingDay("");
                setAccDueDay("");
                setShowAccountForm(false);
                await onRefresh();
              }}
              className={`space-y-2.5 p-4 rounded-xl border ${subtleSurface}`}
            >
              <div className="text-xs font-bold text-[#3454d1]">
                {editingAccountId ? "Editar Conta ou Cartão" : "Cadastrar Conta ou Cartão"}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  required
                  placeholder="Nome (ex: Conta PicPay)"
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  className={`rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
                />
                <select
                  value={accType}
                  onChange={(e) => setAccType(e.target.value)}
                  className={`rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
                >
                  <option value="checking">Conta Corrente (Saldo)</option>
                  <option value="credit_card">Cartão de Crédito</option>
                  <option value="investment">Reserva / Investimento</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  step="0.01"
                  placeholder={
                    accType === "credit_card"
                      ? "Fatura/Aberto Atual (R$)"
                      : "Saldo Atual (R$)"
                  }
                  value={accBalance}
                  onChange={(e) => setAccBalance(e.target.value)}
                  className={`rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Limite do Cartão (R$)"
                  value={accLimit}
                  onChange={(e) => setAccLimit(e.target.value)}
                  className={`rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min={1}
                  max={31}
                  placeholder="Dia Fechamento (ex: 9)"
                  value={accClosingDay}
                  onChange={(e) => setAccClosingDay(e.target.value)}
                  className={`rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
                />
                <input
                  type="number"
                  min={1}
                  max={31}
                  placeholder="Dia Vencimento (ex: 14)"
                  value={accDueDay}
                  onChange={(e) => setAccDueDay(e.target.value)}
                  className={`rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
                />
              </div>
              <button
                type="submit"
                className="w-full bg-[#3454d1] hover:bg-[#2945b8] text-white rounded-lg py-2 text-xs font-bold"
              >
                Salvar Conta / Cartão
              </button>
            </form>
          )}
        </div>
      </div>

      {/* =====================================================================
          SEÇÃO 2: ANOTADO DA FATURA — O QUE TEM PARCELADO & O QUE VEM NOS PRÓXIMOS MESES
      ====================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Coluna Esquerda (5 cols): Compras Parceladas Anotadas da Fatura */}
        <div
          className={`lg:col-span-5 duralux-card rounded-xl border p-4 sm:p-6 space-y-4 ${cardSurface}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-[#ffa21d]/15 text-[#ffa21d]">
                Rastreador de Parcelas
              </span>
              <h3 className="font-bold text-[15px] mt-1">
                O Que Tem Parcelado nas Faturas ({instSummary.active_count})
              </h3>
              <p className="text-xs text-slate-400">
                Detectado automaticamente do PDF da fatura ou anotado manualmente
              </p>
            </div>
            <button
              onClick={() => setShowInstallmentModal(true)}
              className="px-3 py-1.5 rounded-lg bg-[#ffa21d]/15 text-[#ffa21d] hover:bg-[#ffa21d] hover:text-white text-xs font-bold transition-colors"
            >
              + Parcelado
            </button>
          </div>

          {instSummary.items.length === 0 ? (
            <div className={`p-6 rounded-xl border text-center text-xs text-slate-400 ${subtleSurface}`}>
              Nenhuma compra parcelada ativa. Envie o PDF da fatura ou clique em "+ Parcelado" acima!
            </div>
          ) : (
            <div className="space-y-3.5">
              {instSummary.items.map((inst) => {
                const progressPct = Math.min(
                  100,
                  Math.round(
                    (inst.paid_installments / inst.total_installments) * 100
                  )
                );
                return (
                  <div
                    key={inst.id}
                    className={`rounded-xl border p-4 space-y-3 ${subtleSurface}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-extrabold text-sm break-words">
                            {inst.title}
                          </span>
                          {inst.category === "financiamento" && (
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-[#ffa21d]/15 text-[#ffa21d]">
                              Financiamento
                            </span>
                          )}
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-[#3454d1]/15 text-[#3454d1]">
                            {inst.total_installments}x de R${" "}
                            {formatBRL(inst.installment_amount)}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5">
                          {inst.account_name} • Valor Total da Compra:{" "}
                          <strong>
                            R$ {formatBRL(inst.total_purchase_amount)}
                          </strong>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-[10px] font-bold uppercase text-slate-400">
                          Falta Pagar
                        </div>
                        <div className="text-sm font-extrabold text-[#ea4d4d]">
                          R$ {formatBRL(inst.remaining_total_amount)}
                        </div>
                        <div className="flex justify-end gap-2 mt-1">
                          <button
                            onClick={() => startInstEdit(inst)}
                            className="text-slate-400 hover:text-[#3454d1] p-0.5"
                            title="Editar"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteInstGroup(inst)}
                            className="text-slate-400 hover:text-[#ea4d4d] p-0.5"
                            title="Excluir todas as parcelas"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {editingInstId === inst.id && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          saveInstEdit(inst);
                        }}
                        className="grid grid-cols-1 sm:grid-cols-3 gap-2"
                      >
                        <input
                          value={editInstTitle}
                          onChange={(e) => setEditInstTitle(e.target.value)}
                          placeholder="Nome"
                          className={`rounded-lg px-2.5 py-2 text-xs border ${inputSurface}`}
                        />
                        <input
                          type="number"
                          step="0.01"
                          value={editInstAmount}
                          onChange={(e) => setEditInstAmount(e.target.value)}
                          placeholder="Valor da parcela"
                          className={`rounded-lg px-2.5 py-2 text-xs border ${inputSurface}`}
                        />
                        <input
                          value={editInstAccount}
                          onChange={(e) => setEditInstAccount(e.target.value)}
                          placeholder="Cartão / Banco"
                          className={`rounded-lg px-2.5 py-2 text-xs border ${inputSurface}`}
                        />
                        <div className="sm:col-span-3 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingInstId(null)}
                            className="px-3 py-1.5 text-xs font-bold text-slate-400"
                          >
                            Cancelar
                          </button>
                          <button
                            type="submit"
                            className="px-4 py-1.5 rounded-lg bg-[#17c666] text-white text-xs font-bold"
                          >
                            Salvar em todas as parcelas
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Progresso das parcelas */}
                    <div className="space-y-1">
                      <div className="flex flex-col sm:flex-row sm:justify-between gap-0.5 text-[11px]">
                        <span className="text-slate-400">
                          Pagas:{" "}
                          <strong className="text-[#17c666]">
                            {inst.paid_installments} de {inst.total_installments}
                          </strong>
                        </span>
                        <span className="font-bold text-[#ffa21d]">
                          Restam {inst.remaining_installments} parcela(s) • Próx.
                          venc: {inst.next_due_date || "—"}
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#17c666] rounded-full"
                          style={{ width: `${Math.max(10, progressPct)}%` }}
                        />
                      </div>
                    </div>

                    {/* Cronograma de parcelas futuras */}
                    <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 space-y-1.5">
                      <div className="text-[10px] font-bold uppercase text-slate-400">
                        Parcelas Registradas para os Próximos Meses ({inst.schedule.length}):
                      </div>
                      <div className="max-h-52 overflow-y-auto pr-1 space-y-1.5">
                        {inst.schedule.map((sch) => (
                          <div
                            key={sch.record_id}
                            className="flex flex-wrap items-center justify-between gap-1.5 text-xs py-1.5 px-2.5 rounded-lg bg-slate-500/5"
                          >
                            <span className="font-semibold">
                              Parcela {sch.installment_number}/
                              {sch.total_installments} ({sch.month_label})
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[#ea4d4d] whitespace-nowrap">
                                R$ {formatBRL(sch.amount)}
                              </span>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded font-bold whitespace-nowrap ${
                                  sch.status === "paid"
                                    ? "bg-[#17c666]/15 text-[#17c666]"
                                    : "bg-[#ffa21d]/15 text-[#ffa21d]"
                                }`}
                              >
                                {sch.status === "paid" ? "Paga" : `Vence ${sch.due_date}`}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Coluna Direita (7 cols): Registrado Para Vir nos Próximos Meses */}
        <div
          className={`lg:col-span-7 duralux-card rounded-xl border p-4 sm:p-6 space-y-4 ${cardSurface}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-[#3454d1]/15 text-[#3454d1]">
                Agenda Financeira Futura
              </span>
              <h3 className="font-bold text-[15px] mt-1">
                O Que Tem Registrado Para Vir nos Próximos Meses
              </h3>
              <p className="text-xs text-slate-400">
                Selecione o mês para ver todas as parcelas de cartão, faturas acumuladas e contas fixas previstas
              </p>
            </div>

            {/* Seletor de Mês Futuro */}
            <div className="hidden sm:flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
              {upcomingMonths.map((um, idx) => (
                <button
                  key={um.month_key}
                  onClick={() => setSelectedUpcomingMonthIdx(idx)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    selectedUpcomingMonthIdx === idx
                      ? "bg-[#3454d1] text-white shadow-sm"
                      : darkMode
                      ? "bg-slate-800 text-slate-300 hover:bg-slate-700"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {um.month_label}
                </button>
              ))}
            </div>
          </div>

          {/* Cards de resumo dos próximos meses lado a lado */}
          <div className="flex sm:grid sm:grid-cols-3 gap-3 overflow-x-auto sm:overflow-x-visible snap-x snap-mandatory pb-1 -mx-1 px-1 sm:mx-0 sm:px-0 sm:max-h-[290px] sm:overflow-y-auto sm:pr-1">
            {upcomingMonths.map((um, idx) => (
              <div
                key={um.month_key}
                onClick={() => setSelectedUpcomingMonthIdx(idx)}
                className={`cursor-pointer rounded-xl border p-3.5 transition-all shrink-0 w-[78%] sm:w-auto snap-start ${
                  selectedUpcomingMonthIdx === idx
                    ? "border-[#3454d1] bg-[#3454d1]/5"
                    : subtleSurface
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-xs text-[#3454d1]">
                    {um.month_label}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#17c666]/15 text-[#17c666]">
                    Sobra R$ {formatBRL(um.projected_leftover)}
                  </span>
                </div>
                <div className="mt-2 space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Parcelas Cartão:</span>
                    <span className="font-bold text-[#ffa21d]">
                      R$ {formatBRL(um.installments_total)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Cartão Acumulado:</span>
                    <span className="font-bold">
                      R$ {formatBRL(um.card_accumulated_total)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Contas Fixas:</span>
                    <span className="font-bold">
                      R$ {formatBRL(um.recurring_bills_total)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-200/60 dark:border-slate-800 font-extrabold">
                    <span>Total no Mês:</span>
                    <span className="text-[#ea4d4d]">
                      R$ {formatBRL(um.total_committed)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Lista detalhada dos lançamentos registrados para o mês futuro selecionado */}
          {activeUpcomingMonth && (
            <div className="space-y-2.5 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs font-bold">
                <span>
                  Lançamentos & Parcelas Registrados para{" "}
                  <span className="text-[#3454d1]">
                    {activeUpcomingMonth.month_label}
                  </span>{" "}
                  ({activeUpcomingMonth.items.length} itens)
                </span>
                <span className="text-[#17c666]">
                  Previsão de Sobra do Salário em {activeUpcomingMonth.month_label}: R${" "}
                  {formatBRL(activeUpcomingMonth.projected_leftover)}
                </span>
              </div>

              <div className="space-y-2 sm:max-h-[300px] sm:overflow-y-auto sm:pr-1">
                {activeUpcomingMonth.items.length === 0 ? (
                  <div
                    className={`p-4 rounded-xl border text-xs text-slate-400 ${subtleSurface}`}
                  >
                    Nenhuma parcela de cartão extra cadastrada para{" "}
                    {activeUpcomingMonth.month_label}. Apenas as contas fixas mensais (R${" "}
                    {formatBRL(activeUpcomingMonth.recurring_bills_total)}) estão previstas, sobrando{" "}
                    <strong className="text-[#17c666]">
                      R$ {formatBRL(activeUpcomingMonth.projected_leftover)}
                    </strong>{" "}
                    do seu salário!
                  </div>
                ) : (
                  activeUpcomingMonth.items.map((item) =>
                    editingRecordId === item.id ? (
                      <div key={item.id} className={`rounded-xl border p-3 ${subtleSurface}`}>
                        <FinanceRecordEditor
                          record={item}
                          inputSurface={inputSurface}
                          onSave={(data) => saveRecordEdit(item.id, data)}
                          onCancel={() => setEditingRecordId(null)}
                        />
                      </div>
                    ) : (
                    <div
                      key={item.id}
                      className={`rounded-xl border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${subtleSurface}`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-xs break-words">{item.title}</span>
                          <span
                            className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded ${
                              item.category === "parcelado"
                                ? "bg-[#ffa21d]/20 text-[#ffa21d]"
                                : "bg-[#3454d1]/10 text-[#3454d1]"
                            }`}
                          >
                            {item.category}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 break-words">
                          {item.account_name} • Vencimento:{" "}
                          <strong>{item.due_date || "—"}</strong>
                          {item.notes ? ` • ${item.notes}` : ""}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-2.5 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/60 dark:border-slate-800 shrink-0">
                        <span className="text-xs font-extrabold text-[#ea4d4d] whitespace-nowrap">
                          R$ {formatBRL(item.amount)}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={async () => {
                              await api.updateFinanceRecord(item.id, {
                                status: item.status === "paid" ? "pending" : "paid",
                              });
                              await onRefresh();
                            }}
                            className="text-[11px] px-2.5 py-1 rounded-full font-bold bg-[#ffa21d]/15 text-[#ffa21d] hover:bg-[#17c666]/20 hover:text-[#17c666] transition-colors whitespace-nowrap"
                          >
                            {item.status === "paid" ? "Pago" : "Marcar Pago"}
                          </button>
                          <button
                            onClick={() => setEditingRecordId(item.id)}
                            className="text-slate-400 hover:text-[#3454d1] p-1"
                            title="Editar lançamento"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => deleteRecord(item)}
                            className="text-slate-400 hover:text-[#ea4d4d] p-1"
                            title="Remover lançamento futuro"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                    )
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* =====================================================================
          SEÇÃO 3: O QUE JÁ GASTEI ESSE MÊS (OUTUBRO/2026) — DETALHAMENTO COMPLETO
      ====================================================================== */}
      <div className={`duralux-card rounded-xl border p-4 sm:p-6 space-y-5 ${cardSurface}`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800 pb-4">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-[#ea4d4d]/15 text-[#ea4d4d]">
              Extrato Consolidado do Mês Atual
            </span>
            <h3 className="font-bold text-sm sm:text-[15px] mt-1">
              O Que Já Gastei Esse Mês ({cm.month_label}) — Total: R${" "}
              {formatBRL(cm.total_spent_this_month)}
            </h3>
            <p className="text-xs text-slate-400">
              Veja todas as faturas e contas pagas no mês ou inspecione os{" "}
              {cm.card_statement_items.length} gastos individuais das faturas enviadas
            </p>
          </div>

          <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-1.5 sm:gap-2 w-full lg:w-auto">
            <button
              onClick={() => setMonthSpendView("consolidated")}
              className={`w-full sm:w-auto px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                monthSpendView === "consolidated"
                  ? "bg-[#3454d1] text-white"
                  : darkMode
                  ? "bg-slate-800 text-slate-300"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              Gastos & Contas de {cm.month_label} ({cm.items.length})
            </button>
            <button
              onClick={() => setMonthSpendView("card_details")}
              className={`w-full sm:w-auto px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                monthSpendView === "card_details"
                  ? "bg-[#3454d1] text-white"
                  : darkMode
                  ? "bg-slate-800 text-slate-300"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              Compras da Fatura Cartão ({cm.card_statement_items.length} itens • R$ {formatBRL(cardStatementTotal)})
            </button>
            <button
              onClick={() => setMonthSpendView("all_records")}
              className={`w-full sm:w-auto px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                monthSpendView === "all_records"
                  ? "bg-[#3454d1] text-white"
                  : darkMode
                  ? "bg-slate-800 text-slate-300"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              Todos os Lançamentos ({finance.records.length})
            </button>
          </div>
        </div>

        {/* Formulário rápido para adicionar novo gasto ou receita no mês */}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!recTitle.trim() || !recAmount) return;
            await api.createFinanceRecord({
              title: recTitle.trim(),
              category: recCategory,
              record_type: recType,
              amount: parseFloat(recAmount),
              account_name: recAccount,
              due_date: recDueDate || undefined,
              status: recStatus,
            });
            setRecTitle("");
            setRecAmount("");
            await onRefresh();
          }}
          className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-8 gap-2.5 p-3.5 rounded-xl border ${subtleSurface}`}
        >
          <input
            type="text"
            placeholder="Novo gasto ou conta (ex: Mercado, Uber)"
            value={recTitle}
            onChange={(e) => setRecTitle(e.target.value)}
            className={`lg:col-span-2 rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
          />
          <input
            type="number"
            step="0.01"
            placeholder="Valor R$"
            value={recAmount}
            onChange={(e) => setRecAmount(e.target.value)}
            className={`rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
          />
          <select
            value={recCategory}
            onChange={(e) => setRecCategory(e.target.value)}
            className={`rounded-lg px-2.5 py-2 text-xs border ${inputSurface}`}
          >
            {RECORD_CATEGORIES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={recType}
            onChange={(e) => setRecType(e.target.value)}
            className={`rounded-lg px-2.5 py-2 text-xs border ${inputSurface}`}
          >
            <option value="expense">Gasto no Saldo / Pix</option>
            <option value="card_bill">Gasto no Cartão</option>
            <option value="income">Receita / Entrada</option>
          </select>
          <input
            type="date"
            value={recDueDate}
            onChange={(e) => setRecDueDate(e.target.value)}
            className={`rounded-lg px-2.5 py-2 text-xs border ${inputSurface}`}
          />
          <input
            list="finance-account-names"
            value={recAccount}
            onChange={(e) => setRecAccount(e.target.value)}
            placeholder="Conta / Cartão"
            className={`rounded-lg px-2.5 py-2 text-xs border ${inputSurface}`}
          />
          <datalist id="finance-account-names">
            {finance.accounts.map((a) => (
              <option key={a.id} value={a.name} />
            ))}
          </datalist>
          <button
            type="submit"
            className="bg-[#17c666] hover:brightness-95 text-white rounded-lg px-3 py-2.5 sm:py-2 text-xs font-bold flex items-center justify-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Registrar
          </button>
        </form>

        {monthSpendView === "card_details" ? (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-slate-400 px-1">
              <span>
                Mostrando todos os {cm.card_statement_items.length} consumos das faturas enviadas
              </span>
              <span className="font-extrabold text-[#ea4d4d] whitespace-nowrap">
                Soma: R$ {formatBRL(cardStatementTotal)}
              </span>
            </div>

            {/* Lista Mobile Compacta para Fatura do Cartão (< md) */}
            <div className="md:hidden space-y-2">
              {cm.card_statement_items.map((it) => (
                <div
                  key={it.id}
                  className={`rounded-xl border p-3 flex items-center justify-between gap-2.5 ${
                    it.is_installment
                      ? "border-[#ffa21d]/40 bg-[#ffa21d]/5"
                      : subtleSurface
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-bold text-xs break-words">{it.title}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className="text-[10px] font-bold text-slate-400">{it.date}</span>
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[#3454d1]/10 text-[#3454d1]">
                        {it.category}
                      </span>
                      {it.is_installment && (
                        <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-[#ffa21d]/20 text-[#ffa21d]">
                          Parcela {it.current_installment}/{it.total_installments}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs font-extrabold text-[#ea4d4d] whitespace-nowrap shrink-0">
                    R$ {formatBRL(it.amount)}
                  </span>
                </div>
              ))}
            </div>

            {/* Tabela Desktop (>= md) */}
            <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr
                    className={`border-b uppercase text-[11px] font-bold text-slate-400 ${
                      darkMode
                        ? "border-slate-800 bg-slate-900/40"
                        : "border-slate-100 bg-slate-50/70"
                    }`}
                  >
                    <th className="py-3 px-4">Data</th>
                    <th className="py-3 px-4">Estabelecimento na Fatura</th>
                    <th className="py-3 px-4">Categoria</th>
                    <th className="py-3 px-4">Parcelamento</th>
                    <th className="py-3 px-4 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {cm.card_statement_items.map((it) => (
                    <tr
                      key={it.id}
                      className={
                        it.is_installment
                          ? "bg-[#ffa21d]/5 hover:bg-[#ffa21d]/10"
                          : "hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
                      }
                    >
                      <td className="py-2.5 px-4 font-bold text-slate-400">
                        {it.date}
                      </td>
                      <td className="py-2.5 px-4 font-bold">{it.title}</td>
                      <td className="py-2.5 px-4">
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#3454d1]/10 text-[#3454d1]">
                          {it.category}
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        {it.is_installment ? (
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-[#ffa21d]/20 text-[#ffa21d]">
                            Parcela {it.current_installment} de{" "}
                            {it.total_installments} (Falta{" "}
                            {it.remaining_installments} p/ próx. mês)
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            À vista na fatura
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right font-extrabold text-[#ea4d4d] whitespace-nowrap">
                        R$ {formatBRL(it.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="space-y-2.5 sm:max-h-[460px] sm:overflow-y-auto">
            {(monthSpendView === "consolidated" ? cm.items : finance.records).map(
              (rec) =>
                editingRecordId === rec.id ? (
                  <div key={rec.id} className={`rounded-xl border p-3.5 ${subtleSurface}`}>
                    <FinanceRecordEditor
                      record={rec}
                      inputSurface={inputSurface}
                      onSave={(data) => saveRecordEdit(rec.id, data)}
                      onCancel={() => setEditingRecordId(null)}
                    />
                  </div>
                ) : (
                <div
                  key={rec.id}
                  className={`rounded-xl border p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${subtleSurface}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-xs sm:text-sm break-words">{rec.title}</span>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                          rec.category === "parcelado"
                            ? "bg-[#ffa21d]/20 text-[#ffa21d]"
                            : "bg-[#3454d1]/10 text-[#3454d1]"
                        }`}
                      >
                        {rec.category}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 break-words">
                      {rec.account_name}
                      {rec.due_date ? ` • Data/Venc: ${rec.due_date}` : ""}
                      {rec.notes ? ` • ${rec.notes}` : ""}
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200/60 dark:border-slate-800 shrink-0">
                    <span
                      className={`text-sm font-extrabold whitespace-nowrap ${
                        rec.record_type === "income"
                          ? "text-[#17c666]"
                          : "text-[#ea4d4d]"
                      }`}
                    >
                      {rec.record_type === "income" ? "+" : "-"} R${" "}
                      {formatBRL(rec.amount)}
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          await api.updateFinanceRecord(rec.id, {
                            status: rec.status === "paid" ? "pending" : "paid",
                          });
                          await onRefresh();
                        }}
                        className={`text-xs px-3 py-1 rounded-full font-bold whitespace-nowrap ${
                          rec.status === "paid"
                            ? "bg-[#17c666]/15 text-[#17c666]"
                            : "bg-[#ffa21d]/15 text-[#ffa21d]"
                        }`}
                      >
                        {rec.status === "paid" ? "Pago" : "Pendente"}
                      </button>

                      <button
                        onClick={() => setEditingRecordId(rec.id)}
                        className="text-slate-400 hover:text-[#3454d1] p-1"
                        title="Editar lançamento"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteRecord(rec)}
                        className="text-slate-400 hover:text-[#ea4d4d] p-1"
                        title="Excluir lançamento"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
};

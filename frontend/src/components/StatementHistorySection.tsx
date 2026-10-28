import React, { useState } from "react";
import {
  Brain,
  CheckCircle2,
  CreditCard,
  FileText,
  Filter,
  Layers,
  Plus,
  Search,
  Sparkles,
  Upload,
} from "lucide-react";
import { api } from "../api";
import type {
  ExtractedStatementExpense,
  StatementHistoryResponse,
} from "../types";

interface StatementHistorySectionProps {
  statementHistory: StatementHistoryResponse | null;
  darkMode: boolean;
  onRefresh: () => Promise<void>;
}

export const StatementHistorySection: React.FC<
  StatementHistorySectionProps
> = ({ statementHistory, darkMode, onRefresh }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSourceFilter, setSelectedSourceFilter] = useState<string>("all");
  const [selectedCategoryFilter, setSelectedCategoryFilter] =
    useState<string>("all");
  const [extractingAI, setExtractingAI] = useState(false);
  const [uploadingBill, setUploadingBill] = useState(false);
  const [quickPasteTitle, setQuickPasteTitle] = useState("");
  const [quickPasteText, setQuickPasteText] = useState("");
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const cardSurface = darkMode
    ? "bg-[#182235] border-slate-800 text-slate-100"
    : "bg-white border-slate-200/90 text-[#283c50]";
  const subtleSurface = darkMode
    ? "bg-slate-900/70 border-slate-800"
    : "bg-[#f8fafc] border-slate-200/80";
  const inputSurface = darkMode
    ? "bg-[#0f172a] border-slate-700 text-slate-100 placeholder-slate-500"
    : "bg-[#f8fafc] border-slate-200 text-[#283c50] placeholder-slate-400";

  const items = statementHistory?.extracted_items ?? [];
  const memoryStatements = statementHistory?.memory_statements ?? [];
  const categoryBreakdown = statementHistory?.category_breakdown ?? [];

  const filteredItems = items.filter((item) => {
    const matchesSearch =
      !searchTerm.trim() ||
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.source_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesSource =
      selectedSourceFilter === "all" || item.source_type === selectedSourceFilter;

    const matchesCat =
      selectedCategoryFilter === "all" ||
      item.category.toLowerCase() === selectedCategoryFilter.toLowerCase();

    return matchesSearch && matchesSource && matchesCat;
  });

  const topCategory = categoryBreakdown[0] || {
    category: "cartao",
    total: 0,
  };
  const totalAmount = statementHistory?.total_extracted_amount || 0;
  const topCatPct =
    totalAmount > 0 ? Math.min(100, Math.round((topCategory.total / totalAmount) * 100)) : 0;

  const handleUploadFaturaFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBill(true);
    setFeedbackMsg(null);
    try {
      await api.uploadDocument(file, "financas");
      await api.syncStatements();
      setFeedbackMsg(
        `✅ Fatura "${file.name}" indexada! Gastos do mês, compras parceladas e próximos meses foram registrados automaticamente.`
      );
      await onRefresh();
    } catch (err: any) {
      setFeedbackMsg(`❌ Erro ao enviar fatura: ${err.message || err}`);
    } finally {
      setUploadingBill(false);
      e.target.value = "";
    }
  };

  const handleSaveQuickPasteFatura = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickPasteTitle.trim() || !quickPasteText.trim()) return;
    await api.createMemory({
      category: "financas",
      key: quickPasteTitle.trim(),
      content: quickPasteText.trim(),
      importance: 5,
      pinned: true,
    });
    setQuickPasteTitle("");
    setQuickPasteText("");
    setShowPasteBox(false);
    setFeedbackMsg(
      "✅ Fatura salva na Memória Core e gastos anteriores mapeados!"
    );
    await onRefresh();
  };

  const handleExtractWithAI = async () => {
    setExtractingAI(true);
    setFeedbackMsg(null);
    try {
      const res = await api.extractExpensesFromMemory(true);
      setFeedbackMsg(
        `✨ Análise concluída: ${res.extracted_count} gastos identificados nas faturas da memória (${res.imported_count} novos sincronizados com a tabela de lançamentos).`
      );
      await onRefresh();
    } catch (err: any) {
      setFeedbackMsg(`❌ Falha na extração: ${err.message || err}`);
    } finally {
      setExtractingAI(false);
    }
  };

  const handleImportSingleItem = async (item: ExtractedStatementExpense) => {
    await api.createFinanceRecord({
      title: item.title,
      category: item.category,
      record_type: "card_bill",
      amount: item.amount,
      account_name: item.source_name,
      due_date: item.date.includes("/") ? undefined : item.date,
      status: "paid",
      notes: `Importado da memória: ${item.source_name}`,
    });
    setFeedbackMsg(
      `✅ Gasto "${item.title}" (R$ ${item.amount.toFixed(2)}) importado para os lançamentos!`
    );
    await onRefresh();
  };

  return (
    <div className="space-y-6">
      {/* 4 KPI CARDS ESTILO DURALUX PARA AS FATURAS NA MEMÓRIA */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
        <div className={`duralux-card rounded-xl border p-5 ${cardSurface}`}>
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-full bg-[#3454d1]/10 text-[#3454d1] flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xl font-extrabold">
                {statementHistory?.total_sources_in_memory ?? 0} Faturas
              </div>
              <div className="text-xs font-semibold text-slate-400">
                Fontes de Fatura na Memória (RAG + Core)
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-dashed border-slate-200 dark:border-slate-800">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">Indexação Vetorial</span>
              <span className="font-bold text-[#3454d1]">100%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-[#3454d1] rounded-full w-full" />
            </div>
          </div>
        </div>

        <div className={`duralux-card rounded-xl border p-5 ${cardSurface}`}>
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-full bg-[#ea4d4d]/15 text-[#ea4d4d] flex items-center justify-center shrink-0">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xl font-extrabold text-[#ea4d4d]">
                R${" "}
                {totalAmount.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                })}
              </div>
              <div className="text-xs font-semibold text-slate-400">
                Total de Gastos Anteriores Mapeados
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-dashed border-slate-200 dark:border-slate-800">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">Gastos Extraídos</span>
              <span className="font-bold text-[#ea4d4d]">
                {statementHistory?.total_extracted_items ?? 0} itens
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#ea4d4d] rounded-full"
                style={{ width: "76%" }}
              />
            </div>
          </div>
        </div>

        <div className={`duralux-card rounded-xl border p-5 ${cardSurface}`}>
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-full bg-[#ffa21d]/15 text-[#ffa21d] flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xl font-extrabold capitalize">
                {topCategory.category}
              </div>
              <div className="text-xs font-semibold text-slate-400">
                Maior Categoria nas Faturas (R$ {topCategory.total.toFixed(2)})
              </div>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-dashed border-slate-200 dark:border-slate-800">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-slate-400">Peso no Histórico</span>
              <span className="font-bold text-[#ffa21d]">{topCatPct}%</span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#ffa21d] rounded-full"
                style={{ width: `${topCatPct}%` }}
              />
            </div>
          </div>
        </div>

        <div className={`duralux-card rounded-xl border p-5 ${cardSurface}`}>
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-full bg-[#17c666]/15 text-[#17c666] flex items-center justify-center shrink-0">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold">Extração Inteligente</div>
              <div className="text-xs text-slate-400">
                Sincronize PDFs e fatos da memória com Gemini
              </div>
            </div>
          </div>
          <div className="mt-4 pt-2 flex gap-2">
            <button
              onClick={handleExtractWithAI}
              disabled={extractingAI}
              className="flex-1 py-2 px-3 rounded-lg bg-[#3454d1] hover:bg-[#2945b8] disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {extractingAI ? "Extraindo..." : "Sincronizar c/ IA"}
            </button>
          </div>
        </div>
      </div>

      {feedbackMsg && (
        <div className="rounded-xl border border-[#3454d1]/30 bg-[#3454d1]/10 px-4 py-3 text-xs font-semibold text-[#3454d1] flex items-center justify-between">
          <span>{feedbackMsg}</span>
          <button
            onClick={() => setFeedbackMsg(null)}
            className="text-xs underline ml-4"
          >
            Fechar
          </button>
        </div>
      )}

      {/* BARRA DE AÇÕES: UPLOAD DE FATURA PDF/TXT OU COLAR FATURA NA MEMÓRIA */}
      <div
        className={`duralux-card rounded-xl border p-5 flex flex-col gap-4 ${cardSurface}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-[15px]">
              Adicionar Fatura Anterior à Memória do Agente
            </h3>
            <p className="text-xs text-slate-400">
              Envie o PDF/TXT/CSV da fatura do cartão ou cole os lançamentos da fatura para o sistema extrair os gastos automaticamente
            </p>
          </div>

          <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setShowPasteBox(!showPasteBox)}
              className={`w-full sm:w-auto justify-center px-3.5 py-2.5 sm:py-2 rounded-lg border text-xs font-bold flex items-center gap-1.5 ${
                darkMode
                  ? "border-slate-700 bg-slate-800 text-slate-200"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
              }`}
            >
              <Plus className="w-3.5 h-3.5 text-[#3454d1] shrink-0" />
              Colar Texto de Fatura na Memória
            </button>

            <label className="w-full sm:w-auto justify-center cursor-pointer bg-[#17c666] hover:brightness-95 text-white px-4 py-2.5 sm:py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm">
              <Upload className="w-3.5 h-3.5 shrink-0" />
              {uploadingBill
                ? "Indexando Fatura..."
                : "Enviar PDF / CSV de Fatura"}
              <input
                type="file"
                accept=".pdf,.txt,.csv,.md"
                onChange={handleUploadFaturaFile}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Caixa rápida para colar fatura em texto na Memória Core */}
        {showPasteBox && (
          <form
            onSubmit={handleSaveQuickPasteFatura}
            className={`p-4 rounded-xl border space-y-3 ${subtleSurface}`}
          >
            <div className="text-xs font-bold text-[#3454d1]">
              📋 Colar Itens de Fatura Anterior na Memória Core
            </div>
            <input
              type="text"
              placeholder="Título da Fatura (ex: Fatura Cartão Nubank Agosto/2026)"
              value={quickPasteTitle}
              onChange={(e) => setQuickPasteTitle(e.target.value)}
              className={`w-full rounded-lg px-3 py-2 text-xs border ${inputSurface}`}
            />
            <textarea
              rows={4}
              placeholder={
                "Cole aqui as linhas da sua fatura (uma por linha), por exemplo:\n05/08 Supermercado Extra R$ 320,50\n10/08 Uber *Trip R$ 28,90\n14/08 iFood Restaurante R$ 74,00"
              }
              value={quickPasteText}
              onChange={(e) => setQuickPasteText(e.target.value)}
              className={`w-full rounded-lg p-3 text-xs border font-mono ${inputSurface}`}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPasteBox(false)}
                className="px-3 py-1.5 rounded-lg border text-xs font-semibold"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded-lg bg-[#3454d1] text-white text-xs font-bold"
              >
                Salvar Fatura na Memória & Extrair Gastos
              </button>
            </div>
          </form>
        )}
      </div>

      {/* GRID PRINCIPAL: 4 COLUNAS (FONTES NA MEMÓRIA & CATEGORIAS) + 8 COLUNAS (TABELA DE GASTOS ANTERIORES) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Coluna Esquerda (4 cols): Faturas Armazenadas na Memória & Breakdown por Categoria */}
        <div className="lg:col-span-4 space-y-6">
          {/* Card 1: Gastos por Categoria nas Faturas */}
          <div className={`duralux-card rounded-xl border p-5 space-y-4 ${cardSurface}`}>
            <div>
              <h4 className="font-bold text-sm">
                Gastos por Categoria nas Faturas
              </h4>
              <p className="text-xs text-slate-400">
                Consolidado de todas as faturas na memória
              </p>
            </div>

            <div className="space-y-3">
              {categoryBreakdown.map((cat) => {
                const pct =
                  totalAmount > 0
                    ? Math.max(4, Math.round((cat.total / totalAmount) * 100))
                    : 0;
                return (
                  <div key={cat.category} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold capitalize">
                        {cat.category}
                      </span>
                      <span className="font-semibold text-slate-400">
                        R$ {cat.total.toFixed(2)} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#3454d1] rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card 2: Lista de Faturas Encontradas na Memória (RAG / Core Memory) */}
          <div className={`duralux-card rounded-xl border p-5 space-y-4 ${cardSurface}`}>
            <div>
              <h4 className="font-bold text-sm">
                Faturas Salvas na Sua Memória ({memoryStatements.length})
              </h4>
              <p className="text-xs text-slate-400">
                Arquivos RAG e fatos financeiros lidos pelo sistema
              </p>
            </div>

            <div className="space-y-3 max-h-[380px] overflow-y-auto">
              {memoryStatements.map((stmt) => (
                <div
                  key={`${stmt.source_type}_${stmt.source_id}`}
                  className={`rounded-xl border p-3.5 space-y-2 ${subtleSurface}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                          stmt.source_type === "rag_document"
                            ? "bg-[#17c666]/15 text-[#17c666]"
                            : "bg-[#3454d1]/15 text-[#3454d1]"
                        }`}
                      >
                        {stmt.source_type === "rag_document"
                          ? "Arquivo RAG"
                          : "Memória Core"}
                      </span>
                      <div className="font-bold text-xs mt-1.5">
                        {stmt.title}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-extrabold text-[#ea4d4d]">
                        R$ {stmt.total_amount.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {stmt.items_count} gastos extraídos
                      </div>
                    </div>
                  </div>

                  <pre className="text-[11px] text-slate-400 bg-slate-950/5 dark:bg-slate-950/50 p-2.5 rounded-lg whitespace-pre-wrap font-mono max-h-28 overflow-y-auto">
                    {stmt.preview_text}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Coluna Direita (8 cols): Tabela Duralux de Todos os Gastos Anteriores das Faturas */}
        <div className={`lg:col-span-8 duralux-card rounded-xl border flex flex-col ${cardSurface}`}>
          <div
            className={`p-5 border-b flex flex-wrap items-center justify-between gap-3 ${
              darkMode ? "border-slate-800" : "border-slate-100"
            }`}
          >
            <div>
              <h3 className="font-bold text-[15px]">
                Detalhamento de Gastos Anteriores (Extraídos das Faturas)
              </h3>
              <p className="text-xs text-slate-400">
                Mostrando {filteredItems.length} compras/gastos identificados na sua memória
              </p>
            </div>

            {/* Filtros */}
            <div className="grid grid-cols-1 sm:flex sm:flex-wrap items-center gap-2 w-full lg:w-auto">
              <div
                className={`flex items-center gap-1.5 px-2.5 py-2 sm:py-1.5 rounded-lg border text-xs w-full sm:w-auto ${inputSurface}`}
              >
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Filtrar estabelecimento..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-transparent focus:outline-none w-full sm:w-36 text-xs"
                />
              </div>

              <select
                value={selectedSourceFilter}
                onChange={(e) => setSelectedSourceFilter(e.target.value)}
                className={`w-full sm:w-auto rounded-lg px-2.5 py-2 sm:py-1.5 text-xs font-semibold border ${inputSurface}`}
              >
                <option value="all">Todas as Fontes</option>
                <option value="rag_document">Arquivos RAG (PDF/TXT)</option>
                <option value="core_memory">Memória Core</option>
                <option value="finance_record">Histórico de Cartão</option>
              </select>

              <select
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                className={`w-full sm:w-auto rounded-lg px-2.5 py-2 sm:py-1.5 text-xs font-semibold border ${inputSurface}`}
              >
                <option value="all">Todas Categorias</option>
                {categoryBreakdown.map((c) => (
                  <option key={c.category} value={c.category}>
                    {c.category}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Lista Mobile Compacta de Gastos Anteriores (< md) */}
          <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {filteredItems.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Nenhum gasto anterior encontrado para este filtro.
              </div>
            ) : (
              filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="p-3.5 flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-bold text-xs break-words">{item.title}</div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        <span className="text-[10px] font-semibold text-slate-400">
                          {item.date}
                        </span>
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-[#3454d1]/10 text-[#3454d1]">
                          {item.category}
                        </span>
                        {item.is_installment && (
                          <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-[#ffa21d]/20 text-[#ffa21d]">
                            Parcela {item.current_installment}/{item.total_installments}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="font-extrabold text-xs text-[#ea4d4d] whitespace-nowrap shrink-0">
                      R$ {item.amount.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 text-[11px]">
                    <span className="text-slate-400 truncate">{item.source_name}</span>
                    {item.source_type !== "finance_record" ? (
                      <button
                        onClick={() => handleImportSingleItem(item)}
                        className="px-2.5 py-1 rounded-lg bg-[#3454d1]/10 text-[#3454d1] font-bold shrink-0"
                      >
                        + Lançar
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-bold text-[#17c666] shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Registrado
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Tabela Desktop (>= md) */}
          <div className="hidden md:block overflow-x-auto flex-1">
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
                  <th className="py-3 px-4">Estabelecimento / Gasto</th>
                  <th className="py-3 px-4">Categoria</th>
                  <th className="py-3 px-4">Fatura de Origem (Memória)</th>
                  <th className="py-3 px-4">Valor</th>
                  <th className="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="py-10 text-center text-slate-400"
                    >
                      Nenhum gasto anterior encontrado para este filtro. Envie um PDF/TXT de fatura ou cole os itens acima!
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30"
                    >
                      <td className="py-3 px-4 font-semibold text-slate-400 whitespace-nowrap">
                        {item.date}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-[13px]">
                            {item.title}
                          </span>
                          {item.is_installment && (
                            <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-[#ffa21d]/20 text-[#ffa21d]">
                              Parcela {item.current_installment}/
                              {item.total_installments}
                            </span>
                          )}
                        </div>
                        {item.raw_line && item.raw_line !== item.title && (
                          <div className="text-[10px] text-slate-400 truncate max-w-xs">
                            {item.raw_line}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-[#3454d1]/10 text-[#3454d1]">
                          {item.category}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                            item.source_type === "rag_document"
                              ? "text-[#17c666]"
                              : item.source_type === "core_memory"
                              ? "text-[#3454d1]"
                              : "text-slate-400"
                          }`}
                        >
                          {item.source_name}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-extrabold text-[#ea4d4d] whitespace-nowrap">
                        R$ {item.amount.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {item.source_type !== "finance_record" ? (
                          <button
                            onClick={() => handleImportSingleItem(item)}
                            className="px-2.5 py-1 rounded-lg bg-[#3454d1]/10 hover:bg-[#3454d1] text-[#3454d1] hover:text-white text-[11px] font-bold transition-colors"
                          >
                            + Lançar
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#17c666]">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Registrado
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

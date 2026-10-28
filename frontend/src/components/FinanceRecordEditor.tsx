import React, { useState } from "react";
import type { FinanceRecord } from "../types";

export const RECORD_CATEGORIES: Array<[string, string]> = [
  ["alimentacao", "Alimentação"],
  ["cartao", "Cartão / Fatura"],
  ["parcelado", "Compra Parcelada"],
  ["financiamento", "Financiamento"],
  ["faculdade", "Faculdade"],
  ["moradia", "Moradia / Luz / Internet"],
  ["transporte", "Transporte / Posto"],
  ["assinaturas & lazer", "Assinaturas & Lazer"],
  ["pessoal", "Pessoal / Pix"],
  ["salario", "Salário / Receita"],
  ["outros", "Outros"],
];

export const RECORD_TYPES: Array<[string, string]> = [
  ["expense", "Gasto no Saldo / Pix"],
  ["card_bill", "Gasto no Cartão"],
  ["income", "Receita / Entrada"],
];

interface Props {
  record: FinanceRecord;
  inputSurface: string;
  onSave: (data: Partial<FinanceRecord>) => Promise<void>;
  onCancel: () => void;
}

/** Formulário inline para editar qualquer lançamento financeiro. */
export const FinanceRecordEditor: React.FC<Props> = ({ record, inputSurface, onSave, onCancel }) => {
  const [title, setTitle] = useState(record.title);
  const [amount, setAmount] = useState(String(record.amount));
  const [category, setCategory] = useState(record.category);
  const [recordType, setRecordType] = useState(record.record_type);
  const [account, setAccount] = useState(record.account_name);
  const [dueDate, setDueDate] = useState(record.due_date ?? "");
  const [status, setStatus] = useState(record.status);
  const [saving, setSaving] = useState(false);

  const field = `rounded-lg px-2.5 py-2 text-xs border ${inputSurface}`;
  const categories = RECORD_CATEGORIES.some(([v]) => v === category)
    ? RECORD_CATEGORIES
    : [[category, category] as [string, string], ...RECORD_CATEGORIES];

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const amt = parseFloat(amount.replace(",", "."));
        if (!title.trim() || !amt) return;
        setSaving(true);
        try {
          await onSave({
            title: title.trim(),
            amount: amt,
            category,
            record_type: recordType,
            account_name: account,
            due_date: dueDate || null,
            status,
          });
        } finally {
          setSaving(false);
        }
      }}
      className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2"
    >
      <input className={`${field} lg:col-span-2`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Descrição" required />
      <input className={field} type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Valor R$" required />
      <input className={field} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      <select className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
        {categories.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      <select className={field} value={recordType} onChange={(e) => setRecordType(e.target.value)}>
        {RECORD_TYPES.map(([v, l]) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
      <input className={field} value={account} onChange={(e) => setAccount(e.target.value)} placeholder="Conta / Cartão" />
      <select className={field} value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="paid">Pago</option>
        <option value="pending">Pendente</option>
      </select>
      <div className="flex gap-2 sm:col-span-2 lg:col-span-4 justify-end">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-slate-200">
          Cancelar
        </button>
        <button type="submit" disabled={saving} className="px-4 py-1.5 rounded-lg bg-[#17c666] text-white text-xs font-bold disabled:opacity-50">
          {saving ? "Salvando..." : "Salvar"}
        </button>
      </div>
    </form>
  );
};

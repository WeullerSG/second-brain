import React, { useState } from "react";
import { Plus, X } from "lucide-react";
import { formatReminderOffset } from "../reminders";

const UNITS: Array<[string, number]> = [
  ["minutos", 1],
  ["horas", 60],
  ["dias", 1440],
];

const PRESETS = [0, 15, 60, 1440];

interface Props {
  value: number[];
  onChange: (offsets: number[]) => void;
  inputSurface: string;
}

/** Lista de avisos do agendamento: adicione quantos quiser, com qualquer antecedência. */
export const ReminderPicker: React.FC<Props> = ({ value, onChange, inputSurface }) => {
  const [amount, setAmount] = useState("30");
  const [unit, setUnit] = useState(1);

  const add = (minutes: number) => {
    if (minutes < 0 || Number.isNaN(minutes) || value.includes(minutes)) return;
    onChange([...value, minutes].sort((a, b) => b - a));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.length === 0 && (
          <span className="text-[11px] text-slate-400">Nenhum aviso. Adicione pelo menos um.</span>
        )}
        {value.map((m) => (
          <span
            key={m}
            className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full bg-[#3454d1]/15 text-[#3454d1]"
          >
            {formatReminderOffset(m)}
            <button
              type="button"
              onClick={() => onChange(value.filter((x) => x !== m))}
              title="Remover aviso"
              className="hover:text-[#ea4d4d]"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <input
          type="number"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={`w-16 rounded-lg px-2.5 py-2 border ${inputSurface}`}
        />
        <select
          value={unit}
          onChange={(e) => setUnit(Number(e.target.value))}
          className={`flex-1 min-w-[110px] rounded-lg px-2.5 py-2 border ${inputSurface}`}
        >
          {UNITS.map(([label, mult]) => (
            <option key={label} value={mult}>
              {label} antes
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => add(Math.round(parseFloat(amount || "0") * unit))}
          className="px-3 py-2 rounded-lg bg-[#3454d1]/10 hover:bg-[#3454d1] text-[#3454d1] hover:text-white font-bold flex items-center gap-1 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" /> Aviso
        </button>
      </div>

      <div className="flex flex-wrap gap-1">
        {PRESETS.filter((p) => !value.includes(p)).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => add(p)}
            className="text-[10px] px-2 py-0.5 rounded-full border border-slate-300 dark:border-slate-700 text-slate-400 hover:border-[#3454d1] hover:text-[#3454d1]"
          >
            + {formatReminderOffset(p)}
          </button>
        ))}
      </div>
    </div>
  );
};

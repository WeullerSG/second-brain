import React from "react";

/** Formata **negrito**, *itálico* e `código` dentro de uma linha. */
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}_${i++}`;
    if (token.startsWith("**")) {
      parts.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      parts.push(
        <code key={key} className="px-1 py-0.5 rounded bg-slate-500/15 text-[0.9em] font-mono">
          {token.slice(1, -1)}
        </code>
      );
    } else {
      parts.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** Markdown simples para as respostas do agente (títulos, listas, negrito, código). */
export const Markdown: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((item, idx) => (
      <li key={idx}>{renderInline(item, `li${blocks.length}_${idx}`)}</li>
    ));
    blocks.push(
      list.ordered ? (
        <ol key={`l${blocks.length}`} className="list-decimal pl-5 space-y-0.5">{items}</ol>
      ) : (
        <ul key={`l${blocks.length}`} className="list-disc pl-5 space-y-0.5">{items}</ul>
      )
    );
    list = null;
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((bullet || numbered)![1]);
      return;
    }
    flushList();
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      blocks.push(
        <div key={idx} className="font-extrabold mt-1">
          {renderInline(heading[2], `h${idx}`)}
        </div>
      );
    } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push(<hr key={idx} className="my-1 border-slate-500/20" />);
    } else if (line.trim() === "") {
      blocks.push(<div key={idx} className="h-1.5" />);
    } else {
      blocks.push(<p key={idx}>{renderInline(line, `p${idx}`)}</p>);
    }
  });
  flushList();

  return <div className="space-y-1 whitespace-normal">{blocks}</div>;
};

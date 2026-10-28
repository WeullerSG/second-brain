import json
from sqlalchemy.orm import Session
from app.models import AcademicTask, FinanceRecord, FineTuneExample, MemoryFact


def generate_finetune_jsonl(db: Session, include_synthetic_from_memory: bool = True) -> str:
    """
    Gera o arquivo JSONL no formato oficial de Supervised Fine-Tuning (SFT) do Google Gemini:
    {"systemInstruction": {...}, "contents": [{"role": "user", "parts": [...]}, {"role": "model", "parts": [...]}]}
    """
    lines: list[str] = []

    curated = db.query(FineTuneExample).filter(FineTuneExample.approved.is_(True)).all()
    for ex in curated:
        payload = {
            "systemInstruction": {
                "role": "system",
                "parts": [{"text": ex.system_instruction}],
            },
            "contents": [
                {"role": "user", "parts": [{"text": ex.user_input}]},
                {"role": "model", "parts": [{"text": ex.ideal_output}]},
            ],
        }
        lines.append(json.dumps(payload, ensure_ascii=False))

    if include_synthetic_from_memory:
        default_sys = (
            "Você é o Second Brain AI, assistente pessoal financeiro e acadêmico do Weuller. "
            "Responda de forma objetiva, estruturada e fiel aos fatos da vida dele."
        )
        facts = db.query(MemoryFact).all()
        for f in facts:
            payload = {
                "systemInstruction": {"role": "system", "parts": [{"text": default_sys}]},
                "contents": [
                    {
                        "role": "user",
                        "parts": [{"text": f"O que você sabe na sua memória sobre '{f.key}' ({f.category})?"}],
                    },
                    {
                        "role": "model",
                        "parts": [
                            {
                                "text": (
                                    f"De acordo com a sua memória registrada em **{f.category}** "
                                    f"(importância {f.importance}/5) sobre **{f.key}**:\n\n{f.content}"
                                )
                            }
                        ],
                    },
                ],
            }
            lines.append(json.dumps(payload, ensure_ascii=False))

        tasks = db.query(AcademicTask).limit(20).all()
        if tasks:
            summary_tasks = "\n".join(
                f"- **{t.subject}**: {t.title} ({t.task_type}) — Prazo: {t.due_date or 'Sem data'} | Status: {t.status}"
                for t in tasks
            )
            payload = {
                "systemInstruction": {"role": "system", "parts": [{"text": default_sys}]},
                "contents": [
                    {"role": "user", "parts": [{"text": "Quais são minhas atividades da faculdade cadastradas?"}]},
                    {
                        "role": "model",
                        "parts": [{"text": f"Aqui estão suas atividades da faculdade:\n\n{summary_tasks}"}],
                    },
                ],
            }
            lines.append(json.dumps(payload, ensure_ascii=False))

        records = db.query(FinanceRecord).limit(20).all()
        if records:
            summary_fin = "\n".join(
                f"- **{r.title}** ({r.account_name}): R$ {r.amount:.2f} [{r.status}]"
                for r in records
            )
            payload = {
                "systemInstruction": {"role": "system", "parts": [{"text": default_sys}]},
                "contents": [
                    {"role": "user", "parts": [{"text": "Me dê um resumo dos meus lançamentos financeiros registrados."}]},
                    {
                        "role": "model",
                        "parts": [{"text": f"Aqui está o resumo dos seus lançamentos:\n\n{summary_fin}"}],
                    },
                ],
            }
            lines.append(json.dumps(payload, ensure_ascii=False))

    return "\n".join(lines)

import json
import re
import time
from datetime import datetime
from typing import Any, Optional
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    AcademicTask,
    FinanceAccount,
    FinanceRecord,
    FineTuneExample,
    MemoryFact,
    ScheduleNotification,
    UsageLog,
)
from app.schemas import ChatResponse, ToolCallTrace
from app.services.embeddings import (
    generate_embedding,
    get_genai_client,
    hybrid_search_chunks,
)

# Ordem de fallback quando um modelo estiver sobrecarregado (504/timeout)
MODEL_FALLBACK_CHAIN = ["gemini-3.5-flash-lite", "gemini-3.1-flash-lite"]

# Declaração das Tools para o Gemini Interactions API
AGENT_TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "name": "save_memory_fact",
        "description": (
            "Salva ou atualiza um fato importante na Memória Core do usuário "
            "(ex: preferências, metas, regras financeiras, horários de aula, fatos pessoais)."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "category": {
                    "type": "string",
                    "description": "Categoria: financas, faculdade, pessoal, preferencia, meta",
                },
                "key": {
                    "type": "string",
                    "description": "Identificador curto ou título do fato (ex: 'Dia do Salário', 'Curso da Faculdade')",
                },
                "content": {
                    "type": "string",
                    "description": "Descrição clara e completa do fato a ser lembrado",
                },
                "importance": {
                    "type": "integer",
                    "description": "Importância de 1 (baixa) a 5 (crítica)",
                },
            },
            "required": ["category", "key", "content"],
        },
    },
    {
        "type": "function",
        "name": "delete_memory_fact",
        "description": "Remove um fato da Memória Core pelo ID quando o usuário pedir para esquecer ou apagar.",
        "parameters": {
            "type": "object",
            "properties": {
                "fact_id": {"type": "integer", "description": "ID numérico do fato na memória"}
            },
            "required": ["fact_id"],
        },
    },
    {
        "type": "function",
        "name": "upsert_bank_account",
        "description": (
            "Cadastra ou atualiza o saldo de uma conta bancária ou limite/vencimento de um cartão de crédito "
            "(ex: Nubank, Itaú, Inter, Bradesco)."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Nome do banco ou cartão (ex: 'Nubank', 'Itaú')"},
                "account_type": {
                    "type": "string",
                    "description": "Tipo: checking (conta corrente), credit_card (cartão), investment (investimento)",
                },
                "balance": {"type": "number", "description": "Saldo atual em reais (R$)"},
                "credit_limit": {"type": "number", "description": "Limite do cartão de crédito em reais (R$)"},
                "closing_day": {"type": "integer", "description": "Dia de fechamento da fatura (1-31)"},
                "due_day": {"type": "integer", "description": "Dia de vencimento da fatura (1-31)"},
            },
            "required": ["name", "balance"],
        },
    },
    {
        "type": "function",
        "name": "add_finance_record",
        "description": (
            "Registra uma conta de cartão, despesa, fatura ou receita financeira do dia a dia."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Descrição do gasto/receita (ex: 'Fatura Nubank', 'Supermercado')"},
                "category": {
                    "type": "string",
                    "description": "Categoria: cartao, alimentacao, moradia, transporte, faculdade, lazer, salario, outros",
                },
                "record_type": {
                    "type": "string",
                    "description": "Tipo: expense (despesa), income (receita), card_bill (fatura/compra no cartão)",
                },
                "amount": {"type": "number", "description": "Valor em R$ (ex: 125.90)"},
                "account_name": {"type": "string", "description": "Conta ou cartão associado (ex: 'Nubank', 'Itaú')"},
                "due_date": {"type": "string", "description": "Data ou vencimento no formato YYYY-MM-DD"},
                "status": {"type": "string", "description": "Status: pending (pendente) ou paid (pago/recebido)"},
                "notes": {"type": "string", "description": "Observações extras"},
            },
            "required": ["title", "amount"],
        },
    },
    {
        "type": "function",
        "name": "update_finance_status",
        "description": "Atualiza o status de uma conta/lançamento financeiro para 'paid' (pago) ou 'pending' (pendente).",
        "parameters": {
            "type": "object",
            "properties": {
                "record_id": {"type": "integer", "description": "ID do lançamento financeiro"},
                "status": {"type": "string", "description": "'paid' ou 'pending'"},
            },
            "required": ["record_id", "status"],
        },
    },
    {
        "type": "function",
        "name": "add_installment_purchase",
        "description": (
            "Registra uma compra parcelada no cartão de crédito ou um financiamento (carro, imóvel, "
            "empréstimo) e cria automaticamente as parcelas para os próximos meses. Sem limite de parcelas."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Nome da compra/estabelecimento (ex: 'Amazon BR', 'Monitor LG')"},
                "installment_amount": {"type": "number", "description": "Valor de cada parcela em R$"},
                "current_installment": {"type": "integer", "description": "Número da parcela atual (ex: 1)"},
                "total_installments": {"type": "integer", "description": "Total de parcelas (ex: 6)"},
                "account_name": {"type": "string", "description": "Nome do cartão ou do banco/financeira (ex: 'Cartão Mercado Pago Visa', 'Banco do Brasil')"},
                "kind": {
                    "type": "string",
                    "enum": ["parcelado", "financiamento"],
                    "description": "'parcelado' para compra no cartão; 'financiamento' para financiamento/empréstimo",
                },
                "first_due_date": {"type": "string", "description": "Data de vencimento no formato YYYY-MM-DD"},
            },
            "required": ["title", "installment_amount", "total_installments"],
        },
    },
    {
        "type": "function",
        "name": "add_academic_task",
        "description": (
            "Adiciona uma atividade da faculdade (prova, trabalho, projeto, lista de exercícios ou leitura)."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "subject": {"type": "string", "description": "Nome da disciplina/matéria da faculdade"},
                "title": {"type": "string", "description": "Título da atividade ou prova"},
                "task_type": {
                    "type": "string",
                    "description": "Tipo: exam (prova), assignment (trabalho/lista), project (projeto), reading (leitura)",
                },
                "due_date": {"type": "string", "description": "Data de entrega/prova (YYYY-MM-DD)"},
                "priority": {"type": "string", "description": "Prioridade: low, medium, high, critical"},
                "grade_weight": {"type": "number", "description": "Valor ou peso na nota (ex: 10.0)"},
                "notes": {"type": "string", "description": "Conteúdo da prova ou detalhes do trabalho"},
            },
            "required": ["subject", "title"],
        },
    },
    {
        "type": "function",
        "name": "update_academic_task",
        "description": "Atualiza status ('todo', 'in_progress', 'done') ou nota obtida de uma atividade da faculdade.",
        "parameters": {
            "type": "object",
            "properties": {
                "task_id": {"type": "integer", "description": "ID da atividade da faculdade"},
                "status": {"type": "string", "description": "Novo status: todo, in_progress ou done"},
                "grade_obtained": {"type": "number", "description": "Nota obtida na atividade/prova"},
            },
            "required": ["task_id"],
        },
    },
    {
        "type": "function",
        "name": "search_documents_rag",
        "description": (
            "Pesquisa nos documentos e arquivos enviados pelo usuário (faturas em PDF, apostilas/ementas da faculdade, "
            "anotações e comprovantes) usando busca semântica e híbrida (RAG)."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Pergunta ou termos para buscar nos arquivos do RAG"},
                "category": {
                    "type": "string",
                    "description": "Filtro opcional de categoria (financas, faculdade, pessoal, geral)",
                },
            },
            "required": ["query"],
        },
    },
    {
        "type": "function",
        "name": "upsert_schedule_notification",
        "description": (
            "Configura ou atualiza uma notificação/lembrete na Agenda do usuário. "
            "Use para: (1) grade de aulas de segunda a sexta (ex: 'recurring_weekly' com days_of_week='mon', 'tue', etc.), "
            "(2) entrevistas de emprego ou compromissos em dia e hora específicos ('one_time' com target_date='YYYY-MM-DD'), "
            "ou (3) lembretes diários ('daily')."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "title": {
                    "type": "string",
                    "description": "Título do alerta (ex: 'Aula: Inteligência Artificial', 'Entrevista Estágio Dev')",
                },
                "message": {
                    "type": "string",
                    "description": "Mensagem de lembrete que aparecerá na notificação",
                },
                "category": {
                    "type": "string",
                    "description": "Categoria: aula, entrevista, financas, faculdade, pessoal",
                },
                "schedule_type": {
                    "type": "string",
                    "description": "Tipo: 'recurring_weekly' (dias da semana), 'one_time' (data única YYYY-MM-DD) ou 'daily' (todo dia)",
                },
                "days_of_week": {
                    "type": "string",
                    "description": "Dias da semana separados por vírgula em inglês curto: mon,tue,wed,thu,fri,sat,sun (ex: 'mon' para segunda, 'mon,wed' para seg/qua)",
                },
                "target_date": {
                    "type": "string",
                    "description": "Data específica no formato YYYY-MM-DD (obrigatório quando schedule_type='one_time', ex: entrevista)",
                },
                "notify_time": {
                    "type": "string",
                    "description": "Horário do evento/notificação no formato HH:MM (24h, ex: '08:00', '14:30', '19:00')",
                },
                "remind_minutes_before": {
                    "type": "integer",
                    "description": "Minutos de antecedência para disparar o lembrete (ex: 15, 30, 60 ou 0 para na hora exata)",
                },
                "location_or_link": {
                    "type": "string",
                    "description": "Sala de aula, endereço ou link da chamada (Google Meet/Teams/Zoom)",
                },
            },
            "required": ["title", "message", "schedule_type", "notify_time"],
        },
    },
    {
        "type": "function",
        "name": "delete_schedule_notification",
        "description": "Remove um lembrete/notificação da agenda pelo ID.",
        "parameters": {
            "type": "object",
            "properties": {
                "notification_id": {"type": "integer", "description": "ID numérico do agendamento"}
            },
            "required": ["notification_id"],
        },
    },
]


def build_system_instruction(db: Session) -> str:
    """
    Constrói o System Prompt dinâmico com:
    1. Core Memory (Fatos importantes sobre o usuário)
    2. Resumo em tempo real das Contas/Cartões e Lançamentos Pendentes
    3. Resumo das Atividades da Faculdade Pendentes
    """
    memories = (
        db.query(MemoryFact)
        .order_by(MemoryFact.pinned.desc(), MemoryFact.importance.desc(), MemoryFact.updated_at.desc())
        .limit(25)
        .all()
    )
    accounts = db.query(FinanceAccount).all()
    recent_finances = (
        db.query(FinanceRecord)
        .order_by(FinanceRecord.created_at.desc())
        .limit(15)
        .all()
    )
    tasks = (
        db.query(AcademicTask)
        .filter(AcademicTask.status != "done")
        .order_by(AcademicTask.due_date.asc())
        .limit(15)
        .all()
    )
    schedules = (
        db.query(ScheduleNotification)
        .filter(ScheduleNotification.enabled.is_(True))
        .order_by(ScheduleNotification.notify_time.asc())
        .limit(25)
        .all()
    )

    mem_lines = (
        "\n".join(
            f"- [ID:{m.id} | {m.category} | Imp:{m.importance}] {m.key}: {m.content}"
            for m in memories
        )
        or "Nenhum fato salvo ainda."
    )

    acc_lines = (
        "\n".join(
            f"- {a.name} ({a.account_type}): Saldo R$ {a.balance:.2f}"
            + (f" | Limite Cartão R$ {a.credit_limit:.2f} (Venc. dia {a.due_day})" if a.credit_limit else "")
            for a in accounts
        )
        or "Nenhuma conta/cartão cadastrado ainda."
    )

    fin_lines = (
        "\n".join(
            f"- [ID:{r.id}] {r.title} ({r.record_type}/{r.category}) - R$ {r.amount:.2f} "
            f"| Conta: {r.account_name} | Venc: {r.due_date or 'N/A'} | Status: {r.status}"
            for r in recent_finances
        )
        or "Nenhum lançamento financeiro recente."
    )

    task_lines = (
        "\n".join(
            f"- [ID:{t.id}] [{t.subject}] {t.title} ({t.task_type}) | Prazo: {t.due_date or 'Sem data'} "
            f"| Prioridade: {t.priority} | Status: {t.status}"
            for t in tasks
        )
        or "Nenhuma atividade pendente da faculdade."
    )

    sched_lines = (
        "\n".join(
            f"- [ID:{s.id} | {s.category} | {s.schedule_type}] {s.title} às {s.notify_time} "
            f"(Avisar {s.remind_minutes_before}min antes) | Dias: {s.days_of_week or s.target_date or 'Diário'} | Msg: {s.message}"
            for s in schedules
        )
        or "Nenhuma notificação/aula agendada ainda."
    )

    return f"""Você é o **Second Brain AI**, o agente pessoal inteligente do Weuller.
Sua missão é ajudá-lo a gerenciar a vida no dia a dia com precisão absoluta: finanças pessoais (saldos, contas de cartão, gastos), atividades da faculdade (provas, trabalhos, prazos), agenda/notificações (grade de aulas de segunda a sexta, entrevistas, lembretes) e memória pessoal/documentos (RAG).

### REGRAS DE COMPORTAMENTO DO AGENTE:
1. Sempre que o usuário informar um novo gasto, conta de cartão, salário ou saldo de conta, chame imediatamente a ferramenta correspondente (`add_finance_record` ou `upsert_bank_account`).
2. Sempre que o usuário mencionar uma prova, trabalho, entrega ou aula da faculdade, registre com `add_academic_task` ou atualize com `update_academic_task`.
3. Sempre que o usuário pedir para configurar notificações, agenda de aulas da semana (segunda a sexta) ou lembretes de entrevista/compromisso com dia e hora, chame `upsert_schedule_notification` (você pode chamá-la múltiplas vezes se ele passar várias matérias da semana!).
4. Sempre que o usuário revelar uma preferência permanente, regra pessoal, meta ou informação recorrente da rotina dele, salve na Memória Core com `save_memory_fact`.
5. Quando o usuário perguntar sobre algum documento enviado (PDF, fatura, ementa, anotação), use `search_documents_rag`.
6. Responda sempre em Português do Brasil, de forma clara, organizada em Markdown, confirmando os valores/datas/notificações registrados.

=== MEMÓRIA CORE ATUAL (FATOS SOBRE O USUÁRIO) ===
{mem_lines}

=== CONTAS BANCÁRIAS E CARTÕES ===
{acc_lines}

=== ÚLTIMOS LANÇAMENTOS FINANCEIROS ===
{fin_lines}

=== ATIVIDADES PENDENTES DA FACULDADE ===
{task_lines}

=== AGENDA DE AULAS, ENTREVISTAS E NOTIFICAÇÕES ATIVAS ===
{sched_lines}
"""


def execute_tool_call(
    db: Session,
    name: str,
    args: dict[str, Any],
    rag_sources_collector: list[dict[str, Any]],
) -> tuple[dict[str, Any], str]:
    """Executa uma Tool solicitada pelo Gemini e retorna (resultado_dict, resumo_curto)."""
    if name == "save_memory_fact":
        key = args.get("key", "Fato")
        category = args.get("category", "geral")
        content = args.get("content", "")
        importance = int(args.get("importance", 3))

        existing = db.query(MemoryFact).filter(MemoryFact.key == key).first()
        emb = generate_embedding(f"[{category}] {key}: {content}", db=db, operation="memory_embedding")
        if existing:
            existing.category = category
            existing.content = content
            existing.importance = importance
            existing.embedding = emb
            existing.source = "agent_auto"
            db.commit()
            db.refresh(existing)
            return (
                {"status": "updated", "fact_id": existing.id, "key": key},
                f"Memória atualizada: '{key}'",
            )
        else:
            fact = MemoryFact(
                category=category,
                key=key,
                content=content,
                importance=importance,
                source="agent_auto",
                pinned=True,
                embedding=emb,
            )
            db.add(fact)
            db.commit()
            db.refresh(fact)
            return (
                {"status": "created", "fact_id": fact.id, "key": key},
                f"Nova memória salva: '{key}'",
            )

    if name == "delete_memory_fact":
        fact_id = int(args.get("fact_id", 0))
        fact = db.query(MemoryFact).filter(MemoryFact.id == fact_id).first()
        if not fact:
            return {"status": "not_found", "fact_id": fact_id}, f"Memória #{fact_id} não encontrada"
        key = fact.key
        db.delete(fact)
        db.commit()
        return {"status": "deleted", "fact_id": fact_id, "key": key}, f"Memória removida: '{key}'"

    if name == "upsert_bank_account":
        acc_name = args.get("name", "Principal")
        balance = float(args.get("balance", 0.0))
        acc_type = args.get("account_type", "checking")
        credit_limit = float(args.get("credit_limit", 0.0))
        closing_day = args.get("closing_day")
        due_day = args.get("due_day")

        acc = db.query(FinanceAccount).filter(FinanceAccount.name == acc_name).first()
        if acc:
            acc.balance = balance
            acc.account_type = acc_type
            if credit_limit:
                acc.credit_limit = credit_limit
            if closing_day:
                acc.closing_day = int(closing_day)
            if due_day:
                acc.due_day = int(due_day)
        else:
            acc = FinanceAccount(
                name=acc_name,
                account_type=acc_type,
                balance=balance,
                credit_limit=credit_limit,
                closing_day=int(closing_day) if closing_day else None,
                due_day=int(due_day) if due_day else None,
            )
            db.add(acc)
        db.commit()
        db.refresh(acc)
        return (
            {"status": "ok", "account_id": acc.id, "name": acc.name, "balance": acc.balance},
            f"Saldo da conta '{acc.name}' atualizado para R$ {acc.balance:.2f}",
        )

    if name == "add_finance_record":
        rec = FinanceRecord(
            title=args.get("title", "Lançamento"),
            category=args.get("category", "outros"),
            record_type=args.get("record_type", "expense"),
            amount=float(args.get("amount", 0.0)),
            account_name=args.get("account_name", "Principal"),
            due_date=args.get("due_date"),
            status=args.get("status", "pending"),
            notes=args.get("notes"),
        )
        db.add(rec)
        db.commit()
        db.refresh(rec)
        return (
            {
                "status": "created",
                "record_id": rec.id,
                "title": rec.title,
                "amount": rec.amount,
                "record_type": rec.record_type,
            },
            f"Registrado: {rec.title} (R$ {rec.amount:.2f})",
        )

    if name == "update_finance_status":
        rec_id = int(args.get("record_id", 0))
        new_status = args.get("status", "paid")
        rec = db.query(FinanceRecord).filter(FinanceRecord.id == rec_id).first()
        if not rec:
            return {"status": "not_found", "record_id": rec_id}, f"Lançamento #{rec_id} não encontrado"
        rec.status = new_status
        db.commit()
        return (
            {"status": "updated", "record_id": rec.id, "new_status": rec.status},
            f"Lançamento '{rec.title}' marcado como {rec.status}",
        )

    if name == "add_installment_purchase":
        from app.routers.finances import create_installment_purchase
        from app.schemas import InstallmentCreate

        payload = InstallmentCreate(
            title=args.get("title", "Compra Parcelada"),
            installment_amount=float(args.get("installment_amount", 0.0)),
            current_installment=int(args.get("current_installment", 1)),
            total_installments=int(args.get("total_installments", 2)),
            account_name=args.get("account_name", "Cartão Mercado Pago Visa"),
            category="financiamento" if args.get("kind") == "financiamento" else "parcelado",
            first_due_date=args.get("first_due_date"),
            current_month_paid=False,
        )
        res = create_installment_purchase(payload=payload, db=db)
        return (
            res,
            f"{'Financiamento' if res['category'] == 'financiamento' else 'Parcelamento'} registrado: {res['title']} ({res['total_installments']}x de R$ {res['installment_amount']:.2f})",
        )

    if name == "add_academic_task":
        task = AcademicTask(
            subject=args.get("subject", "Geral"),
            title=args.get("title", "Atividade"),
            task_type=args.get("task_type", "assignment"),
            due_date=args.get("due_date"),
            status="todo",
            priority=args.get("priority", "medium"),
            grade_weight=float(args["grade_weight"]) if args.get("grade_weight") is not None else None,
            notes=args.get("notes"),
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        return (
            {
                "status": "created",
                "task_id": task.id,
                "subject": task.subject,
                "title": task.title,
                "due_date": task.due_date,
            },
            f"Atividade acadêmica criada: [{task.subject}] {task.title}",
        )

    if name == "update_academic_task":
        task_id = int(args.get("task_id", 0))
        task = db.query(AcademicTask).filter(AcademicTask.id == task_id).first()
        if not task:
            return {"status": "not_found", "task_id": task_id}, f"Atividade #{task_id} não encontrada"
        if args.get("status"):
            task.status = args["status"]
        if args.get("grade_obtained") is not None:
            task.grade_obtained = float(args["grade_obtained"])
        db.commit()
        return (
            {"status": "updated", "task_id": task.id, "new_status": task.status, "grade": task.grade_obtained},
            f"Atividade '{task.title}' atualizada ({task.status})",
        )

    if name == "search_documents_rag":
        query = args.get("query", "")
        category = args.get("category")
        hits = hybrid_search_chunks(db, query=query, top_k=5, category=category)
        rag_sources_collector.extend(hits)
        return (
            {"query": query, "results_count": len(hits), "chunks": hits},
            f"Busca RAG para '{query}' retornou {len(hits)} trechos",
        )

    if name == "upsert_schedule_notification":
        title = args.get("title", "Lembrete")
        message = args.get("message", title)
        category = args.get("category", "aula")
        schedule_type = args.get("schedule_type", "recurring_weekly")
        days_of_week = args.get("days_of_week")
        target_date = args.get("target_date")
        notify_time = args.get("notify_time", "08:00")
        remind_before = int(args.get("remind_minutes_before", 15))
        location_or_link = args.get("location_or_link")

        existing = (
            db.query(ScheduleNotification)
            .filter(ScheduleNotification.title == title)
            .first()
        )
        if existing:
            existing.message = message
            existing.category = category
            existing.schedule_type = schedule_type
            existing.days_of_week = days_of_week
            existing.target_date = target_date
            existing.notify_time = notify_time
            existing.remind_minutes_before = remind_before
            existing.location_or_link = location_or_link
            existing.enabled = True
            db.commit()
            db.refresh(existing)
            return (
                {"status": "updated", "notification_id": existing.id, "title": existing.title},
                f"Notificação atualizada: {existing.title} ({notify_time})",
            )
        else:
            sched = ScheduleNotification(
                title=title,
                message=message,
                category=category,
                schedule_type=schedule_type,
                days_of_week=days_of_week,
                target_date=target_date,
                notify_time=notify_time,
                remind_minutes_before=remind_before,
                location_or_link=location_or_link,
                enabled=True,
            )
            db.add(sched)
            db.commit()
            db.refresh(sched)
            return (
                {"status": "created", "notification_id": sched.id, "title": sched.title},
                f"Notificação agendada: {sched.title} às {notify_time}",
            )

    if name == "delete_schedule_notification":
        nid = int(args.get("notification_id", 0))
        sched = db.query(ScheduleNotification).filter(ScheduleNotification.id == nid).first()
        if not sched:
            return {"status": "not_found", "notification_id": nid}, f"Agendamento #{nid} não encontrado"
        t = sched.title
        db.delete(sched)
        db.commit()
        return {"status": "deleted", "notification_id": nid, "title": t}, f"Notificação removida: {t}"

    return {"error": f"Tool '{name}' desconhecida"}, f"Tool desconhecida: {name}"


def _extract_brl_value(text: str) -> Optional[float]:
    m = re.search(r"(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|\d+(?:\.\d{1,2}))", text)
    if not m:
        return None
    raw = m.group(1)
    if "," in raw and "." in raw:
        raw = raw.replace(".", "").replace(",", ".")
    elif "," in raw:
        raw = raw.replace(",", ".")
    try:
        return round(float(raw), 2)
    except ValueError:
        return None


def _run_local_smart_agent_fallback(
    db: Session,
    user_message: str,
    rag_sources: list[dict[str, Any]],
    tools_trace: list[ToolCallTrace],
    error_reason: Optional[str] = None,
) -> str:
    """
    Executor Agêntico Local Inteligente:
    Garante que comandos em linguagem natural (registrar gastos, atualizar saldo,
    agendar aulas de seg-sex / entrevistas, criar tarefas da faculdade, salvar memórias
    ou pedir resumo do dia) executem as Tools reais no banco mesmo quando a chave
    da API Gemini estiver offline, expirada ou com limite excedido.
    """
    msg = user_message.strip()
    msg_lower = msg.lower()
    val = _extract_brl_value(msg)

    # 1. Atualizar saldo de conta bancária
    if any(k in msg_lower for k in ("atualize o saldo", "saldo da minha conta", "meu saldo no", "saldo do", "saldo no")) and val is not None:
        bank_name = "Itaú Conta Corrente" if "ita" in msg_lower else ("Nubank (Conta + Cartão)" if "nu" in msg_lower else "Conta Principal")
        args = {"name": bank_name, "balance": val, "account_type": "checking"}
        _, summary = execute_tool_call(db, "upsert_bank_account", args, rag_sources)
        tools_trace.append(ToolCallTrace(name="upsert_bank_account", arguments=args, result_summary=summary))
        return (
            f"✅ **Saldo Atualizado com Sucesso!**\n\n"
            f"- **Conta**: {bank_name}\n"
            f"- **Novo Saldo**: R$ {val:.2f}\n\n"
            f"O valor já foi atualizado no seu painel de **Finanças & Cartões**."
        )

    # 2. Registrar gasto / compra no cartão / despesa
    if any(k in msg_lower for k in ("gastei", "paguei", "comprei", "fatura", "cartão", "cartao", "despesa", "conta de")) and val is not None:
        account_name = "Nubank (Conta + Cartão)" if "nu" in msg_lower else ("Itaú Conta Corrente" if "ita" in msg_lower else "Cartão Principal")
        category = "alimentacao" if any(x in msg_lower for x in ("ifood", "mercado", "restaurante", "lanche", "padaria")) else (
            "transporte" if any(x in msg_lower for x in ("uber", "99", "gasolina", "posto")) else (
                "saude" if any(x in msg_lower for x in ("farmacia", "farmácia", "drogaria")) else "cartao"
            )
        )
        # Extrai título amigável
        title = "Compra no Cartão"
        m_no = re.search(r"(?:no|na|em|de)\s+([A-Za-zÀ-ÿ0-9\s]{2,30}?)(?:\s+pelo|\s+no\s+cart|\s+hoje|\s+ontem|$)", msg, re.IGNORECASE)
        if m_no:
            title = m_no.group(1).strip().title()
        args = {
            "title": title,
            "category": category,
            "record_type": "card_bill",
            "amount": val,
            "account_name": account_name,
            "due_date": datetime.now().strftime("%Y-%m-%d"),
            "status": "pending",
        }
        _, summary = execute_tool_call(db, "add_finance_record", args, rag_sources)
        tools_trace.append(ToolCallTrace(name="add_finance_record", arguments=args, result_summary=summary))
        return (
            f"💳 **Gasto Registrado com Sucesso!**\n\n"
            f"- **Descrição**: {title}\n"
            f"- **Valor**: R$ {val:.2f}\n"
            f"- **Categoria**: `{category}`\n"
            f"- **Conta / Cartão**: {account_name}"
        )

    # 3. Agendar Aulas (segunda a sexta) ou Entrevistas / Lembretes de Notificação
    if any(k in msg_lower for k in ("tenho aula", "entrevista", "me avise", "me lembre", "notificação", "notificacao", "notifica")):
        time_match = re.search(r"(\d{1,2})[:h](\d{2})?", msg_lower)
        notify_time = f"{int(time_match.group(1)):02d}:{int(time_match.group(2) or 0):02d}" if time_match else "19:00"

        remind_match = re.search(r"(\d+)\s*min", msg_lower)
        remind_before = int(remind_match.group(1)) if remind_match else 30

        day_map = {
            "segunda": "mon", "seg": "mon",
            "terça": "tue", "terca": "tue", "ter": "tue",
            "quarta": "wed", "qua": "wed",
            "quinta": "thu", "qui": "thu",
            "sexta": "fri", "sex": "fri",
            "sábado": "sat", "sabado": "sat", "sab": "sat",
        }
        found_days = []
        if "segunda a sexta" in msg_lower or "seg a sex" in msg_lower:
            found_days = ["mon", "tue", "wed", "thu", "fri"]
        else:
            for pt_day, code in day_map.items():
                if re.search(rf"\b{pt_day}\b", msg_lower) and code not in found_days:
                    found_days.append(code)

        is_interview = "entrevista" in msg_lower
        category = "entrevista" if is_interview else "aula"
        schedule_type = "one_time" if is_interview and not found_days else ("recurring_weekly" if found_days else "daily")

        date_match = re.search(r"(\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}(?:/\d{2,4})?)", msg)
        target_date = None
        if date_match:
            raw_d = date_match.group(1)
            if "/" in raw_d:
                parts = raw_d.split("/")
                year = parts[2] if len(parts) == 3 else str(datetime.now().year)
                if len(year) == 2:
                    year = "20" + year
                target_date = f"{year}-{int(parts[1]):02d}-{int(parts[0]):02d}"
            else:
                target_date = raw_d
        elif is_interview:
            target_date = datetime.now().strftime("%Y-%m-%d")

        title = "Entrevista Agendada" if is_interview else "Aula da Faculdade"
        subj_match = re.search(r"(?:aula.*?de|entrevista.*?de|entrevista)\s+([A-Za-zÀ-ÿ0-9\s\&]{3,40}?)(?:\s+às|\s+as|\s+dia|\s+na\s+sala|\s*,|$)", msg, re.IGNORECASE)
        if subj_match:
            title = ("Entrevista: " if is_interview else "Aula: ") + subj_match.group(1).strip().title()

        args = {
            "title": title,
            "message": f"Lembrete: {title} às {notify_time}. ({msg})",
            "category": category,
            "schedule_type": schedule_type,
            "days_of_week": ",".join(found_days) if found_days else ("mon,tue,wed,thu,fri" if schedule_type == "recurring_weekly" else None),
            "target_date": target_date,
            "notify_time": notify_time,
            "remind_minutes_before": remind_before,
        }
        _, summary = execute_tool_call(db, "upsert_schedule_notification", args, rag_sources)
        tools_trace.append(ToolCallTrace(name="upsert_schedule_notification", arguments=args, result_summary=summary))
        return (
            f"🔔 **Notificação Configurada na Agenda!**\n\n"
            f"- **Título**: {title}\n"
            f"- **Horário**: {notify_time} (alerta {remind_before} min antes)\n"
            f"- **Recorrência / Data**: {args['days_of_week'] or target_date or 'Diário'}\n\n"
            f"Você pode visualizar ou testar o disparo na aba **Agenda & Notificações**."
        )

    # 4. Adicionar prova / trabalho da faculdade
    if any(k in msg_lower for k in ("tenho prova", "prova de", "trabalho de", "projeto de", "entrega de")):
        subj = "Faculdade"
        m_subj = re.search(r"(?:prova|trabalho|projeto|entrega)\s+de\s+([A-Za-zÀ-ÿ0-9\s]{2,35}?)(?:\s+dia|\s+valendo|\s+para|$)", msg, re.IGNORECASE)
        if m_subj:
            subj = m_subj.group(1).strip().title()
        task_type = "exam" if "prova" in msg_lower else "assignment"
        args = {
            "subject": subj,
            "title": f"{'Prova' if task_type == 'exam' else 'Trabalho'} de {subj}",
            "task_type": task_type,
            "due_date": "2026-11-20",
            "priority": "high",
            "grade_weight": val or 10.0,
            "notes": msg,
        }
        _, summary = execute_tool_call(db, "add_academic_task", args, rag_sources)
        tools_trace.append(ToolCallTrace(name="add_academic_task", arguments=args, result_summary=summary))
        return (
            f"🎓 **Atividade da Faculdade Cadastrada!**\n\n"
            f"- **Disciplina**: {subj}\n"
            f"- **Atividade**: {args['title']}\n"
            f"- **Prioridade**: Alta"
        )

    # 5. Salvar fato na Memória Core
    if any(k in msg_lower for k in ("salve na memória", "salve na memoria", "lembre que", "guarde na memória", "guarde que")):
        content_clean = re.sub(r"^.*?(?:salve na mem[óo]ria que|lembre que|guarde que)\s*", "", msg, flags=re.IGNORECASE).strip() or msg
        args = {
            "category": "financas" if any(w in msg_lower for w in ("fatura", "cartão", "conta", "salário")) else "pessoal",
            "key": content_clean[:42].strip().title(),
            "content": content_clean,
            "importance": 4,
        }
        _, summary = execute_tool_call(db, "save_memory_fact", args, rag_sources)
        tools_trace.append(ToolCallTrace(name="save_memory_fact", arguments=args, result_summary=summary))
        return (
            f"🧠 **Fato Salvo na Memória Core!**\n\n"
            f"- **Chave**: {args['key']}\n"
            f"- **Conteúdo**: {content_clean}"
        )

    # 5.5 Perguntas diretas sobre salário / renda
    if any(k in msg_lower for k in ("salário", "salario", "renda", "quanto recebo", "quanto ganho")) and val is None:
        from app.routers.finances import get_finance_summary as _gfs

        _fs = _gfs(db)
        _sf = _fs["salary_forecast"]
        _facts = [
            m
            for m in db.query(MemoryFact).all()
            if any(w in f"{m.key} {m.content}".lower() for w in ("salário", "salario", "renda", "recebo"))
        ]
        _facts_str = "\n".join(f"- 🧠 **{m.key}**: {m.content}" for m in _facts)
        return (
            f"### 💰 Seu Salário\n\n"
            f"- **Salário mensal base**: **R$ {_sf['monthly_salary']:.2f}**\n"
            f"- **Sobra prevista para {_sf['next_month_label']}** (após parcelas, cartões e contas fixas): "
            f"**R$ {_sf['projected_salary_leftover']:.2f}**\n"
            + (f"\n{_facts_str}\n" if _facts_str else "")
            + (
                f"\n---\n> 💡 *Respondi com seus dados locais porque a API do Gemini não respondeu a tempo "
                f"(`{(error_reason or '')[:80]}`).*"
                if error_reason
                else ""
            )
        )

    # 6. Resumo geral (Contas, Parcelados, Previsão do Salário, Faculdade, Agenda e Memória)
    from app.routers.finances import get_finance_summary

    fin_summary = get_finance_summary(db)
    sf = fin_summary["salary_forecast"]
    cm = fin_summary["current_month_summary"]
    inst_sum = fin_summary["installments_summary"]
    tasks = db.query(AcademicTask).filter(AcademicTask.status != "done").all()
    schedules = db.query(ScheduleNotification).filter(ScheduleNotification.enabled.is_(True)).all()

    acc_str = (
        "\n".join(
            f"  - **{a.name}**: "
            + (
                f"Saldo Atual **R$ {a.balance:.2f}**"
                if a.account_type != "credit_card"
                else f"Em aberto p/ próx. fatura **R$ {a.balance:.2f}** | Limite R$ {a.credit_limit:.2f} (Venc. dia {a.due_day})"
            )
            for a in fin_summary["accounts"]
        )
        or "  - Nenhuma conta cadastrada."
    )
    inst_str = (
        "\n".join(
            f"  - **{i['title']}** ({i['account_name']}): **R$ {i['installment_amount']:.2f}/mês** "
            f"(Faltam {i['remaining_installments']} de {i['total_installments']} parcelas • Próx. venc: `{i['next_due_date']}`)"
            for i in inst_sum["items"]
        )
        or "  - Nenhuma compra parcelada ativa."
    )
    task_str = "\n".join(f"  - **[{t.subject}]** {t.title} — Prazo: {t.due_date or 'Sem data'} ({t.priority})" for t in tasks) or "  - Nenhuma atividade pendente."
    sched_str = "\n".join(f"  - **{s.title}** às `{s.notify_time}` ({s.days_of_week or s.target_date or 'Diário'})" for s in schedules[:5]) or "  - Nenhum alerta ativo."

    note = ""
    if error_reason:
        note = (
            f"\n\n---\n> 💡 *Nota: A API remota do Gemini retornou `{error_reason[:110]}`. "
            f"O **Agente Local Inteligente** processou sua solicitação diretamente com os dados reais das suas faturas e extratos!*"
        )

    return (
        f"### 📊 Resumo Financeiro, Parcelados & Previsão do Salário\n\n"
        f"#### 💰 Meu Saldo Atual & Cartões\n"
        f"- **Saldo Atual em Conta Corrente**: **R$ {sf['current_checking_balance']:.2f}**\n"
        f"- **Limite Disponível nos Cartões**: **R$ {sf['total_credit_available']:.2f}** (de R$ {sf['total_credit_limit']:.2f})\n"
        f"{acc_str}\n\n"
        f"#### 🧾 O Que Já Gastei Esse Mês ({cm['month_label']})\n"
        f"- **Total Pago no Mês**: **R$ {cm['total_spent_this_month']:.2f}** "
        f"(Faturas pagas: R$ {cm['card_bills_paid_this_month']:.2f} + Contas/Pix: R$ {cm['direct_expenses_this_month']:.2f})\n"
        f"- **Novos Gastos no Cartão p/ Próxima Fatura**: **R$ {cm['new_card_spend_next_bill']:.2f}**\n\n"
        f"#### 📦 Compras Parceladas Registradas\n"
        f"{inst_str}\n\n"
        f"#### 📈 Previsão de Quanto Vai Sobrar do Salário ({sf['next_month_label']})\n"
        f"- **Salário Mensal Base**: **R$ {sf['monthly_salary']:.2f}**\n"
        f"- **(-) Parcelas & Cartão Acumulado p/ {sf['next_month_label']}**: **- R$ {sf['next_month_cards_and_installments']:.2f}**\n"
        f"- **(-) Contas Fixas Previstas (Faculdade + Luz + Assinaturas)**: **- R$ {sf['next_month_fixed_bills']:.2f}**\n"
        f"- **(=) Sobra Prevista (após parcelas + cartões + contas fixas)**: **R$ {sf['projected_salary_leftover']:.2f}** "
        f"*(ou **R$ {sf['projected_leftover_after_cards_only']:.2f}** descontando apenas os cartões já lançados)*\n\n"
        f"#### 🎓 Faculdade ({len(tasks)} pendentes) & 🔔 Agenda ({len(schedules)} alertas)\n"
        f"{task_str}\n"
        f"{sched_str}"
        f"{note}"
    )


def run_agent_interaction(
    db: Session,
    user_message: str,
    previous_interaction_id: Optional[str] = None,
    model_override: Optional[str] = None,
    save_for_finetune: bool = False,
) -> ChatResponse:
    """
    Executa um turno completo com o Agente Gemini via Interactions API (`client.interactions.create`),
    resolvendo chamadas de ferramentas (`function_call` -> `function_result`) em loop e gravando telemetria.
    Possui tratamento completo de erros, retry automático sem `previous_interaction_id` em turnos seguintes
    e fallback agêntico local para nunca travar a conversa.
    """
    start_ts = time.perf_counter()
    model_name = model_override or settings.GEMINI_AGENT_MODEL

    # Busca preventiva no RAG caso existam documentos relacionados à pergunta
    auto_rag_hits = hybrid_search_chunks(db, query=user_message, top_k=3)
    rag_sources: list[dict[str, Any]] = [h for h in auto_rag_hits if h["score"] >= 0.35]

    system_instruction = build_system_instruction(db)
    if rag_sources:
        rag_context_text = "\n\n".join(
            f"[Fonte: {h['filename']} | Trecho #{h['chunk_index'] + 1} | Score: {h['score']}]\n{h['content']}"
            for h in rag_sources
        )
        system_instruction += f"\n\n=== TRECHOS RELEVANTES DOS ARQUIVOS ENVIADOS (RAG AUTOMÁTICO) ===\n{rag_context_text}\n"

    tools_trace: list[ToolCallTrace] = []
    client = get_genai_client()

    if client is None:
        reply_text = _run_local_smart_agent_fallback(
            db=db,
            user_message=user_message,
            rag_sources=rag_sources,
            tools_trace=tools_trace,
            error_reason="GEMINI_API_KEY não configurada",
        )
        latency_ms = int((time.perf_counter() - start_ts) * 1000)
        return ChatResponse(
            interaction_id=None,
            reply=reply_text,
            model=f"{model_name} (Local Smart Agent)",
            tools_called=tools_trace,
            rag_sources=rag_sources,
            tokens_used=max(1, len(reply_text) // 4),
            latency_ms=latency_ms,
        )

    total_tokens = 0
    input_tokens = 0
    output_tokens = 0
    interaction = None

    try:
        create_kwargs: dict[str, Any] = {
            "model": model_name,
            "input": user_message,
            "system_instruction": system_instruction,
            "tools": AGENT_TOOLS,
        }
        if previous_interaction_id:
            create_kwargs["previous_interaction_id"] = previous_interaction_id

        # Tenta o modelo escolhido e, se der timeout/504/sobrecarga, cai automaticamente para os próximos.
        candidate_models = [model_name] + [m for m in MODEL_FALLBACK_CHAIN if m != model_name]
        last_err: Optional[Exception] = None
        for candidate in candidate_models:
            create_kwargs["model"] = candidate
            attempt_kwargs = dict(create_kwargs)
            try:
                try:
                    interaction = client.interactions.create(**attempt_kwargs)
                except Exception:
                    if not previous_interaction_id:
                        raise
                    # Sessão anterior pode não ser aceita: tenta sem previous_interaction_id
                    attempt_kwargs.pop("previous_interaction_id", None)
                    interaction = client.interactions.create(**attempt_kwargs)
                model_name = candidate
                last_err = None
                break
            except Exception as err:
                print(f"[Gemini] modelo '{candidate}' falhou: {str(err)[:140]}")
                last_err = err
        if interaction is None and last_err is not None:
            raise last_err

        # Contabiliza tokens do primeiro turno
        if getattr(interaction, "usage", None):
            total_tokens += getattr(interaction.usage, "total_tokens", 0) or 0
            input_tokens += getattr(interaction.usage, "input_tokens", 0) or 0
            output_tokens += getattr(interaction.usage, "output_tokens", 0) or 0

        # Loop para resolver tool calls (até 4 rodadas encadeadas)
        for _ in range(4):
            function_calls = [
                step
                for step in (getattr(interaction, "steps", None) or [])
                if getattr(step, "type", None) == "function_call"
            ]
            if not function_calls:
                break

            function_results_input = []
            for fc_step in function_calls:
                fn_name = fc_step.name
                fn_args = dict(fc_step.arguments) if fc_step.arguments else {}
                result_dict, summary_str = execute_tool_call(db, fn_name, fn_args, rag_sources)

                tools_trace.append(
                    ToolCallTrace(
                        name=fn_name,
                        arguments=fn_args,
                        result_summary=summary_str,
                    )
                )
                function_results_input.append(
                    {
                        "type": "function_result",
                        "call_id": fc_step.id,
                        "name": fn_name,
                        "result": [{"type": "text", "text": json.dumps(result_dict, ensure_ascii=False)}],
                    }
                )

            try:
                updated_sys_instruction = build_system_instruction(db)
                interaction = client.interactions.create(
                    model=model_name,
                    previous_interaction_id=interaction.id,
                    system_instruction=updated_sys_instruction,
                    tools=AGENT_TOOLS,
                    input=function_results_input,
                )
                if getattr(interaction, "usage", None):
                    total_tokens += getattr(interaction.usage, "total_tokens", 0) or 0
                    input_tokens += getattr(interaction.usage, "input_tokens", 0) or 0
                    output_tokens += getattr(interaction.usage, "output_tokens", 0) or 0
            except Exception as follow_err:
                print(f"[Agent Tool Follow-up Warning] {follow_err}")
                break

        reply_text = getattr(interaction, "output_text", None) or ""
        if not reply_text.strip():
            if tools_trace:
                bullets = "\n".join(f"- ✅ **{t.name}**: {t.result_summary}" for t in tools_trace)
                reply_text = f"Pronto! Executei as seguintes ações para você:\n\n{bullets}"
            else:
                reply_text = "Operação concluída com sucesso."
        interaction_id_out = getattr(interaction, "id", None)

    except Exception as api_err:
        print(f"[Gemini API Fallback] {api_err}")
        reply_text = _run_local_smart_agent_fallback(
            db=db,
            user_message=user_message,
            rag_sources=rag_sources,
            tools_trace=tools_trace,
            error_reason=str(api_err),
        )
        interaction_id_out = None

    latency_ms = int((time.perf_counter() - start_ts) * 1000)

    if total_tokens == 0:
        input_tokens = max(1, (len(system_instruction) + len(user_message)) // 4)
        output_tokens = max(1, len(reply_text) // 4)
        total_tokens = input_tokens + output_tokens

    # Registra uso no banco para o painel de monitoramento
    usage_entry = UsageLog(
        interaction_id=interaction_id_out,
        model=model_name,
        operation="chat_agent",
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        total_tokens=total_tokens,
        tools_called=[t.name for t in tools_trace],
        latency_ms=latency_ms,
        user_Preview=user_message[:200],
    )
    db.add(usage_entry)

    if save_for_finetune and reply_text:
        ft_example = FineTuneExample(
            category="chat_curated",
            system_instruction="Você é o Second Brain AI, assistente pessoal financeiro e acadêmico do Weuller.",
            user_input=user_message,
            ideal_output=reply_text,
            approved=True,
        )
        db.add(ft_example)

    db.commit()

    return ChatResponse(
        interaction_id=interaction_id_out,
        reply=reply_text,
        model=model_name,
        tools_called=tools_trace,
        rag_sources=rag_sources,
        tokens_used=total_tokens,
        latency_ms=latency_ms,
    )

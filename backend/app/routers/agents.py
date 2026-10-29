import re
from datetime import datetime
from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AgentProfile, utcnow
from app.schemas import AgentProfileCreate, AgentProfileOut, AgentProfileUpdate

router = APIRouter(prefix="/api/agents", tags=["Gerenciador de Agentes IA"])

AVAILABLE_TOOLS_METADATA: list[dict[str, str]] = [
    {
        "name": "create_workout_plan",
        "label": "Criar Ficha de Treino (SmartWorkout)",
        "category": "treino",
        "description": "Cria uma ficha/rotina de treino estruturada com exercícios da biblioteca SmartWorkout, séries, repetições e descanso.",
    },
    {
        "name": "log_workout_session",
        "label": "Registrar Treino & Cargas do Dia",
        "category": "treino",
        "description": "Anota o treino realizado no dia, quantos exercícios foram feitos, séries, repetições e a carga (kg) pega em cada exercício.",
    },
    {
        "name": "search_workout_exercises",
        "label": "Consultar Biblioteca SmartWorkout",
        "category": "treino",
        "description": "Busca exercícios na Biblioteca SmartWorkout por grupo muscular ou equipamento.",
    },
    {
        "name": "save_memory_fact",
        "label": "Salvar na Memória Core",
        "category": "memoria",
        "description": "Guarda fatos permanentes, metas de carga, medidas corporais, regras financeiras ou preferências do usuário.",
    },
    {
        "name": "delete_memory_fact",
        "label": "Remover da Memória Core",
        "category": "memoria",
        "description": "Apaga um fato da Memória Core pelo ID.",
    },
    {
        "name": "search_documents_rag",
        "label": "Busca Semântica no RAG (PDFs/Docs)",
        "category": "memoria",
        "description": "Pesquisa nos documentos PDF, faturas, apostilas ou fichas enviadas ao RAG.",
    },
    {
        "name": "upsert_schedule_notification",
        "label": "Agendar Lembrete / Horário de Treino ou Aula",
        "category": "agenda",
        "description": "Configura alertas recorrentes na semana (treinos, aulas) ou compromissos únicos na Agenda.",
    },
    {
        "name": "delete_schedule_notification",
        "label": "Remover Alerta da Agenda",
        "category": "agenda",
        "description": "Remove um lembrete ou notificação da Agenda pelo ID.",
    },
    {
        "name": "upsert_bank_account",
        "label": "Atualizar Saldo / Cartão Bancário",
        "category": "financas",
        "description": "Cadastra ou atualiza saldo de conta corrente e limite de cartão de crédito.",
    },
    {
        "name": "add_finance_record",
        "label": "Registrar Gasto / Receita",
        "category": "financas",
        "description": "Registra despesas, contas de cartão ou receitas financeiras.",
    },
    {
        "name": "update_finance_status",
        "label": "Quitar / Alterar Status de Conta",
        "category": "financas",
        "description": "Marca lançamentos financeiros como pagos ou pendentes.",
    },
    {
        "name": "add_installment_purchase",
        "label": "Registrar Compra Parcelada / Financiamento",
        "category": "financas",
        "description": "Cadastra compras parceladas no cartão ou financiamentos gerando as parcelas futuras.",
    },
    {
        "name": "add_academic_task",
        "label": "Cadastrar Prova / Trabalho da Faculdade",
        "category": "faculdade",
        "description": "Adiciona provas, trabalhos, projetos e prazos acadêmicos.",
    },
    {
        "name": "update_academic_task",
        "label": "Atualizar Status / Nota da Faculdade",
        "category": "faculdade",
        "description": "Atualiza o andamento ou nota obtida em uma atividade acadêmica.",
    },
]

ALL_TOOL_NAMES = [t["name"] for t in AVAILABLE_TOOLS_METADATA]

DEFAULT_AGENTS: list[dict[str, Any]] = [
    {
        "slug": "second-brain-core",
        "name": "Second Brain Orquestrador",
        "role": "Assistente Pessoal Completo (Finanças, Treinos, Faculdade & RAG)",
        "description": (
            "Agente central do Weuller com acesso total a todas as ferramentas do sistema: "
            "cria e registra treinos SmartWorkout, controla cartões/saldos, gerencia prazos da faculdade, "
            "agenda notificações e consulta documentos no RAG."
        ),
        "category": "geral",
        "avatar_icon": "brain",
        "accent_color": "#3454d1",
        "model": None,
        "system_prompt": (
            "Você é o Second Brain Orquestrador, o assistente pessoal completo do Weuller. "
            "Atue de forma proativa acionando as ferramentas corretas para registrar treinos e cargas, "
            "criar fichas de musculação, lançar gastos financeiros, agendar aulas/treinos e salvar memórias."
        ),
        "tools_enabled": ALL_TOOL_NAMES,
        "quick_prompts": [
            "Monte uma ficha de treino ABC focada em hipertrofia",
            "Treinei Peito e Tríceps hoje: Supino Inclinado 4x10 com 30kg e Tríceps Corda 4x12 com 35kg",
            "Me dê um resumo dos meus treinos, finanças e faculdade",
            "Gastei R$ 64,90 no iFood pelo cartão Nubank hoje",
        ],
        "is_default": True,
        "is_system": True,
        "enabled": True,
    },
    {
        "slug": "smartworkout-coach",
        "name": "SmartWorkout Coach IA",
        "role": "Personal Trainer & Criador de Fichas de Treino",
        "description": (
            "Agente especialista em musculação, hipertrofia e progressão de carga baseado na Biblioteca de "
            "Exercícios SmartWorkout. Cria fichas personalizadas (ABC, ABCD, Push/Pull/Legs, Upper/Lower), "
            "registra os dias treinados, quantos exercícios você fez e analisa a evolução das cargas (PRs e 1RM)."
        ),
        "category": "treino",
        "avatar_icon": "dumbbell",
        "accent_color": "#17c666",
        "model": None,
        "system_prompt": (
            "Você é o SmartWorkout Coach IA, Personal Trainer especialista em biomecânica, hipertrofia e força do Weuller. "
            "Sua missão é:\n"
            "1. Criar fichas de treino otimizadas usando a ferramenta `create_workout_plan` com exercícios da Biblioteca SmartWorkout "
            "(especificando séries, faixa de repetições, descanso em segundos, RIR e dicas técnicas).\n"
            "2. Sempre que o usuário contar que treinou ou informar quais exercícios e cargas pegou, chamar IMEDIATAMENTE "
            "`log_workout_session` registrando a data, os exercícios feitos, séries, repetições e a carga em kg.\n"
            "3. Consultar `search_workout_exercises` quando o usuário pedir variações por grupo muscular ou equipamento "
            "(Barra, Halteres, Máquina, Polia/Cabo, Peso Corporal).\n"
            "4. Acompanhar quantos dias o usuário treinou, quantos exercícios realizou e incentivar a sobrecarga progressiva segura."
        ),
        "tools_enabled": [
            "create_workout_plan",
            "log_workout_session",
            "search_workout_exercises",
            "save_memory_fact",
            "upsert_schedule_notification",
        ],
        "quick_prompts": [
            "Crie um treino Push/Pull/Legs (ABC) completo para hipertrofia na academia",
            "Crie uma ficha de Peito, Ombro e Tríceps focada em porção superior do peitoral",
            "Registre meu treino de hoje: Agachamento Livre 4x8 com 100kg, Leg Press 4x12 com 240kg, Cadeira Extensora 4x12 com 70kg e Mesa Flexora 4x12 com 55kg",
            "Quantos dias eu treinei, quantos exercícios fiz e quais são minhas maiores cargas (PRs)?",
        ],
        "is_default": False,
        "is_system": True,
        "enabled": True,
    },
    {
        "slug": "finance-advisor",
        "name": "Consultor Financeiro & Cartões",
        "role": "Especialista em Orçamento, Faturas & Previsão de Salário",
        "description": (
            "Focado 100% na saúde financeira: monitora faturas de cartão de crédito, compras parceladas, "
            "saldos bancários e calcula quanto vai sobrar do salário no próximo mês."
        ),
        "category": "financas",
        "avatar_icon": "wallet",
        "accent_color": "#ffa21d",
        "model": None,
        "system_prompt": (
            "Você é o Consultor Financeiro Pessoal do Weuller. Analise gastos com precisão, registre despesas "
            "e parcelamentos imediatamente com as ferramentas financeiras e destaque sempre o impacto na sobra do salário."
        ),
        "tools_enabled": [
            "upsert_bank_account",
            "add_finance_record",
            "update_finance_status",
            "add_installment_purchase",
            "search_documents_rag",
            "save_memory_fact",
        ],
        "quick_prompts": [
            "Quanto vai sobrar do meu salário no próximo mês?",
            "O que tem parcelado atualmente nos meus cartões?",
            "Gastei R$ 120,00 em suplementos (Whey + Creatina) no cartão hoje",
        ],
        "is_default": False,
        "is_system": True,
        "enabled": True,
    },
    {
        "slug": "academic-tutor",
        "name": "Tutor Acadêmico & RAG",
        "role": "Organizador de Estudos, Provas & Documentos PDF",
        "description": (
            "Auxilia nas disciplinas da faculdade, organiza prazos de provas e projetos, configura "
            "a grade semanal de aulas e responde dúvidas buscando nos arquivos PDF enviados ao RAG."
        ),
        "category": "faculdade",
        "avatar_icon": "graduation",
        "accent_color": "#3dc7be",
        "model": None,
        "system_prompt": (
            "Você é o Tutor Acadêmico e Pesquisador RAG do Weuller. Ajude a planejar estudos, cadastre provas "
            "e trabalhos com `add_academic_task`, agende aulas com `upsert_schedule_notification` e busque "
            "conceitos nos documentos com `search_documents_rag`."
        ),
        "tools_enabled": [
            "add_academic_task",
            "update_academic_task",
            "search_documents_rag",
            "upsert_schedule_notification",
            "save_memory_fact",
        ],
        "quick_prompts": [
            "Quais são minhas provas e entregas pendentes da faculdade?",
            "Tenho prova de Inteligência Artificial dia 25/11 valendo 10 pontos",
            "Pesquise nos meus documentos do RAG sobre os arquivos enviados",
        ],
        "is_default": False,
        "is_system": True,
        "enabled": True,
    },
]


def _slugify(text: str) -> str:
    clean = re.sub(r"[^a-zA-Z0-9]+", "-", text.lower()).strip("-")
    return clean or f"agent-{int(datetime.now().timestamp())}"


DEFAULT_AGENTS_SEEDED_FLAG = "seeded_default_agents"


def ensure_default_agents_seeded(db: Session) -> None:
    """Cria os agentes padrão uma única vez (na inicialização do backend).

    Depois disso não recria nada: agentes que você excluir continuam excluídos
    (use "Restaurar padrões" para trazê-los de volta).
    """
    from sqlalchemy.exc import IntegrityError

    from app.services.app_settings_store import get_setting, set_setting

    if get_setting(db, DEFAULT_AGENTS_SEEDED_FLAG) == "1":
        return
    existing_slugs = {row[0] for row in db.query(AgentProfile.slug).all()}
    has_any = len(existing_slugs) > 0
    added = False
    for tpl in DEFAULT_AGENTS:
        if tpl["slug"] not in existing_slugs:
            db.add(
                AgentProfile(
                    slug=tpl["slug"],
                    name=tpl["name"],
                    role=tpl["role"],
                    description=tpl["description"],
                    category=tpl["category"],
                    avatar_icon=tpl["avatar_icon"],
                    accent_color=tpl["accent_color"],
                    model=tpl["model"],
                    system_prompt=tpl["system_prompt"],
                    tools_enabled=tpl["tools_enabled"],
                    quick_prompts=tpl["quick_prompts"],
                    is_default=tpl["is_default"] if not has_any else False,
                    is_system=tpl["is_system"],
                    enabled=tpl["enabled"],
                )
            )
            added = True
    if added:
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
    set_setting(db, DEFAULT_AGENTS_SEEDED_FLAG, "1")


@router.get("/tools")
def list_available_agent_tools():
    return AVAILABLE_TOOLS_METADATA


@router.get("", response_model=list[AgentProfileOut])
def list_agents(db: Session = Depends(get_db)):
    ensure_default_agents_seeded(db)
    return (
        db.query(AgentProfile)
        .order_by(AgentProfile.is_default.desc(), AgentProfile.is_system.desc(), AgentProfile.id.asc())
        .all()
    )


@router.post("", response_model=AgentProfileOut)
def create_agent(payload: AgentProfileCreate, db: Session = Depends(get_db)):
    ensure_default_agents_seeded(db)
    base_slug = _slugify(payload.slug or payload.name)
    slug = base_slug
    counter = 2
    while db.query(AgentProfile).filter(AgentProfile.slug == slug).first():
        slug = f"{base_slug}-{counter}"
        counter += 1

    if payload.is_default:
        db.query(AgentProfile).update({AgentProfile.is_default: False})

    agent = AgentProfile(
        slug=slug,
        name=payload.name.strip(),
        role=payload.role.strip(),
        description=payload.description.strip(),
        category=payload.category.strip(),
        avatar_icon=payload.avatar_icon,
        accent_color=payload.accent_color,
        model=payload.model.strip() if payload.model and payload.model.strip() else None,
        system_prompt=payload.system_prompt.strip(),
        tools_enabled=payload.tools_enabled or ALL_TOOL_NAMES,
        quick_prompts=payload.quick_prompts or [],
        is_default=payload.is_default,
        is_system=False,
        enabled=payload.enabled,
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return agent


@router.put("/{agent_id}", response_model=AgentProfileOut)
def update_agent(agent_id: int, payload: AgentProfileUpdate, db: Session = Depends(get_db)):
    agent = db.query(AgentProfile).filter(AgentProfile.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agente não encontrado")

    data = payload.model_dump(exclude_unset=True)
    if data.get("is_default") is True:
        db.query(AgentProfile).filter(AgentProfile.id != agent_id).update(
            {AgentProfile.is_default: False}
        )

    if "model" in data:
        data["model"] = data["model"].strip() if data["model"] and data["model"].strip() else None

    for k, v in data.items():
        setattr(agent, k, v)
    agent.updated_at = utcnow()
    db.commit()
    db.refresh(agent)
    return agent


@router.delete("/{agent_id}")
def delete_agent(agent_id: int, db: Session = Depends(get_db)):
    agent = db.query(AgentProfile).filter(AgentProfile.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agente não encontrado")

    was_default = agent.is_default
    db.delete(agent)
    db.commit()

    if was_default:
        first_remaining = db.query(AgentProfile).order_by(AgentProfile.id.asc()).first()
        if first_remaining:
            first_remaining.is_default = True
            db.commit()

    return {"status": "deleted", "id": agent_id}


@router.post("/reset-defaults", response_model=list[AgentProfileOut])
def reset_default_agents(db: Session = Depends(get_db)):
    """Restaura ou atualiza os agentes padrão do sistema."""
    for tpl in DEFAULT_AGENTS:
        existing = db.query(AgentProfile).filter(AgentProfile.slug == tpl["slug"]).first()
        if existing:
            existing.name = tpl["name"]
            existing.role = tpl["role"]
            existing.description = tpl["description"]
            existing.category = tpl["category"]
            existing.avatar_icon = tpl["avatar_icon"]
            existing.accent_color = tpl["accent_color"]
            existing.system_prompt = tpl["system_prompt"]
            existing.tools_enabled = tpl["tools_enabled"]
            existing.quick_prompts = tpl["quick_prompts"]
            existing.enabled = True
            existing.updated_at = utcnow()
        else:
            db.add(AgentProfile(**tpl))
    db.commit()
    return (
        db.query(AgentProfile)
        .order_by(AgentProfile.is_default.desc(), AgentProfile.is_system.desc(), AgentProfile.id.asc())
        .all()
    )

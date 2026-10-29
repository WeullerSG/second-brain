"""Monta treinos sob medida: "tenho 30 minutos e quero treinar só peito" e a rotina semanal.

Também adiciona os exercícios de cardio à biblioteca (fotos do free-exercise-db, domínio público).
"""
import re
import unicodedata
from datetime import date
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models import WorkoutExercise, WorkoutPlan, WorkoutSession
from app.services.exercise_media import IMAGE_CDN
from app.services.workout_suggest import _history, _item

# ---------------------------------------------------------------- cardio

CARDIO_SEEDED_FLAG = "seeded_cardio_library"

CARDIO_CATALOG: list[dict[str, str]] = [
    {"slug": "cardio-esteira-caminhada", "name": "Caminhada na Esteira", "fedb": "Walking_Treadmill", "equipment": "Máquina",
     "difficulty": "Iniciante", "instructions": "Caminhe em ritmo acelerado com o tronco ereto, sem segurar nas laterais. Use inclinação de 3 a 8% para aumentar a intensidade."},
    {"slug": "cardio-esteira-corrida", "name": "Corrida na Esteira", "fedb": "Running_Treadmill", "equipment": "Máquina",
     "difficulty": "Intermediário", "instructions": "Corra em ritmo constante ou alterne 1 minuto rápido com 1 minuto leve (intervalado). Pise com o meio do pé e mantenha os ombros relaxados."},
    {"slug": "cardio-bicicleta-ergometrica", "name": "Bicicleta Ergométrica", "fedb": "Bicycling_Stationary", "equipment": "Máquina",
     "difficulty": "Iniciante", "instructions": "Ajuste o banco na altura do quadril. Pedale com cadência de 80 a 100 rpm, aumentando a carga para subir a intensidade."},
    {"slug": "cardio-eliptico", "name": "Elíptico (Transport)", "fedb": "Elliptical_Trainer", "equipment": "Máquina",
     "difficulty": "Iniciante", "instructions": "Movimente braços e pernas de forma coordenada, sem tirar os pés dos pedais. Baixo impacto, bom para as articulações."},
    {"slug": "cardio-escada", "name": "Escada (Stairmaster / Simulador de Escada)", "fedb": "Stairmaster", "equipment": "Máquina",
     "difficulty": "Intermediário", "instructions": "Suba os degraus com o corpo levemente inclinado à frente, sem apoiar o peso nos corrimãos. Ótimo para glúteos e condicionamento."},
    {"slug": "cardio-remo-ergometro", "name": "Remo Ergômetro", "fedb": "Rowing_Stationary", "equipment": "Máquina",
     "difficulty": "Intermediário", "instructions": "Empurre com as pernas, depois puxe com as costas e braços até o abdômen. Volte na ordem inversa, de forma controlada."},
    {"slug": "cardio-pular-corda", "name": "Pular Corda", "fedb": "Rope_Jumping", "equipment": "Peso Corporal",
     "difficulty": "Intermediário", "instructions": "Salte baixo, na ponta dos pés, girando a corda com os punhos e os cotovelos junto ao corpo. Faça blocos de 1 minuto com 30 s de pausa."},
    {"slug": "cardio-escalador", "name": "Escalador (Mountain Climber)", "fedb": "Mountain_Climbers", "equipment": "Peso Corporal",
     "difficulty": "Iniciante", "instructions": "Em posição de prancha, leve os joelhos alternadamente em direção ao peito em ritmo rápido, mantendo o quadril baixo."},
]


def ensure_cardio_seeded(db: Session) -> None:
    """Adiciona os exercícios de cardio uma única vez (exclusões continuam valendo)."""
    from app.services.app_settings_store import get_setting, set_setting

    if get_setting(db, CARDIO_SEEDED_FLAG) == "1":
        return
    existing = {row[0] for row in db.query(WorkoutExercise.slug).all()}
    for item in CARDIO_CATALOG:
        if item["slug"] in existing:
            continue
        db.add(
            WorkoutExercise(
                slug=item["slug"],
                name=item["name"],
                muscle_group="Cardio",
                secondary_muscles="Condicionamento, Gasto Calórico",
                equipment=item["equipment"],
                difficulty=item["difficulty"],
                mechanic="Cardio",
                instructions=item["instructions"],
                common_mistakes=None,
                image_urls=[f"{IMAGE_CDN}/{item['fedb']}/0.jpg", f"{IMAGE_CDN}/{item['fedb']}/1.jpg"],
                is_custom=False,
            )
        )
    db.commit()
    set_setting(db, CARDIO_SEEDED_FLAG, "1")


# ---------------------------------------------------------------- leitura do pedido

def _plain(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(c) != "Mn")


# palavra-chave (sem acento) -> grupos musculares
GROUP_KEYWORDS: list[tuple[str, list[str]]] = [
    ("superior", ["Peito", "Costas", "Ombros", "Bíceps", "Tríceps"]),
    ("inferior", ["Pernas", "Glúteos"]),
    ("braco", ["Bíceps", "Tríceps"]),
    ("peito", ["Peito"]), ("peitoral", ["Peito"]),
    ("costa", ["Costas"]), ("dorsal", ["Costas"]),
    ("perna", ["Pernas"]), ("quadricep", ["Pernas"]), ("posterior de coxa", ["Pernas"]),
    ("gluteo", ["Glúteos"]), ("bumbum", ["Glúteos"]),
    ("ombro", ["Ombros"]), ("deltoide", ["Ombros"]),
    ("bicep", ["Bíceps"]), ("tricep", ["Tríceps"]),
    ("antebraco", ["Antebraço"]),
    ("abdom", ["Abdômen"]), ("abs", ["Abdômen"]), ("core", ["Abdômen"]),
    ("full body", ["Peito", "Costas", "Pernas", "Ombros"]), ("corpo todo", ["Peito", "Costas", "Pernas", "Ombros"]),
]
CARDIO_KEYWORDS = ("cardio", "aerobico", "esteira", "corrida", "correr", "bike", "bicicleta", "eliptico", "escada", "pular corda", "hiit")


def parse_request(text: str) -> dict[str, Any]:
    """Entende pedidos como "tenho 30 minutos e quero treinar só peito" ou "1h de bíceps e tríceps com cardio"."""
    t = _plain(text or "")
    minutes: Optional[int] = None
    # "1h", "1h30", "1,5 hora", "2 horas e 15 min"
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*(?:horas?|h)(?![a-z])(?:\s*e?\s*(\d{1,2})\s*(?:min\w*)?)?", t)
    if m:
        minutes = int(float(m.group(1).replace(",", ".")) * 60) + int(m.group(2) or 0)
    else:
        m = re.search(r"(\d+)\s*(min|minuto|m\b)", t)
        if m:
            minutes = int(m.group(1))
    if minutes is None and "meia hora" in t:
        minutes = 30

    groups: list[str] = []
    for kw, gs in GROUP_KEYWORDS:
        if kw in t:
            for g in gs:
                if g not in groups:
                    groups.append(g)
    wants_cardio = any(k in t for k in CARDIO_KEYWORDS)
    no_cardio = bool(re.search(r"\bsem (cardio|aerobico)", t))
    return {"minutes": minutes, "muscle_groups": groups, "include_cardio": wants_cardio and not no_cardio}


# ---------------------------------------------------------------- montagem

def _pick_exercises(
    exercises: list[WorkoutExercise], group: str, count: int, last_by_exercise: dict, used: set[int]
) -> list[WorkoutExercise]:
    options = [e for e in exercises if e.muscle_group == group and e.id not in used]
    # Os que você já faz primeiro; depois compostos; depois o resto
    options.sort(
        key=lambda e: (
            -(last_by_exercise.get(e.name.lower(), {}).get("times", 0)),
            0 if (e.mechanic or "") == "Composto" else 1,
            e.id,
        )
    )
    chosen = options[:count]
    used.update(e.id for e in chosen)
    return chosen


def _cardio_item(ex: WorkoutExercise, minutes: int, hint: str) -> dict[str, Any]:
    return {
        "exercise_id": ex.id,
        "exercise_name": ex.name,
        "muscle_group": "Cardio",
        "equipment": ex.equipment,
        "sets_count": 1,
        "reps": f"{minutes} min",
        "weight_kg": 0.0,
        "notes": hint,
        "image_urls": ex.image_urls or [],
    }


def build_workout(
    db: Session,
    minutes: int = 45,
    muscle_groups: Optional[list[str]] = None,
    include_cardio: bool = False,
    cardio_minutes: Optional[int] = None,
    used_cardio_offset: int = 0,
) -> dict[str, Any]:
    """Monta os exercícios que cabem no tempo disponível para os grupos pedidos."""
    minutes = max(10, min(int(minutes or 45), 180))
    exercises = db.query(WorkoutExercise).all()
    sessions = db.query(WorkoutSession).all()
    _, last_by_exercise = _history(sessions)
    groups = [g for g in (muscle_groups or []) if g != "Cardio"]
    cardio_only = not groups and include_cardio

    cardio_pool = [e for e in exercises if e.muscle_group == "Cardio"]
    items: list[dict[str, Any]] = []

    # Tempo do cardio: no fim do treino (ou o treino todo, se só cardio)
    if cardio_only:
        cardio_time = minutes
    elif include_cardio and cardio_pool:
        cardio_time = cardio_minutes or max(5, min(20, round(minutes * 0.25 / 5) * 5))
    else:
        cardio_time = 0
    strength_time = minutes - cardio_time

    if groups and strength_time >= 8:
        # Cada exercício leva ~6,5 min com 3 séries (descanso de 60-75 s) ou ~8,5 min com 4 séries
        sets = 3 if strength_time < 45 else 4
        per_exercise = 6.5 if sets == 3 else 8.5
        total = max(len(groups), int(strength_time // per_exercise))
        base, extra = divmod(total, len(groups))
        used: set[int] = set()
        for i, group in enumerate(groups):
            count = base + (1 if i < extra else 0)
            for ex in _pick_exercises(exercises, group, count, last_by_exercise, used):
                item = _item(ex, last_by_exercise.get(ex.name.lower()), sets=sets, reps="10")
                item["sets_count"] = sets
                items.append(item)

    if cardio_time and cardio_pool:
        cardio_pool.sort(key=lambda e: e.id)
        if cardio_only and cardio_time >= 30:
            first, second = cardio_pool[used_cardio_offset % len(cardio_pool)], cardio_pool[(used_cardio_offset + 1) % len(cardio_pool)]
            half = cardio_time // 2
            items.append(_cardio_item(first, half, "Aquecimento + ritmo moderado (consegue conversar)."))
            items.append(_cardio_item(second, cardio_time - half, "Intervalado: 1 min forte / 1 min leve."))
        else:
            ex = cardio_pool[used_cardio_offset % len(cardio_pool)]
            hint = "Ritmo moderado, mantendo a respiração controlada." if cardio_only else "Cardio no fim do treino, em ritmo moderado."
            items.append(_cardio_item(ex, cardio_time, hint))

    label_groups = groups + (["Cardio"] if cardio_time else [])
    title = " e ".join([", ".join(label_groups[:-1]), label_groups[-1]]) if len(label_groups) > 1 else (label_groups[0] if label_groups else "Treino")
    return {
        "title": f"{title} ({minutes} min)",
        "plan_id": None,
        "muscle_groups": ", ".join(label_groups),
        "minutes": minutes,
        "reason": f"Treino montado para caber em {minutes} minutos"
        + (f", com {cardio_time} min de cardio." if cardio_time and not cardio_only else "."),
        "trained_today": any((s.session_date or "")[:10] == date.today().isoformat() for s in sessions),
        "exercises": items,
    }


# ---------------------------------------------------------------- rotina semanal

DAY_LABELS = {"mon": "Seg", "tue": "Ter", "wed": "Qua", "thu": "Qui", "fri": "Sex", "sat": "Sáb", "sun": "Dom"}
WEEK_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
ROUTINE_AUTHOR = "Rotina Semanal"

# Divisão por quantidade de dias de treino na semana
SPLITS: dict[int, list[tuple[str, list[str]]]] = {
    1: [("Corpo Todo", ["Peito", "Costas", "Pernas", "Ombros"])],
    2: [("Superiores", ["Peito", "Costas", "Ombros", "Bíceps", "Tríceps"]), ("Inferiores e Abdômen", ["Pernas", "Glúteos", "Abdômen"])],
    3: [("Peito, Ombros e Tríceps", ["Peito", "Ombros", "Tríceps"]), ("Costas e Bíceps", ["Costas", "Bíceps"]), ("Pernas e Glúteos", ["Pernas", "Glúteos"])],
    4: [("Peito e Tríceps", ["Peito", "Tríceps"]), ("Costas e Bíceps", ["Costas", "Bíceps"]), ("Pernas e Glúteos", ["Pernas", "Glúteos"]), ("Ombros e Abdômen", ["Ombros", "Abdômen"])],
    5: [("Peito e Tríceps", ["Peito", "Tríceps"]), ("Costas e Bíceps", ["Costas", "Bíceps"]), ("Pernas e Glúteos", ["Pernas", "Glúteos"]), ("Ombros e Abdômen", ["Ombros", "Abdômen"]), ("Braços e Cardio", ["Bíceps", "Tríceps", "Antebraço"])],
    6: [("Peito, Ombros e Tríceps", ["Peito", "Ombros", "Tríceps"]), ("Costas e Bíceps", ["Costas", "Bíceps"]), ("Pernas e Glúteos", ["Pernas", "Glúteos"])] * 2,
    7: [("Peito, Ombros e Tríceps", ["Peito", "Ombros", "Tríceps"]), ("Costas e Bíceps", ["Costas", "Bíceps"]), ("Pernas e Glúteos", ["Pernas", "Glúteos"])] * 2 + [("Cardio e Abdômen", ["Abdômen"])],
}


def build_weekly_routine(
    db: Session,
    days: list[str],
    minutes: int = 60,
    include_cardio: bool = True,
    cardio_minutes: int = 15,
    goal: str = "Hipertrofia",
) -> list[WorkoutPlan]:
    """Cria uma ficha para cada dia escolhido (substitui a rotina semanal anterior)."""
    days = [d for d in WEEK_ORDER if d in set(days)] or ["mon", "tue", "wed", "thu", "fri"]
    split = SPLITS[len(days)]

    # Substitui só a rotina gerada antes; fichas criadas por você ou pelo agente ficam intactas
    for old in db.query(WorkoutPlan).filter(WorkoutPlan.created_by_agent == ROUTINE_AUTHOR).all():
        db.delete(old)
    db.commit()

    plans: list[WorkoutPlan] = []
    for i, day in enumerate(days):
        title, groups = split[i]
        day_cardio = include_cardio or title.endswith("Cardio") or title.startswith("Cardio")
        built = build_workout(
            db,
            minutes=minutes,
            muscle_groups=groups,
            include_cardio=day_cardio,
            cardio_minutes=cardio_minutes if day_cardio else None,
            used_cardio_offset=i,
        )
        plan = WorkoutPlan(
            title=f"{DAY_LABELS[day]} — {title}",
            split_label="Rotina Semanal",
            target_muscles=built["muscle_groups"],
            goal=goal,
            scheduled_days=DAY_LABELS[day],
            estimated_duration_min=minutes,
            created_by_agent=ROUTINE_AUTHOR,
            notes=f"Rotina de {len(days)} dias por semana, {minutes} min por treino.",
            exercises=[
                {
                    "exercise_id": e["exercise_id"],
                    "exercise_name": e["exercise_name"],
                    "muscle_group": e["muscle_group"],
                    "equipment": e["equipment"],
                    "sets": e["sets_count"],
                    "reps": e["reps"],
                    "target_weight_kg": e["weight_kg"],
                    "rest_seconds": 0 if e["muscle_group"] == "Cardio" else 75,
                    "rir": "" if e["muscle_group"] == "Cardio" else "1-2 RIR",
                    "notes": e.get("notes"),
                }
                for e in built["exercises"]
            ],
            active=True,
        )
        db.add(plan)
        plans.append(plan)
    db.commit()
    for p in plans:
        db.refresh(p)
    return plans


# ---------------------------------------------------------------- dia da semana

_DAY_ALIASES = {
    "mon": ["seg", "segunda", "mon"], "tue": ["ter", "terca", "tue"], "wed": ["qua", "quarta", "wed"],
    "thu": ["qui", "quinta", "thu"], "fri": ["sex", "sexta", "fri"], "sat": ["sab", "sabado", "sat"], "sun": ["dom", "domingo", "sun"],
}


def plan_runs_on(plan: WorkoutPlan, day: date) -> bool:
    """A ficha está agendada para este dia da semana? (aceita "Seg, Qui", "mon,thu" etc.)"""
    code = WEEK_ORDER[day.weekday()]
    tokens = re.split(r"[\s,;/]+", _plain(plan.scheduled_days or ""))
    return any(t in _DAY_ALIASES[code] for t in tokens if t)

"""Sugestão do treino do dia a partir do histórico de treinos.

Regras (o mesmo raciocínio de um personal):
1. Escolhe o grupo de treino que está há mais tempo sem ser trabalhado
   (se você tem fichas ativas, a ficha "da vez" na rotação).
2. Para cada grupo, prioriza os exercícios que você já faz.
3. Progressão de carga: se na última vez você fez as repetições com folga
   (esforço até 8), sobe a carga; se foi pesado (9-10), mantém.
"""
from datetime import date, datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models import WorkoutExercise, WorkoutPlan, WorkoutSession

# Divisões clássicas usadas quando não há fichas ativas
SPLIT_TEMPLATES: list[dict[str, Any]] = [
    {"title": "Peito, Ombros e Tríceps", "groups": [("Peito", 2), ("Ombros", 2), ("Tríceps", 1)]},
    {"title": "Costas e Bíceps", "groups": [("Costas", 3), ("Bíceps", 2)]},
    {"title": "Pernas e Glúteos", "groups": [("Pernas", 3), ("Glúteos", 1), ("Abdômen", 1)]},
]

NEVER_TRAINED_DAYS = 999


def _days_since(iso: Optional[str], today: date) -> int:
    if not iso:
        return NEVER_TRAINED_DAYS
    try:
        return (today - datetime.strptime(iso[:10], "%Y-%m-%d").date()).days
    except ValueError:
        return NEVER_TRAINED_DAYS


def _first_int(value: Any, default: int) -> int:
    digits = ""
    for ch in str(value or ""):
        if ch.isdigit():
            digits += ch
        elif digits:
            break
    return int(digits) if digits else default


def _round_to_step(weight: float) -> float:
    """Arredonda para os incrementos comuns de academia (0,5 kg abaixo de 10 kg, 1 kg até 30 kg, 2,5 kg acima)."""
    step = 0.5 if weight < 10 else (1.0 if weight < 30 else 2.5)
    return round(round(weight / step) * step, 1)


def _history(sessions: list[WorkoutSession]) -> tuple[dict[str, str], dict[str, dict[str, Any]]]:
    """Retorna (último treino por grupo muscular, último registro por exercício)."""
    last_by_group: dict[str, str] = {}
    last_by_exercise: dict[str, dict[str, Any]] = {}
    for sess in sorted(sessions, key=lambda s: (s.session_date or "", s.id or 0)):
        for ex in sess.exercises_performed or []:
            name = str(ex.get("exercise_name") or "").strip()
            group = str(ex.get("muscle_group") or "").strip()
            if group:
                last_by_group[group] = sess.session_date
            if not name:
                continue
            prev = last_by_exercise.get(name.lower(), {})
            last_by_exercise[name.lower()] = {
                "date": sess.session_date,
                "weight": float(ex.get("max_weight_kg") or ex.get("weight_kg") or 0.0),
                "reps": _first_int(ex.get("reps"), 10),
                "sets": int(ex.get("sets_count") or 3),
                "effort": int(sess.perceived_effort or 8),
                "times": prev.get("times", 0) + 1,
            }
    return last_by_group, last_by_exercise


def _progress(last: Optional[dict[str, Any]]) -> tuple[float, str]:
    """Carga sugerida e o motivo, a partir da última vez que o exercício foi feito."""
    if not last or last["weight"] <= 0:
        return 0.0, "Primeira vez: comece leve e anote a carga que usar."
    weight = last["weight"]
    raw = str(last["date"] or "")
    when = f"{raw[8:10]}/{raw[5:7]}" if len(raw) >= 10 else raw
    if last["effort"] <= 8:
        new_weight = _round_to_step(weight * 1.05 if weight >= 30 else weight + 1)
        if new_weight <= weight:
            new_weight = _round_to_step(weight + 2.5)
        return new_weight, f"Em {when} você fez {weight:g} kg com folga: suba para {new_weight:g} kg."
    return weight, f"Em {when} {weight:g} kg foi pesado: mantenha a carga e busque mais repetições."


def _item(ex: WorkoutExercise, last: Optional[dict[str, Any]], sets: int = 4, reps: str = "10") -> dict[str, Any]:
    weight, reason = _progress(last)
    return {
        "exercise_id": ex.id,
        "exercise_name": ex.name,
        "muscle_group": ex.muscle_group,
        "equipment": ex.equipment,
        "sets_count": int(last["sets"]) if last else sets,
        "reps": reps,
        "weight_kg": weight,
        "notes": reason,
        "image_urls": ex.image_urls or [],
    }


def suggest_today(db: Session, today: Optional[date] = None) -> dict[str, Any]:
    today = today or date.today()
    sessions = db.query(WorkoutSession).all()
    exercises = db.query(WorkoutExercise).all()
    by_name = {e.name.lower(): e for e in exercises}
    last_by_group, last_by_exercise = _history(sessions)

    # Descanso: avisa se já treinou hoje
    trained_today = any((s.session_date or "")[:10] == today.isoformat() for s in sessions)

    # 1) Fichas ativas: escolhe a que está há mais tempo sem ser feita
    plans = [p for p in db.query(WorkoutPlan).filter(WorkoutPlan.active.is_(True)).all() if p.exercises]
    if plans:
        def plan_last_done(p: WorkoutPlan) -> int:
            dates = [s.session_date for s in sessions if s.plan_id == p.id]
            if not dates:
                names = {str(pe.get("exercise_name", "")).lower() for pe in p.exercises}
                dates = [
                    s.session_date
                    for s in sessions
                    if names & {str(e.get("exercise_name", "")).lower() for e in s.exercises_performed or []}
                ]
            return _days_since(max(dates) if dates else None, today)

        plan = max(plans, key=lambda p: (plan_last_done(p), -p.id))
        days = plan_last_done(plan)
        items = []
        for pe in plan.exercises:
            name = str(pe.get("exercise_name", "")).strip()
            ex = by_name.get(name.lower())
            last = last_by_exercise.get(name.lower())
            if ex:
                item = _item(ex, last, sets=int(pe.get("sets") or 4), reps=str(pe.get("reps") or "10").split("-")[0])
            else:
                weight, reason = _progress(last)
                item = {
                    "exercise_id": pe.get("exercise_id"),
                    "exercise_name": name,
                    "muscle_group": pe.get("muscle_group") or "Geral",
                    "equipment": pe.get("equipment") or "Halteres",
                    "sets_count": int(pe.get("sets") or 4),
                    "reps": str(pe.get("reps") or "10").split("-")[0],
                    "weight_kg": weight,
                    "notes": reason,
                    "image_urls": [],
                }
            if not last and float(pe.get("target_weight_kg") or 0) > 0:
                item["weight_kg"] = float(pe["target_weight_kg"])
            items.append(item)
        when = "nunca feita" if days >= NEVER_TRAINED_DAYS else f"feita há {days} dia(s)"
        return {
            "title": plan.title,
            "plan_id": plan.id,
            "muscle_groups": plan.target_muscles,
            "reason": f"É a ficha que está há mais tempo sem ser treinada ({when}).",
            "trained_today": trained_today,
            "exercises": items,
        }

    # 2) Sem fichas: divisão clássica com os grupos mais descansados
    def template_rest(tpl: dict[str, Any]) -> int:
        main_group = tpl["groups"][0][0]
        return _days_since(last_by_group.get(main_group), today)

    tpl = max(SPLIT_TEMPLATES, key=template_rest)
    items = []
    for group, count in tpl["groups"]:
        options = [e for e in exercises if e.muscle_group == group]
        # Primeiro os que você já faz (mais vezes e mais recentes), depois compostos da biblioteca
        options.sort(
            key=lambda e: (
                -(last_by_exercise.get(e.name.lower(), {}).get("times", 0)),
                0 if (e.mechanic or "") == "Composto" else 1,
                e.id,
            )
        )
        for ex in options[:count]:
            items.append(_item(ex, last_by_exercise.get(ex.name.lower())))

    rest = template_rest(tpl)
    rest_txt = "nunca treinado" if rest >= NEVER_TRAINED_DAYS else f"{rest} dia(s) de descanso"
    return {
        "title": tpl["title"],
        "plan_id": None,
        "muscle_groups": ", ".join(g for g, _ in tpl["groups"]),
        "reason": f"{tpl['groups'][0][0]} é o grupo mais descansado ({rest_txt}).",
        "trained_today": trained_today,
        "exercises": items,
    }

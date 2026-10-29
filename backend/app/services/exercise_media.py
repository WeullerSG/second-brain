"""Fotos dos exercícios vindas do free-exercise-db (domínio público / The Unlicense).

Repositório: https://github.com/yuhonas/free-exercise-db
Cada exercício tem 2 fotos (posição inicial e final). O app alterna entre elas,
o que dá um efeito de animação parecido com um GIF.
"""
from sqlalchemy.orm import Session

from app.models import WorkoutExercise

IMAGE_CDN = "https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises"
SOURCE_URL = "https://github.com/yuhonas/free-exercise-db"

# slug do exercício na biblioteca do app -> id no free-exercise-db
FREE_EXERCISE_DB_IDS: dict[str, str] = {
    "supino-reto-barra": "Barbell_Bench_Press_-_Medium_Grip",
    "supino-inclinado-halteres": "Incline_Dumbbell_Press",
    "crucifixo-maquina-peck-deck": "Butterfly",
    "crossover-polia-alta": "Cable_Crossover",
    "supino-maquina-articulado": "Leverage_Chest_Press",
    "flexao-de-bracos": "Pushups",
    "puxada-alta-frente-polia": "Wide-Grip_Lat_Pulldown",
    "remada-curvada-barra": "Bent_Over_Barbell_Row",
    "remada-baixa-triangulo": "Seated_Cable_Rows",
    "remada-unilateral-halter-serrote": "One-Arm_Dumbbell_Row",
    "barra-fixa-pull-up": "Pullups",
    "pulldown-braco-reto-corda": "Straight-Arm_Pulldown",
    "agachamento-livre-barra": "Barbell_Full_Squat",
    "leg-press-45": "Leg_Press",
    "cadeira-extensora": "Leg_Extensions",
    "mesa-flexora": "Lying_Leg_Curls",
    "stiff-barra-halteres": "Romanian_Deadlift",
    "agachamento-bulgaro-halteres": "Split_Squat_with_Dumbbells",
    "agachamento-hack-machine": "Hack_Squat",
    "elevacao-pelvica-barra": "Barbell_Hip_Thrust",
    "cadeira-abdutora": "Thigh_Abductor",
    "panturrilha-em-pe-maquina": "Standing_Calf_Raises",
    "desenvolvimento-halteres": "Dumbbell_Shoulder_Press",
    "elevacao-lateral-halteres": "Side_Lateral_Raise",
    "elevacao-lateral-polia": "Cable_Seated_Lateral_Raise",
    "crucifixo-invertido-maquina": "Reverse_Machine_Flyes",
    "face-pull-polia-corda": "Face_Pull",
    "encolhimento-ombros-halteres": "Dumbbell_Shrug",
    "rosca-direta-barra-w": "EZ-Bar_Curl",
    "rosca-alternada-halteres": "Dumbbell_Alternate_Bicep_Curl",
    "rosca-inclinada-halteres": "Incline_Dumbbell_Curl",
    "rosca-scott-maquina-barra": "Preacher_Curl",
    "rosca-martelo-halteres": "Hammer_Curls",
    "rosca-punho-antebraco": "Palms-Up_Barbell_Wrist_Curl_Over_A_Bench",
    "triceps-polia-corda": "Triceps_Pushdown_-_Rope_Attachment",
    "triceps-polia-barra-reta-w": "Triceps_Pushdown",
    "triceps-frances-polia-halter": "Cable_Rope_Overhead_Triceps_Extension",
    "triceps-testa-barra-w": "EZ-Bar_Skullcrusher",
    "mergulho-paralelas-dips": "Dips_-_Triceps_Version",
    "abdominal-infra-barra-paralela": "Hanging_Leg_Raise",
    "abdominal-crunch-polia-maquina": "Cable_Crunch",
    "prancha-abdominal-isometrica": "Plank",
}


def image_urls_for_slug(slug: str) -> list[str]:
    fedb_id = FREE_EXERCISE_DB_IDS.get(slug)
    if not fedb_id:
        return []
    return [f"{IMAGE_CDN}/{fedb_id}/0.jpg", f"{IMAGE_CDN}/{fedb_id}/1.jpg"]


def backfill_exercise_images(db: Session) -> int:
    """Preenche as fotos dos exercícios da biblioteca que ainda não têm imagem.

    Só completa o que existe: não recria exercícios excluídos e não mexe em
    imagens que você trocou.
    """
    updated = 0
    for ex in db.query(WorkoutExercise).filter(WorkoutExercise.image_urls.is_(None)).all():
        urls = image_urls_for_slug(ex.slug)
        if urls:
            ex.image_urls = urls
            updated += 1
    if updated:
        db.commit()
    return updated

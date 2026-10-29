import re
from datetime import datetime, timedelta
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AgentProfile, WorkoutExercise, WorkoutPlan, WorkoutSession, utcnow
from app.schemas import (
    AIWorkoutGenerateRequest,
    WorkoutExerciseCreate,
    WorkoutExerciseOut,
    WorkoutPlanCreate,
    WorkoutPlanOut,
    WorkoutPlanUpdate,
    WorkoutSessionCreate,
    WorkoutSessionOut,
    WorkoutSessionUpdate,
)

router = APIRouter(prefix="/api/workouts", tags=["Treinos & Biblioteca SmartWorkout"])

SMARTWORKOUT_URL = "https://smartworkout.app/pt/biblioteca-de-exercicios"

# Catálogo completo inspirado na Biblioteca de Exercícios do SmartWorkout
# (https://smartworkout.app/pt/biblioteca-de-exercicios)
SMARTWORKOUT_EXERCISE_CATALOG: list[dict[str, str]] = [
    # ==================== PEITO ====================
    {
        "slug": "supino-reto-barra",
        "name": "Supino Reto com Barra",
        "muscle_group": "Peito",
        "secondary_muscles": "Tríceps, Deltoide Anterior",
        "equipment": "Barra",
        "difficulty": "Intermediário",
        "mechanic": "Composto",
        "instructions": "Deite-se no banco reto, retraia as escápulas e mantenha os pés firmes no chão. Desça a barra de forma controlada até tocar a linha média do peitoral e empurre explosivamente até a extensão quase completa.",
        "common_mistakes": "Tirar o quadril do banco, abrir os cotovelos a 90° em excesso ou quicar a barra no peito.",
    },
    {
        "slug": "supino-inclinado-halteres",
        "name": "Supino Inclinado com Halteres",
        "muscle_group": "Peito",
        "secondary_muscles": "Deltoide Anterior, Tríceps",
        "equipment": "Halteres",
        "difficulty": "Intermediário",
        "mechanic": "Composto",
        "instructions": "Ajuste o banco entre 30° e 45°. Com as escápulas aduzidas, desça os halteres alongando a porção clavicular (superior) do peitoral com cotovelos levemente fechados (~45-60°) e suba convergindo sem bater os pesos.",
        "common_mistakes": "Inclinar demais o banco (>60°, jogando tudo para o ombro) ou encurtar a amplitude na descida.",
    },
    {
        "slug": "crucifixo-maquina-peck-deck",
        "name": "Crucifixo na Máquina (Peck Deck / Voador)",
        "muscle_group": "Peito",
        "secondary_muscles": "Deltoide Anterior",
        "equipment": "Máquina",
        "difficulty": "Iniciante",
        "mechanic": "Isolado",
        "instructions": "Ajuste o assento para que as mãos fiquem na altura do peito. Mantenha o peito estufado e una os braços à frente espremendo o peitoral por 1 segundo no pico de contração antes de retornar controlando a fase excêntrica.",
        "common_mistakes": "Descolar as costas do encosto ou dobrar excessivamente os cotovelos transformando em supino.",
    },
    {
        "slug": "crossover-polia-alta",
        "name": "Crossover na Polia Alta",
        "muscle_group": "Peito",
        "secondary_muscles": "Deltoide Anterior, Core",
        "equipment": "Polia / Cabo",
        "difficulty": "Intermediário",
        "mechanic": "Isolado",
        "instructions": "Posicione as polias no alto, dê um passo à frente para estabilizar o tronco e puxe os cabos em arco para baixo e à frente do quadril, mantendo tensão constante nas fibras inferiores e mediais do peitoral.",
        "common_mistakes": "Usar impulso do tronco ou perder o alinhamento escapular.",
    },
    {
        "slug": "supino-maquina-articulado",
        "name": "Supino na Máquina Articulada (Chest Press)",
        "muscle_group": "Peito",
        "secondary_muscles": "Tríceps, Deltoide Anterior",
        "equipment": "Máquina",
        "difficulty": "Iniciante",
        "mechanic": "Composto",
        "instructions": "Estabilize as escápulas contra o encosto e empurre as manoplas mantendo os punhos alinhados aos antebraços. Excelente para chegar próximo à falha com segurança máxima.",
        "common_mistakes": "Protrair os ombros no final do movimento perdendo tensão no peitoral.",
    },
    {
        "slug": "flexao-de-bracos",
        "name": "Flexão de Braços (Push-Up)",
        "muscle_group": "Peito",
        "secondary_muscles": "Tríceps, Deltoide Anterior, Core",
        "equipment": "Peso Corporal",
        "difficulty": "Iniciante",
        "mechanic": "Composto",
        "instructions": "Mantenha o corpo em prancha rígida, mãos ligeiramente mais largas que os ombros. Desça até o peito quase tocar o solo e empurre mantendo o abdômen contraído.",
        "common_mistakes": "Deixar o quadril cair (hiperextensão lombar) ou abrir demais os cotovelos.",
    },
    # ==================== COSTAS ====================
    {
        "slug": "puxada-alta-frente-polia",
        "name": "Puxada Alta na Polia (Pulldown Frente)",
        "muscle_group": "Costas",
        "secondary_muscles": "Bíceps, Redondo Maior, Romboides",
        "equipment": "Polia / Cabo",
        "difficulty": "Iniciante",
        "mechanic": "Composto",
        "instructions": "Segure a barra em pegada pronada aberta, incline levemente o tronco para trás (~15°) e puxe a barra em direção à parte superior do peitoral conduzindo o movimento pelos cotovelos.",
        "common_mistakes": "Balançar o tronco excessivamente para trás ou puxar a barra atrás da nuca.",
    },
    {
        "slug": "remada-curvada-barra",
        "name": "Remada Curvada com Barra (Pegada Pronada/Supinada)",
        "muscle_group": "Costas",
        "secondary_muscles": "Bíceps, Lombar, Deltoide Posterior, Trapézio",
        "equipment": "Barra",
        "difficulty": "Avançado",
        "mechanic": "Composto",
        "instructions": "Incline o tronco entre 45° e 60° mantendo a coluna neutra e joelhos semiflexionados. Puxe a barra em direção ao abdômen inferior espremendo as escápulas no topo.",
        "common_mistakes": "Arredondar a coluna lombar ou levantar o tronco a cada repetição com impulso.",
    },
    {
        "slug": "remada-baixa-triangulo",
        "name": "Remada Baixa Sentado na Polia (Triângulo)",
        "muscle_group": "Costas",
        "secondary_muscles": "Bíceps, Romboides, Trapézio Médio",
        "equipment": "Polia / Cabo",
        "difficulty": "Iniciante",
        "mechanic": "Composto",
        "instructions": "Sente-se com os pés apoiados e coluna ereta. Puxe o puxador triângulo até o abdômen retraindo fortemente as escápulas e alongue de forma controlada na volta sem curvar a lombar.",
        "common_mistakes": "Transformar a remada em um movimento de balanço de lombar.",
    },
    {
        "slug": "remada-unilateral-halter-serrote",
        "name": "Remada Unilateral com Halter (Serrote)",
        "muscle_group": "Costas",
        "secondary_muscles": "Bíceps, Redondo Maior, Core",
        "equipment": "Halteres",
        "difficulty": "Intermediário",
        "mechanic": "Composto",
        "instructions": "Apoie um joelho e a mão no banco mantendo as costas paralelas ao solo. Puxe o halter em arco em direção ao quadril (e não ao ombro) para maximizar a ativação do grande dorsal.",
        "common_mistakes": "Girar o tronco excessivamente ou puxar o halter reto para cima usando só o bíceps.",
    },
    {
        "slug": "barra-fixa-pull-up",
        "name": "Barra Fixa (Pull-Up / Chin-Up)",
        "muscle_group": "Costas",
        "secondary_muscles": "Bíceps, Antebraço, Core",
        "equipment": "Peso Corporal",
        "difficulty": "Avançado",
        "mechanic": "Composto",
        "instructions": "Pendure-se na barra com braços estendidos, deprima as escápulas e puxe o corpo até o queixo ultrapassar a barra. Desça de forma controlada até o alongamento completo.",
        "common_mistakes": "Fazer meia repetição sem estender os braços ou chutar as pernas (kipping).",
    },
    {
        "slug": "pulldown-braco-reto-corda",
        "name": "Pulldown na Polia com Corda / Barra (Braços Estendidos)",
        "muscle_group": "Costas",
        "secondary_muscles": "Tríceps Cabeça Longa, Serrátil",
        "equipment": "Polia / Cabo",
        "difficulty": "Intermediário",
        "mechanic": "Isolado",
        "instructions": "Com o tronco levemente inclinado e cotovelos quase estendidos, puxe o cabo em arco até as coxas isolando o grande dorsal.",
        "common_mistakes": "Flexionar e estender os cotovelos transformando o exercício em tríceps na polia.",
    },
    # ==================== PERNAS & GLÚTEOS ====================
    {
        "slug": "agachamento-livre-barra",
        "name": "Agachamento Livre com Barra (Back Squat)",
        "muscle_group": "Pernas",
        "secondary_muscles": "Glúteos, Posterior de Coxa, Core, Lombar",
        "equipment": "Barra",
        "difficulty": "Avançado",
        "mechanic": "Composto",
        "instructions": "Apoie a barra no trapézio, pés na largura dos ombros. Inspire travando o core (bracing) e agache até pelo menos a linha paralela (90° ou mais), mantendo os joelhos alinhados à ponta dos pés.",
        "common_mistakes": "Valgo dinâmico (joelhos caindo para dentro) ou perder a curvatura neutra da lombar no fundo.",
    },
    {
        "slug": "leg-press-45",
        "name": "Leg Press 45°",
        "muscle_group": "Pernas",
        "secondary_muscles": "Glúteos, Posterior de Coxa",
        "equipment": "Máquina",
        "difficulty": "Iniciante",
        "mechanic": "Composto",
        "instructions": "Posicione os pés na plataforma na largura do quadril. Destrave a máquina e desça a plataforma em máxima amplitude sem tirar o quadril/lombar do banco. Empurre pelos calcanhares sem hiperestender os joelhos.",
        "common_mistakes": "Travar os joelhos no topo ou descolar o quadril do assento na descida.",
    },
    {
        "slug": "cadeira-extensora",
        "name": "Cadeira Extensora (Extensão de Pernas)",
        "muscle_group": "Pernas",
        "secondary_muscles": "Reto Femoral, Vasto Lateral e Medial",
        "equipment": "Máquina",
        "difficulty": "Iniciante",
        "mechanic": "Isolado",
        "instructions": "Ajuste o encosto para que o joelho fique alinhado ao eixo da máquina. Estenda completamente as pernas segurando 1 segundo no topo e desça controlando o peso.",
        "common_mistakes": "Chutar o peso usando impulso e soltar na descida.",
    },
    {
        "slug": "mesa-flexora",
        "name": "Mesa Flexora (ou Cadeira Flexora)",
        "muscle_group": "Pernas",
        "secondary_muscles": "Isquiotibiais (Posterior de Coxa), Panturrilhas",
        "equipment": "Máquina",
        "difficulty": "Iniciante",
        "mechanic": "Isolado",
        "instructions": "Mantenha o quadril pressionado contra o banco durante toda a série. Flexione os joelhos aproximando o rolo dos glúteos e retorne em 2-3 segundos.",
        "common_mistakes": "Levantar o quadril do banco ao subir a carga.",
    },
    {
        "slug": "stiff-barra-halteres",
        "name": "Stiff / Levantamento Terra Romeno (RDL)",
        "muscle_group": "Pernas",
        "secondary_muscles": "Glúteos, Lombar, Trapézio",
        "equipment": "Barra",
        "difficulty": "Intermediário",
        "mechanic": "Composto",
        "instructions": "Com joelhos levemente destravados, projete o quadril para trás mantendo a barra colada às coxas/canelas e a coluna neutra até sentir máximo alongamento nos posteriores de coxa. Suba contraindo glúteos e isquiotibiais.",
        "common_mistakes": "Afastar a barra das pernas ou curvar a coluna torácica/lombar.",
    },
    {
        "slug": "agachamento-bulgaro-halteres",
        "name": "Agachamento Búlgaro com Halteres",
        "muscle_group": "Pernas",
        "secondary_muscles": "Glúteos, Estabilizadores do Quadril",
        "equipment": "Halteres",
        "difficulty": "Avançado",
        "mechanic": "Composto",
        "instructions": "Apoie o peito do pé traseiro em um banco e desça verticalmente flexionando o joelho da frente. Incline levemente o tronco à frente se quiser maior ênfase no glúteo, ou mantenha ereto para focar no quadríceps.",
        "common_mistakes": "Empurrar com a perna de trás em vez de concentrar a força na perna da frente.",
    },
    {
        "slug": "agachamento-hack-machine",
        "name": "Agachamento no Hack Machine",
        "muscle_group": "Pernas",
        "secondary_muscles": "Glúteos",
        "equipment": "Máquina",
        "difficulty": "Intermediário",
        "mechanic": "Composto",
        "instructions": "Apoie toda a coluna no encosto, posicione os pés na plataforma e desça com controle até máxima flexão de joelhos confortável.",
        "common_mistakes": "Perder o apoio lombar ou subir na ponta dos pés.",
    },
    {
        "slug": "elevacao-pelvica-barra",
        "name": "Elevação Pélvica com Barra (Hip Thrust)",
        "muscle_group": "Glúteos",
        "secondary_muscles": "Posterior de Coxa, Core",
        "equipment": "Barra",
        "difficulty": "Intermediário",
        "mechanic": "Composto",
        "instructions": "Apoie a linha inferior das escápulas no banco, barra acolchoada sobre o quadril e pés firmes de modo que a tíbia fique vertical no topo. Suba o quadril contraindo os glúteos por 1-2s com queixo próximo ao peito.",
        "common_mistakes": "Hiperestender a lombar no topo em vez de fazer retroversão pélvica com o glúteo.",
    },
    {
        "slug": "cadeira-abdutora",
        "name": "Cadeira Abdutora",
        "muscle_group": "Glúteos",
        "secondary_muscles": "Glúteo Médio e Mínimo",
        "equipment": "Máquina",
        "difficulty": "Iniciante",
        "mechanic": "Isolado",
        "instructions": "Apoie o quadril no assento e afaste as pernas contra a resistência segurando 1 segundo na abertura máxima.",
        "common_mistakes": "Usar impulso excessivo sem controlar o fechamento.",
    },
    {
        "slug": "panturrilha-em-pe-maquina",
        "name": "Panturrilha em Pé na Máquina (ou Smith)",
        "muscle_group": "Pernas",
        "secondary_muscles": "Gastrocnêmio, Sóleo",
        "equipment": "Máquina",
        "difficulty": "Iniciante",
        "mechanic": "Isolado",
        "instructions": "Apoie a ponta dos pés na plataforma, alongue completamente o calcanhar para baixo por 1 segundo e suba até a contração máxima na ponta dos pés.",
        "common_mistakes": "Quicar em repetições curtas e rápidas (tendão de Aquiles faz o trabalho elástico em vez do músculo).",
    },
    # ==================== OMBROS ====================
    {
        "slug": "desenvolvimento-halteres",
        "name": "Desenvolvimento de Ombros com Halteres",
        "muscle_group": "Ombros",
        "secondary_muscles": "Tríceps, Trapézio Superior",
        "equipment": "Halteres",
        "difficulty": "Intermediário",
        "mechanic": "Composto",
        "instructions": "Sentado em banco a 75-85°, posicione os halteres na linha das orelhas com cotovelos levemente à frente do tronco (plano escapular) e empurre acima da cabeça.",
        "common_mistakes": "Arquear excessivamente a lombar ou bater os halteres no topo.",
    },
    {
        "slug": "elevacao-lateral-halteres",
        "name": "Elevação Lateral com Halteres",
        "muscle_group": "Ombros",
        "secondary_muscles": "Trapézio Superior",
        "equipment": "Halteres",
        "difficulty": "Iniciante",
        "mechanic": "Isolado",
        "instructions": "Em pé, com cotovelos semiflexionados, eleve os halteres lateralmente no plano escapular (~15-20° à frente) até a altura dos ombros, guiando o movimento pelos cotovelos.",
        "common_mistakes": "Encolher o trapézio junto ou balançar o quadril para roubar com carga excessiva.",
    },
    {
        "slug": "elevacao-lateral-polia",
        "name": "Elevação Lateral Unilateral na Polia Baixa",
        "muscle_group": "Ombros",
        "secondary_muscles": "Deltoide Lateral",
        "equipment": "Polia / Cabo",
        "difficulty": "Intermediário",
        "mechanic": "Isolado",
        "instructions": "Segure na coluna do crossover para estabilizar e eleve o cabo lateralmente mantendo tensão constante desde o início do movimento (onde o halter não gera torque).",
        "common_mistakes": "Girar o tronco para puxar o cabo.",
    },
    {
        "slug": "crucifixo-invertido-maquina",
        "name": "Crucifixo Invertido na Máquina (Posterior de Ombro)",
        "muscle_group": "Ombros",
        "secondary_muscles": "Romboides, Trapézio Médio",
        "equipment": "Máquina",
        "difficulty": "Iniciante",
        "mechanic": "Isolado",
        "instructions": "Sentado de frente para o encosto do Peck Deck, afaste os braços para trás mantendo os ombros baixos (deprimidos) para isolar o deltoide posterior.",
        "common_mistakes": "Unir demais as escápulas no início roubando com o trapézio.",
    },
    {
        "slug": "face-pull-polia-corda",
        "name": "Face Pull na Polia com Corda",
        "muscle_group": "Ombros",
        "secondary_muscles": "Manguito Rotador, Trapézio Médio/Inferior",
        "equipment": "Polia / Cabo",
        "difficulty": "Iniciante",
        "mechanic": "Composto",
        "instructions": "Posicione a polia na altura do rosto e puxe a corda em direção à testa fazendo rotação externa dos ombros (punhos terminam atrás da linha dos cotovelos).",
        "common_mistakes": "Puxar em direção ao peito ou usar carga pesada demais perdendo a rotação externa.",
    },
    {
        "slug": "encolhimento-ombros-halteres",
        "name": "Encolhimento de Ombros (Trapézio) com Halteres ou Barra",
        "muscle_group": "Ombros",
        "secondary_muscles": "Trapézio Superior, Antebraço",
        "equipment": "Halteres",
        "difficulty": "Iniciante",
        "mechanic": "Isolado",
        "instructions": "Segure os pesos ao lado do corpo e eleve os ombros em direção às orelhas segurando 1-2s no topo antes de alongar.",
        "common_mistakes": "Girar os ombros em círculos (desnecessário e sobrecarrega a articulação).",
    },
    # ==================== BÍCEPS & ANTEBRAÇO ====================
    {
        "slug": "rosca-direta-barra-w",
        "name": "Rosca Direta com Barra W (ou Reta)",
        "muscle_group": "Bíceps",
        "secondary_muscles": "Braquial, Antebraço",
        "equipment": "Barra W",
        "difficulty": "Iniciante",
        "mechanic": "Isolado",
        "instructions": "Mantenha os cotovelos fixos ao lado das costelas e flexione os braços subindo a barra até a contração máxima do bíceps, controlando a descida em 2 segundos.",
        "common_mistakes": "Jogar os cotovelos para frente ou balançar a lombar para subir a barra.",
    },
    {
        "slug": "rosca-alternada-halteres",
        "name": "Rosca Alternada (ou Simultânea) com Halteres",
        "muscle_group": "Bíceps",
        "secondary_muscles": "Braquiorradial, Braquial",
        "equipment": "Halteres",
        "difficulty": "Iniciante",
        "mechanic": "Isolado",
        "instructions": "Suba o halter fazendo a supinação do punho (girando a palma da mão para cima) para ativar todas as funções do bíceps braquial.",
        "common_mistakes": "Descer um braço enquanto sobe o outro usando gangorra do tronco.",
    },
    {
        "slug": "rosca-inclinada-halteres",
        "name": "Rosca no Banco Inclinado 45° com Halteres",
        "muscle_group": "Bíceps",
        "secondary_muscles": "Cabeça Longa do Bíceps",
        "equipment": "Halteres",
        "difficulty": "Intermediário",
        "mechanic": "Isolado",
        "instructions": "Deitado no banco a 45-60°, deixe os braços alongarem atrás da linha do tronco. Flexione os cotovelos sem levá-los para frente, focando no estiramento máximo da cabeça longa.",
        "common_mistakes": "Trazer o cotovelo para frente na subida perdendo a vantagem mecânica do banco inclinado.",
    },
    {
        "slug": "rosca-scott-maquina-barra",
        "name": "Rosca Scott (Máquina ou Barra W)",
        "muscle_group": "Bíceps",
        "secondary_muscles": "Cabeça Curta do Bíceps, Braquial",
        "equipment": "Máquina",
        "difficulty": "Iniciante",
        "mechanic": "Isolado",
        "instructions": "Apoie toda a parte posterior dos braços no banco Scott sem deixar espaço nas axilas. Desça até quase estender e suba contraindo o bíceps.",
        "common_mistakes": "Levantar o quadril do assento para facilitar a subida no ponto mais difícil.",
    },
    {
        "slug": "rosca-martelo-halteres",
        "name": "Rosca Martelo com Halteres (ou Corda)",
        "muscle_group": "Bíceps",
        "secondary_muscles": "Braquial, Braquiorradial (Antebraço)",
        "equipment": "Halteres",
        "difficulty": "Iniciante",
        "mechanic": "Isolado",
        "instructions": "Com pegada neutra (palmas voltadas uma para a outra), flexione os cotovelos trabalhando intensamente o músculo braquial e a espessura do antebraço.",
        "common_mistakes": "Balançar o corpo ou encurtar a fase excêntrica.",
    },
    {
        "slug": "rosca-punho-antebraco",
        "name": "Flexão de Punho / Rosca Inversa (Antebraços)",
        "muscle_group": "Antebraço",
        "secondary_muscles": "Flexores e Extensores do Carpo",
        "equipment": "Barra",
        "difficulty": "Iniciante",
        "mechanic": "Isolado",
        "instructions": "Apoie os antebraços no banco com os punhos livres e realize a flexão completa dos punhos em alta repetição (12-20 reps).",
        "common_mistakes": "Tirar o antebraço do banco durante a série.",
    },
    # ==================== TRÍCEPS ====================
    {
        "slug": "triceps-polia-corda",
        "name": "Tríceps na Polia com Corda (Pushdown)",
        "muscle_group": "Tríceps",
        "secondary_muscles": "Cabeça Lateral e Medial do Tríceps",
        "equipment": "Polia / Cabo",
        "difficulty": "Iniciante",
        "mechanic": "Isolado",
        "instructions": "Mantenha os cotovelos colados ao tronco e estenda completamente os antebraços para baixo, abrindo as pontas da corda no final para máxima contração.",
        "common_mistakes": "Mover os cotovelos para cima e para frente na fase excêntrica.",
    },
    {
        "slug": "triceps-polia-barra-reta-w",
        "name": "Tríceps na Polia com Barra Reta ou W",
        "muscle_group": "Tríceps",
        "secondary_muscles": "Cabeça Lateral do Tríceps",
        "equipment": "Polia / Cabo",
        "difficulty": "Iniciante",
        "mechanic": "Isolado",
        "instructions": "Incline levemente o tronco à frente, mantenha os cotovelos fixos e empurre a barra até a extensão total dos cotovelos.",
        "common_mistakes": "Subir os ombros e jogar o peso do corpo sobre a barra.",
    },
    {
        "slug": "triceps-frances-polia-halter",
        "name": "Tríceps Francês / Overhead na Polia com Corda (ou Halter)",
        "muscle_group": "Tríceps",
        "secondary_muscles": "Cabeça Longa do Tríceps",
        "equipment": "Polia / Cabo",
        "difficulty": "Intermediário",
        "mechanic": "Isolado",
        "instructions": "Com os braços elevados acima/à frente da cabeça, flexione os cotovelos alongando profundamente a cabeça longa do tríceps e estenda sem mover o úmero.",
        "common_mistakes": "Hiperestender a coluna lombar por falta de estabilidade no core.",
    },
    {
        "slug": "triceps-testa-barra-w",
        "name": "Tríceps Testa com Barra W (ou Halteres)",
        "muscle_group": "Tríceps",
        "secondary_muscles": "Tríceps Completo",
        "equipment": "Barra W",
        "difficulty": "Intermediário",
        "mechanic": "Isolado",
        "instructions": "Deitado no banco, mantenha os braços levemente inclinados para trás da linha da cabeça (para manter tensão no topo) e flexione os cotovelos levando a barra em direção à testa/topo da cabeça.",
        "common_mistakes": "Abrir demais os cotovelos ou deixar os braços a 90° perdendo tensão no topo.",
    },
    {
        "slug": "mergulho-paralelas-dips",
        "name": "Mergulho nas Paralelas (Dips) ou Máquina",
        "muscle_group": "Tríceps",
        "secondary_muscles": "Peitoral Inferior, Deltoide Anterior",
        "equipment": "Peso Corporal",
        "difficulty": "Intermediário",
        "mechanic": "Composto",
        "instructions": "Mantenha o tronco mais vertical e cotovelos próximos ao corpo para focar no tríceps (ou incline à frente para focar no peito). Desça até ~90° de flexão de cotovelo e empurre.",
        "common_mistakes": "Descer além da mobilidade segura do ombro com os ombros elevados.",
    },
    # ==================== ABDÔMEN & CORE ====================
    {
        "slug": "abdominal-infra-barra-paralela",
        "name": "Elevação de Pernas na Barra Fixa ou Paralela (Infra)",
        "muscle_group": "Abdômen",
        "secondary_muscles": "Oblíquos, Flexores do Quadril",
        "equipment": "Peso Corporal",
        "difficulty": "Intermediário",
        "mechanic": "Composto",
        "instructions": "Pendurado na barra ou apoiado na paralela, eleve os joelhos/pernas enrolando a pelve para cima (retroversão pélvica) para realmente contrair o reto abdominal.",
        "common_mistakes": "Apenas balançar as pernas até 90° sem enrolar o quadril (trabalhando só iliopsoas).",
    },
    {
        "slug": "abdominal-crunch-polia-maquina",
        "name": "Abdominal Crunch na Polia Alta (ou Máquina)",
        "muscle_group": "Abdômen",
        "secondary_muscles": "Reto Abdominal",
        "equipment": "Polia / Cabo",
        "difficulty": "Iniciante",
        "mechanic": "Isolado",
        "instructions": "Ajoelhado com a corda atrás da nuca/testa, flexione a coluna aproximando as costelas da pelve com sobrecarga progressiva, mantendo o quadril parado.",
        "common_mistakes": "Sentar nos calcanhares usando o peso do quadril em vez de dobrar a coluna abdominal.",
    },
    {
        "slug": "prancha-abdominal-isometrica",
        "name": "Prancha Abdominal Isométrica (ou Roda Abdominal)",
        "muscle_group": "Abdômen",
        "secondary_muscles": "Transverso do Abdômen, Lombar, Glúteos",
        "equipment": "Peso Corporal",
        "difficulty": "Iniciante",
        "mechanic": "Isolado",
        "instructions": "Apoie os antebraços e pontas dos pés no solo, alinhe cabeça, coluna e quadril, contraindo intensamente abdômen e glúteos pelo tempo estipulado.",
        "common_mistakes": "Deixar a lombar afundar ou levantar demais o quadril.",
    },
]


def _slugify(text: str) -> str:
    clean = re.sub(r"[^a-zA-Z0-9]+", "-", text.lower()).strip("-")
    return clean or f"exercicio-{int(datetime.now().timestamp())}"


EXERCISE_LIBRARY_SEEDED_FLAG = "seeded_exercise_library"


def ensure_exercise_library_seeded(db: Session) -> None:
    """Popula a Biblioteca de Exercícios uma única vez (na inicialização do backend).

    Depois disso não recria nada: exercícios que você excluir continuam excluídos.
    """
    from sqlalchemy.exc import IntegrityError

    from app.services.app_settings_store import get_setting, set_setting

    if get_setting(db, EXERCISE_LIBRARY_SEEDED_FLAG) == "1":
        return
    existing_slugs = {row[0] for row in db.query(WorkoutExercise.slug).all()}
    added = False
    for item in SMARTWORKOUT_EXERCISE_CATALOG:
        if item["slug"] not in existing_slugs:
            db.add(
                WorkoutExercise(
                    slug=item["slug"],
                    name=item["name"],
                    muscle_group=item["muscle_group"],
                    secondary_muscles=item.get("secondary_muscles"),
                    equipment=item["equipment"],
                    difficulty=item.get("difficulty", "Intermediário"),
                    mechanic=item.get("mechanic", "Composto"),
                    instructions=item["instructions"],
                    common_mistakes=item.get("common_mistakes"),
                    video_url=SMARTWORKOUT_URL,
                    is_custom=False,
                )
            )
            added = True
    if added:
        try:
            db.commit()
        except IntegrityError:
            # Outro processo inseriu ao mesmo tempo: o que importa é que a biblioteca existe
            db.rollback()
    set_setting(db, EXERCISE_LIBRARY_SEEDED_FLAG, "1")


def _parse_first_int(reps_val: Any, default: int = 10) -> int:
    if isinstance(reps_val, int):
        return max(1, reps_val)
    s = str(reps_val or "")
    m = re.search(r"(\d+)", s)
    return max(1, int(m.group(1))) if m else default


def _compute_session_metrics(exercises_raw: list[dict[str, Any]]) -> tuple[int, int, int, float, float, list[dict[str, Any]]]:
    """
    Calcula (exercises_count, total_sets, total_reps, total_volume_kg, max_weight_kg, normalized_list)
    a partir da lista de exercícios realizados no treino.
    """
    normalized: list[dict[str, Any]] = []
    total_sets = 0
    total_reps = 0
    total_volume = 0.0
    session_max_weight = 0.0

    for ex in exercises_raw:
        ex_name = str(ex.get("exercise_name") or ex.get("name") or "Exercício").strip()
        if not ex_name:
            continue
        muscle = str(ex.get("muscle_group") or "Geral").strip()
        equipment = str(ex.get("equipment") or "Halteres").strip()
        sets_count = max(1, int(ex.get("sets_count") or ex.get("sets") or 3))
        reps_str = str(ex.get("reps") or "10").strip()
        reps_int = _parse_first_int(reps_str, 10)
        base_weight = float(ex.get("weight_kg") or 0.0)

        set_details_in = ex.get("set_details") or []
        set_details_out: list[dict[str, Any]] = []
        ex_volume = 0.0
        ex_max_w = base_weight

        if set_details_in and isinstance(set_details_in, list):
            sets_count = len(set_details_in)
            for idx, sd in enumerate(set_details_in, start=1):
                s_reps = max(1, int(sd.get("reps") or reps_int))
                s_w = float(sd.get("weight_kg") if sd.get("weight_kg") is not None else base_weight)
                ex_max_w = max(ex_max_w, s_w)
                ex_volume += s_w * s_reps
                total_reps += s_reps
                set_details_out.append(
                    {
                        "set_number": int(sd.get("set_number") or idx),
                        "reps": s_reps,
                        "weight_kg": round(s_w, 2),
                        "rir": sd.get("rir"),
                        "is_warmup": bool(sd.get("is_warmup", False)),
                    }
                )
        else:
            for idx in range(1, sets_count + 1):
                set_details_out.append(
                    {
                        "set_number": idx,
                        "reps": reps_int,
                        "weight_kg": round(base_weight, 2),
                        "rir": None,
                        "is_warmup": False,
                    }
                )
            total_reps += sets_count * reps_int
            ex_volume = sets_count * reps_int * base_weight

        if ex.get("max_weight_kg") is not None:
            ex_max_w = max(ex_max_w, float(ex["max_weight_kg"]))

        total_sets += sets_count
        total_volume += ex_volume
        session_max_weight = max(session_max_weight, ex_max_w)

        normalized.append(
            {
                "exercise_id": ex.get("exercise_id"),
                "exercise_name": ex_name,
                "muscle_group": muscle,
                "equipment": equipment,
                "sets_count": sets_count,
                "reps": reps_str,
                "weight_kg": round(base_weight if base_weight > 0 else ex_max_w, 2),
                "max_weight_kg": round(ex_max_w, 2),
                "set_details": set_details_out,
                "volume_kg": round(ex_volume, 2),
                "notes": ex.get("notes"),
            }
        )

    return (
        len(normalized),
        total_sets,
        total_reps,
        round(total_volume, 2),
        round(session_max_weight, 2),
        normalized,
    )


def _compute_exercise_stats_map(sessions: list[WorkoutSession]) -> dict[str, dict[str, Any]]:
    """
    Calcula PR (Maior Carga), 1RM estimado (Epley), última carga e frequência
    para cada exercício a partir das sessões registradas.
    """
    stats: dict[str, dict[str, Any]] = {}
    # Ordena das mais antigas para as mais recentes para que last_weight_kg seja a última data
    sorted_sessions = sorted(sessions, key=lambda s: (s.session_date or "", s.id or 0))
    for sess in sorted_sessions:
        for ex in sess.exercises_performed or []:
            name = str(ex.get("exercise_name") or "").strip()
            if not name:
                continue
            key = name.lower()
            w = float(ex.get("max_weight_kg") or ex.get("weight_kg") or 0.0)
            reps = _parse_first_int(ex.get("reps"), 10)
            # Verifica também set_details para pegar o melhor 1RM
            best_1rm = round(w * (1.0 + min(reps, 15) / 30.0), 1) if w > 0 else 0.0
            for sd in ex.get("set_details") or []:
                sw = float(sd.get("weight_kg") or 0.0)
                sr = int(sd.get("reps") or reps)
                w = max(w, sw)
                if sw > 0:
                    best_1rm = max(best_1rm, round(sw * (1.0 + min(sr, 15) / 30.0), 1))

            entry = stats.get(key)
            if not entry:
                entry = {
                    "exercise_name": name,
                    "muscle_group": ex.get("muscle_group") or "Geral",
                    "equipment": ex.get("equipment") or "Halteres",
                    "personal_record_kg": w,
                    "best_reps": reps,
                    "last_weight_kg": w,
                    "last_trained_date": sess.session_date,
                    "estimated_1rm_kg": best_1rm,
                    "times_trained": 1,
                }
                stats[key] = entry
            else:
                if w >= entry["personal_record_kg"]:
                    entry["personal_record_kg"] = w
                    entry["best_reps"] = reps
                entry["last_weight_kg"] = w
                entry["last_trained_date"] = sess.session_date
                entry["estimated_1rm_kg"] = max(entry["estimated_1rm_kg"], best_1rm)
                entry["times_trained"] += 1

    return stats


@router.get("/exercises", response_model=list[WorkoutExerciseOut])
def list_exercises(
    muscle_group: Optional[str] = Query(default=None),
    equipment: Optional[str] = Query(default=None),
    q: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
):
    ensure_exercise_library_seeded(db)
    query = db.query(WorkoutExercise)
    if muscle_group and muscle_group.lower() != "todos":
        query = query.filter(WorkoutExercise.muscle_group == muscle_group)
    if equipment and equipment.lower() != "todos":
        query = query.filter(WorkoutExercise.equipment == equipment)
    if q:
        like_q = f"%{q.strip()}%"
        query = query.filter(
            (WorkoutExercise.name.ilike(like_q))
            | (WorkoutExercise.muscle_group.ilike(like_q))
            | (WorkoutExercise.secondary_muscles.ilike(like_q))
            | (WorkoutExercise.equipment.ilike(like_q))
        )

    exercises = query.order_by(WorkoutExercise.muscle_group.asc(), WorkoutExercise.name.asc()).all()
    sessions = db.query(WorkoutSession).all()
    stats_map = _compute_exercise_stats_map(sessions)

    out: list[WorkoutExerciseOut] = []
    for ex in exercises:
        st = stats_map.get(ex.name.lower(), {})
        out.append(
            WorkoutExerciseOut(
                id=ex.id,
                slug=ex.slug,
                name=ex.name,
                muscle_group=ex.muscle_group,
                secondary_muscles=ex.secondary_muscles,
                equipment=ex.equipment,
                difficulty=ex.difficulty,
                mechanic=ex.mechanic,
                instructions=ex.instructions,
                common_mistakes=ex.common_mistakes,
                video_url=ex.video_url or SMARTWORKOUT_URL,
                image_urls=ex.image_urls or [],
                is_custom=bool(ex.is_custom),
                personal_record_kg=float(st.get("personal_record_kg", 0.0)),
                last_weight_kg=float(st.get("last_weight_kg", 0.0)),
                last_trained_date=st.get("last_trained_date"),
                estimated_1rm_kg=float(st.get("estimated_1rm_kg", 0.0)),
                times_trained=int(st.get("times_trained", 0)),
                created_at=ex.created_at,
            )
        )
    return out


@router.post("/exercises", response_model=WorkoutExerciseOut)
def create_custom_exercise(payload: WorkoutExerciseCreate, db: Session = Depends(get_db)):
    ensure_exercise_library_seeded(db)
    base_slug = _slugify(payload.name)
    slug = base_slug
    counter = 2
    while db.query(WorkoutExercise).filter(WorkoutExercise.slug == slug).first():
        slug = f"{base_slug}-{counter}"
        counter += 1

    ex = WorkoutExercise(
        slug=slug,
        name=payload.name.strip(),
        muscle_group=payload.muscle_group.strip(),
        secondary_muscles=payload.secondary_muscles,
        equipment=payload.equipment.strip(),
        difficulty=payload.difficulty,
        mechanic=payload.mechanic,
        instructions=payload.instructions.strip(),
        common_mistakes=payload.common_mistakes,
        video_url=payload.video_url or SMARTWORKOUT_URL,
        image_urls=[u.strip() for u in payload.image_urls if u.strip()] or None,
        is_custom=True,
    )
    db.add(ex)
    db.commit()
    db.refresh(ex)
    return WorkoutExerciseOut(
        id=ex.id,
        slug=ex.slug,
        name=ex.name,
        muscle_group=ex.muscle_group,
        secondary_muscles=ex.secondary_muscles,
        equipment=ex.equipment,
        difficulty=ex.difficulty,
        mechanic=ex.mechanic,
        instructions=ex.instructions,
        common_mistakes=ex.common_mistakes,
        video_url=ex.video_url,
        image_urls=ex.image_urls or [],
        is_custom=True,
        created_at=ex.created_at,
    )


@router.delete("/exercises/{exercise_id}")
def delete_exercise(exercise_id: int, db: Session = Depends(get_db)):
    ex = db.query(WorkoutExercise).filter(WorkoutExercise.id == exercise_id).first()
    if not ex:
        raise HTTPException(status_code=404, detail="Exercício não encontrado")
    db.delete(ex)
    db.commit()
    return {"status": "deleted", "id": exercise_id}


# ==================== FICHAS / PLANOS DE TREINO ====================
@router.get("/plans", response_model=list[WorkoutPlanOut])
def list_workout_plans(db: Session = Depends(get_db)):
    ensure_exercise_library_seeded(db)
    return db.query(WorkoutPlan).order_by(WorkoutPlan.active.desc(), WorkoutPlan.id.desc()).all()


@router.post("/plans", response_model=WorkoutPlanOut)
def create_workout_plan(payload: WorkoutPlanCreate, db: Session = Depends(get_db)):
    plan = WorkoutPlan(
        title=payload.title.strip(),
        split_label=payload.split_label.strip(),
        target_muscles=payload.target_muscles.strip(),
        goal=payload.goal.strip(),
        scheduled_days=payload.scheduled_days,
        estimated_duration_min=payload.estimated_duration_min,
        created_by_agent=payload.created_by_agent,
        notes=payload.notes,
        exercises=[e.model_dump() for e in payload.exercises],
        active=payload.active,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.put("/plans/{plan_id}", response_model=WorkoutPlanOut)
def update_workout_plan(plan_id: int, payload: WorkoutPlanUpdate, db: Session = Depends(get_db)):
    plan = db.query(WorkoutPlan).filter(WorkoutPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Ficha de treino não encontrada")
    data = payload.model_dump(exclude_unset=True)
    if "exercises" in data and data["exercises"] is not None:
        plan.exercises = [
            e.model_dump() if hasattr(e, "model_dump") else dict(e) for e in data.pop("exercises")
        ]
    for k, v in data.items():
        setattr(plan, k, v)
    plan.updated_at = utcnow()
    db.commit()
    db.refresh(plan)
    return plan


@router.delete("/plans/{plan_id}")
def delete_workout_plan(plan_id: int, db: Session = Depends(get_db)):
    plan = db.query(WorkoutPlan).filter(WorkoutPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Ficha de treino não encontrada")
    db.delete(plan)
    db.commit()
    return {"status": "deleted", "id": plan_id}


# ==================== SESSÕES / DIÁRIO DE TREINOS REALIZADOS ====================
@router.get("/sessions", response_model=list[WorkoutSessionOut])
def list_workout_sessions(db: Session = Depends(get_db)):
    return (
        db.query(WorkoutSession)
        .order_by(WorkoutSession.session_date.desc(), WorkoutSession.id.desc())
        .all()
    )


@router.post("/sessions", response_model=WorkoutSessionOut)
def create_workout_session(payload: WorkoutSessionCreate, db: Session = Depends(get_db)):
    raw_ex = [e.model_dump() for e in payload.exercises_performed]
    ex_count, tot_sets, tot_reps, tot_vol, max_w, norm_ex = _compute_session_metrics(raw_ex)

    inferred_muscles = payload.muscle_groups
    if not inferred_muscles and norm_ex:
        unique_m = []
        for item in norm_ex:
            mg = item.get("muscle_group")
            if mg and mg not in unique_m:
                unique_m.append(mg)
        inferred_muscles = ", ".join(unique_m)

    sess = WorkoutSession(
        session_date=payload.session_date,
        title=payload.title.strip(),
        plan_id=payload.plan_id,
        muscle_groups=inferred_muscles or "Treino Geral",
        duration_minutes=payload.duration_minutes,
        perceived_effort=payload.perceived_effort,
        exercises_count=ex_count,
        total_sets=tot_sets,
        total_reps=tot_reps,
        total_volume_kg=tot_vol,
        max_weight_kg=max_w,
        exercises_performed=norm_ex,
        notes=payload.notes,
    )
    db.add(sess)
    db.commit()
    db.refresh(sess)
    return sess


@router.put("/sessions/{session_id}", response_model=WorkoutSessionOut)
def update_workout_session(
    session_id: int, payload: WorkoutSessionUpdate, db: Session = Depends(get_db)
):
    sess = db.query(WorkoutSession).filter(WorkoutSession.id == session_id).first()
    if not sess:
        raise HTTPException(status_code=404, detail="Treino registrado não encontrado")

    data = payload.model_dump(exclude_unset=True)
    if "exercises_performed" in data and data["exercises_performed"] is not None:
        raw_ex = [
            e.model_dump() if hasattr(e, "model_dump") else dict(e)
            for e in data.pop("exercises_performed")
        ]
        ex_count, tot_sets, tot_reps, tot_vol, max_w, norm_ex = _compute_session_metrics(raw_ex)
        sess.exercises_count = ex_count
        sess.total_sets = tot_sets
        sess.total_reps = tot_reps
        sess.total_volume_kg = tot_vol
        sess.max_weight_kg = max_w
        sess.exercises_performed = norm_ex

    for k, v in data.items():
        setattr(sess, k, v)
    db.commit()
    db.refresh(sess)
    return sess


@router.delete("/sessions/{session_id}")
def delete_workout_session(session_id: int, db: Session = Depends(get_db)):
    sess = db.query(WorkoutSession).filter(WorkoutSession.id == session_id).first()
    if not sess:
        raise HTTPException(status_code=404, detail="Treino registrado não encontrado")
    db.delete(sess)
    db.commit()
    return {"status": "deleted", "id": session_id}


# ==================== RESUMO & MÉTRICAS DE EVOLUÇÃO DE TREINO ====================
@router.get("/summary")
def get_workouts_summary(db: Session = Depends(get_db)):
    ensure_exercise_library_seeded(db)
    sessions = (
        db.query(WorkoutSession)
        .order_by(WorkoutSession.session_date.desc(), WorkoutSession.id.desc())
        .all()
    )
    plans = db.query(WorkoutPlan).order_by(WorkoutPlan.active.desc(), WorkoutPlan.id.desc()).all()
    library_count = db.query(WorkoutExercise).count()

    now = datetime.now()
    current_month_prefix = now.strftime("%Y-%m")
    start_of_week = (now - timedelta(days=now.weekday())).strftime("%Y-%m-%d")

    trained_dates_map: dict[str, list[dict[str, Any]]] = {}
    for s in sessions:
        d = s.session_date or ""
        if d:
            trained_dates_map.setdefault(d, []).append(
                {
                    "id": s.id,
                    "title": s.title,
                    "muscle_groups": s.muscle_groups,
                    "exercises_count": s.exercises_count,
                    "total_sets": s.total_sets,
                    "max_weight_kg": s.max_weight_kg,
                    "total_volume_kg": s.total_volume_kg,
                }
            )

    unique_dates = sorted(trained_dates_map.keys(), reverse=True)
    days_this_month = [d for d in unique_dates if d.startswith(current_month_prefix)]
    days_this_week = [d for d in unique_dates if d >= start_of_week]

    total_exercises_done = sum(s.exercises_count or 0 for s in sessions)
    exercises_done_this_month = sum(
        (s.exercises_count or 0)
        for s in sessions
        if (s.session_date or "").startswith(current_month_prefix)
    )
    total_sets_done = sum(s.total_sets or 0 for s in sessions)
    total_volume_kg = round(sum(s.total_volume_kg or 0.0 for s in sessions), 2)

    stats_map = _compute_exercise_stats_map(sessions)
    personal_records = sorted(
        stats_map.values(),
        key=lambda x: (x["personal_record_kg"], x["estimated_1rm_kg"]),
        reverse=True,
    )

    heaviest_lift = personal_records[0] if personal_records else None

    # Breakdown por grupo muscular
    mg_map: dict[str, dict[str, Any]] = {}
    for s in sessions:
        for ex in s.exercises_performed or []:
            mg = str(ex.get("muscle_group") or "Geral")
            entry = mg_map.setdefault(
                mg,
                {
                    "muscle_group": mg,
                    "exercises_done": 0,
                    "sets_done": 0,
                    "volume_kg": 0.0,
                    "max_weight_kg": 0.0,
                },
            )
            entry["exercises_done"] += 1
            entry["sets_done"] += int(ex.get("sets_count") or 0)
            entry["volume_kg"] = round(entry["volume_kg"] + float(ex.get("volume_kg") or 0.0), 2)
            entry["max_weight_kg"] = max(
                entry["max_weight_kg"],
                float(ex.get("max_weight_kg") or ex.get("weight_kg") or 0.0),
            )

    muscle_group_breakdown = sorted(
        mg_map.values(), key=lambda x: x["sets_done"], reverse=True
    )

    return {
        "total_sessions": len(sessions),
        "days_trained_total": len(unique_dates),
        "days_trained_this_month": len(days_this_month),
        "days_trained_this_week": len(days_this_week),
        "trained_dates": unique_dates,
        "trained_dates_detail": trained_dates_map,
        "total_exercises_done": total_exercises_done,
        "exercises_done_this_month": exercises_done_this_month,
        "total_sets_done": total_sets_done,
        "total_volume_kg": total_volume_kg,
        "heaviest_lift": heaviest_lift,
        "personal_records": personal_records[:20],
        "muscle_group_breakdown": muscle_group_breakdown,
        "library_count": library_count,
        "active_plans_count": sum(1 for p in plans if p.active),
        "plans": [WorkoutPlanOut.model_validate(p).model_dump() for p in plans],
        "recent_sessions": [WorkoutSessionOut.model_validate(s).model_dump() for s in sessions[:30]],
    }


# ==================== GERADOR DE FICHAS COM AGENTE IA ====================
def generate_structured_workout_plans_fallback(
    db: Session,
    req: AIWorkoutGenerateRequest,
    agent_name: str = "SmartWorkout Coach IA",
) -> list[WorkoutPlan]:
    """
    Constrói fichas completas de treino usando os exercícios da Biblioteca SmartWorkout
    de acordo com a divisão (ABC, ABCD, Push/Pull/Legs, Upper/Lower, Full Body ou Ficha Específica),
    equipamento disponível e objetivo do usuário.
    """
    ensure_exercise_library_seeded(db)
    all_exercises = db.query(WorkoutExercise).all()

    # Filtra por equipamento caso o usuário treine em casa ou só com pesos livres
    eq_pref = (req.available_equipment or "Academia Completa").lower()
    if "casa" in eq_pref or "corporal" in eq_pref:
        allowed_eq = {"Peso Corporal", "Halteres"}
    elif "halter" in eq_pref or "livre" in eq_pref:
        allowed_eq = {"Halteres", "Barra", "Barra W", "Peso Corporal"}
    else:
        allowed_eq = None

    def pick_exercises(muscle: str, count: int) -> list[WorkoutExercise]:
        pool = [
            e
            for e in all_exercises
            if e.muscle_group.lower() == muscle.lower()
            and (allowed_eq is None or e.equipment in allowed_eq)
        ]
        if not pool:
            pool = [e for e in all_exercises if e.muscle_group.lower() == muscle.lower()]
        return pool[:count]

    is_strength = "força" in req.goal.lower() or "forca" in req.goal.lower()
    compound_reps = "5-6" if is_strength else "8-10"
    iso_reps = "8-10" if is_strength else "10-15"
    compound_rest = 150 if is_strength else 90
    iso_rest = 90 if is_strength else 60

    def to_plan_item(ex: WorkoutExercise, sets: int = 4, is_iso: bool = False) -> dict[str, Any]:
        return {
            "exercise_id": ex.id,
            "exercise_name": ex.name,
            "muscle_group": ex.muscle_group,
            "equipment": ex.equipment,
            "sets": sets,
            "reps": iso_reps if is_iso else compound_reps,
            "target_weight_kg": 0.0,
            "rest_seconds": iso_rest if is_iso else compound_rest,
            "rir": "1-2 RIR",
            "notes": (ex.instructions[:120] + "...") if len(ex.instructions) > 120 else ex.instructions,
        }

    split_upper = req.split_type.strip().upper()
    templates: list[dict[str, Any]] = []

    if "UPPER" in split_upper or "SUPERIOR" in split_upper:
        templates = [
            {
                "title": f"Upper A — Superiores Completo ({req.goal})",
                "split_label": "Upper/Lower",
                "target_muscles": "Peito, Costas, Ombros, Bíceps, Tríceps",
                "scheduled_days": "Seg, Qui",
                "items": (
                    [to_plan_item(e, 4) for e in pick_exercises("Peito", 2)]
                    + [to_plan_item(e, 4) for e in pick_exercises("Costas", 2)]
                    + [to_plan_item(e, 3, True) for e in pick_exercises("Ombros", 2)]
                    + [to_plan_item(e, 3, True) for e in pick_exercises("Bíceps", 1)]
                    + [to_plan_item(e, 3, True) for e in pick_exercises("Tríceps", 1)]
                ),
            },
            {
                "title": f"Lower B — Inferiores, Glúteos & Core ({req.goal})",
                "split_label": "Upper/Lower",
                "target_muscles": "Pernas, Glúteos, Abdômen",
                "scheduled_days": "Ter, Sex",
                "items": (
                    [to_plan_item(e, 4) for e in pick_exercises("Pernas", 4)]
                    + [to_plan_item(e, 4) for e in pick_exercises("Glúteos", 2)]
                    + [to_plan_item(e, 3, True) for e in pick_exercises("Abdômen", 2)]
                ),
            },
        ]
    elif "FULL" in split_upper:
        templates = [
            {
                "title": f"Full Body — Corpo Inteiro ({req.goal})",
                "split_label": "Full Body",
                "target_muscles": "Pernas, Peito, Costas, Ombros, Braços, Core",
                "scheduled_days": "Seg, Qua, Sex",
                "items": (
                    [to_plan_item(e, 4) for e in pick_exercises("Pernas", 2)]
                    + [to_plan_item(e, 4) for e in pick_exercises("Peito", 2)]
                    + [to_plan_item(e, 4) for e in pick_exercises("Costas", 2)]
                    + [to_plan_item(e, 3, True) for e in pick_exercises("Ombros", 1)]
                    + [to_plan_item(e, 3, True) for e in pick_exercises("Bíceps", 1)]
                    + [to_plan_item(e, 3, True) for e in pick_exercises("Tríceps", 1)]
                ),
            }
        ]
    elif "ABCD" in split_upper:
        templates = [
            {
                "title": f"Treino A — Peito & Tríceps ({req.goal})",
                "split_label": "ABCD",
                "target_muscles": "Peito, Tríceps",
                "scheduled_days": "Segunda",
                "items": (
                    [to_plan_item(e, 4) for e in pick_exercises("Peito", 4)]
                    + [to_plan_item(e, 3, True) for e in pick_exercises("Tríceps", 3)]
                ),
            },
            {
                "title": f"Treino B — Costas, Bíceps & Antebraço ({req.goal})",
                "split_label": "ABCD",
                "target_muscles": "Costas, Bíceps, Antebraço",
                "scheduled_days": "Terça",
                "items": (
                    [to_plan_item(e, 4) for e in pick_exercises("Costas", 4)]
                    + [to_plan_item(e, 3, True) for e in pick_exercises("Bíceps", 2)]
                    + [to_plan_item(e, 3, True) for e in pick_exercises("Antebraço", 1)]
                ),
            },
            {
                "title": f"Treino C — Pernas & Glúteos Completo ({req.goal})",
                "split_label": "ABCD",
                "target_muscles": "Pernas, Glúteos",
                "scheduled_days": "Quinta",
                "items": (
                    [to_plan_item(e, 4) for e in pick_exercises("Pernas", 5)]
                    + [to_plan_item(e, 4) for e in pick_exercises("Glúteos", 2)]
                ),
            },
            {
                "title": f"Treino D — Ombros Completo & Abdômen ({req.goal})",
                "split_label": "ABCD",
                "target_muscles": "Ombros, Abdômen",
                "scheduled_days": "Sexta",
                "items": (
                    [to_plan_item(e, 4) for e in pick_exercises("Ombros", 4)]
                    + [to_plan_item(e, 3, True) for e in pick_exercises("Abdômen", 3)]
                ),
            },
        ]
    else:
        # Default: ABC / Push-Pull-Legs (SmartWorkout Classic Split)
        templates = [
            {
                "title": f"Treino A (Push) — Peito, Ombros & Tríceps ({req.goal})",
                "split_label": req.split_type or "ABC",
                "target_muscles": "Peito, Ombros, Tríceps",
                "scheduled_days": "Seg, Qui",
                "items": (
                    [to_plan_item(e, 4) for e in pick_exercises("Peito", 3)]
                    + [to_plan_item(e, 3, True) for e in pick_exercises("Ombros", 2)]
                    + [to_plan_item(e, 3, True) for e in pick_exercises("Tríceps", 2)]
                ),
            },
            {
                "title": f"Treino B (Pull) — Costas, Posterior de Ombro & Bíceps ({req.goal})",
                "split_label": req.split_type or "ABC",
                "target_muscles": "Costas, Bíceps, Antebraço",
                "scheduled_days": "Ter, Sex",
                "items": (
                    [to_plan_item(e, 4) for e in pick_exercises("Costas", 4)]
                    + [to_plan_item(e, 3, True) for e in pick_exercises("Bíceps", 2)]
                    + [to_plan_item(e, 3, True) for e in pick_exercises("Antebraço", 1)]
                ),
            },
            {
                "title": f"Treino C (Legs) — Pernas, Glúteos & Abdômen ({req.goal})",
                "split_label": req.split_type or "ABC",
                "target_muscles": "Pernas, Glúteos, Abdômen",
                "scheduled_days": "Qua, Sáb",
                "items": (
                    [to_plan_item(e, 4) for e in pick_exercises("Pernas", 4)]
                    + [to_plan_item(e, 4) for e in pick_exercises("Glúteos", 1)]
                    + [to_plan_item(e, 3, True) for e in pick_exercises("Abdômen", 2)]
                ),
            },
        ]

    created_plans: list[WorkoutPlan] = []
    notes_str = (
        f"Ficha estruturada pelo {agent_name} • Nível: {req.experience_level} • "
        f"Equipamento: {req.available_equipment}"
        + (f" • Foco: {req.focus_muscles}" if req.focus_muscles else "")
        + (f" • Obs: {req.custom_instructions}" if req.custom_instructions else "")
    )
    for tpl in templates:
        plan = WorkoutPlan(
            title=tpl["title"],
            split_label=tpl["split_label"],
            target_muscles=tpl["target_muscles"],
            goal=req.goal,
            scheduled_days=tpl["scheduled_days"],
            estimated_duration_min=60,
            created_by_agent=agent_name,
            notes=notes_str,
            exercises=tpl["items"],
            active=True,
        )
        db.add(plan)
        created_plans.append(plan)

    db.commit()
    for p in created_plans:
        db.refresh(p)
    return created_plans


@router.get("/suggest-today")
def suggest_today_workout(db: Session = Depends(get_db)):
    """Sugere os exercícios de hoje com base no histórico (rotação de grupos + progressão de carga)."""
    from app.services.workout_suggest import suggest_today

    return suggest_today(db)


@router.post("/generate-ai-plan")
def generate_workout_plan_with_agent(
    payload: AIWorkoutGenerateRequest, db: Session = Depends(get_db)
):
    """
    Aciona o Agente de Treinos (SmartWorkout Coach IA) para criar fichas de treino
    personalizadas usando os exercícios da Biblioteca SmartWorkout.
    """
    from app.routers.agents import ensure_default_agents_seeded
    from app.services.agent import run_agent_interaction

    ensure_exercise_library_seeded(db)
    ensure_default_agents_seeded(db)

    agent = None
    if payload.agent_id:
        agent = db.query(AgentProfile).filter(AgentProfile.id == payload.agent_id).first()
    if not agent:
        agent = (
            db.query(AgentProfile)
            .filter(AgentProfile.category == "treino", AgentProfile.enabled.is_(True))
            .first()
        )
    agent_name = agent.name if agent else "SmartWorkout Coach IA"

    prompt = (
        f"Crie fichas de treino completas usando a ferramenta `create_workout_plan` com base na biblioteca SmartWorkout:\n"
        f"- Divisão desejada: {payload.split_type} ({payload.days_per_week} dias/semana)\n"
        f"- Objetivo: {payload.goal}\n"
        f"- Nível: {payload.experience_level}\n"
        f"- Equipamentos disponíveis: {payload.available_equipment}\n"
        f"- Grupos musculares foco: {payload.focus_muscles or 'Equilibrado (Corpo todo)'}\n"
        f"- Observações extras: {payload.custom_instructions or 'Progredir carga semanalmente com boa execução.'}"
    )

    plans_before_ids = {row[0] for row in db.query(WorkoutPlan.id).all()}
    chat_res = run_agent_interaction(
        db=db,
        user_message=prompt,
        agent_id=agent.id if agent else None,
    )
    plans_after = db.query(WorkoutPlan).filter(~WorkoutPlan.id.in_(plans_before_ids)).all()

    # Se o modelo remoto não chamou create_workout_plan ou caiu em fallback, gera as fichas estruturadas
    if not plans_after:
        plans_after = generate_structured_workout_plans_fallback(
            db=db, req=payload, agent_name=agent_name
        )

    return {
        "status": "ok",
        "agent_name": agent_name,
        "coach_reply": chat_res.reply,
        "created_plans_count": len(plans_after),
        "created_plans": [WorkoutPlanOut.model_validate(p).model_dump() for p in plans_after],
    }

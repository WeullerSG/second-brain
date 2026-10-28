# 🧠 Second Brain AI — Assistente Pessoal com Gemini, Hybrid Agentic RAG & PWA

Um **Segundo Cérebro Inteligente (PWA)** construído com **FastAPI (Python)** + **React & Tailwind CSS** + **PostgreSQL (`pgvector`)** e **Google Gemini (`google-genai` Interactions API)** para gerenciar sua vida no dia a dia:
- 💳 **Finanças Pessoais**: Saldo de contas bancárias, faturas de cartão de crédito, receitas e despesas.
- 🎓 **Faculdade & Estudos**: Atividades, provas, trabalhos, disciplinas, notas e prazos.
- 🧠 **Memória em Camadas (Core Memory + Hybrid RAG)**:
  - **Memória Estruturada (SQL)**: Finanças e atividades acadêmicas com precisão matemática (sem alucinação em cálculos de saldo/fatura).
  - **Core Memory (Fatos Episódicos)**: Preferências, objetivos, regras pessoais e fatos do dia a dia que o próprio agente Gemini salva, atualiza ou remove via *Function Calling*, e que você pode gerenciar manualmente pelo painel.
  - **Memória Semântica (RAG Vetorial)**: Upload de arquivos (PDFs de faturas, ementas da faculdade, resumos, anotações em TXT/MD/CSV) indexados com `gemini-embedding-001`.
- 📊 **Monitoramento de Memória & Telemetria**:
  - Quantidade de arquivos enviados, chunks indexados, tamanho ocupado pela memória, tokens consumidos por interação, ferramentas acionadas pelo agente e uso de RAM/Disco do servidor.
- 🎯 **Curadoria para Fine-Tuning (SFT)**:
  - Coleta interações e correções aprovadas e exporta no formato oficial `JSONL` para **Supervised Fine-Tuning** no Google Gemini quando você quiser treinar um modelo customizado com seu estilo pessoal.

---

## 🏗️ Arquitetura: Por que Hybrid Agentic RAG + Tools em vez de apenas Fine-Tuning?

Para gerenciar dados dinâmicos do cotidiano (como o saldo da conta hoje, uma compra no cartão ou a data de uma prova na semana que vem), **Fine-Tuning sozinho não funciona como banco de dados**:
1. **Fine-Tuning (Ajuste Fino)** congela conhecimentos nos pesos da rede neural no momento do treino — serve para ensinar **estilo de resposta, tom de voz e formato**, mas não para atualizar seu saldo bancário a cada minuto.
2. **Hybrid Agentic RAG + Memória em Camadas** permite que o **Gemini (`gemini-3.8-flash` / `gemini-4-argon`)** atue como um **Agente** com ferramentas (*Tools*):
   - Quando você diz *"Gastei R$ 85 no iFood no cartão Nubank"*, o Gemini chama automaticamente a tool `add_finance_record`.
   - Quando você diz *"Tenho prova de Cálculo II dia 15 valendo 10 pontos"*, ele chama `add_academic_task`.
   - Quando você diz *"Lembre que minha conta principal é no Itaú e recebo todo dia 5"*, ele chama `save_memory_fact`.
   - Quando você envia um PDF da faculdade ou fatura e pergunta sobre o conteúdo, ele chama `search_documents_rag`.

---

## ☁️ Opinião Técnica: Subir em VM (VPS) vs Vercel + Cloud DB?

O projeto foi desenhado de forma **Híbrida**, permitindo ambas as abordagens:

| Critério | Opção 1: Vercel (Frontend) + Render/Railway/Fly.io (API) + Supabase/Neon (Postgres `pgvector`) | Opção 2: VM / VPS (Hetzner, DigitalOcean, Oracle Cloud) com Docker Compose |
| :--- | :--- | :--- |
| **Manutenção** | **Zero** — deploy automático via Git push, HTTPS nativo | **Baixa/Média** — gerenciado via Docker Compose (ou Coolify) |
| **Processamento de Arquivos (RAG)** | Limitado pelo timeout de funções serverless (10s–60s no plano gratuito) | **Ilimitado** — processa PDFs grandes em background sem timeout |
| **Monitoramento de Memória/Sistema** | Monitora banco, chunks e tokens da API | Monitora também **RAM, CPU e Disco real** da máquina |
| **Custo Inicial** | **R$ 0** (Free tiers do Vercel + Supabase/Neon) | ~US$ 4 a US$ 6/mês (ou grátis na Oracle Cloud Free Tier ARM) |

> **Recomendação**: Comece rodando localmente ou com **Supabase/Neon (Postgres + `pgvector` grátis)** + **Vercel** para testar no celular como PWA em minutos. Quando quiser automações pesadas em background (ex: processar dezenas de PDFs grandes ou rodar jobs agendados), basta rodar `docker compose up -d --build` em qualquer VM!

---

## 🚀 Como Rodar Localmente

### 1. Backend (FastAPI + Gemini SDK)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy ..\.env.example .env
# Edite o arquivo .env e insira sua GEMINI_API_KEY
uvicorn app.main:app --reload --port 8000
```

> **Nota**: Por padrão, se você ainda não tiver o PostgreSQL rodando, o backend usa automaticamente um banco local `SQLite` (`backend/data/second_brain.db`) com busca vetorial cosseno integrada para que você possa usar tudo imediatamente! Para usar **PostgreSQL + `pgvector`**, basta definir `DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/secondbrain` no `.env`.

### 2. Frontend (React + Vite + Tailwind PWA)

```bash
cd frontend
npm install
npm run dev
```

Acesse `http://localhost:5173` no navegador (ou instale como App PWA no celular/desktop).

### 3. Ou Subindo Tudo com Docker Compose (Postgres `pgvector` + API + Web)

```bash
copy .env.example .env
# Configure sua GEMINI_API_KEY no .env
docker compose up -d --build
```

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

IS_POSTGRES = settings.DATABASE_URL.startswith("postgresql")

connect_args = {"check_same_thread": False} if settings.DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def init_db() -> None:
    """Inicializa tabelas e garante extensão pgvector caso esteja no PostgreSQL."""
    if IS_POSTGRES:
        try:
            with engine.begin() as conn:
                conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
        except Exception as exc:
            print(f"[DB Warning] Não foi possível criar extensão vector automaticamente: {exc}")

    from app import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    _add_missing_columns()


# Colunas criadas depois da primeira versão do banco (create_all não altera tabelas existentes)
NEW_COLUMNS = [
    ("schedule_notifications", "reminder_offsets", "JSON"),
    ("workout_exercises", "image_urls", "JSON"),
    ("conversations", "agent_id", "INTEGER"),
]


def _add_missing_columns() -> None:
    insp = inspect(engine)
    for table, column, col_type in NEW_COLUMNS:
        if not insp.has_table(table):
            continue
        existing = {c["name"] for c in insp.get_columns(table)}
        if column not in existing:
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

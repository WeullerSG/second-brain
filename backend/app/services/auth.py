"""Login de usuário: hash de senha (PBKDF2) e sessões com token aleatório.

Só o hash do token fica no banco: se alguém ler o banco, não consegue usar as sessões.
"""
import hashlib
import hmac
import secrets
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models import AuthSession, User

PBKDF2_ITERATIONS = 600_000
SESSION_DAYS = 30

# Limite simples de tentativas de login por IP (proteção contra força bruta)
MAX_FAILED_ATTEMPTS = 5
FAILED_WINDOW_SECONDS = 300
_failed_attempts: dict[str, deque] = defaultdict(deque)


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iterations, salt, expected = stored.split("$")
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iterations))
        return hmac.compare_digest(digest.hex(), expected)
    except (ValueError, TypeError):
        return False


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime) -> datetime:
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def create_session(db: Session, user: User) -> str:
    token = secrets.token_urlsafe(32)
    db.add(
        AuthSession(
            token_hash=_hash_token(token),
            user_id=user.id,
            expires_at=_now() + timedelta(days=SESSION_DAYS),
        )
    )
    db.commit()
    return token


def get_user_by_token(db: Session, token: Optional[str]) -> Optional[User]:
    if not token:
        return None
    session = db.get(AuthSession, _hash_token(token))
    if not session or _as_utc(session.expires_at) < _now():
        return None
    return db.get(User, session.user_id)


def delete_session(db: Session, token: str) -> None:
    session = db.get(AuthSession, _hash_token(token))
    if session:
        db.delete(session)
        db.commit()


def delete_user_sessions(db: Session, user_id: int, keep_token: Optional[str] = None) -> None:
    keep = _hash_token(keep_token) if keep_token else None
    for s in db.query(AuthSession).filter(AuthSession.user_id == user_id).all():
        if s.token_hash != keep:
            db.delete(s)
    db.commit()


def too_many_failures(ip: str) -> bool:
    attempts = _failed_attempts[ip]
    cutoff = time.monotonic() - FAILED_WINDOW_SECONDS
    while attempts and attempts[0] < cutoff:
        attempts.popleft()
    return len(attempts) >= MAX_FAILED_ATTEMPTS


def register_failure(ip: str) -> None:
    _failed_attempts[ip].append(time.monotonic())


def clear_failures(ip: str) -> None:
    _failed_attempts.pop(ip, None)


def token_from_header(authorization: Optional[str]) -> Optional[str]:
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip() or None
    return None

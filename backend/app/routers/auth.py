from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.services import auth

router = APIRouter(prefix="/api/auth", tags=["Login"])


class Credentials(BaseModel):
    username: str = Field(..., min_length=3, max_length=60)
    password: str = Field(..., min_length=8, max_length=200)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=200)


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    return forwarded.split(",")[0].strip() if forwarded else (request.client.host if request.client else "?")


@router.get("/status")
def auth_status(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    """Diz se já existe usuário cadastrado e se o token enviado é válido."""
    user = auth.get_user_by_token(db, auth.token_from_header(authorization))
    return {
        "has_user": db.query(User).count() > 0,
        "authenticated": user is not None,
        "username": user.username if user else None,
    }


@router.post("/setup")
def setup_first_user(payload: Credentials, db: Session = Depends(get_db)):
    """Cria o primeiro (e único) usuário. Depois disso, o cadastro fica fechado."""
    if db.query(User).count() > 0:
        raise HTTPException(status_code=403, detail="O usuário já foi criado. Faça login.")
    user = User(username=payload.username.strip().lower(), password_hash=auth.hash_password(payload.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"token": auth.create_session(db, user), "username": user.username}


@router.post("/login")
def login(payload: Credentials, request: Request, db: Session = Depends(get_db)):
    ip = _client_ip(request)
    if auth.too_many_failures(ip):
        raise HTTPException(status_code=429, detail="Muitas tentativas. Aguarde alguns minutos.")
    user = db.query(User).filter(User.username == payload.username.strip().lower()).first()
    if not user or not auth.verify_password(payload.password, user.password_hash):
        auth.register_failure(ip)
        raise HTTPException(status_code=401, detail="Usuário ou senha incorretos.")
    auth.clear_failures(ip)
    return {"token": auth.create_session(db, user), "username": user.username}


@router.post("/logout")
def logout(authorization: str | None = Header(default=None), db: Session = Depends(get_db)):
    token = auth.token_from_header(authorization)
    if token:
        auth.delete_session(db, token)
    return {"status": "ok"}


@router.post("/change-password")
def change_password(
    payload: PasswordChange,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    token = auth.token_from_header(authorization)
    user = auth.get_user_by_token(db, token)
    if not user:
        raise HTTPException(status_code=401, detail="Sessão expirada. Faça login novamente.")
    if not auth.verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Senha atual incorreta.")
    user.password_hash = auth.hash_password(payload.new_password)
    db.commit()
    # Encerra as outras sessões (outros aparelhos), mantendo a atual
    auth.delete_user_sessions(db, user.id, keep_token=token)
    return {"status": "ok"}

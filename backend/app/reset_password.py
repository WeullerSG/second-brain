"""Redefine a senha do usuário pelo terminal do servidor (caso você esqueça).

Uso:  docker compose exec backend python -m app.reset_password
"""
import getpass

from app.database import SessionLocal, init_db
from app.models import User
from app.services.auth import delete_user_sessions, hash_password


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        users = db.query(User).all()
        if not users:
            print("Nenhum usuário cadastrado. Abra o app no navegador para criar o primeiro.")
            return
        user = users[0]
        print(f"Redefinindo a senha de: {user.username}")
        new = getpass.getpass("Nova senha (mín. 8 caracteres): ")
        if len(new) < 8 or new != getpass.getpass("Repita a nova senha: "):
            print("Senhas diferentes ou muito curtas. Nada foi alterado.")
            return
        user.password_hash = hash_password(new)
        db.commit()
        delete_user_sessions(db, user.id)
        print("Senha alterada. Todas as sessões foram encerradas.")
    finally:
        db.close()


if __name__ == "__main__":
    main()

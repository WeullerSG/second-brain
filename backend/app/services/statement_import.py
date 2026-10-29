"""Importação de extratos e faturas sem contas repetidas e sem lançamentos duplicados.

- Reconhece o banco (e o final da conta) para usar sempre a mesma conta.
- Cada transação ganha uma "impressão digital" (external_id): reenviar o mesmo
  extrato, ou extratos com períodos que se sobrepõem, não duplica nada.
- Se você já lançou o mesmo valor à mão (data até 3 dias de diferença), o app
  liga o lançamento existente ao extrato em vez de criar outro.
- Lançamentos importados que você excluir não voltam ao reenviar o extrato.
"""
import hashlib
import json
import re
import unicodedata
from datetime import datetime, timedelta
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.models import FinanceAccount, FinanceRecord

MATCH_WINDOW_DAYS = 3
IGNORED_IDS_KEY = "ignored_import_ids"

# nome no extrato (sem acento, minúsculo) -> nome do banco no app
BANKS: list[tuple[str, str]] = [
    ("picpay", "PicPay"),
    ("nubank", "Nubank"), ("nu pagamentos", "Nubank"),
    ("mercado pago", "Mercado Pago"), ("mercadopago", "Mercado Pago"),
    ("itau", "Itaú"),
    ("banco inter", "Inter"), ("inter&co", "Inter"), ("bancointer", "Inter"),
    ("bradesco", "Bradesco"),
    ("caixa economica", "Caixa"), ("caixa econômica", "Caixa"),
    ("banco do brasil", "Banco do Brasil"),
    ("santander", "Santander"),
    ("c6 bank", "C6 Bank"), ("banco c6", "C6 Bank"),
    ("pagbank", "PagBank"), ("pagseguro", "PagBank"),
    ("sicoob", "Sicoob"), ("sicredi", "Sicredi"),
    ("btg pactual", "BTG"), ("banco original", "Original"), ("neon", "Neon"), ("next", "Next"),
]


def _plain(text: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", (text or "").lower()) if unicodedata.category(c) != "Mn")


def detect_bank(text: str, filename: str = "") -> Optional[str]:
    hay = _plain(text[:4000]) + " " + _plain(filename)
    for key, label in BANKS:
        if _plain(key) in hay:
            return label
    return None


def detect_account_digits(text: str) -> Optional[str]:
    """Últimos 4 dígitos da conta, quando o extrato mostra (ex: "Conta: 12873168-0" -> "1680")."""
    m = re.search(r"\bconta(?:\s+corrente)?\s*[:nº°.]*\s*([\d][\d.\-]{3,})", _plain(text[:4000]))
    if not m:
        return None
    digits = re.sub(r"\D", "", m.group(1))
    return digits[-4:] if len(digits) >= 4 else None


def detect_holder_name(text: str) -> Optional[str]:
    """Nome do titular (linha antes do CPF), usado para reconhecer Pix entre contas suas."""
    lines = [l.strip() for l in (text or "").splitlines()[:40] if l.strip()]
    for i, line in enumerate(lines):
        if line.upper().startswith("CPF") and i > 0:
            name = lines[i - 1]
            if 2 <= len(name.split()) <= 6 and not re.search(r"\d", name):
                return name
    return None


def _find_account(db: Session, account_type: str, bank: Optional[str]) -> Optional[FinanceAccount]:
    accounts = db.query(FinanceAccount).filter(FinanceAccount.account_type == account_type).all()
    if bank:
        key = _plain(bank)
        for acc in accounts:
            if key in _plain(acc.name):
                return acc
        return None
    # Banco não identificado: se só existe uma conta desse tipo, é ela
    return accounts[0] if len(accounts) == 1 else None


def resolve_checking_account(db: Session, bank: Optional[str]) -> tuple[str, bool]:
    """Nome da conta corrente do extrato e se ela já existia."""
    existing = _find_account(db, "checking", bank)
    if existing:
        return existing.name, True
    return (f"Conta {bank}" if bank else "Conta Corrente"), False


def resolve_card_account(db: Session, bank: Optional[str], fallback_name: Optional[str] = None) -> tuple[str, bool]:
    existing = _find_account(db, "credit_card", bank)
    if existing:
        return existing.name, True
    return (fallback_name or (f"Cartão {bank}" if bank else "Cartão de Crédito")), False


# ---------------------------------------------------------------- impressão digital e exclusões

def fingerprint(*parts: Any) -> str:
    raw = "|".join(_plain(str(p)) for p in parts)
    return hashlib.sha1(raw.encode()).hexdigest()[:24]


def _ignored(db: Session) -> set[str]:
    from app.services.app_settings_store import get_setting

    try:
        return set(json.loads(get_setting(db, IGNORED_IDS_KEY) or "[]"))
    except ValueError:
        return set()


def remember_deleted(db: Session, external_id: Optional[str]) -> None:
    """Chamado ao excluir um lançamento importado: ele não volta ao reenviar o extrato."""
    if not external_id:
        return
    from app.services.app_settings_store import set_setting

    ids = _ignored(db)
    ids.add(external_id)
    set_setting(db, IGNORED_IDS_KEY, json.dumps(sorted(ids)))


def _to_date(iso: Optional[str]) -> Optional[datetime]:
    try:
        return datetime.strptime((iso or "")[:10], "%Y-%m-%d")
    except ValueError:
        return None


def find_manual_match(db: Session, amount: float, date_iso: str, record_types: tuple[str, ...]) -> Optional[FinanceRecord]:
    """Lançamento feito à mão (sem vínculo com extrato) com o mesmo valor e data próxima."""
    target = _to_date(date_iso)
    if not target:
        return None
    lo = (target - timedelta(days=MATCH_WINDOW_DAYS)).strftime("%Y-%m-%d")
    hi = (target + timedelta(days=MATCH_WINDOW_DAYS)).strftime("%Y-%m-%d")
    candidates = (
        db.query(FinanceRecord)
        .filter(
            FinanceRecord.external_id.is_(None),
            FinanceRecord.record_type.in_(record_types),
            FinanceRecord.amount.between(round(amount, 2) - 0.01, round(amount, 2) + 0.01),
            FinanceRecord.due_date >= lo,
            FinanceRecord.due_date <= hi + "~",
        )
        .all()
    )
    if not candidates:
        return None
    return min(candidates, key=lambda r: abs(((_to_date(r.due_date) or target) - target).days))


def import_record(
    db: Session,
    external_id: str,
    *,
    title: str,
    amount: float,
    date_iso: str,
    record_type: str,
    category: str,
    account_name: str,
    status: str,
    notes: str,
    match_types: Optional[tuple[str, ...]] = None,
) -> str:
    """Cria o lançamento se for novo. Retorna "created", "linked" (já existia lançado à mão) ou "skipped"."""
    if external_id in _ignored(db):
        return "skipped"
    if db.query(FinanceRecord).filter(FinanceRecord.external_id == external_id).first():
        return "skipped"

    match = find_manual_match(db, amount, date_iso, match_types or (record_type,))
    if match:
        # Mesmo gasto que você já tinha anotado: só liga ao extrato (mantém seu título e categoria)
        match.external_id = external_id
        match.status = status if status == "paid" else match.status
        match.notes = ((match.notes or "") + f" • Confirmado no extrato ({date_iso})").strip(" •")
        db.flush()
        return "linked"

    db.add(
        FinanceRecord(
            title=title[:160],
            category=category,
            record_type=record_type,
            amount=round(amount, 2),
            account_name=account_name,
            due_date=date_iso,
            status=status,
            notes=notes,
            external_id=external_id,
        )
    )
    db.flush()
    return "created"


# ---------------------------------------------------------------- saldo

def update_balance_if_newer(db: Session, account: FinanceAccount, balance: Optional[float], as_of: Optional[str]) -> bool:
    """Atualiza o saldo só se este extrato for mais recente que o último usado."""
    from app.services.app_settings_store import get_setting, set_setting

    if balance is None or not as_of:
        return False
    key = f"balance_as_of:{account.id}"
    last = get_setting(db, key)
    if last and as_of < last:
        return False
    account.balance = round(balance, 2)
    set_setting(db, key, as_of)
    return True


# ---------------------------------------------------------------- extrato genérico (outros bancos)

_AMOUNT = r"[-−+]?\s*(?:R\$\s*)?\d{1,3}(?:\.\d{3})*,\d{2}"
_GENERIC_LINE = re.compile(
    rf"^(\d{{2}}/\d{{2}}(?:/\d{{2,4}})?)\s+(.+?)\s+({_AMOUNT})\s*([DC])?(?:\s+{_AMOUNT}\s*[DC]?)?$",
    re.IGNORECASE,
)
_OUT_WORDS = ("enviad", "pagamento", "pagto", "compra", "debito", "saque", "tarifa", "transferencia enviada", "boleto", "pix env")
_IN_WORDS = ("recebid", "credito", "deposito", "salario", "estorno", "rendimento", "resgate", "pix rec")


def parse_generic_statement(text: str) -> list[dict[str, Any]]:
    """Lê extratos no formato "dd/mm[/aaaa] descrição valor [D/C] [saldo]" (Itaú, BB, Bradesco, Caixa...)."""
    years = re.findall(r"\d{2}/\d{2}/(\d{4})", text or "")
    default_year = int(years[-1]) if years else datetime.now().year
    txs: list[dict[str, Any]] = []
    for raw in (text or "").splitlines():
        line = raw.strip()
        m = _GENERIC_LINE.match(line)
        if not m:
            continue
        date_s, desc, amount_s, dc = m.groups()
        desc_plain = _plain(desc)
        if desc_plain.startswith("saldo") or "saldo anterior" in desc_plain or "saldo do dia" in desc_plain:
            continue
        parts = date_s.split("/")
        year = int(parts[2]) if len(parts) == 3 else default_year
        if year < 100:
            year += 2000
        date_iso = f"{year:04d}-{int(parts[1]):02d}-{int(parts[0]):02d}"
        negative = amount_s.strip().startswith(("-", "−"))
        value = float(re.sub(r"[^\d,]", "", amount_s).replace(",", "."))
        if value <= 0:
            continue
        if dc:
            direction = "out" if dc.upper() == "D" else "in"
        elif negative:
            direction = "out"
        elif amount_s.strip().startswith("+") or any(w in desc_plain for w in _IN_WORDS):
            direction = "in"
        else:
            direction = "out" if any(w in desc_plain for w in _OUT_WORDS) else "in"
        txs.append(
            {
                "date_iso": date_iso,
                "date_br": f"{date_iso[8:10]}/{date_iso[5:7]}",
                "time": "",
                "tx_type": "Lançamento",
                "direction": direction,
                "amount": value,
                "title": re.sub(r"\s{2,}", " ", desc).strip(),
                "payment_method": "Saldo Conta",
            }
        )
    return txs

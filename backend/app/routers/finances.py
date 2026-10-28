import json
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import DocumentChunk, DocumentFile, FinanceAccount, FinanceRecord, MemoryFact
from app.schemas import (
    FinanceAccountOut,
    FinanceAccountUpsert,
    FinanceRecordCreate,
    FinanceRecordOut,
    FinanceRecordUpdate,
    InstallmentCreate,
    InstallmentGroupDelete,
    InstallmentGroupUpdate,
    SalaryUpdatePayload,
)
from app.services.embeddings import get_genai_client
from app.services.ingestion import extract_text_from_bytes

router = APIRouter(prefix="/api/finances", tags=["Finanças & Cartões"])

MONTH_NAMES_PT = {
    1: "Janeiro",
    2: "Fevereiro",
    3: "Março",
    4: "Abril",
    5: "Maio",
    6: "Junho",
    7: "Julho",
    8: "Agosto",
    9: "Setembro",
    10: "Outubro",
    11: "Novembro",
    12: "Dezembro",
}

MONTH_NAME_TO_NUM = {
    "janeiro": "01",
    "fevereiro": "02",
    "março": "03",
    "marco": "03",
    "abril": "04",
    "maio": "05",
    "junho": "06",
    "julho": "07",
    "agosto": "08",
    "setembro": "09",
    "outubro": "10",
    "novembro": "11",
    "dezembro": "12",
}

# Linhas de resumo/taxas em faturas que NÃO são compras individuais
STATEMENT_IGNORE_KEYWORDS = (
    "pagamento da fatura",
    "pagamentos e créditos",
    "pagamentos e creditos",
    "total da fatura",
    "total a pagar",
    "consumos de ",
    "tarifas e encargos",
    "multas por atraso",
    "multa por atraso",
    "juros do mês",
    "juros do mes",
    "juros de mora",
    "juros do rotativo",
    "limite total",
    "limite utilizado",
    "limite disponível",
    "limite disponivel",
    "saque total",
    "saque utilizado",
    "saque disponível",
    "saque disponivel",
    "tarifa de saque",
    "compras parceladas",
    "fatura parcelada",
    "saldo ao final do dia",
    "saldo final do período",
)

# Regex para detectar linhas de gastos brasileiros em textos livres colados
BRL_EXPENSE_PATTERN = re.compile(
    r"(?:(?P<date>\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\s*[-–•:]?\s*)?"
    r"(?P<title>[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\s\*\.\/\_\-]{2,56}?)\s*"
    r"(?:R\$\s*|\s+-\s+R\$\s*|\s+R\$\s*)(?P<amount>\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+(?:\.\d{2}))",
    re.IGNORECASE,
)


def _parse_brl_amount(raw: str) -> float:
    cleaned = (raw or "").strip()
    if "," in cleaned and "." in cleaned:
        cleaned = cleaned.replace(".", "").replace(",", ".")
    elif "," in cleaned:
        cleaned = cleaned.replace(",", ".")
    try:
        return round(float(cleaned), 2)
    except ValueError:
        return 0.0


def _add_months(date_str: str, months: int) -> str:
    try:
        parts = [int(p) for p in str(date_str)[:10].split("-")]
        year, month, day = parts[0], parts[1], parts[2]
    except Exception:
        now = datetime.now()
        year, month, day = now.year, now.month, 10

    total_month = (month - 1) + months
    target_year = year + (total_month // 12)
    target_month = (total_month % 12) + 1
    is_leap = target_year % 4 == 0 and (target_year % 100 != 0 or target_year % 400 == 0)
    max_days = [31, 29 if is_leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][target_month - 1]
    target_day = min(day, max_days)
    return f"{target_year:04d}-{target_month:02d}-{target_day:02d}"


def _format_month_label(month_key: str) -> str:
    try:
        y, m = month_key.split("-")
        return f"{MONTH_NAMES_PT.get(int(m), m)}/{y}"
    except Exception:
        return month_key


def _detect_installment_info(title: str) -> Optional[dict[str, Any]]:
    """
    Detecta padrões de compra parcelada na descrição da fatura (sem limite máximo de parcelas):
    Ex: 'AMAZON BR *Amazon BR Parcela 1 de 2', 'Mercado Livre Parcela 2/6', 'Financiamento Parcela 15 de 120'
    """
    m = re.search(
        r"(?:parcela|parc\.?)\s*(\d+)\s*(?:de|/)\s*(\d+)",
        title or "",
        re.IGNORECASE,
    )
    if not m:
        m = re.search(r"\[PARCELADO\s*(\d+)/(\d+)\]", title or "", re.IGNORECASE)
    if not m:
        return None

    curr_inst = int(m.group(1))
    total_inst = int(m.group(2))
    if total_inst < 1 or curr_inst < 1 or curr_inst > total_inst:
        return None

    clean_title = re.sub(
        r"\s*[\(\[]?(?:parcela|parc\.?)\s*\d+\s*(?:de|/)\s*\d+[\)\]]?",
        "",
        title,
        flags=re.IGNORECASE,
    ).strip(" -–•")
    clean_title = re.sub(r"\s{2,}", " ", clean_title).strip()

    return {
        "clean_title": clean_title or title.strip(),
        "current_installment": curr_inst,
        "total_installments": total_inst,
        "remaining_installments": max(0, total_inst - curr_inst),
    }


def _guess_category(title: str) -> str:
    t = (title or "").lower()
    if _detect_installment_info(title):
        return "parcelado"
    if any(
        k in t
        for k in (
            "ifood",
            "restaurante",
            "mercado",
            "supermercado",
            "padaria",
            "burger",
            "pizza",
            "cafe",
            "mercearia",
            "bahamas",
            "mart minas",
            "pastelaria",
            "eskimo",
            "distribuidora de",
            "lbdistribuidora",
        )
    ):
        return "alimentacao"
    if any(k in t for k in ("uber", "99", "posto", "shell", "gasolina", "estacionamento", "pedagio", "onibus", "combust")):
        return "transporte"
    if any(k in t for k in ("netflix", "spotify", "amazon", "prime", "steam", "cinema", "jogo", "youtube", "dl*google", "google")):
        return "assinaturas & lazer"
    if any(k in t for k in ("faculdade", "editora e distribuidora", "educacional", "livro", "curso", "udemy", "alura", "papelaria")):
        return "faculdade"
    if any(k in t for k in ("luz", "energia", "cemig", "agua", "internet", "aluguel", "condominio", "vivo", "claro", "recarga", "leroy merlin")):
        return "moradia"
    if any(k in t for k in ("farmacia", "drogaria", "consulta", "exame", "academia")):
        return "saude"
    if any(k in t for k in ("fatura", "cartão", "cartao", "mp*mp", "mercado pago")):
        return "cartao"
    return "outros"


def _get_document_full_text(db: Session, doc: DocumentFile) -> str:
    """
    Lê o texto integral do arquivo original em disco para evitar duplicação causada pelo overlap de chunks.
    Se o arquivo físico não for encontrado, reconstrói a partir dos chunks.
    """
    if doc.storage_path:
        candidates = [
            Path(doc.storage_path),
            settings.UPLOAD_DIR / Path(doc.storage_path).name,
            Path("backend") / doc.storage_path,
        ]
        for cand in candidates:
            if cand.exists() and cand.is_file():
                try:
                    return extract_text_from_bytes(doc.filename, doc.mime_type, cand.read_bytes())
                except Exception:
                    pass

    chunks = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.document_id == doc.id)
        .order_by(DocumentChunk.chunk_index.asc())
        .all()
    )
    return "\n".join(c.content for c in chunks)


def _parse_credit_card_statement_doc(text: str, filename: str, doc_id: int) -> Optional[dict[str, Any]]:
    """
    Analisa PDFs de fatura de cartão de crédito (ex: Mercado Pago, Nubank, PicPay Card, Itaú, Inter).
    Extrai metadados do cartão, compras individuais do mês e compras parceladas + parcelas futuras.
    """
    lower_txt = (text or "").lower()
    is_card_stmt = (
        "fatura" in lower_txt
        and ("cartão" in lower_txt or "cartao" in lower_txt or "limite total" in lower_txt or "detalhes de consumo" in lower_txt)
        and "extrato de conta" not in lower_txt
    )
    if not is_card_stmt:
        return None

    # Identifica nome do cartão
    if "mercado pago" in lower_txt or "mp-statement" in filename.lower() or "6453" in lower_txt:
        card_name = "Cartão Mercado Pago Visa"
    elif "nubank" in lower_txt or "nubank" in filename.lower():
        card_name = "Cartão Nubank"
    elif "picpay" in lower_txt:
        card_name = "Cartão PicPay Card"
    elif "itaú" in lower_txt or "itau" in lower_txt:
        card_name = "Cartão Itaú"
    elif "inter" in lower_txt:
        card_name = "Cartão Banco Inter"
    else:
        card_name = f"Cartão de Crédito ({filename})"

    # Datas de vencimento e fechamento
    due_match = re.search(r"(?:Vencimento:|Vence em)\s*\n?\s*(\d{2})/(\d{2})/(\d{4})", text, re.IGNORECASE)
    if due_match:
        d_day, d_month, d_year = int(due_match.group(1)), int(due_match.group(2)), int(due_match.group(3))
        due_date_iso = f"{d_year:04d}-{d_month:02d}-{d_day:02d}"
    else:
        now = datetime.now()
        d_day, d_month, d_year = 14, now.month, now.year
        due_date_iso = f"{d_year:04d}-{d_month:02d}-{d_day:02d}"

    close_match = re.search(r"Fechamento da fatura\s*\n?\s*(\d{2})/(\d{2})/(\d{4})", text, re.IGNORECASE)
    closing_day = int(close_match.group(1)) if close_match else max(1, d_day - 5)

    # Limites e totais
    limit_match = re.search(r"Limite total\s*\n?\s*R\$\s*([\d\.,]+)", text, re.IGNORECASE)
    credit_limit = _parse_brl_amount(limit_match.group(1)) if limit_match else 1800.0

    used_match = re.search(r"Limite utilizado\s*\n?\s*R\$\s*([\d\.,]+)", text, re.IGNORECASE)
    used_limit = _parse_brl_amount(used_match.group(1)) if used_match else 0.0

    avail_match = re.search(r"Limite dispon[íi]vel\s*\n?\s*R\$\s*([\d\.,]+)", text, re.IGNORECASE)
    available_limit = _parse_brl_amount(avail_match.group(1)) if avail_match else max(0.0, credit_limit - used_limit)

    to_pay_match = re.search(r"Total a pagar\s*\n?\s*R\$\s*([\d\.,]+)", text, re.IGNORECASE)
    total_to_pay = _parse_brl_amount(to_pay_match.group(1)) if to_pay_match else None

    consumo_match = re.search(r"Consumos de [^\n]+? R\$\s*([\d\.,]+)", text, re.IGNORECASE)
    statement_total = _parse_brl_amount(consumo_match.group(1)) if consumo_match else 0.0

    # Extração de cada compra individual da fatura
    items: list[dict[str, Any]] = []
    installments_found: list[dict[str, Any]] = []
    seen_keys: set[tuple[str, str, float]] = set()

    for raw_line in (text or "").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        m = re.match(r"^(\d{2}/\d{2})\s+(.+?)\s+R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})$", line)
        if not m:
            continue
        dd_mm, raw_title, raw_amt = m.groups()
        title_clean = re.sub(r"\s{2,}", " ", raw_title).strip(" -–•")
        lower_title = title_clean.lower()

        if any(ign in lower_title for ign in STATEMENT_IGNORE_KEYWORDS):
            continue

        amount = _parse_brl_amount(raw_amt)
        if amount <= 0:
            continue

        dedup_key = (dd_mm, title_clean, amount)
        if dedup_key in seen_keys:
            continue
        seen_keys.add(dedup_key)

        p_day, p_month = [int(x) for x in dd_mm.split("/")]
        p_year = d_year - 1 if (p_month == 12 and d_month == 1) else d_year
        date_iso = f"{p_year:04d}-{p_month:02d}-{p_day:02d}"

        inst_info = _detect_installment_info(title_clean)
        category = _guess_category(title_clean)

        item_dict = {
            "id": f"rag_document_{doc_id}_{len(items)}",
            "title": title_clean,
            "amount": amount,
            "date": dd_mm,
            "date_iso": date_iso,
            "category": category,
            "source_name": filename,
            "source_type": "rag_document",
            "source_id": doc_id,
            "account_name": card_name,
            "raw_line": line[:160],
            "is_installment": bool(inst_info),
        }
        if inst_info:
            item_dict.update(inst_info)
            installments_found.append(
                {
                    "clean_title": inst_info["clean_title"],
                    "raw_title": title_clean,
                    "installment_amount": amount,
                    "current_installment": inst_info["current_installment"],
                    "total_installments": inst_info["total_installments"],
                    "remaining_installments": inst_info["remaining_installments"],
                    "total_purchase_amount": round(amount * inst_info["total_installments"], 2),
                    "remaining_total_amount": round(amount * inst_info["remaining_installments"], 2),
                    "purchase_date": dd_mm,
                    "purchase_date_iso": date_iso,
                    "statement_due_date": due_date_iso,
                    "account_name": card_name,
                    "source_filename": filename,
                }
            )

        items.append(item_dict)

    computed_sum = round(sum(i["amount"] for i in items), 2)
    if statement_total <= 0:
        statement_total = computed_sum

    is_paid = (total_to_pay is not None and total_to_pay == 0.0) or ("pagamento da fatura de outubro" in lower_txt)

    return {
        "doc_type": "credit_card_statement",
        "card_name": card_name,
        "credit_limit": credit_limit,
        "used_limit": used_limit if used_limit > 0 else round(sum(x["remaining_total_amount"] for x in installments_found), 2),
        "available_limit": available_limit,
        "closing_day": closing_day,
        "due_day": d_day,
        "due_date_iso": due_date_iso,
        "statement_month_key": due_date_iso[:7],
        "statement_total": statement_total,
        "is_paid": is_paid,
        "items": items,
        "installments": installments_found,
    }


def _parse_bank_extrato_doc(text: str, filename: str, doc_id: int) -> Optional[dict[str, Any]]:
    """
    Analisa PDFs de extrato de conta corrente/pagamentos (ex: PicPay, Nubank, Itaú).
    Extrai saldo final atual, salário recebido, gastos do mês no saldo e compras feitas com cartão.
    """
    lower_txt = (text or "").lower()
    if "extrato de conta" not in lower_txt and "saldo ao final do dia" not in lower_txt:
        return None

    account_name = "Conta PicPay" if "picpay" in lower_txt else f"Conta Corrente ({filename})"
    card_companion_name = "Cartão PicPay Card" if "picpay" in lower_txt else "Cartão da Conta"

    lines = [l.strip() for l in (text or "").splitlines() if l.strip()]
    cur_date: Optional[str] = None
    latest_balance: Optional[float] = None
    latest_balance_date: Optional[str] = None
    transactions: list[dict[str, Any]] = []
    seen_tx: set[tuple[str, str, str, float, str]] = set()

    i = 0
    while i < len(lines):
        line = lines[i]
        dm = re.match(
            r"^(\d{1,2})\s+de\s+([a-zç]+)\s+(\d{4})\s+Saldo ao final do dia:\s*R\$\s*([\d\.,]+)",
            line,
            re.IGNORECASE,
        )
        if dm:
            day_s, mname, year_s, bal_s = dm.groups()
            mm = MONTH_NAME_TO_NUM.get(mname.lower(), "10")
            cur_date = f"{year_s}-{mm}-{int(day_s):02d}"
            bal_val = _parse_brl_amount(bal_s)
            if latest_balance is None or (latest_balance_date and cur_date > latest_balance_date):
                latest_balance = bal_val
                latest_balance_date = cur_date
            i += 1
            continue

        tm = re.match(
            r"^(\d{2}:\d{2})\s+(Pix enviado|Pix recebido|Pagamento realizado|Compra realizada|Guardado no cofrinho|Dinheiro resgatado)\s+([+\-\u2212])\s*R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})(.*)$",
            line,
            re.IGNORECASE,
        )
        if tm and cur_date:
            hhmm, ttype, sign_char, val_s, rest = tm.groups()
            val = _parse_brl_amount(val_s)
            desc_parts = [rest.strip()] if rest.strip() else []
            j = i + 1
            while j < len(lines):
                nxt = lines[j]
                if (
                    re.match(r"^\d{2}:\d{2}\s+", nxt)
                    or re.match(r"^\d{1,2}\s+de\s+[a-zç]+\s+\d{4}", nxt, re.IGNORECASE)
                    or nxt.startswith("Documento emitido em:")
                    or nxt.startswith("[Página")
                    or re.match(r"^\d+\s+de\s+\d+CNPJ:", nxt)
                    or nxt.startswith("Dúvidas?")
                    or re.match(r"^\d{2}/\d{2}/\d{4}\s+às", nxt)
                    or nxt.startswith("Hora Tipo")
                ):
                    break
                desc_parts.append(nxt)
                j += 1

            full_desc = re.sub(r"\s{2,}", " ", " ".join(desc_parts)).strip()
            pay_mode = "Saldo Conta"
            if "Com saldo + cartão" in full_desc:
                pay_mode = "Saldo + Cartão"
                full_desc = full_desc.replace("Com saldo + cartão", "").strip()
            elif "Com cartão" in full_desc:
                pay_mode = "Cartão"
                full_desc = full_desc.replace("Com cartão", "").strip()
            elif "Com saldo" in full_desc:
                pay_mode = "Saldo Conta"
                full_desc = full_desc.replace("Com saldo", "").strip()

            direction = "out" if sign_char in ("-", "\u2212") else "in"
            dedup = (cur_date, hhmm, direction, val, full_desc[:40])
            if dedup not in seen_tx:
                seen_tx.add(dedup)
                lower_desc = full_desc.lower()
                is_self = "weuller silva gomes" in lower_desc or "do cofrinho" in lower_desc or "guardado no cofrinho" in ttype.lower()
                is_pass_through = val >= 14900.0  # Repasse pontual de 15.000 -> 14.970
                is_salary = direction == "in" and ("inf services" in lower_desc or val == 2800.0)

                transactions.append(
                    {
                        "date_iso": cur_date,
                        "date_br": f"{cur_date[8:10]}/{cur_date[5:7]}",
                        "time": hhmm,
                        "tx_type": ttype,
                        "direction": direction,
                        "amount": val,
                        "title": full_desc or ttype,
                        "payment_method": pay_mode,
                        "category": "salario" if is_salary else _guess_category(full_desc),
                        "is_self_transfer": is_self,
                        "is_pass_through": is_pass_through,
                        "is_salary": is_salary,
                    }
                )
            i = j
            continue
        i += 1

    # Itens de despesa reais (excluindo auto-transferência e repasse atípico) para o histórico
    expense_items: list[dict[str, Any]] = []
    for idx, tx in enumerate(transactions):
        if tx["direction"] != "out" or tx["is_self_transfer"] or tx["is_pass_through"]:
            continue
        expense_items.append(
            {
                "id": f"rag_document_{doc_id}_{idx}",
                "title": f"{tx['title']} ({tx['payment_method']})",
                "amount": tx["amount"],
                "date": tx["date_br"],
                "date_iso": tx["date_iso"],
                "category": tx["category"],
                "source_name": filename,
                "source_type": "rag_document",
                "source_id": doc_id,
                "account_name": card_companion_name if "Cartão" in tx["payment_method"] else account_name,
                "raw_line": f"{tx['date_br']} {tx['time']} - {tx['tx_type']}: {tx['title']} (R$ {tx['amount']:.2f} • {tx['payment_method']})",
            }
        )

    salary_txs = [t for t in transactions if t["is_salary"]]
    detected_salary = salary_txs[0]["amount"] if salary_txs else 2800.0

    return {
        "doc_type": "bank_statement",
        "account_name": account_name,
        "card_companion_name": card_companion_name,
        "final_balance": latest_balance if latest_balance is not None else 18.0,
        "latest_balance_date": latest_balance_date,
        "detected_salary": detected_salary,
        "transactions": transactions,
        "items": expense_items,
    }


def _extract_expenses_from_text(text: str, source_name: str, source_type: str, source_id: int) -> list[dict]:
    items: list[dict] = []
    for line in (text or "").splitlines():
        line_clean = line.strip()
        if not line_clean or len(line_clean) < 4:
            continue
        lower_line = line_clean.lower()
        if any(ign in lower_line for ign in STATEMENT_IGNORE_KEYWORDS):
            continue
        if any(
            phrase in lower_line
            for phrase in ("salário mensal", "salario mensal", "meta de manter", "abaixo de r$", "acima de r$")
        ):
            continue
        for match in BRL_EXPENSE_PATTERN.finditer(line_clean):
            title = match.group("title").strip(" -–•:\t")
            amount = _parse_brl_amount(match.group("amount"))
            date_str = match.group("date") or "Fatura na Memória"
            if amount > 0 and len(title) >= 2:
                inst_info = _detect_installment_info(title)
                item_obj = {
                    "id": f"{source_type}_{source_id}_{len(items)}",
                    "title": title,
                    "amount": amount,
                    "date": date_str,
                    "category": _guess_category(title),
                    "source_name": source_name,
                    "source_type": source_type,
                    "source_id": source_id,
                    "raw_line": line_clean[:160],
                    "is_installment": bool(inst_info),
                }
                if inst_info:
                    item_obj.update(inst_info)
                items.append(item_obj)
    return items


def _ensure_record(
    db: Session,
    title: str,
    category: str,
    record_type: str,
    amount: float,
    account_name: str,
    due_date: str,
    status: str,
    notes: str,
) -> bool:
    existing = (
        db.query(FinanceRecord)
        .filter(
            FinanceRecord.title == title,
            FinanceRecord.due_date == due_date,
        )
        .first()
    )
    if existing:
        existing.amount = amount
        existing.category = category
        existing.record_type = record_type
        existing.account_name = account_name
        existing.notes = notes
        return False

    db.add(
        FinanceRecord(
            title=title,
            category=category,
            record_type=record_type,
            amount=round(amount, 2),
            account_name=account_name,
            due_date=due_date,
            status=status,
            notes=notes,
        )
    )
    return True


def sync_financial_documents_to_db(
    db: Session,
    force_account_update: bool = False,
    doc_ids: Optional[list[int]] = None,
) -> dict[str, Any]:
    """
    Sincroniza automaticamente os PDFs/arquivos de fatura e extrato enviados pelo usuário:
    1. Remove os dados fictícios iniciais (seed de exemplo) caso documentos reais estejam presentes;
    2. Atualiza o Saldo Atual real das contas e limites dos cartões;
    3. Registra o que já foi gasto no mês atual (Outubro/2026);
    4. Anota automaticamente o que tem parcelado na fatura e deixa registrado o que vem nos próximos meses.
    """
    docs_query = db.query(DocumentFile)
    if doc_ids is not None:
        # Só reprocessa os documentos pedidos (ex: o PDF recém-enviado), para não
        # recriar lançamentos que o usuário já excluiu de PDFs antigos.
        docs_query = docs_query.filter(DocumentFile.id.in_(doc_ids))
    all_docs = docs_query.order_by(DocumentFile.created_at.asc()).all()
    if not all_docs:
        return {"synced": False, "reason": "no_documents"}

    # Remove dados fictícios de seed se ainda existirem
    fake_nubank = (
        db.query(FinanceAccount)
        .filter(FinanceAccount.name == "Nubank (Conta + Cartão)", FinanceAccount.balance == 2450.0)
        .first()
    )
    fake_itau = (
        db.query(FinanceAccount)
        .filter(FinanceAccount.name == "Itaú Conta Corrente", FinanceAccount.balance == 1820.5)
        .first()
    )
    if fake_nubank:
        db.delete(fake_nubank)
    if fake_itau:
        db.delete(fake_itau)

    for fake_title in ("Fatura Cartão Nubank", "Internet Fibra + Energia", "Bolsa / Receita Mensal"):
        f_rec = db.query(FinanceRecord).filter(FinanceRecord.title == fake_title).first()
        if f_rec:
            db.delete(f_rec)

    fake_mem = (
        db.query(MemoryFact)
        .filter(MemoryFact.key == "Fatura Cartão Nubank - Setembro/Outubro (Histórico)")
        .first()
    )
    if fake_mem:
        db.delete(fake_mem)
    db.commit()

    created_records = 0
    updated_accounts = 0
    installments_registered = 0

    for doc in all_docs:
        full_text = _get_document_full_text(db, doc)
        if not full_text.strip():
            continue

        # 1. Verifica se é Fatura de Cartão de Crédito (ex: Mercado Pago Visa)
        card_parsed = _parse_credit_card_statement_doc(full_text, doc.filename, doc.id)
        if card_parsed:
            if doc.category == "geral":
                doc.category = "financas"

            c_name = card_parsed["card_name"]
            acc = db.query(FinanceAccount).filter(FinanceAccount.name == c_name).first()
            if not acc:
                acc = FinanceAccount(
                    name=c_name,
                    account_type="credit_card",
                    balance=card_parsed["used_limit"],
                    credit_limit=card_parsed["credit_limit"],
                    closing_day=card_parsed["closing_day"],
                    due_day=card_parsed["due_day"],
                )
                db.add(acc)
                updated_accounts += 1
            elif force_account_update:
                acc.account_type = "credit_card"
                acc.balance = card_parsed["used_limit"]
                acc.credit_limit = card_parsed["credit_limit"]
                acc.closing_day = card_parsed["closing_day"]
                acc.due_day = card_parsed["due_day"]
                updated_accounts += 1

            # Registra a fatura fechada do mês atual (ex: Outubro/2026 - R$ 606,74)
            stmt_month_label = _format_month_label(card_parsed["statement_month_key"])
            if card_parsed["statement_total"] > 0:
                if _ensure_record(
                    db=db,
                    title=f"Fatura {c_name} ({stmt_month_label} - {len(card_parsed['items'])} compras)",
                    category="cartao",
                    record_type="card_bill",
                    amount=card_parsed["statement_total"],
                    account_name=c_name,
                    due_date=card_parsed["due_date_iso"],
                    status="paid" if card_parsed["is_paid"] else "pending",
                    notes=(
                        f"Fatura de {stmt_month_label} extraída de {doc.filename}. "
                        f"Total de consumos: R$ {card_parsed['statement_total']:.2f} "
                        f"({'Paga em 09/10/2026' if card_parsed['is_paid'] else 'Pendente'})."
                    ),
                ):
                    created_records += 1

            # Registra cada compra parcelada e gera as parcelas dos próximos meses!
            for inst in card_parsed["installments"]:
                curr_n = inst["current_installment"]
                tot_n = inst["total_installments"]
                rem_n = inst["remaining_installments"]
                amt = inst["installment_amount"]
                base_due = inst["statement_due_date"]

                for step in range(1, rem_n + 1):
                    next_inst_num = curr_n + step
                    future_due_date = _add_months(base_due, step)
                    future_month_label = _format_month_label(future_due_date[:7])
                    rec_title = f"{inst['clean_title']} (Parcela {next_inst_num} de {tot_n})"
                    rec_notes = (
                        f"[PARCELADO {next_inst_num}/{tot_n}] Compra realizada em {inst['purchase_date']} "
                        f"no {c_name} • {tot_n}x de R$ {amt:.2f} (Total R$ {inst['total_purchase_amount']:.2f}) "
                        f"• Parcela {curr_n}/{tot_n} paga em {stmt_month_label} • Vencimento em {future_month_label} "
                        f"• Extraído de {doc.filename}"
                    )
                    if _ensure_record(
                        db=db,
                        title=rec_title,
                        category="parcelado",
                        record_type="card_bill",
                        amount=amt,
                        account_name=c_name,
                        due_date=future_due_date,
                        status="pending",
                        notes=rec_notes,
                    ):
                        created_records += 1
                        installments_registered += 1

            # Identifica assinaturas recorrentes no cartão (ex: Google / YouTube) para previsão do próximo mês
            recurring_card_subs = [
                it
                for it in card_parsed["items"]
                if any(k in it["title"].lower() for k in ("youtube", "dl*google", "spotify", "netflix", "prime"))
                and not it.get("is_installment")
            ]
            if recurring_card_subs:
                subs_total = round(sum(s["amount"] for s in recurring_card_subs), 2)
                next_due = _add_months(card_parsed["due_date_iso"], 1)
                subs_names = ", ".join(f"{s['title']} (R$ {s['amount']:.2f})" for s in recurring_card_subs)
                if _ensure_record(
                    db=db,
                    title=f"Assinaturas Digitais no Cartão ({_format_month_label(next_due[:7])})",
                    category="assinaturas & lazer",
                    record_type="card_bill",
                    amount=subs_total,
                    account_name=c_name,
                    due_date=next_due,
                    status="pending",
                    notes=f"[RECORRENTE MENSAL] Assinaturas fixas na fatura {c_name}: {subs_names}",
                ):
                    created_records += 1
            continue

        # 2. Verifica se é Extrato de Conta Bancária (ex: PicPay)
        bank_parsed = _parse_bank_extrato_doc(full_text, doc.filename, doc.id)
        if bank_parsed:
            if doc.category == "geral":
                doc.category = "financas"

            acc_name = bank_parsed["account_name"]
            acc = db.query(FinanceAccount).filter(FinanceAccount.name == acc_name).first()
            if not acc:
                acc = FinanceAccount(
                    name=acc_name,
                    account_type="checking",
                    balance=bank_parsed["final_balance"],
                    credit_limit=0.0,
                )
                db.add(acc)
                updated_accounts += 1
            elif force_account_update:
                acc.balance = bank_parsed["final_balance"]
                updated_accounts += 1

            # Salva ou atualiza o Salário Mensal na Memória Core se detectado
            sal_fact = db.query(MemoryFact).filter(MemoryFact.key == "Salário Mensal").first()
            if not sal_fact and bank_parsed["detected_salary"] > 0:
                db.add(
                    MemoryFact(
                        category="financas",
                        key="Salário Mensal",
                        content=f"O salário mensal de Weuller é de R$ {bank_parsed['detected_salary']:.2f} (recebido via INF SERVICES LTDA no início do mês).",
                        importance=5,
                        source="agent_auto",
                        pinned=True,
                    )
                )

            txs = bank_parsed["transactions"]
            oct_txs = [t for t in txs if t["date_iso"].startswith("2026-10")]

            # Receitas de Outubro
            for t in oct_txs:
                if t["direction"] == "in" and t["is_salary"]:
                    _ensure_record(
                        db=db,
                        title="Salário Mensal (INF SERVICES LTDA)",
                        category="salario",
                        record_type="income",
                        amount=t["amount"],
                        account_name=acc_name,
                        due_date=t["date_iso"],
                        status="paid",
                        notes=f"Pix recebido em {t['date_br']} às {t['time']} • Extraído de {doc.filename}",
                    )

            other_oct_in = round(
                sum(
                    t["amount"]
                    for t in oct_txs
                    if t["direction"] == "in"
                    and not t["is_salary"]
                    and not t["is_self_transfer"]
                    and not t["is_pass_through"]
                ),
                2,
            )
            if other_oct_in > 0:
                _ensure_record(
                    db=db,
                    title="Outras Entradas Pix em Outubro (Divina, Nexus, Ana Beatriz, Pedro)",
                    category="outros",
                    record_type="income",
                    amount=other_oct_in,
                    account_name=acc_name,
                    due_date="2026-10-16",
                    status="paid",
                    notes="Soma de Pix recebidos de terceiros em Outubro/2026 no extrato PicPay",
                )

            # Despesas pagas em Outubro via Conta PicPay e compras no Cartão PicPay Card
            card_next_month_accum = 0.0

            for t in oct_txs:
                if t["direction"] != "out" or t["is_self_transfer"] or t["is_pass_through"]:
                    continue

                desc_low = t["title"].lower()
                if "fatura picpay card" in desc_low:
                    _ensure_record(
                        db=db,
                        title="Fatura PicPay Card (Outubro/2026)",
                        category="cartao",
                        record_type="card_bill",
                        amount=t["amount"],
                        account_name=acc_name,
                        due_date=t["date_iso"],
                        status="paid",
                        notes=f"Pagamento realizado com saldo em {t['date_br']} às {t['time']}",
                    )
                elif "cemig" in desc_low:
                    _ensure_record(
                        db=db,
                        title="Conta de Energia - CEMIG/MG (Outubro/2026)",
                        category="moradia",
                        record_type="expense",
                        amount=t["amount"],
                        account_name=acc_name,
                        due_date=t["date_iso"],
                        status="paid",
                        notes=f"Pagamento realizado com saldo em {t['date_br']} às {t['time']}",
                    )
                    # Registra previsão da CEMIG para o próximo mês (Novembro/2026)
                    _ensure_record(
                        db=db,
                        title="Conta de Energia - CEMIG/MG (Previsão Nov/2026)",
                        category="moradia",
                        record_type="expense",
                        amount=t["amount"],
                        account_name=acc_name,
                        due_date=_add_months(t["date_iso"], 1),
                        status="pending",
                        notes="[CONTA FIXA MENSAL] Previsão baseada nas contas de Set/2026 (R$ 181,29) e Out/2026 (R$ 201,42)",
                    )
                elif "editora e distribuidora" in desc_low:
                    # Em 07/10 o saldo antes do pagamento era R$ 282,40 e o boleto foi R$ 395,13 (Saldo + Cartão)
                    saldo_part = 282.40 if t["payment_method"] == "Saldo + Cartão" and t["amount"] == 395.13 else t["amount"]
                    card_part = round(t["amount"] - saldo_part, 2)
                    _ensure_record(
                        db=db,
                        title="Faculdade - Editora e Distribuidora Educacional S/A (Out/2026)",
                        category="faculdade",
                        record_type="expense",
                        amount=t["amount"],
                        account_name=acc_name,
                        due_date=t["date_iso"],
                        status="paid",
                        notes=(
                            f"Boleto da faculdade pago em {t['date_br']} (R$ {saldo_part:.2f} via saldo PicPay "
                            f"+ R$ {card_part:.2f} financiado no PicPay Card)"
                        ),
                    )
                    if card_part > 0:
                        card_next_month_accum += card_part
                        _ensure_record(
                            db=db,
                            title="Faculdade Editora Educacional (Parte no PicPay Card p/ Nov/2026)",
                            category="faculdade",
                            record_type="card_bill",
                            amount=card_part,
                            account_name=bank_parsed["card_companion_name"],
                            due_date="2026-11-06",
                            status="pending",
                            notes=(
                                f"[FATURA PRÓXIMO MÊS] Parte do pagamento de 07/10 (Total R$ {t['amount']:.2f} "
                                f"- R$ {saldo_part:.2f} do saldo = R$ {card_part:.2f} no cartão) para a fatura de Novembro/2026"
                            ),
                        )
                    # Registra mensalidade da faculdade prevista para Novembro/2026
                    _ensure_record(
                        db=db,
                        title="Faculdade - Editora Educacional S/A (Mensalidade Nov/2026)",
                        category="faculdade",
                        record_type="expense",
                        amount=t["amount"],
                        account_name=acc_name,
                        due_date=_add_months(t["date_iso"], 1),
                        status="pending",
                        notes="[CONTA FIXA MENSAL] Previsão baseada nos pagamentos de Set/2026 (R$ 387,68) e Out/2026 (R$ 395,13)",
                    )
                elif "ifood" in desc_low and "Cartão" in t["payment_method"]:
                    card_next_month_accum += t["amount"]
                    _ensure_record(
                        db=db,
                        title="iFood.com Restaurantes (Compra no PicPay Card em 07/10)",
                        category="alimentacao",
                        record_type="card_bill",
                        amount=t["amount"],
                        account_name=bank_parsed["card_companion_name"],
                        due_date="2026-11-06",
                        status="pending",
                        notes=f"[FATURA PRÓXIMO MÊS] Pix com Cartão PicPay em {t['date_br']} às {t['time']} • Vem na fatura de Novembro/2026",
                    )
                elif "rfa multisservicos" in desc_low and "Cartão" in t["payment_method"]:
                    card_next_month_accum += t["amount"]
                    _ensure_record(
                        db=db,
                        title="RFA Multisserviços e Papelaria (Compra no PicPay Card em 07/10)",
                        category="faculdade",
                        record_type="card_bill",
                        amount=t["amount"],
                        account_name=bank_parsed["card_companion_name"],
                        due_date="2026-11-06",
                        status="pending",
                        notes=f"[FATURA PRÓXIMO MÊS] Pix Saldo+Cartão em {t['date_br']} às {t['time']} • Vem na fatura de Novembro/2026",
                    )
                elif "netflix" in desc_low:
                    _ensure_record(
                        db=db,
                        title="Netflix Entretenimento (Outubro/2026)",
                        category="assinaturas & lazer",
                        record_type="expense",
                        amount=t["amount"],
                        account_name=acc_name,
                        due_date=t["date_iso"],
                        status="paid",
                        notes=f"Compra no saldo em {t['date_br']} às {t['time']}",
                    )
                    _ensure_record(
                        db=db,
                        title="Netflix Entretenimento (Assinatura Nov/2026)",
                        category="assinaturas & lazer",
                        record_type="expense",
                        amount=t["amount"],
                        account_name=acc_name,
                        due_date=_add_months(t["date_iso"], 1),
                        status="pending",
                        notes="[RECORRENTE MENSAL] Assinatura mensal Netflix",
                    )
                elif "mercearia lidiane" in desc_low:
                    _ensure_record(
                        db=db,
                        title="Mercearia Lidiane Ltda",
                        category="alimentacao",
                        record_type="expense",
                        amount=t["amount"],
                        account_name=acc_name,
                        due_date=t["date_iso"],
                        status="paid",
                        notes=f"Pix enviado em {t['date_br']} às {t['time']}",
                    )
                elif "jheyce kele" in desc_low:
                    _ensure_record(
                        db=db,
                        title="Pix Enviado - Jheyce Kele Ramos Nascimento",
                        category="outros",
                        record_type="expense",
                        amount=t["amount"],
                        account_name=acc_name,
                        due_date=t["date_iso"],
                        status="paid",
                        notes=f"Pix enviado em {t['date_br']} às {t['time']}",
                    )
                elif "elizabeth vieira" in desc_low:
                    _ensure_record(
                        db=db,
                        title="Pix Enviado - Elizabeth Vieira Gomes",
                        category="pessoal",
                        record_type="expense",
                        amount=t["amount"],
                        account_name=acc_name,
                        due_date=t["date_iso"],
                        status="paid",
                        notes=f"Pix enviado em {t['date_br']} às {t['time']}",
                    )

            # Agrupa os Pix para Ana Beatriz em Outubro (R$ 160 + R$ 92 = R$ 252)
            ana_oct = round(
                sum(
                    t["amount"]
                    for t in oct_txs
                    if t["direction"] == "out" and "ana beatriz" in t["title"].lower()
                ),
                2,
            )
            if ana_oct > 0:
                _ensure_record(
                    db=db,
                    title="Pix Enviados - Ana Beatriz Sabino Menezes (06/10 e 07/10)",
                    category="pessoal",
                    record_type="expense",
                    amount=ana_oct,
                    account_name=acc_name,
                    due_date="2026-10-07",
                    status="paid",
                    notes="Pix enviados: R$ 160,00 em 06/10 + R$ 92,00 em 07/10",
                )

            # Agrupa os 5 micro-envios Pix de R$ 10,00 (04/10 e 05/10)
            micro_oct = round(
                sum(
                    t["amount"]
                    for t in oct_txs
                    if t["direction"] == "out" and t["amount"] == 10.0 and not t["is_self_transfer"]
                ),
                2,
            )
            if micro_oct > 0:
                _ensure_record(
                    db=db,
                    title="Micro-pagamentos Pix (JMV, Max, Paystrata, Swapx, ECC)",
                    category="outros",
                    record_type="expense",
                    amount=micro_oct,
                    account_name=acc_name,
                    due_date="2026-10-05",
                    status="paid",
                    notes="5 envios Pix de R$ 10,00 realizados entre 04/10 e 05/10",
                )

            # Cria/atualiza o cartão PicPay Card com o acumulado para a próxima fatura
            if card_next_month_accum > 0:
                pp_card = (
                    db.query(FinanceAccount)
                    .filter(FinanceAccount.name == bank_parsed["card_companion_name"])
                    .first()
                )
                if not pp_card:
                    pp_card = FinanceAccount(
                        name=bank_parsed["card_companion_name"],
                        account_type="credit_card",
                        balance=round(card_next_month_accum, 2),
                        credit_limit=1000.0,
                        closing_day=1,
                        due_day=6,
                    )
                    db.add(pp_card)
                    updated_accounts += 1
                elif force_account_update:
                    pp_card.balance = round(card_next_month_accum, 2)

    db.commit()
    return {
        "synced": True,
        "updated_accounts": updated_accounts,
        "created_records": created_records,
        "installments_registered": installments_registered,
    }


def _get_monthly_salary(db: Session, records: list[FinanceRecord]) -> float:
    """Obtém o salário mensal do usuário a partir da Memória Core ou dos lançamentos de receita."""
    sal_mem = (
        db.query(MemoryFact)
        .filter(
            (MemoryFact.key.ilike("%salário%"))
            | (MemoryFact.key.ilike("%salario%"))
        )
        .order_by(MemoryFact.updated_at.desc())
        .first()
    )
    if sal_mem:
        m = re.search(r"R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|\d+(?:\.\d{1,2}))", sal_mem.content)
        if m:
            val = _parse_brl_amount(m.group(1))
            if val > 0:
                return val

    sal_recs = [r for r in records if r.record_type == "income" and r.category == "salario"]
    if sal_recs:
        return round(sal_recs[0].amount, 2)
    return 0.0


@router.get("/summary")
def get_finance_summary(db: Session = Depends(get_db)):
    accounts = db.query(FinanceAccount).order_by(FinanceAccount.account_type.asc(), FinanceAccount.name.asc()).all()
    records = db.query(FinanceRecord).order_by(FinanceRecord.due_date.asc(), FinanceRecord.created_at.desc()).all()

    # Saldo atual em contas correntes/investimento (não soma limite/dívida de cartão como saldo positivo)
    checking_accounts = [a for a in accounts if a.account_type != "credit_card"]
    credit_cards = [a for a in accounts if a.account_type == "credit_card" or a.credit_limit > 0]

    total_balance = round(sum(a.balance for a in checking_accounts), 2)
    total_credit_limit = round(sum(a.credit_limit for a in accounts if a.credit_limit), 2)
    total_credit_used = round(
        sum(a.balance for a in accounts if a.account_type == "credit_card"),
        2,
    )
    total_credit_available = round(max(0.0, total_credit_limit - total_credit_used), 2)

    pending_bills = round(
        sum(r.amount for r in records if r.status == "pending" and r.record_type in ("expense", "card_bill")),
        2,
    )
    paid_expenses = round(
        sum(r.amount for r in records if r.status == "paid" and r.record_type in ("expense", "card_bill")),
        2,
    )
    total_income = round(sum(r.amount for r in records if r.record_type == "income"), 2)

    monthly_salary = _get_monthly_salary(db, records)

    # Determina mês atual (ex: "2026-10")
    now_str = datetime.now().strftime("%Y-%m")
    current_month_key = now_str
    current_month_label = _format_month_label(current_month_key)

    # --- 1. O QUE JÁ GASTEI ESSE MÊS (MÊS ATUAL) ---
    current_month_records = [
        r
        for r in records
        if (r.due_date or "").startswith(current_month_key) and r.record_type in ("expense", "card_bill")
    ]
    # Também inclui compras feitas neste mês que caíram no cartão para o próximo mês (para mostrar na visão do mês)
    next_month_key = _add_months(f"{current_month_key}-10", 1)[:7]
    oct_card_purchases_for_next_bill = [
        r
        for r in records
        if (r.due_date or "").startswith(next_month_key)
        and r.status == "pending"
        and ("[FATURA" in (r.notes or "") or "[PARCELADO" in (r.notes or ""))
    ]

    paid_this_month = round(sum(r.amount for r in current_month_records if r.status == "paid"), 2)
    pending_this_month = round(sum(r.amount for r in current_month_records if r.status == "pending"), 2)
    total_spent_this_month = round(paid_this_month + pending_this_month, 2)
    card_bills_paid_this_month = round(
        sum(r.amount for r in current_month_records if r.record_type == "card_bill" and r.status == "paid"),
        2,
    )
    direct_expenses_this_month = round(
        sum(r.amount for r in current_month_records if r.record_type == "expense"),
        2,
    )
    new_card_spend_next_bill = round(sum(r.amount for r in oct_card_purchases_for_next_bill), 2)

    # Entradas extras do mês (Pix recebido, freela...). O salário em si já entra por monthly_salary.
    extra_income_this_month = round(
        sum(
            r.amount
            for r in records
            if r.record_type == "income"
            and r.category != "salario"
            and (r.due_date or "").startswith(current_month_key)
        ),
        2,
    )

    month_cat_totals: dict[str, float] = {}
    for r in current_month_records:
        cat = r.category or "outros"
        month_cat_totals[cat] = round(month_cat_totals.get(cat, 0.0) + r.amount, 2)
    current_month_categories = [
        {"category": k, "total": v}
        for k, v in sorted(month_cat_totals.items(), key=lambda x: x[1], reverse=True)
    ]

    # Extrai também os itens individuais da fatura de cartão do mês atual para exibição detalhada
    current_card_statement_items: list[dict[str, Any]] = []
    for doc in db.query(DocumentFile).all():
        txt = _get_document_full_text(db, doc)
        parsed_c = _parse_credit_card_statement_doc(txt, doc.filename, doc.id)
        if parsed_c and parsed_c["items"]:
            current_card_statement_items.extend(parsed_c["items"])

    # --- 2. COMPRAS PARCELADAS ATIVAS (ANOTADAS DA FATURA E MANUAIS) ---
    installment_records = [
        r
        for r in records
        if r.category in ("parcelado", "financiamento")
        or "parcela" in (r.title or "").lower()
        or "[parcelado" in (r.notes or "").lower()
        or "[financiamento" in (r.notes or "").lower()
    ]

    grouped_installments: dict[str, dict[str, Any]] = {}
    for r in installment_records:
        info = _detect_installment_info(r.title) or _detect_installment_info(r.notes or "")
        base_name = info["clean_title"] if info else r.title
        curr_n = info["current_installment"] if info else 2
        tot_n = info["total_installments"] if info else 2

        if base_name not in grouped_installments:
            paid_installments = max(0, curr_n - 1) if r.status == "pending" else curr_n
            grouped_installments[base_name] = {
                "id": r.id,
                "title": base_name,
                "account_name": r.account_name,
                "category": "financiamento" if r.category == "financiamento" else "parcelado",
                "installment_amount": round(r.amount, 2),
                "paid_installments": paid_installments,
                "total_installments": tot_n,
                "remaining_installments": 0,
                "total_purchase_amount": round(r.amount * tot_n, 2),
                "remaining_total_amount": 0.0,
                "next_due_date": r.due_date,
                "status": r.status,
                "notes": r.notes,
                "schedule": [],
            }

        grp = grouped_installments[base_name]
        grp["schedule"].append(
            {
                "record_id": r.id,
                "title": r.title,
                "installment_number": curr_n,
                "total_installments": tot_n,
                "amount": round(r.amount, 2),
                "due_date": r.due_date,
                "month_label": _format_month_label((r.due_date or "")[:7]),
                "status": r.status,
            }
        )
        if r.status == "pending":
            grp["remaining_installments"] += 1
            grp["remaining_total_amount"] = round(grp["remaining_total_amount"] + r.amount, 2)
            if not grp["next_due_date"] or (r.due_date and r.due_date < grp["next_due_date"]):
                grp["next_due_date"] = r.due_date

    installments_list = list(grouped_installments.values())
    monthly_installments_total = round(
        sum(i["installment_amount"] for i in installments_list if i["remaining_installments"] > 0),
        2,
    )
    total_remaining_installments_debt = round(
        sum(i["remaining_total_amount"] for i in installments_list),
        2,
    )

    # --- 3. O QUE TEM PARA VIR NOS PRÓXIMOS MESES (PROJEÇÃO MENSAL) ---
    future_pending_records = [
        r
        for r in records
        if r.status == "pending"
        and r.record_type in ("expense", "card_bill")
        and (not r.due_date or r.due_date[:7] >= next_month_key)
    ]

    months_map: dict[str, list[FinanceRecord]] = {}
    for step in range(1, 4):
        m_key = _add_months(f"{current_month_key}-10", step)[:7]
        months_map[m_key] = []

    for r in future_pending_records:
        m_key = (r.due_date or next_month_key)[:7]
        if m_key not in months_map:
            months_map[m_key] = []
        months_map[m_key].append(r)

    # Calcula o piso de contas fixas/recorrentes mensais (Faculdade + Luz + Assinaturas) a partir do próximo mês
    baseline_recurring_records = [
        r
        for r in months_map.get(next_month_key, [])
        if r.category != "financiamento"  # já somado em parcelas
        and (r.record_type == "expense" or "[recorrente" in (r.notes or "").lower() or "[conta fixa" in (r.notes or "").lower())
    ]
    baseline_recurring_sum = round(sum(r.amount for r in baseline_recurring_records), 2)

    upcoming_months = []
    for m_key in sorted(months_map.keys()):
        m_recs = months_map[m_key]
        inst_sum = round(
            sum(
                r.amount
                for r in m_recs
                if r.category in ("parcelado", "financiamento")
                or "parcela" in (r.title or "").lower()
                or "[parcelado" in (r.notes or "").lower()
            ),
            2,
        )
        card_accum_sum = round(
            sum(
                r.amount
                for r in m_recs
                if r.record_type == "card_bill"
                and r.category != "parcelado"
                and "parcela" not in (r.title or "").lower()
                and "[recorrente" not in (r.notes or "").lower()
            ),
            2,
        )
        explicit_recurring_sum = round(
            sum(
                r.amount
                for r in m_recs
                if r.category != "financiamento"  # já somado em parcelas
                and (r.record_type == "expense" or "[recorrente" in (r.notes or "").lower())
            ),
            2,
        )
        recurring_sum = explicit_recurring_sum if explicit_recurring_sum > 0 else baseline_recurring_sum
        total_committed = round(inst_sum + card_accum_sum + recurring_sum, 2)
        leftover_all = round(monthly_salary - total_committed, 2)
        leftover_after_cards = round(monthly_salary - (inst_sum + card_accum_sum), 2)
        committed_pct = round(min(100.0, (total_committed / monthly_salary) * 100), 1) if monthly_salary > 0 else 0.0

        upcoming_months.append(
            {
                "month_key": m_key,
                "month_label": _format_month_label(m_key),
                "expected_salary": monthly_salary,
                "installments_total": inst_sum,
                "card_accumulated_total": card_accum_sum,
                "recurring_bills_total": recurring_sum,
                "total_committed": total_committed,
                "projected_leftover": leftover_all,
                "projected_leftover_after_cards_only": leftover_after_cards,
                "committed_percent": committed_pct,
                "items": [FinanceRecordOut.model_validate(r) for r in m_recs],
            }
        )

    # --- 4. PREVISÃO DE QUANTO VAI SOBRAR DO MEU SALÁRIO ---
    next_month_proj = upcoming_months[0] if upcoming_months else {
        "month_label": _format_month_label(next_month_key),
        "installments_total": 0.0,
        "card_accumulated_total": 0.0,
        "recurring_bills_total": 0.0,
        "total_committed": 0.0,
        "projected_leftover": monthly_salary,
        "projected_leftover_after_cards_only": monthly_salary,
        "committed_percent": 0.0,
    }
    savings_goal_20pct = round(monthly_salary * 0.20, 2)
    free_after_savings = round(max(0.0, next_month_proj["projected_leftover"] - savings_goal_20pct), 2)

    salary_forecast = {
        "monthly_salary": monthly_salary,
        "current_checking_balance": total_balance,
        "total_credit_limit": total_credit_limit,
        "total_credit_used": total_credit_used,
        "total_credit_available": total_credit_available,
        "current_month_label": current_month_label,
        "spent_this_month": total_spent_this_month,
        "extra_income_this_month": extra_income_this_month,
        # Quanto ainda sobra do salário deste mês depois de tudo que foi lançado nele
        "current_month_leftover": round(monthly_salary + extra_income_this_month - total_spent_this_month, 2),
        "next_month_label": next_month_proj["month_label"],
        "next_month_installments_total": next_month_proj["installments_total"],
        "next_month_card_accumulated": next_month_proj["card_accumulated_total"],
        "next_month_cards_and_installments": round(
            next_month_proj["installments_total"] + next_month_proj["card_accumulated_total"], 2
        ),
        "next_month_fixed_bills": next_month_proj["recurring_bills_total"],
        "next_month_total_committed": next_month_proj["total_committed"],
        "projected_salary_leftover": next_month_proj["projected_leftover"],
        "projected_leftover_after_cards_only": next_month_proj["projected_leftover_after_cards_only"],
        "committed_percent": next_month_proj["committed_percent"],
        "savings_goal_20pct": savings_goal_20pct,
        "free_after_savings_goal": free_after_savings,
    }

    return {
        "total_balance": total_balance,
        "total_credit_limit": total_credit_limit,
        "total_credit_used": total_credit_used,
        "total_credit_available": total_credit_available,
        "pending_bills": pending_bills,
        "paid_expenses": paid_expenses,
        "total_income": total_income,
        "monthly_salary": monthly_salary,
        "current_month_summary": {
            "month_key": current_month_key,
            "month_label": current_month_label,
            "salary_received": monthly_salary,
            "total_spent_this_month": total_spent_this_month,
            "paid_this_month": paid_this_month,
            "pending_this_month": pending_this_month,
            "card_bills_paid_this_month": card_bills_paid_this_month,
            "direct_expenses_this_month": direct_expenses_this_month,
            "new_card_spend_next_bill": new_card_spend_next_bill,
            "categories": current_month_categories,
            "items": [FinanceRecordOut.model_validate(r) for r in current_month_records],
            "card_statement_items": current_card_statement_items,
        },
        "installments_summary": {
            "active_count": len(installments_list),
            "monthly_total": monthly_installments_total,
            "total_remaining_debt": total_remaining_installments_debt,
            "items": installments_list,
        },
        "upcoming_months": upcoming_months,
        "salary_forecast": salary_forecast,
        "accounts": [FinanceAccountOut.model_validate(a) for a in accounts],
        "records": [FinanceRecordOut.model_validate(r) for r in records],
    }


@router.post("/sync-statements")
def sync_statements_endpoint(db: Session = Depends(get_db)):
    """Força a releitura de todas as faturas/extratos enviados e atualiza saldos, parcelas e previsões."""
    result = sync_financial_documents_to_db(db=db, force_account_update=True)
    return {
        "status": "ok",
        "sync_result": result,
        "summary": get_finance_summary(db=db),
    }


@router.post("/installments")
def create_installment_purchase(payload: InstallmentCreate, db: Session = Depends(get_db)):
    """
    Registra uma compra parcelada anotando a parcela atual e gerando automaticamente
    todas as parcelas restantes para os próximos meses.
    """
    base_date = payload.first_due_date or datetime.now().strftime("%Y-%m-14")
    tot_n = payload.total_installments
    curr_n = payload.current_installment
    amt = round(payload.installment_amount, 2)
    total_purchase = round(amt * tot_n, 2)
    clean_title = payload.title.strip()
    # Financiamento: débito mensal na conta (não entra na fatura do cartão)
    is_financing = (payload.category or "").lower() == "financiamento"
    category = "financiamento" if is_financing else (payload.category or "parcelado")
    record_type = "expense" if is_financing else "card_bill"
    tag = "FINANCIAMENTO" if is_financing else "PARCELADO"
    kind_label = "Financiamento" if is_financing else "Compra"

    created_items = []
    # Se a parcela atual ainda não foi paga (ou o usuário quer registrar a partir da atual)
    start_offset = 1 if payload.current_month_paid else 0
    for step in range(start_offset, (tot_n - curr_n) + 1):
        inst_num = curr_n + step
        due_dt = _add_months(base_date, step)
        rec = FinanceRecord(
            title=f"{clean_title} (Parcela {inst_num} de {tot_n})",
            category=category,
            record_type=record_type,
            amount=amt,
            account_name=payload.account_name,
            due_date=due_dt,
            status="pending",
            notes=(
                f"[{tag} {inst_num}/{tot_n}] {kind_label} em {tot_n}x de R$ {amt:.2f} "
                f"(Total R$ {total_purchase:.2f})"
                + (f" • {payload.notes}" if payload.notes else "")
            ),
        )
        db.add(rec)
        created_items.append(rec)

    db.commit()
    return {
        "status": "created",
        "created_installments_count": len(created_items),
        "title": clean_title,
        "installment_amount": amt,
        "total_installments": tot_n,
        "category": category,
    }


@router.put("/installments")
def update_installment_group(payload: InstallmentGroupUpdate, db: Session = Depends(get_db)):
    """Edita nome, valor da parcela e cartão/banco de todas as parcelas de um parcelamento."""
    recs = db.query(FinanceRecord).filter(FinanceRecord.id.in_(payload.record_ids)).all()
    if not recs:
        raise HTTPException(status_code=404, detail="Parcelamento não encontrado")
    new_title = payload.title.strip() if payload.title else None
    for rec in recs:
        if new_title:
            info = _detect_installment_info(rec.title) or _detect_installment_info(rec.notes or "")
            if info:
                rec.title = f"{new_title} (Parcela {info['current_installment']} de {info['total_installments']})"
            else:
                rec.title = new_title
        if payload.installment_amount is not None:
            rec.amount = round(payload.installment_amount, 2)
        if payload.account_name is not None:
            rec.account_name = payload.account_name
    db.commit()
    return {"status": "updated", "updated_count": len(recs)}


@router.post("/installments/delete")
def delete_installment_group(payload: InstallmentGroupDelete, db: Session = Depends(get_db)):
    """Exclui todas as parcelas de um parcelamento/financiamento."""
    deleted = (
        db.query(FinanceRecord)
        .filter(FinanceRecord.id.in_(payload.record_ids))
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"status": "deleted", "deleted_count": deleted}


@router.post("/salary")
def update_monthly_salary(payload: SalaryUpdatePayload, db: Session = Depends(get_db)):
    """Atualiza o salário mensal base na Memória Core e no registro de receita para o cálculo de previsão."""
    sal_mem = (
        db.query(MemoryFact)
        .filter(
            (MemoryFact.key.ilike("%salário%"))
            | (MemoryFact.key.ilike("%salario%"))
        )
        .first()
    )
    content_txt = f"O salário mensal de Weuller é de R$ {payload.monthly_salary:.2f} (Conta: {payload.account_name}, Dia {payload.pay_day})."
    if sal_mem:
        sal_mem.content = content_txt
    else:
        db.add(
            MemoryFact(
                category="financas",
                key="Salário Mensal",
                content=content_txt,
                importance=5,
                source="user",
                pinned=True,
            )
        )

    sal_rec = (
        db.query(FinanceRecord)
        .filter(FinanceRecord.record_type == "income", FinanceRecord.category == "salario")
        .first()
    )
    if sal_rec:
        sal_rec.amount = round(payload.monthly_salary, 2)
        sal_rec.account_name = payload.account_name

    db.commit()
    return {"status": "ok", "monthly_salary": round(payload.monthly_salary, 2)}


@router.get("/statement-history")
def get_statement_history_from_memory(db: Session = Depends(get_db)):
    """
    Analisa todas as faturas e extratos salvos no RAG (DocumentFile) e na Core Memory (MemoryFact),
    sem duplicar chunks por overlap e separando compras de cartão, parcelamentos e movimentações de extrato.
    """
    all_docs = db.query(DocumentFile).order_by(DocumentFile.created_at.desc()).all()

    memory_statements = []
    all_extracted_items: list[dict] = []

    for doc in all_docs:
        full_text = _get_document_full_text(db, doc)
        card_parsed = _parse_credit_card_statement_doc(full_text, doc.filename, doc.id)
        bank_parsed = _parse_bank_extrato_doc(full_text, doc.filename, doc.id) if not card_parsed else None

        if card_parsed:
            parsed_items = card_parsed["items"]
        elif bank_parsed:
            parsed_items = bank_parsed["items"]
        else:
            parsed_items = _extract_expenses_from_text(
                text=full_text,
                source_name=doc.filename,
                source_type="rag_document",
                source_id=doc.id,
            )

        if parsed_items or doc.category == "financas":
            total_doc_amount = round(sum(i["amount"] for i in parsed_items), 2)
            memory_statements.append(
                {
                    "source_id": doc.id,
                    "source_type": "rag_document",
                    "title": doc.filename,
                    "category": doc.category,
                    "created_at": doc.created_at,
                    "chunk_count": doc.chunk_count,
                    "items_count": len(parsed_items),
                    "total_amount": total_doc_amount,
                    "preview_text": (full_text[:450] + "...") if len(full_text) > 450 else full_text,
                    "items": parsed_items,
                }
            )
            all_extracted_items.extend(parsed_items)

    # Fatos na Core Memory que sejam faturas coladas manualmente (ignorando regras gerais e salário)
    fin_memories = (
        db.query(MemoryFact)
        .filter(
            (MemoryFact.key.ilike("%fatura%"))
            | (MemoryFact.key.ilike("%extrato%"))
        )
        .order_by(MemoryFact.updated_at.desc())
        .all()
    )

    for mem in fin_memories:
        parsed_items = _extract_expenses_from_text(
            text=mem.content,
            source_name=f"Memória Core: {mem.key}",
            source_type="core_memory",
            source_id=mem.id,
        )
        if not parsed_items:
            continue
        total_mem_amount = round(sum(i["amount"] for i in parsed_items), 2)
        memory_statements.append(
            {
                "source_id": mem.id,
                "source_type": "core_memory",
                "title": f"Memória: {mem.key}",
                "category": mem.category,
                "created_at": mem.updated_at,
                "chunk_count": 1,
                "items_count": len(parsed_items),
                "total_amount": total_mem_amount,
                "preview_text": mem.content,
                "items": parsed_items,
            }
        )
        all_extracted_items.extend(parsed_items)

    # Agrupamento por categoria para análise visual
    category_totals: dict[str, float] = {}
    for item in all_extracted_items:
        cat = item.get("category") or "outros"
        category_totals[cat] = round(category_totals.get(cat, 0.0) + float(item["amount"]), 2)

    category_breakdown = [
        {"category": k, "total": v}
        for k, v in sorted(category_totals.items(), key=lambda x: x[1], reverse=True)
    ]

    return {
        "total_sources_in_memory": len(memory_statements),
        "total_extracted_items": len(all_extracted_items),
        "total_extracted_amount": round(sum(i["amount"] for i in all_extracted_items), 2),
        "category_breakdown": category_breakdown,
        "memory_statements": memory_statements,
        "extracted_items": all_extracted_items,
    }


@router.post("/extract-from-memory")
def ai_extract_expenses_from_memory(
    auto_import_to_records: bool = False,
    db: Session = Depends(get_db),
):
    """
    Sincroniza todas as faturas/extratos na memória com os lançamentos estruturados,
    anotando o que já foi gasto no mês, compras parceladas e próximos meses.
    """
    sync_res = sync_financial_documents_to_db(db=db, force_account_update=True)
    history = get_statement_history_from_memory(db)
    statements = history["memory_statements"]

    if not statements:
        return {
            "status": "empty",
            "message": "Nenhuma fatura ou memória financeira com textos encontrada para extrair.",
            "extracted": [],
        }

    ai_items: list[dict] = []
    for s in statements:
        for item in s["items"]:
            ai_items.append(
                {
                    "title": item["title"],
                    "amount": item["amount"],
                    "date": item.get("date_iso") or item["date"],
                    "category": item["category"],
                    "account_name": item.get("account_name") or s["title"],
                }
            )

    return {
        "status": "ok",
        "extracted_count": len(ai_items),
        "imported_count": sync_res.get("created_records", 0),
        "installments_registered": sync_res.get("installments_registered", 0),
        "extracted": ai_items,
    }


@router.post("/accounts", response_model=FinanceAccountOut)
def upsert_account(payload: FinanceAccountUpsert, db: Session = Depends(get_db)):
    acc = db.query(FinanceAccount).filter(FinanceAccount.name == payload.name).first()
    if acc:
        acc.account_type = payload.account_type
        acc.balance = payload.balance
        acc.credit_limit = payload.credit_limit
        acc.closing_day = payload.closing_day
        acc.due_day = payload.due_day
    else:
        acc = FinanceAccount(**payload.model_dump())
        db.add(acc)
    db.commit()
    db.refresh(acc)
    return acc


@router.put("/accounts/{account_id}", response_model=FinanceAccountOut)
def update_account(account_id: int, payload: FinanceAccountUpsert, db: Session = Depends(get_db)):
    """Edita uma conta/cartão existente (permite renomear)."""
    acc = db.query(FinanceAccount).filter(FinanceAccount.id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Conta não encontrada")
    clash = (
        db.query(FinanceAccount)
        .filter(FinanceAccount.name == payload.name, FinanceAccount.id != account_id)
        .first()
    )
    if clash:
        raise HTTPException(status_code=409, detail="Já existe uma conta com esse nome")
    old_name = acc.name
    for field, value in payload.model_dump().items():
        setattr(acc, field, value)
    if old_name != acc.name:
        # Mantém os lançamentos ligados à conta renomeada
        db.query(FinanceRecord).filter(FinanceRecord.account_name == old_name).update(
            {FinanceRecord.account_name: acc.name}, synchronize_session=False
        )
    db.commit()
    db.refresh(acc)
    return acc


@router.delete("/accounts/{account_id}")
def delete_account(account_id: int, db: Session = Depends(get_db)):
    acc = db.query(FinanceAccount).filter(FinanceAccount.id == account_id).first()
    if not acc:
        raise HTTPException(status_code=404, detail="Conta não encontrada")
    db.delete(acc)
    db.commit()
    return {"status": "deleted", "id": account_id}


@router.post("/records", response_model=FinanceRecordOut)
def create_record(payload: FinanceRecordCreate, db: Session = Depends(get_db)):
    rec = FinanceRecord(**payload.model_dump())
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return rec


@router.put("/records/{record_id}", response_model=FinanceRecordOut)
def update_record(record_id: int, payload: FinanceRecordUpdate, db: Session = Depends(get_db)):
    rec = db.query(FinanceRecord).filter(FinanceRecord.id == record_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(rec, field, value)
    db.commit()
    db.refresh(rec)
    return rec


@router.delete("/records/{record_id}")
def delete_record(record_id: int, db: Session = Depends(get_db)):
    rec = db.query(FinanceRecord).filter(FinanceRecord.id == record_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado")
    db.delete(rec)
    db.commit()
    return {"status": "deleted", "id": record_id}

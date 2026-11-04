"""Imports a CoinKeeper CSV export straight into the database, bypassing the
app's own CSV importer (frontend/src/pages/CsvImportPage.tsx + lib/csv.ts).

That importer is built for a bank-statement shape: one account picked for
the whole file, and a signed Amount column whose sign alone decides
income vs. expense. CoinKeeper's export instead carries an explicit `Type`
column (expense/income/transfer/debt), an always-positive Amount, and
From/To columns whose meaning depends on the type:
    expense  -> From = source account,      To   = expense category
    income   -> From = income category,     To   = destination account
    transfer -> From = source account,      To   = destination account
and one file can span many accounts at once. None of that fits the
in-app importer's model, so this goes through the ORM/DB session directly
instead (same pattern as scripts/seed_mock_data.py) -- no Alembic (that's
for schema migrations, not data loading) and no raw SQL.

Every account/category/tag name this script needs comes from the CSV file
at runtime and is matched against the database case-insensitively; nothing
the user's own CSV export contains -- account names, category names, real
amounts -- is ever hardcoded here. Don't add any, this file is committed.

Dry run by default: reads the CSV and the database, then prints exactly
what would be created and imported without writing anything. Pass --commit
to actually write.

Usage (run inside the backend container -- Postgres isn't reachable from
the host, see docker-compose.yml):
    docker compose exec backend python -m utils.conver_csv --file tmp/export.csv
    docker compose exec backend python -m utils.conver_csv --file tmp/export.csv --commit

If utils/ or the CSV weren't in the image yet, `docker compose up -d --build backend`
first (or `docker cp` the two files into the running container for faster iteration).
"""
import argparse
import asyncio
import csv
from collections import Counter
from dataclasses import dataclass
from datetime import date as date_
from decimal import Decimal, InvalidOperation

from sqlalchemy import select

from app.db.session import AsyncSessionLocal
from app.models.account import Account
from app.models.category import Category
from app.models.enums import AccountType, CategoryKind, TransactionType
from app.models.tag import Tag
from app.models.transaction import Transaction

# CoinKeeper's own marker for a manual balance adjustment, not a real
# expense/income -- excluded by explicit user decision, not inferred.
CORRECTION_LABEL = "correction"
SUPPORTED_TYPES = {"income", "expense", "transfer"}

# Same 8-color, colorblind-safe categorical palette used for the default
# seeded categories (see app/db/seed.py) -- generic design constants, reused
# here so auto-created accounts/categories don't all end up the same color.
PALETTE = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"]


@dataclass
class Candidate:
    row_number: int
    date_iso: str
    type: TransactionType
    amount: Decimal
    from_name: str
    to_name: str
    note: str
    tag_names: list[str]


@dataclass
class Skipped:
    row_number: int
    reason: str


def parse_date(raw: str) -> str | None:
    """CoinKeeper exports DD.MM.YYYY; returns ISO YYYY-MM-DD or None."""
    parts = raw.strip().split(".")
    if len(parts) != 3:
        return None
    day_s, month_s, year_s = parts
    try:
        day, month, year = int(day_s), int(month_s), int(year_s)
        return date_(year, month, day).isoformat()
    except ValueError:
        return None


def parse_amount(raw: str) -> Decimal | None:
    try:
        value = Decimal(raw.strip())
    except InvalidOperation:
        return None
    value = value.quantize(Decimal("0.01"))
    return value if value > 0 else None


def load_candidates(path: str) -> tuple[list[Candidate], list[Skipped]]:
    candidates: list[Candidate] = []
    skipped: list[Skipped] = []

    with open(path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for index, row in enumerate(reader):
            row_number = index + 2  # header is row 1
            raw_type = row["Type"].strip().lower()
            if raw_type not in SUPPORTED_TYPES:
                skipped.append(Skipped(row_number, f"unsupported type '{raw_type}'"))
                continue

            from_name = row["From"].strip()
            to_name = row["To"].strip()

            # Balance-correction rows live on the category side: From for
            # income, To for expense -- see CORRECTION_LABEL above.
            if raw_type == "expense" and to_name.lower() == CORRECTION_LABEL:
                skipped.append(Skipped(row_number, "balance correction, not a real expense"))
                continue
            if raw_type == "income" and from_name.lower() == CORRECTION_LABEL:
                skipped.append(Skipped(row_number, "balance correction, not a real income"))
                continue

            date_iso = parse_date(row["Date"])
            if date_iso is None:
                skipped.append(Skipped(row_number, f"unparseable date '{row['Date']}'"))
                continue

            amount = parse_amount(row["Amount"])
            if amount is None:
                skipped.append(Skipped(row_number, f"unparseable/non-positive amount '{row['Amount']}'"))
                continue

            if raw_type == "transfer" and from_name.lower() == to_name.lower():
                skipped.append(Skipped(row_number, "transfer to the same account"))
                continue

            tag_names = [t.strip() for t in row["Tags"].split(",") if t.strip()]

            candidates.append(
                Candidate(
                    row_number=row_number,
                    date_iso=date_iso,
                    type=TransactionType(raw_type),
                    amount=amount,
                    from_name=from_name,
                    to_name=to_name,
                    note=row["Note"].strip(),
                    tag_names=tag_names,
                )
            )

    return candidates, skipped


def needed_account_names(candidates: list[Candidate]) -> dict[str, str]:
    """CSV name (case-preserved, first occurrence) keyed by lowercase."""
    names: dict[str, str] = {}
    for c in candidates:
        if c.type in (TransactionType.EXPENSE,):
            names.setdefault(c.from_name.lower(), c.from_name)
        elif c.type == TransactionType.INCOME:
            names.setdefault(c.to_name.lower(), c.to_name)
        elif c.type == TransactionType.TRANSFER:
            names.setdefault(c.from_name.lower(), c.from_name)
            names.setdefault(c.to_name.lower(), c.to_name)
    return names


def needed_categories(candidates: list[Candidate]) -> dict[tuple[CategoryKind, str], str]:
    """(kind, lowercase name) -> case-preserved name."""
    names: dict[tuple[CategoryKind, str], str] = {}
    for c in candidates:
        if c.type == TransactionType.EXPENSE and c.to_name.lower() != "none":
            names.setdefault((CategoryKind.EXPENSE, c.to_name.lower()), c.to_name)
        elif c.type == TransactionType.INCOME and c.from_name.lower() != "none":
            names.setdefault((CategoryKind.INCOME, c.from_name.lower()), c.from_name)
    return names


def description_for(c: Candidate, category_display: str | None) -> str:
    if c.note:
        return c.note
    if c.type == TransactionType.TRANSFER:
        return f"{c.from_name} → {c.to_name}"
    if category_display:
        return category_display
    fallback_account = c.from_name if c.type == TransactionType.EXPENSE else c.to_name
    return fallback_account or c.type.value.capitalize()


async def run(csv_path: str, commit: bool) -> None:
    candidates, skipped = load_candidates(csv_path)

    account_names = needed_account_names(candidates)
    category_names = needed_categories(candidates)
    all_tag_names: dict[str, str] = {}
    for c in candidates:
        for tag in c.tag_names:
            all_tag_names.setdefault(tag.lower(), tag)

    async with AsyncSessionLocal() as session:
        existing_accounts = {a.name.lower(): a for a in (await session.execute(select(Account))).scalars().all()}
        existing_categories = {
            (cat.kind, cat.name.lower()): cat for cat in (await session.execute(select(Category))).scalars().all()
        }
        existing_tags = {t.name.lower(): t for t in (await session.execute(select(Tag))).scalars().all()}

        missing_accounts = {key: name for key, name in account_names.items() if key not in existing_accounts}
        missing_categories = {key: name for key, name in category_names.items() if key not in existing_categories}
        missing_tags = {key: name for key, name in all_tag_names.items() if key not in existing_tags}

        print(f"Read {len(candidates) + len(skipped)} rows: {len(candidates)} importable, {len(skipped)} skipped.")
        skip_reasons = Counter(s.reason.split(" '")[0] for s in skipped)
        for reason, count in skip_reasons.most_common():
            print(f"  skipped x{count}: {reason}")

        print(f"\nAccounts needed: {len(account_names)} ({len(missing_accounts)} missing)")
        for name in sorted(missing_accounts.values()):
            print(f"  + {name}")

        print(f"\nCategories needed: {len(category_names)} ({len(missing_categories)} missing)")
        for (kind, _), name in sorted(missing_categories.items(), key=lambda kv: (kv[0][0].value, kv[1])):
            print(f"  + [{kind.value}] {name}")

        print(f"\nTags needed: {len(all_tag_names)} ({len(missing_tags)} missing)")

        by_type = Counter(c.type.value for c in candidates)
        print(f"\nTransactions to import: {len(candidates)} ({dict(by_type)})")

        if not commit:
            print("\nDry run only -- pass --commit to write these changes.")
            return

        for i, (key, name) in enumerate(missing_accounts.items()):
            account = Account(name=name, type=AccountType.OTHER, currency="RUB", color=PALETTE[i % len(PALETTE)])
            session.add(account)
            existing_accounts[key] = account

        for i, (key, name) in enumerate(missing_categories.items()):
            kind, _ = key
            category = Category(name=name, kind=kind, color=PALETTE[i % len(PALETTE)])
            session.add(category)
            existing_categories[key] = category

        for i, (key, name) in enumerate(missing_tags.items()):
            tag = Tag(name=name)
            session.add(tag)
            existing_tags[key] = tag

        # Flush (not commit) so the new rows get real IDs the transactions
        # below can reference, while everything still lands in one
        # all-or-nothing commit at the end.
        await session.flush()

        existing_transactions = (
            (
                await session.execute(
                    select(Transaction.date, Transaction.type, Transaction.amount, Transaction.description)
                )
            )
            .all()
        )
        # A Counter, not a set: (date, type, amount, description) alone isn't
        # a real identity for a row -- two distinct transfers of the same
        # amount between the same two accounts on the same day collide on
        # purpose here (both are legitimate). Counting occurrences instead of
        # membership means "N rows already exist with this key" only ever
        # absorbs the first N candidates that match it -- any further
        # candidate with that same key is a genuinely different transaction
        # and gets imported, not silently dropped.
        remaining_existing = Counter(
            (d.isoformat(), t.value, str(a.quantize(Decimal("0.01"))), desc.strip().lower())
            for d, t, a, desc in existing_transactions
        )

        transactions = []
        duplicate_count = 0
        for c in candidates:
            if c.type == TransactionType.EXPENSE:
                account = existing_accounts[c.from_name.lower()]
                category = existing_categories.get((CategoryKind.EXPENSE, c.to_name.lower()))
                transaction = Transaction(
                    account_id=account.id,
                    category_id=category.id if category else None,
                    type=c.type,
                    amount=c.amount,
                    description=description_for(c, category.name if category else None),
                    date=date_.fromisoformat(c.date_iso),
                )
            elif c.type == TransactionType.INCOME:
                account = existing_accounts[c.to_name.lower()]
                category = existing_categories.get((CategoryKind.INCOME, c.from_name.lower()))
                transaction = Transaction(
                    account_id=account.id,
                    category_id=category.id if category else None,
                    type=c.type,
                    amount=c.amount,
                    description=description_for(c, category.name if category else None),
                    date=date_.fromisoformat(c.date_iso),
                )
            else:
                from_account = existing_accounts[c.from_name.lower()]
                to_account = existing_accounts[c.to_name.lower()]
                transaction = Transaction(
                    account_id=from_account.id,
                    transfer_account_id=to_account.id,
                    type=c.type,
                    amount=c.amount,
                    description=description_for(c, None),
                    date=date_.fromisoformat(c.date_iso),
                )

            key = (
                transaction.date.isoformat(),
                transaction.type.value,
                str(transaction.amount),
                transaction.description.strip().lower(),
            )
            if remaining_existing[key] > 0:
                remaining_existing[key] -= 1
                duplicate_count += 1
                continue

            if c.tag_names:
                transaction.tags = [existing_tags[name.lower()] for name in c.tag_names]

            transactions.append(transaction)

        session.add_all(transactions)
        await session.commit()

        print(
            f"\nCommitted: {len(transactions)} transactions "
            f"({duplicate_count} duplicates of existing data skipped), "
            f"{len(missing_accounts)} accounts, {len(missing_categories)} categories, "
            f"{len(missing_tags)} tags created."
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--file", required=True, help="Path to the CoinKeeper CSV export")
    parser.add_argument("--commit", action="store_true", help="Actually write to the database (default: dry run)")
    args = parser.parse_args()
    asyncio.run(run(args.file, args.commit))


if __name__ == "__main__":
    main()

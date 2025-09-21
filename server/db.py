# db.py
import os
from typing import Optional

from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.database import Database
from pymongo.errors import OperationFailure, DuplicateKeyError


# Cached handle used by helpers that don't receive an explicit db
_db_handle: Optional[Database] = None


# ---------- DB handle helpers ----------

def init_db(database: Database) -> None:
    """Store a global handle for reuse by helper modules."""
    global _db_handle
    _db_handle = database


def get_db() -> Database:
    """
    Return a cached database handle, creating a client if necessary.
    Requires MONGODB_URI and MONGODB_DB in the environment.
    """
    global _db_handle
    if _db_handle is not None:
        return _db_handle

    uri = os.environ.get("MONGODB_URI")
    db_name = os.environ.get("MONGODB_DB")
    if not uri or not db_name:
        raise RuntimeError("Missing MONGODB_URI or MONGODB_DB")

    client = MongoClient(uri, tlsAllowInvalidCertificates=False)
    _db_handle = client[db_name]
    return _db_handle


# ---------- Index helpers ----------

def _safe_create_index(coll, keys, **opts):
    """
    Create an index but be forgiving:
      - Ignore differing options / specs conflicts (codes 85, 86)
      - Skip if data currently violates a unique index (code 11000)
        (Prefer to use a partialFilterExpression to avoid this.)
    """
    try:
        return coll.create_index(keys, **opts)
    except DuplicateKeyError:
        # Data violates the requested unique constraint. Don't crash the app.
        print(f"[indexes] Skipped creating index {opts.get('name') or keys} due to duplicate key")
        return None
    except OperationFailure as exc:
        code = getattr(exc, "code", None)
        if code in (85, 86):
            # 85 IndexOptionsConflict, 86 IndexKeySpecsConflict
            print(f"[indexes] Ignored conflict for {opts.get('name') or keys} (code {code})")
            return None
        raise


def ensure_collections(db: Database) -> None:
    """Create required collections if they do not already exist."""
    existing = set(db.list_collection_names())
    for name in ("applications", "mandates"):
        if name not in existing:
            try:
                db.create_collection(name)
            except Exception:
                pass  # already exists (race)


def ensure_indexes(db: Database) -> None:
    """
    Ensure all collections used by the app have the expected indexes.

    Notes / decisions:
      - merchants.canonical_name is UNIQUE but **partial** so multiple null/empty
        values don't conflict (fixes E11000 dup key on { canonical_name: null }).
      - transactions has both legacy (userId/accountId/date) and normalized
        (user_id/posted_at, etc.) indexes to cover both shapes.
      - Deterministic names used where helpful to match existing deployments.
    """
    # Users
    users = db["users"]
    _safe_create_index(users, [("auth0_id", ASCENDING)], unique=True)
    _safe_create_index(users, [("email", ASCENDING)], unique=True, sparse=True)

    # Accounts
    accounts = db["accounts"]
    _safe_create_index(accounts, [("userId", ASCENDING)], name="accounts_userId")
    _safe_create_index(
        accounts,
        [("userId", ASCENDING), ("account_type", ASCENDING), ("account_mask", ASCENDING)],
        unique=True,
        sparse=True,
        name="userId_1_account_type_1_account_mask_1",
    )
    _safe_create_index(accounts, [("userId", ASCENDING), ("card_product_id", ASCENDING)], sparse=True)
    _safe_create_index(accounts, [("userId", ASCENDING), ("card_product_slug", ASCENDING)], sparse=True)

    # Transactions (legacy schema)
    tx = db["transactions"]
    _safe_create_index(tx, [("userId", ASCENDING), ("date", DESCENDING)])
    _safe_create_index(tx, [("userId", ASCENDING), ("accountId", ASCENDING), ("date", DESCENDING)])

    # Transactions (normalized schema)
    _safe_create_index(tx, [("user_id", ASCENDING), ("posted_at", DESCENDING)])
    _safe_create_index(tx, [("user_id", ASCENDING), ("merchant_id", ASCENDING), ("posted_at", DESCENDING)])
    _safe_create_index(tx, [("source", ASCENDING), ("provider_txn_id", ASCENDING)], unique=True, sparse=True)

    # Merchants
    merchants = db["merchants"]
    _safe_create_index(
        merchants,
        [("canonical_name", ASCENDING)],
        unique=True,
        name="canonical_name_1",
        partialFilterExpression={"canonical_name": {"$exists": True}},
    )
    # Optional helpers for lookups (non-unique)
    _safe_create_index(merchants, [("name", ASCENDING)])
    _safe_create_index(merchants, [("slug", ASCENDING)])
    _safe_create_index(merchants, [("aliases", ASCENDING)], sparse=True)

    # Recurring Groups
    recurring_groups = db["recurring_groups"]
    _safe_create_index(recurring_groups, [("user_id", ASCENDING), ("next_expected_at", ASCENDING)])
    _safe_create_index(recurring_groups, [("user_id", ASCENDING), ("merchant_id", ASCENDING)], unique=True)

    # Future Transactions
    future = db["future_transactions"]
    _safe_create_index(future, [("user_id", ASCENDING), ("expected_at", ASCENDING)])
    _safe_create_index(future, [("recurring_group_id", ASCENDING), ("expected_at", ASCENDING)], unique=True)

    # Credit cards catalog
    cards = db["credit_cards"]
    _safe_create_index(cards, [("issuer", ASCENDING), ("network", ASCENDING)])
    _safe_create_index(cards, [("slug", ASCENDING)], unique=True, name="slug_1")

    # Applications
    applications = db["applications"]
    _safe_create_index(
        applications,
        [("userId", ASCENDING), ("product_slug", ASCENDING)],
        unique=True,
        sparse=True,
        name="userId_1_product_slug_1",
    )

    # Mandates
    mandates = db["mandates"]
    _safe_create_index(mandates, [("userId", ASCENDING), ("created_at", DESCENDING)])
    _safe_create_index(mandates, [("user_id", ASCENDING), ("biller_id", ASCENDING)])

    # Billers
    billers = db["billers"]
    _safe_create_index(billers, [("name", ASCENDING)], unique=True)

    # LLM cache
    llm_cache = db["llm_cache"]
    _safe_create_index(llm_cache, [("prompt_hash", ASCENDING)], unique=True)

    print("Indexes ensured.")


__all__ = ["ensure_indexes", "ensure_collections", "get_db", "init_db"]

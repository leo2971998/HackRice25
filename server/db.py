import os
from typing import Optional

from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.database import Database
from pymongo.errors import OperationFailure

_db_handle: Optional[Database] = None


def init_db(database: Database) -> None:
    """Store a global handle for reuse by helper modules."""
    global _db_handle
    _db_handle = database


def get_db() -> Database:
    """Return a cached database handle, creating a client if necessary."""
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


def _safe_create_index(coll, keys, **opts):
    """Create an index while ignoring harmless conflicts."""
    try:
        coll.create_index(keys, **opts)
    except OperationFailure as exc:
        if getattr(exc, "code", None) in (85, 86):
            # 85 IndexOptionsConflict, 86 IndexKeySpecsConflict
            return
        raise


def ensure_indexes(db: Database) -> None:
    """Ensure all collections used by the app have the expected indexes."""
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
    _safe_create_index(merchants, [("canonical_name", ASCENDING)], unique=True)

    # Recurring Groups
    recurring_groups = db["recurring_groups"]
    _safe_create_index(recurring_groups, [("user_id", ASCENDING), ("next_expected_at", ASCENDING)])
    _safe_create_index(recurring_groups, [("user_id", ASCENDING), ("merchant_id", ASCENDING)], unique=True)

    # Future Transactions
    future = db["future_transactions"]
    _safe_create_index(future, [("user_id", ASCENDING), ("expected_at", ASCENDING)])
    _safe_create_index(future, [("recurring_group_id", ASCENDING), ("expected_at", ASCENDING)], unique=True)

    # Credit cards
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


__all__ = ["ensure_indexes", "get_db", "init_db"]

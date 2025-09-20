"""Database helpers and index management."""

import os
from typing import Any

from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.errors import CollectionInvalid


def get_mongo_client() -> MongoClient:
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        raise RuntimeError("MONGODB_URI must be set")
    return MongoClient(uri, tlsAllowInvalidCertificates=False)


def get_database(client: MongoClient):
    db_name = os.environ.get("MONGODB_DB")
    if db_name:
        return client[db_name]
    database = client.get_default_database()
    if database is None:
        raise RuntimeError("Database name must be provided via connection string or MONGODB_DB")
    return database


def ensure_indexes(database: Any) -> None:
    users = database["users"]
    users.create_index([("auth0_id", ASCENDING)], unique=True)
    users.create_index([("email", ASCENDING)], unique=True, sparse=True)

    accounts = database["accounts"]
    accounts.create_index([("userId", ASCENDING)])
    accounts.create_index(
        [("userId", ASCENDING), ("account_type", ASCENDING), ("account_mask", ASCENDING)],
        unique=True,
        sparse=True,
        name="userId_1_account_type_1_account_mask_1",
    )
    accounts.create_index([("userId", ASCENDING), ("card_product_id", ASCENDING)], sparse=True)

    transactions = database["transactions"]
    transactions.create_index([("userId", ASCENDING), ("date", DESCENDING)])
    transactions.create_index([("userId", ASCENDING), ("accountId", ASCENDING), ("date", DESCENDING)])

    credit_cards = database["credit_cards"]
    credit_cards.create_index([("issuer", ASCENDING), ("network", ASCENDING)])
    credit_cards.create_index([("slug", ASCENDING)], unique=True, name="slug_1")

    if "applications" not in database.list_collection_names():
        try:
            database.create_collection("applications")
        except CollectionInvalid:
            pass

    applications = database["applications"]
    applications.create_index([("userId", ASCENDING), ("applied_at", DESCENDING)])
    applications.create_index([("userId", ASCENDING), ("product_slug", ASCENDING)], unique=True)

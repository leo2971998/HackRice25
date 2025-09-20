import os
from functools import wraps
from typing import Any, Dict, Optional

from flask import Flask, jsonify, request, g
from flask_cors import CORS
from jose import jwt
from jose.exceptions import JWTError
from pymongo import MongoClient, ASCENDING
from pymongo.errors import DuplicateKeyError
import requests
from werkzeug.exceptions import Unauthorized

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional dependency
    load_dotenv = None


JWKS_CACHE: Dict[str, Any] = {"keys": []}


def load_environment() -> None:
    if load_dotenv is not None:
        load_dotenv()


def get_auth_settings() -> Dict[str, str]:
    domain = os.environ.get("AUTH0_DOMAIN")
    audience = os.environ.get("AUTH0_AUDIENCE")
    if not domain or not audience:
        raise RuntimeError("AUTH0_DOMAIN and AUTH0_AUDIENCE must be set")
    issuer = f"https://{domain}/"
    return {
        "domain": domain,
        "audience": audience,
        "issuer": issuer,
        "jwks_url": f"{issuer}.well-known/jwks.json",
    }


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


def fetch_jwks(jwks_url: str) -> Dict[str, Any]:
    response = requests.get(jwks_url, timeout=5)
    response.raise_for_status()
    return response.json()


def get_jwks(jwks_url: str) -> Dict[str, Any]:
    if not JWKS_CACHE["keys"]:
        JWKS_CACHE.update(fetch_jwks(jwks_url))
    return JWKS_CACHE


def get_rsa_key(token: str, jwks: Dict[str, Any]) -> Dict[str, Any]:
    unverified_header = jwt.get_unverified_header(token)
    for key in jwks.get("keys", []):
        if key.get("kid") == unverified_header.get("kid"):
            return {
                "kty": key.get("kty"),
                "kid": key.get("kid"),
                "use": key.get("use"),
                "n": key.get("n"),
                "e": key.get("e"),
            }
    raise Unauthorized("Unable to find appropriate key")


def requires_auth(app_settings: Dict[str, str]):
    def decorator(view_func):
        @wraps(view_func)
        def wrapper(*args, **kwargs):
            auth_header = request.headers.get("Authorization", "")
            if not auth_header.lower().startswith("bearer "):
                raise Unauthorized("Authorization header must start with Bearer")
            token = auth_header.split()[1]
            jwks = get_jwks(app_settings["jwks_url"])
            rsa_key = get_rsa_key(token, jwks)
            try:
                payload = jwt.decode(
                    token,
                    rsa_key,
                    algorithms=["RS256"],
                    audience=app_settings["audience"],
                    issuer=app_settings["issuer"],
                )
            except JWTError as exc:  # pragma: no cover - runtime validation
                raise Unauthorized(f"Token verification failed: {exc}")
            g.current_token = payload
            return view_func(*args, **kwargs)

        return wrapper

    return decorator


def create_app() -> Flask:
    load_environment()
    app = Flask(__name__)

    app_settings = get_auth_settings()

    allowed_origin = os.environ.get("CLIENT_ORIGIN", "http://localhost:5173")
    CORS(app, resources={r"/api/*": {"origins": allowed_origin}}, supports_credentials=True)

    mongo_client = get_mongo_client()
    database = get_database(mongo_client)
    users_collection = database["users"]
    users_collection.create_index([("auth0_id", ASCENDING)], unique=True)
    users_collection.create_index([("email", ASCENDING)], unique=True, sparse=True)

    cards_collection = database["cards"]
    cards_collection.create_index([("created_at", ASCENDING)])

    auth_decorator = requires_auth(app_settings)

    def to_front(doc: Dict[str, Any]) -> Dict[str, Any]:
        return{
            "id": str(doc["_id"]),
            "product": doc.get("product", ""),
            "issuer": doc.get("issuer", ""),
            "network": doc.get("network", ""),
            "last4": doc.get("last4", ""),
            "expires": doc.get("expires", ""),
        }

    # Card Routes
    @app.get("/api/cards")
    def list_cards_public():
        docs = cards_collection.find().sort("_id", -1)
        return jsonify([to_front(d) for d in docs])

    @app.route("/api/health", methods=["GET"])
    def health_check():
        return jsonify({"status": "ok"})

    @app.route("/api/me", methods=["GET"])
    @auth_decorator
    def get_current_user():
        payload = getattr(g, "current_token", {})
        auth0_id = payload.get("sub")
        if not auth0_id:
            raise Unauthorized("Token missing subject")

        email = payload.get("email")
        name = payload.get("name") or (email or "Swipe Coach member")

        user_doc: Optional[Dict[str, Any]] = users_collection.find_one({"auth0_id": auth0_id})
        if user_doc is None:
            new_user = {"auth0_id": auth0_id, "email": email, "name": name}
            try:
                result = users_collection.insert_one(new_user)
            except DuplicateKeyError:
                user_doc = users_collection.find_one({"auth0_id": auth0_id})
            else:
                new_user["_id"] = result.inserted_id
                user_doc = new_user
        else:
            updates: Dict[str, Any] = {}
            if email and user_doc.get("email") != email:
                updates["email"] = email
            if name and user_doc.get("name") != name:
                updates["name"] = name
            if updates:
                users_collection.update_one({"_id": user_doc["_id"]}, {"$set": updates})
                user_doc.update(updates)

        if user_doc is None:
            raise Unauthorized("Unable to load profile")

        return jsonify(
            {
                "userId": str(user_doc.get("_id")),
                "email": user_doc.get("email"),
                "name": user_doc.get("name"),
            }
        )

    @app.errorhandler(Unauthorized)
    def handle_unauthorized(error):
        response = jsonify({"error": "unauthorized", "message": str(error)})
        response.status_code = 401
        return response

    @app.errorhandler(Exception)
    def handle_generic_error(error):  # pragma: no cover - safety net
        app.logger.exception("Unhandled error: %s", error)
        response = jsonify({"error": "server_error", "message": "An unexpected error occurred"})
        response.status_code = 500
        return response

    options_collection = database["options"]

    @app.get("/api/options")
    def get_options():
        doc = options_collection.find_one({"_id": "dropdowns"}) or {}
        return jsonify({"issuers" : doc.get("issuers", []), "networks" : doc.get("networks", []) })
    
    # GET Card Products
    @app.get("/api/issuers")
    def get_issuers():
        issuers = database["card_products"].distinct("issuer")
        issuers.sort()
        return jsonify(issuers)

    @app.get("/api/networks")
    def get_networks():
        issuer = request.args.get("issuer")
        if not issuer:
            return jsonify([])
        
        networks = database["card_products"].distinct("network", {"issuer" : issuer})
        networks.sort()
        return jsonify(networks)

    @app.get("/api/products")
    def get_products():
        issuer = request.args.get("issuer")
        network = request.args.get("network")
        query = {}

        if issuer:
            query["issuer"] = issuer
        if network:
            query["network"] = network
        
        products = database["card_products"].find(query, {"_id": 0, "product": 1}).sort("product", 1)
        return jsonify([p["product"] for p in products])



    return app


app = create_app()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    app.run(host="0.0.0.0", port=port)

"""Flask application factory for Swipe Coach."""

import os
from flask import Flask, jsonify
from flask_cors import CORS
from werkzeug.exceptions import BadRequest, Forbidden, NotFound, Unauthorized

from server.core import (
    DEFAULT_PREFERENCES,
    ensure_indexes,
    get_auth_settings,
    get_database,
    get_mongo_client,
    load_environment,
)
from server.routes import create_api_blueprint


def create_app() -> Flask:
    load_environment()
    app = Flask(__name__)

    disable_auth = os.environ.get("DISABLE_AUTH", "0").lower() in ("1", "true")
    app_settings = None if disable_auth else get_auth_settings()

    allowed_origin = os.environ.get("CLIENT_ORIGIN", "http://localhost:5173")
    CORS(
        app,
        resources={r"/api/*": {"origins": [allowed_origin]}},
        supports_credentials=True,
        methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["Content-Type"],
    )

    mongo_client = get_mongo_client()
    database = get_database(mongo_client)
    ensure_indexes(database)

    app.config.update(
        AUTH_SETTINGS=app_settings,
        MONGO_CLIENT=mongo_client,
        MONGO_DB=database,
        DISABLE_AUTH=disable_auth,
        DEFAULT_PREFERENCES=DEFAULT_PREFERENCES,
    )

    api_bp = create_api_blueprint(database)
    app.register_blueprint(api_bp)

    @app.route("/api/health", methods=["GET"])
    def health_check():
        return jsonify({"status": "ok"})

    @app.errorhandler(Unauthorized)
    def handle_unauthorized(error):
        response = jsonify({"error": "unauthorized", "message": str(error)})
        response.status_code = 401
        return response

    @app.errorhandler(BadRequest)
    def handle_bad_request(error):
        response = jsonify({"error": "bad_request", "message": str(error)})
        response.status_code = 400
        return response

    @app.errorhandler(Forbidden)
    def handle_forbidden(error):
        response = jsonify({"error": "forbidden", "message": str(error)})
        response.status_code = 403
        return response

    @app.errorhandler(NotFound)
    def handle_not_found(error):
        response = jsonify({"error": "not_found", "message": str(error)})
        response.status_code = 404
        return response

    return app


if __name__ == "__main__":
    flask_app = create_app()
    port = int(os.environ.get("PORT", "5000"))
    debug = os.environ.get("FLASK_DEBUG", "1") in ("1", "true", "True")
    flask_app.run(host="0.0.0.0", port=port, debug=debug)

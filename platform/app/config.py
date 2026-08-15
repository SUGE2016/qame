import os
from functools import lru_cache

DEFAULT_JWT_SECRET = "your-super-secret-jwt-key-change-in-production"
DEFAULT_PASSWORD_SALT = "your_fixed_salt_here"
DEFAULT_ADMIN_PASSWORD = "admin123"


@lru_cache
def settings():
    return {
        "db_host": os.getenv("DB_HOST", "postgres"),
        "db_port": int(os.getenv("DB_PORT", "5432")),
        "db_name": os.getenv("DB_NAME", "boardgame_db"),
        "db_user": os.getenv("DB_USER", "boardgame_user"),
        "db_password": os.getenv("DB_PASSWORD", "boardgame_pass"),
        "jwt_secret": os.getenv("JWT_SECRET", DEFAULT_JWT_SECRET),
        "password_salt": os.getenv("PASSWORD_SALT", DEFAULT_PASSWORD_SALT),
        "admin_password": os.getenv("ADMIN_PASSWORD", DEFAULT_ADMIN_PASSWORD),
        "internal_service_key": os.getenv("INTERNAL_SERVICE_KEY", ""),
        "qame_env": (os.getenv("QAME_ENV") or "development").strip().lower(),
        "public_url": (os.getenv("PUBLIC_URL") or "").rstrip("/"),
        "cors_origins": os.getenv("CORS_ORIGINS", ""),
        "ai_timeout_ms": int(os.getenv("AI_SERVICE_TIMEOUT", "30000")),
        "game_urls": {
            "tic-tac-toe": os.getenv("GAME_TTT_URL", "http://game-tic-tac-toe:8101"),
            "gomoku": os.getenv("GAME_GOMOKU_URL", "http://game-gomoku:8102"),
            "battleship": os.getenv("GAME_BATTLESHIP_URL", "http://game-battleship:8103"),
        },
    }


def cors_origins() -> list[str]:
    s = settings()
    origins = [o.strip().rstrip("/") for o in s["cors_origins"].split(",") if o.strip()]
    if s["public_url"] and s["public_url"] not in origins:
        origins.append(s["public_url"])
    for extra in (
        "http://localhost",
        "https://localhost",
        "http://127.0.0.1",
        "https://127.0.0.1",
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:8001",
        "https://localhost:443",
    ):
        if extra not in origins:
            origins.append(extra)
    return origins


def assert_production_secrets() -> None:
    s = settings()
    if s["qame_env"] != "production":
        return
    weak = []
    if not s["jwt_secret"] or s["jwt_secret"] == DEFAULT_JWT_SECRET:
        weak.append("JWT_SECRET")
    if not s["password_salt"] or s["password_salt"] == DEFAULT_PASSWORD_SALT:
        weak.append("PASSWORD_SALT")
    if not s["admin_password"] or s["admin_password"] == DEFAULT_ADMIN_PASSWORD:
        weak.append("ADMIN_PASSWORD")
    if not s["internal_service_key"]:
        weak.append("INTERNAL_SERVICE_KEY")
    if weak:
        raise RuntimeError("生产环境必须设置非默认密钥: " + ", ".join(weak))

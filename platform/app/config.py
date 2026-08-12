import os
from functools import lru_cache


@lru_cache
def settings():
    return {
        "db_host": os.getenv("DB_HOST", "postgres"),
        "db_port": int(os.getenv("DB_PORT", "5432")),
        "db_name": os.getenv("DB_NAME", "boardgame_db"),
        "db_user": os.getenv("DB_USER", "boardgame_user"),
        "db_password": os.getenv("DB_PASSWORD", "boardgame_pass"),
        "jwt_secret": os.getenv("JWT_SECRET", "your-super-secret-jwt-key-change-in-production"),
        "password_salt": os.getenv("PASSWORD_SALT", "your_fixed_salt_here"),
        "admin_password": os.getenv("ADMIN_PASSWORD", "admin123"),
        "ai_timeout_ms": int(os.getenv("AI_SERVICE_TIMEOUT", "30000")),
        "game_urls": {
            "tic-tac-toe": os.getenv("GAME_TTT_URL", "http://game-tic-tac-toe:8101"),
            "gomoku": os.getenv("GAME_GOMOKU_URL", "http://game-gomoku:8102"),
        },
    }

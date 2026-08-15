import importlib.util
from pathlib import Path

_path = Path(__file__).resolve().parents[2] / "platform" / "app" / "config.py"
_spec = importlib.util.spec_from_file_location("qame_config", _path)
config = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(config)


def test_production_rejects_default_secrets(monkeypatch):
    monkeypatch.setenv("QAME_ENV", "production")
    monkeypatch.setenv("JWT_SECRET", config.DEFAULT_JWT_SECRET)
    monkeypatch.setenv("PASSWORD_SALT", config.DEFAULT_PASSWORD_SALT)
    monkeypatch.setenv("ADMIN_PASSWORD", config.DEFAULT_ADMIN_PASSWORD)
    monkeypatch.delenv("INTERNAL_SERVICE_KEY", raising=False)
    config.settings.cache_clear()
    try:
        raised = False
        try:
            config.assert_production_secrets()
        except RuntimeError as e:
            raised = True
            msg = str(e)
            assert "JWT_SECRET" in msg
            assert "INTERNAL_SERVICE_KEY" in msg
        assert raised
    finally:
        config.settings.cache_clear()


def test_development_allows_defaults(monkeypatch):
    monkeypatch.setenv("QAME_ENV", "development")
    monkeypatch.delenv("JWT_SECRET", raising=False)
    config.settings.cache_clear()
    try:
        config.assert_production_secrets()
    finally:
        config.settings.cache_clear()

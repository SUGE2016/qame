import hashlib
import os
import time
import uuid

import httpx
import pytest

BASE = os.getenv("QAME_URL", "http://127.0.0.1:8001").rstrip("/")
SALT = os.getenv("PASSWORD_SALT", "your_fixed_salt_here")
ADMIN_USER = os.getenv("QAME_ADMIN_USER", "admin")
ADMIN_PASS = os.getenv("QAME_ADMIN_PASSWORD", "admin123")


def hash_password(password: str) -> str:
    return hashlib.sha256((password + SALT).encode("utf-8")).hexdigest()


class Api:
    def __init__(self, base: str = BASE):
        self.base = base
        self.client = httpx.Client(base_url=base, timeout=30.0)
        self.token: str | None = None
        self.refresh: str | None = None
        self.user: dict | None = None
        self.player_id: int | None = None

    def close(self):
        self.client.close()

    def _headers(self, seat: str | None = None) -> dict:
        h = {"Content-Type": "application/json"}
        if seat:
            h["Authorization"] = f"Bearer {seat}"
        elif self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    def req(self, method: str, path: str, *, expect: int | None = 200, seat: str | None = None, **kwargs):
        r = self.client.request(method, path, headers=self._headers(seat), **kwargs)
        try:
            body = r.json()
        except Exception:
            body = {"raw": r.text}
        if expect is not None and r.status_code != expect:
            raise AssertionError(f"{method} {path} → HTTP {r.status_code}, want {expect}: {body}")
        if expect is not None and isinstance(body, dict) and "code" in body and body["code"] != expect:
            # platform often mirrors code into JSON
            if body["code"] != expect:
                raise AssertionError(f"{method} {path} → code={body.get('code')}: {body}")
        return body

    def login(self, username: str, password: str):
        body = self.req(
            "POST",
            "/api/auth/login",
            json={"username": username, "hashedPassword": hash_password(password)},
        )
        self.token = body["data"]["accessToken"]
        self.refresh = body["data"].get("refreshToken")
        self.user = body["data"]["user"]
        return body["data"]

    def ensure_player(self):
        body = self.req("POST", "/api/players/me/ensure", json={})
        self.player_id = body["data"]["id"]
        return body["data"]


@pytest.fixture(scope="session")
def base_url():
    return BASE


@pytest.fixture(scope="session")
def alive(base_url):
    deadline = time.time() + 60
    last = None
    while time.time() < deadline:
        try:
            r = httpx.get(f"{base_url}/health", timeout=3.0)
            if r.status_code == 200 and r.json().get("code") == 200:
                return r.json()["data"]
            last = r.text
        except Exception as e:
            last = str(e)
        time.sleep(1)
    pytest.skip(f"platform not reachable at {base_url}: {last}")


@pytest.fixture
def admin(alive):
    api = Api()
    api.login(ADMIN_USER, ADMIN_PASS)
    api.ensure_player()
    yield api
    api.close()


@pytest.fixture
def user_factory(admin):
    created_ids: list[int] = []
    clients: list[Api] = []

    def _make(prefix: str = "u"):
        name = f"{prefix}_{uuid.uuid4().hex[:8]}"
        password = "testpass1"
        body = admin.req(
            "POST",
            "/api/admin/users",
            json={"username": name, "password": password, "role": "user"},
        )
        uid = body["data"]["id"]
        created_ids.append(uid)
        api = Api()
        api.login(name, password)
        api.ensure_player()
        clients.append(api)
        return api

    yield _make
    for api in clients:
        try:
            api.close()
        except Exception:
            pass
    for uid in created_ids:
        try:
            admin.req("DELETE", f"/api/admin/users/{uid}", expect=200)
        except Exception:
            pass

import os
import uuid

import httpx

from tests.conftest import BASE, Api, hash_password


def test_health(alive):
    assert alive["runtime"] == "python-platform"
    assert "tic-tac-toe" in alive["games"]
    assert "gomoku" in alive["games"]


def test_login_wrong_password(alive):
    api = Api()
    r = api.client.post(
        "/api/auth/login",
        json={"username": "admin", "hashedPassword": hash_password("wrong-password")},
    )
    assert r.status_code == 401
    assert r.json()["code"] == 401
    api.close()


def test_login_refresh_logout(admin):
    assert admin.token
    assert admin.refresh
    v = admin.req("GET", "/api/auth/verify")
    assert v["data"]["user"]["username"] == "admin"
    refreshed = admin.req("POST", "/api/auth/refresh", json={"refreshToken": admin.refresh})
    assert refreshed["data"]["accessToken"]
    admin.token = refreshed["data"]["accessToken"]
    out = admin.req("POST", "/api/auth/logout")
    assert out["code"] == 200


def test_unauth_blocked(alive):
    r = httpx.get(f"{BASE}/api/games", timeout=10)
    assert r.status_code == 401
    body = r.json()
    assert body["code"] == 401
    assert "message" in body


def test_admin_users_crud(admin):
    name = f"reg_{uuid.uuid4().hex[:8]}"
    created = admin.req(
        "POST",
        "/api/admin/users",
        json={"username": name, "password": "testpass1", "role": "user"},
    )
    uid = created["data"]["id"]
    listed = admin.req("GET", "/api/admin/users?page=1&limit=50")
    assert any(u["id"] == uid for u in listed["data"]["users"])
    updated = admin.req("PUT", f"/api/admin/users/{uid}", json={"username": name, "role": "user"})
    assert updated["data"]["username"] == name
    stats = admin.req("GET", "/api/admin/stats")
    assert stats["data"]["total_users"] >= 1
    deleted = admin.req("DELETE", f"/api/admin/users/{uid}")
    assert deleted["code"] == 200


def test_admin_cannot_delete_self(admin):
    r = admin.client.delete(
        f"/api/admin/users/{admin.user['id']}",
        headers=admin._headers(),
    )
    assert r.status_code == 400
    assert r.json()["code"] == 400


def test_admin_games_crud(admin):
    gid = f"g-{uuid.uuid4().hex[:8]}"
    created = admin.req(
        "POST",
        "/api/admin/games",
        json={
            "id": gid,
            "name": f"Temp {gid}",
            "description": "regression",
            "min_players": 2,
            "max_players": 2,
            "status": "inactive",
        },
    )
    assert created["data"]["game"]["id"] == gid
    updated = admin.req(
        "PUT",
        f"/api/admin/games/{gid}",
        json={"name": f"Temp {gid} x", "status": "inactive"},
    )
    assert "Temp" in updated["data"]["game"]["name"]
    deleted = admin.req("DELETE", f"/api/admin/games/{gid}")
    assert deleted["code"] == 200

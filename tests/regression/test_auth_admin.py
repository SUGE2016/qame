import os
import uuid

import httpx

from tests.conftest import BASE, Api, hash_password


def test_health(alive):
    assert alive["runtime"] == "python-platform"
    assert "tic-tac-toe" in alive["games"]
    assert "gomoku" in alive["games"]
    assert "battleship" in alive["games"]


def test_login_with_plaintext_password(alive):
    api = Api()
    body = api.req(
        "POST",
        "/api/auth/login",
        json={"username": "admin", "password": os.getenv("QAME_ADMIN_PASSWORD", "admin123")},
    )
    assert body["data"]["accessToken"]
    api.close()


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
    old_refresh = admin.refresh
    refreshed = admin.req("POST", "/api/auth/refresh", json={"refreshToken": old_refresh})
    assert refreshed["data"]["accessToken"]
    assert refreshed["data"]["refreshToken"]
    assert refreshed["data"]["refreshToken"] != old_refresh
    admin.token = refreshed["data"]["accessToken"]
    reused = admin.client.post("/api/auth/refresh", json={"refreshToken": old_refresh})
    assert reused.status_code == 401
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
    assert "total" in listed["data"]
    assert any(u["id"] == uid for u in listed["data"]["users"])
    found = admin.req("GET", f"/api/admin/users?page=1&limit=20&q={name}")
    assert any(u["id"] == uid for u in found["data"]["users"])
    role_only = admin.req("GET", "/api/admin/users?page=1&limit=20&role=admin")
    assert all(u["role"] == "admin" for u in role_only["data"]["users"])
    updated = admin.req("PUT", f"/api/admin/users/{uid}", json={"username": name, "role": "user"})
    assert updated["data"]["username"] == name
    stats = admin.req("GET", "/api/admin/stats")
    assert stats["data"]["total_users"] >= 1
    deleted = admin.req("DELETE", f"/api/admin/users/{uid}")
    assert deleted["code"] == 200


def test_pat_create_use_revoke(admin):
    created = admin.req("POST", "/api/auth/pats", json={"name": "mcp-reg"})
    token = created["data"]["token"]
    pat_id = created["data"]["id"]
    assert token.startswith("qame_pat_")
    listed = admin.req("GET", "/api/auth/pats")
    assert any(p["id"] == pat_id for p in listed["data"])
    assert all("token" not in p for p in listed["data"])

    pat_api = Api()
    pat_api.token = token
    me = pat_api.req("GET", "/api/auth/verify")
    assert me["data"]["user"]["username"] == "admin"
    games = pat_api.req("GET", "/api/games")
    assert games["code"] == 200
    pat_api.close()

    admin.req("DELETE", f"/api/auth/pats/{pat_id}")
    dead = Api()
    dead.token = token
    r = dead.client.get("/api/auth/verify", headers=dead._headers())
    assert r.status_code == 401
    dead.close()


def test_admin_overview_and_audit(admin):
    ov = admin.req("GET", "/api/admin/overview")
    assert ov["code"] == 200
    assert "stats" in ov["data"]
    assert "health" in ov["data"]
    assert "undermannedPlaying" in ov["data"]
    assert ov["data"]["stats"]["total_users"] >= 1

    name = f"aud_{uuid.uuid4().hex[:8]}"
    created = admin.req(
        "POST",
        "/api/admin/users",
        json={"username": name, "password": "testpass1", "role": "user"},
    )
    uid = created["data"]["id"]
    audit = admin.req("GET", "/api/admin/audit?page=1&limit=30&action=create")
    assert audit["code"] == 200
    assert audit["data"]["total"] >= 1
    assert any(
        log["action"] == "create" and log["resource"] == "user" and str(log["resource_id"]) == str(uid)
        for log in audit["data"]["logs"]
    )
    by_q = admin.req("GET", f"/api/admin/audit?page=1&limit=20&q={name}")
    assert any(str(log.get("resource_id")) == str(uid) for log in by_q["data"]["logs"])
    admin.req("DELETE", f"/api/admin/users/{uid}")


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


def test_admin_game_host_url(admin):
    gid = f"h-{uuid.uuid4().hex[:8]}"
    created = admin.req(
        "POST",
        "/api/admin/games",
        json={
            "id": gid,
            "name": f"Host {gid}",
            "min_players": 2,
            "max_players": 2,
            "status": "inactive",
            "hostUrl": "http://game-example:8109",
        },
    )
    assert created["data"]["game"]["host_url"] == "http://game-example:8109"
    updated = admin.req(
        "PUT",
        f"/api/admin/games/{gid}",
        json={"name": f"Host {gid}", "hostUrl": "http://game-example:8110"},
    )
    assert updated["data"]["game"]["host_url"] == "http://game-example:8110"
    admin.req("DELETE", f"/api/admin/games/{gid}")

import uuid


def test_patch_other_player_forbidden(admin, user_factory):
    a = user_factory("st_self")
    b = user_factory("st_oth")
    r = b.client.patch(
        f"/api/players/{a.player_id}/status",
        headers=b._headers(),
        json={"status": "inactive"},
    )
    assert r.status_code == 403
    mine = a.req("PATCH", f"/api/players/{a.player_id}/status", json={"status": "active"})
    assert mine["data"]["status"] == "active"


def test_ai_write_requires_admin(admin, user_factory):
    u = user_factory("ai_deny")
    r = u.client.post(
        "/api/ai/clients",
        headers=u._headers(),
        json={
            "name": "nope",
            "endpoint": "http://127.0.0.1:9",
            "supported_games": ["tic-tac-toe"],
        },
    )
    assert r.status_code == 403
    listed = u.req("GET", "/api/ai/clients")
    assert listed["code"] == 200


def test_ai_client_and_player_lifecycle(admin):
    suffix = uuid.uuid4().hex[:6]
    client = admin.req(
        "POST",
        "/api/ai/clients",
        json={
            "name": f"client-{suffix}",
            "endpoint": "http://127.0.0.1:9",
            "supported_games": ["tic-tac-toe", "gomoku"],
            "description": "regression",
        },
    )
    cid = client["data"]["id"]
    player = admin.req(
        "POST",
        "/api/ai/players",
        json={"player_name": f"Bot-{suffix}", "ai_client_id": cid},
    )
    ap_id = player["data"]["aiPlayer"]["id"]
    admin.req("PUT", f"/api/ai/players/{ap_id}", json={"status": "inactive"})
    admin.req("DELETE", f"/api/ai/players/{ap_id}")
    admin.req("DELETE", f"/api/ai/clients/{cid}")

import uuid


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
    got = admin.req("GET", f"/api/ai/clients/{cid}")
    assert got["data"]["name"] == f"client-{suffix}"

    supports = admin.req("GET", f"/api/ai/clients/{cid}/supports/tic-tac-toe")
    assert supports["data"]["supports"] is True
    no = admin.req("GET", f"/api/ai/clients/{cid}/supports/chess")
    assert no["data"]["supports"] is False

    updated = admin.req(
        "PUT",
        f"/api/ai/clients/{cid}",
        json={"description": "updated"},
    )
    assert updated["data"]["description"] == "updated"

    player = admin.req(
        "POST",
        "/api/ai/players",
        json={"player_name": f"Bot-{suffix}", "ai_client_id": cid},
    )
    ap_id = player["data"]["aiPlayer"]["id"]
    p_id = player["data"]["player"]["id"]

    active = admin.req("GET", "/api/ai/players/active")
    assert any(p["id"] == ap_id for p in active["data"])

    listed = admin.req("GET", "/api/players?player_type=ai&status=active")
    assert any(p["id"] == p_id for p in listed["data"]["players"])

    by_client = admin.req("GET", f"/api/ai/clients/{cid}/players")
    assert any(p["id"] == ap_id for p in by_client["data"])

    admin.req("PUT", f"/api/ai/players/{ap_id}", json={"status": "inactive"})
    admin.req("DELETE", f"/api/ai/players/{ap_id}")
    admin.req("DELETE", f"/api/ai/clients/{cid}")


def test_create_ai_player_requires_client(admin):
    r = admin.client.post(
        "/api/ai/players",
        headers=admin._headers(),
        json={"player_name": "orphan", "ai_client_id": "no-such-client"},
    )
    assert r.status_code == 400
    assert r.json()["code"] == 400

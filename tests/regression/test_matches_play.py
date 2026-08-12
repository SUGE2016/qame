import uuid


def _make_ai(admin, name: str):
    c = admin.req(
        "POST",
        "/api/ai/clients",
        json={
            "name": f"c-{name}",
            "endpoint": "http://127.0.0.1:9",
            "supported_games": ["tic-tac-toe", "gomoku"],
        },
    )
    p = admin.req(
        "POST",
        "/api/ai/players",
        json={"player_name": name, "ai_client_id": c["data"]["id"]},
    )
    return p["data"]["player"]["id"], c["data"]["id"], p["data"]["aiPlayer"]["id"]


def test_list_games(admin):
    games = admin.req("GET", "/api/games")
    ids = {g["id"] for g in games["data"]["games"]}
    assert "tic-tac-toe" in ids
    assert "gomoku" in ids


def test_match_cancel(admin, user_factory):
    u = user_factory("cancel")
    m = u.req("POST", "/api/matches", json={"gameId": "tic-tac-toe"})
    mid = m["data"]["id"]
    u.req("POST", f"/api/matches/{mid}/players", json={"playerId": u.player_id})
    cancelled = u.req("POST", f"/api/matches/{mid}/cancel")
    assert cancelled["code"] == 200
    got = u.req("GET", f"/api/matches/{mid}")
    assert got["data"]["status"] == "cancelled"
    u.close()


def test_ttt_human_vs_human_to_finish(admin, user_factory):
    a = user_factory("ttt_a")
    b = user_factory("ttt_b")
    m = a.req("POST", "/api/matches", json={"gameId": "tic-tac-toe"})
    mid = m["data"]["id"]
    ja = a.req("POST", f"/api/matches/{mid}/players", json={"playerId": a.player_id})
    jb = b.req("POST", f"/api/matches/{mid}/players", json={"playerId": b.player_id})
    seat_a = ja["data"]["seatToken"]
    seat_b = jb["data"]["seatToken"]
    assert ja["data"]["seatIndex"] == 0
    assert jb["data"]["seatIndex"] == 1

    a.req("POST", f"/api/matches/{mid}/start")
    chk = a.req("POST", f"/api/matches/{mid}/check-game-status")
    assert chk["data"]["status"] == "playing"

    st = a.req("GET", f"/api/play/{mid}", seat=seat_a)
    assert st["data"]["yourTurn"] is True
    assert 4 in st["data"]["legalMoves"]

    # illegal: B moves first
    r = b.client.post(
        f"/api/play/{mid}/move",
        headers=b._headers(seat=seat_b),
        json={"move": 0},
    )
    assert r.status_code == 400

    # win for A: 0,1,2
    a.req("POST", f"/api/play/{mid}/move", seat=seat_a, json={"move": 0})
    b.req("POST", f"/api/play/{mid}/move", seat=seat_b, json={"move": 3})
    a.req("POST", f"/api/play/{mid}/move", seat=seat_a, json={"move": 1})
    b.req("POST", f"/api/play/{mid}/move", seat=seat_b, json={"move": 4})
    end = a.req("POST", f"/api/play/{mid}/move", seat=seat_a, json={"move": 2})
    assert end["data"]["status"] == "finished"
    assert end["data"]["result"]["winner"] == "0"

    chk2 = a.req("POST", f"/api/matches/{mid}/check-game-status")
    assert chk2["data"]["status"] == "finished"

    hist = a.req("GET", f"/api/stats/matches/{mid}/history")
    assert len(hist["data"]["moves"]) == 5
    assert hist["data"]["result"]["winner"] == "0"

    me = a.req("GET", "/api/stats/me?period=all")
    assert me["data"]["totals"]["finished"] >= 1
    assert me["data"]["totals"]["wins"] >= 1

    board = a.req("GET", "/api/stats/leaderboard?gameId=tic-tac-toe")
    assert "rankings" in board["data"]

    # occupied / after end
    r2 = a.client.post(
        f"/api/play/{mid}/move",
        headers=a._headers(seat=seat_a),
        json={"move": 5},
    )
    assert r2.status_code == 400

    a.close()
    b.close()


def test_gomoku_start_and_move(admin, user_factory):
    a = user_factory("gmk_a")
    b = user_factory("gmk_b")
    m = a.req("POST", "/api/matches", json={"gameId": "gomoku"})
    mid = m["data"]["id"]
    sa = a.req("POST", f"/api/matches/{mid}/players", json={"playerId": a.player_id})["data"][
        "seatToken"
    ]
    b.req("POST", f"/api/matches/{mid}/players", json={"playerId": b.player_id})
    a.req("POST", f"/api/matches/{mid}/start")
    st = a.req("GET", f"/api/play/{mid}", seat=sa)
    assert st["data"]["status"] == "playing"
    assert len(st["data"]["G"]["cells"]) == 81
    mv = a.req("POST", f"/api/play/{mid}/move", seat=sa, json={"move": 40})
    assert mv["data"]["G"]["cells"][40] == "0"
    assert mv["data"]["turn"] == "1"
    a.close()
    b.close()


def test_seat_token_isolation(admin, user_factory):
    a = user_factory("iso_a")
    b = user_factory("iso_b")
    m = a.req("POST", "/api/matches", json={"gameId": "tic-tac-toe"})
    mid = m["data"]["id"]
    sa = a.req("POST", f"/api/matches/{mid}/players", json={"playerId": a.player_id})["data"][
        "seatToken"
    ]
    b.req("POST", f"/api/matches/{mid}/players", json={"playerId": b.player_id})
    a.req("POST", f"/api/matches/{mid}/start")
    r = a.client.get(f"/api/play/{mid}", headers={"Authorization": "Bearer deadbeef"})
    assert r.status_code == 403
    # valid token works
    a.req("GET", f"/api/play/{mid}", seat=sa)
    a.close()
    b.close()


def test_match_with_ai_seat_no_crash(admin, user_factory):
    """AI endpoint 不可达时，人类仍可开局并落子（AI 回合失败不拖垮房间）。"""
    u = user_factory("vsai")
    aid, cid, apid = _make_ai(admin, f"BotR-{uuid.uuid4().hex[:6]}")
    m = u.req("POST", "/api/matches", json={"gameId": "tic-tac-toe"})
    mid = m["data"]["id"]
    st = u.req("POST", f"/api/matches/{mid}/players", json={"playerId": u.player_id})["data"][
        "seatToken"
    ]
    u.req("POST", f"/api/matches/{mid}/players", json={"playerId": aid})
    u.req("POST", f"/api/matches/{mid}/start")
    mv = u.req("POST", f"/api/play/{mid}/move", seat=st, json={"move": 4})
    assert mv["data"]["G"]["cells"][4] == "0"
    # cleanup
    try:
        admin.req("DELETE", f"/api/ai/players/{apid}")
        admin.req("DELETE", f"/api/ai/clients/{cid}")
    except Exception:
        pass
    u.close()


def test_is_in_match_uses_player_id(admin, user_factory):
    u = user_factory("pid")
    m = u.req("POST", "/api/matches", json={"gameId": "tic-tac-toe"})
    mid = m["data"]["id"]
    join = u.req("POST", f"/api/matches/{mid}/players", json={"playerId": u.player_id})
    detail = u.req("GET", f"/api/matches/{mid}")
    seat = detail["data"]["players"][0]
    assert seat["playerId"] == u.player_id
    assert seat["id"] == join["data"]["id"]  # match_players.id
    # lobby 应用 playerId 判断是否入座，而非 match_players.id
    assert any(p["playerId"] == u.player_id for p in detail["data"]["players"])
    u.close()

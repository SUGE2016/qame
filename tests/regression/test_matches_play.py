def test_match_hides_host_snapshot(admin, user_factory):
    a = user_factory("snap_a")
    b = user_factory("snap_b")
    mid = a.req("POST", "/api/matches", json={"gameId": "tic-tac-toe"})["data"]["id"]
    a.req("POST", f"/api/matches/{mid}/players", json={"playerId": a.player_id})
    b.req("POST", f"/api/matches/{mid}/players", json={"playerId": b.player_id})
    a.req("POST", f"/api/matches/{mid}/start")
    got = a.req("GET", f"/api/matches/{mid}")
    assert "host_snapshot" not in got["data"]
    assert got["data"]["status"] == "playing"
    a.req("POST", f"/api/matches/{mid}/cancel")


def test_list_games(admin):
    games = admin.req("GET", "/api/games")
    ids = {g["id"] for g in games["data"]["games"]}
    assert "tic-tac-toe" in ids
    assert "gomoku" in ids
    assert "battleship" in ids


def test_match_list_paged(admin, user_factory):
    u = user_factory("listp")
    created = u.req("POST", "/api/matches", json={"gameId": "tic-tac-toe"})
    mid = created["data"]["id"]
    lobby = u.req("GET", "/api/matches?gameId=tic-tac-toe")
    assert isinstance(lobby["data"], list)
    paged = admin.req("GET", "/api/matches?page=1&limit=10&scope=live&q=" + mid[:8])
    assert "matches" in paged["data"]
    assert paged["data"]["total"] >= 1
    assert any(m["id"] == mid for m in paged["data"]["matches"])
    u.req("POST", f"/api/matches/{mid}/cancel")
    u.close()


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


def test_batch_delete_matches(admin, user_factory):
    owner = user_factory("dirt")
    other = user_factory("othr")
    m1 = owner.req("POST", "/api/matches", json={"gameId": "tic-tac-toe"})["data"]["id"]
    m2 = owner.req("POST", "/api/matches", json={"gameId": "tic-tac-toe"})["data"]["id"]
    m3 = other.req("POST", "/api/matches", json={"gameId": "tic-tac-toe"})["data"]["id"]

    denied = other.req(
        "POST",
        "/api/matches/batch-delete",
        json={"ids": [m1]},
    )
    assert denied["data"]["deletedCount"] == 0
    assert denied["data"]["skipped"][0]["reason"] == "无权限"

    own = owner.req("POST", "/api/matches/batch-delete", json={"ids": [m1]})
    assert m1 in own["data"]["deleted"]

    admin_del = admin.req("POST", "/api/matches/batch-delete", json={"ids": [m2, m3]})
    assert admin_del["data"]["deletedCount"] == 2
    gone = admin.client.get(f"/api/matches/{m2}", headers=admin._headers())
    assert gone.status_code == 404


def test_cannot_delete_playing_match(admin, user_factory):
    a = user_factory("keep_a")
    b = user_factory("keep_b")
    mid = a.req("POST", "/api/matches", json={"gameId": "tic-tac-toe"})["data"]["id"]
    a.req("POST", f"/api/matches/{mid}/players", json={"playerId": a.player_id})
    b.req("POST", f"/api/matches/{mid}/players", json={"playerId": b.player_id})
    a.req("POST", f"/api/matches/{mid}/start")
    r = admin.client.delete(f"/api/matches/{mid}", headers=admin._headers())
    assert r.status_code == 403
    batch = admin.req("POST", "/api/matches/batch-delete", json={"ids": [mid]})
    assert batch["data"]["deletedCount"] == 0
    assert batch["data"]["skipped"][0]["reason"] == "进行中的对局不能删除"
    a.req("POST", f"/api/matches/{mid}/cancel")


def test_delete_user_cancels_open_match(admin, user_factory):
    a = user_factory("st_a")
    b = user_factory("st_b")
    mid = a.req("POST", "/api/matches", json={"gameId": "tic-tac-toe"})["data"]["id"]
    a.req("POST", f"/api/matches/{mid}/players", json={"playerId": a.player_id})
    b.req("POST", f"/api/matches/{mid}/players", json={"playerId": b.player_id})
    a.req("POST", f"/api/matches/{mid}/start")
    admin.req("DELETE", f"/api/admin/users/{b.user['id']}")
    got = a.req("GET", f"/api/matches/{mid}")
    assert got["data"]["status"] == "cancelled"
    a.close()


def test_remove_player_other_user_forbidden(admin, user_factory):
    owner = user_factory("rm_own")
    other = user_factory("rm_oth")
    mid = owner.req("POST", "/api/matches", json={"gameId": "tic-tac-toe"})["data"]["id"]
    joined = owner.req("POST", f"/api/matches/{mid}/players", json={"playerId": owner.player_id})
    mp_id = joined["data"]["id"]
    r = other.client.delete(f"/api/matches/{mid}/players/{mp_id}", headers=other._headers())
    assert r.status_code == 403
    got = owner.req("GET", f"/api/matches/{mid}")
    assert got["data"]["status"] == "waiting"
    assert len(got["data"]["players"]) == 1
    owner.req("POST", f"/api/matches/{mid}/cancel")


def test_cannot_remove_player_while_playing(admin, user_factory):
    a = user_factory("pl_a")
    b = user_factory("pl_b")
    mid = a.req("POST", "/api/matches", json={"gameId": "tic-tac-toe"})["data"]["id"]
    ja = a.req("POST", f"/api/matches/{mid}/players", json={"playerId": a.player_id})
    b.req("POST", f"/api/matches/{mid}/players", json={"playerId": b.player_id})
    a.req("POST", f"/api/matches/{mid}/start")
    r = a.client.delete(f"/api/matches/{mid}/players/{ja['data']['id']}", headers=a._headers())
    assert r.status_code == 403
    got = a.req("GET", f"/api/matches/{mid}")
    assert got["data"]["status"] == "playing"
    a.req("POST", f"/api/matches/{mid}/cancel")


def test_move_after_cancel_rejected(admin, user_factory):
    a = user_factory("mv_a")
    b = user_factory("mv_b")
    mid = a.req("POST", "/api/matches", json={"gameId": "tic-tac-toe"})["data"]["id"]
    sa = a.req("POST", f"/api/matches/{mid}/players", json={"playerId": a.player_id})["data"]["seatToken"]
    b.req("POST", f"/api/matches/{mid}/players", json={"playerId": b.player_id})
    a.req("POST", f"/api/matches/{mid}/start")
    a.req("POST", f"/api/matches/{mid}/cancel")
    r = a.client.post(
        f"/api/play/{mid}/move",
        headers=a._headers(seat=sa),
        json={"move": 0},
    )
    assert r.status_code == 400
    assert "进行中" in r.json()["message"]


def test_leave_last_waiting_player_cancels_room(admin, user_factory):
    u = user_factory("empty")
    mid = u.req("POST", "/api/matches", json={"gameId": "tic-tac-toe"})["data"]["id"]
    joined = u.req("POST", f"/api/matches/{mid}/players", json={"playerId": u.player_id})
    mp_id = joined["data"]["id"]
    u.req("DELETE", f"/api/matches/{mid}/players/{mp_id}")
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


def test_battleship_start_and_fire(admin, user_factory):
    a = user_factory("sea_a")
    b = user_factory("sea_b")
    mid = a.req("POST", "/api/matches", json={"gameId": "battleship"})["data"]["id"]
    sa = a.req("POST", f"/api/matches/{mid}/players", json={"playerId": a.player_id})["data"][
        "seatToken"
    ]
    b.req("POST", f"/api/matches/{mid}/players", json={"playerId": b.player_id})
    a.req("POST", f"/api/matches/{mid}/start")
    st = a.req("GET", f"/api/play/{mid}", seat=sa)
    assert st["data"]["status"] == "playing"
    g = st["data"]["G"]
    assert "ships0" in g and "ships1" not in g
    cell = st["data"]["legalMoves"][0]
    a.req("POST", f"/api/play/{mid}/move", seat=sa, json={"move": cell})
    after = a.req("GET", f"/api/play/{mid}", seat=sa)
    assert str(cell) in after["data"]["G"]["shots1"]
    assert after["data"]["turn"] == "1"
    a.req("POST", f"/api/matches/{mid}/cancel")
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
    via_jwt = a.req("GET", f"/api/play/{mid}")
    assert via_jwt["data"]["seatIndex"] == "0"
    a.req("POST", f"/api/matches/{mid}/cancel")
    a.close()
    b.close()


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

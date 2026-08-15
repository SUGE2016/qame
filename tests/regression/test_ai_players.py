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

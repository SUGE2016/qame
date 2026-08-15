from fastapi import APIRouter, Header, Request

from .. import db
from ..auth_util import user_from_access_token
from ..match_service import apply_seat_move, play_view
from ..resp import err, ok
from .. import game_client
from ..schemas import PlayMoveBody, parse_body

router = APIRouter(prefix="/api/play", tags=["play"])


def _token(request: Request, authorization: str | None, x_seat_token: str | None):
    if authorization and authorization.lower().startswith("bearer "):
        return authorization.split(" ", 1)[1].strip()
    if x_seat_token:
        return x_seat_token
    return request.query_params.get("seatToken")


async def _seat(match_id: str, token: str | None):
    if not token:
        return None, err(403, "缺少 seatToken")
    row = await db.fetchrow(
        """
        SELECT mp.*, p.player_name, p.player_type
        FROM match_players mp
        LEFT JOIN players p ON p.id = mp.player_id
        WHERE mp.match_id=$1 AND mp.player_credentials=$2
        """,
        match_id,
        token,
    )
    if row:
        return db.record_to_dict(row), None
    user = await user_from_access_token(token)
    if user:
        row = await db.fetchrow(
            """
            SELECT mp.*, p.player_name, p.player_type
            FROM match_players mp
            JOIN players p ON p.id = mp.player_id
            WHERE mp.match_id=$1 AND p.user_id=$2 AND p.player_type='human'
            """,
            match_id,
            user["id"],
        )
        if row:
            return db.record_to_dict(row), None
    return None, err(403, "seatToken 无效或不属于此对局")


@router.get("/{match_id}")
async def state(
    match_id: str,
    request: Request,
    authorization: str | None = Header(default=None),
    x_seat_token: str | None = Header(default=None, alias="X-Seat-Token"),
):
    seat, e = await _seat(match_id, _token(request, authorization, x_seat_token))
    if e:
        return e
    try:
        data = await play_view(match_id, seat["seat_index"])
        data["playerName"] = seat.get("player_name")
        return ok(data)
    except Exception as ex:
        return err(500, str(ex))


@router.post("/{match_id}/move")
async def move(
    match_id: str,
    body: dict,
    request: Request,
    authorization: str | None = Header(default=None),
    x_seat_token: str | None = Header(default=None, alias="X-Seat-Token"),
):
    seat, e = await _seat(match_id, _token(request, authorization, x_seat_token))
    if e:
        return e
    req, bad = parse_body(PlayMoveBody, body)
    if bad:
        return bad
    if req.move is None:
        return err(400, "缺少 move")
    try:
        await apply_seat_move(match_id, seat["seat_index"], req.move)
        data = await play_view(match_id, seat["seat_index"])
        return ok(data, "落子成功")
    except game_client.GameClientError as ex:
        return err(400, ex.message)
    except Exception as ex:
        return err(400, str(ex))

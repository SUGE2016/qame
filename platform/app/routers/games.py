from fastapi import APIRouter, Depends

from .. import db
from ..auth_util import get_current_user
from ..resp import ok

router = APIRouter(prefix="/api/games", tags=["games"])


@router.get("")
@router.get("/")
async def list_games(_user=Depends(get_current_user)):
    rows = await db.fetch("SELECT * FROM games WHERE status='active' ORDER BY id")
    games = [db.record_to_dict(r) for r in rows]
    return ok({"games": games})

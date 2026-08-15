from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .resp import err


class CamelModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")


def parse_body(model: type[BaseModel], body: dict | None):
    try:
        return model.model_validate(body or {}), None
    except ValidationError as e:
        first = e.errors()[0]
        loc = first.get("loc") or ()
        name = loc[-1] if loc else "body"
        return None, err(400, f"{name} 无效")


class LoginBody(CamelModel):
    username: str
    password: str | None = None
    hashed_password: str | None = Field(default=None, alias="hashedPassword")


class RefreshBody(CamelModel):
    refresh_token: str | None = Field(default=None, alias="refreshToken")


class CreatePatBody(CamelModel):
    name: str | None = None
    expires_in_days: int | None = Field(default=None, alias="expiresInDays")


class CreateMatchBody(CamelModel):
    game_id: str = Field(alias="gameId")


class AddPlayerBody(CamelModel):
    player_id: int = Field(alias="playerId")
    seat_index: int | None = Field(default=None, alias="seatIndex")


class BatchDeleteBody(CamelModel):
    ids: list[str]


class CreateUserBody(CamelModel):
    username: str
    password: str
    role: str = "user"


class UpdateUserBody(CamelModel):
    username: str
    role: str | None = None


class CreateGameBody(CamelModel):
    id: str | None = None
    name: str
    description: str | None = None
    min_players: int = 2
    max_players: int = 2
    status: str = "active"
    host_url: str | None = Field(default=None, alias="hostUrl")


class UpdateGameBody(CamelModel):
    name: str | None = None
    description: str | None = None
    min_players: int | None = None
    max_players: int | None = None
    status: str | None = None
    host_url: str | None = Field(default=None, alias="hostUrl")


class CreateAIClientBody(CamelModel):
    name: str
    endpoint: str
    supported_games: list[str]
    description: str = ""


class UpdateAIClientBody(CamelModel):
    name: str | None = None
    endpoint: str | None = None
    supported_games: list[str] | None = None
    description: str | None = None


class CreateAIPlayerBody(CamelModel):
    player_name: str
    ai_client_id: str


class UpdateAIPlayerBody(CamelModel):
    player_name: str | None = None
    status: str | None = None


class PatchPlayerStatusBody(CamelModel):
    status: str


class EnsurePlayerBody(CamelModel):
    player_name: str | None = None


class PlayMoveBody(CamelModel):
    move: Any

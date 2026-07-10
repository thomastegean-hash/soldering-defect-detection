"""
Auth router for the inspection console login page.
"""

import json
import logging
import os
import time
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response
from fastapi.responses import FileResponse
from fastapi.templating import Jinja2Templates
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from passlib.context import CryptContext
from pydantic import BaseModel, field_validator
from slowapi import Limiter
from slowapi.util import get_remote_address

logger = logging.getLogger(__name__)

_ENV = os.environ.get("ENV", "production").lower()
_IS_PRODUCTION = _ENV == "production"

_RAW_SECRET = os.environ.get("SESSION_SECRET", "")
if not _RAW_SECRET and _IS_PRODUCTION:
    raise RuntimeError(
        "SESSION_SECRET env var is required in production. "
        "Generate one with: python3 -c \"import secrets; print(secrets.token_hex(32))\""
    )
SECRET_KEY: str = _RAW_SECRET or "dev-secret-change-me-not-for-production"

COOKIE_NAME = "solderqa_session"
SESSION_MAX_AGE = 60 * 60 * 8
SESSION_MAX_AGE_REMEMBER = 60 * 60 * 24 * 14
_COOKIE_SECURE = _IS_PRODUCTION

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
serializer = URLSafeTimedSerializer(SECRET_KEY, salt="solderqa-auth")
_DUMMY_HASH: str = pwd_context.hash("__dummy__")

limiter = Limiter(key_func=get_remote_address)


def _constant_time_dummy_verify() -> None:
    pwd_context.verify("__dummy__", _DUMMY_HASH)


_DEFAULT_OPERATORS: dict = {}

if not _IS_PRODUCTION:
    _DEFAULT_OPERATORS = {
        "OP-2247": {
            "name": "Line 04 Operator (DEV)",
            "password_hash": pwd_context.hash("changeme"),
            "role": "operator",
        },
    }


def _load_operators() -> dict:
    raw = os.environ.get("OPERATORS_JSON")
    if not raw:
        if _IS_PRODUCTION:
            raise RuntimeError("OPERATORS_JSON env var is required in production.")
        logger.warning("OPERATORS_JSON not set; using dev fixture.")
        return _DEFAULT_OPERATORS
    try:
        parsed = json.loads(raw)
        if not isinstance(parsed, list) or not parsed:
            raise ValueError("OPERATORS_JSON must be a non-empty JSON array.")
        operators: dict = {}
        for op in parsed:
            oid = op["operator_id"]
            operators[oid] = {
                "name": op.get("name", oid),
                "password_hash": op["password_hash"],
                "role": op.get("role", "operator"),
            }
        return operators
    except (json.JSONDecodeError, KeyError, ValueError) as exc:
        raise RuntimeError(f"Malformed OPERATORS_JSON: {exc}") from exc


OPERATORS: dict = _load_operators()


def verify_operator(operator_id: str, password: str) -> Optional[dict]:
    record = OPERATORS.get(operator_id)
    if not record:
        _constant_time_dummy_verify()
        return None
    if not pwd_context.verify(password, record["password_hash"]):
        return None
    return {"operator_id": operator_id, "name": record["name"], "role": record["role"]}


class LoginRequest(BaseModel):
    operator_id: str
    password: str
    remember: bool = False

    @field_validator("operator_id", "password")
    @classmethod
    def no_empty_strings(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Field must not be blank.")
        return v


class OperatorOut(BaseModel):
    operator_id: str
    name: str
    role: str


def _make_token(operator_id: str, remember: bool) -> str:
    return serializer.dumps({"operator_id": operator_id, "iat": int(time.time()), "remember": remember})


def _decode_token(token: str) -> dict:
    try:
        data = serializer.loads(token, max_age=SESSION_MAX_AGE_REMEMBER)
    except SignatureExpired:
        raise HTTPException(status_code=401, detail="Session expired, please sign in again.")
    except BadSignature:
        raise HTTPException(status_code=401, detail="Invalid session token.")
    max_age = SESSION_MAX_AGE_REMEMBER if data.get("remember") else SESSION_MAX_AGE
    if time.time() - data.get("iat", 0) > max_age:
        raise HTTPException(status_code=401, detail="Session expired, please sign in again.")
    return data


router = APIRouter()
templates = Jinja2Templates(directory="app/templates")


@router.get("/login")
def login_page() -> FileResponse:
    return FileResponse("app/templates/login.html")


@router.post("/api/auth/login")
@limiter.limit("10/minute")
def login(request: Request, payload: LoginRequest, response: Response) -> dict:
    operator = verify_operator(payload.operator_id, payload.password)
    if not operator:
        logger.warning("Failed login attempt", extra={"operator_id": payload.operator_id, "ip": get_remote_address(request)})
        raise HTTPException(status_code=401, detail="Operator ID or password not recognised.")
    max_age = SESSION_MAX_AGE_REMEMBER if payload.remember else SESSION_MAX_AGE
    token = _make_token(operator["operator_id"], payload.remember)
    response.set_cookie(key=COOKIE_NAME, value=token, max_age=max_age, httponly=True, samesite="lax", secure=_COOKIE_SECURE)
    logger.info("Operator signed in", extra={"operator_id": operator["operator_id"], "ip": get_remote_address(request)})
    return {"ok": True, "operator": OperatorOut(**operator).model_dump()}


@router.post("/api/auth/logout")
def logout(response: Response) -> dict:
    response.delete_cookie(COOKIE_NAME, samesite="lax", secure=_COOKIE_SECURE)
    return {"ok": True}


def get_current_operator(session: Optional[str] = Cookie(default=None, alias=COOKIE_NAME)) -> dict:
    if not session:
        raise HTTPException(status_code=401, detail="Not signed in.")
    data = _decode_token(session)
    record = OPERATORS.get(data["operator_id"])
    if not record:
        raise HTTPException(status_code=401, detail="Operator account not found.")
    return {"operator_id": data["operator_id"], "name": record["name"], "role": record["role"]}


@router.get("/api/auth/me", response_model=OperatorOut)
def me(operator: dict = Depends(get_current_operator)) -> dict:
    return operator

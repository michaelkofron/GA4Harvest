import os
import json
import hmac
import hashlib
import secrets
from pathlib import Path
import re
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

# Load .env if present (env vars set in the shell take precedence)
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass

# Credential resolution order:
# 1. GOOGLE_APPLICATION_CREDENTIALS in .env or shell (explicit path anywhere on disk)
# 2. Any .json file in backend/ (auto-detect, so the filename doesn't matter)
_backend_dir = Path(__file__).resolve().parent
if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
    _json_files = sorted(_backend_dir.glob("*.json"))
    if _json_files:
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(_json_files[0])

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage" / "queries"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

from ga4 import list_properties, get_metadata, stream_report

# ── Auth ──────────────────────────────────────────────────────────────────────
AUTH_ENABLED = os.environ.get("AUTH_ENABLED", "").lower() in ("true", "1", "yes")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")
SECURE_COOKIES = os.environ.get("SECURE_COOKIES", "").lower() in ("true", "1", "yes")
_AUTH_SECRET = secrets.token_hex(32)  # regenerated each startup → cookies expire on restart

# Simple in-memory rate limiter for login: max 5 attempts per IP per 60 seconds
_login_attempts: dict[str, list[float]] = {}
_LOGIN_WINDOW = 60.0
_LOGIN_MAX = 5


def _rate_limit_login(ip: str) -> bool:
    """Returns True if the request should be blocked."""
    import time
    now = time.time()
    attempts = _login_attempts.get(ip, [])
    attempts = [t for t in attempts if now - t < _LOGIN_WINDOW]
    _login_attempts[ip] = attempts
    if len(attempts) >= _LOGIN_MAX:
        return True
    attempts.append(now)
    return False


def _make_token() -> str:
    return hmac.new(_AUTH_SECRET.encode(), ADMIN_PASSWORD.encode(), hashlib.sha256).hexdigest()


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)


@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    if not AUTH_ENABLED or not ADMIN_PASSWORD:
        return await call_next(request)
    # Allow login endpoint and OPTIONS (CORS preflight) through
    if request.url.path in ("/api/login", "/api/auth-status") or request.method == "OPTIONS":
        return await call_next(request)
    # Check all /api/ routes
    if request.url.path.startswith("/api/"):
        token = request.cookies.get("ga4h_session")
        if token != _make_token():
            return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return await call_next(request)


class LoginRequest(BaseModel):
    password: str


@app.post("/api/login")
def login(req: LoginRequest, request: Request):
    if not AUTH_ENABLED or not ADMIN_PASSWORD:
        return {"ok": True}
    client_ip = request.client.host if request.client else "unknown"
    if _rate_limit_login(client_ip):
        raise HTTPException(status_code=429, detail="Too many login attempts. Try again in a minute.")
    if not hmac.compare_digest(req.password, ADMIN_PASSWORD):
        raise HTTPException(status_code=403, detail="Wrong password")
    resp = JSONResponse(content={"ok": True})
    resp.set_cookie(
        key="ga4h_session",
        value=_make_token(),
        httponly=True,
        samesite="lax",
        secure=SECURE_COOKIES,
        max_age=60 * 60 * 24 * 30,  # 30 days
    )
    return resp


@app.get("/api/auth-status")
def auth_status():
    return {"auth_enabled": AUTH_ENABLED}


class QueryRequest(BaseModel):
    query_id: str
    property_ids: list[str]
    metrics: list[str]
    dimensions: list[str] = []
    filters: list[dict] = []
    match_mode: str = "AND"
    start_date: str
    end_date: str
    property_map: dict[str, dict] = {}


@app.get("/api/properties")
def get_properties():
    try:
        return list_properties()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/metadata/{property_id}")
def get_metadata_endpoint(property_id: str):
    try:
        return get_metadata(property_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/query/stream")
def run_query_stream(req: QueryRequest):
    storage_path = STORAGE_DIR / f"{req.query_id}.json"
    return StreamingResponse(
        stream_report(
            req.query_id,
            req.property_ids,
            req.metrics,
            req.dimensions,
            req.start_date,
            req.end_date,
            req.property_map,
            storage_path,
            req.filters,
            req.match_mode,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/history")
def get_history():
    """Returns all stored queries sorted newest-first, without the results array."""
    files = sorted(STORAGE_DIR.glob("*.json"), key=lambda f: f.stat().st_mtime, reverse=True)
    history = []
    for f in files:
        try:
            data = json.loads(f.read_text())
            history.append({k: v for k, v in data.items() if k != "results"})
        except Exception:
            pass
    return history


def _safe_query_id(query_id: str) -> str:
    if not re.fullmatch(r'[A-Za-z0-9_\-]+', query_id):
        raise HTTPException(status_code=400, detail="Invalid query ID")
    return query_id


@app.get("/api/history/{query_id}")
def get_history_item(query_id: str):
    query_id = _safe_query_id(query_id)
    """Returns a single stored query including its full results array."""
    f = STORAGE_DIR / f"{query_id}.json"
    if not f.exists():
        raise HTTPException(status_code=404, detail="Query not found")
    return json.loads(f.read_text())


@app.put("/api/history/{query_id}")
async def update_history_item(query_id: str, request: Request):
    query_id = _safe_query_id(query_id)
    f = STORAGE_DIR / f"{query_id}.json"
    data = await request.json()
    f.write_text(json.dumps(data, indent=2))
    return {"ok": True}


@app.delete("/api/history/{query_id}")
def delete_history_item(query_id: str):
    query_id = _safe_query_id(query_id)
    f = STORAGE_DIR / f"{query_id}.json"
    if f.exists():
        f.unlink()
    return {"ok": True}

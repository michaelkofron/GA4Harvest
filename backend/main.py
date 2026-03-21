import os
import json
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

# Load .env if present (env vars set in the shell take precedence)
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
except ImportError:
    pass

# Credential resolution order:
# 1. GOOGLE_APPLICATION_CREDENTIALS in .env or shell (explicit path anywhere on disk)
# 2. backend/credentials.json (drop the file in, no config needed)
_default_creds = Path(__file__).resolve().parent / "credentials.json"
if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") and _default_creds.exists():
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(_default_creds)

STORAGE_DIR = Path(__file__).resolve().parent.parent / "storage" / "queries"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

from ga4 import list_properties, get_metadata, stream_report

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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


@app.get("/api/history/{query_id}")
def get_history_item(query_id: str):
    """Returns a single stored query including its full results array."""
    f = STORAGE_DIR / f"{query_id}.json"
    if not f.exists():
        raise HTTPException(status_code=404, detail="Query not found")
    return json.loads(f.read_text())


@app.delete("/api/history/{query_id}")
def delete_history_item(query_id: str):
    f = STORAGE_DIR / f"{query_id}.json"
    if f.exists():
        f.unlink()
    return {"ok": True}

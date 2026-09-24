"""SentinelAPI engine — FastAPI entry point. Serves the API and, in production,
the built React UI from web/dist."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from .api import demo, findings, reports, scans, targets
from .config import ROOT_DIR
from .db import init_db

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="SentinelAPI Engine",
              description="Zero-Trust API Vulnerability Scanner",
              version="1.0.0", lifespan=lifespan)

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

app.include_router(targets.router)
app.include_router(scans.router)
app.include_router(findings.router)
app.include_router(reports.router)
app.include_router(demo.router)


@app.get("/api/health")
async def health():
    return {"status": "healthy", "axiom": "AI suggests. The scanner executes. Evidence verifies."}


# Serve the built UI if present (production). In dev, Vite serves the UI and
# proxies /api to this server.
_DIST = ROOT_DIR / "web" / "dist"
if _DIST.exists():
    app.mount("/assets", StaticFiles(directory=_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def spa(full_path: str):
        candidate = _DIST / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_DIST / "index.html")
else:
    @app.get("/")
    async def root():
        return {"service": "SentinelAPI Engine", "status": "online",
                "ui": "run the Vite dev server in web/ (npm run dev)"}

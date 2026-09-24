from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .api import targets, scans, findings, demo
from .db import connect_db, disconnect_db

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: initialize database connection
    await connect_db()
    yield
    # Shutdown: cleanly close database connection
    await disconnect_db()

app = FastAPI(
    title="SentinelAPI Engine",
    description="Automated Zero-Trust API Vulnerability Scanner",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for local Vite development frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(targets.router)
app.include_router(scans.router)
app.include_router(findings.router)
app.include_router(demo.router)

@app.get("/")
async def root():
    return {
        "service": "SentinelAPI Security Engine",
        "status": "online",
        "axiom": "AI suggests. The scanner executes. Evidence verifies."
    }

@app.get("/health")
async def health():
    return {"status": "healthy"}

from fastapi import FastAPI

from app.config import settings

app = FastAPI(title="Gastown Financial API")


@app.get("/api/health")
async def health_check() -> dict:
    return {
        "status": "ok",
        "llm_mock": settings.llm_mock,
    }

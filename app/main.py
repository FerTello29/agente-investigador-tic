"""Capa web de Radar TIC: publica el frontend y expone la API del agente."""
import logging
from pathlib import Path

import openai
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.models.investigacion import InvestigacionRequest, InvestigacionResponse
from app.services.investigador_service import InvestigadorService

ROOT = Path(__file__).resolve().parents[1]
log = logging.getLogger("radar_tic")

app = FastAPI(title="Radar TIC", version="1.0.0",
              description="Agente investigador de tecnología con OpenAI Responses API y Web Search")
app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins,
                   allow_methods=["GET", "POST"], allow_headers=["Content-Type"])
app.mount("/assets", StaticFiles(directory=ROOT / "assets"), name="assets")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(ROOT / "index.html")


@app.get("/api/health")
def health():
    # Solo se informa si la clave existe; nunca su valor.
    return {"status": "ok", "configured": settings.configurado, "model": settings.openai_model}


@app.post("/api/investigar", response_model=InvestigacionResponse)
def investigar(solicitud: InvestigacionRequest):
    if not settings.configurado:
        raise HTTPException(status_code=503, detail="Falta configurar OPENAI_API_KEY en el servidor")
    try:
        return InvestigadorService().investigar(solicitud)
    except openai.AuthenticationError:
        raise HTTPException(status_code=502, detail="OpenAI rechazó la API Key configurada")
    except openai.RateLimitError:
        raise HTTPException(status_code=429, detail="Límite de uso de OpenAI alcanzado; intenta más tarde")
    except openai.NotFoundError:
        raise HTTPException(status_code=502, detail=f"El modelo '{settings.openai_model}' no está disponible")
    except openai.APIError as exc:
        log.exception("Error de OpenAI")
        raise HTTPException(status_code=502, detail=f"Error al consultar OpenAI: {exc.__class__.__name__}")

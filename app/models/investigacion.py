"""Contrato explícito entre el frontend y el backend de Radar TIC."""
from enum import Enum
from pydantic import BaseModel, Field, field_validator


class ModoInvestigacion(str, Enum):
    rapido = "rapido"
    comparativo = "comparativo"
    profundo = "profundo"


class InvestigacionRequest(BaseModel):
    pregunta: str = Field(min_length=5, max_length=600)
    modo: ModoInvestigacion = ModoInvestigacion.rapido
    usar_web_search: bool = True

    @field_validator("pregunta")
    @classmethod
    def limpiar(cls, valor: str) -> str:
        valor = " ".join(valor.split())
        if len(valor) < 5:
            raise ValueError("La pregunta es demasiado corta")
        return valor


class Fuente(BaseModel):
    titulo: str
    url: str
    dominio: str = ""
    descripcion: str = ""
    verificada: bool = False


class Reporte(BaseModel):
    titulo: str
    resumen: str
    plan: list[str] = []
    hallazgos: list[str] = []
    coincidencias: list[str] = []
    diferencias: list[str] = []
    tendencias: list[str] = []
    conclusion: str = ""


class InvestigacionResponse(BaseModel):
    pregunta: str
    modo: ModoInvestigacion
    modelo: str
    web_search: bool
    fecha: str
    duracion_ms: int
    reporte: Reporte
    fuentes: list[Fuente] = []
    busquedas: list[str] = []

"""Lógica del agente Radar TIC: instrucciones, Responses API, Web Search y fuentes."""
import json
import time
from datetime import datetime, timezone
from urllib.parse import urlparse, urlencode, parse_qsl, urlunparse

from openai import OpenAI

from app.core.config import settings
from app.models.investigacion import (
    Fuente, InvestigacionRequest, InvestigacionResponse, ModoInvestigacion, Reporte,
)

_LISTA = {"type": "array", "items": {"type": "string"}}

ESQUEMA_REPORTE = {
    "type": "object",
    "additionalProperties": False,
    "required": ["titulo", "resumen", "plan", "hallazgos", "coincidencias", "diferencias",
                 "tendencias", "conclusion", "fuentes"],
    "properties": {
        "titulo": {"type": "string"},
        "resumen": {"type": "string"},
        "plan": _LISTA,
        "hallazgos": _LISTA,
        "coincidencias": _LISTA,
        "diferencias": _LISTA,
        "tendencias": _LISTA,
        "conclusion": {"type": "string"},
        "fuentes": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["titulo", "url", "descripcion"],
                "properties": {
                    "titulo": {"type": "string"},
                    "url": {"type": "string"},
                    "descripcion": {"type": "string"},
                },
            },
        },
    },
}


class InvestigadorService:
    """Agente investigador: planifica, busca en Internet, contrasta y reporta."""

    MODOS = {
        ModoInvestigacion.rapido: (
            "Modo RÁPIDO: responde de forma directa. Plan de 3 pasos, 3-4 hallazgos, "
            "1-2 elementos por lista restante. Consulta al menos 3 fuentes distintas."
        ),
        ModoInvestigacion.comparativo: (
            "Modo COMPARATIVO: contrasta posturas, tecnologías u organizaciones. Plan de 4 pasos, "
            "4-6 hallazgos y énfasis especial en coincidencias y diferencias entre fuentes. "
            "Consulta al menos 5 fuentes de tipos distintos (académicas, industria, prensa, organismos)."
        ),
        ModoInvestigacion.profundo: (
            "Modo PROFUNDO: análisis exhaustivo. Plan de 5 pasos, 6-8 hallazgos con datos, cifras y "
            "fechas concretas, y tendencias con horizonte temporal. Consulta al menos 6 fuentes."
        ),
    }

    def __init__(self, client: OpenAI | None = None):
        self.client = client or OpenAI(api_key=settings.openai_api_key)
        self.modelo = settings.openai_model

    def investigar(self, solicitud: InvestigacionRequest) -> InvestigacionResponse:
        inicio = time.perf_counter()
        parametros = {
            "model": self.modelo,
            "instructions": self._instrucciones(solicitud),
            "input": solicitud.pregunta,
            "text": {"format": {"type": "json_schema", "name": "reporte_radar_tic",
                                "schema": ESQUEMA_REPORTE, "strict": True}},
        }
        if solicitud.usar_web_search:
            parametros["tools"] = [{"type": "web_search"}]
            parametros["include"] = ["web_search_call.action.sources"]

        response = self.client.responses.create(**parametros)
        datos = self._leer_json(response.output_text)
        citas, busquedas = self._evidencia_web(response)

        return InvestigacionResponse(
            pregunta=solicitud.pregunta,
            modo=solicitud.modo,
            modelo=getattr(response, "model", None) or self.modelo,
            web_search=solicitud.usar_web_search,
            fecha=datetime.now(timezone.utc).isoformat(timespec="seconds"),
            duracion_ms=int((time.perf_counter() - inicio) * 1000),
            reporte=Reporte(**{k: v for k, v in datos.items() if k != "fuentes"}),
            fuentes=self._combinar_fuentes(citas, datos.get("fuentes", [])),
            busquedas=busquedas,
        )

    def _instrucciones(self, solicitud: InvestigacionRequest) -> str:
        hoy = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        if solicitud.usar_web_search:
            herramienta = (
                "Tienes la herramienta web_search. Úsala SIEMPRE antes de responder: realiza varias "
                "búsquedas, prioriza fuentes primarias y recientes, y contrasta la información. Incluye "
                "en 'fuentes' únicamente URLs que realmente consultaste."
            )
        else:
            herramienta = (
                "NO tienes acceso a Internet. Responde solo con tu conocimiento previo, indica en el "
                "resumen la fecha aproximada de tu conocimiento y, si mencionas fuentes, aclara en su "
                "descripción que no fueron verificadas."
            )
        return (
            f"Eres Radar TIC, un agente investigador de Tecnologías de la Información y Comunicación. "
            f"Fecha actual: {hoy}. Responde siempre en español.\n"
            f"{herramienta}\n{self.MODOS[solicitud.modo]}\n"
            "Reglas: presenta perspectivas distintas cuando existan y no conviertas una única fuente en "
            "verdad absoluta; distingue hechos de opiniones; menciona fechas de los datos; no inventes "
            "cifras. No pongas enlaces ni marcas de cita dentro del texto: las fuentes van solo en "
            "'fuentes'. Puedes usar **negritas** para resaltar conceptos clave.\n"
            "Campos: titulo (título del reporte), resumen (1 párrafo), plan (pasos que seguiste), "
            "hallazgos, coincidencias (en qué concuerdan las fuentes), diferencias (en qué discrepan), "
            "tendencias, conclusion (1 párrafo) y fuentes (titulo, url, descripcion breve)."
        )

    @staticmethod
    def _leer_json(texto: str) -> dict:
        try:
            datos = json.loads(texto)
        except (json.JSONDecodeError, TypeError):
            datos = {"titulo": "Reporte de investigación", "resumen": texto or "Sin respuesta del modelo."}
        datos.setdefault("titulo", "Reporte de investigación")
        datos.setdefault("resumen", "")
        return datos

    @classmethod
    def _evidencia_web(cls, response) -> tuple[dict[str, str], list[str]]:
        """Obtiene URLs citadas/consultadas y las consultas que hizo el agente."""
        citas: dict[str, str] = {}
        busquedas: list[str] = []
        for item in getattr(response, "output", None) or []:
            item = item.model_dump() if hasattr(item, "model_dump") else item
            if item.get("type") == "web_search_call":
                accion = item.get("action") or {}
                consultas = accion.get("queries") or [accion.get("query")]
                busquedas += [q for q in consultas if q and q not in busquedas]
                for fuente in accion.get("sources") or []:
                    if fuente.get("url"):
                        citas.setdefault(cls._normalizar(fuente["url"]), fuente.get("title") or "")
            elif item.get("type") == "message":
                for contenido in item.get("content") or []:
                    for nota in contenido.get("annotations") or []:
                        if nota.get("type") == "url_citation" and nota.get("url"):
                            url = cls._normalizar(nota["url"])
                            if not citas.get(url):
                                citas[url] = nota.get("title") or ""
        return citas, busquedas

    @classmethod
    def _combinar_fuentes(cls, citas: dict[str, str], sugeridas: list[dict]) -> list[Fuente]:
        """Une las fuentes del reporte con la evidencia real devuelta por Web Search."""
        fuentes: dict[str, Fuente] = {}
        for item in sugeridas:
            url = cls._normalizar(item.get("url", ""))
            if not url.startswith("http"):
                continue
            fuentes[url] = Fuente(
                titulo=item.get("titulo") or citas.get(url) or cls._dominio(url),
                url=url, dominio=cls._dominio(url),
                descripcion=item.get("descripcion", ""), verificada=url in citas,
            )
        # Citas reales que el modelo no listó: se conservan para no perder evidencia.
        for url, titulo in citas.items():
            if url not in fuentes and len(fuentes) < 12:
                fuentes[url] = Fuente(titulo=titulo or cls._dominio(url), url=url,
                                      dominio=cls._dominio(url), verificada=True)
        return sorted(fuentes.values(), key=lambda f: not f.verificada)

    @staticmethod
    def _normalizar(url: str) -> str:
        partes = urlparse(url.strip())
        query = [(k, v) for k, v in parse_qsl(partes.query) if not k.startswith("utm_")]
        return urlunparse(partes._replace(query=urlencode(query), fragment="")).rstrip("/")

    @staticmethod
    def _dominio(url: str) -> str:
        return urlparse(url).netloc.removeprefix("www.")

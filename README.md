# Radar TIC · Agente investigador de tecnología

Agente investigador que recibe una pregunta sobre Tecnologías de la Información y Comunicación, **planifica**, **busca en Internet** con la herramienta `web_search` de la **OpenAI Responses API**, **contrasta fuentes** y entrega un reporte estructurado con evidencia verificable.

> Práctica 2.2 · Agente investigador — FastAPI · OpenAI Responses API · Web Search · Git/GitHub · Vercel

**Demo en producción:** https://agente-investigador-tic-swart.vercel.app

## Funcionalidades

- **Tres modos de investigación:** ⚡ rápido, ⚖️ comparativo y 🔬 profundo.
- **Reporte estructurado:** resumen, plan, hallazgos, coincidencias, diferencias, tendencias, conclusión y fuentes (salida JSON validada con *Structured Outputs*).
- **Fuentes verificadas:** cada fuente se cruza con las citas (`url_citation`) y las fuentes que devuelve `web_search_call`; las que el modelo menciona sin haberlas consultado se marcan como *sin verificar*.
- **Actividad del agente:** línea de tiempo, cronómetro y las búsquedas reales que ejecutó el agente.
- **Interruptor de Web Search** para los experimentos A (sin Internet) y B (con Internet).
- Historial local, exportación a Markdown, tema claro/oscuro y diseño responsivo.

## Estructura

```
agente-investigador-tic/
├── app/
│   ├── main.py                     # Capa web: FastAPI, CORS, estáticos y endpoints
│   ├── core/config.py              # Variables de entorno (OPENAI_API_KEY, OPENAI_MODEL)
│   ├── models/investigacion.py     # Contrato Pydantic: solicitud, reporte, fuentes
│   └── services/investigador_service.py  # Lógica del agente: instrucciones, Responses API, Web Search
├── assets/
│   ├── css/styles.css              # Presentación visual
│   └── js/
│       ├── config.js               # AppConfig: qué endpoint consumir
│       ├── api.js                  # RadarApi: comunicación HTTP
│       └── app.js                  # RadarApp: eventos, estados y renderizado
├── api/index.py                    # Entrada serverless para Vercel (reutiliza app.main)
├── scripts/prueba_minima.py        # Primera llamada sin herramientas (paso 17)
├── index.html                      # Estructura semántica de la interfaz
├── app.py                          # Punto de entrada local
├── vercel.json                     # Rewrites /api/* → función Python
├── .env.example · .gitignore · .python-version · requirements.txt
```

| Capa | Responsabilidad |
|---|---|
| `index.html` + `assets/css` | Estructura y estilos separados |
| `assets/js` | Clases para configuración, HTTP y comportamiento |
| `app/main.py` | Coordina HTTP; no contiene la lógica del agente |
| `app/core/config.py` | Único lugar que conoce dónde viven las credenciales |
| `app/models` | Valida la pregunta, el modo y la forma de la respuesta |
| `app/services` | `InvestigadorService` construye instrucciones, llama a OpenAI y procesa fuentes |

## API

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/health` | Estado del servidor; indica si existe la clave (nunca su valor) |
| `POST` | `/api/investigar` | `{ "pregunta": "...", "modo": "rapido\|comparativo\|profundo", "usar_web_search": true }` |

## Ejecución local

```bash
python -m venv .venv
.venv\Scripts\activate            # Windows
pip install -r requirements.txt
copy .env.example .env            # y coloca tu OPENAI_API_KEY
python -m scripts.prueba_minima   # prueba sin herramientas
python app.py                     # http://127.0.0.1:5000
```

## Modelo, agente y herramienta

- **Modelo:** genera respuestas con su conocimiento y el contexto disponible.
- **Agente:** persigue un objetivo (investigar) y decide usar herramientas.
- **Web Search:** con `tools=[{"type": "web_search"}]` el modelo puede consultar información externa y actual antes de responder; por eso aparecen citas, fechas recientes y fuentes comprobables. Sin la herramienta, el modelo solo dispone de su conocimiento de entrenamiento y no puede verificar nada.

### Experimentos A / B

Desactiva el interruptor **Web Search** (experimento A), investiga, vuelve a activarlo (experimento B) y repite exactamente la misma pregunta. Ambos resultados quedan en **Historial** para compararlos.

| Criterio | A · sin Web Search | B · con Web Search |
|---|---|---|
| Actualidad | Limitada a la fecha de entrenamiento | Información del momento de la consulta |
| Fuentes | Ninguna o *sin verificar* | Citadas por la API y verificadas |
| Evidencia verificable | No | Sí, con enlaces |
| Fechas | Genéricas | Concretas y recientes |
| Profundidad | General | Datos y cifras de fuentes |
| Comprobación de afirmaciones | No es posible | Posible abriendo cada fuente |

## Despliegue en Vercel

1. Importar el repositorio de GitHub en Vercel (preset **Other**).
2. `api/index.py` expone la misma app FastAPI como función Python; `vercel.json` reescribe `/api/*` hacia ella y amplía `maxDuration` a 300 s porque una investigación profunda puede tardar más de un minuto.
3. `index.html` y `assets/` se sirven como archivos estáticos desde la CDN.
4. Variables de entorno del proyecto: `OPENAI_API_KEY` (sensible) y `OPENAI_MODEL`.

## Seguridad de la API Key

- En local la clave vive solo en `.env`, ignorado por `.gitignore`.
- En Vercel se configura como variable de entorno cifrada.
- El navegador solo conoce `/api/investigar`; la clave nunca aparece en HTML, JS, respuestas ni en el repositorio.
- Todo el contenido devuelto por el modelo se escapa antes de insertarse en el DOM.

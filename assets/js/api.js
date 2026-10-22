/**
 * RadarApi: encapsula la comunicación HTTP con el backend.
 */
class RadarApi {
  constructor(base = AppConfig.apiBase) {
    this.base = base;
  }

  async health() {
    return this.#request(AppConfig.endpoints.health, { method: "GET" }, 8000);
  }

  async investigar({ pregunta, modo, usarWebSearch }) {
    return this.#request(AppConfig.endpoints.investigar, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pregunta, modo, usar_web_search: usarWebSearch }),
    });
  }

  async #request(ruta, opciones, timeout = AppConfig.timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(this.base + ruta, { ...opciones, signal: controller.signal });
      const datos = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(RadarApi.#mensajeError(res.status, datos));
      return datos;
    } catch (err) {
      if (err.name === "AbortError") throw new Error("La investigación tardó demasiado. Intenta con el modo rápido.");
      if (err instanceof TypeError) throw new Error("No se pudo conectar con el backend de Radar TIC.");
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  static #mensajeError(status, datos) {
    const detalle = datos?.detail;
    if (Array.isArray(detalle)) return detalle.map((d) => d.msg).join(". ");
    return detalle || `Error ${status} del servidor`;
  }
}

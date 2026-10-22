/**
 * AppConfig: decide qué endpoint consume el frontend.
 * - Servido por FastAPI (localhost:5000) o por Vercel → mismo origen ("").
 * - Abierto con Live Server u otro puerto/archivo → backend local en :5000.
 * Aquí nunca se coloca la API Key: solo existe en el servidor.
 */
class AppConfig {
  static LOCAL_API = "http://127.0.0.1:5000";

  static get apiBase() {
    const { protocol, port } = window.location;
    if (protocol === "file:") return AppConfig.LOCAL_API;
    const esLocal = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    if (esLocal && port && port !== "5000") return AppConfig.LOCAL_API;
    return "";
  }

  static endpoints = {
    health: "/api/health",
    investigar: "/api/investigar",
  };

  static timeoutMs = 300000;
  static historialKey = "radar-tic:historial";
  static temaKey = "radar-tic:tema";
}

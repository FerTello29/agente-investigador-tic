/**
 * app.js: controla eventos, estados de la interfaz y presentación de resultados.
 */

const MODOS = {
  rapido: { nombre: "Rápido", plan: ["Definir los aspectos clave del tema", "Buscar información en fuentes confiables", "Sintetizar hallazgos y conclusión"] },
  comparativo: { nombre: "Comparativo", plan: ["Identificar posturas y actores relevantes", "Buscar fuentes de distintos tipos", "Contrastar coincidencias y diferencias", "Generar un reporte comparativo con fuentes"] },
  profundo: { nombre: "Profundo", plan: ["Definir los aspectos clave del tema", "Buscar información en fuentes confiables", "Analizar y comparar la información", "Identificar tendencias, oportunidades y desafíos", "Generar un reporte con conclusiones y fuentes"] },
};

const SUGERENCIAS = [
  "¿Cuáles son las tendencias de agentes de inteligencia artificial durante 2026?",
  "¿Cuál es el impacto de la IA generativa en el trabajo de los programadores?",
  "Principales amenazas de ciberseguridad para empresas en 2026",
  "Wi-Fi 7 vs 5G para redes empresariales: ventajas y desventajas",
  "Estado actual del IoT industrial en Latinoamérica",
];

const PASOS = [
  { id: "plan", texto: "Planificando la investigación…" },
  { id: "buscar", texto: "Buscando información en Internet…", web: true },
  { id: "analizar", texto: "Analizando fuentes encontradas…" },
  { id: "contrastar", texto: "Contrastando información…" },
  { id: "reporte", texto: "Generando reporte final…" },
];

/** Utilidades de texto seguras: todo contenido externo se escapa antes de insertarse. */
class Formato {
  static escapar(texto = "") {
    return String(texto).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  static enLinea(texto = "") {
    const limpio = String(texto)
      .replace(/\s*\(\[[^\]]*\]\([^)]*\)\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
    return Formato.escapar(limpio).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }

  static plano(texto = "") {
    return String(texto).replace(/\*\*(.+?)\*\*/g, "$1");
  }

  static fecha(iso) {
    return new Date(iso).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });
  }

  static segundos(ms) {
    return `${(ms / 1000).toFixed(1)} s`;
  }
}

/** Historial local (solo en este navegador). */
class Historial {
  static MAX = 30;

  static listar() {
    try { return JSON.parse(localStorage.getItem(AppConfig.historialKey)) || []; } catch { return []; }
  }

  static guardar(resultado) {
    const items = [resultado, ...Historial.listar()].slice(0, Historial.MAX);
    try { localStorage.setItem(AppConfig.historialKey, JSON.stringify(items)); } catch { /* almacenamiento no disponible */ }
    return items;
  }

  static limpiar() {
    try { localStorage.removeItem(AppConfig.historialKey); } catch { /* sin almacenamiento */ }
  }
}

/** Línea de tiempo de la actividad del agente. */
class ActividadAgente {
  constructor(lista, timer) {
    this.lista = lista;
    this.timer = timer;
    this.intervalos = [];
  }

  reiniciar(usarWeb) {
    this.detener();
    this.lista.innerHTML = PASOS.map((p) => `
      <li data-paso="${p.id}" class="${p.web && !usarWeb ? "skip" : ""}">
        <span class="dot"></span><span class="txt">${p.web && !usarWeb ? "Web Search desactivado" : p.texto}</span>
      </li>`).join("");
  }

  iniciar(usarWeb, modo) {
    this.reiniciar(usarWeb);
    const pasos = PASOS.filter((p) => usarWeb || !p.web).map((p) => p.id);
    const ritmo = { rapido: 4000, comparativo: 7000, profundo: 10000 }[modo];
    let i = 0;
    this.#marcar(pasos[0], "active");
    this.intervalos.push(setInterval(() => {
      if (i >= pasos.length - 1) return;
      this.#marcar(pasos[i], "done");
      this.#marcar(pasos[++i], "active");
    }, ritmo));

    const inicio = performance.now();
    this.intervalos.push(setInterval(() => {
      this.timer.textContent = Formato.segundos(performance.now() - inicio).padStart(6, "0");
    }, 100));
  }

  completar(resultado) {
    this.detener();
    const verificadas = resultado.fuentes.filter((f) => f.verificada).length;
    const textos = {
      buscar: `Buscando información en Internet (${resultado.busquedas.length || "varias"} búsquedas)`,
      analizar: `Analizando ${resultado.fuentes.length} fuentes encontradas${resultado.web_search ? ` (${verificadas} verificadas)` : ""}`,
      reporte: "Reporte final generado",
    };
    this.lista.querySelectorAll("li:not(.skip)").forEach((li) => {
      li.className = "done";
      if (textos[li.dataset.paso]) li.querySelector(".txt").textContent = textos[li.dataset.paso];
    });
    this.timer.textContent = Formato.segundos(resultado.duracion_ms);
  }

  fallar(mensaje) {
    this.detener();
    const activo = this.lista.querySelector("li.active") || this.lista.querySelector("li:not(.skip)");
    if (activo) {
      activo.className = "error";
      activo.querySelector(".txt").textContent = mensaje;
    }
  }

  detener() {
    this.intervalos.forEach(clearInterval);
    this.intervalos = [];
  }

  #marcar(id, estado) {
    const li = this.lista.querySelector(`[data-paso="${id}"]`);
    if (li) li.className = estado;
  }
}

/** Controlador principal de la interfaz. */
class RadarApp {
  constructor() {
    this.api = new RadarApi();
    this.$ = (sel) => document.querySelector(sel);
    this.form = this.$("#form-investigacion");
    this.pregunta = this.$("#pregunta");
    this.webSearch = this.$("#web-search");
    this.boton = this.$("#btn-investigar");
    this.actividad = new ActividadAgente(this.$("#actividad"), this.$("#timer"));
    this.resultado = null;
  }

  iniciar() {
    this.#aplicarTema(this.#temaGuardado());
    this.#renderSugerencias();
    this.#renderPlan(MODOS.rapido.plan, false);
    this.actividad.reiniciar(true);
    this.#renderHistorial();
    this.#eventos();
    this.#verificarBackend();
  }

  #eventos() {
    this.form.addEventListener("submit", (e) => { e.preventDefault(); this.investigar(); });
    this.pregunta.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) this.investigar();
    });
    this.pregunta.addEventListener("input", () => {
      this.$("#contador").textContent = `${this.pregunta.value.length}/600`;
    });
    this.form.querySelectorAll('input[name="modo"]').forEach((r) =>
      r.addEventListener("change", () => this.#renderPlan(MODOS[r.value].plan, false)));
    this.webSearch.addEventListener("change", () => {
      this.$("#ws-estado").textContent = this.webSearch.checked ? "activado" : "desactivado";
      this.actividad.reiniciar(this.webSearch.checked);
    });
    document.querySelectorAll("[data-view]").forEach((el) =>
      el.addEventListener("click", (e) => { e.preventDefault(); this.#mostrarVista(el.dataset.view); }));
    this.$("#theme-toggle").addEventListener("click", () => {
      const tema = document.documentElement.dataset.theme === "light" ? "dark" : "light";
      this.#aplicarTema(tema);
      try { localStorage.setItem(AppConfig.temaKey, tema); } catch { /* sin almacenamiento */ }
    });
    this.$("#btn-copiar").addEventListener("click", () => this.#copiar());
    this.$("#btn-descargar").addEventListener("click", () => this.#descargar());
    this.$("#btn-limpiar").addEventListener("click", () => {
      Historial.limpiar();
      this.#renderHistorial();
      this.#toast("Historial borrado");
    });
  }

  async investigar() {
    const pregunta = this.pregunta.value.trim();
    if (pregunta.length < 5) {
      this.#toast("Escribe una pregunta de al menos 5 caracteres", true);
      this.pregunta.focus();
      return;
    }
    const modo = this.form.querySelector('input[name="modo"]:checked').value;
    const usarWebSearch = this.webSearch.checked;

    this.#cargando(true);
    this.#renderPlan(MODOS[modo].plan, false);
    this.actividad.iniciar(usarWebSearch, modo);
    this.#renderSkeleton();
    this.$("#busquedas").hidden = true;
    this.$("#fuentes-card").hidden = true;
    this.$("#reporte").scrollIntoView({ behavior: "smooth", block: "start" });

    try {
      const resultado = await this.api.investigar({ pregunta, modo, usarWebSearch });
      this.actividad.completar(resultado);
      this.#mostrarResultado(resultado);
      Historial.guardar(resultado);
      this.#renderHistorial();
    } catch (err) {
      this.actividad.fallar(err.message);
      this.#renderError(err.message);
      this.#toast(err.message, true);
    } finally {
      this.#cargando(false);
    }
  }

  #mostrarResultado(r) {
    this.resultado = r;
    const rep = r.reporte;
    if (rep.plan?.length) this.#renderPlan(rep.plan, true);

    const lista = (items) => items?.length
      ? `<ul>${items.map((i) => `<li>${Formato.enLinea(i)}</li>`).join("")}</ul>`
      : `<p class="none">Sin elementos para esta sección.</p>`;
    const bloque = (clase, titulo, contenido, ancho = false) =>
      `<section class="block b-${clase}${ancho ? " wide" : ""}"><h3>${titulo}</h3>${contenido}</section>`;

    this.$("#reporte-contenido").innerHTML = `
      <h2 class="report-title">${Formato.enLinea(rep.titulo)}</h2>
      <div class="meta">
        <span>📅 ${Formato.fecha(r.fecha)}</span>
        <span>🧭 ${MODOS[r.modo].nombre}</span>
        <span>🤖 ${Formato.escapar(r.modelo)}</span>
        <span>⏱ ${Formato.segundos(r.duracion_ms)}</span>
        <span class="${r.web_search ? "on" : "off"}">${r.web_search ? "🌐 Web Search activo" : "⛔ Sin Web Search"}</span>
        <span>🔗 ${r.fuentes.length} fuentes</span>
      </div>
      <div class="summary"><h3>Resumen</h3><p>${Formato.enLinea(rep.resumen)}</p></div>
      <div class="blocks">
        ${bloque("hallazgos", "Hallazgos", lista(rep.hallazgos), true)}
        ${bloque("coincidencias", "Coincidencias", lista(rep.coincidencias))}
        ${bloque("diferencias", "Diferencias", lista(rep.diferencias))}
        ${bloque("tendencias", "Tendencias", lista(rep.tendencias), true)}
        ${bloque("conclusion", "Conclusión", `<p>${Formato.enLinea(rep.conclusion)}</p>`, true)}
      </div>`;
    this.$("#report-tools").hidden = false;

    const chips = this.$("#busquedas-lista");
    chips.innerHTML = r.busquedas.map((q) => `<span class="chip">${Formato.escapar(q)}</span>`).join("");
    this.$("#busquedas").hidden = !r.busquedas.length;

    this.#renderFuentes(r);
  }

  #renderFuentes(r) {
    const verificadas = r.fuentes.filter((f) => f.verificada).length;
    this.$("#fuentes-tag").textContent = r.fuentes.length ? `${verificadas}/${r.fuentes.length} verificadas` : "";
    this.$("#fuentes").innerHTML = r.fuentes.length
      ? r.fuentes.map((f, i) => {
          let url = "#";
          try { url = new URL(f.url).href; } catch { /* URL inválida */ }
          return `
          <li class="source" style="animation-delay:${i * 40}ms">
            <span class="num"><img src="https://www.google.com/s2/favicons?sz=64&domain=${encodeURIComponent(f.dominio)}" alt="" loading="lazy" onerror="this.remove()"></span>
            <div class="source-body">
              <a href="${Formato.escapar(url)}" target="_blank" rel="noopener noreferrer">${Formato.escapar(f.titulo)}</a>
              <span class="domain">${Formato.escapar(f.dominio)}
                ${f.verificada ? '<span class="verified">✓ citada por Web Search</span>' : '<span class="unverified">sin verificar</span>'}</span>
              ${f.descripcion ? `<p>${Formato.enLinea(f.descripcion)}</p>` : ""}
            </div>
          </li>`;
        }).join("")
      : `<li class="no-sources">${r.web_search ? "El agente no devolvió fuentes para esta consulta." : "Sin Web Search el modelo no consulta Internet, por lo que no hay fuentes verificables."}</li>`;
    this.$("#fuentes-card").hidden = false;
  }

  #renderPlan(pasos, final) {
    const plan = this.$("#plan");
    plan.classList.toggle("final", final);
    plan.innerHTML = pasos.map((p, i) => `<li style="animation-delay:${i * 60}ms">${Formato.enLinea(p)}</li>`).join("");
    this.$("#plan-tag").textContent = final ? "Ejecutado por el agente" : "Propuesto";
  }

  #renderSkeleton() {
    this.$("#report-tools").hidden = true;
    this.$("#reporte-contenido").innerHTML = `<div class="skeleton"><span></span><span></span><span></span><span></span><span></span></div>`;
  }

  #renderError(mensaje) {
    this.$("#reporte-contenido").innerHTML = `
      <div class="empty"><p><strong>No se pudo completar la investigación.</strong><br>${Formato.escapar(mensaje)}</p></div>`;
  }

  #renderSugerencias() {
    const cont = this.$("#sugerencias");
    cont.innerHTML = SUGERENCIAS.map((s) => `<button type="button">${Formato.escapar(s)}</button>`).join("");
    cont.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      this.pregunta.value = b.textContent;
      this.pregunta.dispatchEvent(new Event("input"));
      this.pregunta.focus();
    }));
  }

  #renderHistorial() {
    const items = Historial.listar();
    this.$("#historial-count").textContent = items.length;
    const cont = this.$("#historial");
    if (!items.length) {
      cont.innerHTML = `<p class="history-empty">Aún no hay investigaciones guardadas.</p>`;
      return;
    }
    cont.innerHTML = items.map((r, i) => `
      <button class="history-item" data-i="${i}">
        <h3>${Formato.escapar(Formato.plano(r.reporte.titulo))}</h3>
        <p>${Formato.escapar(r.pregunta)}</p>
        <div class="meta">
          <span>${Formato.fecha(r.fecha)}</span>
          <span>${MODOS[r.modo]?.nombre ?? r.modo}</span>
          <span class="${r.web_search ? "on" : "off"}">${r.web_search ? "Con Web Search" : "Sin Web Search"}</span>
          <span>${r.fuentes.length} fuentes</span>
        </div>
      </button>`).join("");
    cont.querySelectorAll(".history-item").forEach((b) => b.addEventListener("click", () => {
      const r = items[Number(b.dataset.i)];
      this.pregunta.value = r.pregunta;
      this.pregunta.dispatchEvent(new Event("input"));
      this.actividad.reiniciar(r.web_search);
      this.actividad.completar(r);
      this.#mostrarResultado(r);
      this.#mostrarVista("investigar");
      setTimeout(() => this.$("#reporte").scrollIntoView({ behavior: "smooth" }), 50);
    }));
  }

  #mostrarVista(vista) {
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${vista}`));
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === vista));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async #verificarBackend() {
    const status = this.$("#status");
    const texto = status.querySelector("span");
    try {
      const h = await this.api.health();
      status.className = `status ${h.configured ? "ok" : "warn"}`;
      texto.textContent = h.configured ? h.model : "Falta OPENAI_API_KEY";
    } catch {
      status.className = "status err";
      texto.textContent = "Backend desconectado";
    }
  }

  #cargando(activo) {
    this.boton.disabled = activo;
    this.boton.classList.toggle("loading", activo);
    this.boton.querySelector(".btn-label").textContent = activo ? "Investigando…" : "Investigar";
    this.$("#radar").classList.toggle("scanning", activo);
  }

  #markdown() {
    const r = this.resultado;
    const rep = r.reporte;
    const lista = (items) => (items || []).map((i) => `- ${i}`).join("\n") || "- (sin elementos)";
    const fuentes = r.fuentes.map((f, i) => `${i + 1}. [${f.titulo}](${f.url})${f.verificada ? "" : " _(sin verificar)_"}${f.descripcion ? ` — ${f.descripcion}` : ""}`).join("\n");
    return `# ${rep.titulo}\n\n> **Pregunta:** ${r.pregunta}  \n> **Modo:** ${MODOS[r.modo].nombre} · **Modelo:** ${r.modelo} · **Web Search:** ${r.web_search ? "sí" : "no"} · **Fecha:** ${Formato.fecha(r.fecha)}\n\n` +
      `## Resumen\n${rep.resumen}\n\n## Plan de investigación\n${(rep.plan || []).map((p, i) => `${i + 1}. ${p}`).join("\n")}\n\n` +
      `## Hallazgos\n${lista(rep.hallazgos)}\n\n## Coincidencias\n${lista(rep.coincidencias)}\n\n## Diferencias\n${lista(rep.diferencias)}\n\n` +
      `## Tendencias\n${lista(rep.tendencias)}\n\n## Conclusión\n${rep.conclusion}\n\n## Fuentes\n${fuentes || "(sin fuentes)"}\n\n` +
      (r.busquedas.length ? `## Búsquedas realizadas\n${r.busquedas.map((q) => `- \`${q}\``).join("\n")}\n` : "");
  }

  async #copiar() {
    try {
      await navigator.clipboard.writeText(this.#markdown());
      this.#toast("Reporte copiado como Markdown");
    } catch {
      this.#toast("No se pudo copiar al portapapeles", true);
    }
  }

  #descargar() {
    const blob = new Blob([this.#markdown()], { type: "text/markdown;charset=utf-8" });
    const a = Object.assign(document.createElement("a"), {
      href: URL.createObjectURL(blob),
      download: `radar-tic-${new Date(this.resultado.fecha).toISOString().slice(0, 10)}.md`,
    });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  #temaGuardado() {
    try {
      const guardado = localStorage.getItem(AppConfig.temaKey);
      if (guardado) return guardado;
    } catch { /* sin almacenamiento */ }
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  #aplicarTema(tema) {
    document.documentElement.dataset.theme = tema;
  }

  #toast(mensaje, error = false) {
    const t = this.$("#toast");
    t.textContent = mensaje;
    t.className = `toast show${error ? " error" : ""}`;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove("show"), 3800);
  }
}

document.addEventListener("DOMContentLoaded", () => new RadarApp().iniciar());

/* Original event images only. Uses the existing authenticated client and image URLs. */
(function (root) {
  "use strict";
  function day(value = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
    return ["year", "month", "day"].map(key => parts.find(p => p.type === key).value).join("-");
  }
  function plusDays(date, amount) {
    const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + amount);
    return d.toISOString().slice(0, 10);
  }
  function validRange(from, to) {
    const valid = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
    return valid(from) && valid(to) && from <= to;
  }
  function imageUrl(value) {
    const source = String(value || "").trim();
    if (!source) return "";
    const config = root.DEDICALIVRES_CONFIG || {};
    const worker = String(config.exportsBaseUrl || "https://dedicalivres-daily-export.dedicalivres.workers.dev/exports").replace(/\/exports\/?$/i, "").replace(/\/+$/, "");
    const media = `${worker}/media`;
    const r2 = String(config.r2PublicBaseUrl || "").replace(/\/+$/, "");
    // Same media gateway as the Social tool; avoids direct R2 CORS downloads.
    if (/^event-images\//i.test(source)) return `${media}/${source}`;
    try {
      const url = new URL(source);
      if (url.protocol !== "https:") return "";
      if (url.href.startsWith(`${media}/`)) return url.href;
      if (r2 && url.href.startsWith(`${r2}/`)) return `${media}/${url.href.slice(r2.length + 1)}`;
      return `${media}/remote?url=${encodeURIComponent(url.href)}`;
    } catch { return ""; }
  }
  function fileName(event, index, type) {
    const slug = String(event.title || "evenement").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 80).replace(/^-|-$/g, "") || "evenement";
    const extension = ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "image/svg+xml": "svg" })[type] || "img";
    const id = String(event.id).replace(/[^a-zA-Z0-9_-]/g, "");
    return `${event.start_date}-${slug}-${id}-${index + 1}.${extension}`;
  }
  async function loadEvents(client, from, to) {
    if (!validRange(from, to)) throw new Error("Choisissez une période valide.");
    const events = [];
    // Count is checked so a server-side row cap cannot silently truncate a batch.
    for (let offset = 0; ; ) {
      let timer;
      const query = client.from("events")
        .select("id,title,start_date,image_url", { count: "exact" })
        .gte("start_date", from).lte("start_date", to)
        .order("start_date", { ascending: true }).order("id", { ascending: true }).range(offset, offset + 199);
      let response;
      try {
        response = await Promise.race([query, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("Chargement trop long. Réessayez.")), 15000);
        })]);
      } finally { clearTimeout(timer); }
      const { data, error, count } = response;
      if (error) throw new Error("Impossible de charger les événements. Réessayez.");
      if (!Array.isArray(data) || !Number.isInteger(count)) throw new Error("Liste incomplète : nombre d’événements indisponible.");
      events.push(...data); offset += data.length;
      if (offset >= count) break;
      if (!data.length) throw new Error("Liste incomplète. Relancez le chargement.");
    }
    return events;
  }
  async function collect(events, fetcher, zip, progress, authorized = () => true) {
    const failures = []; let saved = 0; let bytes = 0;
    for (const [index, event] of events.entries()) {
      if (!authorized()) throw new Error("Session expirée. Reconnectez-vous.");
      progress(index + 1, events.length);
      try {
        const url = imageUrl(event.image_url);
        if (!url) throw new Error("URL image absente ou invalide");
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30000);
        let blob;
        try {
          const response = await fetcher(url, { signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer" });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          if (Number(response.headers.get("content-length")) > 25 * 1024 * 1024) throw new Error("Image supérieure à 25 Mo");
          blob = await response.blob();
        } finally { clearTimeout(timer); }
        if (!blob.size || !blob.type.startsWith("image/")) throw new Error("Réponse vide ou non image");
        if (blob.size > 25 * 1024 * 1024 || bytes + blob.size > 150 * 1024 * 1024) throw new Error("Volume trop important : réduisez la sélection");
        bytes += blob.size;
        zip.file(fileName(event, index, blob.type), await blob.arrayBuffer()); saved++;
      } catch (error) { failures.push(`${event.start_date} — ${event.title || event.id} : ${error.message}`); }
    }
    return { saved, failures };
  }
  const api = { day, plusDays, validRange, imageUrl, fileName, loadEvents, collect };
  root.DEDICALIVRES_PHOTO_BATCH = api;
  if (!root.document) return;
  let initialized = false, busy = false, rows = [], selected = new Set(), loadedRange = null, generation = 0;
  const context = root.DEDICALIVRES_ADMIN_CONTEXT;
  const authorized = () => context?.getState().authenticated === true;
  const el = id => document.getElementById(`photo-${id}`);
  function message(text) { el("status").textContent = text; }
  function controls() {
    document.querySelectorAll("#tab-photos input, #tab-photos button").forEach(node => { node.disabled = busy || !authorized(); });
    el("download").disabled = busy || !authorized() || selected.size === 0;
    el("all").disabled = busy || !authorized() || !rows.some(e => imageUrl(e.image_url));
    document.querySelectorAll("[data-photo-unavailable]").forEach(node => { node.disabled = true; });
  }
  function render() {
    const list = el("list"); list.replaceChildren();
    rows.forEach((event, index) => {
      const label = document.createElement("label"); label.className = "v11-photo-row";
      const checkbox = document.createElement("input"); checkbox.type = "checkbox"; checkbox.checked = selected.has(index);
      const url = imageUrl(event.image_url);
      if (!url) checkbox.dataset.photoUnavailable = "true";
      checkbox.addEventListener("change", () => { checkbox.checked ? selected.add(index) : selected.delete(index); controls(); });
      const text = document.createElement("span"); text.textContent = `${event.start_date} — ${event.title || "Sans titre"}${url ? "" : " — Image absente ou URL invalide"}`;
      label.append(checkbox);
      if (url) {
        const img = document.createElement("img"); img.src = url; img.alt = ""; img.loading = "lazy"; img.referrerPolicy = "no-referrer";
        img.addEventListener("error", () => { img.remove(); text.textContent += " — Aperçu indisponible ; téléchargement à vérifier"; });
        label.append(img);
      }
      label.append(text); list.append(label);
    });
    controls();
  }
  async function load() {
    if (busy || !authorized()) return;
    const from = el("from").value, to = el("to").value;
    rows = []; selected.clear(); loadedRange = null; render();
    if (!validRange(from, to)) { message("Choisissez une période valide : début avant fin."); return; }
    const current = ++generation;
    busy = true; controls(); message("Chargement des événements…");
    try {
      const result = await loadEvents(context.getState().client, from, to);
      if (!authorized() || current !== generation) return;
      rows = result; loadedRange = { from, to }; render();
      const missing = rows.filter(e => !imageUrl(e.image_url)).length;
      message(rows.length ? `${rows.length} événement(s), ${missing} sans image exploitable. Sélectionnez les photos à télécharger.` : "Aucun événement sur cette période.");
    } catch (error) { message(error.message); }
    finally { busy = false; controls(); }
  }
  let zipPromise;
  function loadZip() {
    if (root.JSZip) return Promise.resolve(root.JSZip);
    if (zipPromise) return zipPromise;
    zipPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timer = setTimeout(() => { script.remove(); reject(new Error("Chargement ZIP expiré. Réessayez.")); }, 20000);
      script.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
      script.onload = () => { clearTimeout(timer); root.JSZip ? resolve(root.JSZip) : reject(new Error("Bibliothèque ZIP indisponible.")); };
      script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error("Bibliothèque ZIP inaccessible.")); };
      document.head.append(script);
    }).catch(error => { zipPromise = null; throw error; });
    return zipPromise;
  }
  async function download() {
    if (busy || !authorized() || !selected.size || !loadedRange) return;
    const batch = [...selected].map(i => rows[i]); const range = loadedRange; const current = generation;
    const stillAuthorized = () => authorized() && current === generation;
    busy = true; controls(); message("Préparation du ZIP…");
    try {
      const Zip = await loadZip(); const zip = new Zip();
      const result = await collect(batch, root.fetch.bind(root), zip, (n, total) => message(`Récupération ${n}/${total}…`), stillAuthorized);
      if (!stillAuthorized()) throw new Error("Session expirée. Reconnectez-vous.");
      if (!result.saved) { message(`Aucune image téléchargée. ${result.failures.join(" ; ")}`); return; }
      zip.file("rapport.txt", `Période : ${range.from} au ${range.to} inclus\n${result.saved}/${batch.length} images récupérées\n${result.failures.join("\n")}`);
      const blob = await zip.generateAsync({ type: "blob" });
      if (!stillAuthorized()) throw new Error("Session expirée. Reconnectez-vous.");
      const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url;
      link.download = `photos-${range.from}-${range.to}${result.failures.length ? "-partiel" : ""}.zip`;
      document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      message(`${result.failures.length ? "Extraction partielle" : "ZIP préparé"} : ${result.saved}/${batch.length} images. ${result.failures.join(" ; ")}`);
    } catch (error) { message(error.message); }
    finally { busy = false; controls(); }
  }
  api.open = () => {
    if (!authorized()) return;
    if (initialized) return;
    const panel = document.getElementById("tab-photos"); if (!panel) return;
    initialized = true;
    panel.innerHTML = `<h3>Extraire photos</h3><p>Images originales, par date de début d’événement, bornes incluses. Dates par défaut en heure de Paris.</p>
      <div class="v11-photo-controls"><label>Du<input id="photo-from" type="date" required></label><label>Au<input id="photo-to" type="date" required></label><button id="photo-load" class="v11-action-button" type="button">Charger la période</button></div>
      <div class="v11-photo-controls"><button id="photo-all" class="v11-action-button" type="button">Tout sélectionner</button><button id="photo-none" class="v11-action-button" type="button">Tout désélectionner</button><button id="photo-download" class="v11-primary-button" type="button">Télécharger la sélection en ZIP</button></div>
      <p id="photo-status" role="status" aria-live="polite"></p><div id="photo-list" class="v11-photo-list"></div>`;
    el("from").value = day(); el("to").value = plusDays(day(), 15);
    el("load").addEventListener("click", load);
    ["from", "to"].forEach(id => el(id).addEventListener("change", () => { rows = []; selected.clear(); loadedRange = null; render(); message("Période modifiée. Cliquez sur Charger la période."); }));
    el("all").addEventListener("click", () => { rows.forEach((e, i) => { if (imageUrl(e.image_url)) selected.add(i); }); render(); });
    el("none").addEventListener("click", () => { selected.clear(); render(); });
    el("download").addEventListener("click", download);
    context.subscribe(state => { if (!state.authenticated) { generation++; rows = []; selected.clear(); loadedRange = null; render(); message("Connectez-vous pour charger les photos."); } else controls(); });
    load();
  };
})(typeof window === "undefined" ? globalThis : window);

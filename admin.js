const config = window.DEDICALIVRES_CONFIG;
const supabaseClient = supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

const loginPanel = document.getElementById("login-panel");
const adminPanel = document.getElementById("admin-panel");
const list = document.getElementById("events-list");
const count = document.getElementById("admin-count");
const loginMessage = document.getElementById("login-message");

const visitsTodayBig = document.getElementById("visits-today-big");
const visitsTotalOdo = document.getElementById("visits-total-odo");
const visitsWeek = document.getElementById("visits-week");
const visitsNeedle = document.getElementById("visits-needle");
const uniqueToday = document.getElementById("unique-today");
const pagesPerVisit = document.getElementById("pages-per-visit");
const bestPage = document.getElementById("best-page");
const topPages = document.getElementById("top-pages");
const visitsBars = document.getElementById("visits-bars");

const importButton = document.getElementById("import-csv-button");
const csvFile = document.getElementById("csv-file");
const importFeedback = document.getElementById("import-feedback");
const newsletterCount = document.getElementById("newsletter-count");

const instagramOutput = document.getElementById("instagram-output");
const copyInstagramOutput = document.getElementById("copy-instagram-output");
const clearInstagramOutput = document.getElementById("clear-instagram-output");
const generateWeeklyReviewButton = document.getElementById("generate-weekly-review");
const instaSoonCount = document.getElementById("insta-soon-count");
const instaNeedsWorkCount = document.getElementById("insta-needs-work-count");
const instaFeaturedCandidatesCount = document.getElementById("insta-featured-candidates-count");

let currentFilter = "pending";
let allAdminEvents = [];

document.getElementById("login-button")?.addEventListener("click", login);
document.getElementById("logout-button")?.addEventListener("click", logout);
document.getElementById("refresh-button")?.addEventListener("click", refreshAll);
importButton?.addEventListener("click", importCsv);
copyInstagramOutput?.addEventListener("click", copyInstagramText);
clearInstagramOutput?.addEventListener("click", () => instagramOutput.value = "");
generateWeeklyReviewButton?.addEventListener("click", generateWeeklyInstagramReview);

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.remove("active"));
    button.classList.add("active");
    currentFilter = button.dataset.filter;
    loadEvents();
  });
});

checkSession();

async function checkSession() {
  const { data } = await supabaseClient.auth.getSession();
  if (data.session) {
    showAdmin();
    refreshAll();
  }
}

async function login() {
  loginMessage.textContent = "Connexion…";
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) {
    loginMessage.textContent = "Erreur : " + error.message;
    return;
  }
  loginMessage.textContent = "";
  showAdmin();
  refreshAll();
}

async function logout() {
  await supabaseClient.auth.signOut();
  location.reload();
}

function showAdmin() {
  loginPanel.classList.add("hidden");
  adminPanel.classList.remove("hidden");
}

function refreshAll() {
  loadEvents();
  loadVisitStats();
  loadNewsletterStats();
}

async function importCsv() {
  const file = csvFile?.files?.[0];
  if (!file) {
    importFeedback.textContent = "Choisis d’abord un fichier CSV.";
    importFeedback.className = "error";
    return;
  }

  importFeedback.textContent = "Lecture du CSV…";
  importFeedback.className = "";

  try {
    const text = await file.text();
    const rows = parseCsv(text);
    const events = rows.map(normalizeCsvEvent).filter((event) => event.title);
    if (!events.length) throw new Error("Aucun événement exploitable trouvé.");

    const { error } = await supabaseClient.from("events").insert(events);
    if (error) throw error;

    importFeedback.textContent = `${events.length} événement(s) importé(s) en attente de validation.`;
    importFeedback.className = "success";
    csvFile.value = "";
    currentFilter = "pending";
    document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.filter === "pending"));
    loadEvents();
  } catch (error) {
    importFeedback.textContent = "Erreur import : " + error.message;
    importFeedback.className = "error";
  }
}

function normalizeCsvEvent(row) {
  return {
    title: clean(row.title),
    type: clean(row.type) || null,
    region: clean(row.region) || null,
    city: clean(row.city) || null,
    start_date: clean(row.start_date) || null,
    end_date: clean(row.end_date) || clean(row.start_date) || null,
    description: clean(row.description) || null,
    image_url: clean(row.image_url) || null,
    website: clean(row.website) || null,
    price: clean(row.price) || null,
    validated: false,
    rejected: false,
    featured: false,
    verified: false,
    source_label: "Import CSV",
    imported_source: "scraper",
    last_checked_at: new Date().toISOString()
  };
}

function parseCsv(text) {
  const rows = [];
  let current = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      current.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i++;
      current.push(cell);
      if (current.some((value) => value.trim() !== "")) rows.push(current);
      current = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  current.push(cell);
  if (current.some((value) => value.trim() !== "")) rows.push(current);
  const headers = rows.shift()?.map((item) => item.trim()) || [];
  return rows.map((row) => {
    const object = {};
    headers.forEach((header, index) => object[header] = row[index] || "");
    return object;
  });
}

async function loadNewsletterStats() {
  if (!newsletterCount) return;
  const { count, error } = await supabaseClient.from("newsletter_subscribers").select("id", { count: "exact", head: true });
  newsletterCount.textContent = error ? "Newsletter : impossible de charger." : `${count || 0} inscrit(s) à la newsletter.`;
}

async function loadVisitStats() {
  try {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const startWeekDate = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
    startWeekDate.setHours(0, 0, 0, 0);
    const startWeek = startWeekDate.toISOString();

    const [totalResult, todayResult, weekResult, weekRowsResult, todayRowsResult] = await Promise.all([
      supabaseClient.from("visits").select("id", { count: "exact", head: true }),
      supabaseClient.from("visits").select("id", { count: "exact", head: true }).gte("created_at", startToday),
      supabaseClient.from("visits").select("id", { count: "exact", head: true }).gte("created_at", startWeek),
      supabaseClient.from("visits").select("path, created_at, user_agent").gte("created_at", startWeek).limit(3000),
      supabaseClient.from("visits").select("path, user_agent").gte("created_at", startToday).limit(1000)
    ]);

    if (totalResult.error || todayResult.error || weekResult.error || weekRowsResult.error || todayRowsResult.error) return;

    const total = totalResult.count || 0;
    const today = todayResult.count || 0;
    const week = weekResult.count || 0;
    const weekRows = weekRowsResult.data || [];
    const todayRows = todayRowsResult.data || [];

    animateNumber(visitsTodayBig, today);
    animateOdometer(visitsTotalOdo, total);
    animateNumber(visitsWeek, week);

    const needleDegree = Math.min(120, Math.round((today / 50) * 120)) - 60;
    if (visitsNeedle) visitsNeedle.style.transform = `rotate(${needleDegree}deg)`;

    const estimatedUnique = estimateUniqueVisitors(todayRows);
    if (uniqueToday) uniqueToday.textContent = formatNumber(estimatedUnique);
    if (pagesPerVisit) pagesPerVisit.textContent = estimatedUnique ? (today / estimatedUnique).toFixed(1).replace(".", ",") : "—";

    const top = getTopPages(weekRows);
    if (bestPage) bestPage.textContent = top[0]?.[0] || "—";

    renderTopPages(top);
    renderBars(weekRows);
  } catch (error) {
    console.error("Erreur stats visites :", error);
  }
}

function estimateUniqueVisitors(rows) {
  const set = new Set();
  rows.forEach((row) => set.add(`${row.user_agent || "unknown"}|${row.path || "/"}`));
  return set.size;
}

function getTopPages(rows) {
  const counts = new Map();
  rows.forEach((row) => {
    const path = row.path || "/";
    counts.set(path, (counts.get(path) || 0) + 1);
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
}

function renderTopPages(sorted) {
  if (!topPages) return;
  if (!sorted.length) {
    topPages.innerHTML = `<p class="empty">Aucune visite enregistrée pour le moment.</p>`;
    return;
  }
  topPages.innerHTML = sorted.map(([path, total], index) => `
    <div class="top-page-row"><span><b>#${index + 1}</b> ${escapeHtml(path)}</span><strong>${formatNumber(total)}</strong></div>
  `).join("");
}

function renderBars(rows) {
  if (!visitsBars) return;
  const days = [];
  const labels = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    date.setHours(0, 0, 0, 0);
    days.push({ key: date.toISOString().slice(0, 10), label: labels[date.getDay()], total: 0 });
  }
  rows.forEach((row) => {
    const key = new Date(row.created_at).toISOString().slice(0, 10);
    const day = days.find((item) => item.key === key);
    if (day) day.total += 1;
  });
  const max = Math.max(...days.map((day) => day.total), 1);
  visitsBars.innerHTML = days.map((day) => {
    const height = Math.max(8, Math.round((day.total / max) * 110));
    return `<div class="bar-item"><div class="bar-value">${formatNumber(day.total)}</div><div class="bar-track"><div class="bar-fill" style="height:${height}px"></div></div><div class="bar-label">${day.label}</div></div>`;
  }).join("");
}

function animateNumber(element, target) {
  if (!element) return;
  element.textContent = formatNumber(target);
}

function animateOdometer(element, target) {
  if (!element) return;
  const value = String(target || 0).padStart(6, "0");
  element.innerHTML = value.split("").map((digit) => `<span>${digit}</span>`).join("");
}

async function loadEvents() {
  list.innerHTML = `<div class="empty">Chargement…</div>`;
  let query = supabaseClient.from("events").select("*").order("created_at", { ascending: false });
  if (currentFilter === "pending") query = query.eq("validated", false).eq("rejected", false);
  if (currentFilter === "published") query = query.eq("validated", true).eq("rejected", false);
  if (currentFilter === "featured") query = query.eq("featured", true).eq("rejected", false);
  if (currentFilter === "rejected") query = query.eq("rejected", true);

  const { data, error } = await query;
  if (error) {
    list.innerHTML = `<div class="empty error">Erreur : ${escapeHtml(error.message)}</div>`;
    return;
  }

  allAdminEvents = data || [];
  updateInstagramStats(allAdminEvents);
  count.textContent = `${data.length} événement${data.length > 1 ? "s" : ""}`;

  if (!data.length) {
    list.innerHTML = `<div class="empty">Aucun événement dans cette vue.</div>`;
    return;
  }
  list.innerHTML = data.map(renderEvent).join("");
}

function updateInstagramStats(events) {
  const now = new Date();
  const in14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const published = events.filter((event) => event.validated && !event.rejected);
  const soon = published.filter((event) => event.start_date && new Date(event.start_date) >= now && new Date(event.start_date) <= in14);
  const needsWork = published.filter((event) => !event.image_url || !event.description || !event.city || !Number.isFinite(Number(event.lat)) || !Number.isFinite(Number(event.lng)));
  const featuredCandidates = soon.filter((event) => !event.featured);
  if (instaSoonCount) instaSoonCount.textContent = soon.length;
  if (instaNeedsWorkCount) instaNeedsWorkCount.textContent = needsWork.length;
  if (instaFeaturedCandidatesCount) instaFeaturedCandidatesCount.textContent = featuredCandidates.length;
}

function renderEvent(event) {
  const status = event.rejected ? "Refusé" : event.validated ? "Publié" : "À valider";
  return `
    <article class="admin-card">
      ${event.image_url ? `<img src="${escapeAttribute(event.image_url)}" alt="">` : `<div class="admin-card-placeholder"></div>`}
      <div class="admin-card-body">
        <div class="admin-badges">
          <span class="badge">${escapeHtml(status)}</span>
          ${event.featured ? `<span class="badge featured">Mis en avant</span>` : ""}
          ${event.verified ? `<span class="badge verified">Vérifié</span>` : ""}
          ${event.type ? `<span class="badge light">${escapeHtml(event.type)}</span>` : ""}
        </div>
        <h2>${escapeHtml(event.title || "Sans titre")}</h2>
        <p><strong>Lieu :</strong> ${escapeHtml([event.city, event.region].filter(Boolean).join(", ") || "Non précisé")}</p>
        <p><strong>Date :</strong> ${escapeHtml(formatDateRange(event.start_date, event.end_date) || "Non précisée")}</p>
        <p><strong>Source :</strong> ${escapeHtml(event.source_label || "Non précisée")}</p>
        <p class="description">${escapeHtml(event.description || "")}</p>
        ${event.website ? `<p><a href="${escapeAttribute(event.website)}" target="_blank" rel="noopener noreferrer">Site officiel</a></p>` : ""}
        <textarea id="note-${event.id}" placeholder="Note admin facultative">${escapeHtml(event.admin_note || "")}</textarea>
        <div class="actions">
          ${!event.validated || event.rejected ? `<button onclick="validateEvent('${event.id}')">Valider</button>` : ""}
          ${event.validated && !event.featured ? `<button onclick="featureEvent('${event.id}', true)">Mettre en avant</button>` : ""}
          ${event.featured ? `<button onclick="featureEvent('${event.id}', false)" class="secondary">Retirer mise en avant</button>` : ""}
          ${!event.verified ? `<button onclick="verifyEvent('${event.id}', true)" class="secondary">Marquer vérifié</button>` : `<button onclick="verifyEvent('${event.id}', false)" class="secondary">Retirer vérifié</button>`}
          <button onclick="generateInstagramPost('${event.id}')" class="insta-button">Post Insta</button>
          <button onclick="generateInstagramStory('${event.id}')" class="insta-button secondary">Story</button>
          ${!event.rejected ? `<button onclick="rejectEvent('${event.id}')" class="danger">Refuser</button>` : ""}
          <button onclick="saveNote('${event.id}')" class="secondary">Sauver note</button>
          <button onclick="deleteEvent('${event.id}')" class="danger ghost">Supprimer</button>
        </div>
      </div>
    </article>
  `;
}

async function validateEvent(id) {
  const { error } = await supabaseClient.from("events").update({ validated: true, rejected: false }).eq("id", id);
  if (error) return alert(error.message);
  loadEvents();
}
async function rejectEvent(id) {
  if (!confirm("Refuser cet événement ?")) return;
  const { error } = await supabaseClient.from("events").update({ validated: false, featured: false, rejected: true }).eq("id", id);
  if (error) return alert(error.message);
  loadEvents();
}
async function featureEvent(id, featured) {
  const { error } = await supabaseClient.from("events").update({ featured }).eq("id", id);
  if (error) return alert(error.message);
  loadEvents();
}
async function verifyEvent(id, verified) {
  const { error } = await supabaseClient.from("events").update({
    verified,
    last_checked_at: verified ? new Date().toISOString() : null,
    source_label: verified ? "Source vérifiée" : null
  }).eq("id", id);
  if (error) return alert(error.message);
  loadEvents();
}
async function saveNote(id) {
  const note = document.getElementById(`note-${id}`)?.value || "";
  const { error } = await supabaseClient.from("events").update({ admin_note: note }).eq("id", id);
  if (error) return alert(error.message);
  alert("Note sauvegardée.");
}
async function deleteEvent(id) {
  if (!confirm("Supprimer définitivement cet événement ?")) return;
  const { error } = await supabaseClient.from("events").delete().eq("id", id);
  if (error) return alert(error.message);
  loadEvents();
}

window.validateEvent = validateEvent;
window.rejectEvent = rejectEvent;
window.featureEvent = featureEvent;
window.verifyEvent = verifyEvent;
window.saveNote = saveNote;
window.deleteEvent = deleteEvent;
window.generateInstagramPost = generateInstagramPost;
window.generateInstagramStory = generateInstagramStory;

function generateInstagramPost(id) {
  const event = allAdminEvents.find((item) => String(item.id) === String(id));
  if (!event) return;
  const caption = buildInstagramCaption(event, "post");
  instagramOutput.value = caption;
  copyText(caption);
  alert("Légende Instagram copiée.");
}
function generateInstagramStory(id) {
  const event = allAdminEvents.find((item) => String(item.id) === String(id));
  if (!event) return;
  const caption = buildInstagramCaption(event, "story");
  instagramOutput.value = caption;
  copyText(caption);
  alert("Texte story copié.");
}
function buildInstagramCaption(event, format) {
  const date = event.start_date ? formatDateRange(event.start_date, event.end_date) : "Date à confirmer";
  const place = [event.city, event.region].filter(Boolean).join(", ") || "Lieu à confirmer";
  const hashtags = buildHashtags(event);
  if (format === "story") {
    return `📚 ${event.title || "Événement littéraire"}\n\n📍 ${place}\n📅 ${date}\n\n👉 À retrouver sur Dédicalivres.fr\n\n${hashtags}`;
  }
  return `📚 ${event.title || "Nouvel événement littéraire"}\n\n📍 ${place}\n📅 ${date}\n\n${event.description ? trimText(event.description, 320) + "\n\n" : ""}Dédicalivres référence les salons du livre, festivals, dédicaces et rencontres avec des auteurs indépendants ou auto-édités.\n\n👉 Plus d’événements sur Dédicalivres.fr\n\n${hashtags}`;
}
function buildHashtags(event) {
  const tags = new Set(["#dedicalivres","#livres","#lecture","#salondulivre","#auteurindependant","#autoedition","#dedicace","#litterature"]);
  if (event.city) tags.add("#" + hashtagSlug(event.city));
  if (event.region) tags.add("#" + hashtagSlug(event.region));
  const type = normalize(event.type || "");
  if (type.includes("festival")) tags.add("#festivallitteraire");
  if (type.includes("dedicace")) tags.add("#dedicaceauteur");
  return Array.from(tags).slice(0, 18).join(" ");
}
function hashtagSlug(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, "");
}
function generateWeeklyInstagramReview() {
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const in14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const published = allAdminEvents.filter((event) => event.validated && !event.rejected);
  const nextWeek = published.filter((event) => event.start_date && new Date(event.start_date) >= now && new Date(event.start_date) <= in7);
  const next14 = published.filter((event) => event.start_date && new Date(event.start_date) >= now && new Date(event.start_date) <= in14);
  const needsWork = published.filter((event) => !event.image_url || !event.description || !event.city || !Number.isFinite(Number(event.lat)) || !Number.isFinite(Number(event.lng)));
  const text = `📌 Revue Instagram Dédicalivres\n\nÀ poster cette semaine :\n${nextWeek.length ? nextWeek.map((event) => `- ${event.title} — ${event.city || "ville ?"} — ${formatDateRange(event.start_date, event.end_date)}`).join("\n") : "- Aucun événement urgent."}\n\nÀ préparer pour les 14 prochains jours :\n${next14.length ? next14.slice(0, 10).map((event) => `- ${event.title} — ${event.city || "ville ?"} — ${formatDateRange(event.start_date, event.end_date)}`).join("\n") : "- Aucun événement proche."}\n\nÀ améliorer avant publication :\n${needsWork.length ? needsWork.slice(0, 10).map((event) => `- ${event.title} ${!event.image_url ? "(image manquante)" : ""} ${!event.description ? "(description manquante)" : ""} ${!event.lat || !event.lng ? "(coordonnées manquantes)" : ""}`).join("\n") : "- Rien à corriger."}\n\n#dedicalivres #livres #salondulivre #auteurindependant #autoedition #dedicace #lecture`;
  instagramOutput.value = text;
  copyText(text);
  alert("Revue hebdomadaire copiée.");
}
function copyInstagramText() {
  if (!instagramOutput.value.trim()) return alert("Aucun texte à copier.");
  copyText(instagramOutput.value);
  alert("Texte copié.");
}
function copyText(text) {
  if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  else fallbackCopy(text);
}
function fallbackCopy(text) {
  const temp = document.createElement("textarea");
  temp.value = text;
  document.body.appendChild(temp);
  temp.select();
  document.execCommand("copy");
  temp.remove();
}
function formatDateRange(startDate, endDate) {
  if (!startDate) return "";
  const start = formatDate(startDate);
  const end = endDate && endDate !== startDate ? formatDate(endDate) : "";
  return end ? `${start} → ${end}` : start;
}
function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}
function formatNumber(value) { return new Intl.NumberFormat("fr-FR").format(value || 0); }
function clean(value) { return String(value || "").trim(); }
function trimText(text, maxLength) {
  const value = String(text || "").trim();
  return value.length <= maxLength ? value : value.slice(0, maxLength).trim() + "…";
}
function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, " ").toLowerCase();
}
function escapeHtml(value) {
  return (value || "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
function escapeAttribute(value) { return escapeHtml(value).replace(/`/g, "&#096;"); }

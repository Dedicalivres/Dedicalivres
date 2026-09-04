window.DEDICALIVRES_CONFIG = {
  supabaseUrl: "https://pwyetrqyiaxpzjrafpvb.supabase.co",
  supabaseAnonKey: "sb_publishable_EfFj0D-4g3x0E3j0AofRRA_BHo98vvj",
  assetsBaseUrl: "",

  // Espace Auteur — publication unitaire explicite, protégée par readiness + RLS.
  authorPublicPublishingEnabled: true,

  // V11 Veille — restera false jusqu’à la recette staging et la validation admin.
  adminV11WatchSubmissionEnabled: false,

  // V11 NFC — restera false tant que le schéma NFC n’est pas appliqué et validé en production.
  adminV11NfcCockpitEnabled: false,

  // V7.8.0 — Upload hybride : les anciennes images Supabase restent valides,
  // les nouvelles images peuvent être envoyées vers Cloudflare R2 via Worker.
  imageUploadProvider: "r2",
  imageUploadEndpoint: "https://dedicalivres-r2-upload.dedicalivres.workers.dev/",
  r2PublicBaseUrl: "https://pub-45a59368068e48578d3b1a1bb519c543.r2.dev",
  exportsBaseUrl: "https://dedicalivres-daily-export.dedicalivres.workers.dev/exports",

  // Pont Auto-Matte — l'onglet veille de l'admin utilise l'extracteur local
  // UNIQUEMENT si le navigateur a été configuré avec :
  //   localStorage.setItem("automatte_endpoint", "http://localhost:5001/analyze")
  // Partout ailleurs (iPad, autres postes), cette valeur est undefined et
  // l'admin continue d'utiliser le Worker Cloudflare habituel.
  watchWorkerEndpoint: (function () {
    try {
      return window.localStorage.getItem("automatte_endpoint") || undefined;
    } catch (e) {
      return undefined;
    }
  })()
};

window.getDedicalivresSupabaseClient = function getDedicalivresSupabaseClient() {
  const config = window.DEDICALIVRES_CONFIG;

  if (!config || !config.supabaseUrl || !config.supabaseAnonKey || !window.supabase) {
    return null;
  }

  if (!window.DEDICALIVRES_SUPABASE_CLIENT) {
    window.DEDICALIVRES_SUPABASE_CLIENT = window.supabase.createClient(
      config.supabaseUrl,
      config.supabaseAnonKey
    );
  }

  return window.DEDICALIVRES_SUPABASE_CLIENT;
};

window.DEDICALIVRES_REGISTRATION = (function createRegistrationHelpers() {
  const eligibleTypes = new Set(["Salon", "Festival"]);
  const audienceLabels = {
    author: "Auteurs",
    artist_author: "Artistes-auteurs",
    hybrid: "Profils hybrides",
    publisher: "Maisons d’édition"
  };
  const forcedStatuses = {
    complet: { key: "full", label: "Inscriptions complètes", shortLabel: "Complet" },
    cloture: { key: "closed", label: "Inscriptions clôturées", shortLabel: "Clôturées" },
    annule: { key: "cancelled", label: "Inscriptions annulées", shortLabel: "Annulées" }
  };

  function isEligible(event) {
    return Boolean(event && eligibleTypes.has(event.type) && event.registration_enabled === true);
  }

  function parseDateOnly(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function todayUtc(value) {
    const date = value && typeof value.getFullYear === "function" ? value : new Date();
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function getStatus(event, now) {
    if (!isEligible(event)) return null;

    const forced = forcedStatuses[event.registration_force_status];
    if (forced) return { ...forced, forced: true };

    const currentDay = todayUtc(now);
    const openDay = parseDateOnly(event.registration_open_date);
    const deadlineDay = parseDateOnly(event.registration_deadline);

    if (openDay !== null && currentDay < openDay) {
      return { key: "soon", label: "Inscriptions bientôt ouvertes", shortLabel: "Bientôt", forced: false };
    }

    if (deadlineDay !== null && currentDay > deadlineDay) {
      return { key: "closed", label: "Inscriptions clôturées", shortLabel: "Clôturées", forced: false };
    }

    if (deadlineDay !== null && Math.ceil((deadlineDay - currentDay) / 86400000) <= 7) {
      return { key: "last-days", label: "Derniers jours pour s’inscrire", shortLabel: "Derniers jours", forced: false };
    }

    if (openDay !== null || deadlineDay !== null) {
      return { key: "open", label: "Inscriptions ouvertes", shortLabel: "Ouvertes", forced: false };
    }

    return null;
  }

  function normalizeAudience(value) {
    const values = Array.isArray(value) ? value : [];
    return [...new Set(values.filter((item) => Object.prototype.hasOwnProperty.call(audienceLabels, item)))];
  }

  function getAudienceLabels(value) {
    return normalizeAudience(value).map((item) => audienceLabels[item]);
  }

  return {
    eligibleTypes,
    audienceLabels,
    getAudienceLabels,
    getStatus,
    isEligible,
    normalizeAudience
  };
})();

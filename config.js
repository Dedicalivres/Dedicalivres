window.DEDICALIVRES_CONFIG = {
  supabaseUrl: "https://pwyetrqyiaxpzjrafpvb.supabase.co",
  supabaseAnonKey: "sb_publishable_EfFj0D-4g3x0E3j0AofRRA_BHo98vvj",
  assetsBaseUrl: "",

  // PACK MASCOTTE OPTION C VISIBLE — buste animé avec fallback immédiat.
  // Laisse vide tant que la scène Spline n’est pas prête : le buste image reste animé et suit le curseur.
  enableMascotGuide: true,
  mascotGuideImage: "mascotte-guide.jpeg",
  mascotGuideSplineUrl: "",

  // V7.8.0 — Upload hybride : les anciennes images Supabase restent valides,
  // les nouvelles images peuvent être envoyées vers Cloudflare R2 via Worker.
  imageUploadProvider: "r2",
  imageUploadEndpoint: "https://dedicalivres-r2-upload.dedicalivres.workers.dev/",
  r2PublicBaseUrl: "https://pub-45a59368068e48578d3b1a1bb519c543.r2.dev",
  exportsBaseUrl: "https://dedicalivres-daily-export.dedicalivres.workers.dev/exports"
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

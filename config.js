window.DEDICALIVRES_CONFIG = {
  supabaseUrl: "https://pwyetrqyiaxpzjrafpvb.supabase.co",
  supabaseAnonKey: "sb_publishable_EfFj0D-4g3x0E3j0AofRRA_BHo98vvj",
  assetsBaseUrl: "",

  // V7.8.0 — Upload hybride : les anciennes images Supabase restent valides,
  // les nouvelles images peuvent être envoyées vers Cloudflare R2 via Worker.
  imageUploadProvider: "r2",
  imageUploadEndpoint: "https://dedicalivres-r2-upload.dedicalivres.workers.dev/",
  r2PublicBaseUrl: "https://pub-45a59368068e48578d3b1a1bb519c543.r2.dev",

  // Pack 2 — Exports admin.
  // Cette URL suppose que le Worker d'export sert publiquement les fichiers sous /exports/.
  // Si tu rends le bucket R2 dedicalivres-exports public, remplace par l'URL publique du bucket + /exports.
  exportsBaseUrl: "https://dedicalivres-daily-export.dedicalivres.workers.dev/exports"
};

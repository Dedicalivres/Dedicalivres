/* ================================================================
   Dedicalivres — Salle en direct · configuration
   ----------------------------------------------------------------
   Tant que les deux champs ci-dessous sont vides, les trois pages
   fonctionnent en MODE DEMONSTRATION : etat en memoire, donnees
   d'exemple, aucune connexion reseau. C'est le mode de test, et il
   permet de faire tourner les trois interfaces cote a cote sans
   avoir rien deploye.

   Renseignez les deux valeurs pour basculer sur la vraie base. Le
   basculement est total et sans autre modification de code : les
   pages ne savent pas dans quel mode elles tournent.

   La cle anon est PUBLIQUE par nature. C'est la meme que celle deja
   utilisee par le site V1, et elle ne donne aucun droit d'ecriture
   directe : toutes les ecritures passent par les fonctions RPC.
   ================================================================ */

window.LIVE_CONFIG = {
  SUPABASE_URL: '',       // ex. 'https://xxxxxxxx.supabase.co'
  SUPABASE_ANON_KEY: '',  // ex. 'eyJhbGciOi...'
};

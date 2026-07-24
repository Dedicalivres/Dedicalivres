-- =====================================================================
--  DEDICALIVRES — retour arriere complet du module "salle en direct"
--  A executer si le projet n'est pas retenu. Aucune table existante du
--  site n'est touchee : tout le module vit sous le prefixe live_.
-- =====================================================================

drop function if exists live_creer_session(text, text, text, text, text);
drop function if exists live_purger_contacts();
drop function if exists live_console_auteur(uuid, text);
drop function if exists live_moderer(uuid, text, uuid, text);
drop function if exists live_televerser_media(uuid, text, text, text, text, uuid);
drop function if exists live_maj_banniere(uuid, text, text);
drop function if exists live_maj_livre(uuid, text, uuid, integer, integer, text, boolean);
drop function if exists live_maj_statut(uuid, text, text);
drop function if exists live_basculer_auto(uuid, text);
drop function if exists live_brancher_video(uuid, text, text);
drop function if exists live_reordonner(uuid, text, uuid, text);
drop function if exists live_terminer(uuid, text, uuid);
drop function if exists live_lancer(uuid, text, uuid);
drop function if exists live_annuler_commande(uuid, text, uuid);
drop function if exists live_ajouter_dedicace(uuid, text, text, text, uuid, integer);
drop function if exists live_encaisser(uuid, text, uuid);
drop function if exists live_marquer_sms(uuid, text, uuid);
drop function if exists live_envoyer_message(uuid, text, text, text);
drop function if exists live_passer_commande(uuid, text, text, jsonb, text, text, text, text);
drop function if exists live_verif(uuid, text, text);

drop table if exists live_order_contacts cascade;
drop table if exists live_order_items    cascade;
drop table if exists live_orders         cascade;
drop table if exists live_medias         cascade;
drop table if exists live_messages       cascade;
drop table if exists live_books          cascade;
drop table if exists live_session_secrets cascade;
drop table if exists live_sessions       cascade;

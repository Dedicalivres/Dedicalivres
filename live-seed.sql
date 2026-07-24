-- =====================================================================
--  DEDICALIVRES — salle de test
--  A executer APRES live-schema.sql, depuis le SQL Editor du dashboard
--  Supabase (role service_role : c'est le seul contexte autorise a
--  appeler live_creer_session).
--
--  Le bloc affiche a la fin les deux URLs a jeton. Copiez-les : c'est le
--  seul moment ou les jetons apparaissent dans un resultat de requete.
-- =====================================================================

do $$
declare
  v jsonb;
  v_id uuid;
begin
  -- Si la salle de test existe deja, on repart proprement.
  delete from live_sessions where slug = 'test-maelle';

  v := live_creer_session(
         'test-maelle',
         'Maelle Kerbrat dedicace « Les Brumes de l''Aber » en direct',
         'Maelle Kerbrat',
         'Commandez sur la boutique de l''autrice, envoyez votre pseudo — et suivez votre place dans la file.',
         null   -- identifiant d'evenement de l'agenda, ex. 1099 ; null = salle independante
       );
  v_id := (v->>'session_id')::uuid;

  update live_sessions set statut = 'live' where id = v_id;

  insert into live_books (session_id, titre, titre_court, meta, prix_cents, stock, couleur, position) values
    (v_id, 'Les Brumes de l''Aber',    'Brumes',  'Polar · 288 p.',          1800, 14, 'c1', 1),
    (v_id, 'Maree Noire sur Molene',   'Molene',  'Polar · 312 p.',          1800,  9, 'c2', 2),
    (v_id, 'Le Phare des Disparues',   'Phare',   'Polar · 296 p.',          1700, 21, 'c3', 3),
    (v_id, 'Coffret trilogie',         'Coffret', '3 tomes + marque-page',   4900,  5, 'c4', 4);

  insert into live_messages (session_id, pseudo, role, texte, epingle) values
    (v_id, 'JC',              'regie',    'Bienvenue dans la salle ! Maelle est en projection.', true),
    (v_id, 'Sophie29',        'visiteur', 'Bonsoir de Brest !', false),
    (v_id, 'Maelle Kerbrat',  'auteur',   'Posez-moi tout ce que vous voulez pendant que je dedicace.', false);

  raise notice E'\n\n=====  SALLE DE TEST CREEE  =====\nVisiteur : /dedicaces-live/salle.html?s=%\nAutrice  : /dedicaces-live/auteur.html?s=%&k=%\nRegie    : /dedicaces-live/regie.html?s=%&k=%\n=================================\n',
    v_id, v_id, v->>'token_auteur', v_id, v->>'token_regie';
end $$;

-- Rappel des identifiants si le message ci-dessus a ete perdu :
--   select s.id, s.slug, x.token_auteur, x.token_regie
--     from live_sessions s join live_session_secrets x on x.session_id = s.id;

-- =====================================================================
--  DEDICALIVRES — SALLE DE DEDICACE EN DIRECT
--  Migration Supabase — schema complet (tables + RLS + RPC + Realtime)
--
--  Toutes les tables sont prefixees live_ : le module est isolable.
--  Retour arriere complet = executer live-schema-rollback.sql.
--
--  MODELE DE SECURITE (a lire avant toute modification)
--  ----------------------------------------------------
--  1. Aucune table n'accepte d'ecriture directe. RLS est active partout
--     et AUCUNE policy INSERT / UPDATE / DELETE n'existe. Toutes les
--     ecritures passent par des fonctions SECURITY DEFINER qui valident
--     leurs arguments. La cle anon publique ne permet donc rien d'autre
--     que ce que ces fonctions autorisent explicitement.
--  2. Les secrets (jetons auteur / regie) vivent dans live_session_secrets,
--     table sans aucune policy : illisible par anon, meme en lecture.
--  3. Les donnees personnelles (tel, adresse) vivent dans
--     live_order_contacts, table sans aucune policy. Elles ne transitent
--     jamais par Realtime et ne sont accessibles qu'a l'autrice, via la
--     RPC live_console_auteur() protegee par jeton.
--  4. Les jetons sont stockes en clair dans une table refusee a anon.
--     C'est le meme modele de confidentialite que le YouTube Live non
--     repertorie deja utilise : la securite vient de l'URL non devinable.
--     Evolution possible : hachage pgcrypto (voir note en fin de fichier).
-- =====================================================================

create extension if not exists pgcrypto;

-- =====================================================================
--  1. TABLES
-- =====================================================================

-- ---------------------------------------------------------------------
--  Session = une salle de dedicace. Tout ce qui est ici est PUBLIC.
-- ---------------------------------------------------------------------
create table if not exists live_sessions (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,
  event_id          text,                      -- rattachement V1, voir section 6
  titre             text not null,
  sous_titre        text,
  auteur_nom        text not null,
  animateur_nom     text not null default 'JC',
  statut            text not null default 'prepa'
                    check (statut in ('prepa','live','termine')),
  video_id          text,                      -- identifiant YouTube Live non repertorie
  banniere_url      text,
  port_cents        integer not null default 300 check (port_cents >= 0),
  auto_enchainement boolean not null default true,
  demarre_a         timestamptz,
  cree_a            timestamptz not null default now()
);

comment on table live_sessions is
  'Salle de dedicace. Lecture publique + Realtime. Ne contient aucun secret.';

-- ---------------------------------------------------------------------
--  Jetons d'acces. AUCUNE policy => refus total pour anon.
-- ---------------------------------------------------------------------
create table if not exists live_session_secrets (
  session_id    uuid primary key references live_sessions(id) on delete cascade,
  token_auteur  text not null,
  token_regie   text not null
);

comment on table live_session_secrets is
  'Jetons d''URL. Table sans policy : inaccessible depuis la cle anon.';

-- ---------------------------------------------------------------------
--  Livres proposes dans la salle
-- ---------------------------------------------------------------------
create table if not exists live_books (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references live_sessions(id) on delete cascade,
  titre          text not null,
  titre_court    text not null,
  meta           text,
  prix_cents     integer not null check (prix_cents > 0),
  stock          integer not null default 0 check (stock >= 0),
  couverture_url text,
  couleur        text not null default 'c1',   -- classe de repli c1..c4
  lien_pret      boolean not null default false, -- check-list SumUp
  position       integer not null default 0
);

create index if not exists live_books_session_idx on live_books(session_id, position);

-- ---------------------------------------------------------------------
--  Commandes / dedicaces. AUCUNE donnee personnelle ici.
--  statut : pay  = annoncee, en attente d'encaissement
--           att  = encaissee, dans la file
--           cours= a l'ecran
--           fait = realisee
--           annule
-- ---------------------------------------------------------------------
create table if not exists live_orders (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references live_sessions(id) on delete cascade,
  pseudo       text not null check (char_length(pseudo) between 1 and 30),
  message      text check (char_length(message) <= 120),
  statut       text not null default 'pay'
               check (statut in ('pay','att','cours','fait','annule')),
  sms_envoye   boolean not null default false,
  position     integer,
  total_cents  integer not null default 0,
  origine      text not null default 'visiteur'
               check (origine in ('visiteur','auteur')),
  cree_a       timestamptz not null default now()
);

create index if not exists live_orders_session_idx on live_orders(session_id, statut, position);

-- Garde-fou structurel : une seule dedicace a l'ecran par salle.
-- Protege d'un double-clic de la regie, sans dependre du JS.
create unique index if not exists live_une_seule_a_lecran
  on live_orders (session_id) where statut = 'cours';

create table if not exists live_order_items (
  id        uuid primary key default gen_random_uuid(),
  order_id  uuid not null references live_orders(id) on delete cascade,
  book_id   uuid not null references live_books(id),
  quantite  integer not null check (quantite between 1 and 20)
);

create index if not exists live_order_items_order_idx on live_order_items(order_id);

-- ---------------------------------------------------------------------
--  Donnees personnelles isolees. AUCUNE policy => refus total pour anon.
--  Minimisation RGPD structurelle : impossible de fuiter par Realtime,
--  puisque anon ne peut pas lire la table du tout.
-- ---------------------------------------------------------------------
create table if not exists live_order_contacts (
  order_id      uuid primary key references live_orders(id) on delete cascade,
  tel           text,
  adresse       text,
  cp            text,
  ville         text,
  purger_apres  timestamptz not null default (now() + interval '30 days')
);

comment on table live_order_contacts is
  'Telephone et adresse d''expedition. Sans policy : lisible uniquement
   via live_console_auteur(). Purge par live_purger_contacts().';

-- ---------------------------------------------------------------------
--  Images (banniere, couvertures) stockees en base, encodees en base64.
--
--  Pourquoi pas Supabase Storage : sans authentification, ouvrir
--  l'ecriture dans un bucket revient a offrir un depot de fichiers
--  anonyme a tout internet. La voie propre (Edge Function delivrant une
--  URL signee apres controle du jeton) impose le CLI Supabase, donc un
--  outil de plus hors du flux GitHub Desktop. Ici l'ecriture passe par
--  la meme RPC a jeton que le reste : rien de nouveau a deployer.
--
--  Cette table est VOLONTAIREMENT absente de la publication Realtime.
--  Une couverture pese ~100 ko en base64 ; la diffuser a chaque
--  spectateur a chaque modification saturerait le canal temps reel.
--  Les images sont donc lues une fois puis mises en cache par le client.
-- ---------------------------------------------------------------------
create table if not exists live_medias (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references live_sessions(id) on delete cascade,
  mime       text not null default 'image/webp',
  donnees    text not null,          -- base64 nu, sans prefixe data:
  octets     integer not null,
  cree_a     timestamptz not null default now()
);

create index if not exists live_medias_session_idx on live_medias(session_id);

-- ---------------------------------------------------------------------
--  Chat de la salle
-- ---------------------------------------------------------------------
create table if not exists live_messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references live_sessions(id) on delete cascade,
  pseudo     text not null check (char_length(pseudo) between 1 and 30),
  role       text not null default 'visiteur'
             check (role in ('visiteur','auteur','regie','systeme')),
  texte      text not null check (char_length(texte) between 1 and 240),
  epingle    boolean not null default false,
  masque     boolean not null default false,
  cree_a     timestamptz not null default now()
);

create index if not exists live_messages_session_idx on live_messages(session_id, cree_a);

-- =====================================================================
--  2. RLS — lecture seule, ecriture nulle
-- =====================================================================

alter table live_sessions        enable row level security;
alter table live_session_secrets enable row level security;  -- volontairement sans policy
alter table live_books           enable row level security;
alter table live_orders          enable row level security;
alter table live_order_items     enable row level security;
alter table live_order_contacts  enable row level security;  -- volontairement sans policy
alter table live_messages        enable row level security;

drop policy if exists live_sessions_lecture on live_sessions;
create policy live_sessions_lecture on live_sessions
  for select to anon, authenticated using (true);

drop policy if exists live_books_lecture on live_books;
create policy live_books_lecture on live_books
  for select to anon, authenticated using (true);

-- Les commandes non encaissees (statut 'pay') restent invisibles du public :
-- elles n'entrent dans la file qu'une fois le paiement confirme.
drop policy if exists live_orders_lecture on live_orders;
create policy live_orders_lecture on live_orders
  for select to anon, authenticated using (statut <> 'pay');

drop policy if exists live_order_items_lecture on live_order_items;
create policy live_order_items_lecture on live_order_items
  for select to anon, authenticated using (
    exists (select 1 from live_orders o
             where o.id = live_order_items.order_id and o.statut <> 'pay'));

-- Le chat est lu en entier : le drapeau 'masque' est un choix d'affichage,
-- pas un secret. Le filtrer en RLS empecherait la propagation Realtime de
-- la moderation (le message resterait affiche chez les visiteurs).
drop policy if exists live_medias_lecture on live_medias;
create policy live_medias_lecture on live_medias
  for select to anon, authenticated using (true);

drop policy if exists live_messages_lecture on live_messages;
create policy live_messages_lecture on live_messages
  for select to anon, authenticated using (true);

-- =====================================================================
--  3. VERIFICATION DE JETON
-- =====================================================================

create or replace function live_verif(p_session uuid, p_token text, p_role text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_ok boolean;
begin
  select case p_role
           when 'auteur' then s.token_auteur = p_token
           when 'regie'  then s.token_regie  = p_token
           else (s.token_auteur = p_token or s.token_regie = p_token)
         end
    into v_ok
    from live_session_secrets s
   where s.session_id = p_session;

  if v_ok is not true then
    raise exception 'Acces refuse : jeton invalide pour cette salle'
      using errcode = '42501';
  end if;
end $$;

-- IMPORTANT : revoquer depuis PUBLIC, pas seulement depuis anon.
-- PostgreSQL accorde EXECUTE a PUBLIC sur toute fonction nouvellement
-- creee, et anon herite de PUBLIC : un revoke cible sur anon ne retire
-- donc rien du tout. C'est un piege classique, verifie par les tests.
revoke execute on function live_verif(uuid, text, text) from public, anon, authenticated;

-- =====================================================================
--  4. RPC VISITEUR (sans jeton)
-- =====================================================================

-- p_items : [{"book":"<uuid>","n":2}, ...]
create or replace function live_passer_commande(
  p_session uuid,
  p_pseudo  text,
  p_message text,
  p_items   jsonb,
  p_tel     text,
  p_adresse text,
  p_cp      text,
  p_ville   text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_statut text;
  v_port   integer;
  v_total  integer := 0;
  v_order  uuid;
  v_item   jsonb;
  v_book   live_books%rowtype;
  v_n      integer;
  v_nb     integer := 0;
begin
  select statut, port_cents into v_statut, v_port
    from live_sessions where id = p_session;
  if v_statut is null then
    raise exception 'Salle introuvable';
  end if;
  if v_statut <> 'live' then
    raise exception 'La salle n''est pas ouverte aux commandes';
  end if;

  if coalesce(trim(p_pseudo), '') = '' then
    raise exception 'Indiquez le pseudo a annoncer';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Choisissez au moins un livre';
  end if;
  if length(regexp_replace(coalesce(p_tel, ''), '\D', '', 'g')) < 10 then
    raise exception 'Numero de telephone incomplet';
  end if;

  -- Total calcule cote serveur : le prix affiche par le client n'est jamais cru.
  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_book from live_books
     where id = (v_item->>'book')::uuid and session_id = p_session;
    if v_book.id is null then
      raise exception 'Livre inconnu dans cette salle';
    end if;
    v_n := greatest(1, least(20, coalesce((v_item->>'n')::int, 1)));
    v_total := v_total + v_book.prix_cents * v_n;
    v_nb := v_nb + 1;
  end loop;
  if v_nb = 0 then
    raise exception 'Choisissez au moins un livre';
  end if;

  insert into live_orders (session_id, pseudo, message, statut, total_cents, origine)
  values (p_session, trim(p_pseudo), nullif(trim(coalesce(p_message,'')), ''),
          'pay', v_total + v_port, 'visiteur')
  returning id into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into live_order_items (order_id, book_id, quantite)
    values (v_order, (v_item->>'book')::uuid,
            greatest(1, least(20, coalesce((v_item->>'n')::int, 1))));
  end loop;

  insert into live_order_contacts (order_id, tel, adresse, cp, ville)
  values (v_order, left(trim(p_tel), 20), left(trim(coalesce(p_adresse,'')), 120),
          left(trim(coalesce(p_cp,'')), 10), left(trim(coalesce(p_ville,'')), 60));

  return v_order;
end $$;

create or replace function live_envoyer_message(
  p_session uuid, p_pseudo text, p_texte text, p_role text default 'visiteur'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_recents integer; v_id uuid;
begin
  if coalesce(trim(p_texte), '') = '' then
    raise exception 'Message vide';
  end if;

  -- Garde-fou anti-flood. Volontairement simple : sans authentification on
  -- ne peut pas identifier durablement un emetteur. La moderation regie
  -- reste le vrai filet de securite.
  select count(*) into v_recents from live_messages
   where session_id = p_session and pseudo = trim(p_pseudo)
     and cree_a > now() - interval '20 seconds';
  if v_recents >= 4 then
    raise exception 'Trop de messages d''affilee, patientez quelques secondes';
  end if;

  insert into live_messages (session_id, pseudo, role, texte)
  values (p_session, left(trim(p_pseudo), 30),
          case when p_role in ('auteur','regie') then 'visiteur' else 'visiteur' end,
          left(trim(p_texte), 240))
  returning id into v_id;
  return v_id;
end $$;

-- =====================================================================
--  5. RPC AUTRICE / REGIE (jeton obligatoire)
-- =====================================================================

create or replace function live_marquer_sms(p_session uuid, p_token text, p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform live_verif(p_session, p_token, 'auteur');
  update live_orders set sms_envoye = true
   where id = p_order and session_id = p_session and statut = 'pay';
end $$;

-- Encaissement : decrement de stock atomique. C'est ici que se joue la
-- non-survente — deux commandes simultanees sur le dernier exemplaire
-- sont serialisees par le verrou de ligne.
create or replace function live_encaisser(p_session uuid, p_token text, p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_manque text; v_pos integer; v_statut text;
begin
  perform live_verif(p_session, p_token, 'auteur');

  -- Verrou sur la commande AVANT toute autre chose. Deux effets :
  -- 1. un second appel (double-clic, reseau qui repart) trouve la commande
  --    deja en 'att' et sort sans rien faire — sans ce controle, le stock
  --    etait decremente une seconde fois ;
  -- 2. deux appels concurrents sont serialises.
  select statut into v_statut from live_orders
   where id = p_order and session_id = p_session for update;
  if v_statut is null then
    raise exception 'Commande introuvable dans cette salle';
  end if;
  if v_statut <> 'pay' then
    raise exception 'Cette commande est deja encaissee';
  end if;

  -- Verrouillage ordonne par id : evite les interblocages.
  perform 1 from live_books
   where id in (select book_id from live_order_items where order_id = p_order)
   order by id for update;

  select b.titre_court into v_manque
    from live_order_items i join live_books b on b.id = i.book_id
   where i.order_id = p_order and b.stock < i.quantite
   limit 1;
  if v_manque is not null then
    raise exception 'Stock insuffisant : %', v_manque;
  end if;

  update live_books b set stock = b.stock - i.quantite
    from live_order_items i
   where i.book_id = b.id and i.order_id = p_order;

  select coalesce(max(position), 0) + 1 into v_pos
    from live_orders where session_id = p_session;

  update live_orders set statut = 'att', position = v_pos
   where id = p_order and session_id = p_session and statut = 'pay';

  insert into live_messages (session_id, pseudo, role, texte)
  select p_session, o.pseudo, 'systeme',
         o.pseudo || ' rejoint la file'
    from live_orders o where o.id = p_order;
end $$;

-- Saisie manuelle de secours cote autrice : entre directement en file.
create or replace function live_ajouter_dedicace(
  p_session uuid, p_token text, p_pseudo text, p_message text,
  p_book uuid, p_qte integer default 1
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_order uuid; v_book live_books%rowtype; v_pos integer; v_port integer;
begin
  perform live_verif(p_session, p_token, 'auteur');

  select * into v_book from live_books where id = p_book and session_id = p_session for update;
  if v_book.id is null then raise exception 'Livre inconnu dans cette salle'; end if;
  if v_book.stock < p_qte then raise exception 'Stock epuise : %', v_book.titre_court; end if;
  if coalesce(trim(p_pseudo), '') = '' then raise exception 'Indiquez le pseudo a annoncer'; end if;

  select port_cents into v_port from live_sessions where id = p_session;
  update live_books set stock = stock - p_qte where id = p_book;
  select coalesce(max(position), 0) + 1 into v_pos from live_orders where session_id = p_session;

  insert into live_orders (session_id, pseudo, message, statut, position, total_cents, origine)
  values (p_session, trim(p_pseudo), nullif(trim(coalesce(p_message,'')), ''),
          'att', v_pos, v_book.prix_cents * p_qte + v_port, 'auteur')
  returning id into v_order;

  insert into live_order_items (order_id, book_id, quantite) values (v_order, p_book, p_qte);
  return v_order;
end $$;

create or replace function live_annuler_commande(p_session uuid, p_token text, p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform live_verif(p_session, p_token, 'auteur');
  -- Si la commande etait deja encaissee, le stock est rendu.
  update live_books b set stock = b.stock + i.quantite
    from live_order_items i, live_orders o
   where i.book_id = b.id and i.order_id = p_order
     and o.id = p_order and o.statut in ('att','cours');
  update live_orders set statut = 'annule', position = null
   where id = p_order and session_id = p_session;
  delete from live_order_contacts where order_id = p_order;
end $$;

create or replace function live_lancer(p_session uuid, p_token text, p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform live_verif(p_session, p_token, 'tous');
  update live_orders set statut = 'cours'
   where id = p_order and session_id = p_session and statut = 'att';
exception when unique_violation then
  raise exception 'Une dedicace est deja a l''ecran';
end $$;

create or replace function live_terminer(p_session uuid, p_token text, p_order uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_auto boolean; v_next uuid; v_fait integer;
begin
  perform live_verif(p_session, p_token, 'tous');
  update live_orders set statut = 'fait'
   where id = p_order and session_id = p_session and statut = 'cours';
  get diagnostics v_fait = row_count;

  -- Meme precaution que pour l'encaissement : si la dedicace n'etait pas
  -- a l'ecran (double-clic, appel rejoue), on n'enchaine pas. Sans ce
  -- controle, un second appel tirait une dedicace de plus vers l'ecran.
  if v_fait = 0 then
    return;
  end if;

  select auto_enchainement into v_auto from live_sessions where id = p_session;
  if v_auto then
    select id into v_next from live_orders
     where session_id = p_session and statut = 'att'
     order by position limit 1;
    if v_next is not null then
      update live_orders set statut = 'cours' where id = v_next;
    end if;
  end if;
end $$;

create or replace function live_reordonner(
  p_session uuid, p_token text, p_order uuid, p_sens text
) returns void
language plpgsql security definer set search_path = public as $$
declare v_pos integer; v_voisin uuid; v_vpos integer;
begin
  perform live_verif(p_session, p_token, 'regie');
  select position into v_pos from live_orders
   where id = p_order and session_id = p_session and statut = 'att';
  if v_pos is null then return; end if;

  if p_sens = 'haut' then
    select id, position into v_voisin, v_vpos from live_orders
     where session_id = p_session and statut = 'att' and position < v_pos
     order by position desc limit 1;
  else
    select id, position into v_voisin, v_vpos from live_orders
     where session_id = p_session and statut = 'att' and position > v_pos
     order by position asc limit 1;
  end if;
  if v_voisin is null then return; end if;

  update live_orders set position = v_vpos where id = p_order;
  update live_orders set position = v_pos  where id = v_voisin;
end $$;

create or replace function live_brancher_video(p_session uuid, p_token text, p_video_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform live_verif(p_session, p_token, 'regie');
  update live_sessions set video_id = nullif(trim(coalesce(p_video_id,'')), '')
   where id = p_session;
end $$;

create or replace function live_basculer_auto(p_session uuid, p_token text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_new boolean;
begin
  perform live_verif(p_session, p_token, 'tous');
  update live_sessions set auto_enchainement = not auto_enchainement
   where id = p_session returning auto_enchainement into v_new;
  return v_new;
end $$;

create or replace function live_maj_statut(p_session uuid, p_token text, p_statut text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform live_verif(p_session, p_token, 'tous');
  if p_statut not in ('prepa','live','termine') then
    raise exception 'Statut inconnu';
  end if;
  update live_sessions
     set statut = p_statut,
         demarre_a = case when p_statut = 'live' and demarre_a is null
                          then now() else demarre_a end
   where id = p_session;
end $$;

create or replace function live_maj_livre(
  p_session uuid, p_token text, p_book uuid,
  p_prix_cents integer default null, p_stock integer default null,
  p_couverture_url text default null, p_lien_pret boolean default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform live_verif(p_session, p_token, 'auteur');
  update live_books set
    prix_cents     = coalesce(p_prix_cents, prix_cents),
    stock          = coalesce(p_stock, stock),
    couverture_url = coalesce(p_couverture_url, couverture_url),
    lien_pret      = coalesce(p_lien_pret, lien_pret)
   where id = p_book and session_id = p_session;
end $$;

-- Televersement d'une image. p_cible vaut 'banniere' ou 'couverture'.
-- p_donnees est du base64 nu (sans le prefixe data:image/...;base64,).
-- L'ancienne image referencee est supprimee au passage : pas d'orphelins.
create or replace function live_televerser_media(
  p_session uuid, p_token text, p_cible text,
  p_donnees text, p_mime text default 'image/webp',
  p_livre uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_ancien text; v_taille integer;
begin
  perform live_verif(p_session, p_token, 'auteur');

  v_taille := length(coalesce(p_donnees, ''));
  if v_taille = 0 then
    raise exception 'Image vide';
  end if;
  -- ~400 ko de base64, soit ~300 ko d'image reelle. Le client redimensionne
  -- avant l'envoi ; cette borne est le garde-fou de derniere ligne.
  if v_taille > 400000 then
    raise exception 'Image trop lourde (% ko) : redimensionnez-la', v_taille / 1024;
  end if;
  if p_mime not in ('image/webp','image/jpeg','image/png') then
    raise exception 'Format d''image non accepte';
  end if;

  insert into live_medias (session_id, mime, donnees, octets)
  values (p_session, p_mime, p_donnees, v_taille)
  returning id into v_id;

  if p_cible = 'banniere' then
    select banniere_url into v_ancien from live_sessions where id = p_session;
    update live_sessions set banniere_url = 'media:' || v_id where id = p_session;
  elsif p_cible = 'couverture' then
    select couverture_url into v_ancien from live_books
     where id = p_livre and session_id = p_session;
    update live_books set couverture_url = 'media:' || v_id
     where id = p_livre and session_id = p_session;
    if not found then
      raise exception 'Livre inconnu dans cette salle';
    end if;
  else
    raise exception 'Cible d''image inconnue';
  end if;

  if v_ancien like 'media:%' then
    delete from live_medias where id = substring(v_ancien from 7)::uuid;
  end if;

  return v_id;
end $$;

create or replace function live_maj_banniere(p_session uuid, p_token text, p_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform live_verif(p_session, p_token, 'auteur');
  update live_sessions set banniere_url = nullif(trim(coalesce(p_url,'')), '')
   where id = p_session;
end $$;

create or replace function live_moderer(
  p_session uuid, p_token text, p_message uuid, p_action text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform live_verif(p_session, p_token, 'regie');
  if p_action = 'epingler' then
    update live_messages set epingle = not epingle
     where id = p_message and session_id = p_session;
  elsif p_action = 'masquer' then
    update live_messages set masque = not masque
     where id = p_message and session_id = p_session;
  else
    raise exception 'Action de moderation inconnue';
  end if;
end $$;

-- Seule voie d'acces aux coordonnees : reservee a l'autrice, par jeton.
create or replace function live_console_auteur(p_session uuid, p_token text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_res jsonb;
begin
  perform live_verif(p_session, p_token, 'auteur');
  select coalesce(jsonb_agg(x order by x->>'cree_a'), '[]'::jsonb) into v_res
  from (
    select jsonb_build_object(
             'id', o.id, 'pseudo', o.pseudo, 'message', o.message,
             'statut', o.statut, 'sms_envoye', o.sms_envoye,
             'position', o.position, 'total_cents', o.total_cents,
             'cree_a', o.cree_a,
             'tel', c.tel, 'adresse', c.adresse, 'cp', c.cp, 'ville', c.ville,
             'items', (select coalesce(jsonb_agg(jsonb_build_object(
                                'book', i.book_id, 'n', i.quantite)), '[]'::jsonb)
                         from live_order_items i where i.order_id = o.id)
           ) as x
      from live_orders o
      left join live_order_contacts c on c.order_id = o.id
     where o.session_id = p_session and o.statut <> 'annule'
  ) t;
  return v_res;
end $$;

-- Purge RGPD : a declencher par cron Supabase (pg_cron) ou manuellement.
create or replace function live_purger_contacts()
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  delete from live_order_contacts where purger_apres < now();
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke execute on function live_purger_contacts() from public, anon, authenticated;

-- Creation d'une salle. Reservee au dashboard (service_role) :
-- c'est la seule fonction qui expose les jetons en clair, une fois.
create or replace function live_creer_session(
  p_slug text, p_titre text, p_auteur_nom text,
  p_sous_titre text default null, p_event_id text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_ta text; v_tr text;
begin
  v_ta := encode(gen_random_bytes(18), 'hex');
  v_tr := encode(gen_random_bytes(18), 'hex');
  insert into live_sessions (slug, titre, sous_titre, auteur_nom, event_id)
  values (p_slug, p_titre, p_sous_titre, p_auteur_nom, p_event_id)
  returning id into v_id;
  insert into live_session_secrets (session_id, token_auteur, token_regie)
  values (v_id, v_ta, v_tr);
  return jsonb_build_object('session_id', v_id, 'token_auteur', v_ta, 'token_regie', v_tr);
end $$;

revoke execute on function live_creer_session(text, text, text, text, text)
  from public, anon, authenticated;

-- =====================================================================
--  6. REALTIME
--  Les 3 interfaces s'abonnent a ces tables. Cote client, un evenement
--  declenche un rechargement leger plutot qu'une application de delta :
--  a l'echelle d'une salle c'est negligeable, et cela supprime toute
--  une classe de bugs de synchronisation.
-- =====================================================================

do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'Publication supabase_realtime absente : Realtime non active. '
                 'Sur Supabase elle existe toujours ; en local ce n''est pas bloquant.';
    return;
  end if;
  foreach t in array array['live_sessions','live_books','live_orders','live_messages'] loop
    begin
      execute format('alter publication supabase_realtime add table %I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- =====================================================================
--  7. RATTACHEMENT A L'AGENDA V1  — A ACTIVER
--  live_sessions.event_id est pour l'instant un simple texte libre, afin
--  que la migration passe sans connaitre le nom exact de la table
--  evenements. Une fois ce nom confirme, remplacer par une vraie cle
--  etrangere en adaptant les deux identifiants ci-dessous :
--
--    alter table live_sessions
--      alter column event_id type uuid using event_id::uuid,
--      add constraint live_sessions_event_fk
--        foreign key (event_id) references <TABLE_EVENEMENTS>(<PK>)
--        on delete set null;
--
--  Tant que la contrainte n'est pas posee, aucune donnee n'est perdue :
--  l'identifiant est simplement stocke sans verification d'integrite.
-- =====================================================================

-- =====================================================================
--  NOTE — evolution possible des jetons
--  Pour passer en jetons haches : ajouter token_auteur_hash /
--  token_regie_hash (crypt(token, gen_salt('bf'))), comparer avec
--  crypt(p_token, hash) dans live_verif(), supprimer les colonnes en
--  clair. Contrepartie : un jeton perdu devient irrecuperable et doit
--  etre regenere. En clair, il reste consultable dans le dashboard.
-- =====================================================================

#!/usr/bin/env bash
set -euo pipefail

PROJECT_REF="${PROJECT_REF:-pwyetrqyiaxpzjrafpvb}"
BACKUP_ROOT="${BACKUP_ROOT:-$HOME/SupabaseBackups/dedicalivres}"
TIMESTAMP="$(date +"%Y-%m-%d_%H-%M-%S")"
TARGET_DIR="$BACKUP_ROOT/$TIMESTAMP"

fail() {
  printf "Erreur: %s\n" "$1" >&2
  exit 1
}

need_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 est introuvable. Installe-le avant de lancer le backup."
}

need_command supabase
need_command docker
need_command node

docker info >/dev/null 2>&1 || fail "Docker Desktop n'est pas lance."

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  printf "Choisis le mode de connexion Supabase.\n"
  printf "1) Construire l'URL depuis le mot de passe database (recommande)\n"
  printf "2) Coller une connection string complete\n"
  read -rp "Choix [1]: " CONNECTION_MODE
  CONNECTION_MODE="${CONNECTION_MODE:-1}"

  if [[ "$CONNECTION_MODE" == "2" ]]; then
    printf "Colle la connection string Postgres Supabase.\n"
    printf "Elle ne sera pas ecrite dans les fichiers de backup.\n"
    read -rsp "SUPABASE_DB_URL: " SUPABASE_DB_URL
    printf "\n"
  else
    printf "Colle uniquement le mot de passe database Supabase.\n"
    printf "Il sera masque et ne sera pas ecrit dans les fichiers de backup.\n"
    read -rsp "Database password: " SUPABASE_DB_PASSWORD
    printf "\n"

    ENCODED_PASSWORD="$(
      PASSWORD="$SUPABASE_DB_PASSWORD" node -e 'process.stdout.write(encodeURIComponent(process.env.PASSWORD || ""))'
    )"

    SUPABASE_DB_URL="postgresql://postgres:${ENCODED_PASSWORD}@db.${PROJECT_REF}.supabase.co:5432/postgres"
  fi
fi

[[ "$SUPABASE_DB_URL" == postgresql://* || "$SUPABASE_DB_URL" == postgres://* ]] || {
  fail "La connection string doit commencer par postgres:// ou postgresql://."
}

mkdir -p "$TARGET_DIR"
chmod 700 "$TARGET_DIR"

cat > "$TARGET_DIR/metadata.txt" <<EOF
Project ref: $PROJECT_REF
Created at: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
Host: $(hostname)
Supabase CLI: $(supabase --version 2>/dev/null || true)
Backup files:
- roles.sql
- schema.sql
- data.sql
EOF

printf "Backup Supabase vers: %s\n" "$TARGET_DIR"

supabase db dump --db-url "$SUPABASE_DB_URL" -f "$TARGET_DIR/roles.sql" --role-only
supabase db dump --db-url "$SUPABASE_DB_URL" -f "$TARGET_DIR/schema.sql"
supabase db dump --db-url "$SUPABASE_DB_URL" -f "$TARGET_DIR/data.sql" --use-copy --data-only

(
  cd "$TARGET_DIR"
  shasum -a 256 roles.sql schema.sql data.sql metadata.txt > checksums.sha256
)

printf "\nBackup termine.\n"
printf "Dossier: %s\n" "$TARGET_DIR"
printf "Controle rapide:\n"
ls -lh "$TARGET_DIR"

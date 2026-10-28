#!/bin/bash
# Configura as chaves da integração com o Google Agenda (api/google.js):
#   - na Vercel (produção e prévias): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e
#     SUPABASE_SERVICE_ROLE_KEY (esta última vem direto do Supabase);
#   - no computador: .env.local (não vai para o git), para o `npm run dev`.
# Lê tudo de ~/.medcode-secrets.env e não mostra nenhum valor na tela.
#
# USO:  bash scripts/configurar-google.sh
set -euo pipefail
set -a; . ~/.medcode-secrets.env; set +a
cd "$(dirname "$0")/.."

: "${GOOGLE_CLIENT_ID:?Falta GOOGLE_CLIENT_ID em ~/.medcode-secrets.env}"
: "${GOOGLE_CLIENT_SECRET:?Falta GOOGLE_CLIENT_SECRET em ~/.medcode-secrets.env}"

SR=$(curl -fsS "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/api-keys?reveal=true" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  | python3 -c "import sys,json; print(next((k['api_key'] for k in json.load(sys.stdin) if k.get('name')=='service_role'), ''))")
[ -n "$SR" ] || { echo "Não consegui ler a chave de serviço do Supabase."; exit 1; }

TEAM=team_xjSPDv30AQByVawPdov4HTIa
PRJ=prj_xP77Tf2MN3SQlXjbadtBhXPISlIE
for K in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET SUPABASE_SERVICE_ROLE_KEY; do
  if [ "$K" = SUPABASE_SERVICE_ROLE_KEY ]; then V="$SR"; else V="${!K}"; fi
  CORPO=$(python3 -c "import json,sys; print(json.dumps({'key':sys.argv[1],'value':sys.argv[2],'type':'encrypted','target':['production','preview']}))" "$K" "$V")
  COD=$(curl -s -o /dev/null -w "%{http_code}" -X POST "https://api.vercel.com/v10/projects/$PRJ/env?teamId=$TEAM&upsert=true" \
    -H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json" -d "$CORPO")
  echo "Vercel $K: $([ "$COD" = 200 ] || [ "$COD" = 201 ] && echo ok || echo "erro $COD")"
done

umask 077
{ echo "GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID"; echo "GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET"; echo "SUPABASE_SERVICE_ROLE_KEY=$SR"; } > .env.local
git check-ignore -q .env.local && echo ".env.local criado (fora do git)."
echo "Pronto. Reinicie o npm run dev para ele ler as chaves novas."

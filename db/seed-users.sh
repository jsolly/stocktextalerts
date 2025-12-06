#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${0}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env.local"
USERS_FILE="${SCRIPT_DIR}/users.json"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Timezone must be an IANA tz database name (e.g., America/New_York).
# time_format accepts only \"12h\" or \"24h\" tokens.
DEFAULT_TIMEZONE="America/New_York"
DEFAULT_TIME_FORMAT="12h"

echo -e "${GREEN}Seeding test users via Supabase Admin API...${NC}"

if [ ! -f "${ENV_FILE}" ]; then
  echo -e "${RED}Error: .env.local file not found at ${ENV_FILE}${NC}"
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

if [ -z "${PUBLIC_SUPABASE_URL:-}" ]; then
  echo -e "${RED}Error: PUBLIC_SUPABASE_URL must be set in .env.local${NC}"
  exit 1
fi

if [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo -e "${RED}Error: SUPABASE_SERVICE_ROLE_KEY must be set in .env.local${NC}"
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo -e "${RED}Error: DATABASE_URL must be set in .env.local${NC}"
  exit 1
fi

if [ -z "${DEFAULT_PASSWORD:-}" ]; then
  echo -e "${RED}Error: DEFAULT_PASSWORD must be set in .env.local for seeding users.${NC}"
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo -e "${RED}Error: jq is required but not installed.${NC}"
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo -e "${RED}Error: psql is required but not installed.${NC}"
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo -e "${RED}Error: curl is required but not installed.${NC}"
  exit 1
fi

if [ ! -f "${USERS_FILE}" ]; then
  echo -e "${RED}Error: ${USERS_FILE} not found.${NC}"
  exit 1
fi

SUPABASE_AUTH_URL="${PUBLIC_SUPABASE_URL%/}/auth/v1"

echo -e "${YELLOW}Loading users from ${USERS_FILE}...${NC}"

while read -r user_json; do
  email="$(echo "${user_json}" | jq -r '.email')"
  timezone="$(echo "${user_json}" | jq -r '.timezone // empty')"
  time_format="$(echo "${user_json}" | jq -r '.time_format // empty')"

  # Trim whitespace from email before validation
  email="$(printf '%s' "${email}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"

  if [ -z "${email}" ] || [ "${email}" = "null" ]; then
    echo -e "${YELLOW}Skipping user with missing email: ${user_json}${NC}"
    continue
  fi

  # Basic email format validation: one \"@\" and a domain with a dot.
  if ! printf '%s\n' "${email}" | grep -Eq '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'; then
    echo -e "${YELLOW}Skipping user with invalid email format: ${email}${NC}"
    continue
  fi

  timezone="${timezone:-$DEFAULT_TIMEZONE}"
  if [ -n "${timezone}" ] && [ ! -f "/usr/share/zoneinfo/${timezone}" ]; then
    echo -e "${YELLOW}Invalid timezone \"${timezone}\" for ${email}, falling back to ${DEFAULT_TIMEZONE}.${NC}"
    timezone="${DEFAULT_TIMEZONE}"
  fi

  time_format="${time_format:-$DEFAULT_TIME_FORMAT}"
  case "${time_format}" in
    12h|24h)
      ;;
    *)
      echo -e "${YELLOW}Invalid time_format \"${time_format}\" for ${email}, falling back to ${DEFAULT_TIME_FORMAT}.${NC}"
      time_format="${DEFAULT_TIME_FORMAT}"
      ;;
  esac

  echo -e "${YELLOW}Processing user ${email}...${NC}"

  # Look up existing auth user by email
  existing_user_response=""
  existing_user_curl_exit=0
  existing_user_response="$(
    curl --fail-with-body -sS \
      -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
      "${SUPABASE_AUTH_URL}/admin/users?email=$(printf '%s' "${email}" | jq -sRr @uri)"
  )" || existing_user_curl_exit=$?

  if [ "${existing_user_curl_exit}" -ne 0 ]; then
    echo -e "${RED}Error querying existing auth user for ${email}.${NC}" >&2
    echo "${existing_user_response}" >&2
    exit 1
  fi

  existing_user_id="$(echo "${existing_user_response}" | jq -r '.users[0].id // empty' 2>/dev/null || echo "")"

  user_id=""
  if [ -n "${existing_user_id}" ]; then
    echo -e "${YELLOW}Auth user already exists for ${email}, skipping creation.${NC}"
    user_id="${existing_user_id}"
  else
    echo -e "${YELLOW}Creating confirmed auth user for ${email} via Admin API...${NC}"
    create_response=""
    create_curl_exit=0
    create_response="$(
      curl --fail-with-body -sS -X POST \
        -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
        -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
        -H "Content-Type: application/json" \
        -d "$(jq -n --arg email "${email}" --arg password "${DEFAULT_PASSWORD}" '{"email":$email,"password":$password,"email_confirm":true}')" \
        "${SUPABASE_AUTH_URL}/admin/users"
    )" || create_curl_exit=$?

    if [ "${create_curl_exit}" -ne 0 ]; then
      echo -e "${RED}Failed to create auth user for ${email}. HTTP error from Supabase Admin API.${NC}" >&2
      echo "${create_response}" >&2
      exit 1
    fi

    user_id="$(echo "${create_response}" | jq -r '.id // .user.id // empty' 2>/dev/null || echo "")"
    if [ -z "${user_id}" ]; then
      echo -e "${RED}Failed to create auth user for ${email}. Response:${NC} ${create_response}"
      exit 1
    fi
  fi

  echo -e "${YELLOW}Upserting profile row for ${email}...${NC}"
  psql "${DATABASE_URL}" --set ON_ERROR_STOP=on \
    -v user_id="${user_id}" \
    -v email="${email}" \
    -v tz="${timezone}" \
    -v tf="${time_format}" \
    -c "
    INSERT INTO users (id, email, timezone, time_format)
    VALUES (:'user_id', :'email', :'tz', :'tf')
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      timezone = EXCLUDED.timezone,
      time_format = EXCLUDED.time_format;
  "

  echo -e "${GREEN}Seeded user ${email} successfully (confirmed).${NC}"
done < <(jq -c '.users[]' "${USERS_FILE}")

echo -e "${GREEN}✅ Finished seeding users.${NC}"



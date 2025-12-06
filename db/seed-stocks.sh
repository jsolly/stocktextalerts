#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${0}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env.local"
STOCKS_FILE="${SCRIPT_DIR}/us-stocks.json"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}Seeding stocks table...${NC}"

if [ ! -f "${ENV_FILE}" ]; then
  echo -e "${RED}Error: .env.local file not found at ${ENV_FILE}${NC}"
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

if [ -z "${DATABASE_URL:-}" ]; then
  echo -e "${RED}Error: DATABASE_URL must be set in .env.local${NC}"
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

if [ ! -f "${STOCKS_FILE}" ]; then
  echo -e "${RED}Error: ${STOCKS_FILE} not found.${NC}"
  echo -e "${YELLOW}Run the stock data fetch step before seeding.${NC}"
  exit 1
fi

TOTAL_TICKERS=$(jq '.data | length' "${STOCKS_FILE}")
TMP_CSV="$(mktemp -t stocks.csv.XXXXXX)"
trap 'rm -f "${TMP_CSV}"' EXIT

echo -e "${YELLOW}Preparing ${TOTAL_TICKERS} tickers for import...${NC}"

jq -r '.data[] | [.symbol, .name, .exchange] | @csv' "${STOCKS_FILE}" > "${TMP_CSV}"

echo -e "${YELLOW}Clearing existing stocks...${NC}"
psql "${DATABASE_URL}" --set ON_ERROR_STOP=on -c "TRUNCATE TABLE user_stocks, stocks;"

echo -e "${YELLOW}Importing tickers via COPY...${NC}"
psql "${DATABASE_URL}" --set ON_ERROR_STOP=on <<EOF
\\copy stocks(symbol, name, exchange) FROM '${TMP_CSV}' WITH (FORMAT csv)
EOF

echo -e "${GREEN}✅ Imported ${TOTAL_TICKERS} tickers into the database.${NC}"

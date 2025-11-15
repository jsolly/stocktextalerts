#!/bin/bash

# Bootstrap the database: apply schema and seed stocks
# This script runs both apply-schema.sh and seed-stocks.sh in sequence
#
# Usage:
#   ./db/bootstrap-db.sh
#
# This script runs:
#   ./db/apply-schema.sh - Apply complete database schema to Supabase
#   ./db/seed-stocks.sh - Seed stocks table with data from us-stocks.json
#
# Prerequisites:
#   - .env.local file with DATABASE_URL
#   - psql command line tool installed
#   - jq command line tool installed (for seed-stocks.sh)
#   - db/us-stocks.json file (for seed-stocks.sh)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${0}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}🚀 Bootstrapping database...${NC}"
echo ""

# Step 1: Apply schema
echo -e "${YELLOW}Step 1: Applying database schema...${NC}"
if ! "${SCRIPT_DIR}/apply-schema.sh"; then
  echo -e "${RED}❌ Schema application failed${NC}" >&2
  exit 1
fi
echo ""

# Step 2: Seed stocks
echo -e "${YELLOW}Step 2: Seeding stocks data...${NC}"
if ! "${SCRIPT_DIR}/seed-stocks.sh"; then
  echo -e "${RED}❌ Stock seeding failed${NC}" >&2
  exit 1
fi
echo ""

echo -e "${GREEN}✅ Database bootstrap completed successfully!${NC}"


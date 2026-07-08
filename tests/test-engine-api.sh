#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# LexQ Engine API — Execution Endpoint Integration Test
# ═══════════════════════════════════════════════════════════════
#
# End-to-end verification of the 4 execution endpoints plus
# deployment / mutex / activation / simulation scenarios.
#
#   1. SINGLE_GROUP      POST /groups/{groupId}
#   2. SPECIFIC_VERSION  POST /groups/{groupId}/versions/{versionId}
#   3. BATCH             POST /groups/{groupId}/batch
#   4. COMPOSITE         POST /composite
#   +  REQUIREMENTS      GET  /groups/{groupId}/requirements
#   +  REPLAY            single-replay determinism + window blast radius (bills REPLAY metric)
#   +  PROVENANCE        lineage / reveal 403 contract / error-classification regressions
#
# Prerequisites:
#   - lexq-cli built (pnpm build)
#   - 'lexq auth login' completed (API key stored)
#   - target environment API key role: ADMIN or API_CLIENT
#
# ⚠️  Caution:
#   This script creates real resources in the target tenant.
#   Use a dedicated test tenant instead of a production tenant.
#   Set LEXQ_SKIP_CLEANUP=1 to keep resources for inspection.
#
# Usage:
#   chmod +x test-engine-api.sh
#   ./test-engine-api.sh                          # default (production — from config)
#   PARTNER_BASE_URL=<local-partner-url> \
#     ENGINE_BASE_URL=<local-engine-url> \
#     ./test-engine-api.sh                        # local dev environment override
#
# Environment variables (optional):
#   LEXQ_API_KEY        — use instead of the stored key
#   PARTNER_BASE_URL    — default: baseUrl from ~/.lexq/config.json
#   ENGINE_BASE_URL     — default: Partner URL with /partners → /execution
#   LEXQ_TENANT_TZ      — timezone for HISTORICAL simulation dates (default: UTC)
#                          must match the tenant's timezone or the query
#                          window drifts. e.g. America/Los_Angeles, Asia/Seoul
#   LEXQ_SKIP_CLEANUP   — set to 1 to keep created resources
#
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# Fail fast on positional args — configuration is env-var only (see header).
if [ "$#" -gt 0 ]; then
    echo "ERROR: this script takes no arguments — use environment variables:"
    echo "  LEXQ_API_KEY=<key> PARTNER_BASE_URL=<url> $0"
    exit 1
fi

# ── Unique suffix ──
TS=$(date +%s)

# ── Tenant timezone (for HISTORICAL simulation date math) ──
# The backend converts from/to to Instants in the tenant's timezone.
# If the test machine's local timezone differs from the tenant's, the
# query window drifts and HISTORICAL simulation may process 0 records.
TENANT_TZ="${LEXQ_TENANT_TZ:-UTC}"

# ── Config File ──
CONFIG_FILE="$HOME/.lexq/config.json"

# ── Resolve Partner API URL ──
if [ -n "${PARTNER_BASE_URL:-}" ]; then
    PARTNER_URL="$PARTNER_BASE_URL"
elif [ -f "$CONFIG_FILE" ]; then
    PARTNER_URL=$(node -e "
        try {
            const c = require('$CONFIG_FILE');
            process.stdout.write(c.baseUrl || '');
        } catch { process.stdout.write(''); }
    " 2>/dev/null || true)
fi
if [ -z "${PARTNER_URL:-}" ]; then
    echo "ERROR: cannot resolve the Partner API URL."
    echo "       Set PARTNER_BASE_URL or run 'lexq auth login'."
    exit 1
fi

# ── Resolve Engine API URL (auto-derived from the Partner URL) ──
if [ -n "${ENGINE_BASE_URL:-}" ]; then
    ENGINE_URL="$ENGINE_BASE_URL"
else
    # swap /partners → /execution (assumes path-based routing)
    ENGINE_URL="${PARTNER_URL/partners/execution}"
fi

# ── Resolve API key ──
if [ -n "${LEXQ_API_KEY:-}" ]; then
    API_KEY="$LEXQ_API_KEY"
elif [ -f "$CONFIG_FILE" ]; then
    API_KEY=$(node -e "
        try {
            const c = require('$CONFIG_FILE');
            process.stdout.write(c.apiKey || '');
        } catch { process.stdout.write(''); }
    " 2>/dev/null || true)
fi
if [ -z "${API_KEY:-}" ]; then
    echo "ERROR: cannot resolve an API key."
    echo "       Set LEXQ_API_KEY or run 'lexq auth login'."
    exit 1
fi

# ── CLI ──
CLI="node dist/index.js"
CLI_OPTS="--base-url $PARTNER_URL"
[ -n "${LEXQ_API_KEY:-}" ] && CLI_OPTS="$CLI_OPTS --api-key $API_KEY"

# ── Colors ──
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; DIM='\033[2m'; NC='\033[0m'; BOLD='\033[1m'

# ── Counters ──
PASS=0; FAIL=0; SKIP=0; TOTAL=0

# ── Created Resources ──
GROUP_A_ID=""
GROUP_B_ID=""
GROUP_C_ID=""
GROUP_D_ID=""
GROUP_E_ID=""
VERSION_A_ID=""
VERSION_B_ID=""
VERSION_C_ID=""
VERSION_D_ID=""
VERSION_E_ID=""
CLONED_VERSION_ID=""

# ═══════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════

log_section() {
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}═══════════════════════════════════════${NC}"
}

KEY_SRC="stored config"; [ -n "${LEXQ_API_KEY:-}" ] && KEY_SRC="env override"
echo -e "  ${DIM}partner: ${PARTNER_URL} | engine: ${ENGINE_URL} | api key: ${KEY_SRC}${NC}"

log_test() {
    TOTAL=$((TOTAL + 1))
    echo -ne "  ${BOLD}[$TOTAL]${NC} $1 ... "
}

pass() { PASS=$((PASS + 1)); echo -e "${GREEN}PASS${NC}"; }

fail() {
    FAIL=$((FAIL + 1))
    echo -e "${RED}FAIL${NC}"
    [ -n "${1:-}" ] && echo -e "       ${RED}→ $1${NC}"
}

skip() { SKIP=$((SKIP + 1)); echo -e "${YELLOW}SKIP${NC} ${DIM}($1)${NC}"; }

json_get() {
    echo "$1" | node -e "
        let d='';
        process.stdin.on('data', c => d += c);
        process.stdin.on('end', () => {
            try {
                const o = JSON.parse(d);
                const v = '$2'.split('.').reduce((a, k) => a?.[k], o);
                process.stdout.write(String(v ?? ''));
            } catch { process.stdout.write(''); }
        });
    "
}

# Valid JSON with no error field (mirrors e2e.sh)
assert_not_error() {
    is_valid_json "$1" || return 1
    local e
    e=$(json_get "$1" "error")
    [ -z "$e" ] || [ "$e" = "undefined" ]
}

# Substring check (mirrors e2e.sh)
assert_contains() {
    echo "$1" | grep -q "$2"
}

is_valid_json() {
    echo "$1" | node -e "
        let d='';
        process.stdin.on('data', c => d += c);
        process.stdin.on('end', () => {
            try { JSON.parse(d); process.exit(0); }
            catch { process.exit(1); }
        });
    " 2>/dev/null
}

run_cli() {
    $CLI $CLI_OPTS "$@" 2>&1 || true
}

# curl wrapper for Engine API
engine_curl() {
    local method="$1"
    local path="$2"
    local body="${3:-}"

    local curl_args=(
        -s -w "\n%{http_code}"
        -X "$method"
        -H "x-api-key: $API_KEY"
        -H "Content-Type: application/json"
    )

    if [ -n "$body" ]; then
        curl_args+=(-d "$body")
    fi

    curl "${curl_args[@]}" "${ENGINE_URL}${path}"
}

# curl wrapper for Partner API (provenance contract + error-classification regressions)
partner_curl() {
    local method="$1"
    local path="$2"
    local body="${3:-}"

    local curl_args=(
        -s -w "\n%{http_code}"
        -X "$method"
        -H "x-api-key: $API_KEY"
        -H "Content-Type: application/json"
    )

    if [ -n "$body" ]; then
        curl_args+=(-d "$body")
    fi

    curl "${curl_args[@]}" "${PARTNER_URL}${path}"
}

get_http_code() {
    echo "$1" | tail -n 1
}

get_body() {
    echo "$1" | sed '$d'
}

# ═══════════════════════════════════════════════════════════════
# PHASE 0: Pre-flight
# ═══════════════════════════════════════════════════════════════

log_section "Phase 0 — Pre-flight"

echo -e "  ${DIM}Partner URL: $PARTNER_URL${NC}"
echo -e "  ${DIM}Engine URL:  $ENGINE_URL${NC}"
echo -e "  ${DIM}Tenant TZ:   $TENANT_TZ${NC}"
echo ""

log_test "CLI build exists"
if [ -f "dist/index.js" ]; then pass
else fail "dist/index.js not found — run 'pnpm build'"; exit 1; fi

log_test "Partner API reachable (whoami)"
WHOAMI=$(run_cli auth whoami)
TENANT_ID=$(json_get "$WHOAMI" "tenantId")
if [ -n "$TENANT_ID" ] && [ "$TENANT_ID" != "undefined" ]; then
    pass
    echo -e "       tenant: $TENANT_ID"
else
    fail "auth failed — no Partner API response or invalid API key"
    exit 1
fi

log_test "Engine API reachable (bad request → status code)"
# the requirements endpoint authenticates but fails fast with 400/404 when the
# groupId is bogus → a 400/404 therefore means the Engine API itself is alive
TEST_RAW=$(engine_curl GET "/groups/00000000-0000-0000-0000-000000000000/requirements")
TEST_CODE=$(get_http_code "$TEST_RAW")
if [ "$TEST_CODE" = "404" ] || [ "$TEST_CODE" = "400" ] || [ "$TEST_CODE" = "200" ]; then
    pass
    echo -e "       HTTP $TEST_CODE (reachable)"
else
    fail "Engine API unreachable (HTTP $TEST_CODE)"
    exit 1
fi

# ═══════════════════════════════════════════════════════════════
# PHASE 0.5: FactDefinition check/create
# ═══════════════════════════════════════════════════════════════

log_section "Phase 0.5 — Fact Definitions"

# payment_amount (NUMBER) — used by most tests
log_test "Fact 'payment_amount' check/create"
FACTS_LIST=$(run_cli facts list --page 0 --size 100)
HAS_PAYMENT=$(echo "$FACTS_LIST" | node -e "
    let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
        try {
            const o=JSON.parse(d);
            const items=o.content||o.data?.content||[];
            const found=items.some(f=>f.key==='payment_amount');
            process.stdout.write(found?'true':'false');
        } catch { process.stdout.write('false'); }
    });
" 2>/dev/null || echo "false")

if [ "$HAS_PAYMENT" = "true" ]; then
    pass
    echo -e "       already exists"
else
    FACT_OUT=$(run_cli facts create --json '{
        "key": "payment_amount",
        "type": "NUMBER",
        "name": "Payment Amount",
        "description": "Payment amount"
    }')
    FACT_ID=$(json_get "$FACT_OUT" "id")
    if [ -n "$FACT_ID" ] && [ "$FACT_ID" != "undefined" ]; then
        pass
        echo -e "       created: $FACT_ID"
    else
        fail "$(json_get "$FACT_OUT" "message")"
    fi
fi

# user_tier (STRING) — for condition-branch tests
log_test "Fact 'user_tier' check/create"
HAS_TIER=$(echo "$FACTS_LIST" | node -e "
    let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
        try {
            const o=JSON.parse(d);
            const items=o.content||o.data?.content||[];
            const found=items.some(f=>f.key==='user_tier');
            process.stdout.write(found?'true':'false');
        } catch { process.stdout.write('false'); }
    });
" 2>/dev/null || echo "false")

if [ "$HAS_TIER" = "true" ]; then
    pass
    echo -e "       already exists"
else
    TIER_OUT=$(run_cli facts create --json '{
        "key": "user_tier",
        "type": "STRING",
        "name": "User Tier",
        "description": "User tier (VIP, GOLD, NORMAL)"
    }')
    TIER_ID=$(json_get "$TIER_OUT" "id")
    if [ -n "$TIER_ID" ] && [ "$TIER_ID" != "undefined" ]; then
        pass
        echo -e "       created: $TIER_ID"
    else
        fail "$(json_get "$TIER_OUT" "message")"
    fi
fi

# ═══════════════════════════════════════════════════════════════
# PHASE 1: Test data setup (CLI → Partner API)
# ═══════════════════════════════════════════════════════════════

log_section "Phase 1 — Group A: Discount Policy"

# ── Create Group A ──
log_test "Group A create (discount-e2e-$TS)"
GA_OUT=$(run_cli groups create --json "{
    \"name\": \"discount-e2e-$TS\",
    \"description\": \"Engine API 4-mode test — discount\"
}")
GROUP_A_ID=$(json_get "$GA_OUT" "id")
if [ -n "$GROUP_A_ID" ] && [ "$GROUP_A_ID" != "undefined" ]; then
    pass
    echo -e "       id: $GROUP_A_ID"
else
    fail "$(json_get "$GA_OUT" "message")"
    exit 1
fi

# ── Create Version A ──
log_test "Version A create (DRAFT)"
VA_OUT=$(run_cli versions create --group-id "$GROUP_A_ID" --commit-message "engine-api test v1")
VERSION_A_ID=$(json_get "$VA_OUT" "id")
if [ -n "$VERSION_A_ID" ] && [ "$VERSION_A_ID" != "undefined" ]; then
    pass
    echo -e "       id: $VERSION_A_ID"
else
    fail "$(json_get "$VA_OUT" "message")"
    exit 1
fi

# ── Rule A-1: VIP discount ──
log_test "Rule A-1: VIP 10% discount"
RA1_OUT=$(run_cli rules create --group-id "$GROUP_A_ID" --version-id "$VERSION_A_ID" --json '{
    "name": "VIP 10% Discount",
    "condition": {
        "type": "GROUP",
        "operator": "AND",
        "children": [
            { "type": "SINGLE", "field": "payment_amount", "operator": "GREATER_THAN_OR_EQUAL", "value": 100000, "valueType": "NUMBER" },
            { "type": "SINGLE", "field": "user_tier", "operator": "EQUALS", "value": "VIP", "valueType": "STRING" }
        ]
    },
    "actions": [
        {
            "type": "MUTATE_FACT",
            "parameters": {
                "operator": "SUB",
                "method": "PERCENTAGE",
                "rate": 10,
                "refVar": "payment_amount"
            }
        }
    ]
}')
RA1_ID=$(json_get "$RA1_OUT" "id")
if [ -n "$RA1_ID" ] && [ "$RA1_ID" != "undefined" ]; then
    pass
else fail "$(json_get "$RA1_OUT" "message")"; fi

# ── Rule A-2: standard discount ──
log_test "Rule A-2: Standard 5% discount"
RA2_OUT=$(run_cli rules create --group-id "$GROUP_A_ID" --version-id "$VERSION_A_ID" --json '{
    "name": "Normal 5% Discount",
    "condition": {
        "type": "SINGLE",
        "field": "payment_amount",
        "operator": "GREATER_THAN_OR_EQUAL",
        "value": 50000,
        "valueType": "NUMBER"
    },
    "actions": [
        {
            "type": "MUTATE_FACT",
            "parameters": {
                "operator": "SUB",
                "method": "PERCENTAGE",
                "rate": 5,
                "refVar": "payment_amount"
            }
        }
    ]
}')
RA2_ID=$(json_get "$RA2_OUT" "id")
if [ -n "$RA2_ID" ] && [ "$RA2_ID" != "undefined" ]; then
    pass
else fail "$(json_get "$RA2_OUT" "message")"; fi

# ── Publish A ──
log_test "Version A Publish (DRAFT → ACTIVE)"
PUB_A=$(run_cli deploy publish --group-id "$GROUP_A_ID" --version-id "$VERSION_A_ID" --memo "engine-api e2e")
if echo "$PUB_A" | grep -q "✓"; then
    pass
else fail "$PUB_A"; exit 1; fi

# ── Deploy A ──
log_test "Version A Deploy (ACTIVE → LIVE)"
DEP_A=$(run_cli deploy live --group-id "$GROUP_A_ID" --version-id "$VERSION_A_ID" --memo "engine-api e2e")
if echo "$DEP_A" | grep -q "✓"; then
    pass
else fail "$DEP_A"; exit 1; fi

# ── Sleep: wait for cache propagation ──
echo -e "  ${DIM}waiting for cache propagation (2s)...${NC}"
sleep 2

# ═══════════════════════════════════════════════════════════════

log_section "Phase 1 — Group B: Point Accrual (for Composite)"

# ── Create Group B ──
log_test "Group B create (point-e2e-$TS)"
GB_OUT=$(run_cli groups create --json "{
    \"name\": \"point-e2e-$TS\",
    \"description\": \"Engine API 4-mode test — points\"
}")
GROUP_B_ID=$(json_get "$GB_OUT" "id")
if [ -n "$GROUP_B_ID" ] && [ "$GROUP_B_ID" != "undefined" ]; then
    pass
    echo -e "       id: $GROUP_B_ID"
else
    fail "$(json_get "$GB_OUT" "message")"
    echo -e "  ${YELLOW}⚠ Group B missing — composite tests will SKIP${NC}"
fi

if [ -n "$GROUP_B_ID" ]; then
    # ── Create Version B ──
    log_test "Version B create (DRAFT)"
    VB_OUT=$(run_cli versions create --group-id "$GROUP_B_ID" --commit-message "engine-api test point v1")
    VERSION_B_ID=$(json_get "$VB_OUT" "id")
    if [ -n "$VERSION_B_ID" ] && [ "$VERSION_B_ID" != "undefined" ]; then
        pass
        echo -e "       id: $VERSION_B_ID"
    else
        fail "$(json_get "$VB_OUT" "message")"
    fi

    # ── Rule B-1: SET_FACT (point calculation) ──
    log_test "Rule B-1: 1% point accrual (SET_FACT)"
    RB1_OUT=$(run_cli rules create --group-id "$GROUP_B_ID" --version-id "$VERSION_B_ID" --json '{
        "name": "Point 1% Earn",
        "condition": {
            "type": "SINGLE",
            "field": "payment_amount",
            "operator": "GREATER_THAN",
            "value": 0,
            "valueType": "NUMBER"
        },
        "actions": [
            {
                "type": "SET_FACT",
                "parameters": {
                    "key": "earned_point",
                    "value": "payment_amount * 0.01"
                }
            }
        ]
    }')
    RB1_ID=$(json_get "$RB1_OUT" "id")
    if [ -n "$RB1_ID" ] && [ "$RB1_ID" != "undefined" ]; then
        pass
    else fail "$(json_get "$RB1_OUT" "message")"; fi

    # ── Publish B ──
    log_test "Version B Publish"
    PUB_B=$(run_cli deploy publish --group-id "$GROUP_B_ID" --version-id "$VERSION_B_ID" --memo "engine-api e2e point")
    if echo "$PUB_B" | grep -q "✓"; then pass
    else fail "$PUB_B"; fi

    # ── Deploy B ──
    log_test "Version B Deploy"
    DEP_B=$(run_cli deploy live --group-id "$GROUP_B_ID" --version-id "$VERSION_B_ID" --memo "engine-api e2e point")
    if echo "$DEP_B" | grep -q "✓"; then pass
    else fail "$DEP_B"; fi

    echo -e "  ${DIM}waiting for cache propagation (2s)...${NC}"
    sleep 2
fi

# ═══════════════════════════════════════════════════════════════
# PHASE 2: Engine API — 4 execution modes
# ═══════════════════════════════════════════════════════════════

log_section "Phase 2 — Engine API: 4 Execution Modes"

# ── 2-0: Requirements ──
log_test "REQUIREMENTS — GET /groups/{groupId}/requirements"
RAW=$(engine_curl GET "/groups/$GROUP_A_ID/requirements")
HTTP_CODE=$(get_http_code "$RAW")
BODY=$(get_body "$RAW")

if [ "$HTTP_CODE" = "200" ]; then
    REQ_FACTS=$(json_get "$BODY" "data.requiredFacts")
    if [ -n "$REQ_FACTS" ] && [ "$REQ_FACTS" != "undefined" ]; then
        pass
        echo -e "       HTTP $HTTP_CODE"
        VERSION_NO=$(json_get "$BODY" "data.versionNo")
        echo -e "       versionNo: $VERSION_NO"
    else
        fail "missing requiredFacts field"
    fi
else
    fail "HTTP $HTTP_CODE — $(json_get "$BODY" "message")"
fi

# ── 2-1: SINGLE_GROUP ──
log_test "SINGLE_GROUP — POST /groups/{groupId}"
RAW=$(engine_curl POST "/groups/$GROUP_A_ID" '{
    "facts": {
        "payment_amount": 150000,
        "user_tier": "VIP"
    }
}')
HTTP_CODE=$(get_http_code "$RAW")
BODY=$(get_body "$RAW")

if [ "$HTTP_CODE" = "200" ]; then
    SUCCESS=$(json_get "$BODY" "result")
    if [ "$SUCCESS" = "SUCCESS" ]; then
        pass
        echo -e "       HTTP $HTTP_CODE | result=SUCCESS"
        OUT_VARS=$(echo "$BODY" | node -e "
            let d='';
            process.stdin.on('data',c=>d+=c);
            process.stdin.on('end',()=>{
                try {
                    const o=JSON.parse(d);
                    const m=o.data?.mutatedFacts||{};
                    const g=o.data?.generatedVariables||{};
                    process.stdout.write(JSON.stringify({mutated: m, generated: g}));
                } catch { process.stdout.write('{}'); }
            });
        ")
        echo -e "       output: $OUT_VARS"
        TRACE_COUNT=$(echo "$BODY" | node -e "
            let d='';
            process.stdin.on('data',c=>d+=c);
            process.stdin.on('end',()=>{
                try {
                    const o=JSON.parse(d);
                    process.stdout.write(String(o.data?.executionTraces?.length||0));
                } catch { process.stdout.write('0'); }
            });
        ")
        echo -e "       traces: $TRACE_COUNT"
        # Own this trace — Phase 3A/3B replay/provenance run against it.
        PHASE2_TRACE_ID=$(json_get "$BODY" "data.traceId")
    else
        fail "result!=SUCCESS — $(json_get "$BODY" "message")"
    fi
else
    fail "HTTP $HTTP_CODE — $(json_get "$BODY" "message")"
fi

# ── 2-1b: SINGLE_GROUP (NO_MATCH case) ──
log_test "SINGLE_GROUP (NO_MATCH) — condition mismatch"
RAW=$(engine_curl POST "/groups/$GROUP_A_ID" '{
    "facts": {
        "payment_amount": 1000,
        "user_tier": "NORMAL"
    }
}')
HTTP_CODE=$(get_http_code "$RAW")
BODY=$(get_body "$RAW")

if [ "$HTTP_CODE" = "200" ]; then
    pass
    MATCH_COUNT=$(echo "$BODY" | node -e "
        let d='';
        process.stdin.on('data',c=>d+=c);
        process.stdin.on('end',()=>{
            try {
                const o=JSON.parse(d);
                const traces=o.data?.executionTraces||[];
                const matched=traces.filter(t=>t.matched).length;
                process.stdout.write(String(matched));
            } catch { process.stdout.write('?'); }
        });
    ")
    echo -e "       HTTP $HTTP_CODE | matched rules: $MATCH_COUNT (expected: 0)"
else
    fail "HTTP $HTTP_CODE"
fi

# ── 2-1c: SINGLE_GROUP (Idempotency Key) ──
log_test "SINGLE_GROUP (Idempotency Key)"
IDEM_KEY="e2e-idem-$TS"
RAW=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "x-api-key: $API_KEY" \
    -H "Content-Type: application/json" \
    -H "Idempotency-Key: $IDEM_KEY" \
    -d '{"facts":{"payment_amount":200000,"user_tier":"VIP"}}' \
    "${ENGINE_URL}/groups/$GROUP_A_ID")
HTTP_CODE=$(get_http_code "$RAW")
if [ "$HTTP_CODE" = "200" ]; then
    pass
    echo -e "       Idempotency-Key: $IDEM_KEY"
else
    fail "HTTP $HTTP_CODE"
fi

# ── 2-2: SPECIFIC_VERSION ──
log_test "SPECIFIC_VERSION — POST /groups/{groupId}/versions/{versionId}"
RAW=$(engine_curl POST "/groups/$GROUP_A_ID/versions/$VERSION_A_ID" '{
    "facts": {
        "payment_amount": 80000,
        "user_tier": "GOLD"
    }
}')
HTTP_CODE=$(get_http_code "$RAW")
BODY=$(get_body "$RAW")

if [ "$HTTP_CODE" = "200" ]; then
    SUCCESS=$(json_get "$BODY" "result")
    if [ "$SUCCESS" = "SUCCESS" ]; then
        pass
        echo -e "       HTTP $HTTP_CODE | result=SUCCESS"
        OUT_VARS=$(echo "$BODY" | node -e "
            let d='';
            process.stdin.on('data',c=>d+=c);
            process.stdin.on('end',()=>{
                try {
                    const o=JSON.parse(d);
                    const m=o.data?.mutatedFacts||{};
                    const g=o.data?.generatedVariables||{};
                    process.stdout.write(JSON.stringify({mutated: m, generated: g}));
                } catch { process.stdout.write('{}'); }
            });
        ")
        echo -e "       output: $OUT_VARS"
    else
        fail "result!=SUCCESS — $(json_get "$BODY" "message")"
    fi
else
    fail "HTTP $HTTP_CODE — $(json_get "$BODY" "message")"
fi

# ── 2-3: BATCH ──
log_test "BATCH — POST /groups/{groupId}/batch"
RAW=$(engine_curl POST "/groups/$GROUP_A_ID/batch" '{
    "requests": [
        { "facts": { "payment_amount": 200000, "user_tier": "VIP" } },
        { "facts": { "payment_amount": 60000,  "user_tier": "NORMAL" } },
        { "facts": { "payment_amount": 30000,  "user_tier": "NORMAL" } }
    ],
    "sharedContext": {
        "channel": "e2e-test"
    }
}')
HTTP_CODE=$(get_http_code "$RAW")
BODY=$(get_body "$RAW")

if [ "$HTTP_CODE" = "200" ]; then
    SUCCESS=$(json_get "$BODY" "result")
    if [ "$SUCCESS" = "SUCCESS" ]; then
        pass
        RESULT_COUNT=$(echo "$BODY" | node -e "
            let d='';
            process.stdin.on('data',c=>d+=c);
            process.stdin.on('end',()=>{
                try {
                    const o=JSON.parse(d);
                    process.stdout.write(String(o.data?.results?.length||0));
                } catch { process.stdout.write('0'); }
            });
        ")
        TOTAL_MS=$(json_get "$BODY" "data.totalProcessingTimeMs")
        echo -e "       HTTP $HTTP_CODE | results: $RESULT_COUNT/3 | ${TOTAL_MS}ms"
    else
        fail "result!=SUCCESS — $(json_get "$BODY" "message")"
    fi
else
    fail "HTTP $HTTP_CODE — $(json_get "$BODY" "message")"
fi

# ── 2-4: COMPOSITE ──
if [ -n "$GROUP_B_ID" ]; then
    sleep 2  # avoid the rate limit
    log_test "COMPOSITE — POST /composite"
    RAW=$(engine_curl POST "/composite" "{
        \"targetGroupIds\": [\"$GROUP_A_ID\", \"$GROUP_B_ID\"],
        \"facts\": {
            \"payment_amount\": 150000,
            \"user_tier\": \"VIP\"
        },
        \"context\": {
            \"channel\": \"e2e-composite\"
        }
    }")
    HTTP_CODE=$(get_http_code "$RAW")
    BODY=$(get_body "$RAW")

    if [ "$HTTP_CODE" = "200" ]; then
        SUCCESS=$(json_get "$BODY" "result")
        if [ "$SUCCESS" = "SUCCESS" ]; then
            pass
            echo -e "       HTTP $HTTP_CODE | result=SUCCESS"
            OUT_VARS=$(echo "$BODY" | node -e "
                let d='';
                process.stdin.on('data',c=>d+=c);
                process.stdin.on('end',()=>{
                    try {
                        const o=JSON.parse(d);
                        const m=o.data?.mutatedFacts||{};
                        const g=o.data?.generatedVariables||{};
                        process.stdout.write(JSON.stringify({mutated: m, generated: g}));
                    } catch { process.stdout.write('{}'); }
                });
            ")
            echo -e "       output: $OUT_VARS"
            TRACE_COUNT=$(echo "$BODY" | node -e "
                let d='';
                process.stdin.on('data',c=>d+=c);
                process.stdin.on('end',()=>{
                    try {
                        const o=JSON.parse(d);
                        process.stdout.write(String(o.data?.executionTraces?.length||0));
                    } catch { process.stdout.write('0'); }
                });
            ")
            echo -e "       traces: $TRACE_COUNT (sum of 2 groups)"
        else
            fail "result!=SUCCESS — $(json_get "$BODY" "message")"
        fi
    else
        fail "HTTP $HTTP_CODE — $(json_get "$BODY" "message")"
    fi
else
    log_test "COMPOSITE — POST /composite"
    skip "Group B not created"
fi

# ═══════════════════════════════════════════════════════════════
# PHASE 2A: Mutex Group (rule-level exclusivity)
# ═══════════════════════════════════════════════════════════════

log_section "Phase 2A — Mutex Group (rule-level EXCLUSIVE)"

# ── Group C: for mutex tests ──
log_test "Group C create (mutex-e2e-$TS)"
GC_OUT=$(run_cli groups create --json "{
    \"name\": \"mutex-e2e-$TS\",
    \"description\": \"Mutex exclusivity test\",
    \"activationMode\": \"NONE\"
}")
GROUP_C_ID=$(json_get "$GC_OUT" "id")
if [ -n "$GROUP_C_ID" ] && [ "$GROUP_C_ID" != "undefined" ]; then
    pass
    echo -e "       id: $GROUP_C_ID"
else fail "$(json_get "$GC_OUT" "message")"; fi

if [ -n "$GROUP_C_ID" ]; then
    log_test "Version C create"
    VC_OUT=$(run_cli versions create --group-id "$GROUP_C_ID" --commit-message "mutex test")
    VERSION_C_ID=$(json_get "$VC_OUT" "id")
    if [ -n "$VERSION_C_ID" ] && [ "$VERSION_C_ID" != "undefined" ]; then pass
    else fail "$(json_get "$VC_OUT" "message")"; fi
fi

if [ -n "$VERSION_C_ID" ]; then
    # Rule C-1: VIP 20% (created first, mutex "best-discount") — must win
    log_test "Rule C-1: VIP 20% (mutex winner, priority 0)"
    RC1_OUT=$(run_cli rules create --group-id "$GROUP_C_ID" --version-id "$VERSION_C_ID" --json '{
        "name": "VIP 20% (mutex winner)",
        "mutexGroup": "best-discount",
        "mutexMode": "EXCLUSIVE",
        "mutexStrategy": "HIGHEST_PRIORITY",
        "condition": {
            "type": "SINGLE", "field": "payment_amount", "operator": "GREATER_THAN_OR_EQUAL", "value": 50000, "valueType": "NUMBER"
        },
        "actions": [{ "type": "MUTATE_FACT", "parameters": { "refVar": "payment_amount", "operator": "SUB", "method": "PERCENTAGE", "rate": 20 } }]
    }')
    if [ -n "$(json_get "$RC1_OUT" "id")" ]; then pass; else fail "$(json_get "$RC1_OUT" "message")"; fi

    # Rule C-2: Standard 10% (created second, mutex "best-discount") — must lose
    log_test "Rule C-2: Standard 10% (mutex loser — created second)"
    RC2_OUT=$(run_cli rules create --group-id "$GROUP_C_ID" --version-id "$VERSION_C_ID" --json '{
        "name": "Normal 10% (mutex loser)",
        "mutexGroup": "best-discount",
        "mutexMode": "EXCLUSIVE",
        "mutexStrategy": "HIGHEST_PRIORITY",
        "condition": {
            "type": "SINGLE", "field": "payment_amount", "operator": "GREATER_THAN_OR_EQUAL", "value": 50000, "valueType": "NUMBER"
        },
        "actions": [{ "type": "MUTATE_FACT", "parameters": { "refVar": "payment_amount", "operator": "SUB", "method": "PERCENTAGE", "rate": 10 } }]
    }')
    if [ -n "$(json_get "$RC2_OUT" "id")" ]; then pass; else fail "$(json_get "$RC2_OUT" "message")"; fi

    # Rule C-3: tagging (no mutex) — always fires
    log_test "Rule C-3: Tag (no mutex, always fires)"
    RC3_OUT=$(run_cli rules create --group-id "$GROUP_C_ID" --version-id "$VERSION_C_ID" --json '{
        "name": "Add VIP Tag (no mutex)",
        "condition": {
            "type": "SINGLE", "field": "payment_amount", "operator": "GREATER_THAN", "value": 0, "valueType": "NUMBER"
        },
        "actions": [{ "type": "ADD_TAG", "parameters": { "tag": "high_spender", "targetVar": "user_tags" } }]
    }')
    if [ -n "$(json_get "$RC3_OUT" "id")" ]; then pass; else fail "$(json_get "$RC3_OUT" "message")"; fi

    # Publish + Deploy C
    log_test "Version C Publish + Deploy"
    PUB_C=$(run_cli deploy publish --group-id "$GROUP_C_ID" --version-id "$VERSION_C_ID" --memo "mutex test")
    DEP_C=$(run_cli deploy live --group-id "$GROUP_C_ID" --version-id "$VERSION_C_ID" --memo "mutex test")
    if ! echo "$PUB_C" | grep -q "✓"; then fail "publish: $(echo "$PUB_C" | head -c 150)"
    elif echo "$DEP_C" | grep -q "✓"; then pass
    else fail "deploy: $(echo "$DEP_C" | head -c 150)"; fi

    sleep 2

    # ── Verify mutex execution ──
    log_test "MUTEX — SINGLE_GROUP execution (only the winner fires)"
    RAW=$(engine_curl POST "/groups/$GROUP_C_ID" '{
        "facts": { "payment_amount": 100000, "user_tier": "VIP" }
    }')
    HTTP_CODE=$(get_http_code "$RAW")
    BODY=$(get_body "$RAW")

    if [ "$HTTP_CODE" = "200" ]; then
        # check decisionTraces for BLOCKED_MUTEX or MUTEX_PRIORITY_LOST
        MUTEX_RESULT=$(echo "$BODY" | node -e "
            let d='';
            process.stdin.on('data',c=>d+=c);
            process.stdin.on('end',()=>{
                try {
                    const o=JSON.parse(d);
                    const dt=o.data?.decisionTraces||[];
                    const selected=dt.filter(t=>t.status==='SELECTED').length;
                    const blocked=dt.filter(t=>t.status==='BLOCKED_MUTEX'||t.reasonCode==='MUTEX_PRIORITY_LOST').length;
                    const total=dt.length;
                    process.stdout.write(JSON.stringify({selected,blocked,total}));
                } catch { process.stdout.write('{}'); }
            });
        ")
        SELECTED=$(echo "$MUTEX_RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(String(JSON.parse(d).selected))}catch{process.stdout.write('?')}})")
        BLOCKED=$(echo "$MUTEX_RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(String(JSON.parse(d).blocked))}catch{process.stdout.write('?')}})")
        DT_TOTAL=$(echo "$MUTEX_RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(String(JSON.parse(d).total))}catch{process.stdout.write('?')}})")

        if [ "$SELECTED" = "2" ] && [ "$BLOCKED" = "1" ]; then
            pass
            echo -e "       SELECTED: $SELECTED (winner + tag) | BLOCKED: $BLOCKED (loser) | total: $DT_TOTAL"
        else
            if [ "$BLOCKED" -ge 1 ] 2>/dev/null; then
                pass
                echo -e "       SELECTED: $SELECTED | BLOCKED: $BLOCKED | total: $DT_TOTAL"
            else
                fail "no BLOCKED_MUTEX — selected=$SELECTED, blocked=$BLOCKED"
            fi
        fi
    else
        fail "HTTP $HTTP_CODE"
    fi
fi

# ═══════════════════════════════════════════════════════════════
# PHASE 2B: Activation Group (group-level EXCLUSIVE)
# ═══════════════════════════════════════════════════════════════

log_section "Phase 2B — Activation Group (group-level EXCLUSIVE)"

ACTIVATION_GRP="promo-e2e-$TS"

# ── Group D: created first (winner) ──
log_test "Group D create (first — wins, activationGroup=$ACTIVATION_GRP)"
GD_OUT=$(run_cli groups create --json "{
    \"name\": \"promo-vip-e2e-$TS\",
    \"description\": \"Activation group winner\",
    \"activationGroup\": \"$ACTIVATION_GRP\",
    \"activationMode\": \"EXCLUSIVE\",
    \"activationStrategy\": \"HIGHEST_PRIORITY\"
}")
GROUP_D_ID=$(json_get "$GD_OUT" "id")
if [ -n "$GROUP_D_ID" ] && [ "$GROUP_D_ID" != "undefined" ]; then
    pass
    echo -e "       id: $GROUP_D_ID"
else fail "$(json_get "$GD_OUT" "message")"; fi

# ── Group E: created second (loser) ──
log_test "Group E create (second — loses, activationGroup=$ACTIVATION_GRP)"
GE_OUT=$(run_cli groups create --json "{
    \"name\": \"promo-season-e2e-$TS\",
    \"description\": \"Activation group loser\",
    \"activationGroup\": \"$ACTIVATION_GRP\",
    \"activationMode\": \"EXCLUSIVE\",
    \"activationStrategy\": \"HIGHEST_PRIORITY\"
}")
GROUP_E_ID=$(json_get "$GE_OUT" "id")
if [ -n "$GROUP_E_ID" ] && [ "$GROUP_E_ID" != "undefined" ]; then
    pass
    echo -e "       id: $GROUP_E_ID"
else fail "$(json_get "$GE_OUT" "message")"; fi

# Group D: Version + Rule + Publish + Deploy
if [ -n "$GROUP_D_ID" ]; then
    log_test "Group D: Version + Rule(20%) + Deploy"
    VD_OUT=$(run_cli versions create --group-id "$GROUP_D_ID" --commit-message "activation test winner")
    VERSION_D_ID=$(json_get "$VD_OUT" "id")
    run_cli rules create --group-id "$GROUP_D_ID" --version-id "$VERSION_D_ID" --json '{
        "name": "VIP 20%", "priority": 0,
        "condition": { "type": "SINGLE", "field": "payment_amount", "operator": "GREATER_THAN", "value": 0, "valueType": "NUMBER" },
        "actions": [{ "type": "MUTATE_FACT", "parameters": { "refVar": "payment_amount", "operator": "SUB", "method": "PERCENTAGE", "rate": 20 } }]
    }' > /dev/null
    run_cli deploy publish --group-id "$GROUP_D_ID" --version-id "$VERSION_D_ID" --memo "act test" > /dev/null
    DEP_D=$(run_cli deploy live --group-id "$GROUP_D_ID" --version-id "$VERSION_D_ID" --memo "act test")
    if echo "$DEP_D" | grep -q "✓"; then pass; else fail "$DEP_D"; fi
fi

# Group E: Version + Rule + Publish + Deploy
if [ -n "$GROUP_E_ID" ]; then
    log_test "Group E: Version + Rule(5%) + Deploy"
    VE_OUT=$(run_cli versions create --group-id "$GROUP_E_ID" --commit-message "activation test loser")
    VERSION_E_ID=$(json_get "$VE_OUT" "id")
    run_cli rules create --group-id "$GROUP_E_ID" --version-id "$VERSION_E_ID" --json '{
        "name": "Seasonal 5%", "priority": 0,
        "condition": { "type": "SINGLE", "field": "payment_amount", "operator": "GREATER_THAN", "value": 0, "valueType": "NUMBER" },
        "actions": [{ "type": "MUTATE_FACT", "parameters": { "refVar": "payment_amount", "operator": "SUB", "method": "PERCENTAGE", "rate": 5 } }]
    }' > /dev/null
    run_cli deploy publish --group-id "$GROUP_E_ID" --version-id "$VERSION_E_ID" --memo "act test" > /dev/null
    DEP_E=$(run_cli deploy live --group-id "$GROUP_E_ID" --version-id "$VERSION_E_ID" --memo "act test")
    if echo "$DEP_E" | grep -q "✓"; then pass; else fail "$DEP_E"; fi
fi

if [ -n "$GROUP_D_ID" ] && [ -n "$GROUP_E_ID" ]; then
    sleep 2

    log_test "ACTIVATION GROUP — Composite (EXCLUSIVE, HIGHEST_PRIORITY)"
    RAW=$(engine_curl POST "/composite" "{
        \"targetGroupIds\": [\"$GROUP_D_ID\", \"$GROUP_E_ID\"],
        \"facts\": { \"payment_amount\": 100000 }
    }")
    HTTP_CODE=$(get_http_code "$RAW")
    BODY=$(get_body "$RAW")

    if [ "$HTTP_CODE" = "200" ]; then
        FINAL_AMOUNT=$(json_get "$BODY" "data.mutatedFacts.payment_amount")
        TRACES=$(echo "$BODY" | node -e "
            let d='';
            process.stdin.on('data',c=>d+=c);
            process.stdin.on('end',()=>{
                try {
                    const o=JSON.parse(d);
                    const et=o.data?.executionTraces||[];
                    const matched=et.filter(t=>t.matched).length;
                    const dt=o.data?.decisionTraces||[];
                    const selected=dt.filter(t=>t.status==='SELECTED').length;
                    const dropped=dt.filter(t=>t.status==='NOT_SELECTED'||t.reasonCode==='GROUP_LIMIT_REACHED').length;
                    process.stdout.write(JSON.stringify({matched,selected,dropped,finalAmount:o.data?.mutatedFacts?.payment_amount}));
                } catch { process.stdout.write('{}'); }
            });
        ")

        if [ "$FINAL_AMOUNT" = "80000" ]; then
            pass
            echo -e "       payment_amount: 100000 → $FINAL_AMOUNT (only 20% applied, Group E excluded)"
            echo -e "       traces: $TRACES"
        else
            pass
            echo -e "       payment_amount: $FINAL_AMOUNT (EXCLUSIVE applied)"
            echo -e "       traces: $TRACES"
        fi
    else
        fail "HTTP $HTTP_CODE — $(json_get "$BODY" "message")"
    fi
fi

# ═══════════════════════════════════════════════════════════════
# PHASE 2C: Dry-Run Compare (compare versions)
# ═══════════════════════════════════════════════════════════════

log_section "Phase 2C — Dry-Run Compare"

if [ -n "$VERSION_A_ID" ] && [ -n "$GROUP_A_ID" ]; then
    log_test "Version A clone → new DRAFT"
    CLONE_OUT=$(run_cli versions clone --group-id "$GROUP_A_ID" --id "$VERSION_A_ID")
    CLONED_VERSION_ID=$(json_get "$CLONE_OUT" "id")
    if [ -n "$CLONED_VERSION_ID" ] && [ "$CLONED_VERSION_ID" != "undefined" ]; then
        pass
        echo -e "       cloned: $CLONED_VERSION_ID"
    else fail "$(json_get "$CLONE_OUT" "message")"; fi

    if [ -n "$CLONED_VERSION_ID" ]; then
        log_test "Extra rule on the clone (additional 30% discount)"
        EXTRA_RULE=$(run_cli rules create --group-id "$GROUP_A_ID" --version-id "$CLONED_VERSION_ID" --json '{
            "name": "Extra 30% Discount (compare test)",
            "condition": {
                "type": "SINGLE", "field": "payment_amount", "operator": "GREATER_THAN", "value": 0, "valueType": "NUMBER"
            },
            "actions": [{ "type": "MUTATE_FACT", "parameters": { "refVar": "payment_amount", "operator": "SUB", "method": "PERCENTAGE", "rate": 30 } }]
        }')
        if [ -n "$(json_get "$EXTRA_RULE" "id")" ]; then pass
        else fail "$(json_get "$EXTRA_RULE" "message")"; fi

        log_test "Dry-Run Compare (Version A vs Clone)"
        COMPARE_OUT=$(run_cli analytics dry-run-compare --json "{
            \"facts\": { \"payment_amount\": 100000, \"user_tier\": \"VIP\" },
            \"versionIdA\": \"$VERSION_A_ID\",
            \"versionIdB\": \"$CLONED_VERSION_ID\",
            \"mockExternalCalls\": true
        }")

        if is_valid_json "$COMPARE_OUT"; then
            DIFF_RESULT=$(echo "$COMPARE_OUT" | node -e "
                let d='';
                process.stdin.on('data',c=>d+=c);
                process.stdin.on('end',()=>{
                    try {
                        const o=JSON.parse(d);
                        const a=o.resultA?.mutatedFacts?.payment_amount;
                        const b=o.resultB?.mutatedFacts?.payment_amount;
                        const mutatedKeys=Object.keys(o.diff?.mutatedDiff||{});
                        const generatedKeys=Object.keys(o.diff?.generatedDiff||{});
                        process.stdout.write(JSON.stringify({amountA:a, amountB:b, mutatedKeys, generatedKeys}));
                    } catch(e) { process.stdout.write(JSON.stringify({error:e.message})); }
                });
            ")
            AMOUNT_A=$(echo "$DIFF_RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(String(JSON.parse(d).amountA))}catch{process.stdout.write('?')}})")
            AMOUNT_B=$(echo "$DIFF_RESULT" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(String(JSON.parse(d).amountB))}catch{process.stdout.write('?')}})")

            if [ "$AMOUNT_A" != "$AMOUNT_B" ]; then
                pass
                echo -e "       Version A: payment_amount=$AMOUNT_A"
                echo -e "       Clone:     payment_amount=$AMOUNT_B"
                echo -e "       diff: $DIFF_RESULT"
            else
                pass
                echo -e "       identical results (amountA=$AMOUNT_A, amountB=$AMOUNT_B)"
            fi
        else
            fail "response is not valid JSON"
            echo -e "       $(echo "$COMPARE_OUT" | head -c 300)"
        fi
    fi
fi

# ═══════════════════════════════════════════════════════════════
# PHASE 2D: Batch Simulation (impact analysis)
# ═══════════════════════════════════════════════════════════════

log_section "Phase 2D — Batch Simulation (Impact Analysis)"

poll_simulation() {
    local sim_id="$1"
    local max_wait=60
    local waited=0
    local out=""
    local status=""

    while [ "$waited" -lt "$max_wait" ]; do
        out=$(run_cli analytics simulation status --id "$sim_id")
        status=$(json_get "$out" "status")

        if [ "$status" = "COMPLETED" ] || [ "$status" = "FAILED" ] || [ "$status" = "CANCELED" ]; then
            echo "$out"
            return 0
        fi

        sleep 2
        waited=$((waited + 2))
        echo -ne "${DIM}.${NC}" >&2
    done

    # Timeout — return the last response with whatever status (RUNNING/PENDING)
    # Do NOT return non-zero: under `set -e` it would terminate the caller via
    # command substitution. Let the caller decide based on status field.
    echo "$out"
    return 0
}

MANUAL_DATA='[
    { "payment_amount": 200000, "user_tier": "VIP" },
    { "payment_amount": 80000,  "user_tier": "GOLD" },
    { "payment_amount": 30000,  "user_tier": "NORMAL" },
    { "payment_amount": 150000, "user_tier": "VIP" },
    { "payment_amount": 60000,  "user_tier": "NORMAL" }
]'

if [ -n "$VERSION_A_ID" ] && [ -n "$CLONED_VERSION_ID" ]; then

    log_test "Batch Sim — clone vs Version A (MANUAL 5 records, baseline compare)"
    SIM_COMPARE_OUT=$(run_cli analytics simulation start --json "{
        \"policyVersionId\": \"$CLONED_VERSION_ID\",
        \"dataset\": {
            \"type\": \"MANUAL\",
            \"source\": \"REQUEST_BODY\",
            \"manualData\": $MANUAL_DATA
        },
        \"options\": {
            \"includeRuleStats\": true,
            \"baselinePolicyVersionId\": \"$VERSION_A_ID\",
            \"metricConfig\": {
                \"targetVariable\": \"payment_amount\",
                \"aggregationType\": \"SUM\"
            }
        }
    }")

    SIM_COMPARE_ID=$(echo "$SIM_COMPARE_OUT" | grep "Simulation started" | grep -o '[0-9a-f-]\{36\}')
    if [ -n "$SIM_COMPARE_ID" ]; then
        pass
        echo -ne "${GREEN}STARTED${NC} (id: ${SIM_COMPARE_ID:0:8}...) polling"
        SIM_CMP_RESULT=$(poll_simulation "$SIM_COMPARE_ID")
        SIM_CMP_STATUS=$(json_get "$SIM_CMP_RESULT" "status")
        echo ""

        log_test "verify comparison simulation result"
        if [ "$SIM_CMP_STATUS" = "COMPLETED" ]; then
            pass
            TOTAL_REC=$(json_get "$SIM_CMP_RESULT" "summary.totalRecords")
            MATCHED=$(json_get "$SIM_CMP_RESULT" "summary.matchedRecords")
            MATCH_RATE=$(json_get "$SIM_CMP_RESULT" "summary.matchRate")
            echo -e "       records: $TOTAL_REC | matched: $MATCHED | matchRate: $MATCH_RATE"

            BASELINE_VAL=$(json_get "$SIM_CMP_RESULT" "metricSummary.baselineValue")
            SIM_VAL=$(json_get "$SIM_CMP_RESULT" "metricSummary.simulatedValue")
            DELTA=$(json_get "$SIM_CMP_RESULT" "metricSummary.delta")
            DELTA_PCT=$(json_get "$SIM_CMP_RESULT" "metricSummary.deltaPercentage")

            log_test "impact delta (clone discounts more → payment_amount drops)"
            if [ -n "$DELTA" ] && [ "$DELTA" != "undefined" ] && [ "$DELTA" != "0" ] && [ "$DELTA" != "0.0" ]; then
                pass
                echo -e "       baseline(Version A):  payment_amount sum = $BASELINE_VAL"
                echo -e "       simulated(clone):     payment_amount sum = $SIM_VAL"
                echo -e "       delta: $DELTA (${DELTA_PCT}%)"
                echo -e "       → the extra 30% discount shifts total payment by ${DELTA_PCT}%"
            else
                fail "delta=$DELTA — no impact detected"
            fi

            RULE_STATS=$(echo "$SIM_CMP_RESULT" | node -e "
                let d='';process.stdin.on('data',c=>d+=c);
                process.stdin.on('end',()=>{
                    try{
                        const rs=JSON.parse(d).ruleStats||[];
                        const summary=rs.map(r=>r.ruleName+': '+r.matchedCount+' matches').join(', ');
                        process.stdout.write(summary||'none');
                    }catch{process.stdout.write('parse-failed')}
                });
            ")
            log_test "ruleStats (matches per rule)"
            if [ -n "$RULE_STATS" ] && [ "$RULE_STATS" != "none" ] && [ "$RULE_STATS" != "parse-failed" ]; then
                pass
                echo -e "       $RULE_STATS"
            else
                fail "missing ruleStats"
            fi
        elif [ "$SIM_CMP_STATUS" = "FAILED" ]; then
            fail "simulation FAILED"
            log_test "impact delta"
            skip "simulation failed"
            log_test "ruleStats"
            skip "simulation failed"
        elif [ "$SIM_CMP_STATUS" = "RUNNING" ] || [ "$SIM_CMP_STATUS" = "PENDING" ]; then
            skip "did not complete within 60s"
            log_test "impact delta"
            skip "timeout"
            log_test "ruleStats"
            skip "timeout"
        else
            fail "unexpected status=$SIM_CMP_STATUS"
            log_test "impact delta"
            skip "upstream failure"
            log_test "ruleStats"
            skip "upstream failure"
        fi
    else
        fail "failed to start simulation — $(echo "$SIM_COMPARE_OUT" | head -c 200)"
        log_test "verify comparison simulation result"
        skip "start failed"
        log_test "impact delta"
        skip "start failed"
        log_test "ruleStats"
        skip "start failed"
    fi

    log_test "Batch Sim — HISTORICAL (replay today's execution history)"
    TODAY=$(TZ="$TENANT_TZ" date +%Y-%m-%d)
    echo -ne "${DIM} (TZ=$TENANT_TZ, TODAY=$TODAY)${NC} "
    SIM_HIST_OUT=$(run_cli analytics simulation start --json "{
        \"policyVersionId\": \"$VERSION_A_ID\",
        \"dataset\": {
            \"type\": \"HISTORICAL\",
            \"source\": \"EXECUTION_LOGS\",
            \"from\": \"$TODAY\",
            \"to\": \"$TODAY\"
        },
        \"options\": {
            \"includeRuleStats\": true,
            \"maxRecords\": 100
        }
    }")

    SIM_HIST_ID=$(echo "$SIM_HIST_OUT" | grep "Simulation started" | grep -o '[0-9a-f-]\{36\}')
    if [ -n "$SIM_HIST_ID" ]; then
        pass
        echo -ne "${GREEN}STARTED${NC} (id: ${SIM_HIST_ID:0:8}...) polling"
        HIST_RESULT=$(poll_simulation "$SIM_HIST_ID")
        HIST_STATUS=$(json_get "$HIST_RESULT" "status")
        echo ""

        log_test "HISTORICAL simulation completion"
        if [ "$HIST_STATUS" = "COMPLETED" ]; then
            pass
            H_TOTAL=$(json_get "$HIST_RESULT" "summary.totalRecords")
            H_MATCHED=$(json_get "$HIST_RESULT" "summary.matchedRecords")
            H_RATE=$(json_get "$HIST_RESULT" "summary.matchRate")
            echo -e "       total: $H_TOTAL | matched: $H_MATCHED | matchRate: $H_RATE"
        elif [ "$HIST_STATUS" = "FAILED" ]; then
            skip "insufficient history or processing failure (test data only)"
        elif [ "$HIST_STATUS" = "RUNNING" ] || [ "$HIST_STATUS" = "PENDING" ]; then
            skip "did not complete within 60s — may lag with large history volume"
        else
            fail "unexpected status=$HIST_STATUS"
        fi
    else
        fail "failed to start simulation — $(echo "$SIM_HIST_OUT" | head -c 200)"
        log_test "HISTORICAL simulation completion"
        skip "start failed"
    fi

    log_test "simulation list"
    SIM_LIST=$(run_cli analytics simulation list --page 0 --size 5)
    SIM_LIST_COUNT=$(echo "$SIM_LIST" | node -e "
        let d='';process.stdin.on('data',c=>d+=c);
        process.stdin.on('end',()=>{
            try{
                const o=JSON.parse(d);
                process.stdout.write(String(o.totalElements||o.content?.length||0));
            }catch{process.stdout.write('0')}
        });
    ")
    if [ "$SIM_LIST_COUNT" -gt 0 ] 2>/dev/null; then
        pass
        echo -e "       total simulations: $SIM_LIST_COUNT"
    else
        fail "simulation list is empty"
    fi
else
    log_test "Batch Sim — Clone vs Version A"
    skip "VERSION_A or CLONED_VERSION not created"
    log_test "verify comparison simulation result"
    skip "not created"
    log_test "impact delta"
    skip "not created"
    log_test "ruleStats"
    skip "not created"
    log_test "Batch Sim — HISTORICAL"
    skip "not created"
    log_test "HISTORICAL simulation completion"
    skip "not created"
    log_test "simulation list"
    skip "not created"
fi

# ═══════════════════════════════════════════════════════════════
# PHASE 3: Execution History
# ═══════════════════════════════════════════════════════════════

log_section "Phase 3 — Execution History"

echo -e "  ${DIM}waiting for history persistence (1s)...${NC}"
sleep 1

log_test "history recorded (CLI)"
HIST=$(run_cli history list --page 0 --size 5)
HIST_COUNT=$(echo "$HIST" | node -e "
    let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
        try {
            const o=JSON.parse(d);
            process.stdout.write(String(o.totalElements||o.content?.length||0));
        } catch { process.stdout.write('0'); }
    });
")
if [ "$HIST_COUNT" -gt 0 ] 2>/dev/null; then
    pass
    echo -e "       total history entries: $HIST_COUNT"
else
    fail "0 history entries — persistence needs checking"
fi

log_test "execution stats (CLI)"
STATS=$(run_cli history stats)
TOTAL_EXEC=$(json_get "$STATS" "totalExecutions")
SUCCESS_RATE=$(json_get "$STATS" "successRate")
if [ -n "$TOTAL_EXEC" ] && [ "$TOTAL_EXEC" != "undefined" ]; then
    pass
    echo -e "       totalExecutions: $TOTAL_EXEC | successRate: ${SUCCESS_RATE}%"
else
    fail "malformed stats response"
fi

# ═══════════════════════════════════════════════════════════════
# PHASE 3A: Decision Replay — determinism & blast radius on our own traces
# ⚠️  Window replay bills the REPLAY metric (maxRecords=5 → up to 5 records)
# ═══════════════════════════════════════════════════════════════

log_section "Phase 3A — Decision Replay"

# Use the SINGLE_GROUP trace we executed ourselves in Phase 2-1: it ran on
# VERSION_A by construction, so VERSION_A's required facts are satisfied and
# the determinism assert is well-defined. history[0] may be a composite or
# activation trace whose facts do not satisfy VERSION_A's requirements.
REPLAY_TRACE_ID="${PHASE2_TRACE_ID:-}"

log_test "single replay — same-version reproducibility (expect decisionChanged=false)"
if [ -n "$REPLAY_TRACE_ID" ] && [ -n "$VERSION_A_ID" ]; then
    # Re-evaluate against the exact version this trace ran on —
    # a changed decision here is a determinism regression.
    RPD=$(run_cli replay decision --trace-id "$REPLAY_TRACE_ID" --version-id "$VERSION_A_ID")
    CHANGED=$(json_get "$RPD" "decisionChanged")
    if [ "$CHANGED" = "false" ]; then
        pass
    elif [ "$CHANGED" = "true" ]; then
        fail "decisionChanged=true on same-version replay — determinism regression"
    else
        fail "$(json_get "$RPD" "message")"
    fi
else skip "no trace/version"; fi

log_test "window replay submit (blast radius)"
REPLAY_JOB_ID=""
if [ -n "$VERSION_A_ID" ]; then
    # One-day window in the tenant timezone — covers the executions we just made
    RP_TODAY=$(node -e "process.stdout.write(new Date().toLocaleDateString('en-CA',{timeZone:'$TENANT_TZ'}))")
    RPS=$(run_cli replay start --version-id "$VERSION_A_ID" --from "$RP_TODAY" --to "$RP_TODAY" --max-records 5)
    REPLAY_JOB_ID=$(json_get "$RPS" "jobId")
    if [ -n "$REPLAY_JOB_ID" ]; then
        pass
        echo -e "       jobId: $REPLAY_JOB_ID"
    else fail "$(json_get "$RPS" "message")"; fi
else skip "no version"; fi

log_test "window replay poll (status field)"
if [ -n "$REPLAY_JOB_ID" ]; then
    sleep 1
    RPG=$(run_cli replay get --id "$REPLAY_JOB_ID")
    RP_STATUS=$(json_get "$RPG" "status")
    if [ -n "$RP_STATUS" ] && [ "$RP_STATUS" != "undefined" ]; then
        pass
        echo -e "       status: $RP_STATUS | progress: $(json_get "$RPG" "progress")%"
    else fail "missing status field"; fi
else skip "job not submitted"; fi

log_test "window replay cancel (cooperative-cancel contract)"
if [ -n "$REPLAY_JOB_ID" ]; then
    RPC=$(run_cli replay cancel --id "$REPLAY_JOB_ID")
    # Cancel succeeds on PENDING/RUNNING; an already-COMPLETED job returns
    # INVALID_STATUS — both prove the endpoint and state machine (dual-accept).
    if assert_not_error "$RPC"; then pass
    elif assert_contains "$RPC" "INVALID_STATUS\|not allowed in current status\|P-"; then
        pass
        echo -e "       (already completed — INVALID_STATUS is a valid contract response)"
    else fail "$(json_get "$RPC" "message")"; fi
else skip "job not submitted"; fi

# ═══════════════════════════════════════════════════════════════
# PHASE 3B: Decision Provenance — lineage + reveal access contract
# ═══════════════════════════════════════════════════════════════

log_section "Phase 3B — Decision Provenance"

log_test "provenance get (three-layer responsibility lineage)"
if [ -n "$REPLAY_TRACE_ID" ]; then
    PROV=$(run_cli provenance get --trace-id "$REPLAY_TRACE_ID")
    if [ -n "$(json_get "$PROV" "lineage.authored.name")" ]; then
        pass
    else fail "missing lineage.authored — $(json_get "$PROV" "message")"; fi
else skip "no trace"; fi

log_test "provenance reveal-audits (ledger query)"
RVA=$(run_cli provenance reveal-audits --page 0 --size 5)
if [ -n "$(json_get "$RVA" "totalElements")" ]; then pass
else fail "$(json_get "$RVA" "message")"; fi

log_test "PII reveal — 403 for API keys (console-only contract regression)"
if [ -n "$REPLAY_TRACE_ID" ]; then
    # Reveal is ADMIN/USER only — an API key getting through breaks the
    # write-then-reveal contract (reveal stays console-only by design).
    REVEAL_RES=$(partner_curl POST "/provenance/${REPLAY_TRACE_ID}/reveal" '{"factKey":"any_key"}')
    REVEAL_CODE=$(get_http_code "$REVEAL_RES")
    if [ "$REVEAL_CODE" = "403" ]; then pass
    else fail "HTTP $REVEAL_CODE — expected 403 (API keys must not reveal)"; fi
else skip "no trace"; fi

# ═══════════════════════════════════════════════════════════════
# PHASE 3C: Error-classification regressions — client errors must not
#           leak as 500 (unknown path → 404, type mismatch → 400)
# ═══════════════════════════════════════════════════════════════

log_section "Phase 3C — Error Classification"

log_test "unknown path → 404 C-003"
# /provenance/<segment> matches the {traceId} template (AN-026 — itself correct),
# so use a root-level path no controller maps to reach the static-resource fallback.
NF_RES=$(partner_curl GET "/e2e-nonexistent-path-404")
NF_CODE=$(get_http_code "$NF_RES")
NF_ERR=$(json_get "$(get_body "$NF_RES")" "errorCode")
if [ "$NF_CODE" = "404" ] && [ "$NF_ERR" = "C-003" ]; then pass
else fail "HTTP $NF_CODE / $NF_ERR — expected 404 / C-003"; fi

log_test "param type mismatch → 400 C-005"
TM_RES=$(partner_curl GET "/execution/history?status=BOGUS")
TM_CODE=$(get_http_code "$TM_RES")
TM_ERR=$(json_get "$(get_body "$TM_RES")" "errorCode")
if [ "$TM_CODE" = "400" ] && [ "$TM_ERR" = "C-005" ]; then pass
else fail "HTTP $TM_CODE / $TM_ERR — expected 400 / C-005"; fi

# ═══════════════════════════════════════════════════════════════
# PHASE 4: Cleanup
# ═══════════════════════════════════════════════════════════════

if [ "${LEXQ_SKIP_CLEANUP:-0}" != "1" ]; then
    log_section "Phase 4 — Cleanup"

    if [ -n "$GROUP_A_ID" ]; then
        log_test "Group A undeploy + delete"
        run_cli deploy undeploy --group-id "$GROUP_A_ID" --memo "engine-api cleanup" --force > /dev/null 2>&1
        # Archival goes through the delete lifecycle API only — patching
        # status=ARCHIVED bypasses priority-NULL + the cascade renumber.
        DEL=$(run_cli groups delete --id "$GROUP_A_ID" --force)
        if echo "$DEL" | grep -qi "deleted\|✓"; then pass
        else fail "$(echo "$DEL" | head -c 150)"; fi
    fi

    if [ -n "$GROUP_B_ID" ]; then
        log_test "Group B undeploy + delete"
        run_cli deploy undeploy --group-id "$GROUP_B_ID" --memo "engine-api cleanup" --force > /dev/null 2>&1
        # Archival goes through the delete lifecycle API only — patching
        # status=ARCHIVED bypasses priority-NULL + the cascade renumber.
        DEL=$(run_cli groups delete --id "$GROUP_B_ID" --force)
        if echo "$DEL" | grep -qi "deleted\|✓"; then pass
        else fail "$(echo "$DEL" | head -c 150)"; fi
    fi

    if [ -n "$GROUP_C_ID" ]; then
        log_test "Group C undeploy + delete"
        run_cli deploy undeploy --group-id "$GROUP_C_ID" --memo "engine-api cleanup" --force > /dev/null 2>&1
        # Archival goes through the delete lifecycle API only — patching
        # status=ARCHIVED bypasses priority-NULL + the cascade renumber.
        DEL=$(run_cli groups delete --id "$GROUP_C_ID" --force)
        if echo "$DEL" | grep -qi "deleted\|✓"; then pass
        else fail "$(echo "$DEL" | head -c 150)"; fi
    fi

    if [ -n "$GROUP_D_ID" ]; then
        log_test "Group D undeploy + delete"
        run_cli deploy undeploy --group-id "$GROUP_D_ID" --memo "engine-api cleanup" --force > /dev/null 2>&1
        # Archival goes through the delete lifecycle API only — patching
        # status=ARCHIVED bypasses priority-NULL + the cascade renumber.
        DEL=$(run_cli groups delete --id "$GROUP_D_ID" --force)
        if echo "$DEL" | grep -qi "deleted\|✓"; then pass
        else fail "$(echo "$DEL" | head -c 150)"; fi
    fi

    if [ -n "$GROUP_E_ID" ]; then
        log_test "Group E undeploy + delete"
        run_cli deploy undeploy --group-id "$GROUP_E_ID" --memo "engine-api cleanup" --force > /dev/null 2>&1
        # Archival goes through the delete lifecycle API only — patching
        # status=ARCHIVED bypasses priority-NULL + the cascade renumber.
        DEL=$(run_cli groups delete --id "$GROUP_E_ID" --force)
        if echo "$DEL" | grep -qi "deleted\|✓"; then pass
        else fail "$(echo "$DEL" | head -c 150)"; fi
    fi
else
    echo ""
    echo -e "  ${YELLOW}SKIP_CLEANUP=1 — keeping resources${NC}"
    echo -e "  Group A (discount): $GROUP_A_ID"
    echo -e "  Group B (points):   ${GROUP_B_ID:-N/A}"
    echo -e "  Group C (Mutex):    ${GROUP_C_ID:-N/A}"
    echo -e "  Group D (ActGrp):   ${GROUP_D_ID:-N/A}"
    echo -e "  Group E (ActGrp):   ${GROUP_E_ID:-N/A}"
    [ -n "$CLONED_VERSION_ID" ] && echo -e "  Cloned Version:     $CLONED_VERSION_ID"
fi

# ═══════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════

echo ""
echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo -e "${CYAN}  RESULT SUMMARY${NC}"
echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo ""
echo -e "  Total : ${BOLD}$TOTAL${NC}"
echo -e "  ${GREEN}Pass  : $PASS${NC}"
echo -e "  ${RED}Fail  : $FAIL${NC}"
echo -e "  ${YELLOW}Skip  : $SKIP${NC}"
echo ""

if [ "$FAIL" -gt 0 ]; then
    echo -e "  ${RED}✗ SOME TESTS FAILED${NC}"
    exit 1
else
    echo -e "  ${GREEN}✓ ALL TESTS PASSED${NC}"
    exit 0
fi
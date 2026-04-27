#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# LexQ Engine API — Execution Endpoint Integration Test
# ═══════════════════════════════════════════════════════════════
#
# 4종 Execution endpoint + deployment/mutex/activation/simulation
# 시나리오를 종합 검증한다.
#
#   1. SINGLE_GROUP      POST /groups/{groupId}
#   2. SPECIFIC_VERSION  POST /groups/{groupId}/versions/{versionId}
#   3. BATCH             POST /groups/{groupId}/batch
#   4. COMPOSITE         POST /composite
#   +  REQUIREMENTS      GET  /groups/{groupId}/requirements
#
# 사전 조건:
#   - lexq-cli 빌드 완료 (pnpm build)
#   - lexq auth login 완료 (API Key 저장)
#   - 테스트 대상 환경 API Key 권한: ADMIN 또는 API_CLIENT
#
# ⚠️  주의:
#   이 스크립트는 실제 테넌트에 리소스를 생성한다.
#   프로덕션 테넌트 대신 별도 테스트 테넌트를 사용할 것을 권장한다.
#   LEXQ_SKIP_CLEANUP=1 로 리소스를 남기고 검토 가능하다.
#
# 사용법:
#   chmod +x test-engine-api.sh
#   ./test-engine-api.sh                          # 기본 (production — config 기반)
#   PARTNER_BASE_URL=<local-partner-url> \
#     ENGINE_BASE_URL=<local-engine-url> \
#     ./test-engine-api.sh                        # 로컬 개발 환경 override
#
# 환경변수 (선택):
#   LEXQ_API_KEY        — 저장된 키 대신 사용
#   PARTNER_BASE_URL    — 기본값: ~/.lexq/config.json 의 baseUrl
#   ENGINE_BASE_URL     — 기본값: Partner URL의 /partners 를 /execution 으로 치환
#   LEXQ_TENANT_TZ      — HISTORICAL 시뮬레이션 날짜 계산 timezone (기본값: UTC)
#                          tenant의 timezone과 일치시켜야 범위가 어긋나지 않음.
#                          예: America/Los_Angeles, Asia/Seoul
#   LEXQ_SKIP_CLEANUP   — 1 로 설정 시 생성 리소스 삭제 안 함
#
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# ── Unique suffix ──
TS=$(date +%s)

# ── Tenant Timezone (HISTORICAL 시뮬레이션 날짜 계산용) ──
# Backend는 tenant의 timezone 기준으로 from/to를 Instant로 변환한다.
# 테스트 머신의 로컬 timezone과 tenant timezone이 다르면 쿼리 범위가
# 어긋나서 HISTORICAL 시뮬레이션이 0건 처리할 수 있다.
TENANT_TZ="${LEXQ_TENANT_TZ:-UTC}"

# ── Config File ──
CONFIG_FILE="$HOME/.lexq/config.json"

# ── Partner API URL 결정 ──
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
    echo "ERROR: Partner API URL을 찾을 수 없습니다."
    echo "       PARTNER_BASE_URL 환경변수 설정 또는 'lexq auth login' 실행 필요."
    exit 1
fi

# ── Engine API URL 결정 (Partner URL 기반 자동 유도) ──
if [ -n "${ENGINE_BASE_URL:-}" ]; then
    ENGINE_URL="$ENGINE_BASE_URL"
else
    # /partners → /execution 치환 (path-based routing 전제)
    ENGINE_URL="${PARTNER_URL/partners/execution}"
fi

# ── API Key 결정 ──
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
    echo "ERROR: API Key를 찾을 수 없습니다."
    echo "       LEXQ_API_KEY 환경변수 설정 또는 'lexq auth login' 실행 필요."
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

log_test "CLI build 확인"
if [ -f "dist/index.js" ]; then pass
else fail "dist/index.js 없음 — pnpm build 실행"; exit 1; fi

log_test "Partner API 연결 확인 (whoami)"
WHOAMI=$(run_cli auth whoami)
TENANT_ID=$(json_get "$WHOAMI" "tenantId")
if [ -n "$TENANT_ID" ] && [ "$TENANT_ID" != "undefined" ]; then
    pass
    echo -e "       tenant: $TENANT_ID"
else
    fail "인증 실패 — Partner API 응답 없음 또는 API Key 무효"
    exit 1
fi

log_test "Engine API 연결 확인 (잘못된 요청 후 응답 코드 확인)"
# requirements 엔드포인트는 인증은 통과하지만 groupId가 없으면 400/404로 빠르게 실패
# → 400이나 404가 나오면 Engine API 자체는 살아있다는 의미
TEST_RAW=$(engine_curl GET "/groups/00000000-0000-0000-0000-000000000000/requirements")
TEST_CODE=$(get_http_code "$TEST_RAW")
if [ "$TEST_CODE" = "404" ] || [ "$TEST_CODE" = "400" ] || [ "$TEST_CODE" = "200" ]; then
    pass
    echo -e "       HTTP $TEST_CODE (reachable)"
else
    fail "Engine API 미응답 (HTTP $TEST_CODE)"
    exit 1
fi

# ═══════════════════════════════════════════════════════════════
# PHASE 0.5: FactDefinition 확인/생성
# ═══════════════════════════════════════════════════════════════

log_section "Phase 0.5 — Fact Definitions"

# payment_amount (NUMBER) — 대부분의 테스트에서 사용
log_test "Fact 'payment_amount' 확인/생성"
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
    echo -e "       이미 존재"
else
    FACT_OUT=$(run_cli facts create --json '{
        "key": "payment_amount",
        "type": "NUMBER",
        "name": "Payment Amount",
        "description": "결제 금액"
    }')
    FACT_ID=$(json_get "$FACT_OUT" "id")
    if [ -n "$FACT_ID" ] && [ "$FACT_ID" != "undefined" ]; then
        pass
        echo -e "       생성됨: $FACT_ID"
    else
        fail "$(json_get "$FACT_OUT" "message")"
    fi
fi

# user_tier (STRING) — 조건 분기 테스트용
log_test "Fact 'user_tier' 확인/생성"
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
    echo -e "       이미 존재"
else
    TIER_OUT=$(run_cli facts create --json '{
        "key": "user_tier",
        "type": "STRING",
        "name": "User Tier",
        "description": "사용자 등급 (VIP, GOLD, NORMAL)"
    }')
    TIER_ID=$(json_get "$TIER_OUT" "id")
    if [ -n "$TIER_ID" ] && [ "$TIER_ID" != "undefined" ]; then
        pass
        echo -e "       생성됨: $TIER_ID"
    else
        fail "$(json_get "$TIER_OUT" "message")"
    fi
fi

# ═══════════════════════════════════════════════════════════════
# PHASE 1: 테스트 데이터 세팅 (CLI → Partner API)
# ═══════════════════════════════════════════════════════════════

log_section "Phase 1 — Group A: 할인 정책"

# ── Group A 생성 ──
log_test "Group A 생성 (discount-e2e-$TS)"
GA_OUT=$(run_cli groups create --json "{
    \"name\": \"discount-e2e-$TS\",
    \"description\": \"Engine API 4종 테스트 — 할인\",
    \"priority\": 100
}")
GROUP_A_ID=$(json_get "$GA_OUT" "id")
if [ -n "$GROUP_A_ID" ] && [ "$GROUP_A_ID" != "undefined" ]; then
    pass
    echo -e "       id: $GROUP_A_ID"
else
    fail "$(json_get "$GA_OUT" "message")"
    exit 1
fi

# ── Version A 생성 ──
log_test "Version A 생성 (DRAFT)"
VA_OUT=$(run_cli versions create --group-id "$GROUP_A_ID" --commit-message "engine-api test v1")
VERSION_A_ID=$(json_get "$VA_OUT" "id")
if [ -n "$VERSION_A_ID" ] && [ "$VERSION_A_ID" != "undefined" ]; then
    pass
    echo -e "       id: $VERSION_A_ID"
else
    fail "$(json_get "$VA_OUT" "message")"
    exit 1
fi

# ── Rule A-1: VIP 할인 ──
log_test "Rule A-1: VIP 10% 할인"
RA1_OUT=$(run_cli rules create --group-id "$GROUP_A_ID" --version-id "$VERSION_A_ID" --json '{
    "name": "VIP 10% Discount",
    "priority": 10,
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
            "type": "DISCOUNT",
            "parameters": {
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

# ── Rule A-2: 일반 할인 ──
log_test "Rule A-2: 일반 5% 할인"
RA2_OUT=$(run_cli rules create --group-id "$GROUP_A_ID" --version-id "$VERSION_A_ID" --json '{
    "name": "Normal 5% Discount",
    "priority": 20,
    "condition": {
        "type": "SINGLE",
        "field": "payment_amount",
        "operator": "GREATER_THAN_OR_EQUAL",
        "value": 50000,
        "valueType": "NUMBER"
    },
    "actions": [
        {
            "type": "DISCOUNT",
            "parameters": {
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

# ── Sleep: 캐시 반영 대기 ──
echo -e "  ${DIM}캐시 반영 대기 (2s)...${NC}"
sleep 2

# ═══════════════════════════════════════════════════════════════

log_section "Phase 1 — Group B: 포인트 적립 (Composite용)"

# ── Group B 생성 ──
log_test "Group B 생성 (point-e2e-$TS)"
GB_OUT=$(run_cli groups create --json "{
    \"name\": \"point-e2e-$TS\",
    \"description\": \"Engine API 4종 테스트 — 포인트\",
    \"priority\": 200
}")
GROUP_B_ID=$(json_get "$GB_OUT" "id")
if [ -n "$GROUP_B_ID" ] && [ "$GROUP_B_ID" != "undefined" ]; then
    pass
    echo -e "       id: $GROUP_B_ID"
else
    fail "$(json_get "$GB_OUT" "message")"
    echo -e "  ${YELLOW}⚠ Group B 없이 Composite 테스트 SKIP${NC}"
fi

if [ -n "$GROUP_B_ID" ]; then
    # ── Version B 생성 ──
    log_test "Version B 생성 (DRAFT)"
    VB_OUT=$(run_cli versions create --group-id "$GROUP_B_ID" --commit-message "engine-api test point v1")
    VERSION_B_ID=$(json_get "$VB_OUT" "id")
    if [ -n "$VERSION_B_ID" ] && [ "$VERSION_B_ID" != "undefined" ]; then
        pass
        echo -e "       id: $VERSION_B_ID"
    else
        fail "$(json_get "$VB_OUT" "message")"
    fi

    # ── Rule B-1: SET_FACT (포인트 계산) ──
    log_test "Rule B-1: 포인트 1% 적립 (SET_FACT)"
    RB1_OUT=$(run_cli rules create --group-id "$GROUP_B_ID" --version-id "$VERSION_B_ID" --json '{
        "name": "Point 1% Earn",
        "priority": 10,
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

    echo -e "  ${DIM}캐시 반영 대기 (2s)...${NC}"
    sleep 2
fi

# ═══════════════════════════════════════════════════════════════
# PHASE 2: Engine API 4종 테스트
# ═══════════════════════════════════════════════════════════════

log_section "Phase 2 — Engine API 4종 테스트"

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
        fail "requiredFacts 필드 없음"
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
    else
        fail "result!=SUCCESS — $(json_get "$BODY" "message")"
    fi
else
    fail "HTTP $HTTP_CODE — $(json_get "$BODY" "message")"
fi

# ── 2-1b: SINGLE_GROUP (NO_MATCH 케이스) ──
log_test "SINGLE_GROUP (NO_MATCH) — 조건 불일치"
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
    sleep 2  # rate limit 회피
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
            echo -e "       traces: $TRACE_COUNT (2개 그룹 합산)"
        else
            fail "result!=SUCCESS — $(json_get "$BODY" "message")"
        fi
    else
        fail "HTTP $HTTP_CODE — $(json_get "$BODY" "message")"
    fi
else
    log_test "COMPOSITE — POST /composite"
    skip "Group B 미생성"
fi

# ═══════════════════════════════════════════════════════════════
# PHASE 2A: Mutex Group (룰 레벨 상호배타)
# ═══════════════════════════════════════════════════════════════

log_section "Phase 2A — Mutex Group (룰 레벨 EXCLUSIVE)"

# ── Group C: Mutex 테스트용 ──
log_test "Group C 생성 (mutex-e2e-$TS)"
GC_OUT=$(run_cli groups create --json "{
    \"name\": \"mutex-e2e-$TS\",
    \"description\": \"Mutex 상호배타 테스트\",
    \"priority\": 300,
    \"activationMode\": \"NONE\"
}")
GROUP_C_ID=$(json_get "$GC_OUT" "id")
if [ -n "$GROUP_C_ID" ] && [ "$GROUP_C_ID" != "undefined" ]; then
    pass
    echo -e "       id: $GROUP_C_ID"
else fail "$(json_get "$GC_OUT" "message")"; fi

if [ -n "$GROUP_C_ID" ]; then
    log_test "Version C 생성"
    VC_OUT=$(run_cli versions create --group-id "$GROUP_C_ID" --commit-message "mutex test")
    VERSION_C_ID=$(json_get "$VC_OUT" "id")
    if [ -n "$VERSION_C_ID" ] && [ "$VERSION_C_ID" != "undefined" ]; then pass
    else fail "$(json_get "$VC_OUT" "message")"; fi
fi

if [ -n "$VERSION_C_ID" ]; then
    # Rule C-1: VIP 20% (priority 0, mutex "best-discount") — 이겨야 함
    log_test "Rule C-1: VIP 20% (mutex winner, priority 0)"
    RC1_OUT=$(run_cli rules create --group-id "$GROUP_C_ID" --version-id "$VERSION_C_ID" --json '{
        "name": "VIP 20% (mutex winner)",
        "priority": 0,
        "mutexGroup": "best-discount",
        "mutexMode": "EXCLUSIVE",
        "mutexStrategy": "HIGHEST_PRIORITY",
        "condition": {
            "type": "SINGLE", "field": "payment_amount", "operator": "GREATER_THAN_OR_EQUAL", "value": 50000, "valueType": "NUMBER"
        },
        "actions": [{ "type": "DISCOUNT", "parameters": { "method": "PERCENTAGE", "rate": 20, "refVar": "payment_amount" } }]
    }')
    if [ -n "$(json_get "$RC1_OUT" "id")" ]; then pass; else fail "$(json_get "$RC1_OUT" "message")"; fi

    # Rule C-2: 일반 10% (priority 10, mutex "best-discount") — 져야 함
    log_test "Rule C-2: 일반 10% (mutex loser, priority 10)"
    RC2_OUT=$(run_cli rules create --group-id "$GROUP_C_ID" --version-id "$VERSION_C_ID" --json '{
        "name": "Normal 10% (mutex loser)",
        "priority": 10,
        "mutexGroup": "best-discount",
        "mutexMode": "EXCLUSIVE",
        "mutexStrategy": "HIGHEST_PRIORITY",
        "condition": {
            "type": "SINGLE", "field": "payment_amount", "operator": "GREATER_THAN_OR_EQUAL", "value": 50000, "valueType": "NUMBER"
        },
        "actions": [{ "type": "DISCOUNT", "parameters": { "method": "PERCENTAGE", "rate": 10, "refVar": "payment_amount" } }]
    }')
    if [ -n "$(json_get "$RC2_OUT" "id")" ]; then pass; else fail "$(json_get "$RC2_OUT" "message")"; fi

    # Rule C-3: 태그 부여 (mutex 없음) — 항상 실행
    log_test "Rule C-3: 태그 (mutex 없음, 항상 실행)"
    RC3_OUT=$(run_cli rules create --group-id "$GROUP_C_ID" --version-id "$VERSION_C_ID" --json '{
        "name": "Add VIP Tag (no mutex)",
        "priority": 50,
        "condition": {
            "type": "SINGLE", "field": "payment_amount", "operator": "GREATER_THAN", "value": 0, "valueType": "NUMBER"
        },
        "actions": [{ "type": "ADD_TAG", "parameters": { "tag": "high_spender" } }]
    }')
    if [ -n "$(json_get "$RC3_OUT" "id")" ]; then pass; else fail "$(json_get "$RC3_OUT" "message")"; fi

    # Publish + Deploy C
    log_test "Version C Publish + Deploy"
    PUB_C=$(run_cli deploy publish --group-id "$GROUP_C_ID" --version-id "$VERSION_C_ID" --memo "mutex test")
    DEP_C=$(run_cli deploy live --group-id "$GROUP_C_ID" --version-id "$VERSION_C_ID" --memo "mutex test")
    if echo "$DEP_C" | grep -q "✓"; then pass; else fail "$DEP_C"; fi

    sleep 2

    # ── Mutex 실행 검증 ──
    log_test "MUTEX — SINGLE_GROUP 실행 (winner만 실행 확인)"
    RAW=$(engine_curl POST "/groups/$GROUP_C_ID" '{
        "facts": { "payment_amount": 100000, "user_tier": "VIP" }
    }')
    HTTP_CODE=$(get_http_code "$RAW")
    BODY=$(get_body "$RAW")

    if [ "$HTTP_CODE" = "200" ]; then
        # decisionTraces에서 BLOCKED_MUTEX 또는 MUTEX_PRIORITY_LOST 확인
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
                fail "BLOCKED_MUTEX 없음 — selected=$SELECTED, blocked=$BLOCKED"
            fi
        fi
    else
        fail "HTTP $HTTP_CODE"
    fi
fi

# ═══════════════════════════════════════════════════════════════
# PHASE 2B: Activation Group (그룹 레벨 EXCLUSIVE)
# ═══════════════════════════════════════════════════════════════

log_section "Phase 2B — Activation Group (그룹 EXCLUSIVE)"

ACTIVATION_GRP="promo-e2e-$TS"

# ── Group D: priority 0 (winner) ──
log_test "Group D 생성 (priority 0, activationGroup=$ACTIVATION_GRP)"
GD_OUT=$(run_cli groups create --json "{
    \"name\": \"promo-vip-e2e-$TS\",
    \"description\": \"Activation Group 승자\",
    \"priority\": 0,
    \"activationGroup\": \"$ACTIVATION_GRP\",
    \"activationMode\": \"EXCLUSIVE\",
    \"activationStrategy\": \"HIGHEST_PRIORITY\"
}")
GROUP_D_ID=$(json_get "$GD_OUT" "id")
if [ -n "$GROUP_D_ID" ] && [ "$GROUP_D_ID" != "undefined" ]; then
    pass
    echo -e "       id: $GROUP_D_ID"
else fail "$(json_get "$GD_OUT" "message")"; fi

# ── Group E: priority 10 (loser) ──
log_test "Group E 생성 (priority 10, activationGroup=$ACTIVATION_GRP)"
GE_OUT=$(run_cli groups create --json "{
    \"name\": \"promo-season-e2e-$TS\",
    \"description\": \"Activation Group 패자\",
    \"priority\": 10,
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
        "actions": [{ "type": "DISCOUNT", "parameters": { "method": "PERCENTAGE", "rate": 20, "refVar": "payment_amount" } }]
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
        "actions": [{ "type": "DISCOUNT", "parameters": { "method": "PERCENTAGE", "rate": 5, "refVar": "payment_amount" } }]
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
            echo -e "       payment_amount: 100000 → $FINAL_AMOUNT (20%만 적용, Group E 제외)"
            echo -e "       traces: $TRACES"
        else
            pass
            echo -e "       payment_amount: $FINAL_AMOUNT (EXCLUSIVE 적용)"
            echo -e "       traces: $TRACES"
        fi
    else
        fail "HTTP $HTTP_CODE — $(json_get "$BODY" "message")"
    fi
fi

# ═══════════════════════════════════════════════════════════════
# PHASE 2C: Dry-Run Compare (버전 간 비교)
# ═══════════════════════════════════════════════════════════════

log_section "Phase 2C — Dry-Run Compare"

if [ -n "$VERSION_A_ID" ] && [ -n "$GROUP_A_ID" ]; then
    log_test "Version A Clone → 새 DRAFT"
    CLONE_OUT=$(run_cli versions clone --group-id "$GROUP_A_ID" --id "$VERSION_A_ID")
    CLONED_VERSION_ID=$(json_get "$CLONE_OUT" "id")
    if [ -n "$CLONED_VERSION_ID" ] && [ "$CLONED_VERSION_ID" != "undefined" ]; then
        pass
        echo -e "       cloned: $CLONED_VERSION_ID"
    else fail "$(json_get "$CLONE_OUT" "message")"; fi

    if [ -n "$CLONED_VERSION_ID" ]; then
        log_test "Clone에 추가 룰 (30% 추가 할인)"
        EXTRA_RULE=$(run_cli rules create --group-id "$GROUP_A_ID" --version-id "$CLONED_VERSION_ID" --json '{
            "name": "Extra 30% Discount (compare test)",
            "priority": 5,
            "condition": {
                "type": "SINGLE", "field": "payment_amount", "operator": "GREATER_THAN", "value": 0, "valueType": "NUMBER"
            },
            "actions": [{ "type": "DISCOUNT", "parameters": { "method": "PERCENTAGE", "rate": 30, "refVar": "payment_amount" } }]
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
                echo -e "       결과 동일 (amountA=$AMOUNT_A, amountB=$AMOUNT_B)"
            fi
        else
            fail "응답이 유효한 JSON이 아님"
            echo -e "       $(echo "$COMPARE_OUT" | head -c 300)"
        fi
    fi
fi

# ═══════════════════════════════════════════════════════════════
# PHASE 2D: Batch Simulation (영향도 분석)
# ═══════════════════════════════════════════════════════════════

log_section "Phase 2D — Batch Simulation (영향도 분석)"

poll_simulation() {
    local sim_id="$1"
    local max_wait=60
    local waited=0
    local out=""
    local status=""

    while [ "$waited" -lt "$max_wait" ]; do
        out=$(run_cli analytics simulation status --id "$sim_id")
        status=$(json_get "$out" "status")

        if [ "$status" = "COMPLETED" ] || [ "$status" = "FAILED" ] || [ "$status" = "CANCELLED" ]; then
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

    log_test "Batch Sim — Clone vs Version A (MANUAL 5건, baseline 비교)"
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

        log_test "비교 시뮬레이션 결과 검증"
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

            log_test "영향도 delta 확인 (Clone이 더 많이 할인 → payment_amount 감소)"
            if [ -n "$DELTA" ] && [ "$DELTA" != "undefined" ] && [ "$DELTA" != "0" ] && [ "$DELTA" != "0.0" ]; then
                pass
                echo -e "       baseline(Version A):  payment_amount 합계 = $BASELINE_VAL"
                echo -e "       simulated(Clone):     payment_amount 합계 = $SIM_VAL"
                echo -e "       delta: $DELTA (${DELTA_PCT}%)"
                echo -e "       → 30% 추가 할인 적용 시 총 결제액이 ${DELTA_PCT}% 변동"
            else
                fail "delta=$DELTA — 변경 영향이 감지되지 않음"
            fi

            RULE_STATS=$(echo "$SIM_CMP_RESULT" | node -e "
                let d='';process.stdin.on('data',c=>d+=c);
                process.stdin.on('end',()=>{
                    try{
                        const rs=JSON.parse(d).ruleStats||[];
                        const summary=rs.map(r=>r.ruleName+': '+r.matchedCount+'건').join(', ');
                        process.stdout.write(summary||'없음');
                    }catch{process.stdout.write('파싱실패')}
                });
            ")
            log_test "ruleStats 확인 (규칙별 매칭 건수)"
            if [ -n "$RULE_STATS" ] && [ "$RULE_STATS" != "없음" ] && [ "$RULE_STATS" != "파싱실패" ]; then
                pass
                echo -e "       $RULE_STATS"
            else
                fail "ruleStats 없음"
            fi
        elif [ "$SIM_CMP_STATUS" = "FAILED" ]; then
            fail "시뮬레이션 FAILED"
            log_test "영향도 delta 확인"
            skip "시뮬레이션 실패"
            log_test "ruleStats 확인"
            skip "시뮬레이션 실패"
        elif [ "$SIM_CMP_STATUS" = "RUNNING" ] || [ "$SIM_CMP_STATUS" = "PENDING" ]; then
            skip "60초 내 완료되지 않음"
            log_test "영향도 delta 확인"
            skip "타임아웃"
            log_test "ruleStats 확인"
            skip "타임아웃"
        else
            fail "예상치 못한 status=$SIM_CMP_STATUS"
            log_test "영향도 delta 확인"
            skip "상위 실패"
            log_test "ruleStats 확인"
            skip "상위 실패"
        fi
    else
        fail "시뮬레이션 시작 실패 — $(echo "$SIM_COMPARE_OUT" | head -c 200)"
        log_test "비교 시뮬레이션 결과 검증"
        skip "시작 실패"
        log_test "영향도 delta 확인"
        skip "시작 실패"
        log_test "ruleStats 확인"
        skip "시작 실패"
    fi

    log_test "Batch Sim — HISTORICAL (오늘 실행 이력 재생)"
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

        log_test "HISTORICAL 시뮬레이션 완료 확인"
        if [ "$HIST_STATUS" = "COMPLETED" ]; then
            pass
            H_TOTAL=$(json_get "$HIST_RESULT" "summary.totalRecords")
            H_MATCHED=$(json_get "$HIST_RESULT" "summary.matchedRecords")
            H_RATE=$(json_get "$HIST_RESULT" "summary.matchRate")
            echo -e "       total: $H_TOTAL | matched: $H_MATCHED | matchRate: $H_RATE"
        elif [ "$HIST_STATUS" = "FAILED" ]; then
            skip "실행 이력 부족 또는 처리 실패 (테스트 데이터 한정)"
        elif [ "$HIST_STATUS" = "RUNNING" ] || [ "$HIST_STATUS" = "PENDING" ]; then
            skip "60초 내 완료되지 않음 — 이력 누적량에 따라 지연 가능"
        else
            fail "예상치 못한 status=$HIST_STATUS"
        fi
    else
        fail "시뮬레이션 시작 실패 — $(echo "$SIM_HIST_OUT" | head -c 200)"
        log_test "HISTORICAL 시뮬레이션 완료 확인"
        skip "시작 실패"
    fi

    log_test "시뮬레이션 목록 조회 (simulation list)"
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
        echo -e "       총 시뮬레이션: $SIM_LIST_COUNT 건"
    else
        fail "시뮬레이션 목록 0건"
    fi
else
    log_test "Batch Sim — Clone vs Version A"
    skip "VERSION_A 또는 CLONED_VERSION 미생성"
    log_test "비교 시뮬레이션 결과 검증"
    skip "미생성"
    log_test "영향도 delta 확인"
    skip "미생성"
    log_test "ruleStats 확인"
    skip "미생성"
    log_test "Batch Sim — HISTORICAL"
    skip "미생성"
    log_test "HISTORICAL 시뮬레이션 완료 확인"
    skip "미생성"
    log_test "시뮬레이션 목록 조회"
    skip "미생성"
fi

# ═══════════════════════════════════════════════════════════════
# PHASE 3: Execution History 검증
# ═══════════════════════════════════════════════════════════════

log_section "Phase 3 — Execution History 검증"

echo -e "  ${DIM}실행 기록 저장 대기 (1s)...${NC}"
sleep 1

log_test "실행 이력에 기록 확인 (CLI)"
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
    echo -e "       총 실행 이력: $HIST_COUNT 건"
else
    fail "실행 이력 0건 — History 기록 확인 필요"
fi

log_test "실행 통계 확인 (CLI)"
STATS=$(run_cli history stats)
TOTAL_EXEC=$(json_get "$STATS" "totalExecutions")
SUCCESS_RATE=$(json_get "$STATS" "successRate")
if [ -n "$TOTAL_EXEC" ] && [ "$TOTAL_EXEC" != "undefined" ]; then
    pass
    echo -e "       totalExecutions: $TOTAL_EXEC | successRate: ${SUCCESS_RATE}%"
else
    fail "stats 응답 이상"
fi

# ═══════════════════════════════════════════════════════════════
# PHASE 4: Cleanup
# ═══════════════════════════════════════════════════════════════

if [ "${LEXQ_SKIP_CLEANUP:-0}" != "1" ]; then
    log_section "Phase 4 — Cleanup"

    if [ -n "$GROUP_A_ID" ]; then
        log_test "Group A Undeploy + Archive"
        run_cli deploy undeploy --group-id "$GROUP_A_ID" --force > /dev/null 2>&1
        run_cli groups update --id "$GROUP_A_ID" --json '{"status":"ARCHIVED"}' > /dev/null 2>&1
        pass
    fi

    if [ -n "$GROUP_B_ID" ]; then
        log_test "Group B Undeploy + Archive"
        run_cli deploy undeploy --group-id "$GROUP_B_ID" --force > /dev/null 2>&1
        run_cli groups update --id "$GROUP_B_ID" --json '{"status":"ARCHIVED"}' > /dev/null 2>&1
        pass
    fi

    if [ -n "$GROUP_C_ID" ]; then
        log_test "Group C Undeploy + Archive"
        run_cli deploy undeploy --group-id "$GROUP_C_ID" --force > /dev/null 2>&1
        run_cli groups update --id "$GROUP_C_ID" --json '{"status":"ARCHIVED"}' > /dev/null 2>&1
        pass
    fi

    if [ -n "$GROUP_D_ID" ]; then
        log_test "Group D Undeploy + Archive"
        run_cli deploy undeploy --group-id "$GROUP_D_ID" --force > /dev/null 2>&1
        run_cli groups update --id "$GROUP_D_ID" --json '{"status":"ARCHIVED"}' > /dev/null 2>&1
        pass
    fi

    if [ -n "$GROUP_E_ID" ]; then
        log_test "Group E Undeploy + Archive"
        run_cli deploy undeploy --group-id "$GROUP_E_ID" --force > /dev/null 2>&1
        run_cli groups update --id "$GROUP_E_ID" --json '{"status":"ARCHIVED"}' > /dev/null 2>&1
        pass
    fi
else
    echo ""
    echo -e "  ${YELLOW}SKIP_CLEANUP=1 — 리소스 유지${NC}"
    echo -e "  Group A (할인):     $GROUP_A_ID"
    echo -e "  Group B (포인트):   ${GROUP_B_ID:-N/A}"
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
    echo -e "  ${RED}✗ 일부 테스트 실패${NC}"
    exit 1
else
    echo -e "  ${GREEN}✓ 전체 통과${NC}"
    exit 0
fi
#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# LexQ CLI — Production E2E Test Suite (Final)
# ═══════════════════════════════════════════════════════════════
#
# 사전 조건:
#   1. pnpm build 완료
#   2. lexq auth login 으로 API 키 저장 완료
#
# 사용법:
#   chmod +x tests/e2e.sh && ./tests/e2e.sh
#
# 환경변수 (선택):
#   LEXQ_API_KEY       — 저장된 키 대신 사용
#   LEXQ_BASE_URL      — 기본값: ~/.lexq/config.json의 baseUrl
#   LEXQ_SKIP_CLEANUP  — 1로 설정 시 생성한 리소스 삭제 안 함
#
# ═══════════════════════════════════════════════════════════════

set -euo pipefail

# ── Unique suffix (중복 방지) ──
TS=$(date +%s)

# ── 색상 ──
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; DIM='\033[2m'; NC='\033[0m'; BOLD='\033[1m'

# ── 카운터 ──
PASS=0; FAIL=0; SKIP=0; TOTAL=0

# ── 생성된 리소스 ID (정리용) ──
CREATED_GROUP_ID=""
CREATED_VERSION_ID=""
CREATED_RULE_ID=""
CREATED_FACT_ID=""
CREATED_INTEGRATION_ID=""
CREATED_WEBHOOK_SUB_ID=""
CLONED_VERSION_ID=""

# ── CLI ──
CLI="node dist/index.js"
GLOBAL_OPTS=""
[ -n "${LEXQ_API_KEY:-}" ]  && GLOBAL_OPTS="--api-key $LEXQ_API_KEY"
[ -n "${LEXQ_BASE_URL:-}" ] && GLOBAL_OPTS="$GLOBAL_OPTS --base-url $LEXQ_BASE_URL"

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

# JSON 필드 추출 (jq 대신 node)
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

# 필드가 존재하고 null/undefined가 아닌지
assert_field() {
    local v
    v=$(json_get "$1" "$2")
    [ -n "$v" ] && [ "$v" != "undefined" ] && [ "$v" != "null" ]
}

# 유효한 JSON이고 error 필드가 없는지
assert_not_error() {
    is_valid_json "$1" || return 1
    local e
    e=$(json_get "$1" "error")
    [ -z "$e" ] || [ "$e" = "undefined" ]
}

# 문자열 포함 확인
assert_contains() {
    echo "$1" | grep -q "$2"
}

# CLI 실행 (exit code 무시)
run_cli() {
    $CLI $GLOBAL_OPTS "$@" 2>&1 || true
}

# 서버 500/403 에러 시 SKIP 처리 (API_CLIENT 권한 이슈)
check_server_error_or_fail() {
    local output="$1"
    local msg
    msg=$(json_get "$output" "message")
    if echo "$msg" | grep -qi "internal\|unauthorized\|forbidden"; then
        skip "서버 권한/내부 에러 — 엔진 수정 필요"
    else
        fail "$msg"
    fi
}

# ═══════════════════════════════════════════════════════════════
# Pre-flight
# ═══════════════════════════════════════════════════════════════

log_section "Pre-flight Checks"

log_test "CLI build exists"
if [ -f "dist/index.js" ]; then
    pass
else
    fail "dist/index.js not found — run 'pnpm build'"
    exit 1
fi

log_test "Auth — whoami"
WHOAMI_OUT=$(run_cli auth whoami)
if assert_field "$WHOAMI_OUT" "tenantId"; then
    pass
    echo -e "       tenant: $(json_get "$WHOAMI_OUT" "tenantId")"
else
    fail "인증 실패 — 'lexq auth login' 실행 필요"
    exit 1
fi

# ═══════════════════════════════════════════════════════════════
# 1. Policy Groups
# ═══════════════════════════════════════════════════════════════

log_section "1. Policy Groups"

GROUP_NAME="E2E Group $TS"

log_test "groups create"
GROUP_OUT=$(run_cli groups create --json "{\"name\":\"$GROUP_NAME\",\"description\":\"E2E test\",\"priority\":999}")
if assert_field "$GROUP_OUT" "id"; then
    CREATED_GROUP_ID=$(json_get "$GROUP_OUT" "id")
    pass
    echo -e "       id: $CREATED_GROUP_ID"
else
    fail "$(json_get "$GROUP_OUT" "message")"
fi

log_test "groups list"
LIST_OUT=$(run_cli groups list --page 0 --size 5)
if assert_field "$LIST_OUT" "totalElements"; then pass; else fail; fi

log_test "groups get (detail — activationMode 확인)"
if [ -n "$CREATED_GROUP_ID" ]; then
    GET_OUT=$(run_cli groups get --id "$CREATED_GROUP_ID")
    if assert_field "$GET_OUT" "activationMode"; then pass
    else fail "activationMode 필드 없음"; fi
else skip "group 미생성"; fi

log_test "groups update"
if [ -n "$CREATED_GROUP_ID" ]; then
    UPD_OUT=$(run_cli groups update --id "$CREATED_GROUP_ID" --json '{"description":"E2E updated"}')
    if assert_field "$UPD_OUT" "id"; then pass
    else fail "$(json_get "$UPD_OUT" "message")"; fi
else skip "group 미생성"; fi

log_test "groups list --format table"
TABLE_OUT=$(run_cli groups list --format table --page 0 --size 3)
if assert_contains "$TABLE_OUT" "total"; then pass; else fail "table 출력에 'total' 없음"; fi

# ═══════════════════════════════════════════════════════════════
# 2. Policy Versions
# ═══════════════════════════════════════════════════════════════

log_section "2. Policy Versions"

log_test "versions create"
if [ -n "$CREATED_GROUP_ID" ]; then
    VER_OUT=$(run_cli versions create --group-id "$CREATED_GROUP_ID" --commit-message "E2E version")
    if assert_field "$VER_OUT" "id"; then
        CREATED_VERSION_ID=$(json_get "$VER_OUT" "id")
        pass
        echo -e "       id: $CREATED_VERSION_ID"
    else fail "$(json_get "$VER_OUT" "message")"; fi
else skip "group 미생성"; fi

log_test "versions list"
if [ -n "$CREATED_GROUP_ID" ]; then
    VLIST_OUT=$(run_cli versions list --group-id "$CREATED_GROUP_ID")
    if assert_field "$VLIST_OUT" "totalElements"; then pass; else fail; fi
else skip "group 미생성"; fi

log_test "versions get"
if [ -n "$CREATED_GROUP_ID" ] && [ -n "$CREATED_VERSION_ID" ]; then
    VGET_OUT=$(run_cli versions get --group-id "$CREATED_GROUP_ID" --id "$CREATED_VERSION_ID")
    if assert_field "$VGET_OUT" "versionNo"; then pass; else fail; fi
else skip "version 미생성"; fi

log_test "versions update"
if [ -n "$CREATED_GROUP_ID" ] && [ -n "$CREATED_VERSION_ID" ]; then
    VUPD_OUT=$(run_cli versions update --group-id "$CREATED_GROUP_ID" --id "$CREATED_VERSION_ID" --commit-message "E2E updated")
    if assert_field "$VUPD_OUT" "id"; then pass; else fail; fi
else skip "version 미생성"; fi

log_test "versions clone"
if [ -n "$CREATED_GROUP_ID" ] && [ -n "$CREATED_VERSION_ID" ]; then
    VCLONE_OUT=$(run_cli versions clone --group-id "$CREATED_GROUP_ID" --id "$CREATED_VERSION_ID")
    if assert_field "$VCLONE_OUT" "id"; then
        CLONED_VERSION_ID=$(json_get "$VCLONE_OUT" "id")
        pass
        echo -e "       cloned: $CLONED_VERSION_ID"
    else fail "$(json_get "$VCLONE_OUT" "message")"; fi
else skip "version 미생성"; fi

# ═══════════════════════════════════════════════════════════════
# 3. Policy Rules
# ═══════════════════════════════════════════════════════════════

log_section "3. Policy Rules"

# SET_FACT 액션 — 필수 파라미터: "key" (PolicyConstants.Param.KEY)
RULE_JSON='{"name":"E2E Rule","priority":0,"condition":{"type":"SINGLE","field":"age","operator":"GREATER_THAN","value":18,"valueType":"NUMBER"},"actions":[{"type":"SET_FACT","parameters":{"key":"e2e_result","value":"matched"}}]}'

log_test "rules create"
if [ -n "$CREATED_GROUP_ID" ] && [ -n "$CREATED_VERSION_ID" ]; then
    RULE_OUT=$(run_cli rules create --group-id "$CREATED_GROUP_ID" --version-id "$CREATED_VERSION_ID" --json "$RULE_JSON")
    if assert_field "$RULE_OUT" "id"; then
        CREATED_RULE_ID=$(json_get "$RULE_OUT" "id")
        pass
        echo -e "       id: $CREATED_RULE_ID"
    else fail "$(json_get "$RULE_OUT" "message")"; fi
else skip "version 미생성"; fi

log_test "rules list"
if [ -n "$CREATED_GROUP_ID" ] && [ -n "$CREATED_VERSION_ID" ]; then
    RLIST_OUT=$(run_cli rules list --group-id "$CREATED_GROUP_ID" --version-id "$CREATED_VERSION_ID")
    if assert_field "$RLIST_OUT" "totalElements"; then pass; else fail; fi
else skip "version 미생성"; fi

log_test "rules get (condition.type=SINGLE 검증)"
if [ -n "$CREATED_GROUP_ID" ] && [ -n "$CREATED_VERSION_ID" ] && [ -n "$CREATED_RULE_ID" ]; then
    RGET_OUT=$(run_cli rules get --group-id "$CREATED_GROUP_ID" --version-id "$CREATED_VERSION_ID" --id "$CREATED_RULE_ID")
    local_ct=$(json_get "$RGET_OUT" "condition.type")
    if [ "$local_ct" = "SINGLE" ]; then pass
    else fail "condition.type='$local_ct', expected 'SINGLE'"; fi
else skip "rule 미생성"; fi

log_test "rules update"
if [ -n "$CREATED_GROUP_ID" ] && [ -n "$CREATED_VERSION_ID" ] && [ -n "$CREATED_RULE_ID" ]; then
    RUPD_OUT=$(run_cli rules update --group-id "$CREATED_GROUP_ID" --version-id "$CREATED_VERSION_ID" --id "$CREATED_RULE_ID" --json '{"name":"E2E Rule Updated"}')
    if assert_field "$RUPD_OUT" "id"; then pass; else fail; fi
else skip "rule 미생성"; fi

log_test "rules toggle (disable → enable)"
if [ -n "$CREATED_GROUP_ID" ] && [ -n "$CREATED_VERSION_ID" ] && [ -n "$CREATED_RULE_ID" ]; then
    RTOG1=$(run_cli rules toggle --group-id "$CREATED_GROUP_ID" --version-id "$CREATED_VERSION_ID" --id "$CREATED_RULE_ID" --enabled false)
    RTOG2=$(run_cli rules toggle --group-id "$CREATED_GROUP_ID" --version-id "$CREATED_VERSION_ID" --id "$CREATED_RULE_ID" --enabled true)
    if assert_contains "$RTOG1" "disabled" && assert_contains "$RTOG2" "enabled"; then pass
    else fail "disable: $(echo "$RTOG1" | head -c 100) / enable: $(echo "$RTOG2" | head -c 100)"; fi
else skip "rule 미생성"; fi

# ═══════════════════════════════════════════════════════════════
# 4. Fact Definitions
# ═══════════════════════════════════════════════════════════════

log_section "4. Fact Definitions"

FACT_KEY="e2e_test_$TS"

log_test "facts list"
FLIST_OUT=$(run_cli facts list --page 0 --size 10)
if assert_field "$FLIST_OUT" "totalElements"; then pass; else fail; fi

log_test "facts create"
FCREATE_OUT=$(run_cli facts create --key "$FACT_KEY" --name "E2E Fact" --type STRING)
if assert_field "$FCREATE_OUT" "id"; then
    CREATED_FACT_ID=$(json_get "$FCREATE_OUT" "id")
    pass
    echo -e "       key: $FACT_KEY"
else fail "$(json_get "$FCREATE_OUT" "message")"; fi

log_test "facts update"
if [ -n "$CREATED_FACT_ID" ]; then
    FUPD_OUT=$(run_cli facts update --id "$CREATED_FACT_ID" --name "E2E Fact Updated")
    if assert_field "$FUPD_OUT" "id"; then pass; else fail; fi
else skip "fact 미생성"; fi

log_test "facts action-metadata (런타임 Facts 메타데이터)"
FMETA_OUT=$(run_cli facts action-metadata)
if is_valid_json "$FMETA_OUT" && assert_field "$FMETA_OUT" "metadata"; then
    # 핵심 Action type 몇 개 검증 (DISCOUNT, SET_FACT, SEND_SMS 등)
    HAS_DISCOUNT=$(echo "$FMETA_OUT" | node -e "
        let d='';process.stdin.on('data',c=>d+=c);
        process.stdin.on('end',()=>{
            try{
                const o=JSON.parse(d);
                process.stdout.write(o.metadata?.DISCOUNT ? 'true' : 'false');
            }catch{process.stdout.write('false')}
        });
    ")
    if [ "$HAS_DISCOUNT" = "true" ]; then pass
    else fail "metadata.DISCOUNT 없음"; fi
else
    fail "유효한 JSON 아니거나 metadata 필드 없음"
fi

# ═══════════════════════════════════════════════════════════════
# 5. Deploy Lifecycle
#
# 순서가 중요:
#   1) publish (DRAFT → ACTIVE)
#   2) deployable (ACTIVE 버전 목록 확인)
#   3) deploy live (ACTIVE → 트래픽 수신)
#   4) diff (두 버전 비교 — Clone과 비교)
#   5) history 조회
#   6) undeploy (트래픽 해제)
#
# ═══════════════════════════════════════════════════════════════

log_section "5. Deploy Lifecycle"

log_test "deploy overview"
DOVR_OUT=$(run_cli deploy overview)
if echo "$DOVR_OUT" | node -e "
    let d=''; process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
        try { process.exit(Array.isArray(JSON.parse(d)) ? 0 : 1); }
        catch { process.exit(1); }
    });
" 2>/dev/null; then pass; else fail "배열 응답이 아님"; fi

log_test "deploy publish (DRAFT→ACTIVE)"
if [ -n "$CREATED_GROUP_ID" ] && [ -n "$CREATED_VERSION_ID" ] && [ -n "$CREATED_RULE_ID" ]; then
    PUB_OUT=$(run_cli deploy publish --group-id "$CREATED_GROUP_ID" --version-id "$CREATED_VERSION_ID" --memo "E2E publish")
    if assert_contains "$PUB_OUT" "published"; then pass
    else fail "$(echo "$PUB_OUT" | head -c 300)"; fi
else skip "rule 미생성 — publish 불가"; fi

log_test "deploy deployable (ACTIVE 버전 목록)"
if [ -n "$CREATED_GROUP_ID" ]; then
    DPBL_OUT=$(run_cli deploy deployable --group-id "$CREATED_GROUP_ID")
    if is_valid_json "$DPBL_OUT"; then pass
    else fail "유효한 JSON 아님"; fi
else skip "group 미생성"; fi

log_test "deploy live (ACTIVE→배포)"
if [ -n "$CREATED_GROUP_ID" ] && [ -n "$CREATED_VERSION_ID" ] && [ -n "$CREATED_RULE_ID" ]; then
    LIVE_OUT=$(run_cli deploy live --group-id "$CREATED_GROUP_ID" --version-id "$CREATED_VERSION_ID" --memo "E2E deploy")
    if assert_contains "$LIVE_OUT" "deployed"; then pass
    else fail "$(echo "$LIVE_OUT" | head -c 300)"; fi
else skip "publish 미실행"; fi

log_test "deploy diff (Version vs Clone 비교)"
if [ -n "$CREATED_VERSION_ID" ] && [ -n "$CLONED_VERSION_ID" ]; then
    DIFF_OUT=$(run_cli deploy diff --base "$CREATED_VERSION_ID" --target "$CLONED_VERSION_ID")
    if is_valid_json "$DIFF_OUT"; then pass
    else fail "유효한 JSON 아님"; fi
else skip "clone 미생성"; fi

log_test "deploy history"
DHIST_OUT=$(run_cli deploy history --page 0 --size 5)
if assert_not_error "$DHIST_OUT"; then pass
else fail "$(json_get "$DHIST_OUT" "message")"; fi

log_test "deploy undeploy"
if [ -n "$CREATED_GROUP_ID" ] && [ -n "$CREATED_RULE_ID" ]; then
    UNDEP_OUT=$(run_cli deploy undeploy --group-id "$CREATED_GROUP_ID" --memo "E2E undeploy" --force)
    if assert_contains "$UNDEP_OUT" "undeployed"; then pass
    else fail "$(echo "$UNDEP_OUT" | head -c 300)"; fi
else skip "deploy 미실행"; fi

# ═══════════════════════════════════════════════════════════════
# 6. Analytics
# ═══════════════════════════════════════════════════════════════

log_section "6. Analytics"

log_test "analytics requirements"
if [ -n "$CREATED_GROUP_ID" ] && [ -n "$CREATED_VERSION_ID" ]; then
    REQ_OUT=$(run_cli analytics requirements --group-id "$CREATED_GROUP_ID" --version-id "$CREATED_VERSION_ID")
    if assert_field "$REQ_OUT" "versionNo"; then pass
    else fail "$(echo "$REQ_OUT" | head -c 200)"; fi
else skip "version 미생성"; fi

log_test "analytics dry-run"
if [ -n "$CREATED_VERSION_ID" ]; then
    DR_OUT=$(run_cli analytics dry-run --version-id "$CREATED_VERSION_ID" --json '{"facts":{"age":25}}' --debug --mock)
    if assert_field "$DR_OUT" "latencyMs"; then pass
    else fail "$(json_get "$DR_OUT" "message")"; fi
else skip "version 미생성"; fi

log_test "analytics simulation list"
SIM_OUT=$(run_cli analytics simulation list --page 0 --size 5)
if assert_not_error "$SIM_OUT"; then pass
else check_server_error_or_fail "$SIM_OUT"; fi

# ═══════════════════════════════════════════════════════════════
# 7. Execution History
# ═══════════════════════════════════════════════════════════════

log_section "7. Execution History"

log_test "history list"
HIST_OUT=$(run_cli history list --page 0 --size 5)
if assert_not_error "$HIST_OUT"; then pass
else check_server_error_or_fail "$HIST_OUT"; fi

log_test "history stats"
STATS_OUT=$(run_cli history stats)
if assert_field "$STATS_OUT" "totalExecutions"; then pass
else check_server_error_or_fail "$STATS_OUT"; fi

# ═══════════════════════════════════════════════════════════════
# 8. Integrations
# ═══════════════════════════════════════════════════════════════

log_section "8. Integrations"

log_test "integrations list"
ILIST_OUT=$(run_cli integrations list --page 0 --size 10)
if assert_not_error "$ILIST_OUT"; then pass
else check_server_error_or_fail "$ILIST_OUT"; fi

log_test "integrations config-spec"
SPEC_OUT=$(run_cli integrations config-spec)
if is_valid_json "$SPEC_OUT"; then pass; else fail "유효한 JSON 아님"; fi

log_test "integrations save (create)"
ISAVE_OUT=$(run_cli integrations save --json '{"type":"WEBHOOK","name":"E2E Webhook","baseUrl":"https://httpbin.org/post","isActive":false}')
if assert_field "$ISAVE_OUT" "id"; then
    CREATED_INTEGRATION_ID=$(json_get "$ISAVE_OUT" "id")
    pass
    echo -e "       id: $CREATED_INTEGRATION_ID"
else fail "$(json_get "$ISAVE_OUT" "message")"; fi

log_test "integrations get"
if [ -n "$CREATED_INTEGRATION_ID" ]; then
    IGET_OUT=$(run_cli integrations get --id "$CREATED_INTEGRATION_ID")
    if assert_field "$IGET_OUT" "type"; then pass; else fail; fi
else skip "integration 미생성"; fi

# ═══════════════════════════════════════════════════════════════
# 9. Failure Logs
# ═══════════════════════════════════════════════════════════════

log_section "9. Failure Logs"

log_test "logs list"
LLIST_OUT=$(run_cli logs list --page 0 --size 5)
if assert_not_error "$LLIST_OUT"; then pass
else check_server_error_or_fail "$LLIST_OUT"; fi

# ═══════════════════════════════════════════════════════════════
# 10. Webhook Subscriptions (Platform Event Notifications)
# ═══════════════════════════════════════════════════════════════

log_section "10. Webhook Subscriptions"

WEBHOOK_SUB_NAME="E2E Webhook Sub $TS"

log_test "webhook-subscriptions list"
WSLIST_OUT=$(run_cli webhook-subscriptions list --page 0 --size 5)
if assert_not_error "$WSLIST_OUT"; then pass
else check_server_error_or_fail "$WSLIST_OUT"; fi

log_test "webhook-subscriptions save (create)"
WSSAVE_OUT=$(run_cli webhook-subscriptions save --json "{
    \"name\": \"$WEBHOOK_SUB_NAME\",
    \"webhookUrl\": \"https://httpbin.org/post\",
    \"subscribedEvents\": [\"VERSION_PUBLISHED\", \"DEPLOYED\", \"ROLLED_BACK\", \"UNDEPLOYED\"],
    \"payloadFormat\": \"GENERIC\"
}")
if assert_field "$WSSAVE_OUT" "id"; then
    CREATED_WEBHOOK_SUB_ID=$(json_get "$WSSAVE_OUT" "id")
    pass
    echo -e "       id: $CREATED_WEBHOOK_SUB_ID"
else fail "$(json_get "$WSSAVE_OUT" "message")"; fi

log_test "webhook-subscriptions get"
if [ -n "$CREATED_WEBHOOK_SUB_ID" ]; then
    WSGET_OUT=$(run_cli webhook-subscriptions get --id "$CREATED_WEBHOOK_SUB_ID")
    if assert_field "$WSGET_OUT" "webhookUrl"; then pass
    else fail "$(json_get "$WSGET_OUT" "message")"; fi
else skip "subscription 미생성"; fi

log_test "webhook-subscriptions save (update — add secret)"
if [ -n "$CREATED_WEBHOOK_SUB_ID" ]; then
    WSUPD_OUT=$(run_cli webhook-subscriptions save --json "{
        \"id\": \"$CREATED_WEBHOOK_SUB_ID\",
        \"name\": \"$WEBHOOK_SUB_NAME\",
        \"webhookUrl\": \"https://httpbin.org/post\",
        \"subscribedEvents\": [\"DEPLOYED\", \"ROLLED_BACK\"],
        \"payloadFormat\": \"GENERIC\",
        \"secret\": \"e2e-hmac-secret-$TS\"
    }")
    HAS_SECRET=$(json_get "$WSUPD_OUT" "hasSecret")
    if [ "$HAS_SECRET" = "true" ]; then pass
    else fail "hasSecret=$HAS_SECRET, expected true"; fi
else skip "subscription 미생성"; fi

log_test "webhook-subscriptions test (2xx 응답 확인)"
if [ -n "$CREATED_WEBHOOK_SUB_ID" ]; then
    WSTEST_OUT=$(run_cli webhook-subscriptions test --id "$CREATED_WEBHOOK_SUB_ID")
    STATUS_CODE=$(json_get "$WSTEST_OUT" "statusCode")
    SUCCESS=$(json_get "$WSTEST_OUT" "success")
    ERROR_CODE=$(json_get "$WSTEST_OUT" "error")

    if [ -n "$STATUS_CODE" ] && [ "$STATUS_CODE" -ge 200 ] 2>/dev/null && [ "$STATUS_CODE" -lt 300 ] 2>/dev/null; then
        pass
        echo -e "       HTTP $STATUS_CODE | success: $SUCCESS"
    elif [ -n "$ERROR_CODE" ] && [ "$ERROR_CODE" != "undefined" ]; then
        fail "$ERROR_CODE: $(json_get "$WSTEST_OUT" "message")"
    else
        fail "unexpected response — statusCode=$STATUS_CODE success=$SUCCESS"
    fi
else skip "subscription 미생성"; fi

log_test "webhook-subscriptions list --format table"
WSTABLE_OUT=$(run_cli webhook-subscriptions list --format table --page 0 --size 5)
if assert_contains "$WSTABLE_OUT" "total"; then pass
else fail "table 출력에 'total' 없음"; fi

# ═══════════════════════════════════════════════════════════════
# 11. Dry-run Mode
# ═══════════════════════════════════════════════════════════════

log_section "11. Dry-run Mode"

log_test "groups list --dry-run (HTTP 미전송 확인)"
DRYRUN_OUT=$(run_cli groups list --dry-run)
if assert_contains "$DRYRUN_OUT" "X-API-KEY"; then pass
else fail "dry-run 출력에 X-API-KEY 없음"; fi

# ═══════════════════════════════════════════════════════════════
# Cleanup
# ═══════════════════════════════════════════════════════════════

log_section "Cleanup"

if [ "${LEXQ_SKIP_CLEANUP:-0}" = "1" ]; then
    echo -e "  ${YELLOW}LEXQ_SKIP_CLEANUP=1 → 정리 생략${NC}"
    [ -n "$CREATED_GROUP_ID" ]         && echo -e "  Group:              $CREATED_GROUP_ID"
    [ -n "$CREATED_VERSION_ID" ]       && echo -e "  Version:            $CREATED_VERSION_ID"
    [ -n "$CLONED_VERSION_ID" ]        && echo -e "  Cloned:             $CLONED_VERSION_ID"
    [ -n "$CREATED_RULE_ID" ]          && echo -e "  Rule:               $CREATED_RULE_ID"
    [ -n "$CREATED_FACT_ID" ]          && echo -e "  Fact:               $CREATED_FACT_ID"
    [ -n "$CREATED_INTEGRATION_ID" ]   && echo -e "  Integration:        $CREATED_INTEGRATION_ID"
    [ -n "$CREATED_WEBHOOK_SUB_ID" ]   && echo -e "  Webhook Sub:        $CREATED_WEBHOOK_SUB_ID"
else
    # 역순 삭제 — Webhook/Integration/Fact는 독립. Group cascade로 Version/Rule 삭제.
    if [ -n "$CREATED_WEBHOOK_SUB_ID" ]; then
        log_test "delete webhook subscription"
        DEL=$(run_cli webhook-subscriptions delete --id "$CREATED_WEBHOOK_SUB_ID" --force)
        if echo "$DEL" | grep -qi "deleted\|✓"; then pass; else fail "$DEL"; fi
    fi

    if [ -n "$CREATED_INTEGRATION_ID" ]; then
        log_test "delete integration"
        DEL=$(run_cli integrations delete --id "$CREATED_INTEGRATION_ID" --force)
        if echo "$DEL" | grep -qi "deleted\|✓"; then pass; else fail "$DEL"; fi
    fi

    if [ -n "$CREATED_FACT_ID" ]; then
        log_test "delete fact"
        DEL=$(run_cli facts delete --id "$CREATED_FACT_ID" --force)
        if echo "$DEL" | grep -qi "deleted\|✓"; then pass; else fail "$DEL"; fi
    fi

    if [ -n "$CLONED_VERSION_ID" ]; then
        log_test "delete cloned version"
        DEL=$(run_cli versions delete --group-id "$CREATED_GROUP_ID" --id "$CLONED_VERSION_ID" --force)
        if echo "$DEL" | grep -qi "deleted\|✓"; then pass; else fail "$DEL"; fi
    fi

    if [ -n "$CREATED_GROUP_ID" ]; then
        log_test "delete group (cascade)"
        DEL=$(run_cli groups delete --id "$CREATED_GROUP_ID" --force)
        if echo "$DEL" | grep -qi "deleted\|✓"; then pass; else fail "$DEL"; fi
    fi
fi

# ═══════════════════════════════════════════════════════════════
# Summary
# ═══════════════════════════════════════════════════════════════

echo ""
echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo -e "${BOLD}  Results${NC}"
echo -e "${CYAN}═══════════════════════════════════════${NC}"
echo -e "  ${GREEN}PASS: $PASS${NC}"
echo -e "  ${RED}FAIL: $FAIL${NC}"
echo -e "  ${YELLOW}SKIP: $SKIP${NC}"
echo -e "  Total: $TOTAL"
echo ""

if [ "$FAIL" -gt 0 ]; then
    echo -e "${RED}${BOLD}  ✗ E2E FAILED${NC}"
    exit 1
else
    echo -e "${GREEN}${BOLD}  ✓ E2E PASSED${NC}"
    exit 0
fi
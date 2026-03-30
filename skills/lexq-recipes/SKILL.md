# LexQ CLI — Recipes

> **Prerequisite:** Read `lexq-shared/SKILL.md` first. Each recipe is a complete, copy-paste workflow.

## Recipe 1: Tiered Discount Policy

**Goal:** Apply different discounts based on payment amount.

```bash
# 1. Create group
lexq groups create --json '{
  "name": "tiered-discount",
  "priority": 0,
  "description": "Apply discount based on payment amount tiers"
}'
# → Save the group ID

# 2. Create DRAFT version
lexq versions create --group-id <gid> --json '{"commitMessage": "Initial tiered discount"}'
# → Save the version ID

# 3. Register facts (skip if already exist)
lexq facts create --key payment_amount --name "Payment Amount" --type NUMBER --required
lexq facts create --key customer_tier --name "Customer Tier" --type STRING

# 4. Add rules (highest priority first)
lexq rules create --group-id <gid> --version-id <vid> --json '{
  "name": "Premium Tier - 20%",
  "priority": 0,
  "condition": {
    "type": "SINGLE",
    "field": "payment_amount",
    "operator": "GREATER_THAN_OR_EQUAL",
    "value": 500000,
    "valueType": "NUMBER"
  },
  "actions": [{
    "type": "DISCOUNT",
    "parameters": { "method": "PERCENTAGE", "rate": 20, "refVar": "payment_amount" }
  }]
}'

lexq rules create --group-id <gid> --version-id <vid> --json '{
  "name": "Gold Tier - 10%",
  "priority": 1,
  "condition": {
    "type": "GROUP",
    "operator": "AND",
    "children": [
      { "type": "SINGLE", "field": "payment_amount", "operator": "GREATER_THAN_OR_EQUAL", "value": 100000, "valueType": "NUMBER" },
      { "type": "SINGLE", "field": "payment_amount", "operator": "LESS_THAN", "value": 500000, "valueType": "NUMBER" }
    ]
  },
  "actions": [{
    "type": "DISCOUNT",
    "parameters": { "method": "PERCENTAGE", "rate": 10, "refVar": "payment_amount" }
  }]
}'

lexq rules create --group-id <gid> --version-id <vid> --json '{
  "name": "Base Tier - 5%",
  "priority": 2,
  "condition": {
    "type": "SINGLE",
    "field": "payment_amount",
    "operator": "GREATER_THAN_OR_EQUAL",
    "value": 30000,
    "valueType": "NUMBER"
  },
  "actions": [{
    "type": "DISCOUNT",
    "parameters": { "method": "PERCENTAGE", "rate": 5, "refVar": "payment_amount" }
  }]
}'

# 5. Validate
lexq analytics dry-run --version-id <vid> --debug --mock --json '{"facts":{"payment_amount":600000}}'
# Expected: 20% discount → 120000

lexq analytics dry-run --version-id <vid> --debug --mock --json '{"facts":{"payment_amount":200000}}'
# Expected: 10% discount → 20000

# 6. Deploy
lexq deploy publish --group-id <gid> --version-id <vid> --memo "Tiered discount v1"
lexq deploy live --group-id <gid> --version-id <vid> --memo "Go live"
```

---

## Recipe 2: Fraud Detection / Transaction Block

**Goal:** Block suspicious transactions based on multiple signals.

```bash
lexq groups create --json '{
  "name": "fraud-detection",
  "priority": 0,
  "description": "Block suspicious transactions"
}'

lexq versions create --group-id <gid> --json '{"commitMessage": "Fraud rules v1"}'

lexq facts create --key transaction_amount --name "Transaction Amount" --type NUMBER --required
lexq facts create --key transaction_count_24h --name "Transactions in 24h" --type NUMBER
lexq facts create --key country_code --name "Country Code" --type STRING

# High-value + high-frequency
lexq rules create --group-id <gid> --version-id <vid> --json '{
  "name": "High Risk - Large + Frequent",
  "priority": 0,
  "condition": {
    "type": "GROUP",
    "operator": "AND",
    "children": [
      { "type": "SINGLE", "field": "transaction_amount", "operator": "GREATER_THAN", "value": 5000000, "valueType": "NUMBER" },
      { "type": "SINGLE", "field": "transaction_count_24h", "operator": "GREATER_THAN", "value": 10, "valueType": "NUMBER" }
    ]
  },
  "actions": [
    { "type": "BLOCK", "parameters": { "reason": "High value + high frequency", "code": "FRAUD_HIGH_RISK" } },
    { "type": "ADD_TAG", "parameters": { "tag": "fraud_review" } }
  ]
}'

# Sanctioned country
lexq rules create --group-id <gid> --version-id <vid> --json '{
  "name": "Sanctioned Country Block",
  "priority": 1,
  "condition": {
    "type": "SINGLE",
    "field": "country_code",
    "operator": "IN",
    "value": ["XX", "YY", "ZZ"],
    "valueType": "LIST_STRING"
  },
  "actions": [
    { "type": "BLOCK", "parameters": { "reason": "Sanctioned country", "code": "COUNTRY_BLOCKED" } }
  ]
}'

# Validate
lexq analytics dry-run --version-id <vid> --debug --mock --json '{
  "facts": { "transaction_amount": 10000000, "transaction_count_24h": 15, "country_code": "KR" }
}'
```

---

## Recipe 3: A/B Test a Rule Change

**Goal:** Test a discount rate change (10% → 15%) with gradual traffic rollout.

```bash
# Current live version is v1 with 10% discount.

# 1. Clone the live version to create a new DRAFT
lexq versions clone --group-id <gid> --version-id <v1id>
# → Save the new version ID (v2)

# 2. Update the discount rule in v2
lexq rules update --group-id <gid> --version-id <v2id> --id <ruleId> --json '{
  "actions": [{
    "type": "DISCOUNT",
    "parameters": { "method": "PERCENTAGE", "rate": 15, "refVar": "payment_amount" }
  }]
}'

# 3. Validate with dry-run
lexq analytics dry-run --version-id <v2id> --debug --mock --json '{
  "facts": { "payment_amount": 100000, "customer_tier": "VIP" }
}'

# 4. Publish v2
lexq deploy publish --group-id <gid> --version-id <v2id> --memo "15% discount test"

# 5. Start A/B test at 10% traffic
lexq groups ab-test start --group-id <gid> --version-id <v2id> --traffic-rate 10

# 6. Monitor (check execution stats periodically)
lexq history stats

# 7. Gradually increase: 10% → 30% → 50%
lexq groups ab-test adjust --group-id <gid> --traffic-rate 30
lexq groups ab-test adjust --group-id <gid> --traffic-rate 50

# 8. If v2 wins, promote to 100%
lexq deploy live --group-id <gid> --version-id <v2id> --memo "15% discount winner"
lexq groups ab-test stop --group-id <gid> --force
```

---

## Recipe 4: Point Reward Program

**Goal:** Award loyalty points based on purchase behavior.

```bash
lexq groups create --json '{
  "name": "loyalty-points",
  "priority": 1,
  "activationMode": "NONE"
}'

lexq versions create --group-id <gid> --json '{"commitMessage": "Points program v1"}'

lexq facts create --key purchase_amount --name "Purchase Amount" --type NUMBER --required
lexq facts create --key is_first_purchase --name "First Purchase" --type BOOLEAN

# Double points for first purchase
lexq rules create --group-id <gid> --version-id <vid> --json '{
  "name": "First Purchase Double Points",
  "priority": 0,
  "condition": {
    "type": "SINGLE",
    "field": "is_first_purchase",
    "operator": "EQUALS",
    "value": true,
    "valueType": "BOOLEAN"
  },
  "actions": [
    { "type": "POINT", "parameters": { "amount": 200, "pointType": "BONUS" } },
    { "type": "NOTIFICATION", "parameters": { "channel": "PUSH", "template": "welcome_points" } }
  ]
}'

# Standard points (1 point per 1000 KRW)
lexq rules create --group-id <gid> --version-id <vid> --json '{
  "name": "Standard Purchase Points",
  "priority": 1,
  "condition": {
    "type": "SINGLE",
    "field": "purchase_amount",
    "operator": "GREATER_THAN_OR_EQUAL",
    "value": 1000,
    "valueType": "NUMBER"
  },
  "actions": [
    { "type": "SET_FACT", "parameters": { "key": "points_earned", "value": "purchase_amount / 1000" } }
  ]
}'
```

---

## Recipe 5: Webhook Integration

**Goal:** Call an external API when a rule matches.

```bash
# 1. Create webhook integration
lexq integrations save --json '{
  "type": "WEBHOOK",
  "name": "Order Processing Webhook",
  "baseUrl": "https://api.example.com/webhooks/orders",
  "isActive": true
}'

# 2. Use WEBHOOK action in a rule
lexq rules create --group-id <gid> --version-id <vid> --json '{
  "name": "Large Order Alert",
  "priority": 0,
  "condition": {
    "type": "SINGLE",
    "field": "order_total",
    "operator": "GREATER_THAN",
    "value": 1000000,
    "valueType": "NUMBER"
  },
  "actions": [
    { "type": "WEBHOOK", "parameters": { "url": "https://api.example.com/webhooks/orders", "method": "POST" } },
    { "type": "ADD_TAG", "parameters": { "tag": "large_order" } }
  ]
}'
```

---

## Recipe 6: Exclusive Discount (Mutex)

**Goal:** Ensure only the best discount applies when multiple rules match.

```bash
lexq rules create --group-id <gid> --version-id <vid> --json '{
  "name": "VIP Discount 20%",
  "priority": 0,
  "mutexGroup": "best-discount",
  "mutexMode": "EXCLUSIVE",
  "mutexStrategy": "HIGHEST_PRIORITY",
  "condition": {
    "type": "SINGLE", "field": "customer_tier", "operator": "EQUALS", "value": "VIP", "valueType": "STRING"
  },
  "actions": [{ "type": "DISCOUNT", "parameters": { "method": "PERCENTAGE", "rate": 20, "refVar": "payment_amount" } }]
}'

lexq rules create --group-id <gid> --version-id <vid> --json '{
  "name": "Seasonal Sale 15%",
  "priority": 1,
  "mutexGroup": "best-discount",
  "mutexMode": "EXCLUSIVE",
  "mutexStrategy": "HIGHEST_PRIORITY",
  "condition": {
    "type": "SINGLE", "field": "payment_amount", "operator": "GREATER_THAN_OR_EQUAL", "value": 50000, "valueType": "NUMBER"
  },
  "actions": [{ "type": "DISCOUNT", "parameters": { "method": "PERCENTAGE", "rate": 15, "refVar": "payment_amount" } }]
}'

# If a VIP customer pays 50000+, only the 20% VIP discount fires (priority 0 wins).
```

---

## Recipe 7: Region-Based Coupon

**Goal:** Issue different coupons by region.

```bash
lexq facts create --key user_region --name "User Region" --type STRING --required

lexq rules create --group-id <gid> --version-id <vid> --json '{
  "name": "Korea Welcome Coupon",
  "priority": 0,
  "condition": {
    "type": "SINGLE", "field": "user_region", "operator": "IN", "value": ["KR"], "valueType": "LIST_STRING"
  },
  "actions": [{ "type": "COUPON_ISSUE", "parameters": { "couponId": "KR_WELCOME_2025", "expiryDays": 30 } }]
}'

lexq rules create --group-id <gid> --version-id <vid> --json '{
  "name": "US Welcome Coupon",
  "priority": 1,
  "condition": {
    "type": "SINGLE", "field": "user_region", "operator": "IN", "value": ["US"], "valueType": "LIST_STRING"
  },
  "actions": [{ "type": "COUPON_ISSUE", "parameters": { "couponId": "US_WELCOME_2025", "expiryDays": 14 } }]
}'
```

---

## Recipe 8: Version Rollback

**Goal:** Something went wrong in production — revert to the previous version.

```bash
# 1. Check current state
lexq deploy overview

# 2. Rollback
lexq deploy rollback --group-id <gid> --memo "Reverting due to increased error rate"

# 3. Verify
lexq deploy overview
lexq history stats
```

---

## Recipe 9: Monitoring + Auto-Resolve Failures

**Goal:** Check for pending failures and resolve them.

```bash
# 1. List pending failures
lexq logs list --status PENDING --page 0 --size 50

# 2. Retry transient failures
lexq logs bulk-action --ids "id1,id2,id3" --action RETRY

# 3. Resolve permanent failures (after manual review)
lexq logs bulk-action --ids "id4,id5" --action RESOLVE

# 4. Verify clean state
lexq logs list --status PENDING --page 0 --size 10
```

---

## Recipe 10: Full Policy Migration Workflow

**Goal:** Create an entirely new version of a policy with different logic.

```bash
# 1. Clone the current live version
lexq versions clone --group-id <gid> --version-id <currentLiveVersionId>
# → new DRAFT version ID

# 2. Delete unwanted rules from the clone
lexq rules list --group-id <gid> --version-id <newVid>
lexq rules delete --group-id <gid> --version-id <newVid> --id <obsoleteRuleId> --force

# 3. Add new rules
lexq rules create --group-id <gid> --version-id <newVid> --json '{...}'

# 4. Dry-run test multiple scenarios
lexq analytics dry-run --version-id <newVid> --debug --mock --json '{"facts":{...}}'

# 5. Run simulation against live baseline
lexq deploy publish --group-id <gid> --version-id <newVid> --memo "v2 migration"
lexq analytics simulation start --json '{
  "policyVersionId": "<newVid>",
  "dataset": {"type":"HISTORICAL","source":"EXECUTION_LOGS","from":"2025-01-01","to":"2025-01-31"},
  "options": {"baselinePolicyVersionId":"<currentLiveVersionId>","includeRuleStats":true}
}'

# 6. If simulation passes, deploy
lexq deploy live --group-id <gid> --version-id <newVid> --memo "Migration complete"
```
# LexQ CLI — Recipes

> **Prerequisite:** Read `lexq-shared/SKILL.md` first. Each recipe is a complete, copy-paste workflow.

## Recipe 1: Tiered Discount Policy

**Goal:** Apply different discounts based on payment amount.

```bash
# 1. Create group
lexq groups create --json '{
  "name": "tiered-discount",
  "description": "Apply discount based on payment amount tiers"
}'
# → Save the group ID

# 2. Create DRAFT version
lexq versions create --group-id <gid> --json '{"commitMessage": "Initial tiered discount"}'
# → Save the version ID

# 3. Register facts (skip if already exist)
lexq facts create --key paymentAmount --name "Payment Amount" --type NUMBER --required
lexq facts create --key customerTier --name "Customer Tier" --type STRING

# 4. Add rules — creation order becomes priority order (first created = priority 1 = highest)
lexq rules create --group-id <gid> --version-id <vid> --json '{
  "name": "Premium Tier - 20%",
  "condition": {
    "type": "SINGLE",
    "field": "paymentAmount",
    "operator": "GREATER_THAN_OR_EQUAL",
    "value": 500000,
    "valueType": "NUMBER"
  },
  "actions": [{
    "type": "MUTATE_FACT",
    "parameters": {
      "targetVar": "paymentAmount",
      "method": "PERCENTAGE",
      "operator": "SUB",
      "operand": 20,
      "rounding": { "mode": "HALF_UP", "scale": 0 }
    }
  }]
}'

lexq rules create --group-id <gid> --version-id <vid> --json '{
  "name": "Gold Tier - 10%",
  "condition": {
    "type": "GROUP",
    "operator": "AND",
    "children": [
      { "type": "SINGLE", "field": "paymentAmount", "operator": "GREATER_THAN_OR_EQUAL", "value": 100000, "valueType": "NUMBER" },
      { "type": "SINGLE", "field": "paymentAmount", "operator": "LESS_THAN", "value": 500000, "valueType": "NUMBER" }
    ]
  },
  "actions": [{
    "type": "MUTATE_FACT",
    "parameters": {
      "targetVar": "paymentAmount",
      "method": "PERCENTAGE",
      "operator": "SUB",
      "operand": 10,
      "rounding": { "mode": "HALF_UP", "scale": 0 }
    }
  }]
}'

lexq rules create --group-id <gid> --version-id <vid> --json '{
  "name": "Base Tier - 5%",
  "condition": {
    "type": "SINGLE",
    "field": "paymentAmount",
    "operator": "GREATER_THAN_OR_EQUAL",
    "value": 30000,
    "valueType": "NUMBER"
  },
  "actions": [{
    "type": "MUTATE_FACT",
    "parameters": {
      "targetVar": "paymentAmount",
      "method": "PERCENTAGE",
      "operator": "SUB",
      "operand": 5,
      "rounding": { "mode": "HALF_UP", "scale": 0 }
    }
  }]
}'

# 5. Validate
lexq analytics dry-run --version-id <vid> --debug --json '{"facts":{"paymentAmount":600000}}'
# Expected: mutatedFacts.paymentAmount = 480000, generatedVariables.paymentAmount__delta = -120000

lexq analytics dry-run --version-id <vid> --debug --json '{"facts":{"paymentAmount":200000}}'
# Expected: mutatedFacts.paymentAmount = 180000, generatedVariables.paymentAmount__delta = -20000

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
  "description": "Block suspicious transactions"
}'

lexq versions create --group-id <gid> --json '{"commitMessage": "Fraud rules v1"}'

lexq facts create --key transactionAmount --name "Transaction Amount" --type NUMBER --required
lexq facts create --key transactionCount24h --name "Transactions in 24h" --type NUMBER
lexq facts create --key countryCode --name "Country Code" --type STRING

# High-value + high-frequency
lexq rules create --group-id <gid> --version-id <vid> --json '{
  "name": "High Risk - Large + Frequent",
  "condition": {
    "type": "GROUP",
    "operator": "AND",
    "children": [
      { "type": "SINGLE", "field": "transactionAmount", "operator": "GREATER_THAN", "value": 5000000, "valueType": "NUMBER" },
      { "type": "SINGLE", "field": "transactionCount24h", "operator": "GREATER_THAN", "value": 10, "valueType": "NUMBER" }
    ]
  },
  "actions": [
    { "type": "BLOCK", "parameters": { "reason": "High value + high frequency" } }
  ]
}'

# Sanctioned country
lexq rules create --group-id <gid> --version-id <vid> --json '{
  "name": "Sanctioned Country Block",
  "condition": {
    "type": "SINGLE",
    "field": "countryCode",
    "operator": "IN",
    "value": ["XX", "YY", "ZZ"],
    "valueType": "LIST_STRING"
  },
  "actions": [
    { "type": "BLOCK", "parameters": { "reason": "Sanctioned country" } }
  ]
}'

# Validate
lexq analytics dry-run --version-id <vid> --debug --json '{
  "facts": { "transactionAmount": 10000000, "transactionCount24h": 15, "countryCode": "KR" }
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
    "type": "MUTATE_FACT",
    "parameters": {
      "targetVar": "paymentAmount",
      "method": "PERCENTAGE",
      "operator": "SUB",
      "operand": 15,
      "rounding": { "mode": "HALF_UP", "scale": 0 }
    }
  }]
}'

# 3. Validate with dry-run
lexq analytics dry-run --version-id <v2id> --debug --json '{
  "facts": { "paymentAmount": 100000, "customerTier": "VIP" }
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

**Note:** `totalPoints` must be present in the request facts. The engine is stateless — it does
not read your database. Send the customer's current balance (or `0` for a new customer) and apply
the returned value yourself. `MUTATE_FACT` throws if the target fact is absent.

```bash
lexq groups create --json '{
  "name": "loyalty-points",
  "activationMode": "NONE"
}'

lexq versions create --group-id <gid> --json '{"commitMessage": "Points program v1"}'

lexq facts create --key purchaseAmount --name "Purchase Amount" --type NUMBER --required
lexq facts create --key isFirstPurchase --name "First Purchase" --type BOOLEAN
lexq facts create --key totalPoints --name "Total Points" --type NUMBER --required

# Bonus points for first purchase (fixed 200)
lexq rules create --group-id <gid> --version-id <vid> --json '{
  "name": "First Purchase Bonus Points",
  "condition": {
    "type": "SINGLE",
    "field": "isFirstPurchase",
    "operator": "EQUALS",
    "value": true,
    "valueType": "BOOLEAN"
  },
  "actions": [
    {
      "type": "MUTATE_FACT",
      "parameters": {
        "targetVar": "totalPoints",
        "operator": "ADD",
        "method": "AMOUNT",
        "operand": 200
      }
    }
  ]
}'

# Standard points: 0.1% of purchaseAmount = 1 point per 1000 KRW
lexq rules create --group-id <gid> --version-id <vid> --json '{
  "name": "Standard Purchase Points",
  "condition": {
    "type": "SINGLE",
    "field": "purchaseAmount",
    "operator": "GREATER_THAN_OR_EQUAL",
    "value": 1000,
    "valueType": "NUMBER"
  },
  "actions": [
    {
      "type": "MUTATE_FACT",
      "parameters": {
        "targetVar": "totalPoints",
        "refVar": "purchaseAmount",
        "operator": "ADD",
        "method": "PERCENTAGE",
        "operand": 0.1,
        "rounding": { "mode": "FLOOR", "scale": 0 }
      }
    }
  ]
}'

# Verify — new customer, 50,000 KRW purchase → 200 bonus + 50 standard = 250
lexq analytics dry-run --version-id <vid> --debug --json '{
  "facts": { "purchaseAmount": 50000, "isFirstPurchase": true, "totalPoints": 0 }
}'
```

`totalPoints` and `refVar: purchaseAmount` are two different facts — this is exactly what
`refVar` exists for. Omitting it would compute `totalPoints += totalPoints × 0.1%`.

Read `totalPoints` and `totalPoints__delta` from `generatedVariables` in the response.

---

## Recipe 5: Exclusive Discount (Mutex)

**Goal:** Ensure only the best discount applies when multiple rules match.

```bash
lexq rules create --group-id <gid> --version-id <vid> --json '{
  "name": "VIP Discount 20%",
  "mutexGroup": "best-discount",
  "mutexMode": "EXCLUSIVE",
  "mutexStrategy": "HIGHEST_PRIORITY",
  "condition": {
    "type": "SINGLE", "field": "customerTier", "operator": "EQUALS", "value": "VIP", "valueType": "STRING"
  },
  "actions": [{
    "type": "MUTATE_FACT",
    "parameters": {
      "targetVar": "paymentAmount",
      "method": "PERCENTAGE",
      "operator": "SUB",
      "operand": 20,
      "rounding": { "mode": "HALF_UP", "scale": 0 }
    }
  }]
}'

lexq rules create --group-id <gid> --version-id <vid> --json '{
  "name": "Seasonal Sale 15%",
  "mutexGroup": "best-discount",
  "mutexMode": "EXCLUSIVE",
  "mutexStrategy": "HIGHEST_PRIORITY",
  "condition": {
    "type": "SINGLE", "field": "paymentAmount", "operator": "GREATER_THAN_OR_EQUAL", "value": 50000, "valueType": "NUMBER"
  },
  "actions": [{
    "type": "MUTATE_FACT",
    "parameters": {
      "targetVar": "paymentAmount",
      "method": "PERCENTAGE",
      "operator": "SUB",
      "operand": 15,
      "rounding": { "mode": "HALF_UP", "scale": 0 }
    }
  }]
}'

# Rules are appended in creation order. Confirm the order with `lexq rules list`,
# or set it explicitly:
#   lexq rules reorder --group-id <gid> --version-id <vid> --rule-ids "<vipRuleId>,<seasonalRuleId>"
#
# If a VIP customer pays 50000+, only the 20% VIP discount fires — HIGHEST_PRIORITY
# picks the rule with the lower priority number within the mutex group.
```

---

## Recipe 6: Version Rollback

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

## Recipe 7: Monitoring + Failure Triage

**Goal:** Check for pending failures and clear the queue.

Failure logs are a dead-letter record for background tasks — platform event webhooks and scheduled
deployments. There is no retry action: the engine does not re-execute a failed task on request.
Fix the cause at the source (webhook endpoint, version state), then mark the log.

```bash
# 1. List pending failures
lexq logs list --status PENDING --page 0 --size 50

# 2. Inspect one to see the original payload and error
lexq logs get --id <logId>

# 3. Mark as resolved after fixing the cause externally
lexq logs bulk-action --ids "id1,id2,id3" --action RESOLVE

# 4. Mark as intentionally skipped (won't appear in PENDING again)
lexq logs bulk-action --ids "id4,id5" --action IGNORE

# 5. Verify clean state
lexq logs list --status PENDING --page 0 --size 10
```

`RESOLVE` and `IGNORE` differ only in intent — both remove the log from PENDING. Use `RESOLVE`
when the underlying problem was fixed, `IGNORE` when it does not need fixing.

---

## Recipe 8: Full Policy Migration Workflow

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
lexq analytics dry-run --version-id <newVid> --debug --json '{"facts":{...}}'

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

---

## Recipe 9: Flag-Based Segmentation

**Goal:** Set segment flags that downstream systems read from the decision response.

`SET_FACT` assigns a value — it does not append. To accumulate into a `LIST_STRING` fact, send the
current list in the request facts and assign the full new list. For most segmentation, separate
boolean or string flags are simpler and easier to query.

```bash
lexq groups create --json '{"name": "segmentation", "activationMode": "NONE"}'
lexq versions create --group-id <gid> --json '{"commitMessage": "Segments v1"}'

lexq facts create --key lifetimeValue --name "Lifetime Value" --type NUMBER --required
lexq facts create --key signupDays --name "Days Since Signup" --type NUMBER --required
lexq facts create --key supportTier --name "Support Tier" --type STRING
lexq facts create --key betaEnabled --name "Beta Access" --type BOOLEAN

# High-value customer → priority support
lexq rules create --group-id <gid> --version-id <vid> --json '{
  "name": "High Value Segment",
  "condition": {
    "type": "SINGLE", "field": "lifetimeValue",
    "operator": "GREATER_THAN_OR_EQUAL", "value": 1000000, "valueType": "NUMBER"
  },
  "actions": [
    { "type": "SET_FACT", "parameters": { "targetVar": "supportTier", "value": "PRIORITY" } }
  ]
}'

# Long-tenured customer → beta access
lexq rules create --group-id <gid> --version-id <vid> --json '{
  "name": "Veteran Beta Access",
  "condition": {
    "type": "SINGLE", "field": "signupDays",
    "operator": "GREATER_THAN", "value": 365, "valueType": "NUMBER"
  },
  "actions": [
    { "type": "SET_FACT", "parameters": { "targetVar": "betaEnabled", "value": true } }
  ]
}'

lexq analytics dry-run --version-id <vid> --debug --json '{
  "facts": { "lifetimeValue": 1500000, "signupDays": 400 }
}'
```

**Notes**

- `SET_FACT` creates the fact if it does not exist. `MUTATE_FACT` requires the target to already
  be present — that is the division of labor between them.
- Flags appear in `generatedVariables` in the response. `SET_FACT` produces no `__delta` because
  it is an assignment, not an arithmetic change.
- Segment on a `LIST_STRING` fact with `HAS_ANY` / `HAS_ALL` / `HAS_NONE`, not `CONTAINS`.
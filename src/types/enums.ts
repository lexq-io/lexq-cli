// Generated file. Do not edit by hand.
//
//   regenerate  node scripts/gen-enums.mjs      (needs the engine-delivered manifest)
//   verify      node scripts/gen-enums.mjs --check
//   source      lexq-engine, via contracts/lexq-manifest.cli.json
//
// To change a value, change the enum in the engine. To change which enums are
// exposed here, edit ORDER in scripts/gen-enums.mjs.

// ── Policy Engine ──
export const PolicyGroupStatus = ['ACTIVE', 'DISABLED', 'ARCHIVED'] as const;
export type PolicyGroupStatus = (typeof PolicyGroupStatus)[number];

export const PolicyVersionStatus = ['DRAFT', 'ACTIVE', 'ARCHIVED', 'EXPIRED'] as const;
export type PolicyVersionStatus = (typeof PolicyVersionStatus)[number];

// ── Condition & Action ──
// HAS_ANY/HAS_ALL/HAS_NONE are LIST-typed facts only (CONVENTIONS §26). Mirror of IN/NOT_IN:
// IN takes a scalar fact and a list value; HAS_* takes a list on both sides.
export const ConditionOperator = [
  'EQUALS',
  'NOT_EQUALS',
  'GREATER_THAN',
  'GREATER_THAN_OR_EQUAL',
  'LESS_THAN',
  'LESS_THAN_OR_EQUAL',
  'CONTAINS',
  'IN',
  'NOT_IN',
  'HAS_ANY',
  'HAS_ALL',
  'HAS_NONE',
] as const;
export type ConditionOperator = (typeof ConditionOperator)[number];

export const LogicalOperator = ['AND', 'OR'] as const;
export type LogicalOperator = (typeof LogicalOperator)[number];

export const ActionType = ['SET_FACT', 'MUTATE_FACT', 'BLOCK'] as const;
export type ActionType = (typeof ActionType)[number];

export const ValueType = ['STRING', 'NUMBER', 'BOOLEAN', 'LIST_STRING', 'LIST_NUMBER'] as const;
export type ValueType = (typeof ValueType)[number];

// ── Conflict Resolution ──
export const ConflictResolutionMode = ['NONE', 'EXCLUSIVE', 'MAX_N'] as const;
export type ConflictResolutionMode = (typeof ConflictResolutionMode)[number];

export const ConflictResolutionStrategy = ['HIGHEST_PRIORITY'] as const;
export type ConflictResolutionStrategy = (typeof ConflictResolutionStrategy)[number];

// ── Deployment ──
// PUBLISH removed — publishing is a qualification event, not a deployment (server enum dropped it).
export const DeploymentType = ['DEPLOY', 'ROLLBACK', 'UNDEPLOY'] as const;
export type DeploymentType = (typeof DeploymentType)[number];

// ── Execution ──
export const ApiExecutionStatus = ['SUCCESS', 'NO_MATCH', 'ERROR', 'TIMEOUT'] as const;
export type ApiExecutionStatus = (typeof ApiExecutionStatus)[number];

export const ApiExecutionType = ['SINGLE_GROUP', 'SPECIFIC_VERSION', 'BATCH', 'COMPOSITE'] as const;
export type ApiExecutionType = (typeof ApiExecutionType)[number];

// ── Latency Profile ──
export const ProfileCacheState = ['HIT', 'MISS'] as const;
export type ProfileCacheState = (typeof ProfileCacheState)[number];

export const ProfilePhase = ['TOTAL', 'CONDITION', 'ACTION'] as const;
export type ProfilePhase = (typeof ProfilePhase)[number];

export const BaselineStatus = ['OK', 'INSUFFICIENT_COHORT'] as const;
export type BaselineStatus = (typeof BaselineStatus)[number];

// ── Decision ──
export const DecisionStatus = ['SELECTED', 'NO_MATCH', 'NOT_SELECTED', 'BLOCKED', 'ERROR'] as const;
export type DecisionStatus = (typeof DecisionStatus)[number];

export const DecisionReasonCode = [
  'FINAL_WINNER',
  'EFFECTIVE_DATE_INVALID',
  'CONDITION_MISMATCH',
  'MUTEX_PRIORITY_LOST',
  'MUTEX_LIMIT_REACHED',
  'GROUP_PRIORITY_LOST',
  'GROUP_LIMIT_REACHED',
  'ACTION_ERROR',
  'ENGINE_ERROR',
] as const;
export type DecisionReasonCode = (typeof DecisionReasonCode)[number];

// ── Simulation ──
export const SimulationStatus = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELED'] as const;
export type SimulationStatus = (typeof SimulationStatus)[number];

export const SimulationDatasetType = ['HISTORICAL', 'UPLOADED', 'MANUAL'] as const;
export type SimulationDatasetType = (typeof SimulationDatasetType)[number];

export const SimulationDatasetSource = ['EXECUTION_LOGS', 'S3_BUCKET', 'REQUEST_BODY'] as const;
export type SimulationDatasetSource = (typeof SimulationDatasetSource)[number];

export const SimulationMetricType = ['COUNT', 'SUM', 'AVG'] as const;
export type SimulationMetricType = (typeof SimulationMetricType)[number];

// ── Auth ──
export const Role = ['SYSTEM_MANAGER', 'ADMIN', 'USER', 'VIEWER', 'API_CLIENT'] as const;
export type Role = (typeof Role)[number];

// ── Failure Log ──
export const FailureStatus = ['PENDING', 'RESOLVED', 'IGNORED'] as const;
export type FailureStatus = (typeof FailureStatus)[number];

export const FailureAction = ['IGNORE', 'RESOLVE'] as const;
export type FailureAction = (typeof FailureAction)[number];

export const TaskType = ['PLATFORM_WEBHOOK', 'SCHEDULED_DEPLOYMENT'] as const;
export type TaskType = (typeof TaskType)[number];

// ── Platform Event ──
export const PlatformEventType = [
  'VERSION_PUBLISHED',
  'DEPLOYED',
  'ROLLED_BACK',
  'UNDEPLOYED',
  'DEPLOY_SCHEDULED',
  'DEPLOY_SCHEDULE_CANCELED',
] as const;
export type PlatformEventType = (typeof PlatformEventType)[number];

export const WebhookPayloadFormat = ['GENERIC', 'SLACK'] as const;
export type WebhookPayloadFormat = (typeof WebhookPayloadFormat)[number];

export const Confidence = ['EXACT', 'AMBIGUOUS'] as const;
export type Confidence = (typeof Confidence)[number];

export const SourceKind = ['CONDITION', 'ACTION'] as const;
export type SourceKind = (typeof SourceKind)[number];

export const SkipReason = ['ALREADY_EXISTS', 'INVALID_KEY', 'RESERVED'] as const;
export type SkipReason = (typeof SkipReason)[number];

// ── Scheduled Deployment ──
export const DeploymentScheduleStatus = ['PENDING', 'EXECUTED', 'CANCELED', 'FAILED'] as const;
export type DeploymentScheduleStatus = (typeof DeploymentScheduleStatus)[number];

export const ScheduleCancelReason = [
  'MANUAL_DEPLOY',
  'ROLLBACK',
  'UNDEPLOY',
  'AB_TEST_STARTED',
  'GROUP_ARCHIVED',
  'USER_REQUEST',
] as const;
export type ScheduleCancelReason = (typeof ScheduleCancelReason)[number];

export const ScheduleFailureReason = [
  'HASH_MISMATCH',
  'VERSION_NOT_ACTIVE',
  'DEPLOY_ERROR',
] as const;
export type ScheduleFailureReason = (typeof ScheduleFailureReason)[number];

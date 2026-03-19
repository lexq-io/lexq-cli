// ── Policy Engine ──
export const PolicyGroupStatus = ['ACTIVE', 'DISABLED', 'ARCHIVED'] as const;
export type PolicyGroupStatus = (typeof PolicyGroupStatus)[number];

export const PolicyVersionStatus = ['DRAFT', 'ACTIVE', 'ARCHIVED', 'EXPIRED'] as const;
export type PolicyVersionStatus = (typeof PolicyVersionStatus)[number];

// ── Condition & Action ──
export const ConditionOperator = [
    'EQUALS', 'NOT_EQUALS',
    'GREATER_THAN', 'GREATER_THAN_OR_EQUAL',
    'LESS_THAN', 'LESS_THAN_OR_EQUAL',
    'CONTAINS', 'IN', 'NOT_IN',
] as const;
export type ConditionOperator = (typeof ConditionOperator)[number];

export const LogicalOperator = ['AND', 'OR'] as const;
export type LogicalOperator = (typeof LogicalOperator)[number];

export const ActionType = [
    'DISCOUNT', 'POINT', 'COUPON_ISSUE', 'BLOCK',
    'NOTIFICATION', 'WEBHOOK', 'SET_FACT', 'ADD_TAG',
] as const;
export type ActionType = (typeof ActionType)[number];

// ── Conflict Resolution ──
export const ConflictResolutionMode = ['NONE', 'EXCLUSIVE', 'MAX_N'] as const;
export type ConflictResolutionMode = (typeof ConflictResolutionMode)[number];

export const ConflictResolutionStrategy = ['FIRST_MATCH', 'HIGHEST_PRIORITY', 'MAX_BENEFIT'] as const;
export type ConflictResolutionStrategy = (typeof ConflictResolutionStrategy)[number];

// ── Fact ──
export const ValueType = ['STRING', 'NUMBER', 'BOOLEAN', 'LIST_STRING', 'LIST_NUMBER'] as const;
export type ValueType = (typeof ValueType)[number];

// ── Deployment ──
export const DeploymentType = ['PUBLISH', 'DEPLOY', 'ROLLBACK', 'UNDEPLOY'] as const;
export type DeploymentType = (typeof DeploymentType)[number];

// ── Simulation ──
export const SimulationStatus = ['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'] as const;
export type SimulationStatus = (typeof SimulationStatus)[number];

// ── Execution ──
export const ApiExecutionStatus = ['SUCCESS', 'NO_MATCH', 'ERROR', 'TIMEOUT'] as const;
export type ApiExecutionStatus = (typeof ApiExecutionStatus)[number];

export const ApiExecutionType = ['SINGLE_GROUP', 'SPECIFIC_VERSION', 'BATCH', 'COMPOSITE'] as const;
export type ApiExecutionType = (typeof ApiExecutionType)[number];

// ── Decision ──
export const DecisionStatus = [
    'SELECTED', 'NO_MATCH', 'NOT_SELECTED',
    'BLOCKED_MUTEX', 'LOST_PRIORITY', 'DROPPED_LIMIT', 'ERROR',
] as const;
export type DecisionStatus = (typeof DecisionStatus)[number];

// ── Integration ──
export const IntegrationType = ['COUPON', 'POINT', 'NOTIFICATION', 'CRM', 'MESSENGER', 'WEBHOOK'] as const;
export type IntegrationType = (typeof IntegrationType)[number];

// ── Auth ──
export const Role = ['ADMIN', 'USER', 'VIEWER', 'API_CLIENT'] as const;
export type Role = (typeof Role)[number];
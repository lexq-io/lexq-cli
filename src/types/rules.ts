import type {
    ConditionOperator,
    ConflictResolutionMode,
    ConflictResolutionStrategy,
    LogicalOperator,
    ActionType,
    ValueType,
} from './enums';

// ══════════════════════════════════════════
// Shared Structures (ConditionNode, ActionDefinition)
// ══════════════════════════════════════════

export interface SingleConditionNode {
    type: 'SINGLE';
    field: string;
    operator: ConditionOperator;
    value: unknown;
    valueType: ValueType;
}

export interface GroupConditionNode {
    type: 'GROUP';
    operator: LogicalOperator;
    children: ConditionNode[];
}

export type ConditionNode = SingleConditionNode | GroupConditionNode;

export interface ActionDefinition {
    type: ActionType;
    parameters: Record<string, unknown>;
}

// ══════════════════════════════════════════
// Response
// ══════════════════════════════════════════

export interface PolicyRuleSummary {
    id: string;
    name: string;
    priority: number;
    conditionSummary: string;
    totalConditionCount: number;
    actionSummary: string;
    totalActionCount: number;
    mutexGroup: string | null;
    mutexMode: ConflictResolutionMode;
    mutexStrategy: ConflictResolutionStrategy;
    isEnabled: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface PolicyRuleDetail {
    id: string;
    policyVersionId: string;
    name: string;
    priority: number;
    condition: ConditionNode;
    actions: ActionDefinition[];
    mutexGroup: string | null;
    mutexMode: ConflictResolutionMode;
    mutexStrategy: ConflictResolutionStrategy;
    mutexLimit: number | null;
    isEnabled: boolean;
    createdAt: string;
    updatedAt: string;
}

// ══════════════════════════════════════════
// Request
// ══════════════════════════════════════════

export interface CreateRuleRequest {
    name: string;
    priority: number;
    condition: ConditionNode;
    actions: ActionDefinition[];
    mutexGroup?: string;
    mutexMode?: ConflictResolutionMode;
    mutexStrategy?: ConflictResolutionStrategy;
    mutexLimit?: number;
    isEnabled?: boolean;
}

export interface UpdateRuleRequest {
    name?: string;
    priority?: number;
    condition?: ConditionNode;
    actions?: ActionDefinition[];
    mutexGroup?: string;
    mutexMode?: ConflictResolutionMode;
    mutexStrategy?: ConflictResolutionStrategy;
    mutexLimit?: number;
    isEnabled?: boolean;
}

export interface ReorderRulesRequest {
    rules: RulePriority[];
}

export interface RulePriority {
    ruleId: string;
    priority: number;
}

export interface ToggleRuleRequest {
    isEnabled: boolean;
}
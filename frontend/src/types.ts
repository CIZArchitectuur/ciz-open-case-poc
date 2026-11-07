import type { components } from './generated/case-api';

export type CreateCasePayload = components['schemas']['CreateCaseRequest'];

export type Decision = components['schemas']['Decision'];
export type Case = components['schemas']['Case'];

export type TaskType = 'REGISTRATION_ACCEPTANCE' | 'REQUEST_ADDITIONAL_INFORMATION' | 'SUPPLEMENT_PROVISION' | 'TRIAGE' | 'WLZ_INVESTIGATION_DECISION' | 'OUTGOING_COMMUNICATION';
export type TaskStatus = 'OPEN' | 'COMPLETED';

export type CaseTask = {
  taskId: string;
  caseId: string;
  type: TaskType;
  status: TaskStatus;
  createdAt: string;
  completedAt?: string | null;
};

export type CaseDocument = {
  documentId: string;
  caseId: string;
  fileName: string;
  contentType: string;
  size: number;
  sha256: string;
  createdAt: string;
};

export type AddressValidationResult = {
  status: 'MATCHED' | 'NO_MATCH' | 'UNAVAILABLE' | 'NOT_SUPPORTED' | 'INVALID_INPUT';
  message: string;
  suggestedStreet?: string | null;
  suggestedCity?: string | null;
  suggestedPostalCode?: string | null;
  suggestedHouseNumber?: string | null;
};

export type FactValue = boolean | string | number;
export type IntakeFacts = Record<string, FactValue>;

export type IntakeField = components['schemas']['IntakeField'];

export type IntakeForm = {
  formId: string;
  policyVersion: string;
  fields: IntakeField[];
};

export type PolicyEvaluation = {
  evaluationId: string;
  caseId: string;
  taskId: string;
  facts: IntakeFacts;
  canBeTakenIntoConsideration: boolean;
  outputs: Record<string, unknown>;
  resolvedInputs: Record<string, unknown>;
  policyVersion: string;
  engineVersion: string;
  schemaVersion: string;
  regulationHash: string;
  effectiveDate: string;
  evaluatedAt: string;
};

export type MedicalAssessment = {
  assessmentId: string;
  caseId: string;
  taskId: string;
  facts: IntakeFacts;
  assessmentComplete: boolean;
  criteriaMet: boolean;
  medicalAdviceRequired: boolean;
  outputs: Record<string, unknown>;
  resolvedInputs: Record<string, unknown>;
  policyVersion: string;
  engineVersion: string;
  schemaVersion: string;
  regulationHash: string;
  effectiveDate: string;
  assessedAt: string;
};

export type WorkItem = CaseTask & {
  case: Case;
  documents: CaseDocument[];
  intakeForm?: IntakeForm;
  policyEvaluations: PolicyEvaluation[];
  medicalAssessments: MedicalAssessment[];
};

export type TaskCompletionInput = components['schemas']['TaskCompletionRequest'];

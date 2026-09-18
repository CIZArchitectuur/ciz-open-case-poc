export type Case = {
  caseId: string;
  applicantId: string;
  clientName: string;
  lastName: string;
  initials: string;
  citizenServiceNumber: string;
  birthDate: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  country: string;
  permanentCareNeed: boolean;
  permanentSupervision: boolean;
  createdAt: string;
};

export type TaskType = 'APPLICATION_INTAKE' | 'ADDITIONAL_INFORMATION' | 'APPLICATION_REVIEW' | 'DECISION_REGISTRATION';
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

export type FactValue = boolean | string | number;
export type IntakeFacts = Record<string, FactValue>;

export type IntakeField = {
  factId: string;
  type: 'boolean' | 'string' | 'number' | 'date';
  required: boolean;
  label: string;
  description?: string | null;
};

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

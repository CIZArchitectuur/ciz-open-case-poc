export type CreateCasePayload = {
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
  applicantRole: 'client' | 'gemachtigde' | 'wettelijk_vertegenwoordiger';
  signedBy: 'client' | 'gemachtigde' | 'gevolmachtigde_of_wettelijk_vertegenwoordiger' | 'niemand' | 'anders';
  authorizationSignedByClient: boolean | null;
};

export type Case = {
  caseId: string;
  personId: string;
  addressId: string;
  applicationId: string;
  createdAt: string;
  person: {
    personId: string;
    clientName: string;
    lastName: string;
    initials: string;
    citizenServiceNumber: string;
    birthDate: string;
  };
  address: {
    addressId: string;
    personId: string;
    street: string;
    houseNumber: string;
    postalCode: string;
    city: string;
    country: string;
  };
  application: {
    applicationId: string;
    caseId: string;
    applicantId: string;
    permanentCareNeed: boolean;
    permanentSupervision: boolean;
    applicantRole: CreateCasePayload['applicantRole'];
    signedBy: CreateCasePayload['signedBy'];
    authorizationSignedByClient: boolean | null;
    submittedAt: string;
    applicantStatus: 'WAITING_FOR_REGISTRATION' | 'WAITING_FOR_DOCUMENTS' | 'WAITING_FOR_TRIAGE' | 'WAITING_FOR_ASSESSMENT' | 'DECISION_PENDING' | 'DECISION_SENT';
    statusUpdatedAt: string;
    supplementRequest?: string | null;
    supplementResponse?: string | null;
    supplementRequestedAt?: string | null;
    supplementRespondedAt?: string | null;
    decisionResult?: 'GRANTED' | 'DECLINED' | 'NOT_TAKEN_INTO_CONSIDERATION' | null;
    decisionMotivation?: string | null;
    decisionMadeAt?: string | null;
    decisionSentAt?: string | null;
  };
};

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

export type TaskCompletionInput = {
  facts?: IntakeFacts;
  registrationOutcome?: 'ACCEPTED' | 'REQUEST_ADDITIONAL_INFORMATION' | 'NOT_TAKEN_INTO_CONSIDERATION';
  triageOutcome?: 'FURTHER_INVESTIGATION' | 'DIRECT_HANDLED' | 'NOT_TAKEN_INTO_CONSIDERATION';
  decisionResult?: 'GRANTED' | 'DECLINED' | 'NOT_TAKEN_INTO_CONSIDERATION';
  decisionMotivation?: string;
  supplementText?: string;
};

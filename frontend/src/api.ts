import type { AddressValidationResult, Case, CaseDocument, CaseTask, CreateCasePayload, IntakeForm, MedicalAssessment, PolicyEvaluation, TaskCompletionInput, TaskStatus, TaskType } from './types';

type Problem = { title?: string; detail?: string };
export type DossierAnalysis = import('./generated/case-api').components['schemas']['DossierAnalysis'];
export type BasRun = import('./generated/case-api').components['schemas']['BasRun'];
export async function getBasRuns(caseId: string) {
  return parseResponse<BasRun[]>(await apiFetch(`/api/cases/${encodeURIComponent(caseId)}/bas-runs`));
}
export type AnalysisReview = import('./generated/case-api').components['schemas']['AnalysisReview'];
export type ReviewedFinding = import('./generated/case-api').components['schemas']['ReviewedFinding'];
const analysisUrl = (id: string) => `/api/cases/${encodeURIComponent(id)}/impairment-analyses`;
export async function getAnalyses(caseId: string) {
  return parseResponse<DossierAnalysis[]>(await apiFetch(analysisUrl(caseId)));
}
export async function startAnalysis(caseId: string) {
  return parseResponse<DossierAnalysis>(await apiFetch(analysisUrl(caseId), {method: 'POST'}));
}
export async function reviewAnalysis(caseId: string, id: string, review: AnalysisReview) {
  return parseResponse<DossierAnalysis>(await apiFetch(`${analysisUrl(caseId)}/${id}/review`, {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(review)
  }));
}
export async function getCases() { return parseResponse<Case[]>(await apiFetch('/api/cases')); }
export type DocumentExtraction = import('./generated/case-api').components['schemas']['DocumentExtraction'];
const extractionUrl = (caseId: string, documentId: string) =>
  `/api/cases/${encodeURIComponent(caseId)}/documents/${encodeURIComponent(documentId)}/structuring`;
export async function startDocumentExtraction(caseId: string, documentId: string) {
  return parseResponse<DocumentExtraction>(await apiFetch(extractionUrl(caseId, documentId), {method: 'POST'}));
}
export async function getDocumentExtraction(caseId: string, documentId: string) {
  const response = await apiFetch(extractionUrl(caseId, documentId));
  if (response.status === 404) return null;
  return parseResponse<DocumentExtraction>(response);
}
export async function reviewDocumentExtraction(caseId: string, documentId: string, text: string) {
  return parseResponse<DocumentExtraction>(await apiFetch(extractionUrl(caseId, documentId) + '/review', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({text, confirmed: true})
  }));
}

let accessTokenSupplier: () => string | undefined = () => undefined;

export function setAccessTokenSupplier(supplier: () => string | undefined) {
  accessTokenSupplier = supplier;
}

async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const accessToken = accessTokenSupplier();
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
  return fetch(input, { ...init, headers });
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T | Problem;
  if (!response.ok) {
    const problem = body as Problem;
    throw new Error(problem.detail ?? problem.title ?? 'De aanvraag kon niet worden verwerkt.');
  }
  return body as T;
}

export async function createCase(payload: CreateCasePayload) {
  return parseResponse<Case>(await apiFetch('/api/cases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }));
}

export async function createCaseDraft(payload: CreateCasePayload) {
  return parseResponse<Case>(await apiFetch('/api/cases/drafts', {
    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
  }));
}

export async function submitCase(caseId: string) {
  return parseResponse<Case>(await apiFetch(`/api/cases/${encodeURIComponent(caseId)}/submit`, {method: 'POST'}));
}

export async function validateAddress(country: string, postalCode: string, houseNumber: string) {
  return parseResponse<AddressValidationResult>(await apiFetch('/api/cases/address-validation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ country, postalCode, houseNumber })
  }));
}

export async function getCase(caseId: string) {
  return parseResponse<Case>(await apiFetch(`/api/cases/${encodeURIComponent(caseId)}`));
}

export async function getCaseStatus(caseId: string) {
  return parseResponse<{ caseId: string; status: Case['application']['applicantStatus']; updatedAt: string }>(
    await apiFetch(`/api/cases/${encodeURIComponent(caseId)}/status`)
  );
}

export async function getPersonCases(personId: string) {
  return parseResponse<Case[]>(await apiFetch(`/api/persons/${encodeURIComponent(personId)}/cases`));
}

export async function getCaseTasks(caseId: string) {
  return parseResponse<CaseTask[]>(await apiFetch(`/api/cases/${encodeURIComponent(caseId)}/tasks`));
}

export async function getCaseDocuments(caseId: string) {
  return parseResponse<CaseDocument[]>(await apiFetch(`/api/cases/${encodeURIComponent(caseId)}/documents`));
}

export async function getCasePolicyEvaluations(caseId: string) {
  return parseResponse<PolicyEvaluation[]>(await apiFetch(`/api/cases/${encodeURIComponent(caseId)}/policy-evaluations`));
}

export async function getCaseMedicalAssessments(caseId: string) {
  return parseResponse<MedicalAssessment[]>(await apiFetch(`/api/cases/${encodeURIComponent(caseId)}/medical-assessments`));
}

export async function uploadCaseDocument(caseId: string, file: File) {
  return parseResponse<CaseDocument>(await apiFetch(
    `/api/cases/${encodeURIComponent(caseId)}/documents`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Document-File-Name': encodeURIComponent(file.name),
        'X-Document-Content-Type': file.type
      },
      body: file
    }
  ));
}

export function documentDownloadUrl(caseId: string, documentId: string) {
  return `/api/cases/${encodeURIComponent(caseId)}/documents/${encodeURIComponent(documentId)}/content`;
}

export async function downloadCaseDocument(caseId: string, documentId: string) {
  const response = await apiFetch(documentDownloadUrl(caseId, documentId));
  if (!response.ok) {
    let problem: Problem = {};
    try { problem = await response.json() as Problem; } catch { /* use the safe fallback below */ }
    throw new Error(problem.detail ?? problem.title ?? 'Het document kon niet worden gedownload.');
  }
  return response.blob();
}

export async function getTasks(status: TaskStatus, type: TaskType) {
  const parameters = new URLSearchParams({ status, type });
  return parseResponse<CaseTask[]>(await apiFetch(`/api/tasks?${parameters}`));
}

export async function getTaskIntakeForm(taskId: string) {
  return parseResponse<IntakeForm>(await apiFetch(`/api/tasks/${encodeURIComponent(taskId)}/intake-form`));
}

export async function getTaskMedicalAssessmentForm(taskId: string) {
  return parseResponse<IntakeForm>(await apiFetch(`/api/tasks/${encodeURIComponent(taskId)}/medical-assessment-form`));
}

export async function completeTask(taskId: string, input?: TaskCompletionInput) {
  return parseResponse<CaseTask>(await apiFetch(`/api/tasks/${encodeURIComponent(taskId)}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input ?? {})
  }));
}

export async function provideApplicantSupplement(caseId: string, supplementText: string) {
  return parseResponse<CaseTask>(await apiFetch(`/api/cases/${encodeURIComponent(caseId)}/supplement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ supplementText })
  }));
}

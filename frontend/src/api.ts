import type { Case, CaseDocument, CaseTask, IntakeFacts, IntakeForm, MedicalAssessment, PolicyEvaluation, TaskStatus, TaskType } from './types';

type Problem = { title?: string; detail?: string };

async function parseResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T | Problem;
  if (!response.ok) {
    const problem = body as Problem;
    throw new Error(problem.detail ?? problem.title ?? 'De aanvraag kon niet worden verwerkt.');
  }
  return body as T;
}

export async function createCase(payload: Omit<Case, 'caseId' | 'createdAt'>) {
  return parseResponse<Case>(await fetch('/cases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }));
}

export async function getCase(caseId: string) {
  return parseResponse<Case>(await fetch(`/cases/${encodeURIComponent(caseId)}`));
}

export async function getCaseTasks(caseId: string) {
  return parseResponse<CaseTask[]>(await fetch(`/cases/${encodeURIComponent(caseId)}/tasks`));
}

export async function getCaseDocuments(caseId: string) {
  return parseResponse<CaseDocument[]>(await fetch(`/cases/${encodeURIComponent(caseId)}/documents`));
}

export async function getCasePolicyEvaluations(caseId: string) {
  return parseResponse<PolicyEvaluation[]>(await fetch(`/cases/${encodeURIComponent(caseId)}/policy-evaluations`));
}

export async function getCaseMedicalAssessments(caseId: string) {
  return parseResponse<MedicalAssessment[]>(await fetch(`/cases/${encodeURIComponent(caseId)}/medical-assessments`));
}

export async function uploadCaseDocument(caseId: string, file: File) {
  return parseResponse<CaseDocument>(await fetch(
    `/cases/${encodeURIComponent(caseId)}/documents`,
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
  return `/cases/${encodeURIComponent(caseId)}/documents/${encodeURIComponent(documentId)}/content`;
}

export async function getTasks(status: TaskStatus, type: TaskType) {
  const parameters = new URLSearchParams({ status, type });
  return parseResponse<CaseTask[]>(await fetch(`/tasks?${parameters}`));
}

export async function getTaskIntakeForm(taskId: string) {
  return parseResponse<IntakeForm>(await fetch(`/tasks/${encodeURIComponent(taskId)}/intake-form`));
}

export async function getTaskMedicalAssessmentForm(taskId: string) {
  return parseResponse<IntakeForm>(await fetch(`/tasks/${encodeURIComponent(taskId)}/medical-assessment-form`));
}

export async function completeTask(taskId: string, facts?: IntakeFacts) {
  return parseResponse<CaseTask>(await fetch(`/tasks/${encodeURIComponent(taskId)}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(facts ? { facts } : {})
  }));
}

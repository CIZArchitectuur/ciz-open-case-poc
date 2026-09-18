import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { completeTask, createCase, documentDownloadUrl, getCase, getCaseDocuments, getCaseMedicalAssessments, getCasePolicyEvaluations, getCaseTasks, getTaskIntakeForm, getTaskMedicalAssessmentForm, getTasks, uploadCaseDocument } from './api';
import type { Case, CaseDocument, CaseTask, FactValue, IntakeFacts, IntakeField, MedicalAssessment, PolicyEvaluation, TaskType, WorkItem } from './types';
import './styles.css';

const initialForm = {
  applicantId: '',
  clientName: '',
  lastName: '',
  initials: '',
  citizenServiceNumber: '',
  birthDate: '',
  street: '',
  houseNumber: '',
  postalCode: '',
  city: '',
  country: 'Nederland',
  permanentCareNeed: false,
  permanentSupervision: false
};

const routes = [
  { path: '/aanvrager', label: 'Aanvrager' },
  { path: '/beoordelaar', label: 'Beoordelaar' },
  { path: '/ciz-medewerker', label: 'CIZ-medewerker' }
];

function errorMessage(value: unknown) {
  return value instanceof Error ? value.message : 'Er ging iets mis.';
}

function applicantStatus(tasks: CaseTask[]) {
  const decision = tasks.find(task => task.type === 'DECISION_REGISTRATION');
  if (decision?.status === 'COMPLETED') return 'Afgerond';
  if (decision?.status === 'OPEN') return 'Administratieve afhandeling';
  const review = tasks.find(task => task.type === 'APPLICATION_REVIEW');
  if (review) return 'In beoordeling';
  const additional = tasks.find(task => task.type === 'ADDITIONAL_INFORMATION' && task.status === 'OPEN');
  if (additional) return 'Aanvullende informatie nodig';
  return 'In intake';
}

function CaseDetails({ value }: { value: Case }) {
  return <dl>
    <dt>Zaak-ID</dt><dd>{value.caseId}</dd>
    <dt>Aanvrager</dt><dd>{value.applicantId}</dd>
    <dt>Naam</dt><dd>{value.clientName}</dd>
    <dt>Geboortedatum</dt><dd>{value.birthDate}</dd>
    <dt>Adres</dt><dd>{value.street} {value.houseNumber}, {value.postalCode} {value.city}, {value.country}</dd>
    <dt>Zorgbehoefte</dt><dd>{value.permanentCareNeed ? 'Blijvend' : 'Niet blijvend'}</dd>
    <dt>Permanent toezicht</dt><dd>{value.permanentSupervision ? 'Ja' : 'Nee'}</dd>
  </dl>;
}

function formatSize(size: number) {
  if (size < 1024) return `${size} bytes`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentList({ caseId, documents }: { caseId: string; documents: CaseDocument[] }) {
  if (documents.length === 0) return <p className="document-empty">Nog geen aanvullende documenten.</p>;
  return <ul className="document-list">
    {documents.map(document => <li key={document.documentId}>
      <div><strong>{document.fileName}</strong><span>{formatSize(document.size)} · veilig opgeslagen</span></div>
      <a className="text-link" href={documentDownloadUrl(caseId, document.documentId)}>Downloaden</a>
    </li>)}
  </ul>;
}

function ApplicantPage() {
  const queryId = new URLSearchParams(window.location.search).get('caseId') ?? '';
  const rememberedId = queryId || window.localStorage.getItem('ciz-last-case-id') || '';
  const [form, setForm] = useState(initialForm);
  const [lookupId, setLookupId] = useState(rememberedId);
  const [currentCase, setCurrentCase] = useState<Case | null>(null);
  const [tasks, setTasks] = useState<CaseTask[]>([]);
  const [documents, setDocuments] = useState<CaseDocument[]>([]);
  const [policyEvaluations, setPolicyEvaluations] = useState<PolicyEvaluation[]>([]);
  const [medicalAssessments, setMedicalAssessments] = useState<MedicalAssessment[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const openCase = useCallback(async (caseId: string, updateUrl = true) => {
    setBusy(true);
    setError('');
    try {
      const [found, foundTasks, foundDocuments, foundEvaluations, foundAssessments] = await Promise.all([
        getCase(caseId), getCaseTasks(caseId), getCaseDocuments(caseId), getCasePolicyEvaluations(caseId),
        getCaseMedicalAssessments(caseId)
      ]);
      setCurrentCase(found);
      setTasks(foundTasks);
      setDocuments(foundDocuments);
      setPolicyEvaluations(foundEvaluations);
      setMedicalAssessments(foundAssessments);
      setLookupId(found.caseId);
      window.localStorage.setItem('ciz-last-case-id', found.caseId);
      if (updateUrl) {
        window.history.replaceState(null, '', `/aanvrager?caseId=${encodeURIComponent(found.caseId)}`);
      }
    } catch (caught) {
      setCurrentCase(null);
      setTasks([]);
      setDocuments([]);
      setPolicyEvaluations([]);
      setMedicalAssessments([]);
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (rememberedId) void openCase(rememberedId, Boolean(queryId));
  }, []);

  async function submitApplication(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await createCase(form);
      setForm(initialForm);
      await openCase(created.caseId);
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  function retrieveApplication(event: FormEvent) {
    event.preventDefault();
    void openCase(lookupId);
  }

  const intakeDone = tasks.some(task => task.type === 'APPLICATION_INTAKE' && task.status === 'COMPLETED');
  const review = tasks.find(task => task.type === 'APPLICATION_REVIEW');
  const reviewDone = review?.status === 'COMPLETED';
  const decision = tasks.find(task => task.type === 'DECISION_REGISTRATION');

  return <div className="page-grid">
    <section>
      <span className="section-kicker">Burgerportaal</span>
      <h2>Nieuwe Wlz-aanvraag</h2>
      <p className="intro">Dien een aanvraag in en volg daarna de voortgang via het zaaknummer.</p>
      <form onSubmit={submitApplication}>
        <label>Aanvrager-ID<input required maxLength={100} value={form.applicantId} onChange={event => setForm({...form, applicantId: event.target.value})} /></label>
        <label>Naam cliënt<input required maxLength={200} value={form.clientName} onChange={event => setForm({...form, clientName: event.target.value})} /></label>
        <div className="form-row">
          <label>Achternaam<input required maxLength={100} value={form.lastName} onChange={event => setForm({...form, lastName: event.target.value})} /></label>
          <label>Voorletters<input required maxLength={20} value={form.initials} onChange={event => setForm({...form, initials: event.target.value})} /></label>
        </div>
        <label>BSN<input required inputMode="numeric" pattern="[0-9]{9}" maxLength={9} value={form.citizenServiceNumber} onChange={event => setForm({...form, citizenServiceNumber: event.target.value.replace(/\D/g, '')})} /></label>
        <label>Geboortedatum<input required type="date" max={new Date().toISOString().slice(0, 10)} value={form.birthDate} onChange={event => setForm({...form, birthDate: event.target.value})} /></label>
        <div className="form-row address-row">
          <label>Straat<input required maxLength={120} value={form.street} onChange={event => setForm({...form, street: event.target.value})} /></label>
          <label>Huisnummer<input required maxLength={20} value={form.houseNumber} onChange={event => setForm({...form, houseNumber: event.target.value})} /></label>
        </div>
        <div className="form-row">
          <label>Postcode<input required maxLength={12} value={form.postalCode} onChange={event => setForm({...form, postalCode: event.target.value})} /></label>
          <label>Woonplaats<input required maxLength={120} value={form.city} onChange={event => setForm({...form, city: event.target.value})} /></label>
        </div>
        <label>Land<input required maxLength={80} value={form.country} onChange={event => setForm({...form, country: event.target.value})} /></label>
        <label className="check"><input type="checkbox" checked={form.permanentCareNeed} onChange={event => setForm({...form, permanentCareNeed: event.target.checked})} />Blijvende behoefte aan zorg</label>
        <label className="check"><input type="checkbox" checked={form.permanentSupervision} onChange={event => setForm({...form, permanentSupervision: event.target.checked})} />Permanent toezicht nodig</label>
        <button disabled={busy}>{busy ? 'Bezig…' : 'Aanvraag indienen'}</button>
      </form>
    </section>

    <section>
      <span className="section-kicker">Mijn aanvraag</span>
      <h2>Voortgang bekijken</h2>
      <form className="lookup" onSubmit={retrieveApplication}>
        <label>Zaak-ID<input required value={lookupId} onChange={event => setLookupId(event.target.value)} placeholder="UUID" /></label>
        <button disabled={busy}>Ophalen</button>
      </form>
      {error && <div className="error" role="alert">{error}</div>}
      {currentCase && <article className="result">
        <div className="result-heading">
          <div><span className="muted">Aanvraag van</span><h3>{currentCase.clientName}</h3></div>
          <span className="status">{applicantStatus(tasks)}</span>
        </div>
        <CaseDetails value={currentCase} />
        <ol className="progress four-steps" aria-label="Voortgang aanvraag">
          <li className="done">Ontvangen</li>
          <li className={intakeDone ? 'done' : 'active'}>Intake</li>
          <li className={reviewDone ? 'done' : review ? 'active' : ''}>Beoordeling</li>
          <li className={decision?.status === 'COMPLETED' ? 'done' : decision ? 'active' : ''}>Afhandeling</li>
        </ol>
        <div className="documents-block">
          <h4>Documenten bij uw aanvraag</h4>
          <DocumentList caseId={currentCase.caseId} documents={documents} />
          <p className="resume-hint">Ontvangen stukken worden door een CIZ-medewerker aan uw aanvraag toegevoegd.</p>
        </div>
        {policyEvaluations.length > 0 && <PolicyOutcome value={policyEvaluations.at(-1)!} compact />}
        {decision?.status === 'COMPLETED' && medicalAssessments.length > 0
          && <MedicalAssessmentOutcome value={medicalAssessments.at(-1)!} compact />}
        <p className="resume-hint">Deze pagina kan later opnieuw worden geopend via het bewaarde adres.</p>
      </article>}
    </section>
  </div>;
}

type QueueMode = 'review' | 'document-intake' | 'additional-information' | 'decision';

function initialValue(field: IntakeField): FactValue {
  return '';
}

const policyOutputLabels: Record<string, string> = {
  aanvraag_voldoet_aan_awb_vereisten: 'Algemene aanvraaggegevens compleet',
  overige_voorschriften_voldaan: 'Aanvullende wettelijke voorwaarden compleet',
  kan_aanvraag_in_behandeling_worden_genomen: 'Klaar voor inhoudelijke behandeling',
  medische_onderbouwing_compleet: 'Medische onderbouwing compleet',
  intensieve_zorgbehoefte_vastgesteld: 'Intensieve zorgbehoefte vastgesteld',
  medisch_advies_afgerond: 'Medisch advies afgerond',
  voldoet_aan_medische_wlz_criteria: 'Medische Wlz-criteria aangetoond',
  medische_beoordeling_compleet: 'Medische beoordeling compleet'
};

function labelForOutput(name: string) {
  if (policyOutputLabels[name]) return policyOutputLabels[name];
  const label = name.replaceAll('_', ' ');
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function policyResult(result: unknown) {
  if (result === true) return <span className="check-result positive">In orde</span>;
  if (result === false) return <span className="check-result negative">Niet voldaan</span>;
  if (typeof result === 'object' && result !== null && '__unknown' in result) {
    return <span className="check-result negative">Gegevens ontbreken</span>;
  }
  return <span className="check-result neutral">{String(result)}</span>;
}

function missingFactIds(evaluation: PolicyEvaluation | undefined) {
  const missing = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    const record = value as Record<string, unknown>;
    if (record.__unknown === true && Array.isArray(record.missing)) {
      record.missing.forEach(item => {
        if (typeof item === 'object' && item !== null && typeof (item as Record<string, unknown>).name === 'string') {
          missing.add(String((item as Record<string, unknown>).name));
        }
      });
    }
    Object.values(record).forEach(visit);
  };
  visit(evaluation?.outputs);
  return missing;
}

function allowedValues(field: IntakeField) {
  const match = field.description?.match(/Toegestane waarden(?: \([^)]*\))?:\s*([^.]+)\./i);
  return match ? match[1].split(',').map(value => value.trim()).filter(Boolean) : [];
}

function attentionFor(field: IntakeField, value: FactValue, missing: Set<string>) {
  if (missing.has(field.factId)) return 'Nodig in deze situatie';
  if (field.required && String(value ?? '').trim() === '') return 'Nodig voor eerste toets';
  const options = allowedValues(field);
  if (String(value ?? '').trim() !== '' && options.length > 0 && !options.includes(String(value))) {
    return 'Kies een geldige waarde';
  }
  return undefined;
}

function PolicyOutcome({ value, compact = false, form }: { value: PolicyEvaluation; compact?: boolean; form?: WorkItem['intakeForm'] }) {
  const missing = [...missingFactIds(value)];
  const fieldLabels = new Map(form?.fields.map(field => [field.factId, field.label]) ?? []);
  return <div className={`policy-outcome ${value.canBeTakenIntoConsideration ? 'positive' : 'negative'}`}>
    <strong>{value.canBeTakenIntoConsideration ? 'De aanvraag is compleet' : 'De aanvraag is nog niet compleet'}</strong>
    <span>{value.canBeTakenIntoConsideration
      ? 'De controle heeft geen ontbrekende vereisten gevonden.'
      : missing.length > 0
        ? `${missing.length} ${missing.length === 1 ? 'gegeven ontbreekt' : 'gegevens ontbreken'} nog.`
        : 'Alle benodigde gegevens zijn ingevuld, maar uit één of meer antwoorden blijkt dat nog niet aan de voorwaarden wordt voldaan.'}</span>
    {!compact && <>
      {!value.canBeTakenIntoConsideration && missing.length > 0 && <div className="missing-facts" role="status">
        <strong>Nog invullen</strong>
        <ul>{missing.map(factId => <li key={factId}>{fieldLabels.get(factId) ?? labelForOutput(factId)}</li>)}</ul>
      </div>}
      <div className="outcome-next-step">
        <strong>Volgende stap</strong>
        <span>{value.canBeTakenIntoConsideration
          ? 'De aanvraag kan door naar de inhoudelijke beoordeling.'
          : missing.length > 0
            ? 'Vul de hierboven genoemde gegevens aan en voer daarna de controle opnieuw uit.'
            : 'Bekijk de onderdelen met “Niet voldaan”, corrigeer alleen een antwoord als het feitelijk onjuist is en voer daarna de controle opnieuw uit.'}</span>
      </div>
      <div className="policy-results" aria-label="Resultaten van de beleidscontrole">
        {Object.entries(value.outputs).map(([name, result]) => <div className="policy-result" key={name}>
          <span>{labelForOutput(name)}</span>{policyResult(result)}
        </div>)}
      </div>
      <details className="technical-details">
        <summary>Technische gegevens</summary>
        <dl>
          <dt>Beleid gecontroleerd op</dt><dd>{value.effectiveDate}</dd>
          <dt>Beleidsversie</dt><dd>{value.policyVersion.slice(0, 12)}</dd>
          <dt>RegelRecht-versie</dt><dd>{value.engineVersion}</dd>
          <dt>Regelset-hash</dt><dd>{value.regulationHash.slice(0, 12)}…</dd>
        </dl>
      </details>
    </>}
  </div>;
}

function MedicalAssessmentOutcome({ value, compact = false }: { value: MedicalAssessment; compact?: boolean }) {
  return <div className={`policy-outcome ${value.criteriaMet ? 'positive' : 'negative'}`}>
    <strong>{value.criteriaMet ? 'Medische criteria zijn aangetoond' : 'Medische criteria zijn niet aangetoond'}</strong>
    <span>{value.criteriaMet
      ? 'RegelRecht ondersteunt op basis van de gevalideerde bevindingen een positief besluitvoorstel.'
      : 'De gevalideerde bevindingen ondersteunen geen positief besluitvoorstel.'}</span>
    {!compact && <>
      <div className="policy-results" aria-label="Resultaten van de medische beleidstoets">
        {Object.entries(value.outputs).map(([name, result]) => <div className="policy-result" key={name}>
          <span>{labelForOutput(name)}</span>{policyResult(result)}
        </div>)}
      </div>
      <details className="technical-details">
        <summary>Herkomst van het beleidsoordeel</summary>
        <dl>
          <dt>Beleid gecontroleerd op</dt><dd>{value.effectiveDate}</dd>
          <dt>Beleidsversie</dt><dd>{value.policyVersion.slice(0, 12)}</dd>
          <dt>RegelRecht-versie</dt><dd>{value.engineVersion}</dd>
          <dt>Regelset-hash</dt><dd>{value.regulationHash.slice(0, 12)}…</dd>
        </dl>
      </details>
    </>}
  </div>;
}

function DynamicIntakeField({ field, value, onChange, attention, locked = false }: {
  field: IntakeField; value: FactValue; onChange: (value: FactValue) => void; attention?: string; locked?: boolean;
}) {
  if (field.type === 'boolean') {
    return <label className={`policy-field ${attention ? 'needs-attention' : ''}`}>
      <span>{field.label}{locked ? <b>Overgenomen uit aanvraag</b> : attention && <b>{attention}</b>}</span>
      <select disabled={locked} value={value === true ? 'true' : value === false ? 'false' : ''}
        onChange={event => onChange(event.target.value === '' ? '' : event.target.value === 'true')}>
        <option value="">Nog niet ingevuld</option>
        <option value="true">Ja</option>
        <option value="false">Nee</option>
      </select>
      {field.description && <small>{field.description}</small>}
    </label>;
  }
  const options = allowedValues(field);
  return <label className={`policy-field ${attention ? 'needs-attention' : ''}`}>{field.label}{attention && <b>{attention}</b>}
    {options.length > 0
      ? <select value={String(value)} onChange={event => onChange(event.target.value)}>
          <option value="">Maak een keuze</option>
          {String(value) && !options.includes(String(value)) && <option value={String(value)} disabled>Ongeldige eerdere waarde: {String(value)}</option>}
          {options.map(option => <option key={option} value={option}>{labelForOutput(option)}</option>)}
        </select>
      : field.factId === 'beoordelingsmotivering'
        ? <textarea rows={5} value={String(value)} onChange={event => onChange(event.target.value)} />
        : <input type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
          value={String(value)}
          onChange={event => onChange(field.type === 'number' && event.target.value !== ''
            ? Number(event.target.value) : event.target.value)} />}
    {field.description && <small>{field.description}</small>}
  </label>;
}

const applicantFactIds = new Set([
  'achternaam_aanwezig', 'voorletters_aanwezig', 'bsn_aanwezig', 'geboortedatum_aanwezig',
  'straat_aanwezig', 'huisnummer_aanwezig', 'postcode_aanwezig', 'woonplaats_aanwezig', 'land_aanwezig'
]);

function applicantFacts(value: Case): IntakeFacts {
  return {
    achternaam_aanwezig: Boolean(value.lastName.trim()),
    voorletters_aanwezig: Boolean(value.initials.trim()),
    bsn_aanwezig: Boolean(value.citizenServiceNumber.trim()),
    geboortedatum_aanwezig: Boolean(value.birthDate),
    straat_aanwezig: Boolean(value.street.trim()),
    huisnummer_aanwezig: Boolean(value.houseNumber.trim()),
    postcode_aanwezig: Boolean(value.postalCode.trim()),
    woonplaats_aanwezig: Boolean(value.city.trim()),
    land_aanwezig: Boolean(value.country.trim())
  };
}

function intakeIsReady(item: WorkItem, facts: IntakeFacts | undefined) {
  if (!item.intakeForm || !facts) return false;
  return item.intakeForm.fields.every(field => !field.required
    || (String(facts[field.factId] ?? '').trim() !== ''
      && (allowedValues(field).length === 0 || allowedValues(field).includes(String(facts[field.factId])))));
}

function factsForSubmission(item: WorkItem, facts: IntakeFacts | undefined) {
  if (!item.intakeForm || !facts) return undefined;
  return Object.fromEntries(item.intakeForm.fields.flatMap(field => {
    const value = facts[field.factId];
    return String(value ?? '').trim() === '' ? [] : [[field.factId, value]];
  }));
}

function WorkQueue({ type, mode, onWorkflowChange }: { type: TaskType; mode: QueueMode; onWorkflowChange?: () => void }) {
  const [items, setItems] = useState<WorkItem[]>([]);
  const [error, setError] = useState('');
  const [busyTask, setBusyTask] = useState('');
  const [busyUpload, setBusyUpload] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | null>>({});
  const [loading, setLoading] = useState(true);
  const [factsByTask, setFactsByTask] = useState<Record<string, IntakeFacts>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const tasks = await getTasks('OPEN', type);
      const loadedItems = await Promise.all(tasks.map(async task => {
        const [caseValue, documents, policyEvaluations, medicalAssessments, intakeForm] = await Promise.all([
          getCase(task.caseId),
          getCaseDocuments(task.caseId),
          getCasePolicyEvaluations(task.caseId),
          getCaseMedicalAssessments(task.caseId),
          mode === 'review' ? getTaskMedicalAssessmentForm(task.taskId)
            : mode === 'document-intake' || mode === 'additional-information'
              ? getTaskIntakeForm(task.taskId) : Promise.resolve(undefined)
        ]);
        return { ...task, case: caseValue, documents, policyEvaluations, medicalAssessments, intakeForm };
      }));
      setItems(loadedItems);
      setFactsByTask(current => {
        const next = { ...current };
        loadedItems.forEach(item => {
          if (item.intakeForm && !next[item.taskId]) {
            const savedFacts = mode === 'review'
              ? item.medicalAssessments.at(-1)?.facts ?? {}
              : item.policyEvaluations.at(-1)?.facts ?? {};
            const automaticFacts: IntakeFacts = mode === 'review' ? {} : applicantFacts(item.case);
            next[item.taskId] = Object.fromEntries(item.intakeForm.fields.map(field => [
              field.factId,
              Object.prototype.hasOwnProperty.call(automaticFacts, field.factId)
                ? automaticFacts[field.factId]
                : Object.prototype.hasOwnProperty.call(savedFacts, field.factId)
                  ? savedFacts[field.factId] : initialValue(field)
            ]));
          }
        });
        return next;
      });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [type, mode]);

  useEffect(() => { void load(); }, [load]);

  async function finish(item: WorkItem) {
    setBusyTask(item.taskId);
    setError('');
    try {
      await completeTask(item.taskId, mode === 'review' || mode === 'document-intake' || mode === 'additional-information'
        ? factsForSubmission(item, factsByTask[item.taskId]) : undefined);
      if (onWorkflowChange) onWorkflowChange();
      else await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusyTask('');
    }
  }

  async function uploadDocument(event: FormEvent<HTMLFormElement>, item: WorkItem) {
    event.preventDefault();
    const file = selectedFiles[item.taskId];
    if (!file) return;
    const form = event.currentTarget;
    setBusyUpload(item.taskId);
    setError('');
    try {
      await uploadCaseDocument(item.caseId, file);
      const documents = await getCaseDocuments(item.caseId);
      setItems(current => current.map(currentItem => currentItem.taskId === item.taskId
        ? { ...currentItem, documents }
        : currentItem));
      setSelectedFiles(current => ({ ...current, [item.taskId]: null }));
      form.reset();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusyUpload('');
    }
  }

  const reviewer = mode === 'review';
  const documentIntake = mode === 'document-intake';
  const additionalInformation = mode === 'additional-information';
  const canUpload = !reviewer;
  return <section className="queue-section">
    <div className="queue-heading">
      <div>
        <span className="section-kicker">{reviewer ? 'Beoordelaarsportaal' : 'Zaakbeheer'}</span>
        <h2>{reviewer ? 'Te beoordelen aanvragen' : documentIntake ? 'Compleetheid beoordelen' : additionalInformation ? 'Aanvullende informatie' : 'Besluiten administratief verwerken'}</h2>
        <p className="intro">{reviewer
          ? 'Openstaande beoordelingstaken uit Operaton. Documenten kunnen hier alleen worden ingezien.'
          : documentIntake
            ? 'Controleer de feiten. RegelRecht bepaalt op basis van het vastgelegde beleid of de aanvraag door mag.'
            : additionalInformation
              ? 'Vul de gemarkeerde gegevens aan. Eerdere antwoorden blijven bewaard en RegelRecht voert de controle opnieuw uit.'
            : 'Verwerk het genomen besluit administratief en rond daarna de aanvraag af.'}</p>
      </div>
      <button className="secondary" disabled={loading} onClick={() => void load()}>Vernieuwen</button>
    </div>
    {error && <div className="error" role="alert">{error}</div>}
    {loading && <p className="empty">Werkvoorraad laden…</p>}
    {!loading && items.length === 0 && <div className="empty"><strong>Geen openstaande taken</strong><span>De werkvoorraad is bijgewerkt.</span></div>}
    <div className={`work-list ${reviewer || documentIntake || additionalInformation ? 'intake-work-list' : ''}`}>
      {items.map(item => {
        const latestEvaluation = item.policyEvaluations.at(-1);
        const missing = missingFactIds(latestEvaluation);
        const currentFacts = factsByTask[item.taskId] ?? {};
        const automaticApplicantFacts = applicantFacts(item.case);
        return <article className="work-card" key={item.taskId}>
        <div className="work-card-header">
          <div><span className="muted">Zaak {item.caseId.slice(0, 8)}</span><h3>{item.case.clientName}</h3></div>
          <span className="status">Open</span>
        </div>
        <CaseDetails value={item.case} />
        {additionalInformation && latestEvaluation && <PolicyOutcome value={latestEvaluation} form={item.intakeForm} />}
        {(reviewer || documentIntake || additionalInformation) && item.intakeForm && <fieldset className="policy-checks">
          <legend>{reviewer ? 'Medisch-inhoudelijke beoordeling' : additionalInformation ? 'Gegevens aanvullen' : 'Controle volgens actueel beleid'}</legend>
          <div className="policy-version">Formulier uit RegelRecht-beleid · versie {item.intakeForm.policyVersion.slice(0, 12)}</div>
          {reviewer && <div className="attention-help medical">
            <strong>Valideer alleen feiten uit betrouwbare bronstukken</strong>
            <span>RegelRecht ondersteunt het besluitvoorstel. De beoordelaar blijft verantwoordelijk voor de vastgelegde medische bevindingen en motivering.</span>
          </div>}
          {additionalInformation && <div className="attention-help">
            <strong>Eerdere antwoorden zijn teruggezet</strong>
            <span>RegelRecht markeert welke nog niet ingevulde gegevens door de gekozen antwoorden in deze situatie nodig zijn. “Nee” is een ingevuld antwoord en is niet automatisch een ontbrekend gegeven.</span>
          </div>}
          <div className="policy-fields">
            {item.intakeForm.fields.map(field => <DynamicIntakeField key={field.factId} field={field}
              value={factsByTask[item.taskId]?.[field.factId] ?? initialValue(field)}
              locked={!reviewer && applicantFactIds.has(field.factId) && automaticApplicantFacts[field.factId] === true}
              attention={!reviewer && applicantFactIds.has(field.factId) && automaticApplicantFacts[field.factId] === true
                ? undefined : attentionFor(field, currentFacts[field.factId] ?? initialValue(field), missing)}
              onChange={value => setFactsByTask(current => ({
                ...current,
                [item.taskId]: { ...(current[item.taskId] ?? {}), [field.factId]: value }
              }))} />)}
          </div>
          <p className="resume-hint">Het formulier én de toets komen uit de vastgelegde wet- en regelgeving. Het scherm bevat zelf geen beslisregels.</p>
        </fieldset>}
        {!additionalInformation && latestEvaluation && <PolicyOutcome value={latestEvaluation} form={item.intakeForm} />}
        {mode === 'decision' && item.medicalAssessments.length > 0
          && <MedicalAssessmentOutcome value={item.medicalAssessments.at(-1)!} />}
        <div className="staff-documents">
          <h4>Documenten</h4>
          <DocumentList caseId={item.caseId} documents={item.documents} />
          {canUpload && <>
            <form className="upload" onSubmit={event => void uploadDocument(event, item)}>
              <label>Ontvangen document
                <input required type="file" accept="application/pdf,image/jpeg,image/png"
                  onChange={event => setSelectedFiles(current => ({
                    ...current, [item.taskId]: event.target.files?.[0] ?? null
                  }))} />
              </label>
              <button disabled={Boolean(busyUpload) || !selectedFiles[item.taskId]}>
                {busyUpload === item.taskId ? 'Registreren…' : 'Document registreren'}
              </button>
            </form>
            <p className="resume-hint">PDF, JPEG of PNG, maximaal 10 MB. De processtap verandert niet automatisch.</p>
          </>}
        </div>
        <div className="actions">
          <a className="text-link" href={`/aanvrager?caseId=${encodeURIComponent(item.caseId)}`}>Volledige voortgang</a>
          <button disabled={Boolean(busyTask) || ((reviewer || documentIntake || additionalInformation) && !intakeIsReady(item, factsByTask[item.taskId]))}
            onClick={() => void finish(item)}>
            {busyTask === item.taskId
              ? 'Bezig…'
              : reviewer ? 'Medische beoordeling vastleggen' : documentIntake ? 'Compleetheid toetsen' : additionalInformation ? 'Aanvulling opnieuw toetsen' : 'Besluit verwerken'}
          </button>
        </div>
      </article>;})}
    </div>
  </section>;
}

function EmployeePage() {
  const [revision, setRevision] = useState(0);
  const refreshQueues = () => setRevision(current => current + 1);
  return <div className="employee-sections">
    <WorkQueue key={`intake-${revision}`} type="APPLICATION_INTAKE" mode="document-intake" onWorkflowChange={refreshQueues} />
    <WorkQueue key={`additional-${revision}`} type="ADDITIONAL_INFORMATION" mode="additional-information" onWorkflowChange={refreshQueues} />
    <WorkQueue key={`decision-${revision}`} type="DECISION_REGISTRATION" mode="decision" onWorkflowChange={refreshQueues} />
  </div>;
}

function App() {
  const path = routes.some(route => window.location.pathname.startsWith(route.path))
    ? window.location.pathname : '/aanvrager';

  return <>
    <header className="site-header">
      <div className="brand"><span className="eyebrow">CIZ · OPEN CASE</span><strong>Wlz-aanvraag</strong></div>
      <nav aria-label="Rol kiezen">
        {routes.map(route => <a key={route.path} className={path.startsWith(route.path) ? 'active' : ''} href={route.path}>{route.label}</a>)}
      </nav>
    </header>
    <main>
      <div className="demo-note">PoC-omgeving — de rolkeuze demonstreert de schermen; authenticatie en autorisatie volgen later.</div>
      {path.startsWith('/beoordelaar')
        ? <WorkQueue type="APPLICATION_REVIEW" mode="review" />
        : path.startsWith('/ciz-medewerker')
          ? <EmployeePage />
          : <ApplicantPage />}
    </main>
  </>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);

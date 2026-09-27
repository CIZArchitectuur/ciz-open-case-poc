import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { completeTask, createCase, downloadCaseDocument, getCase, getCaseDocuments, getCaseMedicalAssessments, getCasePolicyEvaluations, getCaseStatus, getCaseTasks, getPersonCases, getTaskIntakeForm, getTaskMedicalAssessmentForm, getTasks, provideApplicantSupplement, uploadCaseDocument, validateAddress } from './api';
import { AuthProvider, useAuth } from './auth';
import type { AddressValidationResult, Case, CaseDocument, CaseTask, CreateCasePayload, FactValue, IntakeFacts, IntakeField, MedicalAssessment, PolicyEvaluation, TaskCompletionInput, TaskType, WorkItem } from './types';
import './styles.css';

const initialForm: CreateCasePayload = {
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
  permanentSupervision: false,
  applicantRole: 'client',
  signedBy: 'client',
  authorizationSignedByClient: null
};

const routes = [
  { path: '/aanvrager', label: 'Aanvrager' },
  { path: '/beoordelaar', label: 'Beoordelaar' },
  { path: '/ciz-medewerker', label: 'CIZ-medewerker' }
];

const applicationSteps = ['Persoonlijk', 'Adres', 'Zorgvraag', 'Ondertekening', 'Controleren'];

function errorMessage(value: unknown) {
  return value instanceof Error ? value.message : 'Er ging iets mis.';
}

function applicantStatus(tasks: CaseTask[], projectedStatus?: Case['application']['applicantStatus']) {
  const labels: Record<NonNullable<Case['application']['applicantStatus']>, string> = {
    WAITING_FOR_REGISTRATION: 'In registratie',
    WAITING_FOR_DOCUMENTS: 'Aanvulling nodig',
    WAITING_FOR_TRIAGE: 'Wacht op triage',
    WAITING_FOR_ASSESSMENT: 'Wacht op beoordeling',
    DECISION_PENDING: 'Besluit wordt voorbereid',
    DECISION_SENT: 'Beslissing verzonden'
  };
  if (projectedStatus) return labels[projectedStatus];
  if (tasks.some(task => task.type === 'OUTGOING_COMMUNICATION' && task.status === 'COMPLETED')) return 'Afgerond';
  if (tasks.some(task => task.type === 'SUPPLEMENT_PROVISION' && task.status === 'OPEN')) return 'Aanvulling nodig';
  if (tasks.some(task => task.type === 'REQUEST_ADDITIONAL_INFORMATION' && task.status === 'OPEN')) return 'Aanvulling wordt gevraagd';
  if (tasks.some(task => task.type === 'OUTGOING_COMMUNICATION' && task.status === 'OPEN')) return 'Beslissing wordt verzonden';
  if (tasks.some(task => ['TRIAGE', 'WLZ_INVESTIGATION_DECISION'].includes(task.type) && task.status === 'OPEN')) return 'In beoordeling';
  if (tasks.some(task => task.type === 'REGISTRATION_ACCEPTANCE' && task.status === 'OPEN')) return 'In registratie';
  return 'In behandeling';
}

function decisionLabel(result: Case['application']['decisionResult']) {
  switch (result) {
    case 'GRANTED': return 'Aanvraag toegekend';
    case 'DECLINED': return 'Aanvraag afgewezen';
    case 'NOT_TAKEN_INTO_CONSIDERATION': return 'Niet in behandeling genomen';
    default: return '';
  }
}

function CaseDetails({ value }: { value: Case }) {
  return <dl>
    <dt>Zaak-ID</dt><dd>{value.caseId}</dd>
    <dt>Aanvrager</dt><dd>{value.application.applicantId}</dd>
    <dt>Naam</dt><dd>{value.person.clientName}</dd>
    <dt>Geboortedatum</dt><dd>{value.person.birthDate}</dd>
    <dt>Adres</dt><dd>{value.address.street} {value.address.houseNumber}, {value.address.postalCode} {value.address.city}, {value.address.country}</dd>
    <dt>Zorgbehoefte</dt><dd>{value.application.permanentCareNeed ? 'Blijvend' : 'Niet blijvend'}</dd>
    <dt>Permanent toezicht</dt><dd>{value.application.permanentSupervision ? 'Ja' : 'Nee'}</dd>
    <dt>Ingediend door</dt><dd>{labelForOutput(value.application.applicantRole)}</dd>
    <dt>Ondertekend door</dt><dd>{labelForOutput(value.application.signedBy)}</dd>
  </dl>;
}

function formatSize(size: number) {
  if (size < 1024) return `${size} bytes`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentList({ caseId, documents }: { caseId: string; documents: CaseDocument[] }) {
  const [downloadError, setDownloadError] = useState('');
  if (documents.length === 0) return <p className="document-empty">Nog geen aanvullende documenten.</p>;
  async function download(document: CaseDocument) {
    setDownloadError('');
    try {
      const blob = await downloadCaseDocument(caseId, document.documentId);
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = document.fileName;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) {
      setDownloadError(errorMessage(caught));
    }
  }
  return <ul className="document-list">
    {documents.map(document => <li key={document.documentId}>
      <div><strong>{document.fileName}</strong><span>{formatSize(document.size)} · veilig opgeslagen</span></div>
      <button className="text-link-button" onClick={() => void download(document)}>Downloaden</button>
    </li>)}
    {downloadError && <li role="alert" className="error">{downloadError}</li>}
  </ul>;
}

function ApplicantPage() {
  const queryId = new URLSearchParams(window.location.search).get('caseId') ?? '';
  const rememberedId = queryId || window.localStorage.getItem('ciz-last-case-id') || '';
  const [form, setForm] = useState(initialForm);
  const [lookupId, setLookupId] = useState(rememberedId);
  const [currentCase, setCurrentCase] = useState<Case | null>(null);
  const [personCases, setPersonCases] = useState<Case[]>([]);
  const [tasks, setTasks] = useState<CaseTask[]>([]);
  const [supplementResponse, setSupplementResponse] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [applicationStep, setApplicationStep] = useState(0);
  const [addressCheck, setAddressCheck] = useState<AddressValidationResult | null>(null);
  const [addressCheckBusy, setAddressCheckBusy] = useState(false);

  const openCase = useCallback(async (caseId: string, updateUrl = true) => {
    setBusy(true);
    setError('');
    try {
      const [found, foundTasks] = await Promise.all([getCase(caseId), getCaseTasks(caseId)]);
      setCurrentCase(found);
      setPersonCases(await getPersonCases(found.personId));
      setTasks(foundTasks);
      setLookupId(found.caseId);
      window.localStorage.setItem('ciz-last-case-id', found.caseId);
      if (updateUrl) {
        window.history.replaceState(null, '', `/aanvrager?caseId=${encodeURIComponent(found.caseId)}`);
      }
    } catch (caught) {
      setCurrentCase(null);
      setPersonCases([]);
      setTasks([]);
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (rememberedId) void openCase(rememberedId, Boolean(queryId));
  }, []);

  useEffect(() => {
    if (!currentCase) return;
    const caseId = currentCase.caseId;
    const timer = window.setInterval(() => {
      void getCaseStatus(caseId).then(status => {
        setCurrentCase(current => current?.caseId === caseId ? {
          ...current,
          application: {
            ...current.application,
            applicantStatus: status.status,
            statusUpdatedAt: status.updatedAt
          }
        } : current);
      }).catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [currentCase?.caseId]);

  async function submitApplication(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await createCase(form);
      setForm(initialForm);
      setApplicationStep(0);
      await openCase(created.caseId);
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  async function submitSupplement(event: FormEvent, supplementTask: CaseTask) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await provideApplicantSupplement(supplementTask.caseId, supplementResponse);
      setSupplementResponse('');
      await openCase(supplementTask.caseId, false);
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  async function checkAddress() {
    setAddressCheckBusy(true);
    setAddressCheck(null);
    try {
      setAddressCheck(await validateAddress(form.country, form.postalCode, form.houseNumber));
    } catch {
      setAddressCheck({
        status: 'UNAVAILABLE',
        message: 'Adrescontrole is tijdelijk niet beschikbaar. U kunt uw adres handmatig invullen.'
      });
    } finally {
      setAddressCheckBusy(false);
    }
  }

  function retrieveApplication(event: FormEvent) {
    event.preventDefault();
    void openCase(lookupId);
  }

  const registration = tasks.find(task => task.type === 'REGISTRATION_ACCEPTANCE');
  const triage = tasks.find(task => task.type === 'TRIAGE');
  const investigation = tasks.find(task => task.type === 'WLZ_INVESTIGATION_DECISION');
  const outgoing = tasks.find(task => task.type === 'OUTGOING_COMMUNICATION');
  const registrationRejected = Boolean(registration?.status === 'COMPLETED'
    && !triage && currentCase?.application.decisionResult === 'NOT_TAKEN_INTO_CONSIDERATION');
  const triageSkipped = registrationRejected;
  const investigationSkipped = registrationRejected
    || Boolean(triage?.status === 'COMPLETED' && outgoing && !investigation);
  const supplementTask = tasks.find(task => task.type === 'SUPPLEMENT_PROVISION' && task.status === 'OPEN');
  const personalComplete = Boolean(form.applicantId.trim() && form.clientName.trim() && form.lastName.trim()
    && form.initials.trim() && /^\d{9}$/.test(form.citizenServiceNumber) && form.birthDate);
  const addressComplete = Boolean(form.street.trim() && form.houseNumber.trim() && form.postalCode.trim()
    && form.city.trim() && form.country.trim());
  const stepComplete = applicationStep === 0 ? personalComplete
    : applicationStep === 1 ? addressComplete
      : applicationStep === 3 ? form.applicantRole !== 'gemachtigde' || form.authorizationSignedByClient !== null
        : true;

  return <div className="page-grid">
    <section>
      <span className="section-kicker">Burgerportaal</span>
      <h2>Nieuwe Wlz-aanvraag</h2>
      <p className="intro">Vul de aanvraag in vijf korte stappen in. U controleert alles voordat u indient.</p>
      <ol className="application-steps" aria-label="Stappen van de aanvraag">
        {applicationSteps.map((label, index) => <li key={label} className={index === applicationStep ? 'active' : index < applicationStep ? 'done' : ''}>
          <span>{index + 1}</span>{label}
        </li>)}
      </ol>
      <form onSubmit={submitApplication}>
        {applicationStep === 0 && <div className="application-step-panel">
          <h3>Persoonlijke gegevens</h3>
          <p>Gegevens van de persoon die langdurige zorg nodig heeft.</p>
          <label>Aanvrager-ID<input required maxLength={100} value={form.applicantId} onChange={event => setForm({...form, applicantId: event.target.value})} /><small>Dit is de aanvrager van deze aanvraag. Eén cliënt kan meerdere zaken hebben.</small></label>
          <label>Volledige naam<input required maxLength={200} value={form.clientName} onChange={event => setForm({...form, clientName: event.target.value})} /></label>
          <div className="form-row">
            <label>Achternaam<input required maxLength={100} value={form.lastName} onChange={event => setForm({...form, lastName: event.target.value})} /></label>
            <label>Voorletters<input required maxLength={20} value={form.initials} onChange={event => setForm({...form, initials: event.target.value})} /></label>
          </div>
          <label>BSN<input required inputMode="numeric" pattern="[0-9]{9}" maxLength={9} value={form.citizenServiceNumber} onChange={event => setForm({...form, citizenServiceNumber: event.target.value.replace(/\D/g, '')})} /><small>Het BSN bestaat uit 9 cijfers.</small></label>
          <label>Geboortedatum<input required type="date" max={new Date().toISOString().slice(0, 10)} value={form.birthDate} onChange={event => setForm({...form, birthDate: event.target.value})} /></label>
        </div>}
        {applicationStep === 1 && <div className="application-step-panel">
          <h3>Woonadres</h3><p>Dit adres wordt ook gebruikt om de volledigheid van de aanvraag te controleren.</p>
          <div className="form-row address-row">
            <label>Straat<input required maxLength={120} value={form.street} onChange={event => {
              setForm({...form, street: event.target.value}); setAddressCheck(null);
            }} /></label>
            <label>Huisnummer<input required maxLength={20} value={form.houseNumber} onChange={event => {
              setForm({...form, houseNumber: event.target.value}); setAddressCheck(null);
            }} /></label>
          </div>
          <div className="form-row">
            <label>Postcode<input required maxLength={12} value={form.postalCode} onChange={event => {
              setForm({...form, postalCode: event.target.value}); setAddressCheck(null);
            }} /></label>
            <label>Woonplaats<input required maxLength={120} value={form.city} onChange={event => setForm({...form, city: event.target.value})} /></label>
          </div>
          <label>Land<input required maxLength={80} value={form.country} onChange={event => {
            setForm({...form, country: event.target.value}); setAddressCheck(null);
          }} /></label>
          <div className="address-check">
            <button type="button" className="secondary" disabled={addressCheckBusy || !form.postalCode.trim() || !form.houseNumber.trim()}
              onClick={() => void checkAddress()}>
              {addressCheckBusy ? 'Postcode controleren…' : 'Controleer postcode en huisnummer'}
            </button>
            {addressCheck && <div className={`address-check-result ${addressCheck.status.toLowerCase()}`} role="status">
              <p>{addressCheck.message}</p>
              {addressCheck.status === 'MATCHED' && <>
                <p className="address-suggestion">{addressCheck.suggestedStreet} {addressCheck.suggestedHouseNumber}, {addressCheck.suggestedPostalCode} {addressCheck.suggestedCity}</p>
                <button type="button" className="secondary" onClick={() => setForm(current => ({
                  ...current,
                  street: addressCheck.suggestedStreet ?? current.street,
                  houseNumber: addressCheck.suggestedHouseNumber ?? current.houseNumber,
                  postalCode: addressCheck.suggestedPostalCode ?? current.postalCode,
                  city: addressCheck.suggestedCity ?? current.city
                }))}>Adresvoorstel overnemen</button>
              </>}
            </div>}
          </div>
        </div>}
        {applicationStep === 2 && <div className="application-step-panel">
          <h3>Zorgvraag</h3><p>Deze antwoorden zijn een eerste beschrijving. Een beoordelaar valideert de medische onderbouwing later.</p>
          <label className="check"><input type="checkbox" checked={form.permanentCareNeed} onChange={event => setForm({...form, permanentCareNeed: event.target.checked})} />Er is naar verwachting blijvend intensieve zorg nodig</label>
          <label className="check"><input type="checkbox" checked={form.permanentSupervision} onChange={event => setForm({...form, permanentSupervision: event.target.checked})} />Er is naar verwachting permanent toezicht nodig</label>
        </div>}
        {applicationStep === 3 && <div className="application-step-panel">
          <h3>Ondertekening en vertegenwoordiging</h3>
          <p>Vertel wie de aanvraag doet en wie heeft ondertekend. Het CIZ controleert later of eventueel bewijs geldig is.</p>
          <label>Wie doet de aanvraag?
            <select value={form.applicantRole} onChange={event => {
              const applicantRole = event.target.value as CreateCasePayload['applicantRole'];
              const signedBy: CreateCasePayload['signedBy'] = applicantRole === 'client' ? 'client'
                : applicantRole === 'gemachtigde' ? 'gemachtigde' : 'gevolmachtigde_of_wettelijk_vertegenwoordiger';
              setForm({...form, applicantRole, signedBy, authorizationSignedByClient: applicantRole === 'gemachtigde' ? form.authorizationSignedByClient : null});
            }}>
              <option value="client">De cliënt zelf</option>
              <option value="gemachtigde">Een gemachtigde</option>
              <option value="wettelijk_vertegenwoordiger">Een wettelijk vertegenwoordiger</option>
            </select>
          </label>
          <label>Wie heeft de aanvraag ondertekend?
            <select value={form.signedBy} onChange={event => setForm({...form, signedBy: event.target.value as CreateCasePayload['signedBy']})}>
              <option value="client">De cliënt</option>
              <option value="gemachtigde">Een gemachtigde</option>
              <option value="gevolmachtigde_of_wettelijk_vertegenwoordiger">Een gevolmachtigde of wettelijk vertegenwoordiger</option>
              <option value="niemand">Niemand</option>
              <option value="anders">Iemand anders</option>
            </select>
          </label>
          {form.applicantRole === 'gemachtigde' && <label>Heeft de cliënt het machtigingsformulier ondertekend?
            <select required value={form.authorizationSignedByClient === null ? '' : String(form.authorizationSignedByClient)}
              onChange={event => setForm({...form, authorizationSignedByClient: event.target.value === '' ? null : event.target.value === 'true'})}>
              <option value="">Maak een keuze</option><option value="true">Ja</option><option value="false">Nee</option>
            </select>
            <small>Dit is een verklaring bij de aanvraag. Een CIZ-medewerker controleert het bewijsstuk.</small>
          </label>}
          {form.applicantRole !== 'client' && <div className="privacy-note">Een medewerker beoordeelt op basis van RegelRecht welke machtiging of vertegenwoordiging moet worden aangetoond.</div>}
        </div>}
        {applicationStep === 4 && <div className="application-step-panel review-application">
          <h3>Controleer uw aanvraag</h3><p>Controleer de gegevens voordat u de aanvraag indient.</p>
          <dl>
            <dt>Naam</dt><dd>{form.clientName} ({form.initials} {form.lastName})</dd>
            <dt>Geboortedatum</dt><dd>{form.birthDate}</dd>
            <dt>Adres</dt><dd>{form.street} {form.houseNumber}, {form.postalCode} {form.city}, {form.country}</dd>
            <dt>Blijvende zorg</dt><dd>{form.permanentCareNeed ? 'Ja' : 'Nee'}</dd>
            <dt>Permanent toezicht</dt><dd>{form.permanentSupervision ? 'Ja' : 'Nee'}</dd>
            <dt>Aanvraag gedaan door</dt><dd>{labelForOutput(form.applicantRole)}</dd>
            <dt>Ondertekend door</dt><dd>{labelForOutput(form.signedBy)}</dd>
            {form.applicantRole === 'gemachtigde' && <><dt>Machtigingsformulier ondertekend door cliënt</dt><dd>{form.authorizationSignedByClient ? 'Ja' : 'Nee'}</dd></>}
          </dl>
          <div className="privacy-note">Na indiening worden de aanwezigheid van de persoonsgegevens en het adres automatisch aan de RegelRecht-controle doorgegeven.</div>
        </div>}
        <div className="wizard-actions">
          {applicationStep > 0 && <button type="button" className="secondary" onClick={() => setApplicationStep(step => step - 1)}>Vorige</button>}
          {applicationStep < applicationSteps.length - 1
            ? <button type="button" disabled={!stepComplete} onClick={() => setApplicationStep(step => step + 1)}>Volgende</button>
            : <button disabled={busy}>{busy ? 'Bezig…' : 'Aanvraag indienen'}</button>}
        </div>
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
          <div><span className="muted">Aanvraag van</span><h3>{currentCase.person.clientName}</h3></div>
          <span className="status">{applicantStatus(tasks, currentCase.application.applicantStatus)}</span>
        </div>
        <CaseDetails value={currentCase} />
        {personCases.length > 1 && <div className="related-cases">
          <h4>Andere zaken van deze cliënt</h4>
          <ul>{personCases.filter(item => item.caseId !== currentCase.caseId).map(item => <li key={item.caseId}>
            <a href={`/aanvrager?caseId=${encodeURIComponent(item.caseId)}`}>Zaak {item.caseId.slice(0, 8)}</a>
            <span>Ingediend op {new Date(item.application.submittedAt).toLocaleDateString('nl-NL')}</span>
          </li>)}</ul>
        </div>}
        <ol className="progress five-steps" aria-label="Voortgang aanvraag">
          <li className="done">Ontvangen</li>
          <li className={registration?.status === 'COMPLETED' ? 'done' : registration ? 'active' : ''}>Registratie</li>
          <li className={triageSkipped ? 'skipped' : triage?.status === 'COMPLETED' ? 'done' : triage ? 'active' : ''}>
            {triageSkipped ? 'Triage overgeslagen' : 'Triage'}
          </li>
          <li className={investigationSkipped ? 'skipped' : investigation?.status === 'COMPLETED' ? 'done' : investigation ? 'active' : ''}>
            {investigationSkipped ? 'Onderzoek overgeslagen' : 'Onderzoek'}
          </li>
          <li className={outgoing?.status === 'COMPLETED' ? 'done' : outgoing ? 'active' : ''}>Beslissing verstuurd</li>
        </ol>
        {supplementTask && <form className="supplement-response" onSubmit={event => void submitSupplement(event, supplementTask)}>
          <h4>Het CIZ vraagt aanvullende informatie</h4>
          <p>{currentCase.application.supplementRequest || 'Het CIZ heeft gevraagd om uw aanvraag aan te vullen.'}</p>
          <label>Uw aanvullende informatie
            <textarea required maxLength={4000} rows={5} value={supplementResponse}
              onChange={event => setSupplementResponse(event.target.value)} />
          </label>
          <button disabled={busy || !supplementResponse.trim()}>{busy ? 'Versturen…' : 'Aanvulling versturen'}</button>
        </form>}
        {currentCase.application.decisionSentAt && currentCase.application.decisionResult && <div className="decision-result">
          <h4>{decisionLabel(currentCase.application.decisionResult)}</h4>
          {currentCase.application.decisionMotivation && <p>{currentCase.application.decisionMotivation}</p>}
          {currentCase.application.decisionSentAt && <span>Verzonden op {new Date(currentCase.application.decisionSentAt).toLocaleDateString('nl-NL')}</span>}
        </div>}
        <p className="resume-hint">Deze pagina kan later opnieuw worden geopend via het bewaarde adres.</p>
      </article>}
    </section>
  </div>;
}

type QueueMode = 'registration' | 'supplement-request' | 'triage' | 'investigation' | 'outgoing';

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

const personalIntakeFacts = new Set([
  'achternaam_aanwezig', 'voorletters_aanwezig', 'bsn_aanwezig', 'geboortedatum_aanwezig',
  'straat_aanwezig', 'huisnummer_aanwezig', 'postcode_aanwezig', 'woonplaats_aanwezig',
  'land_aanwezig', 'land_anders_aanwezig'
]);
const signingFacts = new Set([
  'aanvraag_vanuit_kloostergemeenschap', 'acute_zorgvraag_ondertekenen_niet_mogelijk',
  'bevestiging_aanvraag_wettelijke_vertegenwoordiging_aanwezig',
  'blijvende_fysieke_onmogelijkheid_ondertekenen', 'eerste_bron_client_kan_overzien',
  'eerste_bron_machtiging_overzien', 'heeft_gemachtigde_wlz_aanvraag_ondertekend',
  'heeft_gevolmachtigde_wlz_aanvraag_ondertekend', 'indicatiesteller_zeker_client_kan_overzien',
  'indicatiesteller_zeker_machtiging_overzien', 'levenstestament_volmacht_of_beschikking_aanwezig',
  'machtigingsformulier_aanwezig', 'rechterlijke_machtiging_of_ibs_aanwezig',
  'tweede_bron_client_kan_overzien', 'tweede_bron_machtiging_overzien', 'wie_ondertekend',
  'wie_ondertekende_machtigingsformulier'
]);
const insuranceFacts = new Set([
  'dagtekening_aanvraag_aanwezig', 'gewenste_zorg_aanwezig', 'naam_zorgverzekeraar',
  'polisnummer_aanwezig', 'uitzondering_op_verzekering'
]);

const friendlyFieldLabels: Record<string, string> = {
  indicatiesteller_zeker_client_kan_overzien: 'Kan de cliënt overzien waarvoor die tekent?',
  eerste_bron_client_kan_overzien: 'Bevestiging door een eerste onafhankelijke bron',
  tweede_bron_client_kan_overzien: 'Bevestiging door een tweede onafhankelijke bron',
  indicatiesteller_zeker_machtiging_overzien: 'Kan de cliënt de machtiging overzien?',
  eerste_bron_machtiging_overzien: 'Eerste bevestiging van de machtiging',
  tweede_bron_machtiging_overzien: 'Tweede bevestiging van de machtiging',
  diagnose_handmatig_aanwezig: 'Diagnose door medewerker vastgelegd',
  diagnose_nlp_aanwezig: 'Diagnose automatisch uit document herkend',
  diagnose_snomed_gevalideerd: 'Diagnose gecontroleerd met SNOMED CT',
  bevoegdheid_ter_zake_kundige: 'Functie van de medische deskundige',
  big_nummer_aanwezig: 'BIG-nummer aanwezig',
  agb_code_aanwezig: 'AGB-code aanwezig',
  naam_ter_zake_kundige_aanwezig: 'Naam medische deskundige aanwezig',
  medewerker_acht_ter_zake_kundige_bevoegd: 'Medewerker bevestigt bevoegdheid deskundige',
  uitzondering_op_verzekering: 'Uitzondering op de verzekeringsplicht',
  wie_ondertekend: 'Wie heeft de aanvraag ondertekend?',
  wie_ondertekende_machtigingsformulier: 'Wie heeft het machtigingsformulier ondertekend?'
};

function friendlyFieldLabel(field: IntakeField) {
  return friendlyFieldLabels[field.factId] ?? field.label;
}

function groupedPolicyFields(fields: IntakeField[], medical: boolean) {
  const definitions = medical ? [
    { title: 'Medische onderbouwing', description: 'Diagnose, behandeling, prognose en de blijvende zorgbehoefte.', matches: (id: string) => ['diagnose_vastgesteld', 'diagnose_door_ter_zake_kundige', 'behandeling_en_effect_beschreven', 'prognose_beschreven', 'blijvende_zorgbehoefte_onderbouwd'].includes(id) },
    { title: 'Benodigde zorg', description: 'De intensiteit en voortdurende beschikbaarheid van zorg.', matches: (id: string) => ['permanent_toezicht_nodig', 'vierentwintig_uurs_zorg_nabij_nodig'].includes(id) },
    { title: 'Advies en motivering', description: 'Eventueel medisch advies en de onderbouwing van het oordeel.', matches: (_id: string) => true }
  ] : [
    { title: 'Persoonsgegevens', description: 'Gegevens uit de ingediende aanvraag worden automatisch overgenomen.', matches: (id: string) => personalIntakeFacts.has(id) },
    { title: 'Ondertekening en vertegenwoordiging', description: 'Wie mag ondertekenen en welke machtiging of vertegenwoordiging is aangetoond.', matches: (id: string) => signingFacts.has(id) },
    { title: 'Medische informatie en deskundige', description: 'Aanwezigheid, herkomst en deskundigheid van de medische informatie.', matches: (id: string) => !insuranceFacts.has(id) },
    { title: 'Aanvraag en verzekering', description: 'De gevraagde zorg, dagtekening en verzekeringsgegevens.', matches: (_id: string) => true }
  ];
  const remaining = [...fields];
  return definitions.map(definition => {
    const selected = remaining.filter(field => definition.matches(field.factId));
    selected.forEach(field => remaining.splice(remaining.indexOf(field), 1));
    return { ...definition, fields: selected };
  }).filter(group => group.fields.length > 0);
}

function PolicyOutcome({ value, compact = false, form }: { value: PolicyEvaluation; compact?: boolean; form?: WorkItem['intakeForm'] }) {
  const missing = [...missingFactIds(value)];
  const fieldLabels = new Map(form?.fields.map(field => [field.factId, friendlyFieldLabel(field)]) ?? []);
  const missingGroups = form ? groupedPolicyFields(form.fields.filter(field => missing.includes(field.factId)), false) : [];
  return <div className={`policy-outcome ${value.canBeTakenIntoConsideration ? 'positive' : 'negative'}`}>
    <strong>{value.canBeTakenIntoConsideration ? 'De aanvraag is compleet' : 'De aanvraag is nog niet compleet'}</strong>
    <span>{value.canBeTakenIntoConsideration
      ? 'De controle heeft geen ontbrekende vereisten gevonden.'
      : missing.length > 0
        ? `${missing.length} ${missing.length === 1 ? 'gegeven ontbreekt' : 'gegevens ontbreken'} nog.`
        : 'Alle benodigde gegevens zijn ingevuld, maar uit één of meer antwoorden blijkt dat nog niet aan de voorwaarden wordt voldaan.'}</span>
    {!compact && <>
      {!value.canBeTakenIntoConsideration && missing.length > 0 && <div className="missing-facts" role="status">
        <strong>Wat moet u nu controleren?</strong>
        <p>Begin met de eerste drie punten. Open de volledige lijst voor de overige gegevens. Kies alleen “Ja” als u dit kunt bevestigen; “Nee” is ook een ingevuld antwoord.</p>
        <ul>{missing.slice(0, 3).map(factId => <li key={factId}>{fieldLabels.get(factId) ?? labelForOutput(factId)}</li>)}</ul>
        {missing.length > 3 && <details>
          <summary>Toon alle {missing.length} ontbrekende gegevens per onderwerp</summary>
          {missingGroups.length > 0 ? missingGroups.map(group => <div className="missing-group" key={group.title}>
            <h5>{group.title} ({group.fields.length})</h5>
            <ul>{group.fields.map(field => <li key={field.factId}>{friendlyFieldLabel(field)}</li>)}</ul>
          </div>) : <ul>{missing.slice(3).map(factId => <li key={factId}>{fieldLabels.get(factId) ?? labelForOutput(factId)}</li>)}</ul>}
        </details>}
      </div>}
      <div className="outcome-next-step">
        <strong>Volgende stap</strong>
        <span>{value.canBeTakenIntoConsideration
          ? 'De aanvraag kan door naar de inhoudelijke beoordeling.'
          : missing.length > 0
            ? 'Controleer de gemarkeerde gegevens hieronder en voer daarna de toets opnieuw uit.'
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

function DynamicIntakeField({ field, value, onChange, attention, locked = false, sourceHint }: {
  field: IntakeField; value: FactValue; onChange: (value: FactValue) => void; attention?: string; locked?: boolean; sourceHint?: string;
}) {
  if (field.type === 'boolean') {
    return <label className={`policy-field ${attention ? 'needs-attention' : ''}`}>
      <span>{friendlyFieldLabel(field)}{locked ? <b>Overgenomen uit aanvraag</b> : sourceHint ? <b>{sourceHint}</b> : attention && <b>{attention}</b>}</span>
      <select disabled={locked} value={value === true ? 'true' : value === false ? 'false' : ''}
        onChange={event => onChange(event.target.value === '' ? '' : event.target.value === 'true')}>
        <option value="">Nog niet ingevuld</option>
        <option value="true">Ja</option>
        <option value="false">Nee</option>
      </select>
      {field.description && <small>{attention ? `Waarom nodig: ${field.description}` : field.description}</small>}
    </label>;
  }
  const options = allowedValues(field);
  return <label className={`policy-field ${attention ? 'needs-attention' : ''}`}>{friendlyFieldLabel(field)}{attention && <b>{attention}</b>}
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
    {field.description && <small>{attention ? `Waarom nodig: ${field.description}` : field.description}</small>}
  </label>;
}

const applicantFactIds = new Set([
  'achternaam_aanwezig', 'voorletters_aanwezig', 'bsn_aanwezig', 'geboortedatum_aanwezig',
  'straat_aanwezig', 'huisnummer_aanwezig', 'postcode_aanwezig', 'woonplaats_aanwezig', 'land_aanwezig',
  'dagtekening_aanvraag_aanwezig', 'gewenste_zorg_aanwezig'
]);

function applicantFacts(value: Case): IntakeFacts {
  return {
    achternaam_aanwezig: Boolean(value.person.lastName.trim()),
    voorletters_aanwezig: Boolean(value.person.initials.trim()),
    bsn_aanwezig: Boolean(value.person.citizenServiceNumber.trim()),
    geboortedatum_aanwezig: Boolean(value.person.birthDate),
    straat_aanwezig: Boolean(value.address.street.trim()),
    huisnummer_aanwezig: Boolean(value.address.houseNumber.trim()),
    postcode_aanwezig: Boolean(value.address.postalCode.trim()),
    woonplaats_aanwezig: Boolean(value.address.city.trim()),
    land_aanwezig: Boolean(value.address.country.trim()),
    dagtekening_aanvraag_aanwezig: true,
    gewenste_zorg_aanwezig: true,
    wie_ondertekend: value.application.signedBy,
    ...(value.application.authorizationSignedByClient === true ? { wie_ondertekende_machtigingsformulier: 'client' } : {})
  };
}

function medicalSuggestions(value: Case): IntakeFacts {
  return { permanent_toezicht_nodig: value.application.permanentSupervision };
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
  const [completionByTask, setCompletionByTask] = useState<Record<string, TaskCompletionInput>>({});

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
          mode === 'investigation' ? getTaskMedicalAssessmentForm(task.taskId)
            : mode === 'registration' ? getTaskIntakeForm(task.taskId) : Promise.resolve(undefined)
        ]);
        return { ...task, case: caseValue, documents, policyEvaluations, medicalAssessments, intakeForm };
      }));
      setItems(loadedItems);
      setFactsByTask(current => {
        const next = { ...current };
        loadedItems.forEach(item => {
          if (item.intakeForm && !next[item.taskId]) {
            const savedFacts = mode === 'investigation'
              ? item.medicalAssessments.at(-1)?.facts ?? {}
              : item.policyEvaluations.at(-1)?.facts ?? {};
            const automaticFacts: IntakeFacts = mode === 'investigation' ? medicalSuggestions(item.case) : applicantFacts(item.case);
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
      const completion = completionByTask[item.taskId] ?? {};
      let input: TaskCompletionInput = {};
      if (mode === 'registration') {
        input = { facts: factsForSubmission(item, factsByTask[item.taskId]), registrationOutcome: completion.registrationOutcome };
      } else if (mode === 'supplement-request') {
        input = { supplementText: completion.supplementText };
      } else if (mode === 'triage') {
        input = {
          triageOutcome: completion.triageOutcome,
          decisionResult: completion.decisionResult,
          decisionMotivation: completion.decisionMotivation
        };
      } else if (mode === 'investigation') {
        input = {
          facts: factsForSubmission(item, factsByTask[item.taskId]),
          decisionResult: completion.decisionResult,
          decisionMotivation: completion.decisionMotivation
        };
      }
      await completeTask(item.taskId, input);
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

  const registration = mode === 'registration';
  const supplementRequest = mode === 'supplement-request';
  const triage = mode === 'triage';
  const investigation = mode === 'investigation';
  const reviewer = triage || investigation;
  const canUpload = !reviewer;
  return <section className="queue-section">
    <div className="queue-heading">
      <div>
        <span className="section-kicker">{reviewer ? 'WP-Wlz · Beoordelaarsportaal' : 'WP-AO · CIZ-medewerker'}</span>
        <h2>{registration ? 'Registreren en controleren' : supplementRequest ? 'Aanvulling opvragen' : triage ? 'Aanvragen triëren' : investigation ? 'Onderzoek en besluitvorming Wlz' : 'Beslissing verzenden'}</h2>
        <p className="intro">{registration
          ? 'Controleer de aanvraaggegevens en de uitkomst van de RegelRecht-toets. Kies daarna de registratieroute.'
          : supplementRequest
            ? 'Beschrijf welke aanvullende informatie nodig is. De aanvrager kan hierop reageren via het portaal.'
            : triage
              ? 'Bepaal op basis van de aanvraag welke behandelroute volgt.'
              : investigation
                ? 'Leg de medische bevindingen, het besluit en de motivering vast. RegelRecht ondersteunt met de actuele beleidsregels.'
                : 'Controleer het vastgelegde besluit en registreer dat de beslissing aan de aanvrager is verzonden.'}</p>
      </div>
      <button className="secondary" disabled={loading} onClick={() => void load()}>Vernieuwen</button>
    </div>
    {error && <div className="error" role="alert">{error}</div>}
    {loading && <p className="empty">Werkvoorraad laden…</p>}
    {!loading && items.length === 0 && <div className="empty"><strong>Geen openstaande taken</strong><span>De werkvoorraad is bijgewerkt.</span></div>}
    <div className={`work-list ${registration || reviewer ? 'intake-work-list' : ''}`}>
      {items.map(item => {
        const latestEvaluation = item.policyEvaluations.at(-1);
        const missing = missingFactIds(latestEvaluation);
        const currentFacts = factsByTask[item.taskId] ?? {};
        const automaticApplicantFacts = applicantFacts(item.case);
        return <article className="work-card" key={item.taskId}>
        <div className="work-card-header">
          <div><span className="muted">Zaak {item.caseId.slice(0, 8)}</span><h3>{item.case.person.clientName}</h3></div>
          <span className="status">Open</span>
        </div>
        <CaseDetails value={item.case} />
        {registration && item.case.application.supplementResponse && <div className="attention-help">
          <strong>Aanvulling van de aanvrager ontvangen</strong>
          <span>{item.case.application.supplementResponse}</span>
        </div>}
        {registration && latestEvaluation && <PolicyOutcome value={latestEvaluation} form={item.intakeForm} />}
        {(investigation || registration) && item.intakeForm && <fieldset className="policy-checks">
          <legend>{investigation ? 'Medisch-inhoudelijke beoordeling' : 'Controle volgens actueel beleid'}</legend>
          <div className="policy-version">Formulier uit RegelRecht-beleid · versie {item.intakeForm.policyVersion.slice(0, 12)}</div>
          {investigation && <div className="attention-help medical">
            <strong>Valideer alleen feiten uit betrouwbare bronstukken</strong>
            <span>RegelRecht ondersteunt het besluitvoorstel. De beoordelaar blijft verantwoordelijk voor de vastgelegde medische bevindingen en motivering.</span>
          </div>}
          <div className="policy-groups">
            {groupedPolicyFields(item.intakeForm.fields, investigation).map(group => <div className="policy-group" key={group.title}>
              <div className="policy-group-heading"><h4>{group.title}</h4><p>{group.description}</p></div>
              <div className="policy-fields">
                {group.fields.map(field => {
                  const automatic = registration && applicantFactIds.has(field.factId) && automaticApplicantFacts[field.factId] === true;
                  const suggested = investigation && field.factId === 'permanent_toezicht_nodig'
                    && item.medicalAssessments.length === 0;
                  const applicantSuggestion = registration && ['wie_ondertekend', 'wie_ondertekende_machtigingsformulier'].includes(field.factId)
                    && Object.prototype.hasOwnProperty.call(automaticApplicantFacts, field.factId);
                  return <DynamicIntakeField key={field.factId} field={field}
                    value={factsByTask[item.taskId]?.[field.factId] ?? initialValue(field)}
                    locked={automatic}
                    sourceHint={suggested ? 'Uit zorgvraag — valideer' : applicantSuggestion ? 'Uit aanvraag — controleer' : undefined}
                    attention={automatic ? undefined : attentionFor(field, currentFacts[field.factId] ?? initialValue(field), missing)}
                    onChange={value => setFactsByTask(current => ({
                      ...current,
                      [item.taskId]: { ...(current[item.taskId] ?? {}), [field.factId]: value }
                    }))} />;
                })}
              </div>
            </div>)}
          </div>
          <p className="resume-hint">Het formulier én de toets komen uit de vastgelegde wet- en regelgeving. Het scherm bevat zelf geen beslisregels.</p>
        </fieldset>}
        {investigation && item.medicalAssessments.length > 0
          && <MedicalAssessmentOutcome value={item.medicalAssessments.at(-1)!} />}
        {registration && <label className="task-choice">Uitkomst registratie en acceptatie
          <select required value={completionByTask[item.taskId]?.registrationOutcome ?? ''}
            onChange={event => setCompletionByTask(current => ({
              ...current,
              [item.taskId]: { ...(current[item.taskId] ?? {}), registrationOutcome: event.target.value as TaskCompletionInput['registrationOutcome'] }
            }))}>
            <option value="">Maak een keuze</option>
            <option value="ACCEPTED">Geaccepteerd — door naar triage</option>
            <option value="REQUEST_ADDITIONAL_INFORMATION">Aanvulling nodig</option>
            <option value="NOT_TAKEN_INTO_CONSIDERATION">Niet in behandeling nemen</option>
          </select>
          <small>Gebruik de actuele RegelRecht-toets als ondersteuning bij deze controle.</small>
        </label>}
        {registration && completionByTask[item.taskId]?.registrationOutcome === 'NOT_TAKEN_INTO_CONSIDERATION'
          && <label className="task-choice">Toelichting
            <textarea required rows={3} maxLength={4000} value={completionByTask[item.taskId]?.decisionMotivation ?? ''}
              onChange={event => setCompletionByTask(current => ({
                ...current, [item.taskId]: { ...(current[item.taskId] ?? {}), decisionMotivation: event.target.value }
              }))} />
          </label>}
        {supplementRequest && <label className="task-choice">Welke informatie ontbreekt?
          <textarea required maxLength={4000} rows={4}
            value={completionByTask[item.taskId]?.supplementText ?? ''}
            onChange={event => setCompletionByTask(current => ({
              ...current, [item.taskId]: { ...(current[item.taskId] ?? {}), supplementText: event.target.value }
            }))} />
        </label>}
        {triage && <>
          <label className="task-choice">Uitkomst triage
            <select required value={completionByTask[item.taskId]?.triageOutcome ?? ''}
              onChange={event => setCompletionByTask(current => ({
                ...current,
                [item.taskId]: { ...(current[item.taskId] ?? {}), triageOutcome: event.target.value as TaskCompletionInput['triageOutcome'] }
              }))}>
              <option value="">Maak een keuze</option>
              <option value="FURTHER_INVESTIGATION">Nader onderzoek inplannen</option>
              <option value="DIRECT_HANDLED">Direct afhandelen (basis)</option>
              <option value="NOT_TAKEN_INTO_CONSIDERATION">Niet in behandeling nemen</option>
            </select>
          </label>
          {completionByTask[item.taskId]?.triageOutcome === 'DIRECT_HANDLED' && <label className="task-choice">Uitkomst directe afhandeling
            <select required value={completionByTask[item.taskId]?.decisionResult ?? ''}
              onChange={event => setCompletionByTask(current => ({
                ...current,
                [item.taskId]: { ...(current[item.taskId] ?? {}), decisionResult: event.target.value as TaskCompletionInput['decisionResult'] }
              }))}>
              <option value="">Maak een keuze</option>
              <option value="GRANTED">Toekennen</option>
              <option value="DECLINED">Afwijzen</option>
            </select>
          </label>}
          {completionByTask[item.taskId]?.triageOutcome && completionByTask[item.taskId]?.triageOutcome !== 'FURTHER_INVESTIGATION'
            && <label className="task-choice">Korte toelichting
              <textarea rows={3} maxLength={4000} value={completionByTask[item.taskId]?.decisionMotivation ?? ''}
                onChange={event => setCompletionByTask(current => ({
                  ...current, [item.taskId]: { ...(current[item.taskId] ?? {}), decisionMotivation: event.target.value }
                }))} />
            </label>}
        </>}
        {investigation && <div className="decision-entry">
          <label className="task-choice">Inhoudelijke uitkomst
            <select required value={completionByTask[item.taskId]?.decisionResult ?? ''}
              onChange={event => setCompletionByTask(current => ({
                ...current,
                [item.taskId]: { ...(current[item.taskId] ?? {}), decisionResult: event.target.value as TaskCompletionInput['decisionResult'] }
              }))}>
              <option value="">Maak een keuze</option>
              <option value="GRANTED">Toekennen</option>
              <option value="DECLINED">Afwijzen</option>
            </select>
          </label>
          <label className="task-choice">Motivering
            <textarea required rows={4} maxLength={4000} value={completionByTask[item.taskId]?.decisionMotivation ?? ''}
              onChange={event => setCompletionByTask(current => ({
                ...current, [item.taskId]: { ...(current[item.taskId] ?? {}), decisionMotivation: event.target.value }
              }))} />
          </label>
        </div>}
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
          {mode === 'outgoing' && item.case.application.decisionResult && <div className="decision-result">
            <h4>{decisionLabel(item.case.application.decisionResult)}</h4>
            {item.case.application.decisionMotivation && <p>{item.case.application.decisionMotivation}</p>}
          </div>}
        </div>
        {(() => {
          const input = completionByTask[item.taskId] ?? {};
          const ready = registration
            ? intakeIsReady(item, factsByTask[item.taskId]) && Boolean(input.registrationOutcome)
              && (input.registrationOutcome !== 'NOT_TAKEN_INTO_CONSIDERATION' || Boolean(input.decisionMotivation?.trim()))
            : supplementRequest
              ? Boolean(input.supplementText?.trim())
            : triage
                ? Boolean(input.triageOutcome) && (input.triageOutcome === 'FURTHER_INVESTIGATION'
                  || (Boolean(input.decisionMotivation?.trim())
                    && (input.triageOutcome !== 'DIRECT_HANDLED' || Boolean(input.decisionResult))))
                : investigation
                  ? intakeIsReady(item, factsByTask[item.taskId]) && Boolean(input.decisionResult)
                    && Boolean(input.decisionMotivation?.trim())
                  : Boolean(item.case.application.decisionResult);
          return <div className="actions">
            <a className="text-link" href={`/aanvrager?caseId=${encodeURIComponent(item.caseId)}`}>Voortgang aanvrager</a>
            <button disabled={Boolean(busyTask) || !ready} onClick={() => void finish(item)}>
              {busyTask === item.taskId ? 'Bezig…'
                : registration ? 'Registratie vastleggen'
                  : supplementRequest ? 'Aanvulling opvragen'
                    : triage ? 'Triage vastleggen'
                      : investigation ? 'Onderzoek en besluit vastleggen'
                        : 'Verzending vastleggen'}
            </button>
          </div>;
        })()}
      </article>;})}
    </div>
  </section>;
}

function EmployeePage() {
  const [revision, setRevision] = useState(0);
  const refreshQueues = () => setRevision(current => current + 1);
  return <div className="employee-sections">
    <WorkQueue key={`registration-${revision}`} type="REGISTRATION_ACCEPTANCE" mode="registration" onWorkflowChange={refreshQueues} />
    <WorkQueue key={`supplement-${revision}`} type="REQUEST_ADDITIONAL_INFORMATION" mode="supplement-request" onWorkflowChange={refreshQueues} />
    <WorkQueue key={`outgoing-${revision}`} type="OUTGOING_COMMUNICATION" mode="outgoing" onWorkflowChange={refreshQueues} />
  </div>;
}

function ReviewerPage() {
  const [revision, setRevision] = useState(0);
  const refreshQueues = () => setRevision(current => current + 1);
  return <div className="employee-sections">
    <WorkQueue key={`triage-${revision}`} type="TRIAGE" mode="triage" onWorkflowChange={refreshQueues} />
    <WorkQueue key={`investigation-${revision}`} type="WLZ_INVESTIGATION_DECISION" mode="investigation" onWorkflowChange={refreshQueues} />
  </div>;
}

function StaffAccessPage({ role, label }: { role: string; label: string }) {
  const auth = useAuth();
  if (!auth.ready) return <section className="access-card"><h2>Beveiligde werkomgeving</h2><p>De aanmeldstatus wordt gecontroleerd…</p></section>;
  if (auth.hasRole(role)) return null;
  const otherRole = auth.user
    ? (role === 'beoordelaar' ? 'ciz-medewerker' : 'beoordelaar')
    : null;
  return <section className="access-card">
    <span className="section-kicker">Medewerkers</span>
    <h2>{auth.user ? 'Geen toegang tot deze werkvoorraad' : `Inloggen als ${label}`}</h2>
    <p>{auth.user
      ? `Dit account heeft niet de rol ${label}. De werkvoorraad is daarom niet beschikbaar.`
      : 'Meld u aan via de lokale OIDC-testprovider. De rol van uw account bepaalt welke taken en handelingen beschikbaar zijn.'}</p>
    {auth.error && <div className="error" role="alert">{auth.error}</div>}
    {auth.user
      ? <button onClick={() => void auth.signOut()}>Uitloggen en ander account kiezen</button>
      : <button disabled={!auth.ready} onClick={() => void auth.signIn(window.location.pathname)}>
          Inloggen als medewerker
        </button>}
    {otherRole && <p className="muted">Huidige accountrol: {otherRole}. Log uit om met een ander testaccount aan te melden.</p>}
    <p className="security-note">Lokale PoC-login met fictieve testaccounts; nog geen aansluiting op DEZI.</p>
  </section>;
}

function App() {
  const auth = useAuth();
  const path = routes.some(route => window.location.pathname.startsWith(route.path))
    ? window.location.pathname : '/aanvrager';

  return <>
    <header className="site-header">
      <div className="brand"><span className="eyebrow">CIZ · OPEN CASE</span><strong>Wlz-aanvraag</strong></div>
      <nav aria-label="Rol kiezen">
        {routes.map(route => <a key={route.path} className={path.startsWith(route.path) ? 'active' : ''} href={route.path}>{route.label}</a>)}
      </nav>
      {auth.user && <button className="header-signout" onClick={() => void auth.signOut()}>Uitloggen</button>}
    </header>
    <main>
      {path.startsWith('/aanvrager') && <div className="demo-note">Fictieve PoC-aanvrageromgeving — gebruik hier geen echte persoonsgegevens. Deze demo is niet beveiligd met medewerkerslogin.</div>}
      {path.startsWith('/beoordelaar') && <StaffAccessPage role="beoordelaar" label="Beoordelaar" />}
      {path.startsWith('/ciz-medewerker') && <StaffAccessPage role="ciz-medewerker" label="CIZ-medewerker" />}
      {path.startsWith('/beoordelaar')
        ? auth.hasRole('beoordelaar') && <ReviewerPage />
        : path.startsWith('/ciz-medewerker')
          ? auth.hasRole('ciz-medewerker') && <EmployeePage />
          : <ApplicantPage />}
    </main>
  </>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><AuthProvider><App /></AuthProvider></React.StrictMode>);

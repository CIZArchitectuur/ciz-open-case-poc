import React, { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DocumentExtractionPanel } from './DocumentExtractionPanel';
import { DossierAnalysisPanel } from './DossierAnalysisPanel';
import { SourceViewer } from './SourceViewer';
import { getCases, createCaseDraft, submitCase } from './api';
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
  submissionChannel: 'CLIENT_PORTAL',
  signedBy: 'client',
  authorizationSignedByClient: null
};

const routes = [
  { path: '/aanvrager', label: 'Aanvrager' },
  { path: '/zorgaanbieder', label: 'Zorgaanbieder' },
  { path: '/beoordelaar', label: 'Onderzoeker' },
  { path: '/ciz-medewerker', label: 'AO · Upload' }
];

const applicationSteps = ['Persoonlijk', 'Adres', 'Zorgvraag', 'Ondertekening', 'Controleren'];

function errorMessage(value: unknown) {
  return value instanceof Error ? value.message : 'Er ging iets mis.';
}

function applicantStatus(tasks: CaseTask[], projectedStatus?: Case['application']['applicantStatus']) {
  const labels: Record<NonNullable<Case['application']['applicantStatus']>, string> = {
    DRAFT: 'Nog niet ingediend',
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

function decisionLabel(result: Case['decisions'][number]['result'] | undefined) {
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
    <dt>Ontvangst</dt><dd>{({CLIENT_PORTAL:'Cliëntportaal',CARE_PROVIDER:'Zorgaanbieder',POST:'Post'})[value.application.submissionChannel]}</dd>
    <dt>Ondertekend door</dt><dd>{labelForOutput(value.application.signedBy)}</dd>
  </dl>;
}

function formatSize(size: number) {
  if (size < 1024) return `${size} bytes`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentList({ caseId, documents, canExtract = false }: { caseId: string; documents: CaseDocument[]; canExtract?: boolean }) {
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
      {canExtract && document.contentType==='application/pdf' && <SourceViewer caseId={caseId} documentId={document.documentId} title={document.fileName} />}
      {document.contentType === 'application/pdf' && <DocumentExtractionPanel caseId={caseId} documentId={document.documentId} canExtract={canExtract} />}
    </li>)}
    {downloadError && <li role="alert" className="error">{downloadError}</li>}
  </ul>;
}

function ApplicantPage({postIntake=false, careProvider=false}: {postIntake?: boolean; careProvider?: boolean}) {
  const submissionChannel = postIntake ? 'POST' : careProvider ? 'CARE_PROVIDER' : 'CLIENT_PORTAL';
  const portalPath = careProvider ? '/zorgaanbieder' : '/aanvrager';
  const queryId = new URLSearchParams(window.location.search).get('caseId') ?? '';
  const rememberedId = queryId || window.localStorage.getItem('ciz-last-case-id') || '';
  const [form, setForm] = useState<CreateCasePayload>({...initialForm, submissionChannel});
  const [attachments, setAttachments] = useState<File[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<Set<File>>(new Set());
  const [lookupId, setLookupId] = useState(rememberedId);
  const [currentCase, setCurrentCase] = useState<Case | null>(null);
  const [personCases, setPersonCases] = useState<Case[]>([]);
  const [tasks, setTasks] = useState<CaseTask[]>([]);
  const [supplementResponse, setSupplementResponse] = useState('');
  const [supplementAttachments, setSupplementAttachments] = useState<File[]>([]);
  const [uploadedSupplements, setUploadedSupplements] = useState<Set<File>>(new Set());
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
      if (!postIntake && found.application.submittedAt === null) {
        setDraftId(found.caseId); setApplicationStep(4);
        setForm({applicantId:found.application.applicantId,clientName:found.person.clientName,
          lastName:found.person.lastName,initials:found.person.initials,citizenServiceNumber:found.person.citizenServiceNumber,
          birthDate:found.person.birthDate,street:found.address.street,houseNumber:found.address.houseNumber,
          postalCode:found.address.postalCode,city:found.address.city,country:found.address.country,
          permanentCareNeed:found.application.permanentCareNeed,permanentSupervision:found.application.permanentSupervision,
          applicantRole:found.application.applicantRole,submissionChannel:found.application.submissionChannel,
          signedBy:found.application.signedBy,authorizationSignedByClient:found.application.authorizationSignedByClient});
      }
      setPersonCases(await getPersonCases(found.personId));
      setTasks(foundTasks);
      setLookupId(found.caseId);
      window.localStorage.setItem('ciz-last-case-id', found.caseId);
      if (updateUrl) {
        if (!postIntake) window.history.replaceState(null, '', `${portalPath}?caseId=${encodeURIComponent(found.caseId)}`);
      }
    } catch (caught) {
      setCurrentCase(null);
      setPersonCases([]);
      setTasks([]);
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }, [postIntake, portalPath]);

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
      const created = postIntake ? await createCase(form) : draftId ? await getCase(draftId) : await createCaseDraft(form);
      setDraftId(created.caseId);
      if (!postIntake) {
        window.localStorage.setItem('ciz-last-case-id',created.caseId);
        window.history.replaceState(null,'',`${portalPath}?caseId=${encodeURIComponent(created.caseId)}`);
      }
      for (const file of attachments) {
        if (uploadedFiles.has(file)) continue;
        await uploadCaseDocument(created.caseId, file);
        uploadedFiles.add(file);
        setUploadedFiles(new Set(uploadedFiles));
      }
      if (!postIntake) await submitCase(created.caseId);
      setForm({...initialForm, submissionChannel});
      setAttachments([]); setDraftId(null); setUploadedFiles(new Set());
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
      for (const file of supplementAttachments) {
        if (uploadedSupplements.has(file)) continue;
        await uploadCaseDocument(supplementTask.caseId, file);
        uploadedSupplements.add(file); setUploadedSupplements(new Set(uploadedSupplements));
      }
      await provideApplicantSupplement(supplementTask.caseId, supplementResponse);
      setSupplementResponse('');
      setSupplementAttachments([]); setUploadedSupplements(new Set());
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
    && !triage && currentCase?.decisions.at(-1)?.result === 'NOT_TAKEN_INTO_CONSIDERATION');
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
      <span className="section-kicker">{postIntake ? 'Postaanvraag registreren' : careProvider ? 'Zorgaanbiedersportaal' : 'Burgerportaal'}</span>
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
          <p>{postIntake ? 'Per post ontvangen aanvraag.' : careProvider ? 'U dient deze aanvraag als zorgaanbieder in voor de cliënt.' : 'U dient deze aanvraag zelf in.'}</p>
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
            <small>Dit is een verklaring bij de aanvraag. Een onderzoeker controleert het bewijsstuk.</small>
          </label>}
          {form.applicantRole !== 'client' && <div className="privacy-note">Een medewerker beoordeelt op basis van RegelRecht welke machtiging of vertegenwoordiging moet worden aangetoond.</div>}
        </div>}
        {applicationStep === 4 && <div className="application-step-panel review-application">
          <h3>Controleer uw aanvraag</h3><p>Controleer de gegevens voordat u de aanvraag indient.</p>
          {!postIntake && <label>Bijlagen toevoegen<input type="file" accept="application/pdf,image/jpeg,image/png" multiple disabled={Boolean(draftId)} onChange={event => setAttachments(Array.from(event.target.files ?? []))} />
            <small>PDF's worden bij ontvangst uitgelezen. Na indiening wordt het dossier geanalyseerd zodra de benodigde documenten klaar zijn.</small>
          </label>}
          {attachments.length > 0 && <ul>{attachments.map((file, index) => <li key={index}>{file.name}</li>)}</ul>}
          {draftId && <p role="status">Concept {draftId.slice(0,8)} is opgeslagen. Probeer indiening opnieuw om verder te gaan met dezelfde aanvraag.</p>}
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
          {applicationStep > 0 && <button type="button" className="secondary" disabled={Boolean(draftId)} onClick={() => setApplicationStep(step => step - 1)}>Vorige</button>}
          {applicationStep < applicationSteps.length - 1
            ? <button key="next" type="button" disabled={!stepComplete} onClick={event => {
              event.preventDefault();
              setApplicationStep(step => step + 1);
            }}>Volgende</button>
            : <button key="submit" type="submit" disabled={busy}>{busy ? 'Bezig…' : 'Aanvraag indienen'}</button>}
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
            <span>{item.application.submittedAt ? `Ingediend op ${new Date(item.application.submittedAt).toLocaleDateString('nl-NL')}` : 'Conceptaanvraag'}</span>
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
          <label>Bijlagen bij uw aanvulling<input type="file" multiple accept="application/pdf,image/jpeg,image/png" onChange={event => setSupplementAttachments(Array.from(event.target.files ?? []))} /></label>
          <button disabled={busy || !supplementResponse.trim()}>{busy ? 'Versturen…' : 'Aanvulling versturen'}</button>
        </form>}
        {currentCase.decisions.filter(decision => decision.sentAt).map(decision => <div className="decision-result" key={decision.decisionId}>
          <h4>{decisionLabel(decision.result)}</h4>
          <p>{decision.motivation}</p>
          {decision.zorgprofiel && <p>Zorgprofiel: {decision.zorgprofiel}</p>}
          {decision.grondslagen.length > 0 && <p>Grondslagen: {decision.grondslagen.join(', ')}</p>}
          <span>Verzonden op {new Date(decision.sentAt!).toLocaleDateString('nl-NL')}</span>
        </div>)}
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

function groupedPolicyFields(fields: IntakeField[], _medical: boolean) {
  const groups = new Map<string, {title: string; description: string; order: number; fields: IntakeField[]}>();
  for (const field of fields) {
    const id = field.groupId ?? 'other';
    const group = groups.get(id) ?? {title: field.groupTitle ?? 'Overige controles',
      description: field.groupDescription ?? '', order: field.groupOrder ?? 999, fields: []};
    group.fields.push(field);
    groups.set(id, group);
  }
  return [...groups.values()].sort((left, right) => left.order - right.order);
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
  const loadVersion = useRef(0);
  const [selectedId,setSelectedId]=useState('');
  const [search,setSearch]=useState('');
  const [items, setItems] = useState<WorkItem[]>([]);
  const [error, setError] = useState('');
  const [busyTask, setBusyTask] = useState('');
  const [busyUpload, setBusyUpload] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<Record<string, File | null>>({});
  const [loading, setLoading] = useState(true);
  const [factsByTask, setFactsByTask] = useState<Record<string, IntakeFacts>>({});
  const [completionByTask, setCompletionByTask] = useState<Record<string, TaskCompletionInput>>({});

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    setError('');
    try {
      const tasks = await getTasks('OPEN', type);
      const loadedItems = await Promise.all(tasks.map(async task => {
        const [caseValue, documents, policyEvaluations, medicalAssessments, intakeForm] = await Promise.all([
          getCase(task.caseId),
          task.taskId === selectedId ? getCaseDocuments(task.caseId) : Promise.resolve([]),
          task.taskId === selectedId ? getCasePolicyEvaluations(task.caseId) : Promise.resolve([]),
          task.taskId === selectedId ? getCaseMedicalAssessments(task.caseId) : Promise.resolve([]),
          task.taskId !== selectedId ? Promise.resolve(undefined)
            : mode === 'investigation' ? getTaskMedicalAssessmentForm(task.taskId)
            : mode === 'registration' ? getTaskIntakeForm(task.taskId) : Promise.resolve(undefined)
        ]);
        return { ...task, case: caseValue, documents, policyEvaluations, medicalAssessments, intakeForm };
      }));
      if (version !== loadVersion.current) return;
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
      if (version === loadVersion.current) setError(errorMessage(caught));
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [type, mode, selectedId]);

  useEffect(() => { void load(); }, [load]);

  // Workflow creation is asynchronous; keep an idle overview current without
  // replacing an open dossier or unsaved answers.
  useEffect(() => {
    if (selectedId) return;
    const timer = window.setInterval(() => { void load(); }, 5000);
    return () => window.clearInterval(timer);
  }, [load, selectedId]);

  async function finish(item: WorkItem) {
    setBusyTask(item.taskId);
    setError('');
    try {
      const completion = completionByTask[item.taskId] ?? {};
      let input: TaskCompletionInput = {};
      if (mode === 'registration') {
        input = { facts: factsForSubmission(item, factsByTask[item.taskId]), registrationOutcome: completion.registrationOutcome,
          decisionMotivation: completion.decisionMotivation };
      } else if (mode === 'supplement-request') {
        input = { supplementText: completion.supplementText };
      } else if (mode === 'triage') {
        input = {
          triageOutcome: completion.triageOutcome,
          decisionResult: completion.decisionResult,
          decisionMotivation: completion.decisionMotivation,
          zorgprofiel: completion.zorgprofiel,
          grondslagen: completion.grondslagen?.filter(value => value.trim())
        };
      } else if (mode === 'investigation') {
        input = {
          facts: factsForSubmission(item, factsByTask[item.taskId]),
          decisionResult: completion.decisionResult,
          decisionMotivation: completion.decisionMotivation,
          zorgprofiel: completion.zorgprofiel,
          grondslagen: completion.grondslagen?.filter(value => value.trim())
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
  const canUpload = false;
  return <section className="queue-section">
    <div className="queue-heading">
      <div>
        <span className="section-kicker">Onderzoeker · Wlz-dossier</span>
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
    {!selectedId && items.length>0 && <div className="dossier-overview">
      <label>Dossier zoeken<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Naam of zaak-ID" /></label>
      <table><thead><tr><th>Zaak</th><th>Cliënt</th><th>Ontvangst</th><th>Actie</th></tr></thead><tbody>
        {items.filter(item=>`${item.caseId} ${item.case.person.clientName}`.toLowerCase().includes(search.toLowerCase())).map(item=><tr key={item.taskId}>
          <td>{item.caseId.slice(0,8)}</td><td>{item.case.person.clientName}</td><td>{({CLIENT_PORTAL:'Cliënt',CARE_PROVIDER:'Zorgaanbieder',POST:'Post'})[item.case.application.submissionChannel]}</td>
          <td><button className="secondary" onClick={()=>setSelectedId(item.taskId)}>Open dossier {item.case.person.clientName}</button></td>
        </tr>)}
      </tbody></table>
    </div>}
    {selectedId && <button className="secondary" onClick={()=>setSelectedId('')}>Terug naar dossieroverzicht</button>}
    <div className={`work-list ${registration || reviewer ? 'intake-work-list' : ''}`}>
      {items.filter(item=>!loading && item.taskId===selectedId).map(item => {
        const latestEvaluation = item.policyEvaluations.at(-1);
        const missing = missingFactIds(latestEvaluation);
        const currentFacts = factsByTask[item.taskId] ?? {};
        const automaticApplicantFacts = applicantFacts(item.case);
        const selectedTriageOutcome = completionByTask[item.taskId]?.triageOutcome;
        return <article className={`work-card ${triage ? 'triage-work-card' : ''}`} key={item.taskId}>
        <div className="work-card-header">
          <div><span className="muted">Zaak {item.caseId.slice(0, 8)}</span><h3>{item.case.person.clientName}</h3></div>
          <span className="status">Open</span>
        </div>
        <div className={`dossier-layout ${triage ? 'triage-workspace' : ''} ${investigation ? 'assessment-workspace' : ''}`}>
          <aside className="dossier-sidebar">
            <h4>{triage || investigation ? 'Dossiercontext' : 'Cliënt en contact'}</h4><CaseDetails value={item.case} />
            {triage && <>
              <div className="triage-sidebar-status">
                <span className="triage-sidebar-label">Aanvraagstatus</span>
                <strong>{applicantStatus([], item.case.application.applicantStatus)}</strong>
              </div>
              <nav className="triage-section-nav" aria-label="Navigatie in dossier">
                <span className="triage-sidebar-label">In dit dossier</span>
                <a href={`#triage-summary-${item.taskId}`}>Aanvraag</a>
                <a href={`#triage-documents-${item.taskId}`}>Documenten</a>
                <a href={`#triage-analysis-${item.taskId}`}>Analyse en broncontrole</a>
                <a href={`#triage-policy-${item.taskId}`}>Beleidsuitkomst</a>
                <a href={`#triage-route-${item.taskId}`}>Behandelroute</a>
              </nav>
            </>}
            {investigation && <>
              <div className="triage-sidebar-status">
                <span className="triage-sidebar-label">Aanvraagstatus</span>
                <strong>{applicantStatus([], item.case.application.applicantStatus)}</strong>
              </div>
              <nav className="triage-section-nav assessment-section-nav" aria-label="Navigatie in beoordeling">
                <span className="triage-sidebar-label">Beoordeling</span>
                <a href={`#assessment-documents-${item.taskId}`}>Documenten en OCR</a>
                <a href={`#assessment-analysis-${item.taskId}`}>Cliëntbeeld en beperkingen</a>
                <a href={`#assessment-policy-${item.taskId}`}>Beleidscontrole</a>
                <a href={`#assessment-decision-${item.taskId}`}>Besluit vastleggen</a>
              </nav>
            </>}
          </aside>
          <div className={`dossier-content ${triage ? 'triage-main' : ''}`}>
        {triage && <div className="triage-process-strip" aria-label="Procesvoortgang">
          <div className="triage-process-step complete"><span>1</span><strong>Aanvraag ontvangen</strong></div>
          <div className="triage-process-step complete"><span>2</span><strong>Registratie gecontroleerd</strong></div>
          <div className="triage-process-step active"><span>3</span><strong>Triage</strong></div>
          <div className="triage-process-step"><span>4</span><strong>{selectedTriageOutcome === 'FURTHER_INVESTIGATION' ? 'Nader onderzoek' : selectedTriageOutcome ? 'Beslissing verzenden' : 'Vervolg na triage'}</strong></div>
        </div>}
        <details id={triage ? `triage-summary-${item.taskId}` : undefined} className={`dossier-section ${triage ? 'triage-card' : ''}`} open={registration || triage}>
          <summary>{triage ? 'Aanvraag en context' : 'Aanvraag'}</summary>
          <p>{item.case.application.submittedAt ? `Ontvangen op ${new Date(item.case.application.submittedAt).toLocaleDateString('nl-NL')}` : 'Conceptaanvraag'} · {applicantStatus([],item.case.application.applicantStatus)}</p>
        {triage && <dl className="triage-application-facts">
          <div><dt>Ingediend door</dt><dd>{({client:'Cliënt',gemachtigde:'Gemachtigde',wettelijk_vertegenwoordiger:'Wettelijk vertegenwoordiger'})[item.case.application.applicantRole]}</dd></div>
          <div><dt>Ondertekend door</dt><dd>{({client:'Cliënt',gemachtigde:'Gemachtigde',gevolmachtigde_of_wettelijk_vertegenwoordiger:'Gevolmachtigde of wettelijk vertegenwoordiger',niemand:'Niemand',anders:'Anders'})[item.case.application.signedBy]}</dd></div>
          <div><dt>Blijvende zorgbehoefte</dt><dd>{item.case.application.permanentCareNeed ? 'Ja' : 'Nee'}</dd></div>
          <div><dt>Permanent toezicht</dt><dd>{item.case.application.permanentSupervision ? 'Ja' : 'Nee'}</dd></div>
          <div><dt>Ingediend via</dt><dd>{({CLIENT_PORTAL:'Cliëntportaal',CARE_PROVIDER:'Zorgaanbieder',POST:'Post'})[item.case.application.submissionChannel]}</dd></div>
        </dl>}
        {registration && item.case.application.supplementResponse && <div className="attention-help">
          <strong>Aanvulling van de aanvrager ontvangen</strong>
          <span>{item.case.application.supplementResponse}</span>
        </div>}
        {registration && latestEvaluation && <PolicyOutcome value={latestEvaluation} form={item.intakeForm} />}
        </details>
        {investigation ? <div className="assessment-review-layout">
          <section id={`assessment-documents-${item.taskId}`} className="assessment-source-column" aria-label="Documenten en OCR">
            <div className="assessment-panel-heading"><span>Bronnen</span><h4>Documenten en uitlezing</h4><p>Bekijk de originele stukken en controleer de herkende tekst voordat u bevindingen beoordeelt.</p></div>
            <DocumentList caseId={item.caseId} documents={item.documents} canExtract />
            <p className="muted">AO voegt ontvangen documenten toe. De onderzoeker controleert de inhoud.</p>
          </section>
          <div id={`assessment-analysis-${item.taskId}`} className="assessment-findings-column">
            <DossierAnalysisPanel caseId={item.caseId} documents={item.documents} />
          </div>
        </div> : <>
          <details id={triage ? `triage-documents-${item.taskId}` : undefined} className={`dossier-section ${triage ? 'triage-card' : ''}`} open><summary>Documenten</summary>
            <DocumentList caseId={item.caseId} documents={item.documents} canExtract />
            <p className="muted">AO voegt ontvangen documenten toe. De Onderzoeker controleert de inhoud.</p>
          </details>
          <div id={triage ? `triage-analysis-${item.taskId}` : undefined} className={triage ? 'triage-analysis-card' : ''}>
            <DossierAnalysisPanel caseId={item.caseId} documents={item.documents} />
          </div>
        </>}
        {triage && <details id={`triage-policy-${item.taskId}`} className="dossier-section triage-card" open>
          <summary>Beleidsuitkomst</summary>
          {latestEvaluation
            ? <PolicyOutcome value={latestEvaluation} />
            : <p className="triage-empty-state">Er is nog geen beleidsuitkomst beschikbaar. Dit scherm voegt zelf geen beleidsregels toe.</p>}
        </details>}
        <details id={triage ? `triage-route-${item.taskId}` : investigation ? `assessment-decision-${item.taskId}` : undefined} className={`dossier-section ${triage ? 'triage-card triage-route-card' : ''}`} open>
        <summary>{triage ? 'Behandelroute' : 'Beoordeling en besluit'}</summary>
        {(investigation || registration) && item.intakeForm && <fieldset id={investigation ? `assessment-policy-${item.taskId}` : undefined} className="policy-checks">
          <legend>{investigation ? 'Medisch-inhoudelijke beoordeling' : 'Controle volgens actueel beleid'}</legend>
          <div className="policy-version">Formulier uit RegelRecht-beleid · versie {item.intakeForm.policyVersion.slice(0, 12)}</div>
          {investigation && <div className="attention-help medical">
            <strong>Valideer alleen feiten uit betrouwbare bronstukken</strong>
            <span>RegelRecht ondersteunt het besluitvoorstel. De beoordelaar blijft verantwoordelijk voor de vastgelegde medische bevindingen en motivering.</span>
          </div>}
          <div className="policy-groups">
            {groupedPolicyFields(item.intakeForm.fields, investigation).map(group => <details className="policy-group" key={group.title}>
              <summary className="policy-group-heading"><span><strong>{group.title}</strong><span className="policy-group-description">{group.description}</span></span>
                <span className="policy-group-count">{group.fields.filter(field => currentFacts[field.factId] !== undefined && currentFacts[field.factId] !== '').length}/{group.fields.length} ingevuld</span>
              </summary>
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
            </details>)}
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
        {triage && <fieldset className="triage-route-picker">
          <legend>Kies de behandelroute</legend>
          <div className="triage-route-options">
            {[
              { value: 'FURTHER_INVESTIGATION', title: 'Nader onderzoek inplannen', description: 'De aanvraag gaat naar inhoudelijke behandeling en medische besluitvorming.' },
              { value: 'DIRECT_HANDLED', title: 'Direct afhandelen', description: 'De aanvraag gaat rechtstreeks naar een beslissing, zonder onderzoekstaak.' },
              { value: 'NOT_TAKEN_INTO_CONSIDERATION', title: 'Niet in behandeling nemen', description: 'Leg vast waarom de aanvraag niet verder in behandeling wordt genomen.' }
            ].map(option => <label className={`triage-route-option ${selectedTriageOutcome === option.value ? 'selected' : ''}`} key={option.value}>
              <input type="radio" name={`triageOutcome-${item.taskId}`} required value={option.value}
                checked={selectedTriageOutcome === option.value}
                onChange={() => setCompletionByTask(current => ({
                  ...current,
                  [item.taskId]: { ...(current[item.taskId] ?? {}), triageOutcome: option.value as TaskCompletionInput['triageOutcome'] }
                }))} />
              <span><strong>{option.title}</strong><small>{option.description}</small></span>
            </label>)}
          </div>
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
            && <label className="task-choice">Toelichting bij de gekozen route
              <textarea rows={3} maxLength={4000} value={completionByTask[item.taskId]?.decisionMotivation ?? ''}
                onChange={event => setCompletionByTask(current => ({
                  ...current, [item.taskId]: { ...(current[item.taskId] ?? {}), decisionMotivation: event.target.value }
              }))} />
            </label>}
          {selectedTriageOutcome === 'DIRECT_HANDLED' && <div className="triage-decision-details">
            <label className="task-choice">Zorgprofiel (optioneel)
              <input maxLength={100} value={completionByTask[item.taskId]?.zorgprofiel ?? ''}
                onChange={event => setCompletionByTask(current => ({ ...current,
                  [item.taskId]: { ...(current[item.taskId] ?? {}), zorgprofiel: event.target.value } }))} />
            </label>
            <label className="task-choice">Grondslagen (optioneel, één per regel)
              <textarea rows={3} value={(completionByTask[item.taskId]?.grondslagen ?? []).join('\n')}
                onChange={event => setCompletionByTask(current => ({ ...current,
                  [item.taskId]: { ...(current[item.taskId] ?? {}), grondslagen: event.target.value.split('\n') } }))} />
            </label>
          </div>}
        </fieldset>}
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
        {!triage && <div className="staff-documents">
          <h4>Documenten</h4>
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
          {mode === 'investigation' && <>
            <label>Zorgprofiel (optioneel)
              <input maxLength={100} value={completionByTask[item.taskId]?.zorgprofiel ?? ''}
                onChange={event => setCompletionByTask(current => ({ ...current,
                  [item.taskId]: { ...(current[item.taskId] ?? {}), zorgprofiel: event.target.value } }))} />
            </label>
            <label>Grondslagen (optioneel, één per regel)
              <textarea rows={3} value={(completionByTask[item.taskId]?.grondslagen ?? []).join('\n')}
                onChange={event => setCompletionByTask(current => ({ ...current,
                  [item.taskId]: { ...(current[item.taskId] ?? {}), grondslagen: event.target.value.split('\n') } }))} />
            </label>
          </>}
          {mode === 'outgoing' && item.case.decisions.at(-1) && <div className="decision-result">
            <h4>{decisionLabel(item.case.decisions.at(-1)?.result)}</h4>
            <p>{item.case.decisions.at(-1)?.motivation}</p>
          </div>}
        </div>}
        </details>
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
                  : Boolean(item.case.decisions.at(-1)?.result);
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
        </div></div>
      </article>;})}
    </div>
  </section>;
}

function EmployeePage() {
  const [cases,setCases]=useState<Case[]>([]);
  const [selected,setSelected]=useState<Case|null>(null);
  const [search,setSearch]=useState('');
  const [documents,setDocuments]=useState<CaseDocument[]>([]);
  const [file,setFile]=useState<File|null>(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  useEffect(()=>{ void getCases().then(setCases).catch(e=>setError(errorMessage(e))); },[]);
  async function open(value: Case) {
    setSelected(value);setFile(null);setError('');
    try { setDocuments(await getCaseDocuments(value.caseId)); } catch(e) {setError(errorMessage(e));}
  }
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if(!file || !selected) return; setBusy(true);setError('');
    try { await uploadCaseDocument(selected.caseId,file);setDocuments(await getCaseDocuments(selected.caseId));setFile(null); }
    catch(e) {setError(errorMessage(e));} finally {setBusy(false);}
  }
  return <section className="queue-section"><h2>AO · Documenten uploaden</h2>
    <p>Selecteer de zaak en voeg het ontvangen document toe. De Onderzoeker voert de controle uit.</p>
    {error && <p role="alert">{error}</p>}
    <label>Dossier zoeken<input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Naam of zaak-ID" /></label>
    <div className="dossier-overview"><table><thead><tr><th>Zaak</th><th>Cliënt</th><th>Actie</th></tr></thead><tbody>
      {cases.filter(c=>`${c.caseId} ${c.person.clientName}`.toLowerCase().includes(search.toLowerCase())).map(c=><tr key={c.caseId}>
        <td>{c.caseId.slice(0,8)}</td><td>{c.person.clientName}</td><td><button className="secondary" onClick={()=>void open(c)}>Open dossier {c.person.clientName}</button></td>
      </tr>)}
    </tbody></table></div>
    {selected && <article className="upload-card"><h3>{selected.person.clientName}</h3><p>Zaak {selected.caseId}</p>
      <form className="upload" onSubmit={e=>void upload(e)}><label>Ontvangen document<input type="file" accept="application/pdf,image/jpeg,image/png" required onChange={e=>setFile(e.target.files?.[0]??null)} /></label>
        <button disabled={busy || !file}>{busy ? 'Uploaden…' : 'Document uploaden'}</button></form>
      <DocumentList caseId={selected.caseId} documents={documents} />
    </article>}
  </section>;
}

function ReviewerPage() {
  const [revision, setRevision] = useState(0);
  const [tab,setTab]=useState<QueueMode>('registration');
  const [post,setPost]=useState(false);
  const refreshQueues = () => setRevision(current => current + 1);
  const queues: {mode: QueueMode; type: TaskType; label: string}[] = [
    {mode:'registration',type:'REGISTRATION_ACCEPTANCE',label:'Controle'},
    {mode:'supplement-request',type:'REQUEST_ADDITIONAL_INFORMATION',label:'Aanvulling'},
    {mode:'triage',type:'TRIAGE',label:'Triage'},
    {mode:'investigation',type:'WLZ_INVESTIGATION_DECISION',label:'Onderzoek'},
    {mode:'outgoing',type:'OUTGOING_COMMUNICATION',label:'Verzending'}
  ];
  return <div className="employee-sections">
    <div className="researcher-tabs" aria-label="Werkvoorraad Onderzoeker">{queues.map(q=><button className={tab===q.mode && !post?'':'secondary'} key={q.mode} onClick={()=>{setTab(q.mode);setPost(false);}}>{q.label}</button>)}
      <button className="secondary" onClick={()=>setPost(p=>!p)}>Postaanvraag registreren</button>
    </div>
    {post ? <ApplicantPage postIntake /> : queues.filter(q=>q.mode===tab).map(q=><WorkQueue key={`${q.mode}-${revision}`} type={q.type} mode={q.mode} onWorkflowChange={refreshQueues} />)}
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
      {(path.startsWith('/aanvrager') || path.startsWith('/zorgaanbieder')) && <div className="demo-note">Fictieve PoC-aanvrageromgeving — gebruik hier geen echte persoonsgegevens. Deze demo is niet beveiligd met medewerkerslogin.</div>}
      {path.startsWith('/beoordelaar') && <StaffAccessPage role="beoordelaar" label="Onderzoeker" />}
      {path.startsWith('/ciz-medewerker') && <StaffAccessPage role="ciz-medewerker" label="AO" />}
      {path.startsWith('/beoordelaar')
        ? auth.hasRole('beoordelaar') && <ReviewerPage />
        : path.startsWith('/ciz-medewerker')
          ? auth.hasRole('ciz-medewerker') && <EmployeePage />
          : <ApplicantPage careProvider={path.startsWith('/zorgaanbieder')} />}
    </main>
  </>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><AuthProvider><App /></AuthProvider></React.StrictMode>);

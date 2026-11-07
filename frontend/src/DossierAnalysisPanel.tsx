import { useEffect, useState } from 'react';
import { getAnalyses, startAnalysis, reviewAnalysis, getBasRuns } from './api';
import type { DossierAnalysis, ReviewedFinding, BasRun } from './api';
import type { CaseDocument } from './types';
import { SourceViewer } from './SourceViewer';
import { readableDocumentText } from './documentText';

export function DossierAnalysisPanel({caseId, documents}: {caseId: string; documents: CaseDocument[]}) {
  const [history,setHistory]=useState<DossierAnalysis[]>([]);
  const [runs,setRuns]=useState<BasRun[]>([]);
  const [findings,setFindings]=useState<ReviewedFinding[]>([]);
  const [clientPicture,setClientPicture]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [confirmed,setConfirmed]=useState(false);
  const latest=history[0];
  const waiting=latest?.status==='QUEUED' || latest?.status==='PROCESSING';
  async function refresh() {
    try { const [analyses,processing]=await Promise.all([getAnalyses(caseId),getBasRuns(caseId)]);setHistory(analyses);setRuns(processing);setError(''); }
    catch(caught) { setError(caught instanceof Error ? caught.message : 'Analyse ophalen lukt niet.'); }
  }
  useEffect(()=>{ void refresh(); },[caseId,documents.length]);
  useEffect(()=> {
    if(!documents.length) return;
    const timer=window.setInterval(()=>void refresh(),5000); return ()=>window.clearInterval(timer);
  },[documents.length,caseId]);
  useEffect(()=> {
    const review=latest?.reviews.at(-1)?.review;
    setFindings(review?.findings ?? latest?.output?.findings.map(f=>({...f,disposition:'CONFIRMED' as const})) ?? []);
    setClientPicture(review?.clientPicture ?? latest?.output?.clientPicture ?? '');
    setConfirmed(false);
  },[latest?.analysisId,latest?.status]);
  async function start() {
    setBusy(true); setError('');
    try { await startAnalysis(caseId); await refresh(); }
    catch(caught) { setError(caught instanceof Error ? caught.message : 'Analyse starten lukt niet.'); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true); setError('');
    try { const saved=await reviewAnalysis(caseId,latest!.analysisId,{findings,clientPicture}); setHistory(h=>[saved,...h.slice(1)]); setConfirmed(false); }
    catch(caught) { setError(caught instanceof Error ? caught.message : 'Review vastleggen lukt niet.'); }
    finally { setBusy(false); }
  }
  function change(index: number, value: Partial<ReviewedFinding>) {
    setConfirmed(false);
    setFindings(list=>list.map((f,i)=>i===index ? {...f,...value,disposition:value.disposition ?? (f.disposition==='MANUAL'?'MANUAL':'ADJUSTED')} : f));
  }
  return <section className="dossier-analysis" aria-label="Stoornissenanalyse">
    <details className="dossier-section" open><summary>Stoornissen en beperkingen</summary>
      <div className="assessment-summary">
        <div><span className="assessment-eyebrow">Inhoudelijke beoordeling</span><h4>Cliëntbeeld en beperkingen</h4>
          <p>Controleer per domein de score, toelichting en bijbehorende bron. OCR- en modeluitkomsten zijn voorstellen; u bepaalt wat wordt vastgelegd.</p></div>
        <button disabled={busy || waiting || !documents.length} onClick={()=>void start()}>{waiting?'Dossier wordt geanalyseerd…':latest?.status==='READY'?'Opnieuw analyseren':'Dossier analyseren'}</button>
      </div>
      {error && <p role="alert">{error}</p>}
      {runs.length>0 && <details className="bas-processing-history"><summary>Documentverwerking en analyseversies ({runs.length})</summary>
        <ul>{runs.map(run=><li key={run.runId}>
          <strong>{({DOCUMENT_RECEIVED:'Document ontvangen',APPLICATION_SUBMITTED:'Aanvraag ingediend',MEDICAL_SUPPLEMENT:'Medische aanvulling',MANUAL_RERUN:'Opnieuw uitgevoerd'} as Record<string,string>)[run.reason] ?? 'Documentverwerking'}</strong>
          <span> · {({QUEUED:'Wacht op verwerking',EXTRACTING:'Documenten uitlezen',WAITING_FOR_SOURCES:'Wacht op voldoende brongegevens',ANALYSING:'Dossier wordt geanalyseerd',READY:'Verwerking gereed',FAILED:'Verwerking niet gelukt'} as Record<string,string>)[run.status]}</span>
          <small> · {run.documentIds.length} {run.documentIds.length===1?'document':'documenten'} · {new Date(run.createdAt).toLocaleString('nl-NL')}</small>
        </li>)}</ul>
      </details>}
      {latest?.stale && <p className="attention-help">Deze analyse is verouderd doordat het dossier is gewijzigd. Analyseer opnieuw voordat u bevindingen bevestigt.</p>}
      {latest?.status==='FAILED' && <p role="alert">Analyse niet beschikbaar. Controleer de aansluiting op de interne stoornissenpipeline. Er zijn geen feiten vastgesteld.</p>}
      {latest?.output?.mock && <p className="demo-note">Simulatie voor contracttests — RobBERT is niet uitgevoerd.</p>}
      {latest?.output && <p className="assessment-provenance">Bron: {latest.output.classifierModel} · {latest.output.pipelineVersion}. Scores komen uit de Ernst-stap; open een bevinding om de onderbouwing te controleren.</p>}
      {latest?.status==='READY' && findings.length>0 && <div className="assessment-findings-overview" aria-live="polite">
        <strong>{findings.length} {findings.length===1?'bevinding':'bevindingen'}</strong>
        <span>{findings.filter(f=>f.score!==null).length} met score · {findings.filter(f=>f.disposition==='CONFIRMED').length} bevestigd</span>
      </div>}
      {latest?.status==='READY' && findings.length===0 && <p>Geen voorstellen ontvangen. Dit betekent niet automatisch dat er geen beperkingen zijn.</p>}
      {latest?.status==='READY' && <details><summary>Handmatige bevinding toevoegen met bron</summary>
        {latest.output?.sourceUnits.map((source,i)=><div className="source-passage" key={i}>
          <p>{readableDocumentText(source.text).slice(0,300)}</p>
          <button className="secondary" onClick={()=>{setConfirmed(false);setFindings(list=>[...list,{findingId:crypto.randomUUID(),domain:'',score:null,explanation:'',disposition:'MANUAL',sources:[source]}]);}}>Gebruik deze bron</button>
        </div>)}
      </details>}
      {findings.map((f,index)=><details className="finding-card assessment-finding" open={index===0} key={f.findingId}>
        <summary><span className="finding-title"><strong>{f.domain || 'Nieuwe bevinding'}</strong><small>{({CONFIRMED:'Voorstel bevestigd',ADJUSTED:'Aangepast door beoordelaar',REJECTED:'Voorstel afgewezen',MANUAL:'Handmatig toegevoegd'})[f.disposition]}</small></span>
          <span className={`finding-score ${f.score===null?'unrated':''}`}>{f.score===null?'Geen score':`Score ${f.score}/4`}</span></summary>
        <div className="finding-fields">
          <label>Domein<input value={f.domain} maxLength={200} onChange={e=>change(index,{domain:e.target.value})} /></label>
          <label>Ernstscore<select value={f.score ?? ''} onChange={e=>change(index,{score:e.target.value===''?null:Number(e.target.value)})}>
            <option value="">Niet beoordeeld</option><option value="0">0 — geen beperking</option>
            {[1,2,3,4].map(n=><option key={n} value={n}>{n}</option>)}
          </select></label>
          <label>Beoordeling<select value={f.disposition} onChange={e=>change(index,{disposition:e.target.value as ReviewedFinding['disposition']})}>
            {f.disposition==='MANUAL'?<option value="MANUAL">Handmatig toegevoegd</option>:<><option value="CONFIRMED">Voorstel bevestigen</option><option value="ADJUSTED">Voorstel aangepast</option><option value="REJECTED">Voorstel afwijzen</option></>}
          </select></label>
        </div>
        <label>Toelichting<textarea rows={3} value={f.explanation} maxLength={20000} onChange={e=>change(index,{explanation:e.target.value})} /></label>
        {f.sources.map((source,i)=><div className="source-passage" key={i}>
          <blockquote style={{whiteSpace: 'pre-wrap'}}>{readableDocumentText(source.text)}</blockquote>
          <p>{documents.find(d=>d.documentId===source.documentId)?.fileName ?? 'Brondocument'} · subdocument {source.subdocumentId ?? 'onbekend'} · pagina {source.pages?.join(', ') || 'onbekend'}</p>
          <SourceViewer caseId={caseId} documentId={source.documentId} title={documents.find(d=>d.documentId===source.documentId)?.fileName ?? 'Brondocument'} text={readableDocumentText(source.text)} />
          <button className="secondary" onClick={()=>setFindings(list=>[...list,{findingId:crypto.randomUUID(),domain:'',score:null,explanation:'',disposition:'MANUAL',sources:[source]}])}>Handmatige bevinding met deze bron toevoegen</button>
        </div>)}
      </details>)}
      {latest?.status==='READY' && !latest.stale && <>
        <label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)} />Ik heb de bevindingen, scores en bronnen gecontroleerd.</label>
        <button disabled={busy || !confirmed || findings.some(f=>!f.domain.trim() || !f.explanation.trim())} onClick={()=>void save()}>Bevindingen vastleggen</button>
      </>}
      {latest?.reviews.length ? <p className="assessment-audit">Laatste menselijke controle: {new Date(latest.reviews.at(-1)!.reviewedAt).toLocaleString('nl-NL')}.</p> : null}
      <details><summary>Analysehistorie ({history.length})</summary>{history.map(item=><p key={item.analysisId}>{new Date(item.createdAt).toLocaleString('nl-NL')} · {item.status} · {item.reviews.length} reviews</p>)}</details>
    </details>
    <details className="dossier-section client-picture-section"><summary>Cliëntbeeld</summary>
      <p>Beschrijf het functioneren op basis van gecontroleerde bronnen.</p>
      <label>Gecontroleerd cliëntbeeld<textarea rows={4} maxLength={20000} value={clientPicture} onChange={e=>{setClientPicture(e.target.value);setConfirmed(false);}} /></label>
    </details>
  </section>;
}

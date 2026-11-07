import { useEffect, useState } from 'react';
import { getDocumentExtraction, startDocumentExtraction, reviewDocumentExtraction } from './api';
import type { DocumentExtraction } from './api';
import { SourceViewer } from './SourceViewer';
import { readableDocumentText } from './documentText';

const statusLabels: Record<DocumentExtraction['status'], string> = {
  PROCESSING: 'Bezig met uitlezen',
  READY: 'Controle nodig',
  FAILED: 'Niet gelukt',
  REVIEWED: 'Controle vastgelegd'
};

export function DocumentExtractionPanel({caseId, documentId, canExtract}: {
  caseId: string; documentId: string; canExtract: boolean
}) {
  const [result, setResult] = useState<DocumentExtraction | null>(null);
  const [text, setText] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const value = await getDocumentExtraction(caseId, documentId);
        if (active) setResult(value);
      } catch { if (active) setError('Documentverwerking is tijdelijk niet beschikbaar.'); }
    }
    void refresh();
    return () => { active = false; };
  }, [caseId, documentId]);
  useEffect(() => {
    if (!canExtract) return;
    const timer = window.setInterval(() => {
      void getDocumentExtraction(caseId, documentId).then(setResult).catch(() => setError('Voortgang ophalen is tijdelijk niet mogelijk.'));
    }, 5000);
    return () => window.clearInterval(timer);
  }, [canExtract, caseId, documentId]);
  useEffect(() => {setText('');setConfirmed(false);}, [result?.extractionId]);
  async function start() {
    setBusy(true); setError('');
    try { setResult(await startDocumentExtraction(caseId, documentId)); }
    catch { setError('Document uitlezen kon niet worden gestart. Probeer later opnieuw.'); }
    finally { setBusy(false); }
  }
  async function review() {
    setBusy(true); setError('');
    try { setResult(await reviewDocumentExtraction(caseId, documentId, text)); }
    catch { setError('Bevestigen is niet gelukt. Controleer de tekst en probeer opnieuw.'); }
    finally { setBusy(false); }
  }

  const fragments = result?.fragments ?? [];
  const groups = new Map<string, {title: string; page?: number; pages?: number[]; texts: string[]}>();
  fragments.forEach(fragment => {
    const pageLabel = fragment.pages?.join(',') || fragment.page || 'onbekend';
    const key = `${fragment.subdocumentId ?? '?'}:${pageLabel}`;
    const group = groups.get(key) ?? {
      title: `Subdocument ${fragment.subdocumentId ?? 'onbekend'} · pagina ${fragment.pages?.join(', ') || fragment.page || 'onbekend'}`,
      page: fragment.page ?? fragment.pages?.[0],
      pages: fragment.pages ?? undefined,
      texts: []
    };
    group.texts.push(readableDocumentText(fragment.text));
    groups.set(key, group);
  });

  return <section className="ocr-review" aria-label="Document uitlezen">
    {error && <p className="ocr-error" role="alert">{error}</p>}
    {!result && <div className="ocr-start-card">
      <div>
        <span className="ocr-kicker">Documentverwerking</span>
        <h4>PDF uitlezen</h4>
        <p>Laat tekst uit dit document ophalen. De uitkomst is een voorstel dat eerst met de PDF moet worden vergeleken.</p>
      </div>
      {canExtract && <button type="button" disabled={busy} onClick={() => void start()}>
        {busy ? 'Starten…' : 'PDF uitlezen'}
      </button>}
    </div>}
    {result && <>
      <header className="ocr-result-header">
        <div>
          <span className="ocr-kicker">PDF uitlezen</span>
          <h4>{statusLabels[result.status]}</h4>
          <p>{result.status === 'PROCESSING' ? 'De documentverwerking loopt. De voortgang wordt automatisch bijgewerkt.'
            : result.status === 'READY' ? `${fragments.length} herkenningsfragment${fragments.length === 1 ? '' : 'en'} klaar om met het origineel te controleren.`
              : result.status === 'REVIEWED' ? 'De gecontroleerde tekst is vastgelegd voor dit dossier.'
                : 'Er is geen controleerbaar resultaat. Gebruik het originele document.'}</p>
        </div>
        <span className={`ocr-status-pill ${result.status.toLowerCase()}`}>{statusLabels[result.status]}</span>
      </header>

      {result.mock && <p className="ocr-simulation-note"><strong>Simulatie — geen echte OCR.</strong> De voorbeeldtekst is niet uit dit document herkend.</p>}
      {result.status === 'PROCESSING' && <div className="ocr-processing" role="status"><span className="ocr-spinner" />Document wordt verwerkt…</div>}
      {result.status === 'FAILED' && canExtract && <button type="button" disabled={busy} onClick={() => void start()}>Opnieuw proberen</button>}

      {(result.status === 'READY' || result.status === 'REVIEWED') && <>
        <div className="ocr-review-warning"><strong>Controleer vóór gebruik</strong><span>OCR kan fouten bevatten. Vergelijk elk fragment met de oorspronkelijke PDF. Er worden geen beleidsfeiten automatisch ingevuld.</span></div>
        <section className="ocr-data-summary" aria-label="Geëxtraheerde documentgegevens">
          <div className="ocr-data-summary-heading"><div><span className="ocr-kicker">Resultaat uit PDF</span><h5>Geëxtraheerde documentgegevens</h5></div><span className="ocr-untrusted-badge">Nog te controleren</span></div>
          <p>De tekst hieronder is door OCR uit het document herkend en gegroepeerd per onderdeel en pagina. Dit zijn brongegevens, geen bevestigde feiten of automatisch ingevulde beleidsantwoorden.</p>
          <div className="ocr-data-counts"><div><strong>{fragments.length}</strong><span>tekstfragmenten</span></div><div><strong>{groups.size}</strong><span>documentonderdelen</span></div><div><strong>{new Set(fragments.flatMap(fragment => fragment.pages ?? (fragment.page ? [fragment.page] : []))).size}</strong><span>pagina’s met tekst</span></div></div>
        </section>
        <div className="ocr-fragments-heading"><div><h5>Herkenningsfragmenten</h5><p>Groepeerd op subdocument en paginaverwijzing.</p></div><span>{groups.size} {groups.size === 1 ? 'groep' : 'groepen'}</span></div>
        {groups.size > 0 ? <div className="ocr-fragments-list">{[...groups.entries()].map(([key, group]) => <details className="ocr-fragment" key={key}>
          <summary><span>{group.title}</span><small>{group.texts.length} {group.texts.length === 1 ? 'fragment' : 'fragmenten'}</small></summary>
          <div className="ocr-fragment-body">
            <pre>{group.texts.join('\n\n')}</pre>
            {canExtract && <SourceViewer caseId={caseId} documentId={documentId} title={group.title} page={group.page} text={group.texts.join('\n\n')} buttonLabel="Vergelijk met PDF" />}
          </div>
        </details>)}</div> : <p className="ocr-empty">Er zijn geen leesbare fragmenten teruggekomen. Open het origineel en controleer het document handmatig.</p>}
        {canExtract && result.status === 'READY' && <div className="ocr-human-review">
          <div className="ocr-review-heading"><span>Volgende stap</span><h5>Gecontroleerde tekst vastleggen</h5>
            <p>Neem de juiste tekst over en corrigeer eventuele OCR-fouten. Dit bevestigt alleen de tekst, niet de medische beoordeling.</p>
          </div>
          <label>Tekst na controle
            <textarea rows={6} maxLength={20000} value={text} onChange={event => { setText(event.target.value); setConfirmed(false); }} />
          </label>
          <label className="ocr-confirm-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
            <span>Ik heb de tekst met het oorspronkelijke document vergeleken en waar nodig gecorrigeerd.</span>
          </label>
          <button type="button" disabled={busy || !confirmed || !text.trim()} onClick={() => void review()}>
            {busy ? 'Vastleggen…' : 'Gecontroleerde tekst vastleggen'}
          </button>
        </div>}
      </>}

      {result.status === 'REVIEWED' && <div className="ocr-reviewed-result">
        <div><strong>Gecontroleerde tekst</strong><span>{result.reviewedAt ? new Date(result.reviewedAt).toLocaleString('nl-NL') : ''}</span></div>
        <pre>{readableDocumentText(result.reviewedText ?? '')}</pre>
      </div>}

      <details className="ocr-technical-details"><summary>Technische herkomst</summary>
        <dl><div><dt>Pipelineversie</dt><dd>{result.providerVersion ?? 'Onbekend'}</dd></div>
          <div><dt>Model</dt><dd>{result.modelId ?? 'Niet opgegeven'}</dd></div>
          <div><dt>Bronbestand</dt><dd>Dit document</dd></div></dl>
      </details>
    </>}
  </section>;
}

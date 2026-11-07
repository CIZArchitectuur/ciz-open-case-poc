import { useEffect, useState } from 'react';
import { downloadCaseDocument } from './api';

export function SourceViewer({caseId, documentId, title, page, text, buttonLabel}: {caseId: string; documentId: string; title: string; page?: number; text?: string; buttonLabel?: string}) {
  const [url,setUrl]=useState('');
  const [error,setError]=useState('');
  const [open,setOpen]=useState(false);
  useEffect(()=> {
    if(!open) return;
    let active=true;
    let objectUrl='';
    void downloadCaseDocument(caseId,documentId).then(blob=> {
      objectUrl=URL.createObjectURL(blob);
      if(active) setUrl(objectUrl);
      else URL.revokeObjectURL(objectUrl);
    }).catch(()=>{ if(active) setError('Bron openen lukt tijdelijk niet.'); });
    return ()=>{ active=false; if(objectUrl) URL.revokeObjectURL(objectUrl); setUrl(''); };
  },[open,caseId,documentId]);
  return <>
    <button className="secondary" onClick={()=>setOpen(true)}>{buttonLabel ?? `Bron bekijken: ${title}`}</button>
    {open && <dialog open className="source-dialog" aria-label={`Bron: ${title}`}>
      <header><h3>{title}</h3><button onClick={()=>setOpen(false)}>Sluiten</button></header>
      <p>Paginaverwijzingen kunnen bij een subdocument horen. Controleer de pagina in de oorspronkelijke PDF.</p>
      {error && <p role="alert">{error}</p>}
      {url && <><div className={text?'source-comparison':'source-pdf'}><iframe title={`PDF ${title}`} src={`${url}${page ? `#page=${page}` : ''}`} />
        {text && <div className="source-text"><h4>Uitgelezen tekst — controleer de bron</h4><p style={{whiteSpace:'pre-wrap'}}>{text}</p></div>}</div>
        <a href={url} download={title}>PDF downloaden</a></>}
    </dialog>}
  </>;
}

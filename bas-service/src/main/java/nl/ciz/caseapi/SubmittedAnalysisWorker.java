package nl.ciz.caseapi;

import io.quarkus.scheduler.Scheduled;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.util.HashMap;
import nl.ciz.caseapi.generated.model.DocumentExtraction;

@ApplicationScoped
public class SubmittedAnalysisWorker {
    @jakarta.inject.Inject DocumentExtractionService extraction;
    @jakarta.inject.Inject DossierAnalysisService analysis;
    @jakarta.inject.Inject DocumentGateway documents;
    @Scheduled(every="5s",concurrentExecution=Scheduled.ConcurrentExecution.SKIP)
    @Transactional
    void process() {
        for(var pending:BasSubmissionEntity.<BasSubmissionEntity>find("status='ANALYSING'").page(0,25).list()) {
            var result=DossierAnalysisEntity.<DossierAnalysisEntity>findById(pending.analysisId);
            if(result!=null && ("READY".equals(result.status) || "FAILED".equals(result.status))) {
                pending.status=result.status;pending.errorCode=result.errorCode;
            }
        }
        for(var row:BasSubmissionEntity.<BasSubmissionEntity>find("status in ('QUEUED','EXTRACTING','WAITING_FOR_SOURCES') order by occurredAt")
                .withLock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE).page(0,25).list()) processRow(row);
    }
    private void processRow(BasSubmissionEntity row) {
        if(row.documentIds.isEmpty()) {row.status="READY"; return;}
        try {
            var metadata=documents.list(row.caseId);
            if(!metadata.stream().map(nl.ciz.caseapi.generated.model.CaseDocument::getDocumentId).toList().containsAll(row.documentIds)) {
                row.status="FAILED";row.errorCode="DOCUMENT_NOT_FOUND";return;
            }
            if(!row.components.contains("OCR") && !row.components.contains("DOSSIER")) {row.status="READY";return;}
            var context=new HashMap<String,String>();
            context.put("X-Correlation-ID",row.correlationId);
            if(row.traceParent!=null) context.put("traceparent",row.traceParent);
            boolean ready=true;
            for(var id:row.documentIds) {
                var existing=DocumentExtractionEntity.<DocumentExtractionEntity>find("caseId=?1 and documentId=?2 order by createdAt desc",row.caseId,id).firstResult();
                if(existing==null && !row.components.contains("OCR")) {row.status="WAITING_FOR_SOURCES";return;}
                var output=existing==null || (row.forceRerun && "QUEUED".equals(row.status))
                        ?extraction.start(row.caseId,id,row.forceRerun,context):extraction.get(row.caseId,id,context);
                if(output.getStatus()==DocumentExtraction.StatusEnum.FAILED) {row.status="FAILED";row.errorCode="EXTRACTION_FAILED";return;}
                ready &= output.getStatus()==DocumentExtraction.StatusEnum.READY || output.getStatus()==DocumentExtraction.StatusEnum.REVIEWED;
            }
            row.status="EXTRACTING";
            if(ready) {
                if(!row.components.contains("DOSSIER")) {row.status="READY";return;}
                var result=analysis.startSnapshot(row.caseId,context,row.documentIds);
                if(new java.util.HashSet<>(result.getDocumentIds()).equals(new java.util.HashSet<>(row.documentIds))) {
                    row.analysisId=result.getAnalysisId(); row.status="ANALYSING";
                }
            }
        } catch(jakarta.ws.rs.WebApplicationException failure) {
            if(failure.getResponse().getStatus()<500) {row.status="FAILED";row.errorCode="UNSUPPORTED_DOCUMENT";}
            else if(++row.attempts>=12) {row.status="FAILED";row.errorCode="UNAVAILABLE";}
            // Provider outages are retried on the next poll; payloads are never logged.
        } catch(RuntimeException unavailable) {
            if(++row.attempts>=12) {row.status="FAILED";row.errorCode="UNAVAILABLE";}
        }
    }
}

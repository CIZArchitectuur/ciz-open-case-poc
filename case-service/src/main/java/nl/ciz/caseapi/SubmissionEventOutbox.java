package nl.ciz.caseapi;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import nl.ciz.caseapi.generated.model.CaseDocument;

@ApplicationScoped
public class SubmissionEventOutbox {
    @Transactional
    public SubmissionEventEntity record(ApplicationEntity application, List<CaseDocument> documents, String correlationId) {
        var row = new SubmissionEventEntity();
        row.eventId = UUID.randomUUID(); row.caseId = application.caseId;
        row.applicationId = application.applicationId; row.occurredAt = Instant.now();
        row.correlationId = correlationId == null || correlationId.isBlank() || correlationId.length() > 100
                ? UUID.randomUUID().toString() : correlationId;
        row.documentIds = documents.stream().map(CaseDocument::getDocumentId).toList();
        var context=io.opentelemetry.api.trace.Span.current().getSpanContext();
        if(context.isValid()) row.traceParent="00-"+context.getTraceId()+"-"+context.getSpanId()+"-"+context.getTraceFlags().asHex();
        row.persist();
        return row;
    }
    @Transactional
    public void documentReceived(ApplicationEntity application,CaseDocument document) {
        var row=record(application,List.of(document),UUID.randomUUID().toString());
        row.eventType="DocumentReceived";
    }
    @Transactional
    public List<SubmissionEventEntity> pending() {
        return SubmissionEventEntity.<SubmissionEventEntity>find("publishedAt is null order by occurredAt").page(0,25).list();
    }
    @Transactional
    public void published(UUID id) { SubmissionEventEntity.<SubmissionEventEntity>findById(id).publishedAt = Instant.now(); }
}

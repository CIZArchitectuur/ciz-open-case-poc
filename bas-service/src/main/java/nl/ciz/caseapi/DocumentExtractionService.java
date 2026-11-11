package nl.ciz.caseapi;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.WebApplicationException;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;
import nl.ciz.caseapi.generated.documentstructuring.api.DefaultApi;
import nl.ciz.caseapi.generated.documentstructuring.model.StructuringResult;
import nl.ciz.caseapi.generated.model.DocumentExtraction;
import nl.ciz.caseapi.generated.model.DocumentReview;
import org.eclipse.microprofile.rest.client.inject.RestClient;

@ApplicationScoped
public class DocumentExtractionService {
    private final DefaultApi api;
    private final DocumentGateway documents;
    private final ObjectMapper mapper;
    public DocumentExtractionService(@RestClient DefaultApi api, DocumentGateway documents, ObjectMapper mapper) {
        this.api=api; this.documents=documents; this.mapper=mapper;
    }
    @Transactional
    public DocumentExtraction start(UUID caseId, UUID documentId, boolean force, Map<String,String> context) {
        BasSubmissionEntity.lockCase(caseId);
        var existing=DocumentExtractionEntity.<DocumentExtractionEntity>find("documentId = ?1 order by createdAt desc",documentId).firstResult();
        if(!force && existing!=null && existing.result.getStatus()!=StructuringResult.StatusEnum.FAILED
                && !(existing.result.getStatus()==StructuringResult.StatusEnum.READY && existing.artifactId==null)) return model(existing);
        var content=documents.download(caseId,documentId);
        var row=new DocumentExtractionEntity();
        row.extractionId=UUID.randomUUID(); row.caseId=caseId; row.documentId=documentId; row.createdAt=Instant.now();
        try {
            if (!"application/pdf".equals(content.contentType())) throw new WebApplicationException("Alleen PDF wordt ondersteund.",400);
            row.result=api.startStructuring(content.file(),context.get("X-Correlation-ID"),
                    context.get("traceparent"),context.get("tracestate"));
        }
        catch(WebApplicationException invalid) {throw invalid;}
        catch(Exception unavailable) { throw new WebApplicationException("Documentverwerking is tijdelijk niet beschikbaar.",503); }
        finally {try {java.nio.file.Files.deleteIfExists(content.file().toPath());} catch(java.io.IOException ignored) {}}
        row.persist();
        return model(row);
    }
    @Transactional
    public DocumentExtraction get(UUID caseId, UUID documentId, Map<String,String> context) {
        var row=find(caseId,documentId);
        if(row.result.getStatus()==StructuringResult.StatusEnum.PROCESSING) {
            if(row.createdAt.isBefore(Instant.now().minusSeconds(3600))) row.result.setStatus(StructuringResult.StatusEnum.FAILED);
            else {
                try {
                    row.result=api.getStructuring(row.result.getJobId(),context.get("X-Correlation-ID"),
                            context.get("traceparent"),context.get("tracestate"));
                    if (row.result.getStatus()==StructuringResult.StatusEnum.READY && row.result.getClassificationUnits()!=null) {
                        row.artifactId=documents.storeArtifact(caseId, mapper.writeValueAsBytes(row.result));
                        row.result.setClassificationUnits(null);
                    }
                }
                catch(Exception unavailable) { throw new WebApplicationException("Documentverwerking is tijdelijk niet beschikbaar.",503); }
            }
        }
        return model(row);
    }
    @Transactional
    public DocumentExtraction review(UUID caseId, UUID documentId, DocumentReview review, String actor) {
        if(actor==null || actor.isBlank() || actor.length()>200) throw new WebApplicationException("Geen geldige beoordelaaridentificatie.",403);
        var row=find(caseId,documentId);
        if(row.result.getStatus()!=StructuringResult.StatusEnum.READY || row.reviewedAt!=null)
            throw new WebApplicationException("Alleen een gereed, nog niet bevestigd resultaat kan worden bevestigd.",409);
        if(review==null || !Boolean.TRUE.equals(review.getConfirmed()) || review.getText()==null
                || review.getText().isBlank() || review.getText().length()>20000)
            throw new WebApplicationException("Controleer de bron en bevestig de gecorrigeerde tekst.",400);
        row.reviewedText=review.getText(); row.reviewedBy=actor; row.reviewedAt=Instant.now();
        return model(row);
    }
    private DocumentExtractionEntity find(UUID caseId,UUID documentId) {
        return DocumentExtractionEntity.<DocumentExtractionEntity>find("caseId = ?1 and documentId = ?2 order by createdAt desc",caseId,documentId)
            .withLock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
            .firstResultOptional().orElseThrow(()->new WebApplicationException("Geen documentverwerking gevonden.",404));
    }
    private DocumentExtraction model(DocumentExtractionEntity row) {
        var output=new DocumentExtraction();
        output.setJobId(row.result.getJobId());
        output.setRunId(row.result.getRunId());
        output.setProviderVersion(row.result.getProviderVersion());
        output.setModelId(row.result.getModelId());
        output.setMock(row.result.getMock());
        output.setHasSourceArtifact(row.artifactId!=null);
        output.setStatus(DocumentExtraction.StatusEnum.valueOf(row.result.getStatus().name()));
        output.setFragments(row.result.getFragments().stream().map(fragment ->
            mapper.convertValue(fragment,nl.ciz.caseapi.generated.model.ExtractedFragment.class)).toList());
        output.setExtractionId(row.extractionId); output.setCaseId(row.caseId); output.setDocumentId(row.documentId);
        output.setCreatedAt(row.createdAt.atOffset(ZoneOffset.UTC));
        output.setReviewedText(row.reviewedText); output.setReviewedBy(row.reviewedBy);
        if(row.reviewedAt!=null) { output.setReviewedAt(row.reviewedAt.atOffset(ZoneOffset.UTC)); output.setStatus(DocumentExtraction.StatusEnum.REVIEWED); }
        return output;
    }
}

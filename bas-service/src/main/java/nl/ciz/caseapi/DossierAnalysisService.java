package nl.ciz.caseapi;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.quarkus.scheduler.Scheduled;
import io.quarkus.narayana.jta.QuarkusTransaction;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.WebApplicationException;
import java.time.*;
import java.util.*;
import nl.ciz.caseapi.generated.model.*;
import nl.ciz.caseapi.generated.impairmentanalysis.api.DefaultApi;
import nl.ciz.caseapi.generated.impairmentanalysis.model.AnalysisInput;
import nl.ciz.caseapi.generated.impairmentanalysis.model.AnalysisInputDocumentsInner;
import nl.ciz.caseapi.generated.documentstructuring.model.StructuringResult;
import org.eclipse.microprofile.rest.client.inject.RestClient;

@ApplicationScoped
public class DossierAnalysisService {
    private final DefaultApi api;
    private final DocumentGateway documents;
    private final ObjectMapper mapper;
    public DossierAnalysisService(@RestClient DefaultApi api,DocumentGateway documents,ObjectMapper mapper) {
        this.api=api; this.documents=documents; this.mapper=mapper;
    }
    @Transactional
    public DossierAnalysis start(UUID caseId,Map<String,String> headers) {
        return startSnapshot(caseId,headers,null);
    }
    @Transactional
    public DossierAnalysis startSnapshot(UUID caseId,Map<String,String> headers,List<UUID> documentIds) {
        BasSubmissionEntity.lockCase(caseId);
        var input=new AnalysisInput().documents(new ArrayList<>());
        var sourceDocuments=documents.list(caseId);
        if(documentIds!=null) sourceDocuments=sourceDocuments.stream().filter(doc->documentIds.contains(doc.getDocumentId())).toList();
        if(sourceDocuments.isEmpty()) throw new WebApplicationException("Upload eerst documenten en lees de PDF's uit.",409);
        var requested=sourceDocuments.stream().map(CaseDocument::getDocumentId).collect(java.util.stream.Collectors.toSet());
        var pending=DossierAnalysisEntity.<DossierAnalysisEntity>list("caseId=?1 and status in ('QUEUED','PROCESSING')",caseId)
                .stream().filter(row->row.input.getDocuments().stream().map(d->d.getDocumentId()).collect(java.util.stream.Collectors.toSet()).equals(requested)).findFirst();
        if(pending.isPresent()) return model(pending.get());
        for(var doc:sourceDocuments) {
            if(!"application/pdf".equals(doc.getContentType())) throw new WebApplicationException("Dossieranalyse vereist PDF-uitlezing voor alle bronstukken. Zet afbeeldingen eerst om naar PDF.",409);
            var row=DocumentExtractionEntity.<DocumentExtractionEntity>find("caseId = ?1 and documentId = ?2 order by createdAt desc",caseId,doc.getDocumentId()).firstResult();
            if(row==null || row.artifactId==null || row.result.getStatus()!=StructuringResult.StatusEnum.READY)
                throw new WebApplicationException("Lees eerst alle documenten uit. Oudere uitlezingen zonder broneenheden moeten opnieuw worden verwerkt.",409);
            try {
                var artifact=mapper.readValue(documents.readArtifact(row.artifactId),StructuringResult.class);
                if(artifact.getClassificationUnits()==null || artifact.getClassificationUnits().isEmpty()) throw new IllegalStateException();
                // doc_key must be unique across runs, even when the upstream uses the same filename.
                input.getDocuments().add(new AnalysisInputDocumentsInner().documentId(doc.getDocumentId()).extractionId(row.extractionId)
                    .docKey(doc.getDocumentId().toString()).classificationUnits(new ArrayList<>()));
            } catch(Exception invalid) { throw new WebApplicationException("OCR-bronartefact niet beschikbaar.",503); }
        }
        var row=new DossierAnalysisEntity(); row.analysisId=UUID.randomUUID(); row.caseId=caseId;
        row.requestContext=new HashMap<>(headers);
        row.analysisNumber=((Number)DossierAnalysisEntity.getEntityManager().createNativeQuery("select nextval('dossier_analyses_analysis_number_seq')").getSingleResult()).longValue();
        input.setAnalysisNumber(row.analysisNumber); row.input=input; row.createdAt=Instant.now(); row.status="QUEUED"; row.persist();
        return model(row);
    }
    public List<DossierAnalysis> list(UUID caseId) {

        // Asynchronous older snapshots may finish later. Show the current source
        // version first; preserve newest-first ordering within current and stale history.
        return DossierAnalysisEntity.<DossierAnalysisEntity>list("caseId = ?1 order by createdAt desc",caseId)
                .stream().map(this::model).sorted(java.util.Comparator.comparing(DossierAnalysis::getStale)).toList();
    }
    @Scheduled(every="3s", concurrentExecution=Scheduled.ConcurrentExecution.SKIP)
    void process() {
        var id=QuarkusTransaction.requiringNew().call(()-> {
            // A crashed/expired request is not resubmitted automatically.
            DossierAnalysisEntity.update("status='FAILED', errorCode='INTERRUPTED', completedAt=?1 where status='PROCESSING' and startedAt < ?2",Instant.now(),Instant.now().minusSeconds(900));
            var row=DossierAnalysisEntity.<DossierAnalysisEntity>find("status='QUEUED' order by createdAt")
                .withLock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE).firstResult();
            if(row==null) return null;
            row.status="PROCESSING"; row.startedAt=Instant.now(); return row.analysisId;
        });
        if(id==null) return;
        var input=QuarkusTransaction.requiringNew().call(()->DossierAnalysisEntity.<DossierAnalysisEntity>findById(id).input);
        var headers=QuarkusTransaction.requiringNew().call(()->DossierAnalysisEntity.<DossierAnalysisEntity>findById(id).requestContext);
        nl.ciz.caseapi.generated.impairmentanalysis.model.AnalysisOutput output=null;
        try { output=api.analyseDossier(hydrate(input),headers.get("X-Correlation-ID"),headers.get("traceparent"),headers.get("tracestate")); }
        catch(Exception unavailable) { /* No case payloads or provider exceptions in logs. */ }
        var result=output;
        QuarkusTransaction.requiringNew().run(()-> {
            var row=DossierAnalysisEntity.<DossierAnalysisEntity>findById(id);
            if(!"PROCESSING".equals(row.status)) return;
            row.completedAt=Instant.now(); row.output=result; row.status=result==null?"FAILED":"READY"; row.errorCode=result==null?"UNAVAILABLE":null;
        });
    }
    @Transactional
    public DossierAnalysis review(UUID caseId,UUID id,AnalysisReview review,String actor) {
        var row=DossierAnalysisEntity.<DossierAnalysisEntity>find("caseId = ?1 and analysisId = ?2",caseId,id)
            .withLock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE).firstResult();
        if(row==null) throw new WebApplicationException("Analyse niet gevonden.",404);
        if(!"READY".equals(row.status) || stale(row)) throw new WebApplicationException("Analyse niet gereed of verouderd; analyseer het actuele dossier.",409);
        if(actor==null || actor.isBlank() || review==null || review.getFindings()==null) throw new WebApplicationException("Bevestiging ontbreekt.",400);
        var ids=new HashSet<String>();
        var allowedSources=new ArrayList<com.fasterxml.jackson.databind.JsonNode>();
        row.output.getSourceUnits().forEach(s->allowedSources.add(mapper.valueToTree(s)));
        row.output.getFindings().forEach(f->f.getSources().forEach(s->allowedSources.add(mapper.valueToTree(s))));
        var proposals=row.output.getFindings().stream().collect(java.util.stream.Collectors.toMap(f->f.getFindingId(),f->f));
        for(var finding:review.getFindings()) {
            if(!ids.add(finding.getFindingId()) || finding.getSources()==null || finding.getSources().isEmpty()) throw new WebApplicationException("Iedere bevinding vereist een unieke identificatie en bron.",400);
            var proposal=proposals.get(finding.getFindingId());
            if(finding.getDisposition()!=ReviewedFinding.DispositionEnum.MANUAL && proposal==null) throw new WebApplicationException("Onbekend voorstel.",400);
            if(finding.getDisposition()==ReviewedFinding.DispositionEnum.MANUAL && proposal!=null) throw new WebApplicationException("Handmatige bevinding vereist een nieuwe identificatie.",400);
            if(finding.getDisposition()==ReviewedFinding.DispositionEnum.CONFIRMED && (!Objects.equals(finding.getDomain(),proposal.getDomain())
                    || !Objects.equals(finding.getScore(),proposal.getScore()) || !Objects.equals(finding.getExplanation(),proposal.getExplanation())))
                throw new WebApplicationException("Gewijzigde bevinding moet als aangepast worden vastgelegd.",400);
            for(var source:finding.getSources()) {
                if(!allowedSources.contains(mapper.valueToTree(source))) throw new WebApplicationException("Bronpassage of paginaverwijzing is gewijzigd.",400);
                var doc=row.input.getDocuments().stream().filter(d->d.getDocumentId().equals(source.getDocumentId()) && d.getExtractionId().equals(source.getExtractionId()) && d.getDocKey().equals(source.getDocKey())).findFirst();
                if(doc.isEmpty() || source.getUnitId()==null)
                    throw new WebApplicationException("Bron hoort niet bij deze analyse.",400);
            }
        }
        if(!ids.containsAll(proposals.keySet())) throw new WebApplicationException("Beoordeel alle voorstellen, ook afgewezen voorstellen.",400);
        var reviews=new ArrayList<>(row.reviews);
        reviews.add(new AnalysisReviewRecord().reviewId(UUID.randomUUID()).reviewedBy(actor).reviewedAt(Instant.now().atOffset(ZoneOffset.UTC)).review(review));
        row.reviews=reviews;
        return model(row);
    }
    private boolean stale(DossierAnalysisEntity row) {
        var current=documents.list(row.caseId).stream().map(CaseDocument::getDocumentId).collect(java.util.stream.Collectors.toSet());
        var previous=row.input.getDocuments().stream().map(d->d.getDocumentId()).collect(java.util.stream.Collectors.toSet());
        if(!current.equals(previous)) return true;
        return row.input.getDocuments().stream().anyMatch(doc->{
            var extraction=DocumentExtractionEntity.<DocumentExtractionEntity>find("caseId = ?1 and documentId = ?2 order by createdAt desc",row.caseId,doc.getDocumentId()).firstResult();
            return extraction==null || !extraction.extractionId.equals(doc.getExtractionId());
        });
    }
    private AnalysisInput hydrate(AnalysisInput snapshot) {
        var input=mapper.convertValue(snapshot,AnalysisInput.class);
        for(var doc:input.getDocuments()) {
            var extraction=DocumentExtractionEntity.<DocumentExtractionEntity>findById(doc.getExtractionId());
            try {
                var artifact=mapper.readValue(documents.readArtifact(extraction.artifactId),StructuringResult.class);
                doc.setClassificationUnits(artifact.getClassificationUnits());
            } catch(Exception unavailable) { throw new WebApplicationException("OCR-bronartefact niet beschikbaar.",503); }
        }
        return input;
    }
    private DossierAnalysis model(DossierAnalysisEntity row) {
        var value=new DossierAnalysis().analysisId(row.analysisId).caseId(row.caseId).createdAt(row.createdAt.atOffset(ZoneOffset.UTC))
            .status(DossierAnalysis.StatusEnum.fromValue(row.status)).stale(stale(row))
            .documentIds(row.input.getDocuments().stream().map(d->d.getDocumentId()).toList()).reviews(row.reviews);
        if(row.completedAt!=null) value.setCompletedAt(row.completedAt.atOffset(ZoneOffset.UTC));
        if(row.errorCode!=null) value.setErrorCode(DossierAnalysis.ErrorCodeEnum.fromValue(row.errorCode));
        if(row.output!=null) value.setOutput(mapper.convertValue(row.output,nl.ciz.caseapi.generated.model.AnalysisOutput.class));
        return value;
    }
}

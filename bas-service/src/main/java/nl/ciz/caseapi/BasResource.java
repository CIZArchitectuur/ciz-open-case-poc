package nl.ciz.caseapi;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.core.Response;
import java.util.*;
import nl.ciz.caseapi.generated.bas.api.CasesApi;
import nl.ciz.caseapi.generated.bas.api.LegacyImportApi;
import nl.ciz.caseapi.generated.bas.model.*;

public class BasResource implements CasesApi {
    @jakarta.inject.Inject DocumentExtractionService extraction;
    @jakarta.inject.Inject DossierAnalysisService analysis;
    @jakarta.inject.Inject ObjectMapper mapper;
    @jakarta.inject.Inject BasRunService runs;
    @jakarta.ws.rs.core.Context jakarta.ws.rs.core.HttpHeaders headers;
    public Response startBasRun(UUID caseId,BasRunRequest request) {
        return Response.accepted(runs.start(caseId,request,headers.getHeaderString("X-Correlation-ID"),headers.getHeaderString("traceparent"))).build();
    }
    public Response listBasRuns(UUID caseId) {return Response.ok(runs.list(caseId)).build();}
    public Response startDocumentStructuring(UUID caseId,UUID documentId) {return Response.accepted(extraction.start(caseId,documentId)).build();}
    public Response getDocumentStructuring(UUID caseId,UUID documentId) {return Response.ok(extraction.get(caseId,documentId)).build();}
    public Response reviewDocumentStructuring(UUID caseId,UUID documentId,String actor,DocumentReview review) {
        return Response.ok(extraction.review(caseId,documentId,mapper.convertValue(review,nl.ciz.caseapi.generated.model.DocumentReview.class),actor)).build();
    }
    public Response startImpairmentAnalysis(UUID caseId) {
        var context=new HashMap<String,String>();
        for(var name:List.of("traceparent","tracestate","X-Correlation-ID")) {
            var value=headers.getHeaderString(name); if(value!=null && value.length()<=512) context.put(name,value);
        }
        context.putIfAbsent("X-Correlation-ID",UUID.randomUUID().toString());
        return Response.accepted(analysis.start(caseId,context)).build();
    }
    public Response listImpairmentAnalyses(UUID caseId) {return Response.ok(analysis.list(caseId)).build();}
    public Response reviewImpairmentAnalysis(UUID caseId,UUID analysisId,String actor,AnalysisReview review) {
        return Response.ok(analysis.review(caseId,analysisId,mapper.convertValue(review,nl.ciz.caseapi.generated.model.AnalysisReview.class),actor)).build();
    }
    @Transactional
    public Response importLegacyBas(Map<String,Object> payload) {
        for(var item:(List<?>)payload.getOrDefault("extractions",List.of())) {
            var row=mapper.convertValue(item,DocumentExtractionEntity.class);
            BasSubmissionEntity.lockCase(row.caseId);
            if(DocumentExtractionEntity.findById(row.extractionId)==null) row.persist();
        }
        for(var item:(List<?>)payload.getOrDefault("analyses",List.of())) {
            var row=mapper.convertValue(item,DossierAnalysisEntity.class);
            BasSubmissionEntity.lockCase(row.caseId);
            if(DossierAnalysisEntity.findById(row.analysisId)==null) row.persist();
        }
        DossierAnalysisEntity.getEntityManager().createNativeQuery("SELECT setval('dossier_analyses_analysis_number_seq', GREATEST((SELECT COALESCE(MAX(analysis_number),1) FROM dossier_analyses), (SELECT last_value FROM dossier_analyses_analysis_number_seq)))").getSingleResult();
        return Response.noContent().build();
    }
}

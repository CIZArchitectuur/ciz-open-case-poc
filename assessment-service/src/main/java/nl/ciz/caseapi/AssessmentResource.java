package nl.ciz.caseapi;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Response;
import java.time.Instant;
import java.util.*;
import nl.ciz.caseapi.generated.api.CasesApi;
import nl.ciz.caseapi.generated.api.LegacyImportApi;
import nl.ciz.caseapi.generated.model.*;

public class AssessmentResource implements CasesApi {
    @jakarta.inject.Inject ObjectMapper mapper;
    private Response list(UUID caseId,String kind) {
        return Response.ok(AssessmentRecordEntity.<AssessmentRecordEntity>list("caseId=?1 and kind=?2 order by occurredAt, recordId",caseId,kind)
                .stream().map(row->row.payload).toList()).build();
    }
    public Response listPolicyEvaluations(UUID caseId) {return list(caseId,"policy");}
    public Response listMedicalAssessments(UUID caseId) {return list(caseId,"medical");}
    public Response listDecisions(UUID caseId) {return list(caseId,"decision");}
    @Transactional
    public Response savePolicyEvaluation(UUID caseId,PolicyEvaluation value) {return save(caseId,value.getCaseId(),value.getEvaluationId(),"policy",value.getEvaluatedAt().toInstant(),value);}
    @Transactional
    public Response saveMedicalAssessment(UUID caseId,MedicalAssessment value) {return save(caseId,value.getCaseId(),value.getAssessmentId(),"medical",value.getAssessedAt().toInstant(),value);}
    @Transactional
    public Response saveDecision(UUID caseId,Decision value) {return save(caseId,value.getCaseId(),value.getDecisionId(),"decision",value.getDecidedAt().toInstant(),value);}
    private Response save(UUID caseId,UUID payloadCaseId,UUID id,String kind,Instant time,Object value) {
        if(!caseId.equals(payloadCaseId)) throw new WebApplicationException("Case identifier mismatch",400);
        var payload=mapper.convertValue(value,new com.fasterxml.jackson.core.type.TypeReference<Map<String,Object>>(){});
        AssessmentRecordEntity.getEntityManager().createNativeQuery("INSERT INTO assessment_records(record_id,case_id,kind,occurred_at,payload) VALUES (?1,?2,?3,?4,CAST(?5 AS jsonb)) ON CONFLICT DO NOTHING")
                .setParameter(1,id).setParameter(2,caseId).setParameter(3,kind).setParameter(4,time).setParameter(5,toJson(payload)).executeUpdate();
        return Response.noContent().build();
    }
    private String toJson(Object value) {
        try{return mapper.writeValueAsString(value);}catch(Exception failure){throw new WebApplicationException("Invalid record",400);}
    }
    @Transactional
    public Response recordDispatch(UUID caseId,UUID decisionId,RecordDispatchRequest request) {
        var row=AssessmentRecordEntity.<AssessmentRecordEntity>findById(decisionId,jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        if(row==null || !caseId.equals(row.caseId) || !"decision".equals(row.kind)) throw new WebApplicationException("Decision not found",404);
        if(row.payload.get("sentAt")!=null) return Response.noContent().build();
        var payload=new HashMap<>(row.payload);payload.put("sentAt",request.getSentAt().toString());row.payload=payload;
        return Response.noContent().build();
    }
    @Transactional
    public Response importLegacyAssessment(Map<String,Object> payload) {
        for(var item:(List<?>)payload.getOrDefault("policy",List.of())) {var v=mapper.convertValue(item,PolicyEvaluation.class);savePolicyEvaluation(v.getCaseId(),v);}
        for(var item:(List<?>)payload.getOrDefault("medical",List.of())) {var v=mapper.convertValue(item,MedicalAssessment.class);saveMedicalAssessment(v.getCaseId(),v);}
        for(var item:(List<?>)payload.getOrDefault("decisions",List.of())) {var v=mapper.convertValue(item,Decision.class);saveDecision(v.getCaseId(),v);}
        return Response.noContent().build();
    }
}

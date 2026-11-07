package nl.ciz.caseapi;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.*;
import nl.ciz.caseapi.generated.assessment.api.DefaultApi;
import nl.ciz.caseapi.generated.assessment.model.*;
import org.eclipse.microprofile.rest.client.inject.RestClient;
@ApplicationScoped
public class AssessmentGateway {
    private final DefaultApi api;
    private final ObjectMapper mapper;
    public DefaultApi api() {return api;}
    public ObjectMapper mapper() {return mapper;}
    public AssessmentGateway(@RestClient DefaultApi api,ObjectMapper mapper) {this.api=api;this.mapper=mapper;}
    <T> T transport(Object entity,Class<T> type) {
        // Panache exposes an infrastructure isPersistent getter; only contract properties travel over HTTP.
        return mapper.copy().disable(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES).convertValue(entity,type);
    }
    void migrate(UUID caseId) {
        if(LegacyDomainMigrationEntity.findById(caseId)!=null) return;
        var policy=CasePolicyEvaluationEntity.list("caseId",caseId);
        var medical=CaseMedicalAssessmentEntity.list("caseId",caseId);
        var decisions=DecisionEntity.list("caseId",caseId);
        if(!policy.isEmpty() || !medical.isEmpty() || !decisions.isEmpty())
            DomainCalls.call(()->{api.importLegacyAssessment(Map.of("policy",policy,"medical",medical,"decisions",decisions));return null;});
    }
    public List<nl.ciz.caseapi.generated.model.Decision> decisions(UUID caseId) {
        migrate(caseId);
        return DomainCalls.call(()->api.listDecisions(caseId)).stream().map(value->mapper.convertValue(value,nl.ciz.caseapi.generated.model.Decision.class)).toList();
    }
    void saveDecision(DecisionEntity value) {DomainCalls.call(()->{api.saveDecision(value.caseId,transport(value,Decision.class));return null;});}
    void dispatch(UUID caseId,UUID id,java.time.Instant time) {
        DomainCalls.call(()->{api.recordDispatch(caseId,id,new RecordDispatchRequest().sentAt(time.atOffset(java.time.ZoneOffset.UTC)));return null;});
    }
    UUID latestPolicy(UUID id) {var rows=DomainCalls.call(()->api.listPolicyEvaluations(id));return rows.isEmpty()?null:rows.get(rows.size()-1).getEvaluationId();}
    UUID latestMedical(UUID id) {var rows=DomainCalls.call(()->api.listMedicalAssessments(id));return rows.isEmpty()?null:rows.get(rows.size()-1).getAssessmentId();}
}

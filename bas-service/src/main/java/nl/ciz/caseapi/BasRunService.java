package nl.ciz.caseapi;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.time.*;
import java.util.*;
import nl.ciz.caseapi.generated.bas.model.*;
@ApplicationScoped
public class BasRunService {
    @Transactional
    public BasRun start(UUID caseId,BasRunRequest request,String correlationId,String trace) {
        BasSubmissionEntity.lockCase(caseId);
        var existing=BasSubmissionEntity.<BasSubmissionEntity>findById(request.getRunId());
        if(existing!=null) {
            if(!existing.caseId.equals(caseId)) throw new jakarta.ws.rs.WebApplicationException("Run belongs to a different case",409);
            return model(existing);
        }
        var row=new BasSubmissionEntity();row.eventId=request.getRunId();row.caseId=caseId;
        row.documentIds=List.copyOf(request.getDocumentIds());
        row.components=request.getComponents().stream().map(Object::toString).toList();row.reason=request.getReason().toString();
        row.forceRerun=Boolean.TRUE.equals(request.getForceRerun());row.occurredAt=Instant.now();
        row.correlationId=correlationId==null || correlationId.isBlank() || correlationId.length()>100?UUID.randomUUID().toString():correlationId;
        row.traceParent=trace!=null && trace.matches("00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}")?trace:null;
        row.persist();return model(row);
    }
    public List<BasRun> list(UUID id) {return BasSubmissionEntity.<BasSubmissionEntity>list("caseId=?1 order by occurredAt desc",id).stream().map(this::model).toList();}
    private BasRun model(BasSubmissionEntity row) {
        return new BasRun().runId(row.eventId).caseId(row.caseId).documentIds(row.documentIds)
                .components(row.components).reason(row.reason).status(BasRun.StatusEnum.fromValue(row.status))
                .createdAt(row.occurredAt.atOffset(ZoneOffset.UTC)).analysisId(row.analysisId).errorCode(row.errorCode);
    }
}

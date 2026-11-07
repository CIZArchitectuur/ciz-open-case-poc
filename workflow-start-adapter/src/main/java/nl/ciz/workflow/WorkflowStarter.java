package nl.ciz.workflow;

import io.quarkus.scheduler.Scheduled;
import io.opentelemetry.api.GlobalOpenTelemetry;
import io.opentelemetry.context.Context;
import io.opentelemetry.context.propagation.TextMapGetter;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.time.Instant;
import java.util.*;
import nl.ciz.caseapi.generated.operaton.api.WorkflowApi;
import nl.ciz.caseapi.generated.operaton.model.StartProcessRequest;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.eclipse.microprofile.rest.client.inject.RestClient;
import org.jboss.logging.Logger;

@ApplicationScoped
public class WorkflowStarter {
    @RestClient WorkflowApi api;
    @ConfigProperty(name="workflow.max-attempts") int maximum;
    private static final String PROCESS="wlz-aanvraag";
    private static final TextMapGetter<Map<String,String>> GETTER=new TextMapGetter<>() {
        public Iterable<String> keys(Map<String,String> value) { return value.keySet(); }
        public String get(Map<String,String> value,String key) { return value.get(key); }
    };

    @Scheduled(every="1s",concurrentExecution=Scheduled.ConcurrentExecution.SKIP)
    @Transactional
    @io.quarkus.narayana.jta.runtime.TransactionConfiguration(timeout=180)
    void run() {
        var jobs=WorkflowReceipt.getEntityManager().createNativeQuery(
            "SELECT * FROM workflow_receipts WHERE completed_at IS NULL AND attempts < ?1 AND next_attempt_at <= ?2 ORDER BY next_attempt_at LIMIT 10 FOR UPDATE SKIP LOCKED",WorkflowReceipt.class)
            .setParameter(1,maximum).setParameter(2,Instant.now()).getResultList();
        for(Object value:jobs) {
            var job=(WorkflowReceipt)value;
            var carrier=new HashMap<String,String>();
            if(job.traceParent!=null) carrier.put("traceparent",job.traceParent);
            var parent=GlobalOpenTelemetry.getPropagators().getTextMapPropagator().extract(Context.current(),carrier,GETTER);
            var span=GlobalOpenTelemetry.getTracer("workflow-start-adapter").spanBuilder("workflow.start").setParent(parent).startSpan();
            span.setAttribute("correlation.id",job.correlationId);
            org.jboss.logging.MDC.put("correlationId",job.correlationId);
            try(var scope=span.makeCurrent()) {
                // History includes completed instances: replay must not recreate a completed process.
                if(api.findProcessInstances(job.caseId.toString(),PROCESS,null).isEmpty())
                    api.startProcessInstance(PROCESS,new StartProcessRequest().businessKey(job.caseId.toString()).variables(Map.of()));
                job.completedAt=Instant.now();
            } catch(Exception failure) {
                job.attempts++;
                job.nextAttemptAt=Instant.now().plusSeconds(Math.min(300,30L*job.attempts));
                span.setStatus(io.opentelemetry.api.trace.StatusCode.ERROR);
                Logger.getLogger(getClass()).warn(job.attempts>=maximum?"Workflow start requires operator retry after exhausted attempts":"Workflow start unavailable; deferred retry");
            } finally { org.jboss.logging.MDC.remove("correlationId"); span.end(); }
        }
    }
}

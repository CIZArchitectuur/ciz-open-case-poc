package nl.ciz.caseapi;
import io.quarkus.scheduler.Scheduled;
import io.quarkus.narayana.jta.QuarkusTransaction;
import jakarta.enterprise.context.ApplicationScoped;
import java.time.Instant;
import java.util.*;
@ApplicationScoped
public class DomainHistoryMigration {
    @jakarta.inject.Inject BasGateway bas;
    @jakarta.inject.Inject AssessmentGateway assessments;
    @Scheduled(every="${DOMAIN_MIGRATION_INTERVAL:5s}",concurrentExecution=Scheduled.ConcurrentExecution.SKIP)
    void migratePendingHistory() {
        var ids=QuarkusTransaction.requiringNew().call(()->CaseEntity.getEntityManager().createNativeQuery(
                "SELECT case_id FROM (SELECT case_id FROM document_extractions UNION SELECT case_id FROM dossier_analyses UNION SELECT case_id FROM case_policy_evaluations UNION SELECT case_id FROM case_medical_assessments UNION SELECT case_id FROM decisions) legacy WHERE NOT EXISTS (SELECT 1 FROM legacy_domain_migrations m WHERE m.case_id=legacy.case_id) ORDER BY case_id LIMIT 10",UUID.class).getResultList());
        for(var item:ids) {
            var id=(UUID)item;
            try {
                QuarkusTransaction.requiringNew().run(()-> {
                    CaseEntity.findById(id,jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
                    if(LegacyDomainMigrationEntity.findById(id)!=null) return;
                    bas.migrate(id);assessments.migrate(id);
                    var completed=new LegacyDomainMigrationEntity();completed.caseId=id;completed.completedAt=Instant.now();completed.persist();
                });
            } catch(RuntimeException unavailable) {
                // Imports are idempotent. Source records remain intact; no payloads or identities are logged.
                org.jboss.logging.Logger.getLogger(getClass()).warn("Historical domain import could not complete; retry scheduled");
            }
        }
    }
}

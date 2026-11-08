package nl.ciz.caseapi;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.*;
import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
@Entity @Table(name="bas_submissions")
public class BasSubmissionEntity extends PanacheEntityBase {
    @Id @Column(name="event_id") public UUID eventId;
    @Column(name="case_id",nullable=false) public UUID caseId;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name="document_ids",nullable=false,columnDefinition="jsonb") public List<UUID> documentIds;
    @Column(name="correlation_id",nullable=false,length=100) public String correlationId;
    @Column(name="occurred_at",nullable=false) public Instant occurredAt;
    @Column(nullable=false,length=20) public String status="QUEUED";
    @Column(name="analysis_id") public UUID analysisId;
    @Column(name="error_code",length=30) public String errorCode;
    @Column(nullable=false) public int attempts;
    @Column(name="trace_parent",length=100) public String traceParent;
    @JdbcTypeCode(SqlTypes.JSON) @Column(nullable=false,columnDefinition="jsonb") public List<String> components=List.of("METADATA","OCR","DOSSIER");
    @Column(nullable=false,length=30) public String reason="APPLICATION_SUBMITTED";
    @Column(name="force_rerun",nullable=false) public boolean forceRerun;
    public static void lockCase(UUID id) {
        getEntityManager().createNativeQuery("INSERT INTO bas_cases(case_id) VALUES (?1) ON CONFLICT DO NOTHING").setParameter(1,id).executeUpdate();
        BasCaseEntity.findById(id,LockModeType.PESSIMISTIC_WRITE);
    }
}

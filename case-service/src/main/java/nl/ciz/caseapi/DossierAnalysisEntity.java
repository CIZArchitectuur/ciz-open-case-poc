package nl.ciz.caseapi;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import nl.ciz.caseapi.generated.impairmentanalysis.model.AnalysisInput;
import nl.ciz.caseapi.generated.impairmentanalysis.model.AnalysisOutput;
import nl.ciz.caseapi.generated.model.AnalysisReviewRecord;

@Entity @Table(name="dossier_analyses")
public class DossierAnalysisEntity extends PanacheEntityBase {
    @Id @Column(name="analysis_id") public UUID analysisId;
    @Column(name="analysis_number",nullable=false) public long analysisNumber;
    @Column(name="case_id",nullable=false) public UUID caseId;
    @Column(name="created_at",nullable=false) public Instant createdAt;
    @Column(name="started_at") public Instant startedAt;
    @Column(name="completed_at") public Instant completedAt;
    @Column(nullable=false,length=20) public String status;
    @JdbcTypeCode(SqlTypes.JSON) @Column(nullable=false,columnDefinition="jsonb") public AnalysisInput input;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name="request_context",nullable=false,columnDefinition="jsonb") public Map<String,String> requestContext=new HashMap<>();
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition="jsonb") public AnalysisOutput output;
    @Column(name="error_code",length=30) public String errorCode;
    @JdbcTypeCode(SqlTypes.JSON) @Column(nullable=false,columnDefinition="jsonb") public List<AnalysisReviewRecord> reviews=new ArrayList<>();
}

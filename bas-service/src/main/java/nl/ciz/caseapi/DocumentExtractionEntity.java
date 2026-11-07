package nl.ciz.caseapi;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import nl.ciz.caseapi.generated.documentstructuring.model.StructuringResult;

@Entity @Table(name="document_extractions")
public class DocumentExtractionEntity extends PanacheEntityBase {
    @Id @Column(name="extraction_id") public UUID extractionId;
    @Column(name="case_id", nullable=false) public UUID caseId;
    @Column(name="document_id", nullable=false) public UUID documentId;
    @Column(name="created_at", nullable=false) public Instant createdAt;
    @Column(name="artifact_id") public UUID artifactId;
    @JdbcTypeCode(SqlTypes.JSON) @Column(nullable=false, columnDefinition="jsonb") public StructuringResult result;
    @Column(name="reviewed_text", columnDefinition="text") public String reviewedText;
    @Column(name="reviewed_by", length=200) public String reviewedBy;
    @Column(name="reviewed_at") public Instant reviewedAt;
}

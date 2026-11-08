package nl.ciz.caseapi;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.*;
import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
@Entity @Table(name="assessment_records")
public class AssessmentRecordEntity extends PanacheEntityBase {
    @Id @Column(name="record_id") public UUID recordId;
    @Column(name="case_id",nullable=false) public UUID caseId;
    @Column(nullable=false,length=30) public String kind;
    @Column(name="occurred_at",nullable=false) public Instant occurredAt;
    @JdbcTypeCode(SqlTypes.JSON) @Column(nullable=false,columnDefinition="jsonb") public Map<String,Object> payload;
}

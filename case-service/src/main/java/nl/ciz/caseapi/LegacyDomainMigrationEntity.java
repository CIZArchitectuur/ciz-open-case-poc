package nl.ciz.caseapi;
import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
@Entity @Table(name="legacy_domain_migrations")
public class LegacyDomainMigrationEntity extends PanacheEntityBase {
    @Id @Column(name="case_id") public UUID caseId;
    @Column(name="completed_at",nullable=false) public Instant completedAt;
}

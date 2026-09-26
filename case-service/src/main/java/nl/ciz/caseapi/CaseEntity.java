package nl.ciz.caseapi;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "cases")
public class CaseEntity extends PanacheEntityBase {
    @Id
    @Column(name = "case_id", nullable = false)
    public UUID caseId;

    @Column(name = "person_id", nullable = false)
    public UUID personId;

    @Column(name = "address_id", nullable = false)
    public UUID addressId;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;
}

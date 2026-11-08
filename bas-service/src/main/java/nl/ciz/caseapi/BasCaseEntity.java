package nl.ciz.caseapi;
import jakarta.persistence.*;
import java.util.UUID;
import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
@Entity @Table(name="bas_cases")
public class BasCaseEntity extends PanacheEntityBase {
    @Id @Column(name="case_id") public UUID caseId;
}

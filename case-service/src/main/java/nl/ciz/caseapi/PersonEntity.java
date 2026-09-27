package nl.ciz.caseapi;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "persons")
public class PersonEntity extends PanacheEntityBase {
    @Id
    @Column(name = "person_id", nullable = false)
    public UUID personId;

    @Column(name = "citizen_service_number", nullable = false, length = 9)
    public String citizenServiceNumber;

    @Column(name = "client_name", nullable = false, length = 200)
    public String clientName;

    @Column(name = "last_name", nullable = false, length = 100)
    public String lastName;

    @Column(name = "initials", nullable = false, length = 20)
    public String initials;

    @Column(name = "birth_date", nullable = false)
    public LocalDate birthDate;
}

package nl.ciz.caseapi;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "cases")
public class CaseEntity extends PanacheEntityBase {
    @Id
    @Column(name = "case_id", nullable = false)
    public UUID caseId;

    @Column(name = "applicant_id", nullable = false, length = 100)
    public String applicantId;

    @Column(name = "client_name", nullable = false, length = 200)
    public String clientName;

    @Column(name = "last_name", nullable = false, length = 100)
    public String lastName;

    @Column(name = "initials", nullable = false, length = 20)
    public String initials;

    @Column(name = "citizen_service_number", nullable = false, length = 9)
    public String citizenServiceNumber;

    @Column(name = "birth_date", nullable = false)
    public LocalDate birthDate;

    @Column(name = "street", nullable = false, length = 120)
    public String street;

    @Column(name = "house_number", nullable = false, length = 20)
    public String houseNumber;

    @Column(name = "postal_code", nullable = false, length = 12)
    public String postalCode;

    @Column(name = "city", nullable = false, length = 120)
    public String city;

    @Column(name = "country", nullable = false, length = 80)
    public String country;

    @Column(name = "permanent_care_need", nullable = false)
    public boolean permanentCareNeed;

    @Column(name = "permanent_supervision", nullable = false)
    public boolean permanentSupervision;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;
}

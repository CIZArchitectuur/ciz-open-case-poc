package nl.ciz.caseapi;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "applications")
public class ApplicationEntity extends PanacheEntityBase {
    @Id
    @Column(name = "application_id", nullable = false)
    public UUID applicationId;

    @Column(name = "case_id", nullable = false, unique = true)
    public UUID caseId;

    @Column(name = "applicant_id", nullable = false, length = 100)
    public String applicantId;

    @Column(name = "permanent_care_need", nullable = false)
    public boolean permanentCareNeed;

    @Column(name = "permanent_supervision", nullable = false)
    public boolean permanentSupervision;

    @Column(name = "applicant_role", nullable = false, length = 40)
    public String applicantRole;

    @Column(name = "signed_by", nullable = false, length = 60)
    public String signedBy;

    @Column(name = "authorization_signed_by_client")
    public Boolean authorizationSignedByClient;

    @Column(name = "submitted_at", nullable = false)
    public Instant submittedAt;

    @Column(name = "applicant_status", nullable = false, length = 40)
    public String applicantStatus;

    @Column(name = "status_updated_at", nullable = false)
    public Instant statusUpdatedAt;

    @Column(name = "supplement_request", length = 4000)
    public String supplementRequest;

    @Column(name = "supplement_response", length = 4000)
    public String supplementResponse;

    @Column(name = "supplement_requested_at")
    public Instant supplementRequestedAt;

    @Column(name = "supplement_responded_at")
    public Instant supplementRespondedAt;

    @Column(name = "decision_result", length = 40)
    public String decisionResult;

    @Column(name = "decision_motivation", length = 4000)
    public String decisionMotivation;

    @Column(name = "decision_made_at")
    public Instant decisionMadeAt;

    @Column(name = "decision_sent_at")
    public Instant decisionSentAt;
}

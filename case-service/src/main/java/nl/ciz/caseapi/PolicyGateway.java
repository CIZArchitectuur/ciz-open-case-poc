package nl.ciz.caseapi;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.ProcessingException;
import nl.ciz.caseapi.generated.policy.api.ApiException;
import nl.ciz.caseapi.generated.policy.api.DefaultApi;
import nl.ciz.caseapi.generated.policy.model.IntakeEvaluation;
import nl.ciz.caseapi.generated.policy.model.IntakeEvaluationRequest;
import nl.ciz.caseapi.generated.policy.model.IntakeForm;
import nl.ciz.caseapi.generated.policy.model.MedicalAssessmentEvaluation;
import java.time.LocalDate;
import java.util.Map;
import org.eclipse.microprofile.faulttolerance.Retry;
import org.eclipse.microprofile.rest.client.inject.RestClient;

@ApplicationScoped
public class PolicyGateway {
    private final DefaultApi api;

    public PolicyGateway(@RestClient DefaultApi api) {
        this.api = api;
    }

    @Retry(maxRetries = 2, delay = 100, jitter = 50, retryOn = PolicyUnavailableException.class)
    public IntakeForm intakeForm() {
        try {
            return api.getActiveIntakeForm();
        } catch (ApiException | ProcessingException exception) {
            throw new PolicyUnavailableException(exception);
        }
    }

    @Retry(maxRetries = 2, delay = 100, jitter = 50, retryOn = PolicyUnavailableException.class)
    public IntakeEvaluation evaluate(Map<String, Object> facts, LocalDate effectiveDate) {
        try {
            return api.evaluateIntake(new IntakeEvaluationRequest().facts(facts).effectiveDate(effectiveDate));
        } catch (ApiException | ProcessingException exception) {
            throw new PolicyUnavailableException(exception);
        }
    }

    @Retry(maxRetries = 2, delay = 100, jitter = 50, retryOn = PolicyUnavailableException.class)
    public IntakeForm medicalAssessmentForm() {
        try {
            return api.getActiveMedicalAssessmentForm();
        } catch (ApiException | ProcessingException exception) {
            throw new PolicyUnavailableException(exception);
        }
    }

    @Retry(maxRetries = 2, delay = 100, jitter = 50, retryOn = PolicyUnavailableException.class)
    public MedicalAssessmentEvaluation evaluateMedicalAssessment(Map<String, Object> facts, LocalDate effectiveDate) {
        try {
            return api.evaluateMedicalAssessment(new IntakeEvaluationRequest().facts(facts).effectiveDate(effectiveDate));
        } catch (ApiException | ProcessingException exception) {
            throw new PolicyUnavailableException(exception);
        }
    }
}

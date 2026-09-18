package nl.ciz.policy;

import jakarta.ws.rs.core.Response;
import java.time.LocalDate;
import java.time.ZoneOffset;
import nl.ciz.policy.generated.api.IntakeEvaluationsApi;
import nl.ciz.policy.generated.model.IntakeEvaluationRequest;

public class IntakeEvaluationResource implements IntakeEvaluationsApi {
    private final RegelRechtEvaluator evaluator;

    public IntakeEvaluationResource(RegelRechtEvaluator evaluator) { this.evaluator = evaluator; }

    @Override
    public Response evaluateIntake(IntakeEvaluationRequest request) {
        return Response.ok(evaluator.evaluateIntake(request.getFacts(),
                request.getEffectiveDate() == null ? LocalDate.now(ZoneOffset.UTC) : request.getEffectiveDate())).build();
    }
}

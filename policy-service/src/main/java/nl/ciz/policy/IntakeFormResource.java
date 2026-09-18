package nl.ciz.policy;

import jakarta.ws.rs.core.Response;
import nl.ciz.policy.generated.api.IntakeFormApi;
import nl.ciz.policy.generated.model.IntakeField;
import nl.ciz.policy.generated.model.IntakeForm;

public class IntakeFormResource implements IntakeFormApi {
    private final RegelRechtEvaluator evaluator;

    public IntakeFormResource(RegelRechtEvaluator evaluator) { this.evaluator = evaluator; }

    @Override
    public Response getActiveIntakeForm() {
        var fields = evaluator.intakeFields().stream().map(field -> new IntakeField(
                field.factId(), IntakeField.TypeEnum.fromValue(field.type()), field.required(), label(field.factId()))
                .description(field.description().isBlank() ? null : field.description()))
                .toList();
        return Response.ok(new IntakeForm("ciz-aanvraag-eerst", evaluator.policyVersion(), fields)).build();
    }

    private static String label(String factId) {
        var label = factId.replace('_', ' ');
        return Character.toUpperCase(label.charAt(0)) + label.substring(1);
    }
}

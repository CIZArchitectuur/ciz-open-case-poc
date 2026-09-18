package nl.ciz.policy;

import jakarta.ws.rs.core.Response;
import nl.ciz.policy.generated.api.MedicalAssessmentFormApi;
import nl.ciz.policy.generated.model.IntakeField;
import nl.ciz.policy.generated.model.IntakeForm;

public class MedicalAssessmentFormResource implements MedicalAssessmentFormApi {
    private final RegelRechtEvaluator evaluator;

    public MedicalAssessmentFormResource(RegelRechtEvaluator evaluator) { this.evaluator = evaluator; }

    @Override
    public Response getActiveMedicalAssessmentForm() {
        var fields = evaluator.medicalAssessmentFields().stream().map(field -> new IntakeField(
                field.factId(), IntakeField.TypeEnum.fromValue(field.type()), field.required(), label(field.factId()))
                .description(field.description().isBlank() ? null : field.description()))
                .toList();
        return Response.ok(new IntakeForm("wlz-medical-assessment", evaluator.medicalAssessmentPolicyVersion(), fields)).build();
    }

    private static String label(String factId) {
        var labels = java.util.Map.ofEntries(
                java.util.Map.entry("diagnose_vastgesteld", "Diagnose vastgesteld"),
                java.util.Map.entry("diagnose_door_ter_zake_kundige", "Diagnose door ter zake kundige"),
                java.util.Map.entry("behandeling_en_effect_beschreven", "Behandeling en effect beschreven"),
                java.util.Map.entry("prognose_beschreven", "Prognose beschreven"),
                java.util.Map.entry("blijvende_zorgbehoefte_onderbouwd", "Blijvende zorgbehoefte onderbouwd"),
                java.util.Map.entry("permanent_toezicht_nodig", "Permanent toezicht nodig"),
                java.util.Map.entry("vierentwintig_uurs_zorg_nabij_nodig", "24 uur zorg in de nabijheid nodig"),
                java.util.Map.entry("medisch_adviseur_nodig", "Medisch adviseur nodig"),
                java.util.Map.entry("medisch_adviseur_geraadpleegd", "Medisch adviseur geraadpleegd"),
                java.util.Map.entry("medisch_advies_bevestigt_criteria", "Medisch advies bevestigt criteria"),
                java.util.Map.entry("beoordelingsmotivering", "Motivering van de beoordeling"));
        return labels.getOrDefault(factId, factId.replace('_', ' '));
    }
}

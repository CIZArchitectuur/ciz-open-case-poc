package nl.ciz.policy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.smallrye.config.ConfigMapping;
import jakarta.enterprise.context.ApplicationScoped;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import nl.ciz.policy.generated.model.CompletenessFacts;

@ApplicationScoped
public class RegelRechtEvaluator {
    private static final List<String> OUTPUTS = List.of(
        "administratief_compleet", "juridisch_inhoudelijk_compleet",
        "kan_in_behandeling_worden_genomen");
    private static final List<String> MEDICAL_OUTPUTS = List.of(
        "medische_onderbouwing_compleet", "intensieve_zorgbehoefte_vastgesteld",
        "medisch_advies_afgerond", "voldoet_aan_medische_wlz_criteria",
        "medische_beoordeling_compleet");
    private final ObjectMapper mapper;
    private final EngineConfig config;
    private final String policy;
    private final CizAanvraagCorpus corpus;
    private final StandalonePolicyDocument medicalAssessment;

    public RegelRechtEvaluator(ObjectMapper mapper, EngineConfig config) {
        this.mapper = mapper;
        this.config = config;
        try (var stream = Thread.currentThread().getContextClassLoader()
                .getResourceAsStream("policies/wlz-completeness.yaml")) {
            if (stream == null) throw new IllegalStateException("RegelRecht policy ontbreekt");
            policy = new String(stream.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException exception) {
            throw new PolicyEvaluationException(exception);
        }
        corpus = new CizAanvraagCorpus();
        medicalAssessment = new StandalonePolicyDocument("policies/wlz-medical-assessment.yaml");
    }

    public List<CizAanvraagCorpus.Field> intakeFields() { return corpus.fields(); }

    public String policyVersion() { return corpus.policyVersion(); }

    public List<CizAanvraagCorpus.Field> medicalAssessmentFields() { return medicalAssessment.fields(); }

    public String medicalAssessmentPolicyVersion() { return medicalAssessment.version(); }

    public Map<String, Object> evaluateIntake(Map<String, Object> facts, LocalDate effectiveDate) {
        validateFacts(facts, corpus.fields());
        var result = execute(corpus.rootLaw(), corpus.extraLaws(), List.of(
                "kan_aanvraag_in_behandeling_worden_genomen",
                "aanvraag_voldoet_aan_awb_vereisten",
                "overige_voorschriften_voldaan"), facts, effectiveDate);
        var outputs = mapper.convertValue(result.path("outputs"), Map.class);
        var response = new LinkedHashMap<String, Object>();
        response.put("canBeTakenIntoConsideration", Boolean.TRUE.equals(outputs.get("kan_aanvraag_in_behandeling_worden_genomen")));
        response.put("outputs", outputs);
        response.put("resolvedInputs", mapper.convertValue(result.path("resolved_inputs"), Map.class));
        response.put("policyVersion", corpus.policyVersion());
        response.put("engineVersion", result.path("engine_version").asText());
        response.put("schemaVersion", removePrefix(result.path("schema_version").asText(), "v"));
        response.put("regulationHash", removePrefix(result.path("regulation_hash").asText(), "sha256:"));
        return response;
    }

    public Map<String, Object> evaluateMedicalAssessment(Map<String, Object> facts, LocalDate effectiveDate) {
        validateFacts(facts, medicalAssessment.fields());
        var motivation = facts.get("beoordelingsmotivering");
        if (!(motivation instanceof String text) || text.isBlank()) throw new InvalidIntakeFactsException();
        var result = execute(medicalAssessment.source(), List.of(), MEDICAL_OUTPUTS, facts, effectiveDate);
        var outputs = mapper.convertValue(result.path("outputs"), Map.class);
        var response = new LinkedHashMap<String, Object>();
        response.put("assessmentComplete", Boolean.TRUE.equals(outputs.get("medische_beoordeling_compleet")));
        response.put("criteriaMet", Boolean.TRUE.equals(outputs.get("voldoet_aan_medische_wlz_criteria")));
        response.put("medicalAdviceRequired", Boolean.TRUE.equals(facts.get("medisch_adviseur_nodig")));
        response.put("outputs", outputs);
        response.put("resolvedInputs", mapper.convertValue(result.path("resolved_inputs"), Map.class));
        response.put("policyVersion", medicalAssessment.version());
        response.put("engineVersion", result.path("engine_version").asText());
        response.put("schemaVersion", removePrefix(result.path("schema_version").asText(), "v"));
        response.put("regulationHash", removePrefix(result.path("regulation_hash").asText(), "sha256:"));
        return response;
    }

    private static void validateFacts(Map<String, Object> facts, List<CizAanvraagCorpus.Field> fields) {
        if (facts == null || facts.keySet().stream().anyMatch(name -> fields.stream()
                .noneMatch(field -> field.factId().equals(name)))) throw new InvalidIntakeFactsException();
        for (var field : fields) {
            var value = facts.get(field.factId());
            if ((field.required() && value == null) || (value != null && !validType(field.type(), value))) {
                throw new InvalidIntakeFactsException();
            }
        }
    }

    private static boolean validType(String type, Object value) {
        return switch (type) {
            case "boolean" -> value instanceof Boolean;
            case "string", "date" -> value instanceof String;
            case "number" -> value instanceof Number;
            default -> false;
        };
    }

    public Map<String, Object> evaluate(CompletenessFacts facts) {
        var params = new LinkedHashMap<String, Boolean>();
        params.put("administratieve_gegevens_aanwezig", facts.getAdministrativeDataPresent());
        params.put("juist_ondertekend", facts.getCorrectlySigned());
        params.put("medische_informatie_aanwezig", facts.getMedicalInformationPresent());
        params.put("herkomst_medische_informatie_gevalideerd", facts.getMedicalSourceValidated());
        params.put("informatie_ter_zake_kundige_gevalideerd", facts.getExpertInformationValidated());
        return response(execute(policy, List.of(), OUTPUTS, params, LocalDate.now(ZoneOffset.UTC)), params);
    }

    private JsonNode execute(String law, List<String> extraLaws, List<String> outputs,
            Map<String, ?> facts, LocalDate effectiveDate) {
        try {
            var request = mapper.createObjectNode();
            request.put("law_yaml", law);
            request.set("extra_laws", mapper.valueToTree(extraLaws));
            request.set("output_names", mapper.valueToTree(outputs));
            request.set("params", mapper.valueToTree(facts));
            request.put("date", effectiveDate.toString());
            var process = new ProcessBuilder(config.executable()).start();
            try (var stdin = process.getOutputStream()) { mapper.writeValue(stdin, request); }
            if (!process.waitFor(config.timeoutSeconds(), TimeUnit.SECONDS)) {
                process.destroyForcibly();
                throw new PolicyEvaluationException("RegelRecht evaluatie duurde te lang");
            }
            var stdout = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
            if (process.exitValue() != 0) throw new PolicyEvaluationException("RegelRecht kon het beleid niet uitvoeren");
            return mapper.readTree(stdout);
        } catch (IOException exception) {
            throw new PolicyEvaluationException(exception);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw new PolicyEvaluationException(exception);
        }
    }

    private static Map<String, Object> response(JsonNode result, Map<String, Boolean> params) {
        var outputs = result.path("outputs");
        var checks = List.of(
                check("administrativeDataPresent", "Administratieve gegevens aanwezig", params.get("administratieve_gegevens_aanwezig")),
                check("correctlySigned", "Aanvraag juist ondertekend", params.get("juist_ondertekend")),
                check("medicalInformationPresent", "Medische informatie aanwezig", params.get("medische_informatie_aanwezig")),
                check("medicalSourceValidated", "Herkomst medische informatie gevalideerd", params.get("herkomst_medische_informatie_gevalideerd")),
                check("expertInformationValidated", "Informatie van ter zake kundige gevalideerd", params.get("informatie_ter_zake_kundige_gevalideerd")));
        return Map.of(
            "canBeTakenIntoConsideration", outputs.path("kan_in_behandeling_worden_genomen").asBoolean(),
            "administrativelyComplete", outputs.path("administratief_compleet").asBoolean(),
            "legallyComplete", outputs.path("juridisch_inhoudelijk_compleet").asBoolean(),
                "checks", checks,
                "engineVersion", result.path("engine_version").asText(),
                "schemaVersion", removePrefix(result.path("schema_version").asText(), "v"),
                "regulationHash", removePrefix(result.path("regulation_hash").asText(), "sha256:"));
    }

    private static String removePrefix(String value, String prefix) {
        return value.startsWith(prefix) ? value.substring(prefix.length()) : value;
    }

    private static Map<String, Object> check(String code, String label, boolean passed) {
        return Map.of("code", code, "label", label, "passed", passed);
    }

    @ConfigMapping(prefix = "regelrecht")
    public interface EngineConfig {
        String executable();
        long timeoutSeconds();
    }
}

package nl.ciz.policy;

import jakarta.enterprise.context.ApplicationScoped;
import java.util.List;
import java.util.Map;
import nl.ciz.policy.generated.model.IntakeField;
import org.yaml.snakeyaml.Yaml;

/** Versioned presentation configuration; deliberately contains no eligibility rules. */
@ApplicationScoped
public class FormPresentation {
    private final Map<String, List<Map<String, Object>>> definitions;

    public FormPresentation() {
        try (var stream = getClass().getResourceAsStream("/policies/form-groups.yaml")) {
            if (stream == null) throw new IllegalStateException("Missing form presentation configuration");
            definitions = new Yaml().load(stream);
        } catch (java.io.IOException failure) {
            throw new IllegalStateException("Cannot load form presentation configuration", failure);
        }
    }

    public IntakeField decorate(String form, IntakeField field) {
        var groups = definitions.get(form);
        var group = groups.stream().filter(candidate ->
                ((List<?>) candidate.getOrDefault("fields", List.of())).contains(field.getFactId()))
                .findFirst().orElseGet(() -> groups.stream()
                        .filter(candidate -> Boolean.TRUE.equals(candidate.get("fallback")))
                        .findFirst().orElseThrow());
        return field.groupId((String) group.get("id")).groupTitle((String) group.get("title"))
                .groupDescription((String) group.get("description")).groupOrder(groups.indexOf(group));
    }
}

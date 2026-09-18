package nl.ciz.policy;

import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;
import nl.ciz.policy.generated.model.Problem;

public final class ProblemMappers {
    private ProblemMappers() {}
    private static Response problem(int status, String title, String detail) {
        return Response.status(status).type("application/problem+json")
                .entity(new Problem("about:blank", title, status, detail, "/completeness-evaluations")).build();
    }
    @Provider
    public static class Unavailable implements ExceptionMapper<PolicyEvaluationException> {
        public Response toResponse(PolicyEvaluationException exception) {
            return problem(503, "Beleid niet beschikbaar", "De beleidsregels kunnen tijdelijk niet worden uitgevoerd.");
        }
    }
    @Provider
    public static class InvalidFacts implements ExceptionMapper<InvalidIntakeFactsException> {
        public Response toResponse(InvalidIntakeFactsException exception) {
            return problem(400, "Ongeldige invoer", "Niet alle verplichte beleidsfeiten zijn ingevuld.");
        }
    }
}

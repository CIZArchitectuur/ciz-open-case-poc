package nl.ciz.document;

import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;
import nl.ciz.document.generated.model.Problem;

public final class ProblemMappers {
    private ProblemMappers() {}

    private static Response problem(int status, String title, String detail) {
        var body = new Problem("about:blank", title, status, detail, "/documents");
        return Response.status(status).type("application/problem+json").entity(body).build();
    }

    @Provider
    public static class NotFound implements ExceptionMapper<DocumentNotFoundException> {
        public Response toResponse(DocumentNotFoundException exception) {
            return problem(404, "Document niet gevonden", "Het gevraagde document bestaat niet.");
        }
    }

    @Provider
    public static class Invalid implements ExceptionMapper<InvalidDocumentException> {
        public Response toResponse(InvalidDocumentException exception) {
            return problem(400, "Ongeldig document", exception.getMessage());
        }
    }

    @Provider
    public static class Unavailable implements ExceptionMapper<StorageUnavailableException> {
        public Response toResponse(StorageUnavailableException exception) {
            return problem(503, "Opslag niet beschikbaar", "Het document kan tijdelijk niet worden verwerkt.");
        }
    }
}

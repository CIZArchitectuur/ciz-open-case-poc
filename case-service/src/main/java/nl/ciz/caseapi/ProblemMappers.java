package nl.ciz.caseapi;

import com.fasterxml.jackson.core.JsonProcessingException;
import jakarta.validation.ConstraintViolationException;
import jakarta.ws.rs.BadRequestException;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;
import nl.ciz.caseapi.generated.model.Problem;

public final class ProblemMappers {
    private ProblemMappers() {}

    static Response response(int status, String title, String detail, UriInfo uriInfo) {
        var problem = new Problem("about:blank", title, status, detail, uriInfo.getPath());
        return Response.status(status).type("application/problem+json").entity(problem).build();
    }

    @Provider
    public static class NotFoundMapper implements ExceptionMapper<CaseNotFoundException> {
        @Context UriInfo uriInfo;
        @Override public Response toResponse(CaseNotFoundException exception) {
            return response(404, "Case not found", "No case exists with the supplied identifier.", uriInfo);
        }
    }

    @Provider
    public static class PersonNotFoundMapper implements ExceptionMapper<PersonNotFoundException> {
        @Context UriInfo uriInfo;
        @Override public Response toResponse(PersonNotFoundException exception) {
            return response(404, "Person not found", "No person exists with the supplied identifier.", uriInfo);
        }
    }

    @Provider
    public static class PersonDataConflictMapper implements ExceptionMapper<PersonDataConflictException> {
        @Context UriInfo uriInfo;
        @Override public Response toResponse(PersonDataConflictException exception) {
            return response(409, "Person data conflict",
                    "The birth date does not match the person already registered for this identifier.", uriInfo);
        }
    }

    @Provider
    public static class TaskNotFoundMapper implements ExceptionMapper<TaskNotFoundException> {
        @Context UriInfo uriInfo;
        @Override public Response toResponse(TaskNotFoundException exception) {
            return response(404, "Task not found", "No task exists with the supplied identifier.", uriInfo);
        }
    }

    @Provider
    public static class WorkflowUnavailableMapper implements ExceptionMapper<WorkflowUnavailableException> {
        @Context UriInfo uriInfo;
        @Override public Response toResponse(WorkflowUnavailableException exception) {
            return response(503, "Workflow unavailable",
                    "The workflow engine is temporarily unavailable.", uriInfo);
        }
    }

    @Provider
    public static class PolicyUnavailableMapper implements ExceptionMapper<PolicyUnavailableException> {
        @Context UriInfo uriInfo;
        @Override public Response toResponse(PolicyUnavailableException exception) {
            return response(503, "Policy service unavailable",
                    "The policy decision service is temporarily unavailable.", uriInfo);
        }
    }

    @Provider
    public static class InvalidTaskCompletionMapper implements ExceptionMapper<InvalidTaskCompletionException> {
        @Context UriInfo uriInfo;
        @Override public Response toResponse(InvalidTaskCompletionException exception) {
            return response(400, "Invalid task completion",
                    "One or more required fields for this workflow task are missing or invalid.", uriInfo);
        }
    }

    @Provider
    public static class DocumentNotFoundMapper implements ExceptionMapper<CaseDocumentNotFoundException> {
        @Context UriInfo uriInfo;
        @Override public Response toResponse(CaseDocumentNotFoundException exception) {
            return response(404, "Document not found", "No document exists with the supplied identifier.", uriInfo);
        }
    }

    @Provider
    public static class DocumentUnavailableMapper implements ExceptionMapper<DocumentUnavailableException> {
        @Context UriInfo uriInfo;
        @Override public Response toResponse(DocumentUnavailableException exception) {
            return response(503, "Document service unavailable",
                    "The document service is temporarily unavailable.", uriInfo);
        }
    }

    @Provider
    public static class InvalidDocumentMapper implements ExceptionMapper<InvalidCaseDocumentException> {
        @Context UriInfo uriInfo;
        @Override public Response toResponse(InvalidCaseDocumentException exception) {
            return response(400, "Invalid document",
                    "Only non-empty PDF, JPEG, and PNG documents up to 10 MB are accepted.", uriInfo);
        }
    }

    @Provider
    public static class ValidationMapper implements ExceptionMapper<ConstraintViolationException> {
        @Context UriInfo uriInfo;
        @Override public Response toResponse(ConstraintViolationException exception) {
            return response(400, "Invalid request", "One or more request fields are invalid.", uriInfo);
        }
    }

    @Provider
    public static class BadRequestMapper implements ExceptionMapper<BadRequestException> {
        @Context UriInfo uriInfo;
        @Override public Response toResponse(BadRequestException exception) {
            return response(400, "Invalid request", "The request could not be parsed.", uriInfo);
        }
    }

    @Provider
    public static class WebApplicationMapper implements ExceptionMapper<WebApplicationException> {
        @Context UriInfo uriInfo;
        @Override public Response toResponse(WebApplicationException exception) {
            int status = exception.getResponse().getStatus();
            return response(status, "Request failed", "The requested resource or parameter is invalid.", uriInfo);
        }
    }

    @Provider
    public static class JsonMapper implements ExceptionMapper<JsonProcessingException> {
        @Context UriInfo uriInfo;
        @Override public Response toResponse(JsonProcessingException exception) {
            return response(400, "Invalid JSON", "The JSON body does not match the API contract.", uriInfo);
        }
    }

    @Provider
    public static class UnexpectedMapper implements ExceptionMapper<Throwable> {
        @Context UriInfo uriInfo;
        @Override public Response toResponse(Throwable exception) {
            return response(500, "Internal server error", "An unexpected error occurred.", uriInfo);
        }
    }
}

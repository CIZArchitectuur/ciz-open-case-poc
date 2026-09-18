package nl.ciz.caseapi;

public class WorkflowUnavailableException extends RuntimeException {
    public WorkflowUnavailableException(Throwable cause) {
        super("Workflow engine unavailable", cause);
    }
}

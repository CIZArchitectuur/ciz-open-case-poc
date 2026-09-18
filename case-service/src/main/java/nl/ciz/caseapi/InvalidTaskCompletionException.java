package nl.ciz.caseapi;

public class InvalidTaskCompletionException extends RuntimeException {
    public InvalidTaskCompletionException() {
        super("Completeness facts are required for an intake task");
    }
}

package nl.ciz.caseapi;

public class InvalidTaskCompletionException extends RuntimeException {
    public InvalidTaskCompletionException() {
        super("The required information for this workflow task is missing or invalid");
    }
}

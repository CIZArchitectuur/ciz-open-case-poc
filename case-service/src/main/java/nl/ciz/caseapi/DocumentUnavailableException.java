package nl.ciz.caseapi;

public class DocumentUnavailableException extends RuntimeException {
    public DocumentUnavailableException(Throwable cause) {
        super("Document service is unavailable", cause);
    }
}

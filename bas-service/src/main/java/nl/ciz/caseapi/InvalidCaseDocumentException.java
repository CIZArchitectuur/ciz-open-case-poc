package nl.ciz.caseapi;

public class InvalidCaseDocumentException extends RuntimeException {
    public InvalidCaseDocumentException() {
        super("Document was rejected by the document service");
    }
}

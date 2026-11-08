package nl.ciz.caseapi;

import java.util.UUID;

public class CaseDocumentNotFoundException extends RuntimeException {
    public CaseDocumentNotFoundException(UUID documentId) {
        super("Case document not found: " + documentId);
    }
}

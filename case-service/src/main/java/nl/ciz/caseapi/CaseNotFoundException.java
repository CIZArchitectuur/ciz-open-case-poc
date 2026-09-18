package nl.ciz.caseapi;

import java.util.UUID;

public class CaseNotFoundException extends RuntimeException {
    private final UUID caseId;

    public CaseNotFoundException(UUID caseId) {
        super("Case not found");
        this.caseId = caseId;
    }

    public UUID caseId() {
        return caseId;
    }
}


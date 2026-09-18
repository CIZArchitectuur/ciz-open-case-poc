package nl.ciz.caseapi;

import java.io.File;

public record CaseDocumentContent(File file, String fileName, String contentType) {
}

package nl.ciz.caseapi;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.ProcessingException;
import java.io.File;
import java.util.List;
import java.util.UUID;
import nl.ciz.caseapi.generated.document.api.ApiException;
import nl.ciz.caseapi.generated.document.api.DefaultApi;
import nl.ciz.caseapi.generated.model.CaseDocument;
import org.eclipse.microprofile.faulttolerance.Retry;
import org.eclipse.microprofile.rest.client.inject.RestClient;

@ApplicationScoped
public class DocumentGateway {
    private final DefaultApi api;

    public DocumentGateway(@RestClient DefaultApi api) {
        this.api = api;
    }

    public CaseDocument upload(UUID caseId, String fileName, String contentType, File body) {
        try {
            return toModel(api.uploadDocument(caseId, fileName, contentType, body));
        } catch (ApiException exception) {
            if (isInvalidDocumentResponse(exception)) throw new InvalidCaseDocumentException();
            throw new DocumentUnavailableException(exception);
        } catch (ProcessingException exception) {
            if (isInvalidDocumentResponse(exception)) throw new InvalidCaseDocumentException();
            throw new DocumentUnavailableException(exception);
        }
    }

    @Retry(maxRetries = 2, delay = 100, jitter = 50, retryOn = ProcessingException.class)
    public List<CaseDocument> list(UUID caseId) {
        try {
            return api.listDocuments(caseId).stream().map(DocumentGateway::toModel).toList();
        } catch (ApiException | ProcessingException exception) {
            throw new DocumentUnavailableException(exception);
        }
    }

    @Retry(maxRetries = 2, delay = 100, jitter = 50, retryOn = ProcessingException.class)
    public CaseDocumentContent download(UUID caseId, UUID documentId) {
        var metadata = list(caseId).stream()
                .filter(document -> document.getDocumentId().equals(documentId))
                .findFirst().orElseThrow(() -> new CaseDocumentNotFoundException(documentId));
        try {
            return new CaseDocumentContent(api.downloadDocument(documentId), metadata.getFileName(),
                    metadata.getContentType());
        } catch (ApiException | ProcessingException exception) {
            throw new DocumentUnavailableException(exception);
        }
    }

    private static CaseDocument toModel(nl.ciz.caseapi.generated.document.model.Document source) {
        return new CaseDocument(source.getDocumentId(), source.getCaseId(), source.getFileName(),
                source.getContentType(), source.getSize(), source.getSha256(), source.getCreatedAt());
    }

    private static boolean isInvalidDocumentResponse(Throwable exception) {
        for (var current = exception; current != null; current = current.getCause()) {
            if (current instanceof ApiException apiException && apiException.getResponse() != null) {
                var status = apiException.getResponse().getStatus();
                return status >= 400 && status < 500;
            }
            if (current instanceof jakarta.ws.rs.WebApplicationException webException
                    && webException.getResponse() != null) {
                var status = webException.getResponse().getStatus();
                return status >= 400 && status < 500;
            }
        }
        return false;
    }

}

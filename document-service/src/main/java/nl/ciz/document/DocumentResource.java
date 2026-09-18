package nl.ciz.document;

import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.Response;
import java.io.File;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import nl.ciz.document.generated.api.DocumentsApi;

public class DocumentResource implements DocumentsApi {
    private final DocumentService service;

    public DocumentResource(DocumentService service) {
        this.service = service;
    }

    @Override
    public Response uploadDocument(UUID caseId, String fileName, String contentType, File body) {
        var created = service.upload(caseId, fileName, contentType, body);
        return Response.created(URI.create("/documents/" + created.getDocumentId())).entity(created).build();
    }

    @Override
    public Response listDocuments(UUID caseId) {
        return Response.ok(service.list(caseId)).build();
    }

    @Override
    public Response downloadDocument(UUID documentId) {
        var content = service.download(documentId);
        var safeName = content.fileName().replace("\"", "");
        var encoded = java.net.URLEncoder.encode(content.fileName(), StandardCharsets.UTF_8).replace("+", "%20");
        return Response.ok(content.bytes(), content.contentType())
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"" + safeName + "\"; filename*=UTF-8''" + encoded)
                .build();
    }
}

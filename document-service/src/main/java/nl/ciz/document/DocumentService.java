package nl.ciz.document;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.transaction.Transactional;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import nl.ciz.document.generated.model.Document;

@ApplicationScoped
public class DocumentService {
    private static final long MAX_SIZE = 10L * 1024 * 1024;
    private static final Set<String> ALLOWED_TYPES = Set.of("application/pdf", "image/jpeg", "image/png");
    private final S3DocumentStorage storage;

    public DocumentService(S3DocumentStorage storage) {
        this.storage = storage;
    }

    @Transactional
    public Document upload(UUID caseId, String fileName, String contentType, File source) {
        var normalizedName = validateFileName(java.net.URLDecoder.decode(fileName, java.nio.charset.StandardCharsets.UTF_8));
        var normalizedType = validateContentType(contentType);

        final byte[] bytes;
        try {
            bytes = Files.readAllBytes(source.toPath());
        } catch (IOException exception) {
            throw new InvalidDocumentException("Het bestand kon niet worden gelezen.");
        }
        if (bytes.length == 0 || bytes.length > MAX_SIZE) {
            throw new InvalidDocumentException("Het bestand moet tussen 1 byte en 10 MB groot zijn.");
        }

        var entity = new DocumentEntity();
        entity.documentId = UUID.randomUUID();
        entity.caseId = caseId;
        entity.objectKey = caseId + "/" + entity.documentId;
        entity.fileName = normalizedName;
        entity.contentType = normalizedType;
        entity.size = bytes.length;
        entity.sha256 = sha256(bytes);
        entity.createdAt = Instant.now().truncatedTo(ChronoUnit.MICROS);

        storage.put(entity.objectKey, bytes, entity.contentType, entity.sha256);
        entity.persist();
        return toModel(entity);
    }

    public List<Document> list(UUID caseId) {
        return DocumentEntity.<DocumentEntity>list("caseId = ?1 order by createdAt", caseId).stream()
                .map(DocumentService::toModel).toList();
    }

    public StoredContent download(UUID documentId) {
        var entity = DocumentEntity.<DocumentEntity>findByIdOptional(documentId)
                .orElseThrow(() -> new DocumentNotFoundException(documentId));
        return new StoredContent(storage.get(entity.objectKey), entity.fileName, entity.contentType);
    }

    static String validateFileName(String fileName) {
        var normalized = fileName.trim();
        if (normalized.isEmpty() || normalized.contains("/") || normalized.contains("\\")) {
            throw new InvalidDocumentException("Bestandsnaam is ongeldig.");
        }
        return normalized;
    }

    static String validateContentType(String contentType) {
        var normalized = contentType.trim().toLowerCase(java.util.Locale.ROOT);
        if (!ALLOWED_TYPES.contains(normalized)) {
            throw new InvalidDocumentException("Alleen PDF-, JPEG- en PNG-bestanden zijn toegestaan.");
        }
        return normalized;
    }

    static String sha256(byte[] bytes) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }

    private static Document toModel(DocumentEntity entity) {
        return new Document(entity.documentId, entity.caseId, entity.fileName, entity.contentType,
                entity.size, entity.sha256, entity.createdAt.atOffset(java.time.ZoneOffset.UTC));
    }
}

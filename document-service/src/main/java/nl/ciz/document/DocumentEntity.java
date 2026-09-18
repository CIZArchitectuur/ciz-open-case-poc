package nl.ciz.document;

import io.quarkus.hibernate.orm.panache.PanacheEntityBase;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "documents")
public class DocumentEntity extends PanacheEntityBase {
    @Id
    @Column(name = "document_id", nullable = false)
    public UUID documentId;

    @Column(name = "case_id", nullable = false)
    public UUID caseId;

    @Column(name = "object_key", nullable = false, unique = true, length = 255)
    public String objectKey;

    @Column(name = "file_name", nullable = false, length = 255)
    public String fileName;

    @Column(name = "content_type", nullable = false, length = 100)
    public String contentType;

    @Column(name = "size_bytes", nullable = false)
    public long size;

    @Column(name = "sha256", nullable = false, length = 64)
    public String sha256;

    @Column(name = "created_at", nullable = false)
    public Instant createdAt;
}

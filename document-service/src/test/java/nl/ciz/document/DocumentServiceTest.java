package nl.ciz.document;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;

class DocumentServiceTest {
    @Test
    void acceptsOnlySupportedMediaTypes() {
        assertEquals("application/pdf", DocumentService.validateContentType(" application/PDF "));
        assertThrows(InvalidDocumentException.class,
                () -> DocumentService.validateContentType("text/html"));
    }

    @Test
    void rejectsPathSegmentsInFileNames() {
        assertEquals("bijlage.pdf", DocumentService.validateFileName(" bijlage.pdf "));
        assertThrows(InvalidDocumentException.class,
                () -> DocumentService.validateFileName("../bijlage.pdf"));
    }

    @Test
    void calculatesPortableSha256Digest() {
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
                DocumentService.sha256("abc".getBytes(StandardCharsets.UTF_8)));
    }
}

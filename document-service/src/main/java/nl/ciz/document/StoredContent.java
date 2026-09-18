package nl.ciz.document;

public record StoredContent(byte[] bytes, String fileName, String contentType) {
}

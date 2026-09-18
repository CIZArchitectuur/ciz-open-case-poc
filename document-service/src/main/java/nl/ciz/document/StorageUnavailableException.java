package nl.ciz.document;

public class StorageUnavailableException extends RuntimeException {
    public StorageUnavailableException(Throwable cause) {
        super("Document storage is unavailable", cause);
    }
}

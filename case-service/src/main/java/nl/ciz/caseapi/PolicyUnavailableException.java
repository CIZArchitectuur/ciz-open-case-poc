package nl.ciz.caseapi;

public class PolicyUnavailableException extends RuntimeException {
    public PolicyUnavailableException(Throwable cause) {
        super("Policy evaluation unavailable", cause);
    }
}

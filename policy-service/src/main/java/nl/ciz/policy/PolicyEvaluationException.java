package nl.ciz.policy;

public class PolicyEvaluationException extends RuntimeException {
    public PolicyEvaluationException(Throwable cause) { super(cause); }
    public PolicyEvaluationException(String message) { super(message); }
}

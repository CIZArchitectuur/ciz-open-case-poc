package nl.ciz.policy;

public class InvalidIntakeFactsException extends RuntimeException {
    public InvalidIntakeFactsException() { super("Verplichte corpusfeiten ontbreken"); }
}
package nl.ciz.caseapi;

public class PersonNotFoundException extends RuntimeException {
    public PersonNotFoundException() { super("Person not found"); }
}

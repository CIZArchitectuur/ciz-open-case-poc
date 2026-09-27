package nl.ciz.caseapi;

public class PersonDataConflictException extends RuntimeException {
    public PersonDataConflictException() { super("Person data conflict"); }
}

package nl.ciz.caseapi;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import jakarta.validation.Validation;
import java.time.LocalDate;
import nl.ciz.caseapi.generated.model.CreateCaseRequest;
import org.junit.jupiter.api.Test;

class CreateCaseRequestTest {
    @Test
    void acceptsAValidRequest() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var request = new CreateCaseRequest("applicant-1", "Fictionele Cliënt", "De Vries", "A.B.",
                    "123456782", LocalDate.of(1980, 1, 1), "Voorbeeldstraat", "10A", "1234 AB",
                    "Utrecht", "Nederland", true, false, CreateCaseRequest.ApplicantRoleEnum.CLIENT,
                    CreateCaseRequest.SignedByEnum.CLIENT);
            assertTrue(factory.getValidator().validate(request).isEmpty());
        }
    }

    @Test
    void rejectsBlankNamesAndFutureBirthDates() {
        try (var factory = Validation.buildDefaultValidatorFactory()) {
            var request = new CreateCaseRequest(" ", " ", " ", " ", "ongeldig",
                    LocalDate.now().plusDays(1), " ", " ", " ", " ", " ", true, false,
                    CreateCaseRequest.ApplicantRoleEnum.CLIENT, CreateCaseRequest.SignedByEnum.CLIENT);
            assertTrue(factory.getValidator().validate(request).size() >= 3);
        }
    }
}

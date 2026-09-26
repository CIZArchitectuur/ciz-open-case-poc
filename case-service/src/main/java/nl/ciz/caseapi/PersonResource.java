package nl.ciz.caseapi;

import jakarta.ws.rs.core.Response;
import java.util.UUID;
import nl.ciz.caseapi.generated.api.PersonsApi;

public class PersonResource implements PersonsApi {
    private final CaseService service;

    public PersonResource(CaseService service) {
        this.service = service;
    }

    @Override
    public Response listPersonCases(UUID personId) {
        return Response.ok(service.listPersonCases(personId)
                .orElseThrow(PersonNotFoundException::new)).build();
    }
}

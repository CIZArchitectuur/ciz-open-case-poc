package nl.ciz.caseapi;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.ProcessingException;
import nl.ciz.caseapi.generated.addressvalidation.api.ApiException;
import nl.ciz.caseapi.generated.addressvalidation.api.DefaultApi;
import nl.ciz.caseapi.generated.addressvalidation.model.AddressValidationRequest;
import nl.ciz.caseapi.generated.model.AddressValidationResult;
import org.eclipse.microprofile.rest.client.inject.RestClient;

@ApplicationScoped
public class AddressValidationGateway {
    private final DefaultApi api;

    public AddressValidationGateway(@RestClient DefaultApi api) {
        this.api = api;
    }

    public AddressValidationResult validate(nl.ciz.caseapi.generated.model.AddressValidationRequest request) {
        try {
            var result = api.validateAddress(new AddressValidationRequest()
                    .country(request.getCountry())
                    .postalCode(request.getPostalCode())
                    .houseNumber(request.getHouseNumber()));
            return new AddressValidationResult()
                    .status(AddressValidationResult.StatusEnum.fromValue(result.getStatus().toString()))
                    .message(result.getMessage())
                    .suggestedStreet(result.getSuggestedStreet())
                    .suggestedCity(result.getSuggestedCity())
                    .suggestedPostalCode(result.getSuggestedPostalCode())
                    .suggestedHouseNumber(result.getSuggestedHouseNumber());
        } catch (ApiException | ProcessingException exception) {
            return unavailable();
        }
    }

    private static AddressValidationResult unavailable() {
        return new AddressValidationResult()
                .status(AddressValidationResult.StatusEnum.UNAVAILABLE)
                .message("Adrescontrole is tijdelijk niet beschikbaar. U kunt uw adres handmatig invullen.");
    }
}

package nl.ciz.addressvalidation;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.core.Response;
import nl.ciz.addressvalidation.generated.api.ValidateApi;
import nl.ciz.addressvalidation.generated.model.AddressValidationRequest;
import org.apache.camel.ProducerTemplate;

@ApplicationScoped
public class AddressValidationResource implements ValidateApi {
    private final ProducerTemplate producer;

    public AddressValidationResource(ProducerTemplate producer) {
        this.producer = producer;
    }

    @Override
    public Response validateAddress(AddressValidationRequest request) {
        var result = producer.requestBody("direct:validate-address", request,
                nl.ciz.addressvalidation.generated.model.AddressValidationResult.class);
        return Response.ok(result).build();
    }
}

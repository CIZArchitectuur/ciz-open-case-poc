package nl.ciz.addressvalidation;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.regex.Pattern;
import nl.ciz.addressvalidation.generated.model.AddressValidationRequest;
import nl.ciz.addressvalidation.generated.model.AddressValidationResult;
import org.apache.camel.Exchange;
import org.apache.camel.LoggingLevel;
import org.apache.camel.builder.RouteBuilder;
import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
public class AddressValidationRoute extends RouteBuilder {
    private static final Pattern POSTCODE = Pattern.compile("^[1-9][0-9]{3}[A-Z]{2}$");
    private static final Pattern HOUSE_NUMBER = Pattern.compile("^[0-9]{1,5}[A-Z]?(?:-[A-Z0-9]{1,6})?$");

    private final ObjectMapper json;

    public AddressValidationRoute(ObjectMapper json) {
        this.json = json;
    }

    @Override
    public void configure() {
        onException(Exception.class)
                .maximumRedeliveries(1)
                .redeliveryDelay(100)
                .retryAttemptedLogLevel(LoggingLevel.OFF)
                .retriesExhaustedLogLevel(LoggingLevel.OFF)
                .handled(true)
                .process(exchange -> exchange.getMessage().setBody(result(
                        AddressValidationResult.StatusEnum.UNAVAILABLE,
                        "Adrescontrole is tijdelijk niet beschikbaar. U kunt uw adres handmatig invullen.")));

        from("direct:validate-address")
                .process(exchange -> prepare(exchange))
                .choice()
                .when(exchangeProperty("skipProvider").isEqualTo(true))
                    .stop()
                .otherwise()
                    .setHeader(Exchange.HTTP_METHOD, constant("GET"))
                    .setHeader(Exchange.HTTP_QUERY, exchangeProperty("pdokQuery"))
                    .toD("{{pdok.base-url}}")
                    .process(exchange -> mapResponse(exchange))
                .end();
    }

    private void prepare(Exchange exchange) {
        var request = exchange.getMessage().getBody(AddressValidationRequest.class);
        if (request == null) {
            skip(exchange, result(AddressValidationResult.StatusEnum.INVALID_INPUT,
                    "Vul een postcode en huisnummer in."));
            return;
        }
        if (!isNetherlands(request.getCountry())) {
            skip(exchange, result(AddressValidationResult.StatusEnum.NOT_SUPPORTED,
                    "De postcodecontrole is in deze proef alleen beschikbaar voor Nederlandse adressen."));
            return;
        }

        var postalCode = normalize(request.getPostalCode());
        var houseNumber = normalize(request.getHouseNumber());
        if (!POSTCODE.matcher(postalCode).matches() || !HOUSE_NUMBER.matcher(houseNumber).matches()) {
            skip(exchange, result(AddressValidationResult.StatusEnum.INVALID_INPUT,
                    "Controleer de Nederlandse postcode en het huisnummer. U kunt het adres daarna handmatig invoeren."));
            return;
        }

        var query = "postcode:" + postalCode + " AND huis_nlt:\"" + houseNumber + "\"";
        var encodedQuery = URLEncoder.encode(query, StandardCharsets.UTF_8);
        exchange.setProperty("expectedPostcode", postalCode);
        exchange.setProperty("expectedHouseNumber", houseNumber);
        exchange.setProperty("pdokQuery", "q=" + encodedQuery
                + "&fq=type%3Aadres&rows=5"
                + "&fl=postcode%2Chuis_nlt%2Cstraatnaam%2Cwoonplaatsnaam&wt=json");
    }

    private void mapResponse(Exchange exchange) throws Exception {
        var response = json.readTree(exchange.getMessage().getBody(String.class));
        var documents = response.path("response").path("docs");
        if (!documents.isArray()) {
            throw new IllegalStateException("Address provider returned an unexpected response");
        }

        var expectedPostcode = exchange.getProperty("expectedPostcode", String.class);
        var expectedHouseNumber = exchange.getProperty("expectedHouseNumber", String.class);
        for (JsonNode document : documents) {
            var foundPostcode = normalize(document.path("postcode").asText());
            var foundHouseNumber = normalize(document.path("huis_nlt").asText());
            if (expectedPostcode.equals(foundPostcode) && expectedHouseNumber.equals(foundHouseNumber)) {
                exchange.getMessage().setBody(new AddressValidationResult()
                        .status(AddressValidationResult.StatusEnum.MATCHED)
                        .message("Postcode en huisnummer zijn gevonden. Controleer het adresvoorstel.")
                        .suggestedStreet(document.path("straatnaam").asText())
                        .suggestedCity(document.path("woonplaatsnaam").asText())
                        .suggestedPostalCode(document.path("postcode").asText())
                        .suggestedHouseNumber(document.path("huis_nlt").asText()));
                return;
            }
        }
        exchange.getMessage().setBody(result(AddressValidationResult.StatusEnum.NO_MATCH,
                "Geen overeenkomst gevonden. Controleer uw invoer of vul het adres handmatig in."));
    }

    private static boolean isNetherlands(String country) {
        var value = normalize(country);
        return value.equals("NL") || value.equals("NEDERLAND") || value.equals("THE NETHERLANDS");
    }

    private static String normalize(String value) {
        return value == null ? "" : value.replaceAll("\\s+", "").toUpperCase(Locale.ROOT);
    }

    private static void skip(Exchange exchange, AddressValidationResult result) {
        exchange.setProperty("skipProvider", true);
        exchange.getMessage().setBody(result);
    }

    private static AddressValidationResult result(AddressValidationResult.StatusEnum status, String message) {
        return new AddressValidationResult().status(status).message(message);
    }
}

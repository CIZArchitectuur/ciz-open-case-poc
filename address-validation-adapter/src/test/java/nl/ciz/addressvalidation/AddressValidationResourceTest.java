package nl.ciz.addressvalidation;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.notNullValue;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.quarkus.test.common.QuarkusTestResource;
import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;

@QuarkusTest
@QuarkusTestResource(LocalPdokServer.class)
class AddressValidationResourceTest {
    @Test
    void returnsEditableSuggestionForExactMatch() {
        given().contentType("application/json")
                .body("""
                    {"country":"Nederland","postalCode":"3514 ar","houseNumber":"38-BS"}
                    """)
                .when().post("/validate")
                .then().statusCode(200)
                .body("status", equalTo("MATCHED"))
                .body("suggestedStreet", equalTo("Bemuurde Weerd O.Z."))
                .body("suggestedCity", equalTo("Utrecht"))
                .body("suggestedPostalCode", equalTo("3514AR"));
    }

    @Test
    void returnsNoMatchWithoutBlocking() {
        given().contentType("application/json")
                .body("""
                    {"country":"Nederland","postalCode":"1234 ZZ","houseNumber":"9"}
                    """)
                .when().post("/validate")
                .then().statusCode(200)
                .body("status", equalTo("NO_MATCH"))
                .body("message", notNullValue());
    }

    @Test
    void invalidAndUnsupportedInputsDoNotCallProvider() {
        var callsBefore = LocalPdokServer.callCount.get();
        given().contentType("application/json")
                .body("""
                    {"country":"Nederland","postalCode":"invalid","houseNumber":"9"}
                    """)
                .when().post("/validate")
                .then().statusCode(200).body("status", equalTo("INVALID_INPUT"));

        given().contentType("application/json")
                .body("""
                    {"country":"België","postalCode":"1000 AA","houseNumber":"9"}
                    """)
                .when().post("/validate")
                .then().statusCode(200).body("status", equalTo("NOT_SUPPORTED"));
        assertTrue(LocalPdokServer.callCount.get() == callsBefore,
                "Invalid or unsupported addresses must not reach the provider");
    }

    @Test
    void providerFailureIsReturnedAsUnavailable() {
        var response = given().contentType("application/json")
                .body("""
                    {"country":"Nederland","postalCode":"9999 ZZ","houseNumber":"9"}
                    """)
                .when().post("/validate");
        assertTrue(LocalPdokServer.lastQuery != null
                && java.net.URLDecoder.decode(LocalPdokServer.lastQuery, java.nio.charset.StandardCharsets.UTF_8).contains("9999ZZ"),
                "Expected the provider request to include the synthetic test postcode; query=" + LocalPdokServer.lastQuery);
        response.then().statusCode(200)
                .body("status", equalTo("UNAVAILABLE"))
                .body("message", notNullValue());
    }
}

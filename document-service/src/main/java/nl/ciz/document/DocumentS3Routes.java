package nl.ciz.document;

import org.apache.camel.builder.RouteBuilder;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
public class DocumentS3Routes extends RouteBuilder {
    @ConfigProperty(name = "s3.bucket") String bucket;

    @Override
    public void configure() {
        String endpoint = "aws2-s3://" + bucket + "?amazonS3Client=#documentS3Client&autoCreateBucket=false";
        from("direct:document-s3-put").routeId("document-s3-put").to(endpoint);
        from("direct:document-s3-get").routeId("document-s3-get").to(endpoint + "&operation=getObject").convertBodyTo(byte[].class);
    }
}

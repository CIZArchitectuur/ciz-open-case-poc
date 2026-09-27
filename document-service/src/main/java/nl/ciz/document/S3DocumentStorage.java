package nl.ciz.document;

import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;
import jakarta.inject.Inject;
import jakarta.inject.Named;
import java.net.URI;
import java.time.Duration;
import java.util.Map;
import org.apache.camel.ProducerTemplate;
import org.apache.camel.component.aws2.s3.AWS2S3Constants;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration;
import software.amazon.awssdk.core.retry.RetryPolicy;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.HeadBucketRequest;

@ApplicationScoped
public class S3DocumentStorage {
    @Inject ProducerTemplate producer;
    @Inject S3Client client;
    @ConfigProperty(name = "s3.bucket") String bucket;

    @Produces
    @Named("documentS3Client")
    @ApplicationScoped
    S3Client client(
            @ConfigProperty(name = "s3.endpoint") URI endpoint,
            @ConfigProperty(name = "s3.region") String region,
            @ConfigProperty(name = "s3.access-key") String accessKey,
            @ConfigProperty(name = "s3.secret-key") String secretKey) {
        return S3Client.builder()
                .endpointOverride(endpoint)
                .region(Region.of(region))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey, secretKey)))
                .forcePathStyle(true)
                .httpClientBuilder(UrlConnectionHttpClient.builder()
                        .connectionTimeout(Duration.ofSeconds(3)).socketTimeout(Duration.ofSeconds(5)))
                .overrideConfiguration(ClientOverrideConfiguration.builder()
                        .apiCallAttemptTimeout(Duration.ofSeconds(5))
                        .apiCallTimeout(Duration.ofSeconds(12))
                        .retryPolicy(RetryPolicy.builder().numRetries(2).build())
                        .build())
                .build();
    }

    public void put(String key, byte[] content, String contentType, String sha256) {
        try {
            producer.sendBodyAndHeaders("direct:document-s3-put", content, Map.of(
                    AWS2S3Constants.KEY, key,
                    AWS2S3Constants.CONTENT_TYPE, contentType,
                    AWS2S3Constants.METADATA, Map.of("sha256", sha256)));
        } catch (RuntimeException exception) {
            throw new StorageUnavailableException(exception);
        }
    }

    public byte[] get(String key) {
        try {
            return producer.requestBodyAndHeader("direct:document-s3-get", null, AWS2S3Constants.KEY, key, byte[].class);
        } catch (RuntimeException exception) {
            throw new StorageUnavailableException(exception);
        }
    }

    public boolean isReady() {
        try {
            client.headBucket(HeadBucketRequest.builder().bucket(bucket).build());
            return true;
        } catch (RuntimeException exception) {
            return false;
        }
    }

    @PreDestroy
    void close() {
        client.close();
    }
}

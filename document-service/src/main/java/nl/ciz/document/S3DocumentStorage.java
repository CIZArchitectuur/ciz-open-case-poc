package nl.ciz.document;

import jakarta.annotation.PreDestroy;
import jakarta.enterprise.context.ApplicationScoped;
import java.net.URI;
import java.time.Duration;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration;
import software.amazon.awssdk.core.retry.RetryPolicy;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.HeadBucketRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

@ApplicationScoped
public class S3DocumentStorage {
    private final S3Client client;
    private final String bucket;

    public S3DocumentStorage(
            @ConfigProperty(name = "s3.endpoint") URI endpoint,
            @ConfigProperty(name = "s3.region") String region,
            @ConfigProperty(name = "s3.bucket") String bucket,
            @ConfigProperty(name = "s3.access-key") String accessKey,
            @ConfigProperty(name = "s3.secret-key") String secretKey) {
        this.bucket = bucket;
        this.client = S3Client.builder()
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
            client.putObject(PutObjectRequest.builder()
                    .bucket(bucket).key(key).contentType(contentType)
                    .metadata(java.util.Map.of("sha256", sha256)).build(), RequestBody.fromBytes(content));
        } catch (RuntimeException exception) {
            throw new StorageUnavailableException(exception);
        }
    }

    public byte[] get(String key) {
        try {
            return client.getObjectAsBytes(GetObjectRequest.builder().bucket(bucket).key(key).build()).asByteArray();
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

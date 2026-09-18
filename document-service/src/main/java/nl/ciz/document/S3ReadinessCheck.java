package nl.ciz.document;

import jakarta.enterprise.context.ApplicationScoped;
import org.eclipse.microprofile.health.HealthCheck;
import org.eclipse.microprofile.health.HealthCheckResponse;
import org.eclipse.microprofile.health.Readiness;

@Readiness
@ApplicationScoped
public class S3ReadinessCheck implements HealthCheck {
    private final S3DocumentStorage storage;

    public S3ReadinessCheck(S3DocumentStorage storage) {
        this.storage = storage;
    }

    @Override
    public HealthCheckResponse call() {
        return HealthCheckResponse.named("s3-document-storage").status(storage.isReady()).build();
    }
}

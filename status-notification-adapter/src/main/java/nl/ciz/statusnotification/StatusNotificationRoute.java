package nl.ciz.statusnotification;

import jakarta.enterprise.context.ApplicationScoped;
import org.apache.camel.builder.RouteBuilder;
import org.eclipse.microprofile.config.inject.ConfigProperty;

@ApplicationScoped
public class StatusNotificationRoute extends RouteBuilder {
    @ConfigProperty(name = "status.batch.interval-ms")
    long batchIntervalMs;

    @Override
    public void configure() {
        from("kafka:{{status.input.topic}}?brokers={{kafka.bootstrap-servers}}"
                + "&groupId={{status.consumer.group}}&autoOffsetReset=earliest&bridgeErrorHandler=true")
                .routeId("administrative-support-status-batch")
                // Discard the payload before the exchange reaches the aggregator.
                .setBody(constant(1))
                .aggregate(constant("administrative-support-status-updates"), new StatusBatchAggregationStrategy())
                    .completionInterval(batchIntervalMs)
                    .log("Mock administrative-support workflow started for batch of ${body} status updates");
    }
}

package nl.ciz.statusnotification;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.apache.camel.impl.DefaultCamelContext;
import org.apache.camel.support.DefaultExchange;
import org.junit.jupiter.api.Test;

class StatusBatchAggregationStrategyTest {
    @Test
    void aggregatesOnlyAnIntegerCountInsteadOfRetainingEventPayloads() {
        var strategy = new StatusBatchAggregationStrategy();
        var context = new DefaultCamelContext();
        var firstEvent = new DefaultExchange(context);
        firstEvent.getMessage().setBody("sensitive event payload");
        var secondEvent = new DefaultExchange(context);
        secondEvent.getMessage().setBody("another event payload");

        var batch = strategy.aggregate(null, firstEvent);
        batch = strategy.aggregate(batch, secondEvent);

        assertEquals(2, batch.getMessage().getBody(Integer.class));
    }
}

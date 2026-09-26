package nl.ciz.statusnotification;

import org.apache.camel.AggregationStrategy;
import org.apache.camel.Exchange;

/** Retains only the number of status events in a batch, never event payloads. */
public class StatusBatchAggregationStrategy implements AggregationStrategy {
    @Override
    public Exchange aggregate(Exchange previous, Exchange current) {
        if (previous == null) {
            current.getMessage().setBody(1);
            return current;
        }

        Integer count = previous.getMessage().getBody(Integer.class);
        previous.getMessage().setBody((count == null ? 0 : count) + 1);
        return previous;
    }
}

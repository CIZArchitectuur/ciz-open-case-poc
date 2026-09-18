package nl.ciz.caseapi;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.ProcessingException;
import java.util.List;
import nl.ciz.caseapi.generated.operaton.api.ApiException;
import nl.ciz.caseapi.generated.operaton.api.WorkflowApi;
import nl.ciz.caseapi.generated.operaton.model.HistoricTask;
import nl.ciz.caseapi.generated.operaton.model.ProcessInstance;
import org.eclipse.microprofile.faulttolerance.Retry;
import org.eclipse.microprofile.rest.client.inject.RestClient;

@ApplicationScoped
public class OperatonQueryClient {
    private final WorkflowApi api;

    public OperatonQueryClient(@RestClient WorkflowApi api) {
        this.api = api;
    }

    @Retry(maxRetries = 2, delay = 100, jitter = 50, retryOn = ProcessingException.class)
    public List<ProcessInstance> findProcessInstances(String businessKey, String processInstanceId)
            throws ApiException {
        return api.findProcessInstances(businessKey, OperatonWorkflowGateway.PROCESS_DEFINITION_KEY,
                processInstanceId);
    }

    @Retry(maxRetries = 2, delay = 100, jitter = 50, retryOn = ProcessingException.class)
    public List<HistoricTask> findTasks(String businessKey, String taskId) throws ApiException {
        return api.findTasks(businessKey, OperatonWorkflowGateway.PROCESS_DEFINITION_KEY, taskId,
                "startTime", "asc");
    }
}

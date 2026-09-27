package nl.ciz.caseapi;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.ProcessingException;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import nl.ciz.caseapi.generated.model.CaseTask;
import nl.ciz.caseapi.generated.operaton.api.ApiException;
import nl.ciz.caseapi.generated.operaton.api.WorkflowApi;
import nl.ciz.caseapi.generated.operaton.model.CompleteTaskRequest;
import nl.ciz.caseapi.generated.operaton.model.HistoricTask;
import nl.ciz.caseapi.generated.operaton.model.ProcessInstance;
import nl.ciz.caseapi.generated.operaton.model.StartProcessRequest;
import nl.ciz.caseapi.generated.operaton.model.VariableValue;
import org.eclipse.microprofile.rest.client.inject.RestClient;

@ApplicationScoped
public class OperatonWorkflowGateway {
    static final String PROCESS_DEFINITION_KEY = "wlz-aanvraag";
    private static final String REGISTRATION_TASK_KEY = "registerAndCheckApplication";
    private static final String REQUEST_SUPPLEMENT_TASK_KEY = "requestSupplement";
    private static final String PROVIDE_SUPPLEMENT_TASK_KEY = "provideSupplement";
    private static final String TRIAGE_TASK_KEY = "triageApplication";
    private static final String INVESTIGATION_TASK_KEY = "investigateAndDecide";
    private static final String OUTGOING_TASK_KEY = "sendOutgoingDecision";
    private static final DateTimeFormatter OPERATON_DATE = new DateTimeFormatterBuilder()
            .append(DateTimeFormatter.ISO_LOCAL_DATE_TIME)
            .appendOffset("+HHMM", "+0000")
            .toFormatter();

    private final WorkflowApi api;
    private final OperatonQueryClient queries;

    public OperatonWorkflowGateway(@RestClient WorkflowApi api, OperatonQueryClient queries) {
        this.api = api;
        this.queries = queries;
    }

    public void startForCase(UUID caseId) {
        try {
            api.startProcessInstance(PROCESS_DEFINITION_KEY,
                    new StartProcessRequest().businessKey(caseId.toString()).variables(Map.of()));
        } catch (ApiException | ProcessingException exception) {
            throw new WorkflowUnavailableException(exception);
        }
    }

    public void ensureStarted(UUID caseId) {
        if (findProcesses(caseId.toString(), null).isEmpty()) {
            startForCase(caseId);
        }
    }

    public List<CaseTask> listTasks(UUID caseId) {
        ensureStarted(caseId);
        return findTasks(caseId.toString(), null).stream()
                .filter(OperatonWorkflowGateway::isKnownTask)
                .map(task -> toCaseTask(task, caseId))
                .toList();
    }

    public List<CaseTask> listTasks(String status, String type) {
        var caseIdsByProcess = findProcesses(null, null).stream()
                .filter(instance -> instance.getBusinessKey() != null)
                .flatMap(instance -> {
                    var caseId = parseUuidOrNull(instance.getBusinessKey());
                    return caseId == null ? java.util.stream.Stream.empty()
                            : java.util.stream.Stream.of(Map.entry(instance.getId(), caseId));
                })
                .collect(java.util.stream.Collectors.toMap(Map.Entry::getKey, Map.Entry::getValue,
                        (first, ignored) -> first));

        return findTasks(null, null).stream()
                .filter(OperatonWorkflowGateway::isKnownTask)
                .filter(task -> caseIdsByProcess.containsKey(task.getProcessInstanceId()))
                .map(task -> toCaseTask(task, caseIdsByProcess.get(task.getProcessInstanceId())))
                .filter(task -> status == null || task.getStatus().value().equals(status))
                .filter(task -> type == null || task.getType().value().equals(type))
                .toList();
    }

    public CaseTask getTask(UUID taskId) {
        var task = findTasks(null, taskId.toString()).stream().findFirst()
                .orElseThrow(() -> new TaskNotFoundException(taskId));
        if (!isKnownTask(task)) {
            throw new TaskNotFoundException(taskId);
        }

        var process = findProcesses(null, task.getProcessInstanceId()).stream().findFirst()
                .filter(instance -> PROCESS_DEFINITION_KEY.equals(instance.getProcessDefinitionKey()))
                .orElseThrow(() -> new TaskNotFoundException(taskId));
        var caseId = parseUuid(process.getBusinessKey(), taskId);
        return toCaseTask(task, caseId);
    }

    public CaseTask completeTask(UUID taskId, Map<String, VariableValue> variables) {
        var current = getTask(taskId);
        var task = findTasks(null, taskId.toString()).stream().findFirst()
                .orElseThrow(() -> new TaskNotFoundException(taskId));

        if (task.getEndTime() == null) {
            try {
                api.completeUserTask(taskId.toString(), new CompleteTaskRequest().variables(variables));
            } catch (ApiException | ProcessingException exception) {
                var completed = findTasks(null, taskId.toString()).stream().findFirst();
                if (completed.isEmpty() || completed.get().getEndTime() == null) {
                    throw new WorkflowUnavailableException(exception);
                }
            }
            task = findTasks(null, taskId.toString()).stream().findFirst()
                    .orElseThrow(() -> new WorkflowUnavailableException(
                            new IllegalStateException("Completed task missing from history")));
        }
        return toCaseTask(task, current.getCaseId());
    }

    private List<ProcessInstance> findProcesses(String businessKey, String processInstanceId) {
        try {
            return queries.findProcessInstances(businessKey, processInstanceId).stream()
                    .filter(instance -> PROCESS_DEFINITION_KEY.equals(instance.getProcessDefinitionKey()))
                    .toList();
        } catch (ApiException | ProcessingException exception) {
            throw new WorkflowUnavailableException(exception);
        }
    }

    private List<HistoricTask> findTasks(String businessKey, String taskId) {
        try {
            return queries.findTasks(businessKey, taskId);
        } catch (ApiException | ProcessingException exception) {
            throw new WorkflowUnavailableException(exception);
        }
    }

    private static CaseTask toCaseTask(HistoricTask source, UUID caseId) {
        var status = source.getEndTime() == null
                ? CaseTask.StatusEnum.OPEN : CaseTask.StatusEnum.COMPLETED;
        var type = switch (source.getTaskDefinitionKey()) {
            case REGISTRATION_TASK_KEY -> CaseTask.TypeEnum.REGISTRATION_ACCEPTANCE;
            case REQUEST_SUPPLEMENT_TASK_KEY -> CaseTask.TypeEnum.REQUEST_ADDITIONAL_INFORMATION;
            case PROVIDE_SUPPLEMENT_TASK_KEY -> CaseTask.TypeEnum.SUPPLEMENT_PROVISION;
            case TRIAGE_TASK_KEY -> CaseTask.TypeEnum.TRIAGE;
            case INVESTIGATION_TASK_KEY -> CaseTask.TypeEnum.WLZ_INVESTIGATION_DECISION;
            case OUTGOING_TASK_KEY -> CaseTask.TypeEnum.OUTGOING_COMMUNICATION;
            default -> throw new IllegalArgumentException("Unknown workflow task type");
        };
        var task = new CaseTask(UUID.fromString(source.getId()), caseId, type, status,
                parseDate(source.getStartTime()));
        if (source.getEndTime() != null) {
            task.completedAt(parseDate(source.getEndTime()));
        }
        return task;
    }

    private static OffsetDateTime parseDate(String value) {
        try {
            return OffsetDateTime.parse(value);
        } catch (java.time.format.DateTimeParseException ignored) {
            return OffsetDateTime.parse(value, OPERATON_DATE);
        }
    }

    private static UUID parseUuid(String value, UUID taskId) {
        try {
            return UUID.fromString(value);
        } catch (RuntimeException exception) {
            throw new TaskNotFoundException(taskId);
        }
    }

    private static UUID parseUuidOrNull(String value) {
        try {
            return UUID.fromString(value);
        } catch (RuntimeException exception) {
            return null;
        }
    }

    private static boolean isKnownTask(HistoricTask task) {
        return Objects.equals(REGISTRATION_TASK_KEY, task.getTaskDefinitionKey())
                || Objects.equals(REQUEST_SUPPLEMENT_TASK_KEY, task.getTaskDefinitionKey())
                || Objects.equals(PROVIDE_SUPPLEMENT_TASK_KEY, task.getTaskDefinitionKey())
                || Objects.equals(TRIAGE_TASK_KEY, task.getTaskDefinitionKey())
                || Objects.equals(INVESTIGATION_TASK_KEY, task.getTaskDefinitionKey())
                || Objects.equals(OUTGOING_TASK_KEY, task.getTaskDefinitionKey());
    }
}

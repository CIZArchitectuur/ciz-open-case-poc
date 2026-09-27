package nl.ciz.caseapi;

import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.ForbiddenException;
import jakarta.ws.rs.core.Response;
import io.quarkus.security.identity.SecurityIdentity;
import java.util.UUID;
import java.util.stream.Collectors;
import nl.ciz.caseapi.generated.api.TasksApi;
import nl.ciz.caseapi.generated.model.CaseTask;
import nl.ciz.caseapi.generated.model.TaskCompletionRequest;

@RolesAllowed({"ciz-medewerker", "beoordelaar"})
public class TaskResource implements TasksApi {
    private final CaseService service;
    @Inject SecurityIdentity identity;

    public TaskResource(CaseService service) {
        this.service = service;
    }

    @Override
    public Response completeTask(UUID taskId, TaskCompletionRequest taskCompletionRequest, String xCorrelationId) {
        var task = service.getTask(taskId);
        requireTaskRole(task.getType());
        return Response.ok(service.completeTask(taskId, taskCompletionRequest, xCorrelationId)).build();
    }

    @Override
    public Response getTaskIntakeForm(UUID taskId) {
        requireTaskRole(CaseTask.TypeEnum.REGISTRATION_ACCEPTANCE);
        return Response.ok(service.intakeForm(taskId)).build();
    }

    @Override
    public Response getTaskMedicalAssessmentForm(UUID taskId) {
        requireTaskRole(CaseTask.TypeEnum.WLZ_INVESTIGATION_DECISION);
        return Response.ok(service.medicalAssessmentForm(taskId)).build();
    }

    @Override
    public Response listTasks(String status, String type) {
        var available = service.listTasks(status, type);
        var tasks = available.stream()
                .filter(task -> hasTaskRole(task.getType()))
                .collect(Collectors.toList());
        if (type != null && !type.isBlank() && tasks.isEmpty() && !available.isEmpty()) {
            throw new ForbiddenException("Deze taak hoort bij een andere rol.");
        }
        return Response.ok(tasks).build();
    }

    private void requireTaskRole(CaseTask.TypeEnum type) {
        if (!hasTaskRole(type)) throw new ForbiddenException("Deze taak hoort bij een andere rol.");
    }

    private boolean hasTaskRole(CaseTask.TypeEnum type) {
        var role = switch (type) {
            case REGISTRATION_ACCEPTANCE, REQUEST_ADDITIONAL_INFORMATION, OUTGOING_COMMUNICATION -> "ciz-medewerker";
            case TRIAGE, WLZ_INVESTIGATION_DECISION -> "beoordelaar";
            case SUPPLEMENT_PROVISION -> null;
        };
        return role != null && identity.getRoles().contains(role);
    }
}

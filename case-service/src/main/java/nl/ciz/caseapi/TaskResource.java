package nl.ciz.caseapi;

import jakarta.ws.rs.core.Response;
import java.util.UUID;
import nl.ciz.caseapi.generated.api.TasksApi;
import nl.ciz.caseapi.generated.model.TaskCompletionRequest;

public class TaskResource implements TasksApi {
    private final CaseService service;

    public TaskResource(CaseService service) {
        this.service = service;
    }

    @Override
    public Response completeTask(UUID taskId, TaskCompletionRequest taskCompletionRequest) {
        return Response.ok(service.completeTask(taskId, taskCompletionRequest)).build();
    }

    @Override
    public Response getTaskIntakeForm(UUID taskId) {
        return Response.ok(service.intakeForm(taskId)).build();
    }

    @Override
    public Response getTaskMedicalAssessmentForm(UUID taskId) {
        return Response.ok(service.medicalAssessmentForm(taskId)).build();
    }

    @Override
    public Response listTasks(String status, String type) {
        return Response.ok(service.listTasks(status, type)).build();
    }
}

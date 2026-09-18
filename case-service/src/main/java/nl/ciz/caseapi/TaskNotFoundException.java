package nl.ciz.caseapi;

import java.util.UUID;

public class TaskNotFoundException extends RuntimeException {
    public TaskNotFoundException(UUID taskId) {
        super("Task not found: " + taskId);
    }
}

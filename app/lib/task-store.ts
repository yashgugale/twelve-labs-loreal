export interface ProcessingTask {
  taskId: string;
  videoId?: string;
  filename: string;
  status: "processing" | "ready" | "failed";
  createdAt: string;
  error?: string;
}

// In-memory store for tracking indexing tasks
const tasks = new Map<string, ProcessingTask>();

export function addTask(task: ProcessingTask) {
  tasks.set(task.taskId, task);
}

export function getTask(taskId: string): ProcessingTask | undefined {
  return tasks.get(taskId);
}

export function updateTaskStatus(
  taskId: string,
  status: "ready" | "failed",
  error?: string
) {
  const task = tasks.get(taskId);
  if (task) {
    task.status = status;
    if (error) task.error = error;
  }
}

export function removeTask(taskId: string) {
  tasks.delete(taskId);
}

export function getAllProcessingTasks(): ProcessingTask[] {
  return Array.from(tasks.values()).filter((t) => t.status === "processing");
}

export function getAllTasks(): ProcessingTask[] {
  return Array.from(tasks.values());
}

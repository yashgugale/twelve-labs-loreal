import { NextResponse } from "next/server";
import { getAllTasks, removeTask } from "@/app/lib/task-store";

export async function GET() {
  const tasks = getAllTasks();

  // Immediately remove completed/failed tasks — the client will
  // refresh the video list when it sees a "ready" status
  for (const task of tasks) {
    if (task.status === "ready" || task.status === "failed") {
      removeTask(task.taskId);
    }
  }

  return NextResponse.json({ tasks });
}

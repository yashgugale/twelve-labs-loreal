import { NextResponse } from "next/server";
import { addTask } from "@/app/lib/task-store";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { taskId, videoId, filename } = body;

    if (!taskId || !filename) {
      return NextResponse.json(
        { error: "taskId and filename are required" },
        { status: 400 }
      );
    }

    addTask({
      taskId,
      videoId: videoId || undefined,
      filename,
      status: "processing",
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ registered: true });
  } catch (error) {
    console.error("Error registering task:", error);
    return NextResponse.json(
      { error: "Failed to register task" },
      { status: 500 }
    );
  }
}

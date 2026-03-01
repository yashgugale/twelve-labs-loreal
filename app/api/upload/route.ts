import { NextResponse } from "next/server";
import { addTask } from "@/app/lib/task-store";

const TWELVE_LABS_API_BASE = "https://api.twelvelabs.io/v1.3";
const INDEX_ID = "69a2edcae64ea62a9b356270";

export async function POST(request: Request) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "API_KEY not configured" },
      { status: 500 }
    );
  }

  try {
    const formData = await request.formData();
    const videoFile = formData.get("video_file") as File | null;

    if (!videoFile) {
      return NextResponse.json(
        { error: "No video file provided" },
        { status: 400 }
      );
    }

    // Build the form data to send to Twelve Labs
    const tlFormData = new FormData();
    tlFormData.append("index_id", INDEX_ID);
    tlFormData.append("video_file", videoFile);

    const res = await fetch(`${TWELVE_LABS_API_BASE}/tasks`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
      },
      body: tlFormData,
    });

    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json(
        { error: `Twelve Labs API error: ${errorText}` },
        { status: res.status }
      );
    }

    const data = await res.json();

    // Register task in the processing store
    addTask({
      taskId: data._id,
      videoId: data.video_id,
      filename: videoFile.name,
      status: "processing",
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error uploading video:", error);
    return NextResponse.json(
      { error: "Failed to upload video" },
      { status: 500 }
    );
  }
}

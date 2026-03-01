import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { updateTaskStatus, getTask, getAllTasks } from "@/app/lib/task-store";

const TWELVE_LABS_API_BASE = "https://api.twelvelabs.io/v1.3";
const INDEX_ID = "69a2edcae64ea62a9b356270";

interface WebhookPayload {
  id: string;
  created_at: string;
  type: "index.task.ready" | "index.task.failed";
  data: {
    id: string;
    metadata?: {
      duration?: number;
    };
    status: string;
    models?: Array<{
      name: string;
      options: string[];
    }>;
    tags?: string[];
  };
}

function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!signatureHeader) return false;

  // Parse "t=<timestamp>,v1=<signature>"
  const parts: Record<string, string> = {};
  for (const part of signatureHeader.split(",")) {
    const [key, ...valueParts] = part.split("=");
    parts[key.trim()] = valueParts.join("=").trim();
  }

  const timestamp = parts["t"];
  const receivedSig = parts["v1"];
  if (!timestamp || !receivedSig) return false;

  // Check timestamp is within 5 minutes
  const timeDiff = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
  if (timeDiff > 300) {
    console.warn(`[Webhook] Timestamp too old: ${timeDiff}s difference`);
    return false;
  }

  // Generate HMAC SHA-256: signed_payload = timestamp.body
  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedSig = createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");

  return expectedSig === receivedSig;
}

async function getVideoIdFromTask(taskId: string, apiKey: string): Promise<string | null> {
  // First check our in-memory store
  const storedTask = getTask(taskId);
  if (storedTask?.videoId) return storedTask.videoId;

  // Fall back to the Twelve Labs API
  try {
    const res = await fetch(`${TWELVE_LABS_API_BASE}/tasks/${taskId}`, {
      headers: { "x-api-key": apiKey },
    });
    if (res.ok) {
      const data = await res.json();
      return data.video_id || null;
    }
  } catch (err) {
    console.error(`[Webhook] Error fetching task ${taskId}:`, err);
  }
  return null;
}

const ANALYZE_PROMPT = `Analyze this beauty marketing video and extract structured metadata.
1. Identify the 'product_sku' (e.g., 'LIP-RED-001'). If multiple, list the primary one.
2. Categorize 'format' ONLY as: tutorial, product_demo, advertisement, before_after, or creator_collab.
3. Identify 'visual_attributes':
   - 'shot_type': close_up, packshot, or wide_shot.
   - 'activity': application, swatching, or stationary_display.
   - 'setting': studio, outdoor, or home_interior.
4. Extract 'on_screen_text' and 'spoken_mentions' verbatim.
5. For 'confidence_score', provide a decimal between 0.0 and 1.0 (e.g., 0.95) based on SKU clarity.
6. For 'provenance', briefly explain the evidence (e.g., 'SKU visible on box at 00:05').`;

const ANALYZE_JSON_SCHEMA = {
  type: "object",
  properties: {
    product_presence: {
      type: "object",
      properties: {
        sku: { type: "string" },
        product_line: { type: "string" },
        confidence_score: { type: "number" },
      },
      required: ["sku", "confidence_score"],
    },
    format: {
      type: "string",
      enum: [
        "tutorial",
        "product_demo",
        "advertisement",
        "before_after",
        "creator_collab",
      ],
    },
    visual_attributes: {
      type: "object",
      properties: {
        shot_type: {
          type: "string",
          enum: ["close_up", "medium_shot", "wide_shot", "packshot"],
        },
        activity: {
          type: "string",
          enum: ["application", "swatching", "unboxing", "stationary_display"],
        },
        setting: {
          type: "string",
          enum: ["studio", "outdoor", "home_interior"],
        },
      },
      required: ["shot_type", "activity"],
    },
    intelligence: {
      type: "object",
      properties: {
        on_screen_text: { type: "array", items: { type: "string" } },
        spoken_mentions: { type: "array", items: { type: "string" } },
      },
    },
    provenance: { type: "string" },
  },
  required: ["product_presence", "format", "visual_attributes"],
};

interface AnalysisResult {
  product_presence: {
    sku: string;
    product_line?: string;
    confidence_score: number;
  };
  format: string;
  visual_attributes: {
    shot_type: string;
    activity: string;
    setting?: string;
  };
  intelligence?: {
    on_screen_text?: string[];
    spoken_mentions?: string[];
  };
  provenance?: string;
}

async function analyzeVideo(
  videoId: string,
  apiKey: string
): Promise<AnalysisResult | null> {
  try {
    console.log(`[Webhook] Starting analysis for video ${videoId}`);

    const res = await fetch(`${TWELVE_LABS_API_BASE}/analyze`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        video_id: videoId,
        prompt: ANALYZE_PROMPT,
        temperature: 0.2,
        stream: false,
        response_format: {
          type: "json_schema",
          json_schema: ANALYZE_JSON_SCHEMA,
        },
        max_tokens: 4096,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(
        `[Webhook] Analyze API error for video ${videoId}: ${res.status} ${errText}`
      );
      return null;
    }

    const data = await res.json();
    // The response contains a "data" field with the generated text
    const text = data.data || data.text || "";
    console.log(`[Webhook] Analysis raw response for ${videoId}:`, text);

    // Parse the JSON from the response
    const parsed: AnalysisResult = typeof text === "string" ? JSON.parse(text) : text;
    return parsed;
  } catch (err) {
    console.error(`[Webhook] Error analyzing video ${videoId}:`, err);
    return null;
  }
}

async function updateVideoMetadata(
  videoId: string,
  apiKey: string,
  analysis: AnalysisResult
): Promise<boolean> {
  try {
    // Flatten analysis into user_metadata (values must be string/number/boolean)
    const userMetadata: Record<string, string | number | boolean> = {
      indexing_status: "Complete",
      analysis_status: "Complete",
      indexed_at: new Date().toISOString(),
      format: analysis.format,
      product_sku: analysis.product_presence.sku,
      confidence_score: analysis.product_presence.confidence_score,
      shot_type: analysis.visual_attributes.shot_type,
      activity: analysis.visual_attributes.activity,
    };

    if (analysis.product_presence.product_line) {
      userMetadata.product_line = analysis.product_presence.product_line;
    }
    if (analysis.visual_attributes.setting) {
      userMetadata.setting = analysis.visual_attributes.setting;
    }
    if (analysis.provenance) {
      userMetadata.provenance = analysis.provenance;
    }
    if (analysis.intelligence?.on_screen_text) {
      userMetadata.on_screen_text = JSON.stringify(
        analysis.intelligence.on_screen_text
      );
    }
    if (analysis.intelligence?.spoken_mentions) {
      userMetadata.spoken_mentions = JSON.stringify(
        analysis.intelligence.spoken_mentions
      );
    }

    const res = await fetch(
      `${TWELVE_LABS_API_BASE}/indexes/${INDEX_ID}/videos/${videoId}`,
      {
        method: "PATCH",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_metadata: userMetadata }),
      }
    );

    if (res.ok || res.status === 204) {
      console.log(
        `[Webhook] Updated video ${videoId} with analysis metadata`
      );
      return true;
    }

    const errText = await res.text();
    console.error(
      `[Webhook] Failed to update video ${videoId} metadata: ${res.status} ${errText}`
    );
    return false;
  } catch (err) {
    console.error(`[Webhook] Error updating video ${videoId} metadata:`, err);
    return false;
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.API_KEY;
  const webhookSecret = process.env.WEBHOOK_SECRET;

  try {
    // Read raw body for signature verification
    const rawBody = await request.text();
    const signatureHeader = request.headers.get("TL-Signature");

    // Verify webhook signature
    if (webhookSecret) {
      const isValid = verifySignature(rawBody, signatureHeader, webhookSecret);
      if (!isValid) {
        console.warn("[Webhook] Invalid signature — rejecting request");
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 }
        );
      }
      console.log("[Webhook] Signature verified successfully");
    }

    const payload: WebhookPayload = JSON.parse(rawBody);

    console.log(
      `[Webhook] Received event: ${payload.type} for task ${payload.data?.id}`
    );

    const taskId = payload.data?.id;
    if (!taskId) {
      return NextResponse.json(
        { error: "Missing task ID in payload" },
        { status: 400 }
      );
    }

    if (payload.type === "index.task.ready") {
      updateTaskStatus(taskId, "ready");
      console.log(`[Webhook] Task ${taskId} is now ready`);

      // Analyze the video and store results as metadata
      if (apiKey) {
        const videoId = await getVideoIdFromTask(taskId, apiKey);
        if (videoId) {
          const analysis = await analyzeVideo(videoId, apiKey);
          if (analysis) {
            await updateVideoMetadata(videoId, apiKey, analysis);
          } else {
            console.warn(
              `[Webhook] Analysis failed for video ${videoId}, setting basic metadata`
            );
            // Fall back to basic metadata if analysis fails
            await fetch(
              `${TWELVE_LABS_API_BASE}/indexes/${INDEX_ID}/videos/${videoId}`,
              {
                method: "PATCH",
                headers: {
                  "x-api-key": apiKey,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  user_metadata: {
                    indexing_status: "Complete",
                    analysis_status: "Failed",
                    indexed_at: new Date().toISOString(),
                  },
                }),
              }
            );
          }
        } else {
          console.warn(
            `[Webhook] Could not resolve video ID for task ${taskId}`
          );
        }
      }
    } else if (payload.type === "index.task.failed") {
      updateTaskStatus(taskId, "failed", "Indexing failed");
      console.log(`[Webhook] Task ${taskId} has failed`);
    } else {
      console.log(`[Webhook] Unknown event type: ${payload.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[Webhook] Error processing webhook:", error);
    return NextResponse.json(
      { error: "Failed to process webhook" },
      { status: 500 }
    );
  }
}

// GET endpoint to check all tasks (useful for debugging)
export async function GET() {
  return NextResponse.json({ tasks: getAllTasks() });
}

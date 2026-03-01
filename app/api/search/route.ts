import { NextResponse } from "next/server";

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
    const body = await request.json();
    const {
      query,
      format,
      shot_type,
      activity,
      setting,
      page_limit = 20,
    } = body;

    // Build filter object from user_metadata fields
    const filter: Record<string, string> = {};
    if (format) filter.format = format;
    if (shot_type) filter.shot_type = shot_type;
    if (activity) filter.activity = activity;
    if (setting) filter.setting = setting;

    const hasQuery = query && typeof query === "string" && query.trim().length > 0;
    const hasFilters = Object.keys(filter).length > 0;

    if (!hasQuery && !hasFilters) {
      return NextResponse.json(
        { error: "Provide a search query or at least one filter" },
        { status: 400 }
      );
    }

    // Build multipart form data for search
    // Use a broad fallback query when only filters are provided
    const formData = new FormData();
    formData.append("query_text", hasQuery ? query.trim() : "beauty video");
    formData.append("index_id", INDEX_ID);
    formData.append("search_options", "visual");
    formData.append("search_options", "audio");
    formData.append("group_by", "video");
    formData.append("page_limit", String(page_limit));
    formData.append("sort_option", "score");

    if (Object.keys(filter).length > 0) {
      formData.append("filter", JSON.stringify(filter));
    }

    const res = await fetch(`${TWELVE_LABS_API_BASE}/search`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
      },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: `Search API error: ${errText}` },
        { status: res.status }
      );
    }

    const data = await res.json();

    // Enrich results with video details (thumbnails, metadata)
    const videoIds = new Set<string>();
    for (const item of data.data || []) {
      if (item.video_id) videoIds.add(item.video_id);
      if (item.clips) {
        for (const clip of item.clips) {
          if (clip.video_id) videoIds.add(clip.video_id);
        }
      }
    }

    // Fetch video details for thumbnails and metadata
    const videoDetails: Record<string, unknown> = {};
    await Promise.all(
      Array.from(videoIds).map(async (videoId) => {
        try {
          const detailRes = await fetch(
            `${TWELVE_LABS_API_BASE}/indexes/${INDEX_ID}/videos/${videoId}`,
            { headers: { "x-api-key": apiKey } }
          );
          if (detailRes.ok) {
            videoDetails[videoId] = await detailRes.json();
          }
        } catch {
          // Skip failed fetches
        }
      })
    );

    return NextResponse.json({
      results: data.data || [],
      search_pool: data.search_pool,
      page_info: data.page_info,
      video_details: videoDetails,
    });
  } catch (error) {
    console.error("Error searching videos:", error);
    return NextResponse.json(
      { error: "Failed to search videos" },
      { status: 500 }
    );
  }
}

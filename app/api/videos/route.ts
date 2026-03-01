import { NextResponse } from "next/server";

const TWELVE_LABS_API_BASE = "https://api.twelvelabs.io/v1.3";
const INDEX_ID = "69a2edcae64ea62a9b356270";

export async function GET(request: Request) {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "API_KEY not configured" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const page = searchParams.get("page") || "1";
  const pageLimit = searchParams.get("page_limit") || "20";

  try {
    const url = `${TWELVE_LABS_API_BASE}/indexes/${INDEX_ID}/videos?page=${page}&page_limit=${pageLimit}`;
    const res = await fetch(url, {
      headers: {
        "x-api-key": apiKey,
      },
    });

    if (!res.ok) {
      const errorText = await res.text();
      return NextResponse.json(
        { error: `Twelve Labs API error: ${errorText}` },
        { status: res.status }
      );
    }

    const data = await res.json();

    // Fetch detailed info for each video
    const videoDetails = await Promise.all(
      data.data.map(async (video: { _id: string }) => {
        const detailRes = await fetch(
          `${TWELVE_LABS_API_BASE}/indexes/${INDEX_ID}/videos/${video._id}`,
          {
            headers: {
              "x-api-key": apiKey,
            },
          }
        );
        if (detailRes.ok) {
          return detailRes.json();
        }
        return video;
      })
    );

    return NextResponse.json({
      data: videoDetails,
      page_info: data.page_info,
    });
  } catch (error) {
    console.error("Error fetching videos:", error);
    return NextResponse.json(
      { error: "Failed to fetch videos" },
      { status: 500 }
    );
  }
}

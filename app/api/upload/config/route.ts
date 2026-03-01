import { NextResponse } from "next/server";

const TWELVE_LABS_API_BASE = "https://api.twelvelabs.io/v1.3";
const INDEX_ID = "69a2edcae64ea62a9b356270";

export async function GET() {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "API_KEY not configured" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    api_base: TWELVE_LABS_API_BASE,
    index_id: INDEX_ID,
    api_key: apiKey,
  });
}

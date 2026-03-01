"""
Backfill AI analysis metadata on indexed videos.

For each video that has indexing_status="Complete" but analysis_status
is NOT "Complete", this script will:
  1. Set analysis_status = "In progress"
  2. Call the Analyze API with the beauty marketing prompt
  3. Parse the structured JSON response
  4. Flatten and store the results as user_metadata on the video
  5. Set analysis_status = "Complete" (or "Failed" on error)

Usage:
    pip install requests python-dotenv
    python scripts/backfill_analysis.py

Options:
    --dry-run     Preview which videos would be analyzed without making changes
    --force       Re-analyze videos even if analysis_status is already Complete
    --video-id ID Analyze a single video by its ID
"""

import argparse
import json
import os
import sys
import time

import requests
from dotenv import load_dotenv

# Load .env from project root
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

API_KEY = os.getenv("API_KEY")
BASE_URL = "https://api.twelvelabs.io/v1.3"
INDEX_ID = "69a2edcae64ea62a9b356270"

if not API_KEY:
    print("ERROR: API_KEY not found in .env file")
    sys.exit(1)

HEADERS = {
    "x-api-key": API_KEY,
    "Content-Type": "application/json",
}

ANALYZE_PROMPT = """Analyze this beauty marketing video and extract structured metadata.
1. Identify the 'product_sku' (e.g., 'LIP-RED-001'). If multiple, list the primary one.
2. Categorize 'format' ONLY as: tutorial, product_demo, advertisement, before_after, or creator_collab.
3. Identify 'visual_attributes':
   - 'shot_type': close_up, packshot, or wide_shot.
   - 'activity': application, swatching, or stationary_display.
   - 'setting': studio, outdoor, or home_interior.
4. Extract 'on_screen_text' and 'spoken_mentions' verbatim.
5. For 'confidence_score', provide a decimal between 0.0 and 1.0 (e.g., 0.95) based on SKU clarity.
6. For 'provenance', briefly explain the evidence (e.g., 'SKU visible on box at 00:05')."""

ANALYZE_JSON_SCHEMA = {
    "type": "object",
    "properties": {
        "product_presence": {
            "type": "object",
            "properties": {
                "sku": {"type": "string"},
                "product_line": {"type": "string"},
                "confidence_score": {"type": "number"},
            },
            "required": ["sku", "confidence_score"],
        },
        "format": {
            "type": "string",
            "enum": [
                "tutorial",
                "product_demo",
                "advertisement",
                "before_after",
                "creator_collab",
            ],
        },
        "visual_attributes": {
            "type": "object",
            "properties": {
                "shot_type": {
                    "type": "string",
                    "enum": ["close_up", "medium_shot", "wide_shot", "packshot"],
                },
                "activity": {
                    "type": "string",
                    "enum": [
                        "application",
                        "swatching",
                        "unboxing",
                        "stationary_display",
                    ],
                },
                "setting": {
                    "type": "string",
                    "enum": ["studio", "outdoor", "home_interior"],
                },
            },
            "required": ["shot_type", "activity"],
        },
        "intelligence": {
            "type": "object",
            "properties": {
                "on_screen_text": {"type": "array", "items": {"type": "string"}},
                "spoken_mentions": {"type": "array", "items": {"type": "string"}},
            },
        },
        "provenance": {"type": "string"},
    },
    "required": ["product_presence", "format", "visual_attributes"],
}


def list_all_videos():
    """Fetch all videos from the index, paginating through all pages."""
    videos = []
    page = 1
    while True:
        url = f"{BASE_URL}/indexes/{INDEX_ID}/videos?page={page}&page_limit=50"
        resp = requests.get(url, headers=HEADERS)
        resp.raise_for_status()
        data = resp.json()
        videos.extend(data.get("data", []))
        page_info = data.get("page_info", {})
        if page >= page_info.get("total_page", 1):
            break
        page += 1
    return videos


def get_video_detail(video_id: str) -> dict:
    """Fetch full detail for a single video (includes user_metadata)."""
    url = f"{BASE_URL}/indexes/{INDEX_ID}/videos/{video_id}"
    resp = requests.get(url, headers=HEADERS)
    resp.raise_for_status()
    return resp.json()


def update_video_metadata(video_id: str, metadata: dict) -> bool:
    """PATCH user_metadata on a video."""
    url = f"{BASE_URL}/indexes/{INDEX_ID}/videos/{video_id}"
    resp = requests.patch(url, headers=HEADERS, json={"user_metadata": metadata})
    if resp.status_code in (200, 204):
        return True
    print(f"  WARN: PATCH {video_id} returned {resp.status_code}: {resp.text}")
    return False


def analyze_video(video_id: str) -> dict | None:
    """Call the Analyze API and return parsed structured result."""
    url = f"{BASE_URL}/analyze"
    payload = {
        "video_id": video_id,
        "prompt": ANALYZE_PROMPT,
        "temperature": 0.2,
        "stream": False,
        "response_format": {
            "type": "json_schema",
            "json_schema": ANALYZE_JSON_SCHEMA,
        },
        "max_tokens": 4096,
    }

    resp = requests.post(url, headers=HEADERS, json=payload)
    if not resp.ok:
        print(f"  ERROR: Analyze API returned {resp.status_code}: {resp.text}")
        return None

    data = resp.json()
    text = data.get("data") or data.get("text") or ""

    if isinstance(text, str):
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            print(f"  ERROR: Failed to parse analysis JSON: {e}")
            print(f"  Raw response: {text[:500]}")
            return None
    elif isinstance(text, dict):
        return text
    else:
        print(f"  ERROR: Unexpected response type: {type(text)}")
        return None


def flatten_analysis(analysis: dict) -> dict:
    """Flatten the nested analysis result into a flat user_metadata dict."""
    meta = {
        "analysis_status": "Complete",
        "format": analysis.get("format", ""),
        "product_sku": analysis.get("product_presence", {}).get("sku", ""),
        "confidence_score": analysis.get("product_presence", {}).get(
            "confidence_score", 0
        ),
        "shot_type": analysis.get("visual_attributes", {}).get("shot_type", ""),
        "activity": analysis.get("visual_attributes", {}).get("activity", ""),
    }

    product_line = analysis.get("product_presence", {}).get("product_line")
    if product_line:
        meta["product_line"] = product_line

    setting = analysis.get("visual_attributes", {}).get("setting")
    if setting:
        meta["setting"] = setting

    provenance = analysis.get("provenance")
    if provenance:
        meta["provenance"] = provenance

    on_screen_text = analysis.get("intelligence", {}).get("on_screen_text")
    if on_screen_text:
        meta["on_screen_text"] = json.dumps(on_screen_text)

    spoken_mentions = analysis.get("intelligence", {}).get("spoken_mentions")
    if spoken_mentions:
        meta["spoken_mentions"] = json.dumps(spoken_mentions)

    return meta


def process_video(video_id: str, filename: str, dry_run: bool = False) -> bool:
    """Analyze a single video and update its metadata. Returns True on success."""
    if dry_run:
        print(f"  [DRY RUN] Would analyze {filename} (id={video_id})")
        return True

    # Mark analysis as in progress
    update_video_metadata(video_id, {"analysis_status": "In progress"})
    print("  Analyzing...")

    analysis = analyze_video(video_id)
    if not analysis:
        update_video_metadata(video_id, {"analysis_status": "Failed"})
        print("  ✗ Analysis failed")
        return False

    # Flatten and store
    flat_meta = flatten_analysis(analysis)
    success = update_video_metadata(video_id, flat_meta)
    if success:
        print(
            f"  ✓ Analysis complete — format={flat_meta.get('format')}, "
            f"sku={flat_meta.get('product_sku')}, "
            f"confidence={flat_meta.get('confidence_score')}"
        )
        return True
    else:
        update_video_metadata(video_id, {"analysis_status": "Failed"})
        print("  ✗ Failed to save analysis metadata")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Backfill AI analysis metadata on indexed videos"
    )
    parser.add_argument(
        "--dry-run", action="store_true", help="Preview without making changes"
    )
    parser.add_argument(
        "--force", action="store_true", help="Re-analyze even if already complete"
    )
    parser.add_argument("--video-id", type=str, help="Analyze a single video by ID")
    args = parser.parse_args()

    if args.video_id:
        print(f"Fetching video {args.video_id}...")
        detail = get_video_detail(args.video_id)
        filename = detail.get("system_metadata", {}).get("filename", args.video_id)
        print(f"Processing: {filename}")
        process_video(args.video_id, filename, dry_run=args.dry_run)
        return

    print(f"Fetching all videos from index {INDEX_ID}...")
    videos = list_all_videos()
    print(f"Found {len(videos)} videos.\n")

    analyzed = 0
    skipped = 0
    failed = 0

    for i, v in enumerate(videos):
        video_id = v["_id"]
        filename = v.get("system_metadata", {}).get("filename", video_id)

        # Fetch detail for user_metadata
        detail = get_video_detail(video_id)
        user_meta = detail.get("user_metadata") or {}

        current_analysis = user_meta.get("analysis_status")
        current_indexing = user_meta.get("indexing_status")

        # Skip if not indexed
        if current_indexing not in ("Complete", "Indexing complete"):
            print(
                f"[{i + 1}/{len(videos)}] SKIP  {filename} — indexing_status={current_indexing or 'None'}"
            )
            skipped += 1
            continue

        # Skip if already analyzed (unless --force)
        if current_analysis in ("Complete", "complete") and not args.force:
            print(
                f"[{i + 1}/{len(videos)}] SKIP  {filename} — analysis already complete"
            )
            skipped += 1
            continue

        print(f"[{i + 1}/{len(videos)}] ANALYZE {filename} (id={video_id})")
        success = process_video(video_id, filename, dry_run=args.dry_run)
        if success:
            analyzed += 1
        else:
            failed += 1

        # Rate limiting: small delay between API calls
        if not args.dry_run and i < len(videos) - 1:
            time.sleep(2)

    print(
        f"\nDone. Analyzed: {analyzed}, Skipped: {skipped}, Failed: {failed}, Total: {len(videos)}"
    )


if __name__ == "__main__":
    main()

"""
Backfill indexing_status on already-indexed videos.

Sets indexing_status = "Complete" and analysis_status = "Not started"
for all videos in the index that don't yet have an indexing_status field.

Usage:
    pip install requests python-dotenv
    python scripts/backfill_indexing_status.py
"""

import os
import sys

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


def main():
    print(f"Fetching all videos from index {INDEX_ID}...")
    videos = list_all_videos()
    print(f"Found {len(videos)} videos.\n")

    updated = 0
    skipped = 0

    for v in videos:
        video_id = v["_id"]
        filename = v.get("system_metadata", {}).get("filename", v.get("_id"))

        # Fetch detail to check existing user_metadata
        detail = get_video_detail(video_id)
        user_meta = detail.get("user_metadata") or {}

        current_indexing = user_meta.get("indexing_status")
        if current_indexing in ("Complete"):
            print(f"SKIP  {filename} — already has indexing_status={current_indexing}")
            skipped += 1
            continue

        # Set indexing as Complete, analysis as Not started (will be backfilled separately)
        new_meta = {
            "indexing_status": "Complete",
            "indexed_at": detail.get("created_at", ""),
        }

        # Only set analysis_status if it doesn't already exist
        if not user_meta.get("analysis_status"):
            new_meta["analysis_status"] = "Not started"

        print("UPDATE {} (id={})...".format(filename, video_id))
        success = update_video_metadata(video_id, new_meta)
        if success:
            print("  \u2713 Set indexing_status=Complete")
            updated += 1
        else:
            print("  \u2717 Failed to update")

    print(
        "\nDone. Updated: {}, Skipped: {}, Total: {}".format(
            updated, skipped, len(videos)
        )
    )


if __name__ == "__main__":
    main()

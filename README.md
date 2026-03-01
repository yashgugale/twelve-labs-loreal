# L'Oréal Video Intelligence Platform

L'Oréal Video Intelligence Platform.

## Running the Application

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## API Documentation

This application provides a set of API routes that proxy requests to the **Twelve Labs Video Understanding API (v1.3)**. All routes are located under `/api/` and handle authentication server-side using the `API_KEY` environment variable.

**Base Configuration:**
- Twelve Labs API Base: `https://api.twelvelabs.io/v1.3`
- Index ID: `69a2edcae64ea62a9b356270`

---

## 1. List Videos

**`GET /api/videos`**

Fetches all videos from the index with full detail (system metadata, HLS URLs, user metadata).

### Query Parameters

| Parameter    | Type   | Default | Description                  |
|-------------|--------|---------|------------------------------|
| `page`       | string | `"1"`   | Page number                  |
| `page_limit` | string | `"20"`  | Number of videos per page    |

### Request

```
GET /api/videos?page=1&page_limit=20
```

### Response — `200 OK`

```json
{
  "data": [
    {
      "_id": "69a48283e64ea62a9b35b4b4",
      "created_at": "2026-03-01T18:16:35Z",
      "updated_at": "2026-03-01T18:22:10Z",
      "indexed_at": "2026-03-01T18:22:10Z",
      "system_metadata": {
        "filename": "creators_10.webm",
        "duration": 245.12,
        "fps": 30,
        "width": 3840,
        "height": 2160,
        "size": 395698176
      },
      "user_metadata": {
        "indexing_status": "Complete",
        "analysis_status": "Complete",
        "indexed_at": "2026-03-01T18:22:15.000Z",
        "format": "product_demo",
        "product_sku": "AIR-VOLUME-MASCARA",
        "product_line": "Air Volume Mega Mascara",
        "confidence_score": 0.98,
        "shot_type": "close_up",
        "activity": "application",
        "setting": "studio",
        "provenance": "SKU visible on product packaging at 00:05...",
        "on_screen_text": "[\"beauty road test\",\"AIR VOLUME MASCARA\"]",
        "spoken_mentions": "[\"I really love the volume\",\"L'Oreal Paris Air Volume\"]"
      },
      "hls": {
        "video_url": "https://deuqpmn4rs7j5.cloudfront.net/.../master.m3u8",
        "thumbnail_urls": [
          "https://deuqpmn4rs7j5.cloudfront.net/.../representative_thumbnail.jpeg"
        ],
        "status": "complete"
      }
    }
  ],
  "page_info": {
    "limit_per_page": 20,
    "page": 1,
    "total_page": 3,
    "total_results": 48
  }
}
```

### Error Responses

| Status | Body |
|--------|------|
| `500`  | `{ "error": "API_KEY not configured" }` |
| `500`  | `{ "error": "Failed to fetch videos" }` |
| `4xx`  | `{ "error": "Twelve Labs API error: <detail>" }` |

---

## 2. Upload Video

**`POST /api/upload`**

Uploads a video file to the Twelve Labs index for indexing. Registers the task in an in-memory store for processing status tracking.

### Request

- **Content-Type:** `multipart/form-data`

| Field        | Type | Required | Description          |
|-------------|------|----------|----------------------|
| `video_file` | File | Yes      | The video file to upload (max 2GB) |

```
POST /api/upload
Content-Type: multipart/form-data

--boundary
Content-Disposition: form-data; name="video_file"; filename="demo.mp4"
Content-Type: video/mp4

<binary data>
--boundary--
```

### Response — `200 OK`

```json
{
  "_id": "69a482a37f90675e73cec9a6",
  "video_id": "69a48283e64ea62a9b35b4b4",
  "status": "pending"
}
```

The `_id` is the **task ID** used for tracking indexing progress.

### Error Responses

| Status | Body |
|--------|------|
| `400`  | `{ "error": "No video file provided" }` |
| `500`  | `{ "error": "API_KEY not configured" }` |
| `500`  | `{ "error": "Failed to upload video" }` |
| `4xx`  | `{ "error": "Twelve Labs API error: <detail>" }` |

---

## 3. Search Videos

**`POST /api/search`**

Performs semantic search across all indexed videos using text queries and/or metadata filters. Proxies to the Twelve Labs Search API and enriches results with video details.

### Request

- **Content-Type:** `application/json`

| Field       | Type   | Required | Description |
|------------|--------|----------|-------------|
| `query`     | string | No*      | Natural language search query |
| `format`    | string | No       | Filter: `tutorial`, `product_demo`, `advertisement`, `before_after`, `creator_collab` |
| `shot_type` | string | No       | Filter: `close_up`, `medium_shot`, `wide_shot`, `packshot` |
| `activity`  | string | No       | Filter: `application`, `swatching`, `unboxing`, `stationary_display` |
| `setting`   | string | No       | Filter: `studio`, `outdoor`, `home_interior` |
| `page_limit`| number | No       | Results per page (default: `20`, max: `50`) |

*At least one of `query` or a filter must be provided.

```json
POST /api/search
Content-Type: application/json

{
  "query": "mascara application tutorial",
  "format": "product_demo",
  "shot_type": "close_up",
  "page_limit": 10
}
```

### Filter-Only Request (no text query)

```json
{
  "format": "advertisement",
  "setting": "studio"
}
```

### Response — `200 OK`

```json
{
  "results": [
    {
      "video_id": "69a48283e64ea62a9b35b4b4",
      "clips": [
        {
          "start": 0.0,
          "end": 9.375,
          "video_id": "69a48283e64ea62a9b35b4b4",
          "confidence": "high",
          "score": 87.52,
          "thumbnail_url": "https://..."
        },
        {
          "start": 207.5,
          "end": 214.0625,
          "video_id": "69a48283e64ea62a9b35b4b4",
          "confidence": "high",
          "score": 85.1
        }
      ]
    }
  ],
  "search_pool": {
    "total_count": 10,
    "total_duration": 8731,
    "index_id": "69a2edcae64ea62a9b356270"
  },
  "page_info": {
    "limit_per_page": 10,
    "page_expired_at": "2026-03-01T19:00:00Z",
    "next_page_token": "abc123",
    "total_results": 3
  },
  "video_details": {
    "69a48283e64ea62a9b35b4b4": {
      "_id": "69a48283e64ea62a9b35b4b4",
      "system_metadata": {
        "filename": "creators_10.webm",
        "duration": 245.12,
        "width": 3840,
        "height": 2160,
        "fps": 30,
        "size": 395698176
      },
      "user_metadata": {
        "indexing_status": "Complete",
        "analysis_status": "Complete",
        "format": "product_demo",
        "product_sku": "AIR-VOLUME-MASCARA",
        "shot_type": "close_up",
        "activity": "application",
        "setting": "studio",
        "confidence_score": 0.98
      },
      "hls": {
        "video_url": "https://...master.m3u8",
        "thumbnail_urls": ["https://...thumbnail.jpeg"]
      }
    }
  }
}
```

### Error Responses

| Status | Body |
|--------|------|
| `400`  | `{ "error": "Provide a search query or at least one filter" }` |
| `500`  | `{ "error": "API_KEY not configured" }` |
| `500`  | `{ "error": "Failed to search videos" }` |
| `4xx`  | `{ "error": "Search API error: <detail>" }` |

---

## 4. Processing Tasks

**`GET /api/tasks`**

Returns all in-flight video processing tasks from the in-memory store. Ready/failed tasks are returned once then immediately removed from the store.

### Request

```
GET /api/tasks
```

### Response — `200 OK`

```json
{
  "tasks": [
    {
      "taskId": "69a482a37f90675e73cec9a6",
      "videoId": "69a48283e64ea62a9b35b4b4",
      "filename": "creators_10.webm",
      "status": "processing",
      "createdAt": "2026-03-01T18:17:00.000Z"
    },
    {
      "taskId": "69a482b07f90675e73cec9a7",
      "filename": "demo.mp4",
      "status": "ready",
      "createdAt": "2026-03-01T18:10:00.000Z"
    }
  ]
}
```

### Task Status Values

| Status       | Description |
|-------------|-------------|
| `processing` | Video is being indexed by Twelve Labs |
| `ready`      | Indexing complete (task removed after first poll) |
| `failed`     | Indexing failed (task removed after first poll) |

---

## 5. Webhook — Twelve Labs Indexing Events

**`POST /api/webhooks/twelve-labs`**

Receives webhook notifications from Twelve Labs when video indexing completes or fails. On success, it triggers the Analyze API to extract structured metadata and stores it on the video.

### Headers

| Header         | Description |
|---------------|-------------|
| `TL-Signature` | HMAC SHA-256 signature: `t=<timestamp>,v1=<hex_signature>` |

### Signature Verification

The signature is verified using the `WEBHOOK_SECRET` environment variable:
1. Parse `t` (timestamp) and `v1` (signature) from the header
2. Check timestamp is within 5 minutes of current time
3. Compute HMAC-SHA256 of `<timestamp>.<raw_body>` using the secret
4. Compare with the received signature

### Request — `index.task.ready`

```json
{
  "id": "evt_abc123",
  "created_at": "2026-03-01T18:22:00Z",
  "type": "index.task.ready",
  "data": {
    "id": "69a482a37f90675e73cec9a6",
    "status": "ready",
    "metadata": {
      "duration": 245.12
    }
  }
}
```

### Request — `index.task.failed`

```json
{
  "id": "evt_def456",
  "created_at": "2026-03-01T18:22:00Z",
  "type": "index.task.failed",
  "data": {
    "id": "69a482a37f90675e73cec9a6",
    "status": "failed"
  }
}
```

### Response — `200 OK`

```json
{
  "received": true
}
```

### Post-Processing Flow (on `index.task.ready`)

1. Resolve `video_id` from task (in-memory store → Twelve Labs `GET /tasks/:id`)
2. Call **Analyze API** (`POST /v1.3/analyze`) with structured beauty marketing prompt
3. Parse structured JSON response
4. Flatten and store as `user_metadata` via `PATCH /v1.3/indexes/:id/videos/:vid`

### Error Responses

| Status | Body |
|--------|------|
| `401`  | `{ "error": "Invalid signature" }` |
| `400`  | `{ "error": "Missing task ID in payload" }` |
| `500`  | `{ "error": "Failed to process webhook" }` |

---

## 6. Webhook — Debug Endpoint

**`GET /api/webhooks/twelve-labs`**

Returns all tasks from the in-memory store (for debugging purposes).

### Response — `200 OK`

```json
{
  "tasks": [
    {
      "taskId": "69a482a37f90675e73cec9a6",
      "videoId": "69a48283e64ea62a9b35b4b4",
      "filename": "creators_10.webm",
      "status": "ready",
      "createdAt": "2026-03-01T18:17:00.000Z"
    }
  ]
}
```

---

## Twelve Labs APIs Used (Upstream)

The application proxies or calls the following Twelve Labs API endpoints:

| Method | Endpoint | Used By | Purpose |
|--------|----------|---------|---------|
| `GET`  | `/v1.3/indexes/:index_id/videos` | `/api/videos` | List videos in index |
| `GET`  | `/v1.3/indexes/:index_id/videos/:video_id` | `/api/videos`, `/api/search` | Get video detail |
| `POST` | `/v1.3/tasks` | `/api/upload` | Create indexing task (upload video) |
| `GET`  | `/v1.3/tasks/:task_id` | Webhook | Resolve video_id from task |
| `POST` | `/v1.3/search` | `/api/search` | Semantic search with filters |
| `POST` | `/v1.3/analyze` | Webhook | AI analysis of video content |
| `PATCH`| `/v1.3/indexes/:index_id/videos/:video_id` | Webhook | Update video user_metadata |

---

## Analyze API — Request & Response

### Request (called by webhook after indexing)

```
POST https://api.twelvelabs.io/v1.3/analyze
x-api-key: <API_KEY>
Content-Type: application/json
```

```json
{
  "video_id": "69a48283e64ea62a9b35b4b4",
  "prompt": "Analyze this beauty marketing video and extract structured metadata...",
  "temperature": 0.2,
  "stream": false,
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "type": "object",
      "properties": {
        "product_presence": {
          "type": "object",
          "properties": {
            "sku": { "type": "string" },
            "product_line": { "type": "string" },
            "confidence_score": { "type": "number" }
          },
          "required": ["sku", "confidence_score"]
        },
        "format": {
          "type": "string",
          "enum": ["tutorial", "product_demo", "advertisement", "before_after", "creator_collab"]
        },
        "visual_attributes": {
          "type": "object",
          "properties": {
            "shot_type": { "type": "string", "enum": ["close_up", "medium_shot", "wide_shot", "packshot"] },
            "activity": { "type": "string", "enum": ["application", "swatching", "unboxing", "stationary_display"] },
            "setting": { "type": "string", "enum": ["studio", "outdoor", "home_interior"] }
          },
          "required": ["shot_type", "activity"]
        },
        "intelligence": {
          "type": "object",
          "properties": {
            "on_screen_text": { "type": "array", "items": { "type": "string" } },
            "spoken_mentions": { "type": "array", "items": { "type": "string" } }
          }
        },
        "provenance": { "type": "string" }
      },
      "required": ["product_presence", "format", "visual_attributes"]
    }
  },
  "max_tokens": 4096
}
```

### Response — `200 OK`

```json
{
  "data": "{\"product_presence\":{\"sku\":\"AIR-VOLUME-MASCARA\",\"product_line\":\"Air Volume Mega Mascara\",\"confidence_score\":0.98},\"format\":\"product_demo\",\"visual_attributes\":{\"shot_type\":\"close_up\",\"activity\":\"application\",\"setting\":\"studio\"},\"intelligence\":{\"on_screen_text\":[\"beauty road test\",\"AIR VOLUME MASCARA\"],\"spoken_mentions\":[\"I really love the volume that this mascara gave me\",\"L'Oreal Paris Air Volume Mega Mascara\"]},\"provenance\":\"The product SKU is confirmed through repeated on-screen text and verbal mentions...\"}"
}
```

The `data` field contains a JSON string that is parsed into the structured analysis result.

---

## Video `user_metadata` Schema

After the webhook processes a video, the following flat fields are stored as `user_metadata`:

| Field               | Type    | Values / Description |
|--------------------|---------|----------------------|
| `indexing_status`   | string  | `Not started`, `In progress`, `Complete`, `Failed` |
| `analysis_status`   | string  | `Not started`, `In progress`, `Complete`, `Failed` |
| `indexed_at`        | string  | ISO 8601 timestamp |
| `format`            | string  | `tutorial`, `product_demo`, `advertisement`, `before_after`, `creator_collab` |
| `product_sku`       | string  | e.g. `AIR-VOLUME-MASCARA` |
| `product_line`      | string  | e.g. `Air Volume Mega Mascara` |
| `confidence_score`  | number  | `0.0` – `1.0` |
| `shot_type`         | string  | `close_up`, `medium_shot`, `wide_shot`, `packshot` |
| `activity`          | string  | `application`, `swatching`, `unboxing`, `stationary_display` |
| `setting`           | string  | `studio`, `outdoor`, `home_interior` |
| `provenance`        | string  | Evidence description |
| `on_screen_text`    | string  | JSON-stringified array of strings |
| `spoken_mentions`   | string  | JSON-stringified array of strings |

---

## Environment Variables

| Variable         | Description |
|-----------------|-------------|
| `API_KEY`        | Twelve Labs API key (`tlk_...`) |
| `WEBHOOK_SECRET` | Twelve Labs webhook signing secret (`whs_...`) |

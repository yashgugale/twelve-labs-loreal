"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Hls from "hls.js";
import Header from "../components/Header";
import {
  Search,
  Filter,
  Film,
  Loader2,
  AlertCircle,
  Clock,
  Monitor,
  HardDrive,
  X,
  Play,
  Tag,
  Eye,
  MessageSquare,
  ShieldCheck,
  Info,
  CheckCircle2,
  Calendar,
  Hash,
  Gauge,
  FileVideo,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface VideoDetail {
  _id: string;
  system_metadata?: {
    filename?: string;
    duration?: number;
    width?: number;
    height?: number;
    fps?: number;
    size?: number;
  };
  user_metadata?: Record<string, string | number | boolean>;
  hls?: {
    video_url?: string;
    thumbnail_urls?: string[];
    status?: string;
  };
  created_at?: string;
}

interface SearchClip {
  start: number;
  end: number;
  video_id: string;
  confidence: string;
  score: number;
  thumbnail_url?: string;
  transcription?: string;
}

interface SearchResult {
  video_id?: string;
  clips?: SearchClip[];
  // flat clip fields (when group_by=clip)
  start?: number;
  end?: number;
  confidence?: string;
  score?: number;
  thumbnail_url?: string;
}

const FORMAT_OPTIONS = [
  { value: "", label: "All Formats" },
  { value: "tutorial", label: "Tutorial" },
  { value: "product_demo", label: "Product Demo" },
  { value: "advertisement", label: "Advertisement" },
  { value: "before_after", label: "Before & After" },
  { value: "creator_collab", label: "Creator Collab" },
];

const SHOT_TYPE_OPTIONS = [
  { value: "", label: "All Shot Types" },
  { value: "close_up", label: "Close Up" },
  { value: "medium_shot", label: "Medium Shot" },
  { value: "wide_shot", label: "Wide Shot" },
  { value: "packshot", label: "Packshot" },
];

const ACTIVITY_OPTIONS = [
  { value: "", label: "All Activities" },
  { value: "application", label: "Application" },
  { value: "swatching", label: "Swatching" },
  { value: "unboxing", label: "Unboxing" },
  { value: "stationary_display", label: "Stationary Display" },
];

const SETTING_OPTIONS = [
  { value: "", label: "All Settings" },
  { value: "studio", label: "Studio" },
  { value: "outdoor", label: "Outdoor" },
  { value: "home_interior", label: "Home Interior" },
];

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "N/A";
  return formatTime(seconds);
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return "N/A";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLabel(value: string | number | boolean): string {
  const str = String(value);
  return str
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState("");
  const [shotType, setShotType] = useState("");
  const [activity, setActivity] = useState("");
  const [setting, setSetting] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [videoDetails, setVideoDetails] = useState<
    Record<string, VideoDetail>
  >({});
  const [allVideos, setAllVideos] = useState<VideoDetail[]>([]);
  const [allVideosLoading, setAllVideosLoading] = useState(true);
  const [allVideosPage, setAllVideosPage] = useState(1);
  const [allVideosTotalPages, setAllVideosTotalPages] = useState(1);
  const [allVideosTotalResults, setAllVideosTotalResults] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<VideoDetail | null>(null);
  const [selectedClipStart, setSelectedClipStart] = useState<number | null>(
    null
  );
  const [selectedClips, setSelectedClips] = useState<SearchClip[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  // Fetch all videos with pagination
  const fetchAllVideos = useCallback(async (page: number) => {
    setAllVideosLoading(true);
    try {
      const res = await fetch(`/api/videos?page=${page}&page_limit=20`);
      if (res.ok) {
        const data = await res.json();
        setAllVideos(data.data || []);
        const pageInfo = data.page_info;
        if (pageInfo) {
          setAllVideosTotalPages(pageInfo.total_page || 1);
          setAllVideosTotalResults(pageInfo.total_results || 0);
        }
      }
    } catch {
      // Silently fail — search still works
    } finally {
      setAllVideosLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllVideos(allVideosPage);
  }, [fetchAllVideos, allVideosPage]);

  const handleSearch = useCallback(async () => {
    const hasQuery = query.trim().length > 0;
    const hasFilters = [format, shotType, activity, setting].some(Boolean);
    if (!hasQuery && !hasFilters) return;

    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          format: format || undefined,
          shot_type: shotType || undefined,
          activity: activity || undefined,
          setting: setting || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Search failed");
      }

      const data = await res.json();
      setResults(data.results || []);
      setVideoDetails(data.video_details || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }, [query, format, shotType, activity, setting]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  // HLS player setup
  useEffect(() => {
    if (!selectedVideo || !videoRef.current) return;

    const videoUrl = selectedVideo.hls?.video_url;
    if (!videoUrl) return;

    const video = videoRef.current;

    if (Hls.isSupported()) {
      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(videoUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (selectedClipStart !== null) {
          video.currentTime = selectedClipStart;
        }
        video.play().catch(() => {});
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = videoUrl;
      video.addEventListener("loadedmetadata", () => {
        if (selectedClipStart !== null) {
          video.currentTime = selectedClipStart;
        }
        video.play().catch(() => {});
      });
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [selectedVideo, selectedClipStart]);

  const closeModal = () => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    setSelectedVideo(null);
    setSelectedClipStart(null);
    setSelectedClips([]);
  };

  const openVideo = (videoId: string, clipStart?: number, clips?: SearchClip[]) => {
    const detail = videoDetails[videoId];
    if (detail) {
      setSelectedVideo(detail);
      setSelectedClipStart(clipStart ?? null);
      setSelectedClips(clips || []);
    }
  };

  const openVideoFromDetail = (video: VideoDetail) => {
    setSelectedVideo(video);
    setSelectedClipStart(null);
    setSelectedClips([]);
  };

  const seekToClip = (start: number) => {
    setSelectedClipStart(start);
    if (videoRef.current) {
      videoRef.current.currentTime = start;
      videoRef.current.play().catch(() => {});
    }
  };

  const handleReset = () => {
    setQuery("");
    setFormat("");
    setShotType("");
    setActivity("");
    setSetting("");
    setResults([]);
    setVideoDetails({});
    setHasSearched(false);
    setError(null);
  };

  const activeFilters = [format, shotType, activity, setting].filter(Boolean);
  const hasAnyInput = query.trim() || activeFilters.length > 0 || hasSearched;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Header />

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Search Bar */}
        <section className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Search & Filter
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            Semantic search across your video library with AI-powered metadata
            filters
          </p>

          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search videos... e.g. 'mascara application tutorial'"
                className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={handleSearch}
              disabled={loading || (!query.trim() && ![format, shotType, activity, setting].some(Boolean))}
              className="px-6 py-3 bg-purple-600 text-white text-sm font-medium rounded-xl hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Search
            </button>
            {hasAnyInput && (
              <button
                onClick={handleReset}
                className="px-4 py-3 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors flex items-center gap-2"
              >
                <X className="w-4 h-4" />
                Reset
              </button>
            )}
          </div>
        </section>

        {/* Filters */}
        <section className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-700">
              Filter by Analysis Metadata
            </h2>
            {activeFilters.length > 0 && (
              <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                {activeFilters.length} active
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {FORMAT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <select
              value={shotType}
              onChange={(e) => setShotType(e.target.value)}
              className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {SHOT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <select
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {ACTIVITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <select
              value={setting}
              onChange={(e) => setSetting(e.target.value)}
              className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {SETTING_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </section>

        {/* Results */}
        <section>
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-purple-500 animate-spin mb-3" />
              <p className="text-sm text-gray-500">Searching videos...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20">
              <AlertCircle className="w-8 h-8 text-red-400 mb-3" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : !hasSearched ? (
            /* Default: show all videos */
            <div>
              <p className="text-sm text-gray-500 mb-4">
                {allVideosLoading
                  ? "Loading videos..."
                  : `${allVideosTotalResults} video${allVideosTotalResults !== 1 ? "s" : ""} in library`}
              </p>

              {allVideosLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-6 h-6 text-purple-500 animate-spin" />
                </div>
              ) : allVideos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                  <Film className="w-12 h-12 mb-3" />
                  <p className="text-sm">No videos in your library yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {allVideos.map((video) => {
                    const meta = video.system_metadata;
                    const userMeta = video.user_metadata;
                    const thumbnailUrl = video.hls?.thumbnail_urls?.[0];

                    return (
                      <div
                        key={video._id}
                        className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                      >
                        <div className="flex flex-col md:flex-row">
                          {/* Thumbnail */}
                          <div
                            className="relative w-full md:w-72 h-44 bg-gray-900 flex-shrink-0 cursor-pointer group overflow-hidden"
                            onClick={() => openVideoFromDetail(video)}
                          >
                            {thumbnailUrl ? (
                              <img
                                src={thumbnailUrl}
                                alt={meta?.filename || "Video"}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center min-h-[160px]">
                                <Film className="w-10 h-10 text-gray-600" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                              <Play className="w-10 h-10 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                            </div>
                            {meta?.duration && (
                              <span className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/75 text-white text-xs rounded font-mono">
                                {formatDuration(meta.duration)}
                              </span>
                            )}
                          </div>

                          {/* Details */}
                          <div className="flex-1 p-5">
                            <h3
                              className="text-base font-semibold text-gray-900 truncate cursor-pointer hover:text-purple-600 mb-3"
                              onClick={() => openVideoFromDetail(video)}
                            >
                              {meta?.filename || `Video ${video._id.slice(-8)}`}
                            </h3>

                            {/* Metadata tags */}
                            {userMeta && ["Complete", "complete"].includes(String(userMeta.analysis_status)) && (
                              <div className="flex flex-wrap gap-1.5 mb-3">
                                {userMeta.format && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 text-xs font-medium rounded-full">
                                    <Tag className="w-3 h-3" />
                                    {formatLabel(userMeta.format)}
                                  </span>
                                )}
                                {userMeta.shot_type && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
                                    <Eye className="w-3 h-3" />
                                    {formatLabel(userMeta.shot_type)}
                                  </span>
                                )}
                                {userMeta.activity && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 text-xs font-medium rounded-full">
                                    {formatLabel(userMeta.activity)}
                                  </span>
                                )}
                                {userMeta.setting && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-xs font-medium rounded-full">
                                    {formatLabel(userMeta.setting)}
                                  </span>
                                )}
                                {userMeta.product_sku && (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-pink-50 text-pink-700 text-xs font-medium rounded-full">
                                    <ShieldCheck className="w-3 h-3" />
                                    {formatLabel(userMeta.product_sku)}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Status badges */}
                            {userMeta && (
                              <div className="flex flex-wrap items-center gap-2 mb-3">
                                {userMeta.indexing_status && (
                                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                                    ["Complete", "Indexing complete"].includes(String(userMeta.indexing_status))
                                      ? "bg-green-50 text-green-700"
                                      : userMeta.indexing_status === "In progress"
                                        ? "bg-yellow-50 text-yellow-700"
                                        : userMeta.indexing_status === "Failed"
                                          ? "bg-red-50 text-red-700"
                                          : "bg-gray-50 text-gray-600"
                                  }`}>
                                    <CheckCircle2 className="w-3 h-3" />
                                    Indexing: {String(userMeta.indexing_status)}
                                  </span>
                                )}
                                {userMeta.analysis_status && (
                                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                                    ["Complete", "complete"].includes(String(userMeta.analysis_status))
                                      ? "bg-purple-50 text-purple-700"
                                      : userMeta.analysis_status === "In progress"
                                        ? "bg-yellow-50 text-yellow-700"
                                        : userMeta.analysis_status === "Failed"
                                          ? "bg-red-50 text-red-700"
                                          : "bg-gray-50 text-gray-600"
                                  }`}>
                                    <Info className="w-3 h-3" />
                                    Analysis: {String(userMeta.analysis_status)}
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Video info */}
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              {meta?.width && meta?.height && (
                                <span className="flex items-center gap-1">
                                  <Monitor className="w-3.5 h-3.5" />
                                  {meta.width}×{meta.height}
                                </span>
                              )}
                              {meta?.size && (
                                <span className="flex items-center gap-1">
                                  <HardDrive className="w-3.5 h-3.5" />
                                  {formatFileSize(meta.size)}
                                </span>
                              )}
                              {video.created_at && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3.5 h-3.5" />
                                  {formatDate(video.created_at)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Pagination */}
              {!allVideosLoading && allVideosTotalPages > 1 && (
                <div className="flex items-center justify-center gap-4 mt-8">
                  <button
                    onClick={() => setAllVideosPage((p) => Math.max(1, p - 1))}
                    disabled={allVideosPage <= 1}
                    className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                  </button>
                  <span className="text-sm text-gray-600">
                    Page {allVideosPage} of {allVideosTotalPages}
                  </span>
                  <button
                    onClick={() => setAllVideosPage((p) => Math.min(allVideosTotalPages, p + 1))}
                    disabled={allVideosPage >= allVideosTotalPages}
                    className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Next
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ) : results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Film className="w-12 h-12 mb-3" />
              <p className="text-sm">No results found</p>
              <p className="text-xs mt-1">
                Try a different query or adjust your filters
              </p>
            </div>
          ) : (
            <div>
              <p className="text-sm text-gray-500 mb-4">
                {results.length} result{results.length !== 1 ? "s" : ""} found
              </p>

              <div className="space-y-4">
                {results.map((result, idx) => {
                  const videoId =
                    result.video_id || result.clips?.[0]?.video_id;
                  if (!videoId) return null;

                  const detail = videoDetails[videoId];
                  const meta = detail?.system_metadata;
                  const userMeta = detail?.user_metadata;
                  const thumbnailUrl =
                    detail?.hls?.thumbnail_urls?.[0];
                  const clips = result.clips || [
                    {
                      start: result.start || 0,
                      end: result.end || 0,
                      video_id: videoId,
                      confidence: result.confidence || "",
                      score: result.score || 0,
                      thumbnail_url: result.thumbnail_url,
                    },
                  ];

                  return (
                    <div
                      key={`${videoId}-${idx}`}
                      className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                    >
                      <div className="flex flex-col md:flex-row">
                        {/* Thumbnail */}
                        <div
                          className="relative w-full md:w-72 h-44 bg-gray-900 flex-shrink-0 cursor-pointer group overflow-hidden"
                          onClick={() =>
                            openVideo(videoId, clips[0]?.start, clips)
                          }
                        >
                          {thumbnailUrl ? (
                            <img
                              src={thumbnailUrl}
                              alt={meta?.filename || "Video"}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center min-h-[160px]">
                              <Film className="w-10 h-10 text-gray-600" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                            <Play className="w-10 h-10 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                          </div>
                          {meta?.duration && (
                            <span className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/75 text-white text-xs rounded font-mono">
                              {formatDuration(meta.duration)}
                            </span>
                          )}
                        </div>

                        {/* Details */}
                        <div className="flex-1 p-5">
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <h3
                              className="text-base font-semibold text-gray-900 truncate cursor-pointer hover:text-purple-600"
                              onClick={() =>
                                openVideo(videoId, clips[0]?.start, clips)
                              }
                            >
                              {meta?.filename ||
                                `Video ${videoId.slice(-8)}`}
                            </h3>
                          </div>

                          {/* Metadata tags */}
                          {userMeta && ["Complete", "complete"].includes(String(userMeta.analysis_status)) && (
                            <div className="flex flex-wrap gap-1.5 mb-3">
                              {userMeta.format && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 text-xs font-medium rounded-full">
                                  <Tag className="w-3 h-3" />
                                  {formatLabel(userMeta.format)}
                                </span>
                              )}
                              {userMeta.shot_type && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
                                  <Eye className="w-3 h-3" />
                                  {formatLabel(userMeta.shot_type)}
                                </span>
                              )}
                              {userMeta.activity && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 text-green-700 text-xs font-medium rounded-full">
                                  {formatLabel(userMeta.activity)}
                                </span>
                              )}
                              {userMeta.setting && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-xs font-medium rounded-full">
                                  {formatLabel(userMeta.setting)}
                                </span>
                              )}
                              {userMeta.product_sku && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-pink-50 text-pink-700 text-xs font-medium rounded-full">
                                  <ShieldCheck className="w-3 h-3" />
                                  {userMeta.product_sku}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Video info */}
                          <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
                            {meta?.width && meta?.height && (
                              <span className="flex items-center gap-1">
                                <Monitor className="w-3.5 h-3.5" />
                                {meta.width}×{meta.height}
                              </span>
                            )}
                            {meta?.size && (
                              <span className="flex items-center gap-1">
                                <HardDrive className="w-3.5 h-3.5" />
                                {formatFileSize(meta.size)}
                              </span>
                            )}
                            {detail?.created_at && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" />
                                {formatDate(detail.created_at)}
                              </span>
                            )}
                          </div>

                          {/* Matching clips */}
                          {clips.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-gray-500 mb-1.5">
                                {clips.length} matching segment{clips.length !== 1 ? "s" : ""}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {clips.slice(0, 6).map((clip, cIdx) => (
                                  <button
                                    key={cIdx}
                                    onClick={() =>
                                      openVideo(videoId, clip.start, clips)
                                    }
                                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 text-gray-700 text-xs rounded-lg hover:bg-purple-50 hover:text-purple-700 transition-colors"
                                  >
                                    <Play className="w-3 h-3" />
                                    {formatTime(clip.start)} –{" "}
                                    {formatTime(clip.end)}
                                  </button>
                                ))}
                                {clips.length > 6 && (
                                  <button
                                    onClick={() =>
                                      openVideo(videoId, clips[0]?.start, clips)
                                    }
                                    className="text-xs text-purple-600 hover:text-purple-800 py-1 font-medium"
                                  >
                                    View all {clips.length} segments →
                                  </button>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Video Modal */}
      {selectedVideo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-semibold text-gray-900 truncate pr-4">
                {selectedVideo.system_metadata?.filename ||
                  `Video ${selectedVideo._id.slice(-8)}`}
              </h2>
              <button
                onClick={closeModal}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto flex-1">
              {/* Video Player */}
              <div className="bg-black aspect-video">
                {selectedVideo.hls?.video_url ? (
                  <video
                    ref={videoRef}
                    controls
                    muted
                    className="w-full h-full"
                    playsInline
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-500">
                    <div className="text-center">
                      <Film className="w-12 h-12 mx-auto mb-2" />
                      <p className="text-sm">No stream available</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Matching Segments */}
              {selectedClips.length > 0 && (
                <div className="border-b border-gray-200 px-6 py-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Play className="w-4 h-4 text-purple-600" />
                    {selectedClips.length} Matching Segment{selectedClips.length !== 1 ? "s" : ""}
                  </h3>
                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                    {selectedClips.map((clip, idx) => (
                      <button
                        key={idx}
                        onClick={() => seekToClip(clip.start)}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg transition-colors ${
                          selectedClipStart === clip.start
                            ? "bg-purple-100 text-purple-800 font-semibold"
                            : "bg-gray-50 text-gray-700 hover:bg-purple-50 hover:text-purple-700"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <Play className="w-3 h-3 shrink-0" />
                          Segment {idx + 1}
                        </span>
                        <span className="font-mono">
                          {formatTime(clip.start)} – {formatTime(clip.end)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  Video Metadata
                </h3>

                {/* System metadata grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                  {[
                    {
                      icon: Hash,
                      label: "Video ID",
                      value: selectedVideo._id,
                      mono: true,
                    },
                    {
                      icon: FileVideo,
                      label: "Filename",
                      value:
                        selectedVideo.system_metadata?.filename || "N/A",
                    },
                    {
                      icon: Clock,
                      label: "Duration",
                      value: formatDuration(
                        selectedVideo.system_metadata?.duration
                      ),
                    },
                    {
                      icon: Monitor,
                      label: "Resolution",
                      value:
                        selectedVideo.system_metadata?.width &&
                        selectedVideo.system_metadata?.height
                          ? `${selectedVideo.system_metadata.width} × ${selectedVideo.system_metadata.height}`
                          : "N/A",
                    },
                    {
                      icon: Gauge,
                      label: "Frame Rate",
                      value: selectedVideo.system_metadata?.fps
                        ? `${Math.round(selectedVideo.system_metadata.fps * 100) / 100} fps`
                        : "N/A",
                    },
                    {
                      icon: HardDrive,
                      label: "File Size",
                      value: formatFileSize(
                        selectedVideo.system_metadata?.size
                      ),
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="bg-gray-50 rounded-lg p-3"
                    >
                      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
                        <item.icon className="w-3.5 h-3.5" />
                        {item.label}
                      </div>
                      <p
                        className={`text-sm font-medium text-gray-900 truncate ${
                          item.mono ? "font-mono text-xs" : ""
                        }`}
                        title={item.value}
                      >
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Analysis metadata */}
                {selectedVideo.user_metadata &&
                  (selectedVideo.user_metadata.analysis_status === "Complete" ||
                    selectedVideo.user_metadata.analysis_status === "complete") && (
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        AI Analysis Results
                      </h3>

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                        {[
                          {
                            icon: Tag,
                            label: "Format",
                            value: selectedVideo.user_metadata.format,
                          },
                          {
                            icon: ShieldCheck,
                            label: "Product SKU",
                            value:
                              selectedVideo.user_metadata.product_sku,
                          },
                          {
                            icon: Tag,
                            label: "Product Line",
                            value:
                              selectedVideo.user_metadata.product_line,
                          },
                          {
                            icon: Eye,
                            label: "Shot Type",
                            value:
                              selectedVideo.user_metadata.shot_type,
                          },
                          {
                            icon: Film,
                            label: "Activity",
                            value: selectedVideo.user_metadata.activity,
                          },
                          {
                            icon: Monitor,
                            label: "Setting",
                            value: selectedVideo.user_metadata.setting,
                          },
                          {
                            icon: Gauge,
                            label: "Confidence",
                            value:
                              selectedVideo.user_metadata
                                .confidence_score !== undefined
                                ? String(selectedVideo.user_metadata.confidence_score)
                                : undefined,
                          },
                          {
                            icon: Calendar,
                            label: "Indexed At",
                            value: selectedVideo.user_metadata.indexed_at
                              ? formatDate(
                                  String(selectedVideo.user_metadata.indexed_at)
                                )
                              : undefined,
                          },
                        ]
                          .filter((item) => item.value !== undefined && item.value !== null && item.value !== "")
                          .map((item) => (
                            <div
                              key={item.label}
                              className="bg-purple-50 rounded-lg p-3"
                            >
                              <div className="flex items-center gap-1.5 text-xs text-purple-600 mb-1">
                                <item.icon className="w-3.5 h-3.5" />
                                {item.label}
                              </div>
                              <p className="text-sm font-medium text-gray-900">
                                {item.value !== undefined
                                  ? formatLabel(item.value)
                                  : "N/A"}
                              </p>
                            </div>
                          ))}
                      </div>

                      {/* Provenance */}
                      {selectedVideo.user_metadata.provenance && (
                        <div className="bg-gray-50 rounded-lg p-4 mb-4">
                          <p className="text-xs font-medium text-gray-500 mb-1">
                            Provenance
                          </p>
                          <p className="text-sm text-gray-700 leading-relaxed">
                            {selectedVideo.user_metadata.provenance}
                          </p>
                        </div>
                      )}

                      {/* On-screen text */}
                      {selectedVideo.user_metadata.on_screen_text && (
                        <div className="bg-gray-50 rounded-lg p-4 mb-4">
                          <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                            <Eye className="w-3.5 h-3.5" />
                            On-Screen Text
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {JSON.parse(
                              String(selectedVideo.user_metadata.on_screen_text)
                            ).map((text: string, i: number) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 bg-white border border-gray-200 text-xs text-gray-700 rounded"
                              >
                                {text}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Spoken mentions */}
                      {selectedVideo.user_metadata.spoken_mentions && (
                        <div className="bg-gray-50 rounded-lg p-4">
                          <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1">
                            <MessageSquare className="w-3.5 h-3.5" />
                            Spoken Mentions
                          </p>
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {JSON.parse(
                              String(selectedVideo.user_metadata
                                .spoken_mentions)
                            ).map((text: string, i: number) => (
                              <p
                                key={i}
                                className="text-xs text-gray-600 leading-relaxed"
                              >
                                &ldquo;{text}&rdquo;
                              </p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

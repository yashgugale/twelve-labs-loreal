"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Hls from "hls.js";
import Header from "./Header";
import {
  Upload,
  Film,
  Clock,
  HardDrive,
  Monitor,
  Loader2,
  CheckCircle2,
  AlertCircle,
  X,
  FileVideo,
  Play,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Hash,
  Gauge,
  Info,
} from "lucide-react";

interface VideoMetadata {
  duration?: number;
  filename?: string;
  fps?: number;
  height?: number;
  width?: number;
  size?: number;
}

interface Video {
  _id: string;
  created_at: string;
  updated_at?: string;
  indexed_at?: string;
  metadata?: VideoMetadata;
  user_metadata?: Record<string, string>;
  hls?: {
    video_url?: string;
    thumbnail_urls?: string[];
    status?: string;
  };
  system_metadata?: VideoMetadata;
}

interface PageInfo {
  limit_per_page: number;
  page: number;
  total_page: number;
  total_results: number;
}

interface ProcessingTask {
  taskId: string;
  videoId?: string;
  filename: string;
  status: "processing" | "ready" | "failed";
  createdAt: string;
  error?: string;
}

type UploadStatus = "idle" | "uploading" | "success" | "error";

interface UploadState {
  file: File | null;
  status: UploadStatus;
  message: string;
  progress: number;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return "N/A";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
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

export default function VideoGrid() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [pageInfo, setPageInfo] = useState<PageInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [upload, setUpload] = useState<UploadState>({
    file: null,
    status: "idle",
    message: "",
    progress: 0,
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [processingTasks, setProcessingTasks] = useState<ProcessingTask[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const fetchVideos = useCallback(async (page: number = 1) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/videos?page=${page}&page_limit=20`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to fetch videos");
      }
      const data = await res.json();
      setVideos(data.data || []);
      setPageInfo(data.page_info || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVideos(currentPage);
  }, [fetchVideos, currentPage]);

  // Poll for processing tasks
  useEffect(() => {
    const pollTasks = async () => {
      try {
        const res = await fetch("/api/tasks");
        if (res.ok) {
          const data = await res.json();
          const tasks: ProcessingTask[] = data.tasks || [];

          // If any task just became ready, refresh the video list
          const justReady = tasks.some((t) => t.status === "ready");
          if (justReady) {
            fetchVideos(currentPage);
          }

          // Only keep tasks that are still processing
          setProcessingTasks(tasks.filter((t) => t.status === "processing"));
        }
      } catch {
        // Silently ignore polling errors
      }
    };

    pollTasks();
    const interval = setInterval(pollTasks, 5000);
    return () => clearInterval(interval);
  }, [fetchVideos, currentPage]);

  // HLS player setup when modal opens
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
        video.play().catch(() => {});
      });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = videoUrl;
      video.addEventListener("loadedmetadata", () => {
        video.play().catch(() => {});
      });
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [selectedVideo]);

  const closeModal = () => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    setSelectedVideo(null);
  };

  const goToPage = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    const videoFile = files.find((f) => f.type.startsWith("video/"));
    if (videoFile) {
      setUpload({ file: videoFile, status: "idle", message: "", progress: 0 });
    }
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        setUpload({ file, status: "idle", message: "", progress: 0 });
      }
    },
    []
  );

  const handleUpload = async () => {
    if (!upload.file) return;

    setUpload((prev) => ({
      ...prev,
      status: "uploading",
      message: "Uploading video...",
      progress: 10,
    }));

    try {
      const formData = new FormData();
      formData.append("video_file", upload.file);

      // Simulate progress while uploading
      const progressInterval = setInterval(() => {
        setUpload((prev) => ({
          ...prev,
          progress: Math.min(prev.progress + 5, 90),
        }));
      }, 500);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Upload failed");
      }

      const data = await res.json();
      setUpload({
        file: null,
        status: "success",
        message: `Video uploaded successfully! Task ID: ${data._id}`,
        progress: 100,
      });

      // Refresh video list after a short delay
      setTimeout(() => {
        fetchVideos(currentPage);
      }, 2000);
    } catch (err) {
      setUpload((prev) => ({
        ...prev,
        status: "error",
        message: err instanceof Error ? err.message : "Upload failed",
        progress: 0,
      }));
    }
  };

  const clearUpload = () => {
    setUpload({ file: null, status: "idle", message: "", progress: 0 });
  };

  const getMeta = (video: Video): VideoMetadata => {
    return video.metadata || video.system_metadata || {};
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Header onRefresh={() => fetchVideos(currentPage)} loading={loading} />

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Upload Zone */}
        <section className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Upload Video
          </h2>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-2xl p-10 text-center transition-all duration-200 ${
              isDragOver
                ? "border-purple-500 bg-purple-50"
                : "border-gray-300 bg-white hover:border-gray-400"
            }`}
          >
            {upload.status === "uploading" ? (
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-10 h-10 text-purple-500 animate-spin" />
                <p className="text-sm text-gray-600">{upload.message}</p>
                <div className="w-full max-w-xs bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${upload.progress}%` }}
                  />
                </div>
              </div>
            ) : upload.file && upload.status === "idle" ? (
              <div className="flex flex-col items-center gap-4">
                <FileVideo className="w-10 h-10 text-purple-500" />
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {upload.file.name}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatFileSize(upload.file.size)}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleUpload}
                    className="px-6 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    Upload to Index
                  </button>
                  <button
                    onClick={clearUpload}
                    className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-600 mb-1">
                  <span className="font-medium">Drag &amp; drop</span> a video file
                  here, or{" "}
                  <label className="text-purple-600 font-medium cursor-pointer hover:text-purple-700">
                    browse
                    <input
                      type="file"
                      accept="video/*"
                      className="hidden"
                      onChange={handleFileSelect}
                    />
                  </label>
                </p>
                <p className="text-xs text-gray-400">
                  Supports MP4, MOV, AVI, MKV and more. Max 2GB.
                </p>
              </>
            )}
          </div>

          {/* Upload status messages */}
          {upload.status === "success" && (
            <div className="mt-3 flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              <p className="text-sm text-green-800">{upload.message}</p>
              <button onClick={clearUpload} className="ml-auto">
                <X className="w-4 h-4 text-green-600 hover:text-green-800" />
              </button>
            </div>
          )}
          {upload.status === "error" && (
            <div className="mt-3 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <p className="text-sm text-red-800">{upload.message}</p>
              <button onClick={clearUpload} className="ml-auto">
                <X className="w-4 h-4 text-red-600 hover:text-red-800" />
              </button>
            </div>
          )}
        </section>

        {/* Videos Section */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Video Assets
            </h2>
            {pageInfo && (
              <span className="text-sm text-gray-500">
                {pageInfo.total_results} video
                {pageInfo.total_results !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-purple-500 animate-spin mb-3" />
              <p className="text-sm text-gray-500">Loading videos...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-20">
              <AlertCircle className="w-8 h-8 text-red-400 mb-3" />
              <p className="text-sm text-red-600 mb-3">{error}</p>
              <button
                onClick={() => fetchVideos(currentPage)}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : videos.length === 0 && processingTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-400">
              <Film className="w-12 h-12 mb-3" />
              <p className="text-sm">No videos in this index yet.</p>
              <p className="text-xs mt-1">
                Upload a video to get started.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {/* Processing task cards — hide if the video already appears in the indexed list */}
              {processingTasks
                .filter((task) => {
                  const videoIds = new Set(videos.map((v) => v._id));
                  const videoFilenames = new Set(
                    videos.map((v) => {
                      const meta = v.metadata || v.system_metadata;
                      return meta?.filename;
                    }).filter(Boolean)
                  );
                  if (task.videoId && videoIds.has(task.videoId)) return false;
                  if (task.filename && videoFilenames.has(task.filename)) return false;
                  return true;
                })
                .map((task) => (
                <div
                  key={task.taskId}
                  className="bg-white rounded-xl border border-gray-200 overflow-hidden opacity-80"
                >
                  <div className="relative aspect-video bg-gray-100 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="relative">
                        <div className="w-12 h-12 rounded-full border-3 border-purple-200 border-t-purple-600 animate-spin" />
                      </div>
                      <span className="text-xs font-medium text-purple-600 bg-purple-50 px-3 py-1 rounded-full">
                        Indexing...
                      </span>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3
                      className="text-sm font-semibold text-gray-900 truncate mb-3"
                      title={task.filename}
                    >
                      {task.filename}
                    </h3>
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>Uploaded: {formatDate(task.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-purple-600">
                        <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
                        <span>Processing video...</span>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-[10px] font-mono text-gray-400 truncate">
                        Task: {task.taskId}
                      </p>
                    </div>
                  </div>
                </div>
              ))}

              {videos.map((video) => {
                const meta = getMeta(video);
                const thumbnailUrl =
                  video.hls?.thumbnail_urls?.[0];

                return (
                  <div
                    key={video._id}
                    onClick={() => setSelectedVideo(video)}
                    className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow group cursor-pointer"
                  >
                    {/* Thumbnail / Placeholder */}
                    <div className="relative aspect-video bg-gray-900 flex items-center justify-center overflow-hidden">
                      {thumbnailUrl ? (
                        <img
                          src={thumbnailUrl}
                          alt={meta.filename || "Video thumbnail"}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      ) : (
                        <Film className="w-12 h-12 text-gray-600" />
                      )}
                      {meta.duration && (
                        <span className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/75 text-white text-xs rounded font-mono">
                          {formatDuration(meta.duration)}
                        </span>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                        <Play className="w-10 h-10 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                      </div>
                    </div>

                    {/* Info */}
                    <div className="p-4">
                      <h3
                        className="text-sm font-semibold text-gray-900 truncate mb-3"
                        title={meta.filename || video._id}
                      >
                        {meta.filename || `Video ${video._id.slice(-8)}`}
                      </h3>

                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <Clock className="w-3.5 h-3.5 shrink-0" />
                          <span>Created: {formatDate(video.created_at)}</span>
                        </div>

                        {(meta.width && meta.height) ? (
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Monitor className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              {meta.width}×{meta.height}
                              {meta.fps ? ` · ${Math.round(meta.fps)} fps` : ""}
                            </span>
                          </div>
                        ) : null}

                        {meta.size ? (
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <HardDrive className="w-3.5 h-3.5 shrink-0" />
                            <span>{formatFileSize(meta.size)}</span>
                          </div>
                        ) : null}
                      </div>

                      {/* Indexing & Analysis status badges */}
                      {video.user_metadata && (
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          {video.user_metadata.indexing_status && (
                            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                              ["Complete", "Indexing complete"].includes(video.user_metadata.indexing_status)
                                ? "bg-green-50 text-green-700"
                                : video.user_metadata.indexing_status === "In progress"
                                  ? "bg-yellow-50 text-yellow-700"
                                  : video.user_metadata.indexing_status === "Failed"
                                    ? "bg-red-50 text-red-700"
                                    : "bg-gray-50 text-gray-600"
                            }`}>
                              <CheckCircle2 className="w-3 h-3 shrink-0" />
                              Indexing: {video.user_metadata.indexing_status}
                            </span>
                          )}
                          {video.user_metadata.analysis_status && (
                            <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                              ["Complete", "complete"].includes(video.user_metadata.analysis_status)
                                ? "bg-purple-50 text-purple-700"
                                : video.user_metadata.analysis_status === "In progress"
                                  ? "bg-yellow-50 text-yellow-700"
                                  : video.user_metadata.analysis_status === "Failed"
                                    ? "bg-red-50 text-red-700"
                                    : "bg-gray-50 text-gray-600"
                            }`}>
                              <Info className="w-3 h-3 shrink-0" />
                              Analysis: {video.user_metadata.analysis_status}
                            </span>
                          )}
                        </div>
                      )}

                      {/* ID Badge */}
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-[10px] font-mono text-gray-400 truncate">
                          ID: {video._id}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {pageInfo && pageInfo.total_page > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <button
                onClick={() => goToPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
                Prev
              </button>

              {Array.from({ length: pageInfo.total_page }, (_, i) => i + 1).map(
                (page) => (
                  <button
                    key={page}
                    onClick={() => goToPage(page)}
                    className={`w-9 h-9 text-sm font-medium rounded-lg transition-colors ${
                      page === currentPage
                        ? "bg-purple-600 text-white"
                        : "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    {page}
                  </button>
                )
              )}

              <button
                onClick={() => goToPage(currentPage + 1)}
                disabled={currentPage >= pageInfo.total_page}
                className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {pageInfo && (
            <p className="text-center text-xs text-gray-400 mt-3">
              Page {currentPage} of {pageInfo.total_page} · Showing{" "}
              {videos.length} of {pageInfo.total_results} videos
            </p>
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
                {getMeta(selectedVideo).filename ||
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

              {/* Metadata */}
              <div className="p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  Video Metadata
                </h3>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {(() => {
                    const meta = getMeta(selectedVideo);
                    const items = [
                      {
                        icon: Hash,
                        label: "Video ID",
                        value: selectedVideo._id,
                        mono: true,
                      },
                      {
                        icon: FileVideo,
                        label: "Filename",
                        value: meta.filename || "N/A",
                      },
                      {
                        icon: Clock,
                        label: "Duration",
                        value: meta.duration
                          ? formatDuration(meta.duration)
                          : "N/A",
                      },
                      {
                        icon: Monitor,
                        label: "Resolution",
                        value:
                          meta.width && meta.height
                            ? `${meta.width} × ${meta.height}`
                            : "N/A",
                      },
                      {
                        icon: Gauge,
                        label: "Frame Rate",
                        value: meta.fps
                          ? `${Math.round(meta.fps * 100) / 100} fps`
                          : "N/A",
                      },
                      {
                        icon: HardDrive,
                        label: "File Size",
                        value: formatFileSize(meta.size),
                      },
                      {
                        icon: Calendar,
                        label: "Created",
                        value: formatDate(selectedVideo.created_at),
                      },
                      {
                        icon: Calendar,
                        label: "Updated",
                        value: formatDate(selectedVideo.updated_at),
                      },
                      {
                        icon: Film,
                        label: "HLS Status",
                        value: selectedVideo.hls?.status || "N/A",
                      },
                      {
                        icon: CheckCircle2,
                        label: "Indexing Status",
                        value:
                          selectedVideo.user_metadata?.indexing_status ||
                          "N/A",
                      },
                      {
                        icon: Calendar,
                        label: "Indexed At",
                        value: selectedVideo.indexed_at
                          ? formatDate(selectedVideo.indexed_at)
                          : selectedVideo.user_metadata?.indexed_at
                          ? formatDate(selectedVideo.user_metadata.indexed_at)
                          : "N/A",
                      },
                    ];

                    return items.map((item) => (
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
                    ));
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

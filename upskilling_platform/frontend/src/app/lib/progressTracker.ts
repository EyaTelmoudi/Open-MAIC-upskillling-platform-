"use client";

import { learningApi } from "@/app/lib/api";

interface VideoSegment {
  start: number;
  end: number;
}

interface VideoProgressState {
  currentTime: number;
  playedSegments: VideoSegment[];
  videoDuration: number;
  lastHeartbeat: number;
  completionUnlocked: boolean;
}

interface TextProgressState {
  readingSeconds: number;
  pageWasVisible: boolean;
  lastHeartbeat: number;
  completionUnlocked: boolean;
}

const HEARTBEAT_INTERVAL = 10000;

export class ProgressTracker {
  private videoState: VideoProgressState;
  private textState: TextProgressState;
  private videoInterval: number | null = null;
  private textInterval: number | null = null;
  private trackedVideoElement: HTMLVideoElement | null = null;
  private videoHandlers: {
    timeupdate: () => void;
    seeked: () => void;
    pause: () => void;
    ended: () => void;
  } | null = null;
  private lessonId: string;
  private userId: string;
  private contentType: "video" | "text" | "quiz";

  constructor(lessonId: string, userId: string, contentType: "video" | "text" | "quiz") {
    this.lessonId = lessonId;
    this.userId = userId;
    this.contentType = contentType;
    
    this.videoState = {
      currentTime: 0,
      playedSegments: [],
      videoDuration: 0,
      lastHeartbeat: 0,
      completionUnlocked: false,
    };
    
    this.textState = {
      readingSeconds: 0,
      pageWasVisible: true,
      lastHeartbeat: Date.now(),
      completionUnlocked: false,
    };
  }

  startVideoTracking(
    videoElement: HTMLVideoElement,
    onProgressUpdate?: (percent: number, unlocked: boolean) => void
  ): void {
    if (this.contentType !== "video") return;

    if (this.trackedVideoElement !== videoElement) {
      this.detachVideoListeners();
      this.trackedVideoElement = videoElement;
    }

    if (this.videoInterval) {
      return;
    }

    this.videoState.videoDuration = videoElement.duration || 0;

    const handleTimeUpdate = () => {
      this.videoState.currentTime = videoElement.currentTime;
      
      const lastSegment = this.videoState.playedSegments[this.videoState.playedSegments.length - 1];
      const currentTime = videoElement.currentTime;
      
      if (!lastSegment || currentTime > lastSegment.end) {
        this.videoState.playedSegments.push({
          start: lastSegment ? lastSegment.end : 0,
          end: currentTime,
        });
      } else {
        lastSegment.end = currentTime;
      }
    };

    const handleSeek = () => {
      this.sendVideoHeartbeat();
    };

    const handlePause = () => {
      this.sendVideoHeartbeat();
    };

    const handleEnded = () => {
      this.sendVideoHeartbeat();
    };

    if (!this.videoHandlers) {
      this.videoHandlers = {
        timeupdate: handleTimeUpdate,
        seeked: handleSeek,
        pause: handlePause,
        ended: handleEnded,
      };
      videoElement.addEventListener("timeupdate", this.videoHandlers.timeupdate);
      videoElement.addEventListener("seeked", this.videoHandlers.seeked);
      videoElement.addEventListener("pause", this.videoHandlers.pause);
      videoElement.addEventListener("ended", this.videoHandlers.ended);
    }

    this.videoInterval = window.setInterval(async () => {
      if (!videoElement.paused) {
        const result = await this.sendVideoHeartbeat();
        if (onProgressUpdate && result) {
          onProgressUpdate(result.watch_percent, result.completion_unlocked);
        }
      }
    }, HEARTBEAT_INTERVAL);
  }

  stopVideoTracking(): void {
    if (this.videoInterval) {
      clearInterval(this.videoInterval);
      this.videoInterval = null;
    }
    this.sendVideoHeartbeat();
  }

  private detachVideoListeners(): void {
    if (!this.trackedVideoElement || !this.videoHandlers) {
      return;
    }

    this.trackedVideoElement.removeEventListener("timeupdate", this.videoHandlers.timeupdate);
    this.trackedVideoElement.removeEventListener("seeked", this.videoHandlers.seeked);
    this.trackedVideoElement.removeEventListener("pause", this.videoHandlers.pause);
    this.trackedVideoElement.removeEventListener("ended", this.videoHandlers.ended);
    this.videoHandlers = null;
    this.trackedVideoElement = null;
  }

  async sendVideoHeartbeat(): Promise<{
    watch_percent: number;
    completion_unlocked: boolean;
  } | null> {
    try {
      const segments = this.mergeClientSegments(this.videoState.playedSegments);
      
      const response = await learningApi.post<{
        watch_percent: number;
        completion_unlocked: boolean;
      }>("/api/v1/learning/progress/video/heartbeat", {
        user_id: this.userId,
        lesson_id: this.lessonId,
        current_time: this.videoState.currentTime,
        played_segments: segments,
        video_duration: this.videoState.videoDuration,
      });

      this.videoState.completionUnlocked = response.completion_unlocked;
      this.videoState.lastHeartbeat = Date.now();
      
      return {
        watch_percent: response.watch_percent,
        completion_unlocked: response.completion_unlocked,
      };
    } catch (error) {
      console.error("Failed to send video heartbeat:", error);
      return null;
    }
  }

  private mergeClientSegments(segments: VideoSegment[]): VideoSegment[] {
    if (!segments.length) return [];
    
    const sorted = [...segments].sort((a, b) => a.start - b.start);
    const merged: VideoSegment[] = [];
    
    for (const seg of sorted) {
      if (!merged.length) {
        merged.push({ ...seg });
        continue;
      }
      
      const last = merged[merged.length - 1];
      if (seg.start <= last.end) {
        last.end = Math.max(last.end, seg.end);
      } else {
        merged.push({ ...seg });
      }
    }
    
    return merged;
  }

  startTextTracking(
    onProgressUpdate?: (percent: number, unlocked: boolean) => void
  ): void {
    if (this.contentType !== "text") return;

    const handleVisibilityChange = () => {
      this.textState.pageWasVisible = document.visibilityState === "visible";
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    this.textInterval = window.setInterval(async () => {
      if (this.textState.pageWasVisible) {
        this.textState.readingSeconds += HEARTBEAT_INTERVAL / 1000;
        
        const result = await this.sendTextHeartbeat();
        if (onProgressUpdate && result) {
          onProgressUpdate(result.reading_percent, result.completion_unlocked);
        }
      }
    }, HEARTBEAT_INTERVAL);
  }

  stopTextTracking(): void {
    if (this.textInterval) {
      clearInterval(this.textInterval);
      this.textInterval = null;
    }
    this.sendTextHeartbeat();
  }

  async sendTextHeartbeat(): Promise<{
    reading_percent: number;
    completion_unlocked: boolean;
  } | null> {
    try {
      const response = await learningApi.post<{
        reading_percent: number;
        completion_unlocked: boolean;
      }>("/api/v1/learning/progress/text/heartbeat", {
        user_id: this.userId,
        lesson_id: this.lessonId,
        reading_seconds: HEARTBEAT_INTERVAL / 1000,
        page_was_visible: this.textState.pageWasVisible,
      });

      this.textState.completionUnlocked = response.completion_unlocked;
      this.textState.lastHeartbeat = Date.now();
      
      return {
        reading_percent: response.reading_percent,
        completion_unlocked: response.completion_unlocked,
      };
    } catch (error) {
      console.error("Failed to send text heartbeat:", error);
      return null;
    }
  }

  isCompletionUnlocked(): boolean {
    if (this.contentType === "video") {
      return this.videoState.completionUnlocked;
    }
    if (this.contentType === "text") {
      return this.textState.completionUnlocked;
    }
    return true;
  }

  getWatchPercent(): number {
    const segments = this.mergeClientSegments(this.videoState.playedSegments);
    if (!segments.length || !this.videoState.videoDuration) return 0;
    
    let totalWatched = 0;
    for (const seg of segments) {
      totalWatched += seg.end - seg.start;
    }
    
    return Math.round((totalWatched / this.videoState.videoDuration) * 100);
  }

  destroy(): void {
    this.stopVideoTracking();
    this.stopTextTracking();
    this.detachVideoListeners();
  }
}

export function createProgressTracker(
  lessonId: string,
  userId: string,
  contentType: "video" | "text" | "quiz"
): ProgressTracker {
  return new ProgressTracker(lessonId, userId, contentType);
}

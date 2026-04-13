import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { uploadVideoToMux, VideoUploadResult } from '../utils/muxConfig';

export interface VideoUpload {
  id: string;
  videoUri: string;
  title: string;
  progress: number;
  status: 'queued' | 'compressing' | 'uploading' | 'processing' | 'completed' | 'failed';
  error?: string;
  result?: VideoUploadResult;
  createdAt: number;
}

interface VideoUploadContextType {
  uploads: VideoUpload[];
  uploadVideo: (videoUri: string, title: string, options?: { maxDuration?: number; description?: string }) => Promise<string>;
  cancelUpload: (uploadId: string) => void;
  retryUpload: (uploadId: string) => void;
  clearCompleted: () => void;
}

const VideoUploadContext = createContext<VideoUploadContextType | undefined>(undefined);

export function useVideoUpload() {
  const context = useContext(VideoUploadContext);
  if (!context) {
    throw new Error('useVideoUpload must be used within VideoUploadProvider');
  }
  return context;
}

/** For chrome that must never crash if the provider is missing (e.g. alternate entry roots). */
export function useVideoUploadOptional() {
  return useContext(VideoUploadContext);
}

export function VideoUploadProvider({ children }: { children: React.ReactNode }) {
  const [uploads, setUploads] = useState<VideoUpload[]>([]);
  const uploadPromisesRef = useRef<Map<string, Promise<void>>>(new Map());
  const progressIntervalsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Clear intervals when component unmounts
  useEffect(() => {
    return () => {
      progressIntervalsRef.current.forEach(interval => clearInterval(interval));
      progressIntervalsRef.current.clear();
    };
  }, []);

  // Handle app state changes - pause/resume uploads if needed
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background') {
        console.log('[VideoUpload] App went to background - uploads continue');
      } else if (nextAppState === 'active') {
        console.log('[VideoUpload] App came to foreground');
      }
    });

    return () => subscription.remove();
  }, []);

  const updateUpload = useCallback((uploadId: string, updates: Partial<VideoUpload>) => {
    setUploads(prev => prev.map(upload => 
      upload.id === uploadId ? { ...upload, ...updates } : upload
    ));
  }, []);

  const withTimeout = useCallback(async <T,>(promise: Promise<T>, ms: number, message: string): Promise<T> => {
    let timeoutId: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(message)), ms);
    });
    try {
      return await Promise.race([promise, timeoutPromise]) as T;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }, []);

  const uploadVideo = useCallback(async (
    videoUri: string,
    title: string,
    options?: { maxDuration?: number; description?: string }
  ): Promise<string> => {
    const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const newUpload: VideoUpload = {
      id: uploadId,
      videoUri,
      title,
      progress: 0,
      status: 'queued',
      createdAt: Date.now(),
    };

    setUploads(prev => [...prev, newUpload]);

    // Start upload in background
    const uploadPromise = (async () => {
      try {
        // Compression (if any) already ran in VideoPicker — go straight to upload.
        updateUpload(uploadId, { status: 'uploading', progress: 5 });

        // Perform actual upload (muxConfig reports real byte progress + Mux processing; no fake 88% cap).
        // Throttle UI updates: native progress can fire many times per second and flooding setState
        // slows the JS thread and the upload itself.
        let lastProgressEmitAt = 0;
        let lastProgressValue = -1;
        let result: VideoUploadResult;
        result = await withTimeout(
          uploadVideoToMux(videoUri, {
            title,
            description: options?.description || `Video uploaded: ${title}`,
            maxDuration: options?.maxDuration || 120,
            onProgress: (pct) => {
              const clamped = Math.max(0, Math.min(99, Math.round(pct)));
              const now = Date.now();
              const crossedMuxPhase = lastProgressValue >= 0 && lastProgressValue < 82 && clamped >= 82;
              const largeJump = lastProgressValue < 0 || Math.abs(clamped - lastProgressValue) >= 2;
              const enoughGap = now - lastProgressEmitAt >= 140;
              const nearDone = clamped >= 96;
              if (!crossedMuxPhase && !nearDone && !largeJump && !enoughGap) {
                return;
              }
              lastProgressEmitAt = now;
              lastProgressValue = clamped;
              // 82%+ is Mux ingest / playback readiness (no longer raw bytes over the network).
              updateUpload(uploadId, {
                status: clamped >= 82 ? 'processing' : 'uploading',
                progress: clamped,
              });
            },
          }),
          15 * 60 * 1000,
          'Upload is taking too long. Please retry on a stronger network.'
        );

        // Mux already polled until playback-ready inside uploadVideoToMux — brief processing state for UI.
        updateUpload(uploadId, { status: 'processing', progress: 99 });

        // Complete
        updateUpload(uploadId, {
          status: 'completed',
          progress: 100,
          result,
        });

        console.log('[VideoUpload] ✅ Upload completed:', uploadId);

        // Auto-remove completed uploads after 5 seconds
        setTimeout(() => {
          setUploads(prev => prev.filter(upload => upload.id !== uploadId));
        }, 5000);

      } catch (error: any) {
        // Clear any intervals
        const interval = progressIntervalsRef.current.get(uploadId);
        if (interval) {
          clearInterval(interval);
          progressIntervalsRef.current.delete(uploadId);
        }

        const errorMessage = error?.message || 'Upload failed';
        console.error('[VideoUpload] ❌ Upload failed:', uploadId, errorMessage);
        
        updateUpload(uploadId, {
          status: 'failed',
          error: errorMessage,
        });

        // Keep failed uploads visible for 10 seconds so user can retry
        setTimeout(() => {
          setUploads(prev => prev.filter(upload => upload.id !== uploadId));
        }, 10000);
      } finally {
        uploadPromisesRef.current.delete(uploadId);
      }
    })();

    uploadPromisesRef.current.set(uploadId, uploadPromise);
    // Return uploadId immediately so VideoPicker can set currentUploadIdRef and the completion useEffect will run when status becomes 'completed'
    uploadPromise.catch(() => {}); // avoid unhandled rejection
    return uploadId;
  }, [updateUpload, withTimeout]);

  const cancelUpload = useCallback((uploadId: string) => {
    // Clear intervals
    const interval = progressIntervalsRef.current.get(uploadId);
    if (interval) {
      clearInterval(interval);
      progressIntervalsRef.current.delete(uploadId);
    }

    // Cancel promise if possible
    const promise = uploadPromisesRef.current.get(uploadId);
    if (promise) {
      // Note: We can't actually cancel the upload, but we can stop tracking it
      uploadPromisesRef.current.delete(uploadId);
    }

    // Remove from list
    setUploads(prev => prev.filter(upload => upload.id !== uploadId));
  }, []);

  const retryUpload = useCallback((uploadId: string) => {
    const upload = uploads.find(u => u.id === uploadId);
    if (!upload) return;

    // Reset upload state
    updateUpload(uploadId, {
      status: 'queued',
      progress: 0,
      error: undefined,
    });

    // Restart upload
    uploadVideo(upload.videoUri, upload.title).catch(console.error);
  }, [uploads, uploadVideo, updateUpload]);

  const clearCompleted = useCallback(() => {
    setUploads(prev => prev.filter(upload => upload.status !== 'completed'));
  }, []);

  return (
    <VideoUploadContext.Provider
      value={{
        uploads,
        uploadVideo,
        cancelUpload,
        retryUpload,
        clearCompleted,
      }}
    >
      {children}
    </VideoUploadContext.Provider>
  );
}


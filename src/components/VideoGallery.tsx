'use client';

import { useEffect, useState, useRef } from 'react';
import Image from 'next/image';
import { Upload, Trash2, Calendar, Play, X, Film, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { getSupabase } from '@/lib/supabaseClient';
import LoadingState from '@/components/LoadingState';
import { useToast } from '@/components/ToastProvider';
import { extractVideoFrames, extractThumbnail } from '@/lib/videoFrames';

interface Video {
  id: string;
  created_at: string;
  recorded_at: string;
  duration_seconds: number | null;
  storage_path: string;
  public_url: string;
  thumbnail_url: string | null;
  label: string | null;
  category: string;
  notes: string | null;
  analysis_status: string;
  analysis_result: AnalysisResult | null;
  tags: string[] | null;
}

interface AnalysisResult {
  structuredData: {
    movement_quality_score?: number;
    posture_score?: number;
    symmetry_score?: number;
    movement_type?: string;
    compensation_patterns?: string[];
    asymmetries?: string[];
    form_issues?: string[];
    strengths?: string[];
    risk_level?: string;
    confidence?: string;
  } | null;
  rawAnalysis: string;
}

const CATEGORIES = ['exercise', 'posture', 'mobility', 'daily', 'other'] as const;
type Category = (typeof CATEGORIES)[number];
const VIDEO_BUCKET = 'progress-videos';

export default function VideoGallery() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | 'all'>('all');
  const [uploadCategory, setUploadCategory] = useState<Category>('exercise');
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [expandedVideo, setExpandedVideo] = useState<string | null>(null);
  const [editingNotes, setEditingNotes] = useState<string | null>(null);
  const [notesText, setNotesText] = useState('');
  const { pushToast } = useToast();
  const videoPlayerRef = useRef<HTMLVideoElement>(null);

  const filteredVideos =
    selectedCategory === 'all'
      ? videos
      : videos.filter((v) => v.category === selectedCategory);

  useEffect(() => {
    let isMounted = true;

    const loadVideos = async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('videos')
        .select('*')
        .order('recorded_at', { ascending: false });

      if (error) {
        console.error('Failed to load videos', error);
        if (isMounted) {
          setIsLoading(false);
          pushToast('Failed to load videos. Please try again.', 'error');
        }
        return;
      }

      if (isMounted) {
        setVideos((data ?? []) as Video[]);
        setIsLoading(false);
      }
    };

    loadVideos();
    return () => {
      isMounted = false;
    };
  }, [pushToast]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const supabase = getSupabase();
    setIsUploading(true);

    for (const file of Array.from(files)) {
      try {
        // Extract thumbnail client-side
        let thumbnailDataUrl: string | null = null;
        let duration: number | null = null;
        try {
          const thumbResult = await extractThumbnail(file);
          thumbnailDataUrl = thumbResult.dataUrl;
          duration = thumbResult.duration;
        } catch (err) {
          console.warn('Thumbnail extraction failed', err);
        }

        // Upload video to storage
        const fileExt = file.name.split('.').pop() ?? 'mp4';
        const fileName = `${Date.now()}-${crypto.randomUUID()}.${fileExt}`;
        const storagePath = `videos/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from(VIDEO_BUCKET)
          .upload(storagePath, file, { upsert: false, contentType: file.type });

        if (uploadError) {
          console.error('Failed to upload video', uploadError);
          pushToast('Failed to upload video. Please try again.', 'error');
          continue;
        }

        const publicUrl = supabase.storage
          .from(VIDEO_BUCKET)
          .getPublicUrl(storagePath).data.publicUrl;

        // Upload thumbnail if we have one
        let thumbnailUrl: string | null = null;
        if (thumbnailDataUrl) {
          try {
            const thumbBlob = await fetch(thumbnailDataUrl).then((r) => r.blob());
            const thumbPath = `thumbnails/${fileName.replace(/\.[^.]+$/, '.jpg')}`;
            const { error: thumbError } = await supabase.storage
              .from(VIDEO_BUCKET)
              .upload(thumbPath, thumbBlob, {
                upsert: false,
                contentType: 'image/jpeg',
              });
            if (!thumbError) {
              thumbnailUrl = supabase.storage
                .from(VIDEO_BUCKET)
                .getPublicUrl(thumbPath).data.publicUrl;
            }
          } catch (err) {
            console.warn('Thumbnail upload failed', err);
          }
        }

        const recordedAt = new Date(
          file.lastModified > 0 ? file.lastModified : Date.now(),
        ).toISOString();

        const { data: inserted, error: insertError } = await supabase
          .from('videos')
          .insert({
            recorded_at: recordedAt,
            duration_seconds: duration ? Math.round(duration) : null,
            storage_path: storagePath,
            public_url: publicUrl,
            thumbnail_url: thumbnailUrl,
            category: uploadCategory,
            analysis_status: 'pending',
          })
          .select('*')
          .single();

        if (insertError || !inserted) {
          console.error('Failed to save video metadata', insertError);
          pushToast('Failed to save video metadata.', 'error');
          continue;
        }

        setVideos((prev) => [inserted as Video, ...prev]);
        pushToast('Video uploaded! AI analysis starting...', 'success');

        // Extract frames and trigger analysis in background
        extractVideoFrames(file)
          .then(({ frames, duration: dur, frameInterval }) => {
            // Update status to analyzing
            supabase
              .from('videos')
              .update({ analysis_status: 'analyzing' })
              .eq('id', inserted.id)
              .then(() => {
                setVideos((prev) =>
                  prev.map((v) =>
                    v.id === inserted.id ? { ...v, analysis_status: 'analyzing' } : v,
                  ),
                );
              });

            return fetch('/api/analyze-video', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                frames: frames.map((f) => f.base64),
                timestamps: frames.map((f) => ({ timestamp: f.timestamp, label: f.label })),
                videoId: inserted.id,
                duration: dur,
                frameInterval,
              }),
            }).then(async (res) => {
              if (!res.ok) {
                const errorText = await res.text().catch(() => '');
                throw new Error(
                  `Analysis request failed (${res.status})${errorText ? `: ${errorText}` : ''}`,
                );
              }
              return res.json();
            });
          })
          .then((data) => {
            if (!data?.analysis) {
              throw new Error('No analysis returned');
            }
            pushToast('Video analysis complete — check Analysis tab', 'success');
            setVideos((prev) =>
              prev.map((v) =>
                v.id === inserted.id
                  ? {
                      ...v,
                      analysis_status: 'complete',
                      analysis_result: {
                        structuredData: data.structuredData,
                        rawAnalysis: data.analysis,
                      },
                    }
                  : v,
              ),
            );
          })
          .catch((err) => {
            console.error('Video analysis failed', err);
            setVideos((prev) =>
              prev.map((v) =>
                v.id === inserted.id ? { ...v, analysis_status: 'failed' } : v,
              ),
            );
            pushToast('Video analysis failed. Please try again.', 'error');
          });
      } catch (err) {
        console.error('Upload error', err);
        pushToast('Upload failed. Please try again.', 'error');
      }
    }

    setIsUploading(false);
    e.target.value = '';
  };

  const deleteVideo = async (id: string) => {
    if (!confirm('Delete this video and its analysis?')) return;
    const supabase = getSupabase();
    const target = videos.find((v) => v.id === id);
    const prev = videos;
    setVideos((v) => v.filter((video) => video.id !== id));

    const { error: deleteError } = await supabase.from('videos').delete().eq('id', id);
    if (deleteError) {
      setVideos(prev);
      console.error('Failed to delete video', deleteError);
      pushToast('Failed to delete video. Restored.', 'error');
      return;
    }

    if (target?.storage_path) {
      await supabase.storage.from(VIDEO_BUCKET).remove([target.storage_path]);
    }
    if (target?.thumbnail_url) {
      const thumbPath = target.thumbnail_url.split(`${VIDEO_BUCKET}/`).pop();
      if (thumbPath) {
        await supabase.storage.from(VIDEO_BUCKET).remove([thumbPath]);
      }
    }

    if (expandedVideo === id) setExpandedVideo(null);
  };

  const saveNotes = async (id: string) => {
    const supabase = getSupabase();
    const { error } = await supabase
      .from('videos')
      .update({ notes: notesText || null })
      .eq('id', id);

    if (error) {
      pushToast('Failed to save notes.', 'error');
      return;
    }

    setVideos((prev) =>
      prev.map((v) => (v.id === id ? { ...v, notes: notesText || null } : v)),
    );
    setEditingNotes(null);
    pushToast('Notes saved.', 'success');
  };

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
      analyzing: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      complete: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      failed: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    };
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status] ?? styles.pending}`}
      >
        {status === 'analyzing' && (
          <Loader2 size={12} className="animate-spin" />
        )}
        {status}
      </span>
    );
  };

  const expanded = expandedVideo
    ? videos.find((v) => v.id === expandedVideo)
    : null;

  const handleCardKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    id: string,
  ) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setExpandedVideo(id);
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-white">Video Gallery</h2>
          <p className="text-slate-400">
            Record & analyze movement patterns over time
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={uploadCategory}
            onChange={(e) => setUploadCategory(e.target.value as Category)}
            className="min-w-[140px] px-3 py-2 rounded-xl bg-slate-900/70 text-slate-200 border border-slate-800/60 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            aria-label="Video category"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>

          <label
            className={`px-4 py-2 rounded-xl cursor-pointer transition-colors flex items-center gap-2 ${
              isUploading
                ? 'bg-teal-500/70 text-white'
                : 'bg-teal-500 text-white hover:bg-teal-400'
            }`}
          >
            <Upload size={18} />
            <span>{isUploading ? 'Uploading...' : 'Upload'}</span>
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
              multiple
              onChange={handleUpload}
              disabled={isUploading}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Category filters */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {(['all', ...CATEGORIES] as const).map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-4 py-2 rounded-full capitalize whitespace-nowrap transition-all ${
              selectedCategory === cat
                ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/20'
                : 'bg-slate-900/70 text-slate-300 hover:bg-slate-800/70'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Expanded video modal */}
      {expanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl bg-slate-900 border border-slate-800/70 shadow-2xl">
            {/* Close button */}
            <button
              onClick={() => setExpandedVideo(null)}
              type="button"
              aria-label="Close video details"
              className="absolute top-4 right-4 z-10 p-2 rounded-full bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
            >
              <X size={20} />
            </button>

            {/* Video player */}
            <div className="bg-black rounded-t-2xl">
              <video
                ref={videoPlayerRef}
                src={expanded.public_url}
                controls
                className="w-full max-h-[50vh] object-contain"
                playsInline
              />
            </div>

            <div className="p-6 space-y-6">
              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-3">
                <span className="px-3 py-1 rounded-full bg-slate-800/70 text-sm capitalize text-slate-200">
                  {expanded.category}
                </span>
                {statusBadge(expanded.analysis_status)}
                <span className="text-sm text-slate-400 flex items-center gap-1">
                  <Calendar size={14} />
                  {format(new Date(expanded.recorded_at), 'MMM d, yyyy')}
                </span>
                {expanded.duration_seconds && (
                  <span className="text-sm text-slate-400">
                    {formatDuration(expanded.duration_seconds)}
                  </span>
                )}
              </div>

              {/* Label */}
              {expanded.label && (
                <h3 className="text-lg font-semibold text-white">
                  {expanded.label}
                </h3>
              )}

              {/* Notes */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium text-slate-300">Notes</h4>
                  {editingNotes !== expanded.id && (
                    <button
                      onClick={() => {
                        setEditingNotes(expanded.id);
                        setNotesText(expanded.notes ?? '');
                      }}
                      className="text-xs text-teal-400 hover:text-teal-300"
                    >
                      {expanded.notes ? 'Edit' : 'Add notes'}
                    </button>
                  )}
                </div>
                {editingNotes === expanded.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={notesText}
                      onChange={(e) => setNotesText(e.target.value)}
                      placeholder="Add notes about this video..."
                      className="w-full px-3 py-2 rounded-xl bg-slate-800/70 text-slate-200 border border-slate-700/60 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 resize-y min-h-[80px]"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveNotes(expanded.id)}
                        className="px-3 py-1.5 rounded-lg bg-teal-500 text-white text-sm hover:bg-teal-400 transition-colors"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setEditingNotes(null)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800/70 text-slate-300 text-sm hover:bg-slate-700/70 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">
                    {expanded.notes ?? 'No notes yet.'}
                  </p>
                )}
              </div>

              {/* Analysis results */}
              {expanded.analysis_status === 'complete' && expanded.analysis_result && (
                <div className="space-y-4">
                  <h4 className="text-sm font-medium text-slate-300">
                    AI Analysis
                  </h4>

                  {/* Scores grid */}
                  {expanded.analysis_result.structuredData && (
                    <div className="grid grid-cols-3 gap-3">
                      {expanded.analysis_result.structuredData.movement_quality_score != null && (
                        <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-3 text-center">
                          <p className="text-2xl font-bold text-teal-400">
                            {expanded.analysis_result.structuredData.movement_quality_score}
                            <span className="text-sm text-slate-500">/10</span>
                          </p>
                          <p className="text-xs text-slate-400 mt-1">Movement</p>
                        </div>
                      )}
                      {expanded.analysis_result.structuredData.posture_score != null && (
                        <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-3 text-center">
                          <p className="text-2xl font-bold text-teal-400">
                            {expanded.analysis_result.structuredData.posture_score}
                            <span className="text-sm text-slate-500">/10</span>
                          </p>
                          <p className="text-xs text-slate-400 mt-1">Posture</p>
                        </div>
                      )}
                      {expanded.analysis_result.structuredData.symmetry_score != null && (
                        <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 p-3 text-center">
                          <p className="text-2xl font-bold text-teal-400">
                            {expanded.analysis_result.structuredData.symmetry_score}
                            <span className="text-sm text-slate-500">/10</span>
                          </p>
                          <p className="text-xs text-slate-400 mt-1">Symmetry</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tags */}
                  {expanded.analysis_result.structuredData?.compensation_patterns &&
                    expanded.analysis_result.structuredData.compensation_patterns.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-500 mb-1">
                          Compensation Patterns
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {expanded.analysis_result.structuredData.compensation_patterns.map(
                            (p, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300"
                              >
                                {p}
                              </span>
                            ),
                          )}
                        </div>
                      </div>
                    )}

                  {/* Raw analysis */}
                  <details className="group">
                    <summary className="cursor-pointer text-sm text-slate-400 hover:text-slate-300 transition-colors">
                      Full analysis notes ▸
                    </summary>
                    <div className="mt-3 rounded-xl bg-slate-800/50 border border-slate-700/50 p-4 text-sm text-slate-300 whitespace-pre-wrap leading-relaxed max-h-[400px] overflow-y-auto">
                      {expanded.analysis_result.rawAnalysis}
                    </div>
                  </details>
                </div>
              )}

              {expanded.analysis_status === 'analyzing' && (
                <div className="flex items-center gap-3 text-blue-300">
                  <Loader2 size={20} className="animate-spin" />
                  <span className="text-sm">
                    AI is analyzing your video...
                  </span>
                </div>
              )}

              {expanded.analysis_status === 'failed' && (
                <p className="text-sm text-rose-400">
                  Analysis failed. The video may be too short or unclear for analysis.
                </p>
              )}

              {/* Delete */}
              <div className="pt-4 border-t border-slate-800/70">
                <button
                  onClick={() => deleteVideo(expanded.id)}
                  type="button"
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-colors text-sm"
                >
                  <Trash2 size={16} />
                  Delete Video
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Video grid */}
      {isLoading ? (
        <LoadingState label="Loading videos..." className="p-12" />
      ) : filteredVideos.length === 0 ? (
        <div className="bg-slate-900/70 rounded-2xl p-12 border border-slate-800/70 border-dashed text-center">
          <Film size={48} className="mx-auto text-slate-500 mb-4" />
          <h3 className="text-lg font-semibold text-slate-200 mb-2">
            No videos yet
          </h3>
          <p className="text-slate-400 mb-4">
            Upload your first movement video to start tracking
          </p>
          <label className="inline-flex items-center gap-2 px-4 py-2 bg-teal-500 text-white rounded-xl cursor-pointer hover:bg-teal-400 transition-colors">
            <Upload size={18} />
            <span>Upload Video</span>
            <input
              type="file"
              accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
              multiple
              onChange={handleUpload}
              className="hidden"
            />
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredVideos.map((video) => (
            <div
              key={video.id}
              onClick={() => setExpandedVideo(video.id)}
              onKeyDown={(event) => handleCardKeyDown(event, video.id)}
              role="button"
              tabIndex={0}
              aria-label={video.label ? `Open video ${video.label}` : 'Open video details'}
              className="relative group rounded-2xl overflow-hidden bg-slate-900/70 border border-slate-800/70 cursor-pointer hover:border-slate-700 transition-all"
            >
              {/* Thumbnail */}
              <div className="aspect-video bg-slate-800/50 relative overflow-hidden">
                {video.thumbnail_url ? (
                  <Image
                    src={video.thumbnail_url}
                    alt={video.label ?? 'Video thumbnail'}
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Film size={40} className="text-slate-600" />
                  </div>
                )}

                {/* Play icon overlay */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-14 h-14 rounded-full bg-slate-950/60 backdrop-blur-sm flex items-center justify-center">
                    <Play size={28} className="text-white ml-1" />
                  </div>
                </div>

                {/* Duration badge */}
                {video.duration_seconds && (
                  <span className="absolute bottom-2 right-2 px-2 py-0.5 bg-slate-950/70 rounded text-xs text-white font-mono">
                    {formatDuration(video.duration_seconds)}
                  </span>
                )}
              </div>

              {/* Card body */}
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-slate-800/70 text-xs capitalize text-slate-300">
                    {video.category}
                  </span>
                  {statusBadge(video.analysis_status)}
                </div>

                <p className="text-xs text-slate-400 flex items-center gap-1">
                  <Calendar size={12} />
                  {format(new Date(video.recorded_at), 'MMM d, yyyy')}
                </p>

                {video.label && (
                  <p className="text-sm text-slate-200 truncate">
                    {video.label}
                  </p>
                )}

                {/* Quick scores when analysis is complete */}
                {video.analysis_status === 'complete' &&
                  video.analysis_result?.structuredData && (
                    <div className="flex gap-3 pt-1">
                      {video.analysis_result.structuredData.movement_quality_score != null && (
                        <span className="text-xs text-teal-400">
                          Quality:{' '}
                          {video.analysis_result.structuredData.movement_quality_score}
                          /10
                        </span>
                      )}
                      {video.analysis_result.structuredData.symmetry_score != null && (
                        <span className="text-xs text-teal-400">
                          Symmetry:{' '}
                          {video.analysis_result.structuredData.symmetry_score}
                          /10
                        </span>
                      )}
                    </div>
                  )}
              </div>

              {/* Delete button (hover) */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteVideo(video.id);
                }}
                type="button"
                aria-label="Delete video"
                className="absolute top-2 right-2 p-2 bg-rose-500/80 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-rose-500 transition-all"
              >
                <Trash2 size={16} className="text-white" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

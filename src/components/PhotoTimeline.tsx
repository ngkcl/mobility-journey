'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Upload, Trash2, Calendar } from 'lucide-react';
import { differenceInCalendarDays, format } from 'date-fns';
import { getSupabase } from '@/lib/supabaseClient';
import LoadingState from '@/components/LoadingState';
import { useToast } from '@/components/ToastProvider';

interface Photo {
  id: string;
  url: string;
  date: string;
  view: 'front' | 'back' | 'left' | 'right';
  notes?: string;
  storagePath?: string;
}

interface AnalysisEntry {
  id: string;
  entry_date: string;
  title?: string;
  content: string;
  category: 'ai' | 'personal' | 'specialist';
}

// Demo data - in production this would come from a database
const demoPhotos: Photo[] = [];
const PHOTO_BUCKET = 'progress-photos';

const parseDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const formatPhotoDate = (value?: string | null, pattern = 'MMM d, yyyy') => {
  const date = parseDate(value);
  if (!date) return 'Unknown date';
  return format(date, pattern);
};

export default function PhotoTimeline() {
  const [photos, setPhotos] = useState<Photo[]>(demoPhotos);
  const [analysisEntries, setAnalysisEntries] = useState<AnalysisEntry[]>([]);
  const [selectedView, setSelectedView] = useState<'front' | 'back' | 'left' | 'right' | 'all'>('all');
  const [uploadView, setUploadView] = useState<'front' | 'back' | 'left' | 'right'>('front');
  const [compareMode, setCompareMode] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [compareSplit, setCompareSplit] = useState(50);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const { pushToast } = useToast();

  const filteredPhotos = selectedView === 'all' 
    ? photos 
    : photos.filter(p => p.view === selectedView);

  useEffect(() => {
    let isMounted = true;

    const loadPhotos = async () => {
      const supabase = getSupabase();
      const [photosResult, analysisResult] = await Promise.all([
        supabase
          .from('photos')
          .select('id, taken_at, view, public_url, storage_path, notes')
          .order('taken_at', { ascending: false }),
        supabase
          .from('analysis_logs')
          .select('id, entry_date, title, content, category, created_at')
          .eq('category', 'ai')
          .order('entry_date', { ascending: false })
          .order('created_at', { ascending: false }),
      ]);

      if (photosResult.error) {
        console.error('Failed to load photos', photosResult.error);
        if (isMounted) {
          setIsLoading(false);
          pushToast('Failed to load photos. Please try again.', 'error');
        }
        return;
      }

      if (analysisResult.error) {
        console.error('Failed to load analysis logs', analysisResult.error);
      }

      const normalized = (photosResult.data ?? [])
        .map((row) => {
          const url =
            row.public_url ??
            (row.storage_path
              ? supabase.storage.from(PHOTO_BUCKET).getPublicUrl(row.storage_path).data.publicUrl
              : '');

          return {
            id: row.id,
            url,
            date: row.taken_at,
            view: row.view,
            notes: row.notes ?? undefined,
            storagePath: row.storage_path ?? undefined,
          } as Photo;
        })
        .filter((photo) => photo.url);

      if (isMounted) {
        setPhotos(normalized);
        setAnalysisEntries((analysisResult.data ?? []) as AnalysisEntry[]);
        setIsLoading(false);
      }
    };

    loadPhotos();

    return () => {
      isMounted = false;
    };
  }, [pushToast]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const supabase = getSupabase();
    setIsUploading(true);
    let hadUploadError = false;
    let hadMetadataError = false;

    for (const file of Array.from(files)) {
      const fileExt = file.name.split('.').pop() ?? 'jpg';
      const fileName = `${Date.now()}-${crypto.randomUUID()}.${fileExt}`;
      const storagePath = `progress/${fileName}`;

      const { error: uploadError } = await supabase
        .storage
        .from(PHOTO_BUCKET)
        .upload(storagePath, file, { upsert: false, contentType: file.type });

      if (uploadError) {
        console.error('Failed to upload photo', uploadError);
        hadUploadError = true;
        continue;
      }

      const publicUrl = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(storagePath).data.publicUrl;
      const takenAt = new Date(file.lastModified > 0 ? file.lastModified : Date.now()).toISOString();

      const { data: inserted, error: insertError } = await supabase
        .from('photos')
        .insert({
          taken_at: takenAt,
          view: uploadView,
          storage_path: storagePath,
          public_url: publicUrl,
        })
        .select('id, taken_at, view, public_url, storage_path, notes')
        .single();

      if (insertError || !inserted) {
        console.error('Failed to save photo metadata', insertError);
        hadMetadataError = true;
        continue;
      }

      setPhotos((prev) => [
        {
          id: inserted.id,
          url: inserted.public_url ?? publicUrl,
          date: inserted.taken_at,
          view: inserted.view,
          notes: inserted.notes ?? undefined,
          storagePath: inserted.storage_path ?? storagePath,
        },
        ...prev,
      ]);

      // Trigger AI analysis in background
      fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoUrl: publicUrl, photoId: inserted.id }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.analysis) {
            pushToast('AI analysis complete — check Analysis tab', 'success');
          }
        })
        .catch(() => {
          // Silent fail — analysis is optional
        });
    }

    setIsUploading(false);
    e.target.value = '';
    if (hadUploadError) {
      pushToast('Some photos failed to upload. Please retry.', 'error');
    }
    if (hadMetadataError) {
      pushToast('Some photos could not be saved. Please retry.', 'error');
    }
  };

  const togglePhotoSelection = (id: string) => {
    if (selectedPhotos.includes(id)) {
      setSelectedPhotos(prev => prev.filter(p => p !== id));
      return;
    }

    if (selectedPhotos.length >= 2) {
      return;
    }

    const target = photos.find((photo) => photo.id === id);
    if (!target) return;

    if (selectedPhotos.length === 1) {
      const first = photos.find((photo) => photo.id === selectedPhotos[0]);
      if (first && first.view !== target.view) {
        pushToast('Select a photo with the same view to compare.', 'error');
        return;
      }
    }

    const next = [...selectedPhotos, id];
    setSelectedPhotos(next);
    if (next.length === 2) {
      setCompareSplit(50);
    }
  };

  const toggleCompareMode = () => {
    setCompareMode((prev) => {
      const next = !prev;
      if (!next) {
        setSelectedPhotos([]);
      }
      return next;
    });
  };

  const deletePhoto = async (id: string) => {
    if (!confirm('Are you sure?')) return;
    const supabase = getSupabase();
    const target = photos.find((photo) => photo.id === id);
    const prev = photos;
    setPhotos((p) => p.filter((photo) => photo.id !== id));

    const { error: deleteError } = await supabase.from('photos').delete().eq('id', id);
    if (deleteError) {
      setPhotos(prev);
      console.error('Failed to delete photo metadata', deleteError);
      pushToast('Failed to delete photo. Restored.', 'error');
      return;
    }

    if (target?.storagePath) {
      const { error: storageError } = await supabase.storage.from(PHOTO_BUCKET).remove([target.storagePath]);
      if (storageError) {
        console.error('Failed to delete photo file', storageError);
        pushToast('Failed to delete photo file from storage.', 'error');
      }
    }
  };

  const views = ['all', 'front', 'back', 'left', 'right'] as const;

  const selectedPhotoObjects = useMemo(() => {
    return selectedPhotos
      .map((id) => photos.find((photo) => photo.id === id))
      .filter((photo): photo is Photo => Boolean(photo));
  }, [photos, selectedPhotos]);

  const getAnalysisForPhoto = (photo: Photo) => {
    const entryDate = parseDate(photo.date);
    if (!entryDate) return null;
    const entryDateKey = format(entryDate, 'yyyy-MM-dd');
    const viewKey = photo.view.toLowerCase();
    const sameDay = analysisEntries.filter((entry) => entry.entry_date === entryDateKey);
    const withView = sameDay.filter((entry) => (entry.title ?? '').toLowerCase().includes(viewKey));
    return withView[0] ?? sameDay[0] ?? null;
  };

  const parseStructuredData = (entry: AnalysisEntry | null) => {
    if (!entry?.content) return null;
    const match = entry.content.match(/```json\n([\s\S]*?)\n```/);
    if (!match) return null;
    try {
      return JSON.parse(match[1]) as Record<string, unknown>;
    } catch {
      return null;
    }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-white">Progress Photos</h2>
          <p className="text-slate-400">Track visual changes over time</p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <select
            value={uploadView}
            onChange={(e) => setUploadView(e.target.value as 'front' | 'back' | 'left' | 'right')}
            className="min-w-[140px] px-3 py-2 rounded-xl bg-slate-900/70 text-slate-200 border border-slate-800/60 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
            aria-label="Photo view"
          >
            <option value="front">Front</option>
            <option value="back">Back</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
          <button
            onClick={toggleCompareMode}
            className={`px-4 py-2 rounded-xl transition-all ${
              compareMode 
                ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' 
                : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700/70'
            }`}
          >
            {compareMode ? 'Exit Compare' : 'Compare'}
          </button>
          
          <label className={`px-4 py-2 rounded-xl cursor-pointer transition-colors flex items-center gap-2 ${
            isUploading
              ? 'bg-teal-500/70 text-white'
              : 'bg-teal-500 text-white hover:bg-teal-400'
          }`}>
            <Upload size={18} />
            <span>{isUploading ? 'Uploading...' : 'Upload'}</span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
              disabled={isUploading}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* View filters */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {views.map((view) => (
          <button
            key={view}
            onClick={() => setSelectedView(view)}
            className={`px-4 py-2 rounded-full capitalize whitespace-nowrap transition-all ${
              selectedView === view
                ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/20'
                : 'bg-slate-900/70 text-slate-300 hover:bg-slate-800/70'
            }`}
          >
            {view}
          </button>
        ))}
      </div>

      {/* Compare view */}
      {compareMode && selectedPhotos.length === 2 && (
        (() => {
          const sorted = [...selectedPhotoObjects].sort(
            (a, b) => (parseDate(a.date)?.getTime() ?? 0) - (parseDate(b.date)?.getTime() ?? 0),
          );
          const before = sorted[0];
          const after = sorted[1];
          if (!before || !after) return null;
          const beforeDate = parseDate(before.date);
          const afterDate = parseDate(after.date);
          if (!beforeDate || !afterDate) {
            return (
              <div className="bg-slate-900/70 rounded-2xl p-4 border border-slate-800/70 shadow-lg shadow-black/20 text-slate-300">
                Unable to compare these photos because one or both dates are missing.
              </div>
            );
          }

          const deltaDays = Math.abs(
            differenceInCalendarDays(afterDate, beforeDate),
          );
          const deltaLabel =
            deltaDays === 0
              ? 'Same day'
              : `${deltaDays} day${deltaDays === 1 ? '' : 's'} apart`;

          const beforeAnalysis = getAnalysisForPhoto(before);
          const afterAnalysis = getAnalysisForPhoto(after);
          const beforeStructured = parseStructuredData(beforeAnalysis);
          const afterStructured = parseStructuredData(afterAnalysis);

          const diffFields: { key: string; label: string; type: 'number' | 'text' }[] = [
            { key: 'posture_score', label: 'Posture score', type: 'number' },
            { key: 'symmetry_score', label: 'Symmetry score', type: 'number' },
            { key: 'rib_hump', label: 'Rib hump', type: 'text' },
            { key: 'muscle_asymmetry', label: 'Muscle asymmetry', type: 'text' },
            { key: 'shoulder_level', label: 'Shoulder level', type: 'text' },
            { key: 'hip_level', label: 'Hip level', type: 'text' },
            { key: 'head_position', label: 'Head position', type: 'text' },
            { key: 'confidence', label: 'Confidence', type: 'text' },
          ];

          const renderDiffValue = (
            beforeValue: unknown,
            afterValue: unknown,
            type: 'number' | 'text',
          ) => {
            if (beforeValue == null && afterValue == null) return '—';
            if (type === 'number') {
              const beforeNum = Number(beforeValue);
              const afterNum = Number(afterValue);
              if (Number.isFinite(beforeNum) && Number.isFinite(afterNum)) {
                const delta = afterNum - beforeNum;
                const trend = delta > 0 ? 'up' : delta < 0 ? 'down' : 'no change';
                const deltaLabel = delta === 0 ? '0' : `${delta > 0 ? '+' : ''}${delta}`;
                return `${beforeNum} → ${afterNum} (${trend} ${deltaLabel})`;
              }
            }

            const beforeText = beforeValue ?? '—';
            const afterText = afterValue ?? '—';
            if (beforeText === afterText) {
              return `${beforeText} (no change)`;
            }
            return `${beforeText} → ${afterText}`;
          };

          return (
            <div className="bg-slate-900/70 rounded-2xl p-4 border border-slate-800/70 shadow-lg shadow-black/20 space-y-5">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold text-white">Comparison</h3>
                  <p className="text-sm text-slate-400 capitalize">
                    {before.view} view · {deltaLabel}
                  </p>
                </div>
                <div className="text-sm text-slate-400">
                  {formatPhotoDate(before.date)} → {formatPhotoDate(after.date)}
                </div>
              </div>

              <div className="space-y-3">
                <div className="relative w-full aspect-[3/4] overflow-hidden rounded-xl border border-slate-800/70 bg-slate-950">
                  <Image
                    src={before.url}
                    alt={`Before ${before.view} view`}
                    fill
                    sizes="(max-width: 768px) 100vw, 50vw"
                    className="object-cover"
                    unoptimized
                  />
                  <div className="absolute inset-0 overflow-hidden relative" style={{ width: `${compareSplit}%` }}>
                    <Image
                      src={after.url}
                      alt={`After ${after.view} view`}
                      fill
                      sizes="(max-width: 768px) 100vw, 50vw"
                      className="object-cover"
                      unoptimized
                    />
                  </div>
                  <div
                    className="absolute inset-y-0 flex items-center"
                    style={{ left: `calc(${compareSplit}% - 1px)` }}
                  >
                    <div className="h-full w-0.5 bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.7)]" />
                  </div>
                  <div className="absolute left-3 top-3 rounded-full bg-slate-950/70 px-3 py-1 text-xs uppercase tracking-wide text-slate-200">
                    Before
                  </div>
                  <div className="absolute right-3 top-3 rounded-full bg-slate-950/70 px-3 py-1 text-xs uppercase tracking-wide text-slate-200">
                    After
                  </div>
                </div>

                <input
                  type="range"
                  min={0}
                  max={100}
                  value={compareSplit}
                  onChange={(e) => setCompareSplit(Number(e.target.value))}
                  className="w-full accent-amber-400"
                  aria-label="Comparison slider"
                />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-800/70 bg-slate-950/60 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Before</p>
                  <p className="text-sm text-slate-200">
                    {formatPhotoDate(before.date)}
                  </p>
                  <p className="text-xs text-slate-400 capitalize">{before.view} view</p>
                </div>
                <div className="rounded-xl border border-slate-800/70 bg-slate-950/60 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-400">After</p>
                  <p className="text-sm text-slate-200">
                    {formatPhotoDate(after.date)}
                  </p>
                  <p className="text-xs text-slate-400 capitalize">{after.view} view</p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-800/70 bg-slate-950/50 p-4 space-y-3">
                <div>
                  <h4 className="text-sm font-semibold text-white">AI analysis differences</h4>
                  <p className="text-xs text-slate-400">
                    Based on AI logs from the same day as each photo.
                  </p>
                </div>

                {beforeStructured && afterStructured ? (
                  <div className="grid gap-3 md:grid-cols-2">
                    {diffFields.map((field) => {
                      const beforeValue = (beforeStructured as Record<string, unknown>)[field.key];
                      const afterValue = (afterStructured as Record<string, unknown>)[field.key];
                      const display = renderDiffValue(beforeValue, afterValue, field.type);
                      if (display === '—') return null;
                      return (
                        <div
                          key={field.key}
                          className="rounded-lg border border-slate-800/60 bg-slate-900/70 px-3 py-2"
                        >
                          <p className="text-xs text-slate-400">{field.label}</p>
                          <p className="text-sm text-slate-200">{display}</p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">
                    No AI analysis found for one or both photos.
                  </p>
                )}

                {(beforeAnalysis || afterAnalysis) && (
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-slate-800/60 bg-slate-900/70 px-3 py-2">
                      <p className="text-xs text-slate-400">Before analysis</p>
                      <p className="text-sm text-slate-200">
                        {beforeAnalysis?.title ?? 'No AI analysis logged.'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-800/60 bg-slate-900/70 px-3 py-2">
                      <p className="text-xs text-slate-400">After analysis</p>
                      <p className="text-sm text-slate-200">
                        {afterAnalysis?.title ?? 'No AI analysis logged.'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()
      )}

      {/* Photo grid */}
      {isLoading ? (
        <LoadingState label="Loading photos..." className="p-12" />
      ) : filteredPhotos.length === 0 ? (
        <div className="bg-slate-900/70 rounded-2xl p-12 border border-slate-800/70 border-dashed text-center">
          <Upload size={48} className="mx-auto text-slate-500 mb-4" />
          <h3 className="text-lg font-semibold text-slate-200 mb-2">No photos yet</h3>
          <p className="text-slate-400 mb-4">Upload your first progress photos to start tracking</p>
          <label className="inline-flex items-center gap-2 px-4 py-2 bg-teal-500 text-white rounded-xl cursor-pointer hover:bg-teal-400 transition-colors">
            <Upload size={18} />
            <span>Upload Photos</span>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
              className="hidden"
            />
          </label>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredPhotos.map((photo) => (
            <div
              key={photo.id}
              onClick={() => compareMode && togglePhotoSelection(photo.id)}
              className={`relative group rounded-2xl overflow-hidden bg-slate-900/70 border transition-all ${
                compareMode
                  ? selectedPhotos.includes(photo.id)
                    ? 'border-amber-400 ring-2 ring-amber-400/80'
                    : 'border-slate-800/70 cursor-pointer hover:border-slate-700'
                  : 'border-slate-800/70'
              }`}
            >
              <div className="relative w-full aspect-[3/4] overflow-hidden">
                <Image
                  src={photo.url}
                  alt={`${photo.view} view`}
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  unoptimized
                />
              </div>
              
              {/* Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white text-sm font-medium capitalize">{photo.view}</p>
                      <p className="text-slate-200 text-xs flex items-center gap-1">
                        <Calendar size={12} />
                        {formatPhotoDate(photo.date)}
                      </p>
                    </div>
                    {!compareMode && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePhoto(photo.id);
                        }}
                        className="p-2 bg-rose-500/80 rounded-lg hover:bg-rose-500 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* View badge */}
              <div className="absolute top-2 left-2 px-2 py-1 bg-slate-950/60 rounded text-xs capitalize text-white">
                {photo.view}
              </div>
            </div>
          ))}
        </div>
      )}

      {compareMode && selectedPhotos.length < 2 && (
        <p className="text-center text-slate-400">
          Select {2 - selectedPhotos.length} more photo{selectedPhotos.length === 1 ? '' : 's'} to compare
        </p>
      )}
    </div>
  );
}

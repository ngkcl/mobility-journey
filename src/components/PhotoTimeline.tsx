'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Upload, Trash2, Calendar } from 'lucide-react';
import { format } from 'date-fns';
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

// Demo data - in production this would come from a database
const demoPhotos: Photo[] = [];
const PHOTO_BUCKET = 'progress-photos';

export default function PhotoTimeline() {
  const [photos, setPhotos] = useState<Photo[]>(demoPhotos);
  const [selectedView, setSelectedView] = useState<'front' | 'back' | 'left' | 'right' | 'all'>('all');
  const [uploadView, setUploadView] = useState<'front' | 'back' | 'left' | 'right'>('front');
  const [compareMode, setCompareMode] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
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
      const { data, error } = await supabase
        .from('photos')
        .select('id, taken_at, view, public_url, storage_path, notes')
        .order('taken_at', { ascending: false });

      if (error) {
        console.error('Failed to load photos', error);
        if (isMounted) {
          setIsLoading(false);
          pushToast('Failed to load photos. Please try again.', 'error');
        }
        return;
      }

      const normalized = (data ?? [])
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
    } else if (selectedPhotos.length < 2) {
      setSelectedPhotos(prev => [...prev, id]);
    }
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
            onClick={() => setCompareMode(!compareMode)}
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
        <div className="bg-slate-900/70 rounded-2xl p-4 border border-slate-800/70 shadow-lg shadow-black/20">
          <h3 className="text-lg font-semibold mb-4 text-white">Comparison</h3>
          <div className="grid grid-cols-2 gap-4">
            {selectedPhotos.map((id) => {
              const photo = photos.find(p => p.id === id);
              if (!photo) return null;
              return (
                <div key={id} className="space-y-2">
                  <div className="relative w-full aspect-[3/4] overflow-hidden rounded-xl">
                    <Image
                      src={photo.url}
                      alt={`${photo.view} view`}
                      fill
                      sizes="(min-width: 768px) 50vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                  <p className="text-sm text-slate-400 text-center">
                    {format(new Date(photo.date), 'MMM d, yyyy')}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
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
                  sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
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
                        {format(new Date(photo.date), 'MMM d, yyyy')}
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

'use client';

import { useEffect, useState } from 'react';
import { Upload, Trash2, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabaseClient';

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

  const filteredPhotos = selectedView === 'all' 
    ? photos 
    : photos.filter(p => p.view === selectedView);

  useEffect(() => {
    let isMounted = true;

    const loadPhotos = async () => {
      const { data, error } = await supabase
        .from('photos')
        .select('id, taken_at, view, public_url, storage_path, notes')
        .order('taken_at', { ascending: false });

      if (error) {
        console.error('Failed to load photos', error);
        if (isMounted) setIsLoading(false);
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
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);

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
        continue;
      }

      const publicUrl = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(storagePath).data.publicUrl;
      const takenAt = new Date(file.lastModified || Date.now()).toISOString();

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
    }

    setIsUploading(false);
    e.target.value = '';
  };

  const togglePhotoSelection = (id: string) => {
    if (selectedPhotos.includes(id)) {
      setSelectedPhotos(prev => prev.filter(p => p !== id));
    } else if (selectedPhotos.length < 2) {
      setSelectedPhotos(prev => [...prev, id]);
    }
  };

  const deletePhoto = async (id: string) => {
    const target = photos.find((photo) => photo.id === id);
    setPhotos((prev) => prev.filter((photo) => photo.id !== id));

    const { error: deleteError } = await supabase.from('photos').delete().eq('id', id);
    if (deleteError) {
      console.error('Failed to delete photo metadata', deleteError);
    }

    if (target?.storagePath) {
      const { error: storageError } = await supabase.storage.from(PHOTO_BUCKET).remove([target.storagePath]);
      if (storageError) {
        console.error('Failed to delete photo file', storageError);
      }
    }
  };

  const views = ['all', 'front', 'back', 'left', 'right'] as const;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Progress Photos</h2>
          <p className="text-gray-400">Track visual changes over time</p>
        </div>
        
        <div className="flex flex-wrap gap-2">
          <select
            value={uploadView}
            onChange={(e) => setUploadView(e.target.value as 'front' | 'back' | 'left' | 'right')}
            className="px-3 py-2 rounded-lg bg-gray-900 text-gray-200 border border-gray-700"
            aria-label="Photo view"
          >
            <option value="front">Front</option>
            <option value="back">Back</option>
            <option value="left">Left</option>
            <option value="right">Right</option>
          </select>
          <button
            onClick={() => setCompareMode(!compareMode)}
            className={`px-4 py-2 rounded-lg transition-colors ${
              compareMode 
                ? 'bg-purple-600 text-white' 
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {compareMode ? 'Exit Compare' : 'Compare'}
          </button>
          
          <label className={`px-4 py-2 rounded-lg cursor-pointer transition-colors flex items-center gap-2 ${
            isUploading
              ? 'bg-blue-600/70 text-white'
              : 'bg-blue-600 text-white hover:bg-blue-700'
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
            className={`px-4 py-2 rounded-lg capitalize whitespace-nowrap transition-colors ${
              selectedView === view
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {view}
          </button>
        ))}
      </div>

      {/* Compare view */}
      {compareMode && selectedPhotos.length === 2 && (
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <h3 className="text-lg font-semibold mb-4 text-white">Comparison</h3>
          <div className="grid grid-cols-2 gap-4">
            {selectedPhotos.map((id) => {
              const photo = photos.find(p => p.id === id);
              if (!photo) return null;
              return (
                <div key={id} className="space-y-2">
                  <img
                    src={photo.url}
                    alt={`${photo.view} view`}
                    className="w-full aspect-[3/4] object-cover rounded-lg"
                  />
                  <p className="text-sm text-gray-400 text-center">
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
        <div className="bg-gray-900 rounded-xl p-12 border border-gray-800 text-center text-gray-400">
          Loading photos...
        </div>
      ) : filteredPhotos.length === 0 ? (
        <div className="bg-gray-900 rounded-xl p-12 border border-gray-800 border-dashed text-center">
          <Upload size={48} className="mx-auto text-gray-600 mb-4" />
          <h3 className="text-lg font-semibold text-gray-400 mb-2">No photos yet</h3>
          <p className="text-gray-500 mb-4">Upload your first progress photos to start tracking</p>
          <label className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 transition-colors">
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
              className={`relative group rounded-xl overflow-hidden bg-gray-900 border transition-all ${
                compareMode
                  ? selectedPhotos.includes(photo.id)
                    ? 'border-purple-500 ring-2 ring-purple-500'
                    : 'border-gray-800 cursor-pointer hover:border-gray-700'
                  : 'border-gray-800'
              }`}
            >
              <img
                src={photo.url}
                alt={`${photo.view} view`}
                className="w-full aspect-[3/4] object-cover"
              />
              
              {/* Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-white text-sm font-medium capitalize">{photo.view}</p>
                      <p className="text-gray-300 text-xs flex items-center gap-1">
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
                        className="p-2 bg-red-600/80 rounded-lg hover:bg-red-600 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* View badge */}
              <div className="absolute top-2 left-2 px-2 py-1 bg-black/50 rounded text-xs capitalize text-white">
                {photo.view}
              </div>
            </div>
          ))}
        </div>
      )}

      {compareMode && selectedPhotos.length < 2 && (
        <p className="text-center text-gray-400">
          Select {2 - selectedPhotos.length} more photo{selectedPhotos.length === 1 ? '' : 's'} to compare
        </p>
      )}
    </div>
  );
}

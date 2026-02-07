import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  Pressable,
  Alert,
  FlatList,
  Dimensions,
  RefreshControl,
  Platform,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { format } from 'date-fns';
import { getSupabase } from '../../lib/supabase';
import { analyzePhoto } from '../../lib/api';
import { useToast } from '../../components/Toast';
import LoadingState from '../../components/LoadingState';
import type { Photo, PhotoView } from '../../lib/types';

const PHOTO_BUCKET = 'progress-photos';
const VIEWS: readonly ('all' | PhotoView)[] = ['all', 'front', 'back', 'left', 'right'] as const;
const UPLOAD_VIEWS: readonly PhotoView[] = ['front', 'back', 'left', 'right'] as const;
const screenWidth = Dimensions.get('window').width;
const numColumns = screenWidth > 900 ? 4 : screenWidth > 600 ? 3 : 2;
const gap = 8;
const imageSize = (screenWidth - gap * (numColumns + 1)) / numColumns;

export default function PhotosScreen() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedView, setSelectedView] = useState<'all' | PhotoView>('all');
  const [uploadView, setUploadView] = useState<PhotoView>('front');
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const { pushToast } = useToast();

  const filteredPhotos =
    selectedView === 'all' ? photos : photos.filter((p) => p.view === selectedView);

  const loadPhotos = async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('photos')
      .select('id, taken_at, view, public_url, storage_path, notes')
      .order('taken_at', { ascending: false });

    if (error) {
      pushToast('Failed to load photos.', 'error');
      setIsLoading(false);
      return;
    }

    const normalized = (data ?? [])
      .map((row: any) => {
        const publicUrl =
          row.public_url ??
          (row.storage_path
            ? supabase.storage.from(PHOTO_BUCKET).getPublicUrl(row.storage_path).data.publicUrl
            : '');
        return {
          id: row.id,
          taken_at: row.taken_at,
          view: row.view as PhotoView,
          public_url: publicUrl,
          storage_path: row.storage_path ?? '',
          notes: row.notes ?? null,
        };
      })
      .filter((p: Photo) => p.public_url);

    setPhotos(normalized);
    setIsLoading(false);
  };

  useEffect(() => {
    loadPhotos();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPhotos();
    setRefreshing(false);
  };

  const handleUpload = async () => {
    setCompareMode(false);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.length) return;

    const supabase = getSupabase();
    setIsUploading(true);

    for (const asset of result.assets) {
      try {
        const fileExt = asset.uri.split('.').pop() ?? 'jpg';
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
        const storagePath = `progress/${fileName}`;

        // Fetch file as blob for upload
        const response = await fetch(asset.uri);
        const blob = await response.blob();

        const { error: uploadError } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(storagePath, blob, { upsert: false, contentType: `image/${fileExt}` });

        if (uploadError) {
          pushToast('Failed to upload photo.', 'error');
          continue;
        }

        const publicUrl = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(storagePath).data
          .publicUrl;
        const takenAt = new Date().toISOString();

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
          pushToast('Failed to save photo metadata.', 'error');
          continue;
        }

        setPhotos((prev) => [
          {
            id: inserted.id,
            taken_at: inserted.taken_at,
            view: inserted.view as PhotoView,
            public_url: inserted.public_url ?? publicUrl,
            storage_path: inserted.storage_path ?? storagePath,
            notes: inserted.notes ?? null,
          },
          ...prev,
        ]);

        // Trigger AI analysis in background
        analyzePhoto(publicUrl, inserted.id)
          .then(() => pushToast('AI analysis complete — check Analysis tab', 'success'))
          .catch(() => {}); // silent fail
      } catch (err) {
        pushToast('Upload failed.', 'error');
      }
    }

    setIsUploading(false);
  };

  const handleCamera = async () => {
    setCompareMode(false);
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera access is required to take photos.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.length) return;

    const supabase = getSupabase();
    setIsUploading(true);

    const asset = result.assets[0];
    try {
      const fileExt = asset.uri.split('.').pop() ?? 'jpg';
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
      const storagePath = `progress/${fileName}`;

      const response = await fetch(asset.uri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from(PHOTO_BUCKET)
        .upload(storagePath, blob, { upsert: false, contentType: `image/${fileExt}` });

      if (uploadError) {
        pushToast('Failed to upload photo.', 'error');
        setIsUploading(false);
        return;
      }

      const publicUrl = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(storagePath).data
        .publicUrl;

      const { data: inserted, error: insertError } = await supabase
        .from('photos')
        .insert({
          taken_at: new Date().toISOString(),
          view: uploadView,
          storage_path: storagePath,
          public_url: publicUrl,
        })
        .select('id, taken_at, view, public_url, storage_path, notes')
        .single();

      if (!insertError && inserted) {
        setPhotos((prev) => [
          {
            id: inserted.id,
            taken_at: inserted.taken_at,
            view: inserted.view as PhotoView,
            public_url: inserted.public_url ?? publicUrl,
            storage_path: inserted.storage_path ?? storagePath,
            notes: inserted.notes ?? null,
          },
          ...prev,
        ]);

        analyzePhoto(publicUrl, inserted.id)
          .then(() => pushToast('AI analysis complete!', 'success'))
          .catch(() => {});
      }
    } catch {
      pushToast('Camera upload failed.', 'error');
    }

    setIsUploading(false);
  };

  const deletePhoto = (id: string) => {
    Alert.alert('Delete Photo', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const supabase = getSupabase();
          const target = photos.find((p) => p.id === id);
          setPhotos((p) => p.filter((photo) => photo.id !== id));

          const { error } = await supabase.from('photos').delete().eq('id', id);
          if (error) {
            pushToast('Failed to delete.', 'error');
            if (target) setPhotos((prev) => [...prev, target]);
            return;
          }

          if (target?.storage_path) {
            await supabase.storage.from(PHOTO_BUCKET).remove([target.storage_path]);
          }
        },
      },
    ]);
  };

  const toggleCompareSelection = (id: string) => {
    setCompareSelection((prev) => {
      if (prev.includes(id)) {
        return prev.filter((value) => value !== id);
      }
      if (prev.length >= 2) {
        pushToast('Select up to two photos.', 'info');
        return prev;
      }
      return [...prev, id];
    });
  };

  const openCompare = () => {
    if (compareSelection.length !== 2) {
      pushToast('Select two photos to compare.', 'info');
      return;
    }
    setCompareOpen(true);
  };

  const clearCompare = () => {
    setCompareOpen(false);
    setCompareSelection([]);
  };

  const renderPhoto = ({ item }: { item: Photo }) => (
    <Pressable
      onPress={() => (compareMode ? toggleCompareSelection(item.id) : undefined)}
      onLongPress={() => deletePhoto(item.id)}
      style={{ width: imageSize, margin: gap / 2 }}
    >
      <View className="rounded-xl overflow-hidden bg-slate-800 border border-slate-700">
        <Image
          source={{ uri: item.public_url }}
          style={{ width: imageSize, height: imageSize * 1.33 }}
          resizeMode="cover"
        />
        {compareMode && (
          <View className="absolute top-2 right-2">
            <View
              className={`h-6 w-6 rounded-full border ${
                compareSelection.includes(item.id)
                  ? 'bg-teal-500 border-teal-300'
                  : 'bg-slate-900/80 border-slate-600'
              }`}
            />
          </View>
        )}
        <View className="absolute top-2 left-2 bg-slate-900/70 px-2 py-1 rounded">
          <Text className="text-white text-xs capitalize">{item.view}</Text>
        </View>
        <View className="p-2">
          <Text className="text-slate-400 text-xs">
            {format(new Date(item.taken_at), 'MMM d, yyyy')}
          </Text>
        </View>
      </View>
    </Pressable>
  );

  return (
    <View className="flex-1 bg-[#0b1020]">
      {/* Header controls */}
      <View className="px-4 pt-4 pb-2">
        <View className="flex-row items-center justify-between mb-3">
          <View>
            <Text className="text-2xl font-semibold text-white">Progress Photos</Text>
            <Text className="text-slate-400 text-sm">Track visual changes over time</Text>
          </View>
          <Pressable
            onPress={() => {
              setCompareMode((prev) => !prev);
              setCompareSelection([]);
            }}
            className={`px-3 py-2 rounded-xl border ${
              compareMode ? 'bg-teal-500 border-teal-400' : 'bg-slate-900 border-slate-800'
            }`}
          >
            <Text
              className={`text-xs font-semibold ${compareMode ? 'text-white' : 'text-slate-300'}`}
            >
              {compareMode ? 'Comparing' : 'Compare'}
            </Text>
          </Pressable>
        </View>

        {/* Upload controls */}
        <View className="flex-row gap-2 mb-3">
          {/* View selector */}
          <View className="flex-row bg-slate-900 rounded-xl border border-slate-800 p-1">
            {UPLOAD_VIEWS.map((v) => (
              <Pressable
                key={v}
                onPress={() => setUploadView(v)}
                className={`px-3 py-1.5 rounded-lg ${uploadView === v ? 'bg-teal-500' : ''}`}
              >
                <Text
                  className={`text-xs capitalize ${uploadView === v ? 'text-white font-semibold' : 'text-slate-400'}`}
                >
                  {v}
                </Text>
              </Pressable>
            ))}
          </View>

          <View className="flex-1" />

          {/* Camera button (native only) */}
          {Platform.OS !== 'web' && (
            <Pressable
              onPress={handleCamera}
              disabled={isUploading}
              className="bg-slate-800 px-3 py-2 rounded-xl flex-row items-center gap-1"
            >
              <Ionicons name="camera" size={18} color="#5eead4" />
            </Pressable>
          )}

          {/* Upload button */}
          <Pressable
            onPress={handleUpload}
            disabled={isUploading}
            className={`px-4 py-2 rounded-xl flex-row items-center gap-2 ${isUploading ? 'bg-teal-500/50' : 'bg-teal-500'}`}
          >
            <Ionicons name="cloud-upload" size={18} color="#fff" />
            <Text className="text-white font-medium text-sm">
              {isUploading ? 'Uploading...' : 'Upload'}
            </Text>
          </Pressable>
        </View>

        {/* View filter pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-2 pb-2">
            {VIEWS.map((view) => (
              <Pressable
                key={view}
                onPress={() => setSelectedView(view)}
                className={`px-4 py-2 rounded-full ${
                  selectedView === view ? 'bg-teal-500' : 'bg-slate-900'
                }`}
              >
                <Text
                  className={`text-sm capitalize ${
                    selectedView === view ? 'text-white font-semibold' : 'text-slate-300'
                  }`}
                >
                  {view}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {compareMode && (
          <View className="mt-3 flex-row items-center gap-2">
            <Text className="text-slate-300 text-xs">
              Selected {compareSelection.length}/2
            </Text>
            <Pressable
              onPress={openCompare}
              className={`px-3 py-1.5 rounded-full ${
                compareSelection.length === 2 ? 'bg-teal-500' : 'bg-slate-800'
              }`}
            >
              <Text
                className={`text-xs font-semibold ${
                  compareSelection.length === 2 ? 'text-white' : 'text-slate-400'
                }`}
              >
                View Compare
              </Text>
            </Pressable>
            <Pressable onPress={clearCompare} className="px-3 py-1.5 rounded-full bg-slate-900">
              <Text className="text-xs text-slate-400">Clear</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Photo grid */}
      {isLoading ? (
        <View className="p-8">
          <LoadingState label="Loading photos..." />
        </View>
      ) : filteredPhotos.length === 0 ? (
        <View className="flex-1 items-center justify-center p-8">
          <Ionicons name="camera-outline" size={48} color="#64748b" />
          <Text className="text-lg font-semibold text-slate-200 mt-4">No photos yet</Text>
          <Text className="text-slate-400 text-center mt-2">
            Upload your first progress photos to start tracking
          </Text>
          <Pressable onPress={handleUpload} className="mt-4 bg-teal-500 px-6 py-3 rounded-xl flex-row items-center gap-2">
            <Ionicons name="cloud-upload" size={18} color="#fff" />
            <Text className="text-white font-medium">Upload Photos</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filteredPhotos}
          renderItem={renderPhoto}
          keyExtractor={(item) => item.id}
          numColumns={numColumns}
          contentContainerStyle={{ padding: gap / 2 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5eead4" />
          }
        />
      )}

      <Modal visible={compareOpen} animationType="slide" onRequestClose={clearCompare}>
        <View className="flex-1 bg-[#0b1020] p-4">
          <View className="flex-row items-center justify-between mb-4">
            <Text className="text-lg font-semibold text-white">Compare Photos</Text>
            <Pressable onPress={clearCompare} className="px-3 py-2 rounded-xl bg-slate-800">
              <Text className="text-slate-200 text-xs font-semibold">Close</Text>
            </Pressable>
          </View>
          <View className="flex-1 flex-row gap-3">
            {compareSelection.map((id) => {
              const photo = photos.find((p) => p.id === id);
              if (!photo) return null;
              return (
                <View key={photo.id} className="flex-1 rounded-2xl overflow-hidden bg-slate-900">
                  <Image
                    source={{ uri: photo.public_url }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                  <View className="absolute bottom-0 left-0 right-0 bg-slate-950/70 px-3 py-2">
                    <Text className="text-white text-xs capitalize">{photo.view}</Text>
                    <Text className="text-slate-300 text-[10px]">
                      {format(new Date(photo.taken_at), 'MMM d, yyyy')}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      </Modal>
    </View>
  );
}

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
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { format } from 'date-fns';
import { useRouter } from 'expo-router';
import { getSupabase } from '../../lib/supabase';
import { useToast } from '../../components/Toast';
import LoadingState from '../../components/LoadingState';
import type { Video, VideoCategory, VideoAnalysisResult } from '../../lib/types';

const VIDEO_BUCKET = 'progress-videos';
const CATEGORIES: readonly VideoCategory[] = ['exercise', 'posture', 'mobility', 'daily', 'other'];
const screenWidth = Dimensions.get('window').width;
const numColumns = screenWidth > 600 ? 3 : 2;
const gap = 8;
const cardWidth = (screenWidth - gap * (numColumns + 1)) / numColumns;

const normalizeAnalysisResult = (result: unknown): VideoAnalysisResult | null => {
  if (!result) return null;
  if (typeof result === 'string') {
    try {
      const parsed = JSON.parse(result);
      return normalizeAnalysisResult(parsed);
    } catch {
      return { structuredData: null, rawAnalysis: result };
    }
  }

  const obj = result as Record<string, unknown>;
  const structuredData =
    (obj.structuredData as VideoAnalysisResult['structuredData']) ??
    (obj.structured_data as VideoAnalysisResult['structuredData']) ??
    null;
  const rawAnalysis =
    (obj.rawAnalysis as string | undefined) ??
    (obj.analysis as string | undefined) ??
    '';

  return { structuredData, rawAnalysis };
};

export default function VideosScreen() {
  const [videos, setVideos] = useState<Video[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<VideoCategory | 'all'>('all');
  const [uploadCategory, setUploadCategory] = useState<VideoCategory>('exercise');
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { pushToast } = useToast();
  const router = useRouter();

  const filteredVideos =
    selectedCategory === 'all'
      ? videos
      : videos.filter((v) => v.category === selectedCategory);

  const normalizeVideo = (row: any): Video => {
    const supabase = getSupabase();
    const publicUrl =
      row.public_url ??
      (row.storage_path
        ? supabase.storage.from(VIDEO_BUCKET).getPublicUrl(row.storage_path).data.publicUrl
        : '');
    const thumbnailUrl =
      row.thumbnail_url ??
      (row.thumbnail_path
        ? supabase.storage.from(VIDEO_BUCKET).getPublicUrl(row.thumbnail_path).data.publicUrl
        : null);

    return {
      id: row.id,
      recorded_at: row.recorded_at,
      duration_seconds: row.duration_seconds ?? null,
      storage_path: row.storage_path ?? '',
      public_url: publicUrl,
      thumbnail_url: thumbnailUrl,
      label: row.label ?? null,
      category: (row.category ?? 'other') as VideoCategory,
      notes: row.notes ?? null,
      analysis_status: row.analysis_status ?? 'pending',
      analysis_result: normalizeAnalysisResult(row.analysis_result),
      tags: row.tags ?? null,
    };
  };

  const loadVideos = async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .order('recorded_at', { ascending: false });

    if (error) {
      pushToast('Failed to load videos.', 'error');
      setIsLoading(false);
      return;
    }

    const normalized = (data ?? []).map((row) => normalizeVideo(row));
    setVideos(normalized);
    setIsLoading(false);
  };

  useEffect(() => {
    loadVideos();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadVideos();
    setRefreshing(false);
  };

  const handleUpload = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.length) return;

    const supabase = getSupabase();
    setIsUploading(true);

    for (const asset of result.assets) {
      try {
        const fileExt = asset.uri.split('.').pop() ?? 'mp4';
        const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;
        const storagePath = `videos/${fileName}`;

        const response = await fetch(asset.uri);
        const blob = await response.blob();

        const { error: uploadError } = await supabase.storage
          .from(VIDEO_BUCKET)
          .upload(storagePath, blob, { upsert: false, contentType: `video/${fileExt}` });

        if (uploadError) {
          pushToast('Failed to upload video.', 'error');
          continue;
        }

        const publicUrl = supabase.storage.from(VIDEO_BUCKET).getPublicUrl(storagePath).data
          .publicUrl;

        const recordedAt = new Date().toISOString();
        const duration = asset.duration ? Math.round(asset.duration / 1000) : null;

        const { data: inserted, error: insertError } = await supabase
          .from('videos')
          .insert({
            recorded_at: recordedAt,
            duration_seconds: duration,
            storage_path: storagePath,
            public_url: publicUrl,
            category: uploadCategory,
            analysis_status: 'pending',
          })
          .select('*')
          .single();

        if (insertError || !inserted) {
          pushToast('Failed to save video metadata.', 'error');
          continue;
        }

        setVideos((prev) => [normalizeVideo(inserted), ...prev]);
        pushToast('Video uploaded!', 'success');
      } catch (err) {
        pushToast('Upload failed.', 'error');
      }
    }

    setIsUploading(false);
  };

  const deleteVideo = (id: string) => {
    Alert.alert('Delete Video', 'Delete this video and its analysis?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const supabase = getSupabase();
          const target = videos.find((v) => v.id === id);
          setVideos((v) => v.filter((video) => video.id !== id));

          const { error } = await supabase.from('videos').delete().eq('id', id);
          if (error) {
            pushToast('Failed to delete.', 'error');
            if (target) setVideos((prev) => [target, ...prev]);
            return;
          }

          if (target?.storage_path) {
            await supabase.storage.from(VIDEO_BUCKET).remove([target.storage_path]);
          }
        },
      },
    ]);
  };

  const formatDuration = (seconds: number | null): string => {
    if (!seconds) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const statusColor = (status: string) => {
    const map: Record<string, { bg: string; text: string }> = {
      pending: { bg: 'bg-yellow-500/20', text: 'text-yellow-300' },
      analyzing: { bg: 'bg-blue-500/20', text: 'text-blue-300' },
      complete: { bg: 'bg-emerald-500/20', text: 'text-emerald-300' },
      failed: { bg: 'bg-rose-500/20', text: 'text-rose-300' },
    };
    return map[status] ?? map.pending;
  };

  const renderVideo = ({ item }: { item: Video }) => {
    const sc = statusColor(item.analysis_status);
    return (
      <Pressable
        onPress={() => router.push(`/video/${item.id}`)}
        onLongPress={() => deleteVideo(item.id)}
        style={{ width: cardWidth, margin: gap / 2 }}
      >
        <View className="rounded-2xl overflow-hidden bg-slate-900 border border-slate-800">
          {/* Thumbnail */}
          <View style={{ width: cardWidth, height: cardWidth * 0.56 }} className="bg-slate-800 items-center justify-center">
            {item.thumbnail_url ? (
              <Image
                source={{ uri: item.thumbnail_url }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            ) : (
              <Ionicons name="film-outline" size={32} color="#475569" />
            )}
            {/* Play overlay */}
            <View className="absolute inset-0 items-center justify-center">
              <View className="w-10 h-10 rounded-full bg-slate-950/60 items-center justify-center">
                <Ionicons name="play" size={20} color="#fff" style={{ marginLeft: 2 }} />
              </View>
            </View>
            {/* Duration */}
            {item.duration_seconds && (
              <View className="absolute bottom-1 right-1 bg-slate-950/70 px-1.5 py-0.5 rounded">
                <Text className="text-white text-xs font-mono">
                  {formatDuration(item.duration_seconds)}
                </Text>
              </View>
            )}
          </View>

          {/* Card body */}
          <View className="p-2 gap-1.5">
            <View className="flex-row items-center justify-between gap-1">
              <View className="bg-slate-800 px-2 py-0.5 rounded-full">
                <Text className="text-slate-300 text-xs capitalize">{item.category}</Text>
              </View>
              <View className={`${sc.bg} px-2 py-0.5 rounded-full flex-row items-center gap-1`}>
                {item.analysis_status === 'analyzing' && (
                  <ActivityIndicator size={10} color="#93c5fd" />
                )}
                <Text className={`${sc.text} text-xs`}>{item.analysis_status}</Text>
              </View>
            </View>
            <Text className="text-slate-400 text-xs">
              {format(new Date(item.recorded_at), 'MMM d, yyyy')}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View className="flex-1 bg-[#0b1020]">
      {/* Header */}
      <View className="px-4 pt-4 pb-2">
        <View className="flex-row items-center justify-between mb-3">
          <View>
            <Text className="text-2xl font-semibold text-white">Video Gallery</Text>
            <Text className="text-slate-400 text-sm">Record & analyze movement patterns</Text>
          </View>
        </View>

        {/* Upload controls */}
        <View className="flex-row gap-2 mb-3">
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row bg-slate-900 rounded-xl border border-slate-800 p-1">
              {CATEGORIES.map((cat) => (
                <Pressable
                  key={cat}
                  onPress={() => setUploadCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg ${uploadCategory === cat ? 'bg-teal-500' : ''}`}
                >
                  <Text
                    className={`text-xs capitalize ${uploadCategory === cat ? 'text-white font-semibold' : 'text-slate-400'}`}
                  >
                    {cat}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <Pressable
            onPress={handleUpload}
            disabled={isUploading}
            className={`px-4 py-2 rounded-xl flex-row items-center gap-2 ${isUploading ? 'bg-teal-500/50' : 'bg-teal-500'}`}
          >
            <Ionicons name="cloud-upload" size={18} color="#fff" />
            <Text className="text-white font-medium text-sm">
              {isUploading ? '...' : 'Upload'}
            </Text>
          </Pressable>
        </View>

        {/* Category filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-2 pb-2">
            {(['all', ...CATEGORIES] as const).map((cat) => (
              <Pressable
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-full ${
                  selectedCategory === cat ? 'bg-teal-500' : 'bg-slate-900'
                }`}
              >
                <Text
                  className={`text-sm capitalize ${
                    selectedCategory === cat ? 'text-white font-semibold' : 'text-slate-300'
                  }`}
                >
                  {cat}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Video grid */}
      {isLoading ? (
        <View className="p-8">
          <LoadingState label="Loading videos..." />
        </View>
      ) : filteredVideos.length === 0 ? (
        <View className="flex-1 items-center justify-center p-8">
          <Ionicons name="film-outline" size={48} color="#64748b" />
          <Text className="text-lg font-semibold text-slate-200 mt-4">No videos yet</Text>
          <Text className="text-slate-400 text-center mt-2">
            Upload your first movement video to start tracking
          </Text>
          <Pressable
            onPress={handleUpload}
            className="mt-4 bg-teal-500 px-6 py-3 rounded-xl flex-row items-center gap-2"
          >
            <Ionicons name="cloud-upload" size={18} color="#fff" />
            <Text className="text-white font-medium">Upload Video</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filteredVideos}
          renderItem={renderVideo}
          keyExtractor={(item) => item.id}
          numColumns={numColumns}
          contentContainerStyle={{ padding: gap / 2 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#5eead4" />
          }
        />
      )}
    </View>
  );
}

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
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { format } from 'date-fns';
import { useRouter } from 'expo-router';
import { getSupabase } from '../../lib/supabase';
import { useToast } from '../../components/Toast';
import LoadingState from '../../components/LoadingState';
import { colors, typography, spacing, radii, shared } from '@/lib/theme';
import type { Video, VideoCategory, VideoAnalysisResult } from '../../lib/types';

const VIDEO_BUCKET = 'progress-videos';
const CATEGORIES: readonly VideoCategory[] = ['exercise', 'posture', 'mobility', 'daily', 'other'];
const screenWidth = Dimensions.get('window').width;
const numColumns = screenWidth > 600 ? 3 : 2;
const gap = 8;
const cardWidth = (screenWidth - gap * (numColumns + 1)) / numColumns;

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: colors.warningDim, text: colors.warning },
  analyzing: { bg: colors.infoDim, text: colors.info },
  complete: { bg: colors.successDim, text: colors.success },
  failed: { bg: colors.errorDim, text: colors.error },
};

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

        let recordedAt = new Date().toISOString();
        if ((asset as any).creationTime) {
          recordedAt = new Date((asset as any).creationTime).toISOString();
        } else if ((asset as any).modificationTime) {
          recordedAt = new Date((asset as any).modificationTime).toISOString();
        }
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

  const renderVideo = ({ item }: { item: Video }) => {
    const sc = STATUS_COLORS[item.analysis_status] ?? STATUS_COLORS.pending;
    return (
      <Pressable
        onPress={() => router.push(`/video/${item.id}`)}
        onLongPress={() => deleteVideo(item.id)}
        style={{ width: cardWidth, margin: gap / 2 }}
      >
        <View style={s.videoCard}>
          {/* Thumbnail */}
          <View style={[s.thumbnailWrap, { width: cardWidth, height: cardWidth * 0.56 }]}>
            {item.thumbnail_url ? (
              <Image
                source={{ uri: item.thumbnail_url }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            ) : (
              <Ionicons name="film-outline" size={32} color={colors.textPlaceholder} />
            )}
            {/* Play overlay */}
            <View style={s.playOverlay}>
              <View style={s.playButton}>
                <Ionicons name="play" size={20} color="#fff" style={{ marginLeft: 2 }} />
              </View>
            </View>
            {/* Duration */}
            {item.duration_seconds && (
              <View style={s.durationBadge}>
                <Text style={s.durationText}>
                  {formatDuration(item.duration_seconds)}
                </Text>
              </View>
            )}
          </View>

          {/* Card body */}
          <View style={s.videoBody}>
            <View style={s.videoMeta}>
              <View style={s.categoryChip}>
                <Text style={s.categoryChipText}>{item.category}</Text>
              </View>
              <View style={[s.statusChip, { backgroundColor: sc.bg }]}>
                {item.analysis_status === 'analyzing' && (
                  <ActivityIndicator size={10} color={sc.text} />
                )}
                <Text style={[s.statusChipText, { color: sc.text }]}>{item.analysis_status}</Text>
              </View>
            </View>
            <Text style={s.videoDate}>
              {format(new Date(item.recorded_at), 'MMM d, yyyy')}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={shared.screen}>
      {/* Header */}
      <View style={s.headerWrap}>
        <View style={s.headerRow}>
          <View>
            <Text style={shared.pageTitle}>Video Gallery</Text>
            <Text style={shared.pageSubtitle}>Record & analyze movement patterns</Text>
          </View>
        </View>

        {/* Upload controls */}
        <View style={s.uploadRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={s.catSelectorWrap}>
              {CATEGORIES.map((cat) => (
                <Pressable
                  key={cat}
                  onPress={() => setUploadCategory(cat)}
                  style={[s.catSelectorBtn, uploadCategory === cat && s.catSelectorBtnActive]}
                >
                  <Text style={[s.catSelectorText, uploadCategory === cat && s.catSelectorTextActive]}>
                    {cat}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <Pressable
            onPress={handleUpload}
            disabled={isUploading}
            style={[shared.btnPrimary, s.uploadBtn, isUploading && { opacity: 0.5 }]}
          >
            <Ionicons name="cloud-upload" size={18} color="#fff" />
            <Text style={shared.btnPrimaryText}>
              {isUploading ? '...' : 'Upload'}
            </Text>
          </Pressable>
        </View>

        {/* Category filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={s.filterPillRow}>
            {(['all', ...CATEGORIES] as const).map((cat) => (
              <Pressable
                key={cat}
                onPress={() => setSelectedCategory(cat)}
                style={[s.filterPill, selectedCategory === cat && s.filterPillActive]}
              >
                <Text style={[s.filterPillText, selectedCategory === cat && s.filterPillTextActive]}>
                  {cat}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Video grid */}
      {isLoading ? (
        <View style={{ padding: spacing['3xl'] }}>
          <LoadingState label="Loading videos..." />
        </View>
      ) : filteredVideos.length === 0 ? (
        <View style={shared.emptyState}>
          <Ionicons name="film-outline" size={48} color={colors.textMuted} />
          <Text style={shared.emptyStateTitle}>No videos yet</Text>
          <Text style={shared.emptyStateText}>
            Upload your first movement video to start tracking
          </Text>
          <Pressable onPress={handleUpload} style={[shared.btnPrimary, { marginTop: spacing.lg }]}>
            <Ionicons name="cloud-upload" size={18} color="#fff" />
            <Text style={shared.btnPrimaryText}>Upload Video</Text>
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
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tealLight} />
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  headerWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  uploadRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  catSelectorWrap: {
    flexDirection: 'row',
    backgroundColor: colors.bgBase,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
  },
  catSelectorBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.sm,
  },
  catSelectorBtnActive: {
    backgroundColor: colors.teal,
  },
  catSelectorText: {
    ...typography.small,
    color: colors.textTertiary,
    textTransform: 'capitalize',
  },
  catSelectorTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  uploadBtn: {
    paddingVertical: spacing.sm,
  },
  filterPillRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  filterPill: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.bgBase,
  },
  filterPillActive: {
    backgroundColor: colors.teal,
  },
  filterPillText: {
    ...typography.caption,
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
  filterPillTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  videoCard: {
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: colors.bgBase,
    borderWidth: 1,
    borderColor: colors.border,
  },
  thumbnailWrap: {
    backgroundColor: colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(2,6,23,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    backgroundColor: colors.bgOverlay,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  durationText: {
    ...typography.small,
    color: colors.textPrimary,
    fontFamily: 'monospace',
  },
  videoBody: {
    padding: spacing.sm,
    gap: 6,
  },
  videoMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  categoryChip: {
    backgroundColor: colors.bgCard,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  categoryChipText: {
    ...typography.small,
    color: colors.textSecondary,
    textTransform: 'capitalize',
  },
  statusChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  statusChipText: {
    ...typography.small,
  },
  videoDate: {
    ...typography.small,
    color: colors.textTertiary,
  },
});

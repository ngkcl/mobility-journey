import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video as ExpoVideo, ResizeMode } from 'expo-av';
import { format } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getSupabase } from '../../lib/supabase';
import { useToast } from '../../components/Toast';
import type { Video, VideoAnalysisResult, VideoCategory } from '../../lib/types';

const VIDEO_BUCKET = 'progress-videos';

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

const statusColor = (status: string) => {
  const map: Record<string, { bg: string; text: string; spinner: string }> = {
    pending: { bg: 'bg-yellow-500/20', text: 'text-yellow-300', spinner: '#fde68a' },
    analyzing: { bg: 'bg-blue-500/20', text: 'text-blue-300', spinner: '#93c5fd' },
    complete: { bg: 'bg-emerald-500/20', text: 'text-emerald-300', spinner: '#6ee7b7' },
    failed: { bg: 'bg-rose-500/20', text: 'text-rose-300', spinner: '#fda4af' },
  };
  return map[status] ?? map.pending;
};

export default function VideoDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { pushToast } = useToast();
  const [video, setVideo] = useState<Video | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showFullAnalysis, setShowFullAnalysis] = useState(false);

  const loadVideo = async () => {
    if (!id) return;
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('videos')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      pushToast('Failed to load video.', 'error');
      setIsLoading(false);
      return;
    }

    const normalized = normalizeVideo(data);
    setVideo(normalized);
    setNotes(normalized.notes ?? '');
    setIsLoading(false);
  };

  useEffect(() => {
    loadVideo();
  }, [id]);

  const handleSaveNotes = async () => {
    if (!video || !id) return;
    setIsSaving(true);
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('videos')
      .update({ notes })
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      pushToast('Failed to save notes.', 'error');
      setIsSaving(false);
      return;
    }

    const updated = normalizeVideo(data);
    setVideo(updated);
    setNotes(updated.notes ?? '');
    setIsSaving(false);
    pushToast('Notes saved.', 'success');
  };

  const handleDelete = () => {
    if (!video || !id) return;
    Alert.alert('Delete Video', 'Delete this video and its analysis?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const supabase = getSupabase();
          const { error } = await supabase.from('videos').delete().eq('id', id);
          if (error) {
            pushToast('Failed to delete video.', 'error');
            return;
          }

          if (video.storage_path) {
            await supabase.storage.from(VIDEO_BUCKET).remove([video.storage_path]);
          }

          pushToast('Video deleted.', 'success');
          router.back();
        },
      },
    ]);
  };

  const analysisScores = useMemo(() => {
    const structured = video?.analysis_result?.structuredData;
    if (!structured) return [];
    const entries: { label: string; value: number }[] = [];
    if (typeof structured.movement_quality_score === 'number') {
      entries.push({ label: 'Movement Quality', value: structured.movement_quality_score });
    }
    if (typeof structured.posture_score === 'number') {
      entries.push({ label: 'Posture', value: structured.posture_score });
    }
    if (typeof structured.symmetry_score === 'number') {
      entries.push({ label: 'Symmetry', value: structured.symmetry_score });
    }
    return entries;
  }, [video]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-[#0b1020]">
        <ActivityIndicator size="large" color="#5eead4" />
        <Text className="text-slate-300 mt-3">Loading video...</Text>
      </View>
    );
  }

  if (!video) {
    return (
      <View className="flex-1 items-center justify-center bg-[#0b1020] px-6">
        <Text className="text-slate-200 text-lg font-semibold">Video not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4 px-4 py-2 rounded-lg bg-slate-800">
          <Text className="text-slate-200">Back</Text>
        </Pressable>
      </View>
    );
  }

  const status = statusColor(video.analysis_status);
  const rawAnalysis = video.analysis_result?.rawAnalysis ?? '';
  const hasAnalysis = rawAnalysis.trim().length > 0;

  return (
    <ScrollView className="flex-1 bg-[#0b1020]" contentContainerStyle={{ paddingBottom: 28 }}>
      <View className="px-4 pt-4">
        <View className="rounded-2xl overflow-hidden bg-slate-900 border border-slate-800">
          {video.public_url ? (
            <ExpoVideo
              source={{ uri: video.public_url }}
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
              style={{ width: '100%', height: 220, backgroundColor: '#0f172a' }}
            />
          ) : (
            <View className="h-[220px] items-center justify-center bg-slate-800">
              <Ionicons name="film-outline" size={44} color="#64748b" />
              <Text className="text-slate-400 mt-2">Video unavailable</Text>
            </View>
          )}
        </View>
      </View>

      <View className="px-4 mt-4 gap-3">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-white text-xl font-semibold capitalize">{video.category}</Text>
            <Text className="text-slate-400 text-sm">
              {format(new Date(video.recorded_at), 'MMM d, yyyy')}
            </Text>
          </View>
          <View className={`${status.bg} px-3 py-1 rounded-full flex-row items-center gap-1`}>
            {video.analysis_status === 'analyzing' && (
              <ActivityIndicator size={10} color={status.spinner} />
            )}
            <Text className={`${status.text} text-xs uppercase`}>{video.analysis_status}</Text>
          </View>
        </View>

        <View className="flex-row items-center gap-4">
          <View className="bg-slate-900 border border-slate-800 px-3 py-2 rounded-lg">
            <Text className="text-slate-400 text-xs">Duration</Text>
            <Text className="text-white text-sm font-semibold">
              {video.duration_seconds ? `${Math.round(video.duration_seconds)}s` : '--'}
            </Text>
          </View>
          {video.label && (
            <View className="bg-slate-900 border border-slate-800 px-3 py-2 rounded-lg">
              <Text className="text-slate-400 text-xs">Label</Text>
              <Text className="text-white text-sm font-semibold">{video.label}</Text>
            </View>
          )}
        </View>

        <View className="bg-slate-900 border border-slate-800 rounded-xl p-3">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-white font-semibold">Notes</Text>
            <Pressable
              onPress={handleSaveNotes}
              disabled={isSaving}
              className={`px-3 py-1 rounded-lg ${isSaving ? 'bg-teal-500/40' : 'bg-teal-500'}`}
            >
              <Text className="text-white text-xs font-semibold">{isSaving ? 'Saving' : 'Save'}</Text>
            </Pressable>
          </View>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Add notes about this session..."
            placeholderTextColor="#475569"
            className="text-slate-200 min-h-[80px]"
            multiline
          />
        </View>

        <View className="bg-slate-900 border border-slate-800 rounded-xl p-3 gap-3">
          <Text className="text-white font-semibold">Analysis</Text>
          {video.analysis_status !== 'complete' && (
            <View className="flex-row items-center gap-2">
              <Ionicons name="information-circle-outline" size={16} color="#94a3b8" />
              <Text className="text-slate-400 text-sm">
                Analysis {video.analysis_status}. Results will appear here.
              </Text>
            </View>
          )}

          {analysisScores.length > 0 && (
            <View className="flex-row gap-3">
              {analysisScores.map((score) => (
                <View
                  key={score.label}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-2"
                >
                  <Text className="text-slate-400 text-xs">{score.label}</Text>
                  <Text className="text-white text-lg font-semibold">{score.value}</Text>
                </View>
              ))}
            </View>
          )}

          {hasAnalysis ? (
            <View className="gap-2">
              <Text className="text-slate-200 text-sm">
                {showFullAnalysis ? rawAnalysis : `${rawAnalysis.slice(0, 220)}${rawAnalysis.length > 220 ? '…' : ''}`}
              </Text>
              {rawAnalysis.length > 220 && (
                <Pressable onPress={() => setShowFullAnalysis((prev) => !prev)}>
                  <Text className="text-teal-300 text-sm">
                    {showFullAnalysis ? 'Show less' : 'Show more'}
                  </Text>
                </Pressable>
              )}
            </View>
          ) : (
            <Text className="text-slate-500 text-sm">No analysis data yet.</Text>
          )}
        </View>

        <Pressable
          onPress={handleDelete}
          className="mt-2 bg-rose-500/20 border border-rose-500/30 rounded-xl py-3 items-center"
        >
          <Text className="text-rose-300 font-semibold">Delete Video</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

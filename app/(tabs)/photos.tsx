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
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { format } from 'date-fns';
import { getSupabase } from '../../lib/supabase';
import { analyzePhoto } from '../../lib/api';
import { useToast } from '../../components/Toast';
import LoadingState from '../../components/LoadingState';
import { colors, typography, spacing, radii, shared } from '@/lib/theme';
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
      exif: true,
    });

    if (result.canceled || !result.assets?.length) return;

    const supabase = getSupabase();
    setIsUploading(true);

    for (const asset of result.assets) {
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
          continue;
        }

        const publicUrl = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(storagePath).data
          .publicUrl;

        let takenAt = new Date().toISOString();
        if (asset.exif) {
          const exifDate = (asset.exif as any).DateTimeOriginal
            || (asset.exif as any).DateTimeDigitized
            || (asset.exif as any).DateTime;
          if (exifDate) {
            const parsed = exifDate.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3');
            const d = new Date(parsed);
            if (!isNaN(d.getTime())) takenAt = d.toISOString();
          }
        }
        if (takenAt === new Date().toISOString() && (asset as any).creationTime) {
          takenAt = new Date((asset as any).creationTime).toISOString();
        }

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

        analyzePhoto(publicUrl, inserted.id)
          .then(() => pushToast('AI analysis complete — check Analysis tab', 'success'))
          .catch(() => {});
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
      <View style={s.photoCard}>
        <Image
          source={{ uri: item.public_url }}
          style={{ width: imageSize, height: imageSize * 1.33 }}
          resizeMode="cover"
        />
        {compareMode && (
          <View style={s.checkmarkOverlay}>
            <View
              style={[
                s.checkCircle,
                compareSelection.includes(item.id) && s.checkCircleActive,
              ]}
            />
          </View>
        )}
        <View style={s.viewBadge}>
          <Text style={s.viewBadgeText}>{item.view}</Text>
        </View>
        <View style={s.photoDate}>
          <Text style={s.photoDateText}>
            {format(new Date(item.taken_at), 'MMM d, yyyy')}
          </Text>
        </View>
      </View>
    </Pressable>
  );

  return (
    <View style={shared.screen}>
      {/* Header controls */}
      <View style={s.headerWrap}>
        <View style={s.headerRow}>
          <View>
            <Text style={shared.pageTitle}>Progress Photos</Text>
            <Text style={shared.pageSubtitle}>Track visual changes over time</Text>
          </View>
          <Pressable
            onPress={() => {
              setCompareMode((prev) => !prev);
              setCompareSelection([]);
            }}
            style={[
              s.compareBtnOuter,
              compareMode && s.compareBtnActive,
            ]}
          >
            <Text style={[s.compareBtnText, compareMode && s.compareBtnTextActive]}>
              {compareMode ? 'Comparing' : 'Compare'}
            </Text>
          </Pressable>
        </View>

        {/* Upload controls */}
        <View style={s.uploadRow}>
          <View style={s.viewSelectorWrap}>
            {UPLOAD_VIEWS.map((v) => (
              <Pressable
                key={v}
                onPress={() => setUploadView(v)}
                style={[s.viewSelectorBtn, uploadView === v && s.viewSelectorBtnActive]}
              >
                <Text style={[s.viewSelectorText, uploadView === v && s.viewSelectorTextActive]}>
                  {v}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={{ flex: 1 }} />

          {Platform.OS !== 'web' && (
            <Pressable
              onPress={handleCamera}
              disabled={isUploading}
              style={s.cameraBtn}
            >
              <Ionicons name="camera" size={18} color={colors.tealLight} />
            </Pressable>
          )}

          <Pressable
            onPress={handleUpload}
            disabled={isUploading}
            style={[shared.btnPrimary, s.uploadBtn, isUploading && { opacity: 0.5 }]}
          >
            <Ionicons name="cloud-upload" size={18} color="#fff" />
            <Text style={shared.btnPrimaryText}>
              {isUploading ? 'Uploading...' : 'Upload'}
            </Text>
          </Pressable>
        </View>

        {/* View filter pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={s.filterPillRow}>
            {VIEWS.map((view) => (
              <Pressable
                key={view}
                onPress={() => setSelectedView(view)}
                style={[s.filterPill, selectedView === view && s.filterPillActive]}
              >
                <Text style={[s.filterPillText, selectedView === view && s.filterPillTextActive]}>
                  {view}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {compareMode && (
          <View style={s.compareBar}>
            <Text style={s.compareBarText}>
              Selected {compareSelection.length}/2
            </Text>
            <Pressable
              onPress={openCompare}
              style={[
                s.compareViewBtn,
                compareSelection.length === 2 && s.compareViewBtnReady,
              ]}
            >
              <Text style={[s.compareViewBtnText, compareSelection.length === 2 && s.compareViewBtnTextReady]}>
                View Compare
              </Text>
            </Pressable>
            <Pressable onPress={clearCompare} style={s.compareClearBtn}>
              <Text style={s.compareClearText}>Clear</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Photo grid */}
      {isLoading ? (
        <View style={{ padding: spacing['3xl'] }}>
          <LoadingState label="Loading photos..." />
        </View>
      ) : filteredPhotos.length === 0 ? (
        <View style={shared.emptyState}>
          <Ionicons name="camera-outline" size={48} color={colors.textMuted} />
          <Text style={shared.emptyStateTitle}>No photos yet</Text>
          <Text style={shared.emptyStateText}>
            Upload your first progress photos to start tracking
          </Text>
          <Pressable onPress={handleUpload} style={[shared.btnPrimary, { marginTop: spacing.lg }]}>
            <Ionicons name="cloud-upload" size={18} color="#fff" />
            <Text style={shared.btnPrimaryText}>Upload Photos</Text>
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
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tealLight} />
          }
        />
      )}

      <Modal visible={compareOpen} animationType="slide" onRequestClose={clearCompare}>
        <View style={s.compareModal}>
          <View style={s.compareModalHeader}>
            <Text style={s.compareModalTitle}>Compare Photos</Text>
            <Pressable onPress={clearCompare} style={shared.btnSecondary}>
              <Text style={shared.btnSecondaryText}>Close</Text>
            </Pressable>
          </View>
          <View style={s.compareImagesRow}>
            {compareSelection.map((id) => {
              const photo = photos.find((p) => p.id === id);
              if (!photo) return null;
              return (
                <View key={photo.id} style={s.compareImage}>
                  <Image
                    source={{ uri: photo.public_url }}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                  />
                  <View style={s.compareOverlay}>
                    <Text style={s.compareViewLabel}>{photo.view}</Text>
                    <Text style={s.compareDateLabel}>
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
  compareBtnOuter: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgBase,
  },
  compareBtnActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  compareBtnText: {
    ...typography.small,
    color: colors.textSecondary,
  },
  compareBtnTextActive: {
    color: '#fff',
  },
  uploadRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    alignItems: 'center',
  },
  viewSelectorWrap: {
    flexDirection: 'row',
    backgroundColor: colors.bgBase,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
  },
  viewSelectorBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.sm,
  },
  viewSelectorBtnActive: {
    backgroundColor: colors.teal,
  },
  viewSelectorText: {
    ...typography.small,
    color: colors.textTertiary,
    textTransform: 'capitalize',
  },
  viewSelectorTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  cameraBtn: {
    backgroundColor: colors.bgCard,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
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
  compareBar: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  compareBarText: {
    ...typography.small,
    color: colors.textSecondary,
  },
  compareViewBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.full,
    backgroundColor: colors.bgCard,
  },
  compareViewBtnReady: {
    backgroundColor: colors.teal,
  },
  compareViewBtnText: {
    ...typography.small,
    color: colors.textTertiary,
  },
  compareViewBtnTextReady: {
    color: '#fff',
  },
  compareClearBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.full,
    backgroundColor: colors.bgBase,
  },
  compareClearText: {
    ...typography.small,
    color: colors.textTertiary,
  },
  photoCard: {
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  checkmarkOverlay: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
  },
  checkCircle: {
    height: 24,
    width: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    backgroundColor: colors.bgOverlay,
  },
  checkCircleActive: {
    backgroundColor: colors.teal,
    borderColor: colors.tealLight,
  },
  viewBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: colors.bgOverlay,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
  viewBadgeText: {
    ...typography.small,
    color: colors.textPrimary,
    textTransform: 'capitalize',
  },
  photoDate: {
    padding: spacing.sm,
  },
  photoDateText: {
    ...typography.small,
    color: colors.textTertiary,
  },
  compareModal: {
    flex: 1,
    backgroundColor: colors.bgDeep,
    padding: spacing.lg,
  },
  compareModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  compareModalTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  compareImagesRow: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.md,
  },
  compareImage: {
    flex: 1,
    borderRadius: radii.xl,
    overflow: 'hidden',
    backgroundColor: colors.bgBase,
  },
  compareOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.bgOverlay,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  compareViewLabel: {
    ...typography.small,
    color: colors.textPrimary,
    textTransform: 'capitalize',
  },
  compareDateLabel: {
    ...typography.tiny,
    color: colors.textSecondary,
  },
});

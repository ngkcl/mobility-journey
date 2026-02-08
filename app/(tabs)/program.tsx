import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getSupabase } from '../../lib/supabase';
import { colors, typography, spacing, radii } from '@/lib/theme';
import type {
  MonthlyProgram,
  ProgramExercise,
  CoachAssignment,
  Exercise,
} from '../../lib/types';

const TEAL = colors.teal;
const SLATE_800 = colors.bgCard;
const SLATE_700 = 'rgba(51, 65, 85, 1)';
const SLATE_400 = colors.textTertiary;
const BG = colors.bgDeep;
const CARD_BG = colors.bgBase;

type SessionSlot = 'morning' | 'midday' | 'evening' | 'gym';

const SESSION_COLORS: Record<string, string> = {
  morning: colors.morning,
  midday: colors.midday,
  evening: colors.evening,
  gym: colors.error,
};

const SESSION_ICONS: Record<string, string> = {
  morning: 'sunny',
  midday: 'partly-sunny',
  evening: 'moon',
  gym: 'barbell',
};

const PRIORITY_COLORS: Record<string, string> = {
  high: colors.error,
  normal: colors.teal,
};

const SOURCE_LABELS: Record<string, string> = {
  coach: '🏋️ Coach',
  physio: '🩺 Physio',
  self: '🙋 Self',
};

export default function ProgramScreen() {
  const [program, setProgram] = useState<MonthlyProgram | null>(null);
  const [programExercises, setProgramExercises] = useState<ProgramExercise[]>([]);
  const [coachAssignments, setCoachAssignments] = useState<CoachAssignment[]>([]);
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [swapTarget, setSwapTarget] = useState<ProgramExercise | null>(null);

  // Coach assignment form state
  const [newAssignment, setNewAssignment] = useState({
    exercise_id: '',
    session_slot: '' as string,
    sets: '2',
    reps: '10',
    hold_seconds: '',
    side: 'bilateral',
    priority: 'normal' as 'high' | 'normal',
    coach_notes: '',
    source: 'self' as 'coach' | 'physio' | 'self',
  });

  const supabase = getSupabase();

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch active program
      const { data: programs } = await supabase
        .from('monthly_programs')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(1);

      if (programs && programs.length > 0) {
        setProgram(programs[0]);

        // Fetch program exercises with exercise details
        const { data: pe } = await supabase
          .from('program_exercises')
          .select('*, exercises(*)')
          .eq('program_id', programs[0].id)
          .order('order_index', { ascending: true });

        setProgramExercises(pe || []);
      }

      // Fetch coach assignments with exercise details
      const { data: ca } = await supabase
        .from('coach_assignments')
        .select('*, exercises(*)')
        .eq('completed', false)
        .order('created_at', { ascending: false });

      setCoachAssignments(ca || []);

      // Fetch all exercises for the add/swap modals
      const { data: exercises } = await supabase
        .from('exercises')
        .select('*')
        .order('name');

      setAllExercises(exercises || []);
    } catch (err) {
      console.error('Failed to fetch program data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const groupBySlot = (exercises: ProgramExercise[]): Record<string, ProgramExercise[]> => {
    const grouped: Record<string, ProgramExercise[]> = {};
    for (const ex of exercises) {
      if (!grouped[ex.session_slot]) grouped[ex.session_slot] = [];
      grouped[ex.session_slot].push(ex);
    }
    return grouped;
  };

  const handleAddAssignment = async () => {
    if (!newAssignment.exercise_id) {
      Alert.alert('Error', 'Please select an exercise');
      return;
    }

    try {
      const { error } = await supabase.from('coach_assignments').insert({
        exercise_id: newAssignment.exercise_id,
        session_slot: newAssignment.session_slot || null,
        sets: newAssignment.sets ? parseInt(newAssignment.sets) : null,
        reps: newAssignment.reps ? parseInt(newAssignment.reps) : null,
        hold_seconds: newAssignment.hold_seconds ? parseInt(newAssignment.hold_seconds) : null,
        side: newAssignment.side,
        priority: newAssignment.priority,
        coach_notes: newAssignment.coach_notes || null,
        source: newAssignment.source,
      });

      if (error) throw error;

      setShowAddModal(false);
      setNewAssignment({
        exercise_id: '',
        session_slot: '',
        sets: '2',
        reps: '10',
        hold_seconds: '',
        side: 'bilateral',
        priority: 'normal',
        coach_notes: '',
        source: 'self',
      });
      fetchData();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleCompleteAssignment = async (id: string) => {
    try {
      await supabase.from('coach_assignments').update({ completed: true }).eq('id', id);
      fetchData();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  const handleDeleteAssignment = async (id: string) => {
    Alert.alert('Delete Assignment', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await supabase.from('coach_assignments').delete().eq('id', id);
            fetchData();
          } catch (err: any) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  const handleSwapExercise = async (newExerciseId: string) => {
    if (!swapTarget) return;
    try {
      await supabase
        .from('program_exercises')
        .update({ exercise_id: newExerciseId })
        .eq('id', swapTarget.id);
      setShowSwapModal(false);
      setSwapTarget(null);
      fetchData();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={TEAL} />
        <Text style={styles.loadingText}>Loading program...</Text>
      </View>
    );
  }

  const grouped = groupBySlot(programExercises);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Program header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Ionicons name="calendar" size={24} color={TEAL} />
          <Text style={styles.title}>{program?.name || 'No Active Program'}</Text>
        </View>
        {program?.notes && <Text style={styles.subtitle}>{program.notes}</Text>}
      </View>

      {/* Base Program by session */}
      <Text style={styles.sectionTitle}>📋 Base Program</Text>
      {(['morning', 'midday', 'evening', 'gym'] as SessionSlot[]).map((slot) => {
        const exercises = grouped[slot];
        if (!exercises?.length) return null;
        const color = SESSION_COLORS[slot];
        const icon = SESSION_ICONS[slot];

        return (
          <View key={slot} style={styles.sessionCard}>
            <View style={styles.sessionHeader}>
              <View style={[styles.sessionBadge, { backgroundColor: color + '22' }]}>
                <Ionicons name={icon as any} size={18} color={color} />
              </View>
              <Text style={[styles.sessionTitle, { color }]}>
                {slot.charAt(0).toUpperCase() + slot.slice(1)}
              </Text>
              <Text style={styles.exerciseCount}>{exercises.length} exercises</Text>
            </View>

            {exercises.map((pe) => (
              <View key={pe.id} style={styles.exerciseRow}>
                <View style={styles.exerciseInfo}>
                  <Text style={styles.exerciseName}>
                    {pe.exercises?.name || 'Unknown'}
                    {pe.mandatory && <Text style={styles.mandatoryBadge}> ★</Text>}
                  </Text>
                  <Text style={styles.exerciseDetails}>
                    {pe.sets && `${pe.sets} sets`}
                    {pe.reps && ` × ${pe.reps} reps`}
                    {pe.hold_seconds && ` × ${pe.hold_seconds}s hold`}
                    {pe.side !== 'bilateral' && ` • ${pe.side}`}
                  </Text>
                  {pe.notes && <Text style={styles.exerciseNotes}>{pe.notes}</Text>}
                </View>
                <Pressable
                  style={styles.swapButton}
                  onPress={() => {
                    setSwapTarget(pe);
                    setShowSwapModal(true);
                  }}
                >
                  <Ionicons name="swap-horizontal" size={18} color={SLATE_400} />
                </Pressable>
              </View>
            ))}
          </View>
        );
      })}

      {/* Coach Assignments */}
      <View style={styles.coachSection}>
        <View style={styles.coachHeader}>
          <Text style={styles.sectionTitle}>🎯 Coach Assignments</Text>
          <Pressable style={styles.addButton} onPress={() => setShowAddModal(true)}>
            <Ionicons name="add-circle" size={24} color={TEAL} />
            <Text style={styles.addButtonText}>Add</Text>
          </Pressable>
        </View>

        {coachAssignments.length === 0 && (
          <Text style={styles.emptyText}>No active coach assignments</Text>
        )}

        {coachAssignments.map((ca) => (
          <View key={ca.id} style={styles.assignmentCard}>
            <View style={styles.assignmentHeader}>
              <View
                style={[
                  styles.priorityDot,
                  { backgroundColor: PRIORITY_COLORS[ca.priority] || TEAL },
                ]}
              />
              <Text style={styles.assignmentName}>
                {ca.exercises?.name || 'Unknown'}
              </Text>
              <Text style={styles.sourceLabel}>
                {SOURCE_LABELS[ca.source] || ca.source}
              </Text>
            </View>

            <View style={styles.assignmentDetails}>
              {ca.sets && <Text style={styles.detailChip}>{ca.sets} sets</Text>}
              {ca.reps && <Text style={styles.detailChip}>{ca.reps} reps</Text>}
              {ca.hold_seconds && (
                <Text style={styles.detailChip}>{ca.hold_seconds}s hold</Text>
              )}
              {ca.side && <Text style={styles.detailChip}>{ca.side}</Text>}
              {ca.session_slot && (
                <Text style={[styles.detailChip, { backgroundColor: (SESSION_COLORS[ca.session_slot] || TEAL) + '33' }]}>
                  {ca.session_slot}
                </Text>
              )}
              {ca.priority === 'high' && (
                <Text style={[styles.detailChip, { backgroundColor: '#ef444433' }]}>
                  ⚡ HIGH
                </Text>
              )}
            </View>

            {ca.coach_notes && (
              <Text style={styles.coachNotes}>💬 {ca.coach_notes}</Text>
            )}

            <View style={styles.assignmentActions}>
              <Pressable
                style={styles.actionButton}
                onPress={() => handleCompleteAssignment(ca.id)}
              >
                <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                <Text style={[styles.actionText, { color: colors.success }]}>Done</Text>
              </Pressable>
              <Pressable
                style={styles.actionButton}
                onPress={() => handleDeleteAssignment(ca.id)}
              >
                <Ionicons name="trash" size={20} color={colors.error} />
                <Text style={[styles.actionText, { color: colors.error }]}>Remove</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      {/* Add Coach Assignment Modal */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Coach Assignment</Text>
              <Pressable onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color={SLATE_400} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalScroll}>
              <Text style={styles.fieldLabel}>Exercise *</Text>
              <ScrollView style={styles.exercisePicker} nestedScrollEnabled>
                {allExercises.map((ex) => (
                  <Pressable
                    key={ex.id}
                    style={[
                      styles.exerciseOption,
                      newAssignment.exercise_id === ex.id && styles.exerciseOptionSelected,
                    ]}
                    onPress={() => setNewAssignment((p) => ({ ...p, exercise_id: ex.id }))}
                  >
                    <Text
                      style={[
                        styles.exerciseOptionText,
                        newAssignment.exercise_id === ex.id && styles.exerciseOptionTextSelected,
                      ]}
                    >
                      {ex.name}
                    </Text>
                    <Text style={styles.exerciseCategoryChip}>{ex.category}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Text style={styles.fieldLabel}>Session Slot</Text>
              <View style={styles.chipRow}>
                {['', 'morning', 'midday', 'evening', 'gym'].map((slot) => (
                  <Pressable
                    key={slot || 'any'}
                    style={[
                      styles.chip,
                      newAssignment.session_slot === slot && styles.chipSelected,
                    ]}
                    onPress={() => setNewAssignment((p) => ({ ...p, session_slot: slot }))}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        newAssignment.session_slot === slot && styles.chipTextSelected,
                      ]}
                    >
                      {slot || 'Any'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.fieldRow}>
                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>Sets</Text>
                  <TextInput
                    style={styles.input}
                    value={newAssignment.sets}
                    onChangeText={(t) => setNewAssignment((p) => ({ ...p, sets: t }))}
                    keyboardType="number-pad"
                    placeholderTextColor={SLATE_400}
                  />
                </View>
                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>Reps</Text>
                  <TextInput
                    style={styles.input}
                    value={newAssignment.reps}
                    onChangeText={(t) => setNewAssignment((p) => ({ ...p, reps: t }))}
                    keyboardType="number-pad"
                    placeholderTextColor={SLATE_400}
                  />
                </View>
              </View>

              <View style={styles.fieldRow}>
                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>Hold (sec)</Text>
                  <TextInput
                    style={styles.input}
                    value={newAssignment.hold_seconds}
                    onChangeText={(t) => setNewAssignment((p) => ({ ...p, hold_seconds: t }))}
                    keyboardType="number-pad"
                    placeholder="—"
                    placeholderTextColor={SLATE_400}
                  />
                </View>
                <View style={styles.fieldHalf}>
                  <Text style={styles.fieldLabel}>Side</Text>
                  <View style={styles.chipRow}>
                    {['bilateral', 'left', 'right'].map((s) => (
                      <Pressable
                        key={s}
                        style={[styles.chip, newAssignment.side === s && styles.chipSelected]}
                        onPress={() => setNewAssignment((p) => ({ ...p, side: s }))}
                      >
                        <Text
                          style={[
                            styles.chipText,
                            newAssignment.side === s && styles.chipTextSelected,
                          ]}
                        >
                          {s}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              </View>

              <Text style={styles.fieldLabel}>Priority</Text>
              <View style={styles.chipRow}>
                {(['normal', 'high'] as const).map((p) => (
                  <Pressable
                    key={p}
                    style={[
                      styles.chip,
                      newAssignment.priority === p && styles.chipSelected,
                      p === 'high' && newAssignment.priority === 'high' && { backgroundColor: '#ef444444' },
                    ]}
                    onPress={() => setNewAssignment((prev) => ({ ...prev, priority: p }))}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        newAssignment.priority === p && styles.chipTextSelected,
                      ]}
                    >
                      {p === 'high' ? '⚡ High' : 'Normal'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Source</Text>
              <View style={styles.chipRow}>
                {(['self', 'coach', 'physio'] as const).map((s) => (
                  <Pressable
                    key={s}
                    style={[styles.chip, newAssignment.source === s && styles.chipSelected]}
                    onPress={() => setNewAssignment((prev) => ({ ...prev, source: s }))}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        newAssignment.source === s && styles.chipTextSelected,
                      ]}
                    >
                      {SOURCE_LABELS[s]}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.fieldLabel}>Notes</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={newAssignment.coach_notes}
                onChangeText={(t) => setNewAssignment((p) => ({ ...p, coach_notes: t }))}
                placeholder="Coach instructions, form cues..."
                placeholderTextColor={SLATE_400}
                multiline
                numberOfLines={3}
              />

              <Pressable style={styles.saveButton} onPress={handleAddAssignment}>
                <Text style={styles.saveButtonText}>Add Assignment</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Swap Exercise Modal */}
      <Modal visible={showSwapModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Swap: {swapTarget?.exercises?.name}
              </Text>
              <Pressable
                onPress={() => {
                  setShowSwapModal(false);
                  setSwapTarget(null);
                }}
              >
                <Ionicons name="close" size={24} color={SLATE_400} />
              </Pressable>
            </View>
            <ScrollView style={styles.exercisePicker}>
              {allExercises
                .filter((ex) => ex.id !== swapTarget?.exercise_id)
                .map((ex) => (
                  <Pressable
                    key={ex.id}
                    style={styles.exerciseOption}
                    onPress={() => handleSwapExercise(ex.id)}
                  >
                    <Text style={styles.exerciseOptionText}>{ex.name}</Text>
                    <Text style={styles.exerciseCategoryChip}>{ex.category}</Text>
                  </Pressable>
                ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: SLATE_400,
    marginTop: 12,
    fontSize: 14,
  },
  header: {
    marginBottom: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: SLATE_400,
    marginTop: 6,
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textSecondary,
    marginBottom: 12,
    marginTop: 4,
  },
  sessionCard: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.5)',
  },
  sessionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  sessionBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sessionTitle: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  exerciseCount: {
    fontSize: 12,
    color: SLATE_400,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(51,65,85,0.3)',
  },
  exerciseInfo: {
    flex: 1,
  },
  exerciseName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  mandatoryBadge: {
    color: '#f59e0b',
    fontSize: 12,
  },
  exerciseDetails: {
    fontSize: 12,
    color: SLATE_400,
    marginTop: 2,
  },
  exerciseNotes: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
    fontStyle: 'italic',
  },
  swapButton: {
    padding: 8,
  },
  coachSection: {
    marginTop: 12,
  },
  coachHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addButtonText: {
    color: TEAL,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyText: {
    color: '#64748b',
    fontSize: 14,
    textAlign: 'center',
    paddingVertical: 20,
  },
  assignmentCard: {
    backgroundColor: CARD_BG,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(51,65,85,0.5)',
  },
  assignmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  assignmentName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
  },
  sourceLabel: {
    fontSize: 11,
    color: SLATE_400,
  },
  assignmentDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  detailChip: {
    backgroundColor: SLATE_800,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    fontSize: 11,
    color: colors.textSecondary,
    overflow: 'hidden',
  },
  coachNotes: {
    fontSize: 12,
    color: '#94a3b8',
    marginBottom: 8,
    lineHeight: 17,
  },
  assignmentActions: {
    flexDirection: 'row',
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(51,65,85,0.3)',
    paddingTop: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: SLATE_700,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  modalScroll: {
    padding: 16,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 6,
    marginTop: 12,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 12,
  },
  fieldHalf: {
    flex: 1,
  },
  input: {
    backgroundColor: SLATE_800,
    borderRadius: 10,
    padding: 12,
    color: colors.textPrimary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: SLATE_700,
  },
  textArea: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  exercisePicker: {
    maxHeight: 200,
    borderWidth: 1,
    borderColor: SLATE_700,
    borderRadius: 10,
  },
  exerciseOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(51,65,85,0.3)',
  },
  exerciseOptionSelected: {
    backgroundColor: TEAL + '22',
  },
  exerciseOptionText: {
    fontSize: 14,
    color: colors.textSecondary,
    flex: 1,
  },
  exerciseOptionTextSelected: {
    color: TEAL,
    fontWeight: '600',
  },
  exerciseCategoryChip: {
    fontSize: 10,
    color: SLATE_400,
    backgroundColor: SLATE_800,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: SLATE_800,
    borderWidth: 1,
    borderColor: SLATE_700,
  },
  chipSelected: {
    backgroundColor: TEAL + '33',
    borderColor: TEAL,
  },
  chipText: {
    fontSize: 12,
    color: SLATE_400,
  },
  chipTextSelected: {
    color: TEAL,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: TEAL,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 20,
  },
  saveButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
});

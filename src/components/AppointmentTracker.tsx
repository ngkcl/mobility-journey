'use client';

import { useEffect, useMemo, useState } from 'react';
import { Calendar, Plus, Stethoscope, Trash2 } from 'lucide-react';
import { compareAsc, compareDesc, format, isAfter, isBefore, isEqual, startOfDay } from 'date-fns';
import { getSupabase } from '@/lib/supabaseClient';
import LoadingState from '@/components/LoadingState';
import { useToast } from '@/components/ToastProvider';

type SpecialistType = 'physio' | 'chiro' | 'ortho' | 'massage' | 'other';

interface Appointment {
  id: string;
  appointmentDate: string;
  specialistName: string;
  specialistType: SpecialistType;
  notes?: string;
  recommendations?: string;
  followUpDate?: string;
}

const specialistTypeLabel: Record<SpecialistType, string> = {
  physio: 'Physio',
  chiro: 'Chiropractor',
  ortho: 'Orthopedist',
  massage: 'Massage',
  other: 'Other',
};

const parseDateOnly = (dateStr: string) => new Date(`${dateStr}T00:00:00`);

export default function AppointmentTracker() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newAppointment, setNewAppointment] = useState<Partial<Appointment>>({
    specialistType: 'physio',
  });
  const { pushToast } = useToast();

  useEffect(() => {
    let isMounted = true;

    const loadAppointments = async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('appointments')
        .select('id, appointment_date, specialist_name, specialist_type, notes, recommendations, follow_up_date')
        .order('appointment_date', { ascending: false });

      if (error) {
        console.error('Failed to load appointments', error);
        if (isMounted) {
          setIsLoading(false);
          pushToast('Failed to load appointments. Please try again.', 'error');
        }
        return;
      }

      const normalized = (data ?? []).map((row) => ({
        id: row.id,
        appointmentDate: row.appointment_date,
        specialistName: row.specialist_name,
        specialistType: (row.specialist_type ?? 'other') as SpecialistType,
        notes: row.notes ?? undefined,
        recommendations: row.recommendations ?? undefined,
        followUpDate: row.follow_up_date ?? undefined,
      }));

      if (isMounted) {
        setAppointments(normalized);
        setIsLoading(false);
      }
    };

    loadAppointments();

    return () => {
      isMounted = false;
    };
  }, [pushToast]);

  const addAppointment = async () => {
    if (!newAppointment.appointmentDate || !newAppointment.specialistName || !newAppointment.specialistType) return;

    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('appointments')
      .insert({
        appointment_date: newAppointment.appointmentDate,
        specialist_name: newAppointment.specialistName,
        specialist_type: newAppointment.specialistType,
        notes: newAppointment.notes ?? null,
        recommendations: newAppointment.recommendations ?? null,
        follow_up_date: newAppointment.followUpDate ?? null,
      })
      .select('id, appointment_date, specialist_name, specialist_type, notes, recommendations, follow_up_date')
      .single();

    if (error || !data) {
      console.error('Failed to save appointment', error);
      pushToast('Failed to save appointment. Please try again.', 'error');
      return;
    }

    const appointment: Appointment = {
      id: data.id,
      appointmentDate: data.appointment_date,
      specialistName: data.specialist_name,
      specialistType: (data.specialist_type ?? 'other') as SpecialistType,
      notes: data.notes ?? undefined,
      recommendations: data.recommendations ?? undefined,
      followUpDate: data.follow_up_date ?? undefined,
    };

    setAppointments((prev) => [appointment, ...prev]);
    setNewAppointment({ specialistType: 'physio' });
    setShowForm(false);
  };

  const deleteAppointment = async (id: string) => {
    if (!confirm('Delete this appointment?')) return;
    const supabase = getSupabase();
    const previous = appointments;
    setAppointments((prev) => prev.filter((item) => item.id !== id));
    const { error } = await supabase.from('appointments').delete().eq('id', id);
    if (error) {
      setAppointments(previous);
      console.error('Failed to delete appointment', error);
      pushToast('Failed to delete appointment. Restored.', 'error');
    }
  };

  const today = useMemo(() => startOfDay(new Date()), []);

  const { upcoming, history } = useMemo(() => {
    const upcomingAppointments = appointments
      .filter((appointment) => {
        const date = startOfDay(parseDateOnly(appointment.appointmentDate));
        return isAfter(date, today) || isEqual(date, today);
      })
      .sort((a, b) => compareAsc(parseDateOnly(a.appointmentDate), parseDateOnly(b.appointmentDate)));

    const historyAppointments = appointments
      .filter((appointment) => {
        const date = startOfDay(parseDateOnly(appointment.appointmentDate));
        return isBefore(date, today);
      })
      .sort((a, b) => compareDesc(parseDateOnly(a.appointmentDate), parseDateOnly(b.appointmentDate)));

    return { upcoming: upcomingAppointments, history: historyAppointments };
  }, [appointments, today]);

  const nextAppointment = upcoming[0];

  return (
    <section className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">Appointments</h3>
          <p className="text-sm text-slate-400">Upcoming visits, history, and specialist recommendations</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-emerald-500/90 text-white rounded-xl hover:bg-emerald-400 transition-colors flex items-center gap-2 shadow-lg shadow-emerald-500/20"
        >
          <Plus size={18} />
          <span>Add Appointment</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/70 rounded-2xl p-4 border border-slate-800/70 shadow-lg shadow-black/20">
          <div className="text-2xl font-bold text-emerald-300">{upcoming.length}</div>
          <div className="text-slate-400 text-sm">Upcoming</div>
        </div>
        <div className="bg-slate-900/70 rounded-2xl p-4 border border-slate-800/70 shadow-lg shadow-black/20">
          <div className="text-2xl font-bold text-sky-300">{history.length}</div>
          <div className="text-slate-400 text-sm">Past Visits</div>
        </div>
        <div className="bg-slate-900/70 rounded-2xl p-4 border border-slate-800/70 shadow-lg shadow-black/20">
          <div className="text-sm text-slate-400">Next Appointment</div>
          {nextAppointment ? (
            <div className="mt-2">
              <div className="text-white font-semibold">{nextAppointment.specialistName}</div>
              <div className="text-sm text-slate-400">{format(parseDateOnly(nextAppointment.appointmentDate), 'MMM d, yyyy')}</div>
            </div>
          ) : (
            <div className="mt-2 text-slate-500 text-sm">None scheduled</div>
          )}
        </div>
      </div>

      {showForm && (
        <div className="bg-slate-900/70 rounded-2xl p-6 border border-slate-800/70 shadow-lg shadow-black/20">
          <h4 className="text-lg font-semibold text-white mb-4">Schedule Appointment</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-300 mb-1">Appointment Date</label>
              <input
                type="date"
                value={newAppointment.appointmentDate || ''}
                onChange={(e) => setNewAppointment((prev) => ({ ...prev, appointmentDate: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/70 rounded-xl text-white focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Specialist Name</label>
              <input
                type="text"
                value={newAppointment.specialistName || ''}
                onChange={(e) => setNewAppointment((prev) => ({ ...prev, specialistName: e.target.value }))}
                placeholder="e.g., Dr. Lee"
                className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/70 rounded-xl text-white focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Specialist Type</label>
              <select
                value={newAppointment.specialistType || 'physio'}
                onChange={(e) => setNewAppointment((prev) => ({ ...prev, specialistType: e.target.value as SpecialistType }))}
                className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/70 rounded-xl text-white focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              >
                {Object.entries(specialistTypeLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Follow-up Date (optional)</label>
              <input
                type="date"
                value={newAppointment.followUpDate || ''}
                onChange={(e) => setNewAppointment((prev) => ({ ...prev, followUpDate: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/70 rounded-xl text-white focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-slate-300 mb-1">Notes (optional)</label>
              <textarea
                value={newAppointment.notes || ''}
                onChange={(e) => setNewAppointment((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Symptoms, tests, or context"
                className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/70 rounded-xl text-white focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none h-20"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-slate-300 mb-1">Recommendations (optional)</label>
              <textarea
                value={newAppointment.recommendations || ''}
                onChange={(e) => setNewAppointment((prev) => ({ ...prev, recommendations: e.target.value }))}
                placeholder="Exercises, treatment plan, next steps"
                className="w-full px-3 py-2 bg-slate-900/70 border border-slate-700/70 rounded-xl text-white focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 resize-none h-20"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={addAppointment}
              className="px-4 py-2 bg-emerald-500 text-white rounded-xl hover:bg-emerald-400 transition-colors"
            >
              Save Appointment
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-slate-800/70 text-slate-300 rounded-xl hover:bg-slate-700/70 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-slate-900/60 rounded-2xl p-6 border border-slate-800/70 shadow-lg shadow-black/20">
          <div className="flex items-center gap-2 text-white font-semibold mb-4">
            <Calendar size={18} />
            Upcoming Appointments
          </div>
          {isLoading ? (
            <LoadingState label="Loading appointments..." />
          ) : upcoming.length === 0 ? (
            <div className="rounded-xl border border-slate-800/70 border-dashed p-4 text-sm text-slate-400">
              No upcoming visits scheduled.
            </div>
          ) : (
            <div className="space-y-3">
              {upcoming.map((appointment) => (
                <div key={appointment.id} className="rounded-xl border border-slate-800/70 bg-slate-900/70 p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <div className="text-white font-medium">{appointment.specialistName}</div>
                      <div className="text-sm text-slate-400">{specialistTypeLabel[appointment.specialistType]}</div>
                    </div>
                    <div className="text-sm text-slate-300">{format(parseDateOnly(appointment.appointmentDate), 'MMM d, yyyy')}</div>
                  </div>
                  {(appointment.notes || appointment.recommendations || appointment.followUpDate) && (
                    <div className="mt-3 text-xs text-slate-400 space-y-1">
                      {appointment.followUpDate && (
                        <div>Follow-up: {format(parseDateOnly(appointment.followUpDate), 'MMM d, yyyy')}</div>
                      )}
                      {appointment.recommendations && <div>Recommendations: {appointment.recommendations}</div>}
                      {appointment.notes && <div>Notes: {appointment.notes}</div>}
                    </div>
                  )}
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() => deleteAppointment(appointment.id)}
                      className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800/70 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-slate-900/60 rounded-2xl p-6 border border-slate-800/70 shadow-lg shadow-black/20">
          <div className="flex items-center gap-2 text-white font-semibold mb-4">
            <Stethoscope size={18} />
            Visit History
          </div>
          {isLoading ? (
            <LoadingState label="Loading history..." />
          ) : history.length === 0 ? (
            <div className="rounded-xl border border-slate-800/70 border-dashed p-4 text-sm text-slate-400">
              No past visits logged yet.
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((appointment) => (
                <div key={appointment.id} className="rounded-xl border border-slate-800/70 bg-slate-900/70 p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <div className="text-white font-medium">{appointment.specialistName}</div>
                      <div className="text-sm text-slate-400">{specialistTypeLabel[appointment.specialistType]}</div>
                    </div>
                    <div className="text-sm text-slate-300">{format(parseDateOnly(appointment.appointmentDate), 'MMM d, yyyy')}</div>
                  </div>
                  {(appointment.notes || appointment.recommendations || appointment.followUpDate) && (
                    <div className="mt-3 text-xs text-slate-400 space-y-1">
                      {appointment.followUpDate && (
                        <div>Follow-up: {format(parseDateOnly(appointment.followUpDate), 'MMM d, yyyy')}</div>
                      )}
                      {appointment.recommendations && <div>Recommendations: {appointment.recommendations}</div>}
                      {appointment.notes && <div>Notes: {appointment.notes}</div>}
                    </div>
                  )}
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() => deleteAppointment(appointment.id)}
                      className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800/70 rounded-lg transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

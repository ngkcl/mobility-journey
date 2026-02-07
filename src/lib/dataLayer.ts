import { getSupabase } from '@/lib/supabaseClient';

type TableName = 'photos' | 'metrics' | 'analysis_logs' | 'todos' | 'videos';

type RowPayload = Record<string, unknown>;

type RowId = string;

export function fetchRows(table: TableName) {
  return getSupabase().from(table).select('*');
}

export function insertRow(table: TableName, payload: RowPayload) {
  return getSupabase().from(table).insert(payload).select('*').single();
}

export function updateRow(table: TableName, id: RowId, payload: RowPayload) {
  return getSupabase().from(table).update(payload).eq('id', id).select('*').single();
}

export function deleteRow(table: TableName, id: RowId) {
  return getSupabase().from(table).delete().eq('id', id);
}

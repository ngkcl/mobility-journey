import { describe, it, expect, vi, beforeEach } from 'vitest';

import { fetchRows, insertRow, updateRow, deleteRow } from '../dataLayer';
import { getSupabase } from '@/lib/supabaseClient';

vi.mock('@/lib/supabaseClient', () => ({
  getSupabase: vi.fn()
}));

const TABLES = ['photos', 'metrics', 'analysis_logs', 'todos', 'videos'] as const;

const getSupabaseMock = vi.mocked(getSupabase);

type SupabaseChain = {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
};

function setupSupabaseMock() {
  const chain: SupabaseChain = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    single: vi.fn()
  };
  const from = vi.fn(() => chain);
  getSupabaseMock.mockReturnValue({ from } as never);
  return { from, chain };
}

describe('dataLayer', () => {
  beforeEach(() => {
    getSupabaseMock.mockReset();
  });

  describe('fetchRows', () => {
    it.each(TABLES)('selects rows from %s', (table) => {
      const { from, chain } = setupSupabaseMock();
      const result = { data: [] };
      chain.select.mockReturnValue(result);

      const response = fetchRows(table);

      expect(getSupabaseMock).toHaveBeenCalledTimes(1);
      expect(from).toHaveBeenCalledWith(table);
      expect(chain.select).toHaveBeenCalledWith('*');
      expect(response).toBe(result);
    });
  });

  describe('insertRow', () => {
    it.each(TABLES)('inserts rows into %s', (table) => {
      const { from, chain } = setupSupabaseMock();
      const payload = { status: 'new' };
      const result = { data: { id: 'row-1' } };
      chain.insert.mockReturnValue(chain);
      chain.select.mockReturnValue(chain);
      chain.single.mockReturnValue(result);

      const response = insertRow(table, payload);

      expect(getSupabaseMock).toHaveBeenCalledTimes(1);
      expect(from).toHaveBeenCalledWith(table);
      expect(chain.insert).toHaveBeenCalledWith(payload);
      expect(chain.select).toHaveBeenCalledWith('*');
      expect(chain.single).toHaveBeenCalledTimes(1);
      expect(response).toBe(result);
    });
  });

  describe('updateRow', () => {
    it.each(TABLES)('updates rows in %s', (table) => {
      const { from, chain } = setupSupabaseMock();
      const payload = { status: 'updated' };
      const result = { data: { id: 'row-2' } };
      chain.update.mockReturnValue(chain);
      chain.eq.mockReturnValue(chain);
      chain.select.mockReturnValue(chain);
      chain.single.mockReturnValue(result);

      const response = updateRow(table, 'row-2', payload);

      expect(getSupabaseMock).toHaveBeenCalledTimes(1);
      expect(from).toHaveBeenCalledWith(table);
      expect(chain.update).toHaveBeenCalledWith(payload);
      expect(chain.eq).toHaveBeenCalledWith('id', 'row-2');
      expect(chain.select).toHaveBeenCalledWith('*');
      expect(chain.single).toHaveBeenCalledTimes(1);
      expect(response).toBe(result);
    });
  });

  describe('deleteRow', () => {
    it.each(TABLES)('deletes rows from %s', (table) => {
      const { from, chain } = setupSupabaseMock();
      const result = { error: null };
      chain.delete.mockReturnValue(chain);
      chain.eq.mockReturnValue(result);

      const response = deleteRow(table, 'row-3');

      expect(getSupabaseMock).toHaveBeenCalledTimes(1);
      expect(from).toHaveBeenCalledWith(table);
      expect(chain.delete).toHaveBeenCalledTimes(1);
      expect(chain.eq).toHaveBeenCalledWith('id', 'row-3');
      expect(response).toBe(result);
    });
  });
});

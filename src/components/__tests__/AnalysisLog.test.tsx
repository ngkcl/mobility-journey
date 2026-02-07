import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import AnalysisLog from '../AnalysisLog';
import { getSupabase } from '@/lib/supabaseClient';

const pushToast = vi.fn();

vi.mock('@/components/ToastProvider', () => ({
  useToast: () => ({ pushToast })
}));

vi.mock('@/lib/supabaseClient', () => ({
  getSupabase: vi.fn()
}));

const getSupabaseMock = vi.mocked(getSupabase);

function mockAnalysisQuery(data: unknown[] = [], error: unknown = null) {
  const order = vi.fn(() => ({ data, error }));
  const select = vi.fn(() => ({ order }));
  const from = vi.fn(() => ({ select }));
  getSupabaseMock.mockReturnValue({ from } as never);
  return { from, select, order };
}

describe('AnalysisLog', () => {
  beforeEach(() => {
    pushToast.mockReset();
    getSupabaseMock.mockReset();
  });

  it('shows empty state when no entries exist', async () => {
    mockAnalysisQuery([]);

    render(<AnalysisLog />);

    expect(
      await screen.findByText('No entries yet. Add your first analysis to start documenting your journey.')
    ).toBeInTheDocument();
  });

  it('filters entries by type', async () => {
    mockAnalysisQuery([
      {
        id: 'entry-1',
        entry_date: '2025-01-01',
        category: 'ai',
        title: 'AI Posture Review',
        content: 'AI notes'
      },
      {
        id: 'entry-2',
        entry_date: '2025-01-02',
        category: 'personal',
        title: 'Personal Note',
        content: 'Feeling better'
      }
    ]);

    render(<AnalysisLog />);

    expect(await screen.findByText('AI Posture Review')).toBeInTheDocument();
    expect(screen.getByText('Personal Note')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'AI Analysis' }));

    expect(screen.getByText('AI Posture Review')).toBeInTheDocument();
    expect(screen.queryByText('Personal Note')).not.toBeInTheDocument();
  });
});

import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { format } from 'date-fns';

import MetricsTracker from '../MetricsTracker';
import { getSupabase } from '@/lib/supabaseClient';

const pushToast = vi.fn();

vi.mock('@/components/ToastProvider', () => ({
  useToast: () => ({ pushToast })
}));

vi.mock('@/lib/supabaseClient', () => ({
  getSupabase: vi.fn()
}));

const getSupabaseMock = vi.mocked(getSupabase);

function mockMetricsQuery(data: unknown[] = [], error: unknown = null) {
  const order = vi.fn(() => ({ data, error }));
  const select = vi.fn(() => ({ order }));
  const from = vi.fn(() => ({ select }));
  getSupabaseMock.mockReturnValue({ from } as never);
  return { from, select, order };
}

describe('MetricsTracker', () => {
  beforeEach(() => {
    pushToast.mockReset();
    getSupabaseMock.mockReset();
  });

  it('shows empty state and allows opening the add form', async () => {
    mockMetricsQuery([]);

    render(<MetricsTracker />);

    expect(await screen.findByText('No check-ins yet. Start your first daily check-in!')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Daily Check-in' }));

    expect(screen.getByText('Save Check-in')).toBeInTheDocument();
  });

  it('renders entries with exercise stats', async () => {
    const entryDate = '2025-01-01T12:00:00.000Z';

    mockMetricsQuery([
      {
        id: 'entry-1',
        entry_date: entryDate,
        pain_level: 4,
        posture_score: 6,
        symmetry_score: 7,
        energy_level: 5,
        exercise_done: true,
        exercise_minutes: 20,
        exercise_names: 'Planks',
        functional_milestone: 'Held plank for 60s',
        rom_forward_bend: 30,
        rom_lateral: 20,
        rib_hump: 'mild',
        notes: 'Felt better'
      }
    ]);

    render(<MetricsTracker />);

    expect(await screen.findByText(format(new Date(entryDate), 'MMMM d, yyyy'))).toBeInTheDocument();
    expect(screen.getByText('1 sessions')).toBeInTheDocument();
    expect(screen.getByText(/20 minutes total/)).toBeInTheDocument();
    expect(screen.getByText(/Planks/)).toBeInTheDocument();
  });
});

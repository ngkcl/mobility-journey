import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ProgressCharts from '../ProgressCharts';
import { getSupabase } from '@/lib/supabaseClient';

const pushToast = vi.fn();

vi.mock('@/components/ToastProvider', () => ({
  useToast: () => ({ pushToast })
}));

vi.mock('@/lib/supabaseClient', () => ({
  getSupabase: vi.fn()
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div data-testid="responsive">{children}</div>
  ),
  LineChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Line: () => <div />,
  Area: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />
}));

const getSupabaseMock = vi.mocked(getSupabase);

function mockMetricsQuery(data: unknown[] = [], error: unknown = null) {
  const order = vi.fn(() => ({ data, error }));
  const select = vi.fn(() => ({ order }));
  const from = vi.fn(() => ({ select }));
  getSupabaseMock.mockReturnValue({ from } as never);
  return { from, select, order };
}

describe('ProgressCharts', () => {
  beforeEach(() => {
    pushToast.mockReset();
    getSupabaseMock.mockReset();
  });

  it('shows empty state when no chart data exists', async () => {
    mockMetricsQuery([]);

    render(<ProgressCharts />);

    expect(
      await screen.findByText('No data yet. Upload photos or add daily check-ins to see charts.')
    ).toBeInTheDocument();
    expect(screen.getByText('No data yet.')).toBeInTheDocument();
  });

  it('switches selected metric', async () => {
    mockMetricsQuery([
      {
        entry_date: '2025-01-01',
        pain_level: 6,
        posture_score: 4,
        symmetry_score: 5,
        energy_level: 7
      },
      {
        entry_date: '2025-01-02',
        pain_level: 5,
        posture_score: 5,
        symmetry_score: 6,
        energy_level: 8
      }
    ]);

    render(<ProgressCharts />);

    expect(await screen.findByText('Pain Level Over Time')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Energy Level/i }));

    expect(screen.getByText('Energy Level Over Time')).toBeInTheDocument();
  });
});

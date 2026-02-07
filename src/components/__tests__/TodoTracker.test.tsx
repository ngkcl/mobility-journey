import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { format } from 'date-fns';

import TodoTracker from '../TodoTracker';
import { getSupabase } from '@/lib/supabaseClient';

const pushToast = vi.fn();

vi.mock('@/components/ToastProvider', () => ({
  useToast: () => ({ pushToast })
}));

vi.mock('@/lib/supabaseClient', () => ({
  getSupabase: vi.fn()
}));

const getSupabaseMock = vi.mocked(getSupabase);

function mockTodoQuery(data: unknown[] = [], error: unknown = null) {
  const order = vi.fn(() => ({ data, error }));
  const select = vi.fn(() => ({ order }));
  const from = vi.fn(() => ({ select }));
  getSupabaseMock.mockReturnValue({ from } as never);
  return { from, select, order };
}

describe('TodoTracker', () => {
  beforeEach(() => {
    pushToast.mockReset();
    getSupabaseMock.mockReset();
  });

  it('shows empty state when no tasks exist', async () => {
    mockTodoQuery([]);

    render(<TodoTracker />);

    expect(
      await screen.findByText('No tasks yet. Add exercises, appointments, or daily routines to track.')
    ).toBeInTheDocument();
  });

  it('renders stats and filters completed tasks', async () => {
    const todayIso = new Date().toISOString();

    const dueDate = '2025-02-01T12:00:00.000Z';

    mockTodoQuery([
      {
        id: 'todo-1',
        title: 'Schroth breathing exercises',
        details: '15 minutes',
        completed: false,
        completed_at: null,
        due_date: dueDate,
        category: 'exercise',
        frequency: 'daily'
      },
      {
        id: 'todo-2',
        title: 'PT appointment',
        details: null,
        completed: true,
        completed_at: todayIso,
        due_date: null,
        category: 'appointment',
        frequency: 'once'
      }
    ]);

    render(<TodoTracker />);

    expect(await screen.findByText('Schroth breathing exercises')).toBeInTheDocument();

    const totalTasks = screen.getByText('Total Tasks').previousElementSibling as HTMLElement;
    const pendingTasks = screen.getByText('Pending').previousElementSibling as HTMLElement;
    const completionRate = screen.getByText('Completion Rate').previousElementSibling as HTMLElement;

    expect(totalTasks).toHaveTextContent('2');
    expect(pendingTasks).toHaveTextContent('1');
    expect(completionRate).toHaveTextContent('50%');

    expect(screen.getByText(format(new Date(dueDate), 'MMM d'))).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'completed' }));

    expect(screen.getByText('PT appointment')).toBeInTheDocument();
    expect(screen.queryByText('Schroth breathing exercises')).not.toBeInTheDocument();
  });
});

import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import PhotoTimeline from '../PhotoTimeline';
import { getSupabase } from '@/lib/supabaseClient';

const pushToast = vi.fn();

vi.mock('@/components/ToastProvider', () => ({
  useToast: () => ({ pushToast })
}));

vi.mock('@/lib/supabaseClient', () => ({
  getSupabase: vi.fn()
}));

const getSupabaseMock = vi.mocked(getSupabase);

function mockPhotoQuery(data: unknown[] = [], error: unknown = null) {
  const order = vi.fn(() => ({ data, error }));
  const select = vi.fn(() => ({ order }));
  const from = vi.fn(() => ({ select }));
  getSupabaseMock.mockReturnValue({ from } as never);
  return { from, select, order };
}

describe('PhotoTimeline', () => {
  beforeEach(() => {
    pushToast.mockReset();
    getSupabaseMock.mockReset();
  });

  it('shows empty state after loading', async () => {
    mockPhotoQuery([]);

    render(<PhotoTimeline />);

    expect(screen.getByText('Loading photos...')).toBeInTheDocument();
    expect(await screen.findByText('No photos yet')).toBeInTheDocument();
  });

  it('renders photos and enables compare mode prompt', async () => {
    mockPhotoQuery([
      {
        id: 'photo-1',
        taken_at: '2025-01-02T00:00:00.000Z',
        view: 'front',
        public_url: 'https://example.com/front.jpg',
        storage_path: null,
        notes: null
      },
      {
        id: 'photo-2',
        taken_at: '2025-01-01T00:00:00.000Z',
        view: 'back',
        public_url: 'https://example.com/back.jpg',
        storage_path: null,
        notes: null
      }
    ]);

    render(<PhotoTimeline />);

    expect(await screen.findByAltText('front view')).toBeInTheDocument();
    expect(screen.getByAltText('back view')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Compare'));

    expect(
      screen.getByText(/Select 2 more photo/i)
    ).toBeInTheDocument();
  });
});

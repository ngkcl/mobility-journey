import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import VideoGallery from '../VideoGallery';
import { getSupabase } from '@/lib/supabaseClient';

const pushToast = vi.fn();

vi.mock('@/components/ToastProvider', () => ({
  useToast: () => ({ pushToast })
}));

vi.mock('@/lib/supabaseClient', () => ({
  getSupabase: vi.fn()
}));

const getSupabaseMock = vi.mocked(getSupabase);

function mockVideoQuery(data: unknown[] = [], error: unknown = null) {
  const order = vi.fn(() => ({ data, error }));
  const select = vi.fn(() => ({ order }));
  const from = vi.fn(() => ({ select }));
  getSupabaseMock.mockReturnValue({ from } as never);
  return { from, select, order };
}

describe('VideoGallery', () => {
  beforeEach(() => {
    pushToast.mockReset();
    getSupabaseMock.mockReset();
  });

  it('shows empty state when no videos exist', async () => {
    mockVideoQuery([]);

    render(<VideoGallery />);

    expect(await screen.findByText('No videos yet')).toBeInTheDocument();
  });

  it('opens the expanded video modal', async () => {
    mockVideoQuery([
      {
        id: 'video-1',
        created_at: '2025-02-05T12:00:00.000Z',
        recorded_at: '2025-02-05T12:00:00.000Z',
        duration_seconds: 120,
        storage_path: 'videos/video-1.mp4',
        public_url: 'https://example.com/video.mp4',
        thumbnail_url: 'https://example.com/thumb.jpg',
        label: null,
        category: 'exercise',
        notes: null,
        analysis_status: 'pending',
        analysis_result: null,
        tags: null
      }
    ]);

    render(<VideoGallery />);

    expect(await screen.findByText('Feb 5, 2025')).toBeInTheDocument();

    fireEvent.click(screen.getByAltText('Video thumbnail'));

    expect(screen.getByText('Delete Video')).toBeInTheDocument();
  });
});

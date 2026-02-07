import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NextRequest } from 'next/server';

import { POST } from '@/app/api/analyze-video/route';

const anthropicMocks = vi.hoisted(() => ({
  messagesCreateMock: vi.fn(),
  ctorMock: vi.fn()
}));

vi.mock('@anthropic-ai/sdk', () => {
  const ctor = vi.fn(() => ({
    messages: { create: anthropicMocks.messagesCreateMock }
  }));
  anthropicMocks.ctorMock = ctor;
  return { default: ctor };
});

const supabaseMocks = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  fromMock: vi.fn(),
  insertMock: vi.fn(),
  updateMock: vi.fn(),
  eqMock: vi.fn()
}));

vi.mock('@supabase/supabase-js', () => {
  supabaseMocks.eqMock = vi.fn();
  supabaseMocks.insertMock = vi.fn();
  supabaseMocks.updateMock = vi.fn(() => ({ eq: supabaseMocks.eqMock }));
  supabaseMocks.fromMock = vi.fn(() => ({
    insert: supabaseMocks.insertMock,
    update: supabaseMocks.updateMock,
    eq: supabaseMocks.eqMock
  }));
  supabaseMocks.createClientMock = vi.fn(() => ({ from: supabaseMocks.fromMock }));
  return { createClient: supabaseMocks.createClientMock };
});

const originalEnv = { ...process.env };

function createJsonRequest(payload: Record<string, unknown>) {
  return new Request('http://localhost/api/analyze-video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

describe('POST /api/analyze-video', () => {
  beforeEach(() => {
    process.env = { ...originalEnv };
    anthropicMocks.messagesCreateMock.mockReset();
    anthropicMocks.ctorMock.mockClear();
    supabaseMocks.createClientMock?.mockClear();
    supabaseMocks.fromMock?.mockClear();
    supabaseMocks.insertMock?.mockClear();
    supabaseMocks.updateMock?.mockClear();
    supabaseMocks.eqMock?.mockClear();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns 400 when frames are missing', async () => {
    const request = createJsonRequest({ videoId: 'video-1' });

    const response = await POST(request as NextRequest);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: 'frames array is required' });
  });

  it('returns 400 when videoId is missing', async () => {
    const request = createJsonRequest({ frames: ['frame-1'] });

    const response = await POST(request as NextRequest);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: 'videoId is required' });
  });

  it('returns 500 when ANTHROPIC_API_KEY is not configured', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const request = createJsonRequest({
      frames: ['frame-1'],
      videoId: 'video-1'
    });

    const response = await POST(request as NextRequest);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toEqual({ error: 'ANTHROPIC_API_KEY not configured' });
    expect(anthropicMocks.ctorMock).not.toHaveBeenCalled();
  });

  it('returns analysis, structured data, and updates Supabase', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.example';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';

    anthropicMocks.messagesCreateMock.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: '```json\n{"movement_quality_score":8,"symmetry_score":7,"movement_type":"exercise"}\n```\nNotes.'
        }
      ]
    });

    const request = createJsonRequest({
      frames: ['frame-1', 'frame-2'],
      timestamps: [{ label: 'Start', timestamp: 0 }],
      videoId: 'video-1',
      duration: 120,
      frameInterval: 2
    });

    const response = await POST(request as NextRequest);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.analysis).toContain('Notes.');
    expect(json.structuredData).toMatchObject({
      movement_quality_score: 8,
      symmetry_score: 7,
      movement_type: 'exercise'
    });
    expect(json.videoId).toBe('video-1');
    expect(json.frameCount).toBe(2);
    expect(json.model).toBe('claude-opus-4-0520');

    expect(supabaseMocks.createClientMock).toHaveBeenCalledWith(
      'https://supabase.example',
      'service-role'
    );
    expect(supabaseMocks.fromMock).toHaveBeenCalledWith('analysis_logs');
    expect(supabaseMocks.fromMock).toHaveBeenCalledWith('videos');
    expect(supabaseMocks.insertMock).toHaveBeenCalled();
    expect(supabaseMocks.updateMock).toHaveBeenCalled();
  });

  it('marks video analysis as failed when analysis throws', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.example';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';

    anthropicMocks.messagesCreateMock.mockRejectedValue(new Error('boom'));

    const request = createJsonRequest({
      frames: ['frame-1'],
      videoId: 'video-1'
    });

    const response = await POST(request as NextRequest);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe('Video analysis failed');
    expect(supabaseMocks.fromMock).toHaveBeenCalledWith('videos');
    expect(supabaseMocks.updateMock).toHaveBeenCalledWith({ analysis_status: 'failed' });
    expect(supabaseMocks.eqMock).toHaveBeenCalledWith('id', 'video-1');
  });
});

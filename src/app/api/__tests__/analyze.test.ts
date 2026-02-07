import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

import { POST } from '@/app/api/analyze/route';

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
  return new NextRequest('http://localhost/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

describe('POST /api/analyze', () => {
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

  it('returns 400 when photoUrl is missing', async () => {
    const request = createJsonRequest({ photoId: 'photo-1' });

    const response = await POST(request as NextRequest);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: 'photoUrl is required' });
    expect(anthropicMocks.ctorMock).not.toHaveBeenCalled();
  });

  it('returns 500 when ANTHROPIC_API_KEY is not configured', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const request = createJsonRequest({ photoUrl: 'https://example.com/photo.png' });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toEqual({ error: 'ANTHROPIC_API_KEY not configured' });
    expect(anthropicMocks.ctorMock).not.toHaveBeenCalled();
  });

  it('returns analysis and structured data and saves to Supabase', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.example';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';

    const fetchMock = vi.fn(async () => new Response('image-bytes', {
      headers: { 'content-type': 'image/png' }
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    anthropicMocks.messagesCreateMock.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: '```json\n{"posture_score":7,"symmetry_score":6,"view_type":"front","rib_hump":"mild","confidence":"medium"}\n```\nNotes.'
        }
      ]
    });

    const request = createJsonRequest({
      photoUrl: 'https://example.com/photo.png',
      photoId: 'photo-1'
    });

    const response = await POST(request as NextRequest);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.analysis).toContain('Notes.');
    expect(json.structuredData).toMatchObject({
      posture_score: 7,
      symmetry_score: 6,
      view_type: 'front'
    });
    expect(json.photoId).toBe('photo-1');
    expect(json.model).toBe('claude-opus-4-0520');

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/photo.png');
    expect(supabaseMocks.createClientMock).toHaveBeenCalledWith(
      'https://supabase.example',
      'service-role'
    );
    expect(supabaseMocks.fromMock).toHaveBeenCalledWith('analysis_logs');
    expect(supabaseMocks.fromMock).toHaveBeenCalledWith('metrics');
    expect(supabaseMocks.insertMock).toHaveBeenCalled();
  });

  it('returns 500 when no analysis is generated', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    const fetchMock = vi.fn(async () => new Response('image-bytes', {
      headers: { 'content-type': 'image/jpeg' }
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    anthropicMocks.messagesCreateMock.mockResolvedValue({
      content: [{ type: 'text', text: '' }]
    });

    const request = createJsonRequest({
      photoUrl: 'https://example.com/photo.png'
    });

    const response = await POST(request as NextRequest);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe('No analysis generated');
  });
});

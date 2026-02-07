import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import { publicEnv } from '@/lib/env/public';
import { serverEnv } from '@/lib/env/server';

const ANALYSIS_PROMPT = `You are an expert physiotherapist analyzing a progress photo for a patient with right-thoracic scoliosis and right-side muscular imbalance.

Focus on RELATIVE observations — what you see compared to ideal alignment. Don't pretend to measure millimeters from a photo.

Provide your response in TWO parts:

## PART 1: STRUCTURED DATA (JSON)
\`\`\`json
{
  "posture_score": <1-10, 10 = perfect posture>,
  "symmetry_score": <1-10, 10 = perfectly symmetric>,
  "view_type": "<front|back|left|right|other>",
  "rib_hump": "<none|mild|moderate|severe>",
  "muscle_asymmetry": "<none|mild|moderate|severe>",
  "shoulder_level": "<level|left_high|right_high>",
  "hip_level": "<level|left_high|right_high>",
  "head_position": "<centered|left_tilt|right_tilt>",
  "confidence": "<low|medium|high>"
}
\`\`\`

## PART 2: CLINICAL NOTES

### What I See
Describe posture, alignment, muscle development differences. Be specific about left vs right.

### Scoliosis Indicators
How does this relate to right-thoracic scoliosis? What compensatory patterns are visible?

### Progress Markers
What specific things should we watch for in future photos to track improvement? (e.g., "right trapezius bulk relative to left", "waistline crease asymmetry")

### Top 3 Exercises
Based on what you see, recommend 3 specific exercises with sets/reps. Target the observed imbalances.

Be direct and clinical. This is a tracking tool — give your best assessment.`;

async function fetchImageAsBase64(url: string): Promise<{ data: string; mediaType: string }> {
  const res = await fetch(url);
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const contentType = res.headers.get('content-type') || 'image/jpeg';
  return { data: base64, mediaType: contentType };
}

export async function POST(request: NextRequest) {
  try {
    const { photoUrl, photoId } = await request.json();

    if (!photoUrl) {
      return NextResponse.json({ error: 'photoUrl is required' }, { status: 400 });
    }

    const anthropic = new Anthropic({ apiKey: serverEnv.ANTHROPIC_API_KEY });

    // Fetch image and convert to base64 for Claude
    const { data: imageData, mediaType } = await fetchImageAsBase64(photoUrl);

    // Run vision analysis with Claude Opus
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-0520',
      max_tokens: 2500,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                data: imageData,
              },
            },
            { type: 'text', text: ANALYSIS_PROMPT },
          ],
        },
      ],
    });

    const analysis = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.type === 'text' ? block.text : '')
      .join('\n');

    if (!analysis) {
      return NextResponse.json({ error: 'No analysis generated' }, { status: 500 });
    }

    // Extract structured data
    let structuredData = null;
    const jsonMatch = analysis.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      try {
        structuredData = JSON.parse(jsonMatch[1]);
      } catch {
        // continue with text only
      }
    }

    // Save to Supabase
    const supabase = createClient(
      publicEnv.NEXT_PUBLIC_SUPABASE_URL,
      serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    );

    // Save analysis log
    const title = [
      'AI Posture Analysis (Opus)',
      structuredData?.view_type ? `${structuredData.view_type} view` : null,
      structuredData?.posture_score ? `Posture: ${structuredData.posture_score}/10` : null,
      structuredData?.symmetry_score ? `Symmetry: ${structuredData.symmetry_score}/10` : null,
    ].filter(Boolean).join(' — ');

    await supabase.from('analysis_logs').insert({
      entry_date: new Date().toISOString().split('T')[0],
      category: 'ai',
      title,
      content: analysis,
    });

    // Save scores as metrics
    if (structuredData) {
      await supabase.from('metrics').insert({
        entry_date: new Date().toISOString().split('T')[0],
        posture_score: structuredData.posture_score ?? null,
        symmetry_score: structuredData.symmetry_score ?? null,
        rib_hump: structuredData.rib_hump ?? null,
        notes: `Auto-extracted from AI photo analysis (confidence: ${structuredData.confidence || 'unknown'})`,
      });
    }

    return NextResponse.json({
      analysis,
      structuredData,
      photoId,
      model: 'claude-opus-4-0520',
    });
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: 'Analysis failed', details: String(error) },
      { status: 500 },
    );
  }
}

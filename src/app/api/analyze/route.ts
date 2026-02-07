import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const ANALYSIS_PROMPT = `You are an expert physiotherapist and posture analysis specialist. You're reviewing a progress photo for a patient with scoliosis (right thoracic curve) and right-side muscular imbalance.

Analyze this photo with clinical precision. Provide your response in TWO parts:

## PART 1: STRUCTURED DATA (JSON)
Output a JSON block with these fields (use null if not determinable):
\`\`\`json
{
  "shoulder_diff_mm": <number or null>,
  "hip_diff_mm": <number or null>,
  "head_tilt_degrees": <number or null>,
  "lateral_deviation": "<mild|moderate|severe|null>",
  "overall_posture_score": <1-10>,
  "muscle_asymmetry": "<none|mild|moderate|severe>",
  "view_type": "<front|back|left|right|other>",
  "confidence": "<low|medium|high>"
}
\`\`\`

## PART 2: CLINICAL NOTES
1. **What I See**: Describe shoulder alignment, hip alignment, spinal curve indicators, head position, rib cage, muscle bulk differences
2. **Key Asymmetries**: Specific left/right differences with estimated measurements
3. **Scoliosis Indicators**: How this relates to right-thoracic scoliosis patterns
4. **Progress Markers**: Things to watch for improvement in future photos
5. **Top 3 Exercises**: Specific exercises for what you observe (name, sets, reps)

Be direct and specific. Avoid disclaimers about not being a real doctor — this is a tracking tool. Give your best clinical assessment.`;

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

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    const anthropic = new Anthropic({ apiKey: anthropicKey });

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

    // Extract structured data from the analysis
    let structuredData = null;
    const jsonMatch = analysis.match(/```json\n([\s\S]*?)\n```/);
    if (jsonMatch) {
      try {
        structuredData = JSON.parse(jsonMatch[1]);
      } catch {
        // JSON parsing failed, continue with just the text
      }
    }

    // Save to Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      // Save analysis log
      await supabase.from('analysis_logs').insert({
        entry_date: new Date().toISOString().split('T')[0],
        category: 'ai',
        title: `AI Posture Analysis (Opus)${structuredData?.view_type ? ` — ${structuredData.view_type} view` : ''}${structuredData?.overall_posture_score ? ` — Score: ${structuredData.overall_posture_score}/10` : ''}`,
        content: analysis,
      });

      // If we got structured data, also save as a metric entry
      if (structuredData && (structuredData.shoulder_diff_mm !== null || structuredData.hip_diff_mm !== null)) {
        await supabase.from('metrics').insert({
          entry_date: new Date().toISOString().split('T')[0],
          shoulder_diff: structuredData.shoulder_diff_mm,
          hip_diff: structuredData.hip_diff_mm,
          pain_level: null,
          cobb_angle: null,
          flexibility: null,
          notes: `Auto-extracted from AI photo analysis — Opus (confidence: ${structuredData.confidence || 'unknown'})`,
        });
      }
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

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const VIDEO_ANALYSIS_PROMPT = `You are an expert physiotherapist and movement specialist analyzing a sequence of timestamped frames from a video of a patient with right-thoracic scoliosis and right-side muscular imbalance.

The frames are evenly spaced to show the FULL movement sequence with continuity. Each frame is labeled with its timestamp. Treat this like watching the video — track how the body moves through the entire sequence.

Key things to track ACROSS frames (continuity):
- Does posture deteriorate over time? (fatigue)
- Is the movement pattern consistent or does it break down?
- Are compensations getting worse as the video progresses?
- How does range of motion change from rep to rep?
- Is there a difference in form between the start and end?

Provide your response in TWO parts:

## PART 1: STRUCTURED DATA (JSON)
\`\`\`json
{
  "movement_quality_score": <1-10, 10 = perfect form>,
  "posture_score": <1-10, 10 = perfect posture during movement>,
  "symmetry_score": <1-10, 10 = perfectly symmetric movement>,
  "movement_type": "<exercise|walking|stretching|functional|posture_check|sitting|standing|other>",
  "detected_exercise": "<name of exercise if identifiable, or null>",
  "compensation_patterns": ["<list of observed compensations>"],
  "asymmetries": ["<list of left/right or rotational asymmetries>"],
  "form_issues": ["<list of form concerns>"],
  "strengths": ["<list of things done well>"],
  "fatigue_pattern": "<none|mild|moderate|severe>",
  "risk_level": "<low|moderate|high>",
  "confidence": "<low|medium|high>"
}
\`\`\`

## PART 2: CLINICAL NOTES

### Movement Analysis
Describe the movement pattern, quality, and control across the full sequence. Note changes from start to end.

### Temporal Progression
What changes between early frames and late frames? Fatigue? Compensation? Improvement?

### Posture During Activity
How is posture maintained? Any scoliosis-related deviations?

### Compensation Patterns
Compensatory strategies visible? Related to right-thoracic curve?

### Asymmetries
Left-right differences in ROM, muscle activation, or movement quality.

### Top 3 Recommendations
Specific, actionable corrections with cues. If exercise: include form fixes with sets/reps.

Be direct and clinical. This is a rehabilitation tracking tool.`;

export async function POST(request: NextRequest) {
  type VideoAnalyzePayload = {
    frames?: string[];
    timestamps?: { label?: string; timestamp?: number }[];
    videoId?: string;
    duration?: number;
    frameInterval?: number;
  };

  let payload: VideoAnalyzePayload | null = null;

  try {
    payload = (await request.json()) as VideoAnalyzePayload | null;
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const { frames, timestamps, videoId, duration, frameInterval } = payload;

    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      return NextResponse.json({ error: 'frames array is required' }, { status: 400 });
    }

    if (frames.some((frame) => typeof frame !== 'string' || frame.trim().length === 0)) {
      return NextResponse.json({ error: 'frames must be base64 strings' }, { status: 400 });
    }

    if (!videoId) {
      return NextResponse.json({ error: 'videoId is required' }, { status: 400 });
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    const anthropic = new Anthropic({ apiKey: anthropicKey });

    // Build content array with timestamped frames
    const content: Anthropic.MessageCreateParams['messages'][0]['content'] = [];

    // Context header
    const durationStr = duration ? `${Math.floor(duration / 60)}m ${Math.round(duration % 60)}s` : 'unknown';
    content.push({
      type: 'text',
      text: `Video: ${durationStr} duration | ${frames.length} frames | ~${frameInterval || '?'}s between frames`,
    });

    for (let i = 0; i < frames.length; i++) {
      const ts = timestamps?.[i];
      const label = ts?.label || `Frame ${i + 1}`;
      const time = ts?.timestamp != null ? `${Math.round(ts.timestamp)}s` : '';

      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: frames[i],
        },
      });
      content.push({
        type: 'text',
        text: `[${label}${time ? ` — ${time} into video` : ''}] (${i + 1}/${frames.length})`,
      });
    }

    content.push({
      type: 'text',
      text: VIDEO_ANALYSIS_PROMPT,
    });

    // Run vision analysis with Claude Opus
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-0520',
      max_tokens: 3500,
      messages: [{ role: 'user', content }],
    });

    const analysis = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block.type === 'text' ? block.text : ''))
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
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const title = [
        'AI Video Analysis (Opus)',
        structuredData?.detected_exercise || structuredData?.movement_type || null,
        structuredData?.movement_quality_score ? `Quality: ${structuredData.movement_quality_score}/10` : null,
        structuredData?.symmetry_score ? `Symmetry: ${structuredData.symmetry_score}/10` : null,
        structuredData?.fatigue_pattern && structuredData.fatigue_pattern !== 'none' ? `Fatigue: ${structuredData.fatigue_pattern}` : null,
      ].filter(Boolean).join(' — ');

      await supabase.from('analysis_logs').insert({
        entry_date: new Date().toISOString().split('T')[0],
        category: 'ai',
        title,
        content: analysis,
      });

      await supabase
        .from('videos')
        .update({
          analysis_status: 'complete',
          analysis_result: { structuredData, rawAnalysis: analysis, frameCount: frames.length },
        })
        .eq('id', videoId);
    }

    return NextResponse.json({
      analysis,
      structuredData,
      videoId,
      frameCount: frames.length,
      model: 'claude-opus-4-0520',
    });
  } catch (error) {
    console.error('Video analysis error:', error);

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const videoId = payload?.videoId;
      if (supabaseUrl && supabaseServiceKey && videoId) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        await supabase.from('videos').update({ analysis_status: 'failed' }).eq('id', videoId);
      }
    } catch {
      // Silent fail
    }

    return NextResponse.json({ error: 'Video analysis failed' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const VIDEO_ANALYSIS_PROMPT = `You are an expert physiotherapist and movement specialist analyzing frames extracted from a movement/exercise video for a patient with right-thoracic scoliosis and right-side muscular imbalance.

These frames are sampled across the video duration to capture the full movement sequence.

Focus on RELATIVE observations — what you see compared to ideal form and alignment.

Provide your response in TWO parts:

## PART 1: STRUCTURED DATA (JSON)
\`\`\`json
{
  "movement_quality_score": <1-10, 10 = perfect form>,
  "posture_score": <1-10, 10 = perfect posture during movement>,
  "symmetry_score": <1-10, 10 = perfectly symmetric movement>,
  "movement_type": "<exercise|walking|stretching|functional|posture_check|other>",
  "compensation_patterns": ["<list of observed compensations>"],
  "asymmetries": ["<list of left/right or rotational asymmetries>"],
  "form_issues": ["<list of form concerns>"],
  "strengths": ["<list of things done well>"],
  "risk_level": "<low|moderate|high>",
  "confidence": "<low|medium|high>"
}
\`\`\`

## PART 2: CLINICAL NOTES

### Movement Analysis
Describe the movement pattern, quality, and control across the sequence. Note any changes from start to end (fatigue patterns).

### Posture During Activity
How is posture maintained during the movement? Any deviations related to scoliosis?

### Compensation Patterns
What compensatory strategies are visible? Are they related to the right-thoracic curve?

### Asymmetries
Detail any left-right differences in range of motion, muscle activation, or movement quality.

### Exercise Form Assessment
If this is an exercise, rate the form and provide specific corrections.

### Top 3 Recommendations
Based on what you observe, give 3 specific, actionable recommendations to improve movement quality. Include exercise modifications if relevant.

Be direct and clinical. This is a tracking tool for rehabilitation progress.`;

export async function POST(request: NextRequest) {
  try {
    const { frames, videoId, duration } = await request.json();

    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      return NextResponse.json({ error: 'frames array is required' }, { status: 400 });
    }

    if (!videoId) {
      return NextResponse.json({ error: 'videoId is required' }, { status: 400 });
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    const anthropic = new Anthropic({ apiKey: anthropicKey });

    // Build content array with all frames + prompt
    const content: Anthropic.MessageCreateParams['messages'][0]['content'] = [];

    for (let i = 0; i < frames.length; i++) {
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/png',
          data: frames[i],
        },
      });
      content.push({
        type: 'text',
        text: `Frame ${i + 1} of ${frames.length}`,
      });
    }

    content.push({
      type: 'text',
      text: `Video duration: ${duration ? `${Math.round(duration)}s` : 'unknown'}\n\n${VIDEO_ANALYSIS_PROMPT}`,
    });

    // Run vision analysis with Claude Opus
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-0520',
      max_tokens: 3000,
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

      // Save analysis log
      const title = [
        'AI Video Analysis (Opus)',
        structuredData?.movement_type ? `${structuredData.movement_type}` : null,
        structuredData?.movement_quality_score
          ? `Quality: ${structuredData.movement_quality_score}/10`
          : null,
        structuredData?.symmetry_score
          ? `Symmetry: ${structuredData.symmetry_score}/10`
          : null,
      ]
        .filter(Boolean)
        .join(' — ');

      await supabase.from('analysis_logs').insert({
        entry_date: new Date().toISOString().split('T')[0],
        category: 'ai',
        title,
        content: analysis,
      });

      // Update video record with analysis result
      await supabase
        .from('videos')
        .update({
          analysis_status: 'complete',
          analysis_result: { structuredData, rawAnalysis: analysis },
        })
        .eq('id', videoId);
    }

    return NextResponse.json({
      analysis,
      structuredData,
      videoId,
      model: 'claude-opus-4-0520',
    });
  } catch (error) {
    console.error('Video analysis error:', error);

    // Try to mark analysis as failed
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const { videoId } = await request.clone().json();
      if (supabaseUrl && supabaseServiceKey && videoId) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        await supabase
          .from('videos')
          .update({ analysis_status: 'failed' })
          .eq('id', videoId);
      }
    } catch {
      // Silent fail on status update
    }

    return NextResponse.json(
      { error: 'Video analysis failed', details: String(error) },
      { status: 500 },
    );
  }
}

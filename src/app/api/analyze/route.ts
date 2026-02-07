import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';

const ANALYSIS_PROMPT = `You are an expert physiotherapist and posture analysis specialist reviewing a progress photo for a patient with scoliosis and right-side muscular imbalance.

Analyze this photo and provide a structured assessment:

1. **Posture Overview**: Describe what you see — shoulder alignment, hip alignment, spinal curvature, head position, overall stance
2. **Asymmetries Detected**: Specifically note any left/right differences in shoulders, hips, rib cage, muscle development
3. **Estimated Measurements** (if visible):
   - Shoulder height difference (mm estimate)
   - Hip height difference (mm estimate)  
   - Lateral spinal deviation (mild/moderate/severe)
   - Head tilt (degrees estimate)
4. **Changes vs Typical Scoliosis Patterns**: How does this compare to common right-thoracic scoliosis patterns?
5. **Recommendations**: 2-3 specific exercises or stretches that would help based on what you see
6. **Progress Notes**: Any positive signs or areas of concern

Be specific and clinical. Use measurements where possible. This data will be tracked over time to measure progress.`;

export async function POST(request: NextRequest) {
  try {
    const { photoUrl, photoId } = await request.json();

    if (!photoUrl) {
      return NextResponse.json({ error: 'photoUrl is required' }, { status: 400 });
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
    }

    const openai = new OpenAI({ apiKey: openaiKey });

    // Run vision analysis
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: ANALYSIS_PROMPT },
            { type: 'image_url', image_url: { url: photoUrl, detail: 'high' } },
          ],
        },
      ],
      max_tokens: 1500,
    });

    const analysis = response.choices[0]?.message?.content;
    if (!analysis) {
      return NextResponse.json({ error: 'No analysis generated' }, { status: 500 });
    }

    // Save to Supabase
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      await supabase.from('analysis_logs').insert({
        entry_date: new Date().toISOString().split('T')[0],
        category: 'ai',
        title: `AI Photo Analysis${photoId ? ` (Photo: ${photoId.slice(0, 8)})` : ''}`,
        content: analysis,
      });
    }

    return NextResponse.json({ analysis, photoId });
  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { error: 'Analysis failed', details: String(error) },
      { status: 500 },
    );
  }
}

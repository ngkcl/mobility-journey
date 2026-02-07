import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const { date, context, metrics, postureTrend, workouts, correctiveSessions, gymDay, gymFocus } = await req.json();

    const systemPrompt = `You are a corrective exercise and posture specialist AI. You create daily movement plans for someone with scoliosis and right-side muscular imbalance.

CONTEXT:
- Patient has scoliosis with right-side muscular imbalance
- Goal: improve posture, reduce pain, build balanced strength
- They do 3 corrective sessions daily (morning, midday, evening)
- Some days are gym days (compound + isolation work)
- Track pain (1-10) and energy (1-10) daily

YOUR RESPONSE FORMAT (JSON):
{
  "plan": {
    "morning": {
      "type": "corrective",
      "focus": "string - brief focus area",
      "exercises": [{"name": "string", "sets": number, "reps": number, "notes": "string"}],
      "duration_minutes": number
    },
    "midday": {
      "type": "corrective",
      "focus": "string",
      "exercises": [{"name": "string", "sets": number, "reps": number, "notes": "string"}],
      "duration_minutes": number
    },
    "evening": {
      "type": "corrective",
      "focus": "string", 
      "exercises": [{"name": "string", "sets": number, "reps": number, "notes": "string"}],
      "duration_minutes": number
    },
    "gym": null | {
      "focus": "string - e.g. Push, Pull, Legs",
      "exercises": [{"name": "string", "sets": number, "reps": number, "weight_suggestion": "string", "notes": "string"}],
      "duration_minutes": number,
      "corrective_integration": "string - how to integrate corrective work"
    },
    "daily_tips": ["string - 2-3 tips for the day"],
    "intensity_recommendation": "low" | "moderate" | "high"
  },
  "reasoning": ["string - explain your choices based on the data"]
}`;

    const userMessage = `Generate today's plan for ${date}.

CURRENT STATE:
- Pain level: ${metrics?.pain_level ?? 'not reported'}
- Energy level: ${metrics?.energy_level ?? 'not reported'}  
- Posture score: ${metrics?.posture_score ?? 'not reported'}
- Gym day: ${gymDay ? `Yes - focus: ${gymFocus || 'general'}` : 'No'}

RECENT CONTEXT:
- Corrective sessions completed: ${correctiveSessions?.length ?? 0}
- Recent workouts: ${JSON.stringify(workouts?.slice(0, 5) ?? [])}
- Posture trend: ${JSON.stringify(postureTrend ?? 'no data')}
${context ? `- Additional context: ${JSON.stringify(context)}` : ''}

Generate the optimal plan for today. If pain is high (>6), reduce intensity. If energy is low (<4), suggest lighter sessions. Always prioritize corrective work for the scoliosis and right-side imbalance.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${err}`);
    }

    const data = await response.json();
    const content = data.content[0]?.text ?? '';

    // Extract JSON from the response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify({
      plan: parsed.plan,
      reasoning: parsed.reasoning || [],
      model: data.model,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const anthropic = new Anthropic();

// ==================== DAILY PLAN ====================
app.post('/api/daily-plan', async (req, res) => {
  try {
    const { date, context, metrics, postureTrend, workouts, correctiveSessions, gymDay, gymFocus } = req.body;

    const systemPrompt = `You are a corrective exercise and posture specialist AI. You create daily movement plans for someone with scoliosis and right-side muscular imbalance.

CONTEXT:
- Patient has scoliosis with right-side muscular imbalance
- Goal: improve posture, reduce pain, build balanced strength
- They do 3 corrective sessions daily (morning, midday, evening)
- Some days are gym days (compound + isolation work)
- Track pain (1-10) and energy (1-10) daily

YOUR RESPONSE must be valid JSON with this structure:
{
  "plan": {
    "morning": {
      "type": "corrective",
      "focus": "brief focus area",
      "exercises": [{"name": "string", "sets": 2, "reps": 10, "notes": "form cue"}],
      "duration_minutes": 20
    },
    "midday": {
      "type": "corrective",
      "focus": "string",
      "exercises": [{"name": "string", "sets": 2, "reps": 10, "notes": "form cue"}],
      "duration_minutes": 15
    },
    "evening": {
      "type": "corrective",
      "focus": "string",
      "exercises": [{"name": "string", "sets": 2, "reps": 10, "notes": "form cue"}],
      "duration_minutes": 20
    },
    "gym": null,
    "daily_tips": ["tip 1", "tip 2"],
    "intensity_recommendation": "moderate"
  },
  "reasoning": ["reason 1", "reason 2"]
}

If gymDay is true, include a "gym" object instead of null with exercises, sets, reps, weight suggestions.
Use exercises from this library when possible: Bird Dogs, Cat-Cow, Dead Bugs, Clamshells, Side Plank, Foam Rolling, Diaphragmatic Breathing, Wall Angels, Thread the Needle, Hip Flexor Stretch, Single-Leg Glute Bridges, Band Pull-Aparts, Pallof Press, Walking Lunges, Back Squat, Bench Press, Barbell Row, Deadlift, Overhead Press, Lat Pulldown, Hip Thrust, Bicep Curl, Triceps Extension, Calf Raise.`;

    const userMessage = `Generate today's plan for ${date}.

CURRENT STATE:
- Pain level: ${metrics?.pain_level ?? 'not reported'}/10
- Energy level: ${metrics?.energy_level ?? 'not reported'}/10
- Posture score: ${metrics?.posture_score ?? 'not reported'}/10
- Gym day: ${gymDay ? `Yes - focus: ${gymFocus || 'general'}` : 'No'}

RECENT DATA:
- Corrective sessions done today: ${Array.isArray(correctiveSessions) ? correctiveSessions.length : 0}/3
- Recent workouts (last 5): ${JSON.stringify(Array.isArray(workouts) ? workouts.slice(0, 5) : [])}
- Posture trend: ${JSON.stringify(postureTrend ?? 'no data')}
${context ? `- Notes: ${JSON.stringify(context)}` : ''}

Generate the optimal plan. High pain (>6) = reduce intensity. Low energy (<4) = lighter sessions. Always prioritize scoliosis correction and right-side imbalance work.

Respond with ONLY valid JSON, no markdown.`;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });

    const content = response.content[0]?.text ?? '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const parsed = JSON.parse(jsonMatch[0]);
    res.json({ plan: parsed.plan, reasoning: parsed.reasoning || [], model: response.model });
  } catch (err) {
    console.error('Plan error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== PHOTO ANALYSIS ====================
app.post('/api/analyze', async (req, res) => {
  try {
    const { photoUrl, photoId } = req.body;

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'url', url: photoUrl },
          },
          {
            type: 'text',
            text: `Analyze this posture/progress photo for someone with scoliosis and right-side muscular imbalance.

Evaluate:
1. Shoulder alignment (level/uneven)
2. Hip alignment
3. Spine curvature visible
4. Muscular asymmetry (right vs left)
5. Head position
6. Overall posture score (1-10)

Respond as JSON:
{
  "analysis": "detailed text analysis",
  "structuredData": {
    "posture_score": 7,
    "shoulder_alignment": "slightly uneven - right higher",
    "hip_alignment": "level",
    "spine_notes": "mild thoracic curve",
    "asymmetry_notes": "right trap more developed",
    "head_position": "slight forward lean",
    "improvements_noted": [],
    "areas_of_concern": []
  }
}`,
          },
        ],
      }],
    });

    const content = response.content[0]?.text ?? '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const parsed = JSON.parse(jsonMatch[0]);
    res.json({ ...parsed, photoId, model: response.model });
  } catch (err) {
    console.error('Photo analysis error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== VIDEO ANALYSIS ====================
app.post('/api/analyze-video', async (req, res) => {
  try {
    const { frames, timestamps, videoId, duration, frameInterval } = req.body;

    const imageContent = frames.slice(0, 8).map((frame, i) => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: frame.replace(/^data:image\/\w+;base64,/, '') },
    }));

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{
        role: 'user',
        content: [
          ...imageContent,
          {
            type: 'text',
            text: `These are ${frames.length} frames from a ${duration}s video of someone exercising (frames every ${frameInterval}s).
Timestamps: ${JSON.stringify(timestamps)}

Analyze the movement for someone with scoliosis and right-side imbalance:
1. Form assessment
2. Symmetry between left/right
3. Range of motion
4. Compensatory patterns
5. Specific corrections needed

Respond as JSON:
{
  "analysis": "detailed movement analysis",
  "structuredData": {
    "form_score": 7,
    "symmetry_score": 6,
    "rom_assessment": "good hip flexion, limited thoracic rotation",
    "compensations": ["right hip hike during squat", "left lean"],
    "corrections": ["focus on keeping hips level", "add pause at bottom"],
    "exercise_identified": "squat" 
  }
}`,
          },
        ],
      }],
    });

    const content = response.content[0]?.text ?? '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');

    const parsed = JSON.parse(jsonMatch[0]);
    res.json({ ...parsed, videoId, frameCount: frames.length, model: response.model });
  } catch (err) {
    console.error('Video analysis error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== EIGHT SLEEP ====================
app.get('/api/eight-sleep', async (req, res) => {
  try {
    const { execSync } = await import('child_process');
    
    // Get status from eightctl
    const statusRaw = execSync('eightctl status --output json --quiet 2>/dev/null', { 
      timeout: 15000,
      encoding: 'utf-8',
    });
    
    const status = JSON.parse(statusRaw);
    
    // Get recent sleep data
    let sleepData = null;
    try {
      const sleepRaw = execSync('eightctl sleep --output json --quiet 2>/dev/null', {
        timeout: 15000,
        encoding: 'utf-8',
      });
      sleepData = JSON.parse(sleepRaw);
    } catch {
      // Sleep data might not be available
    }

    const lastNight = sleepData ? {
      score: sleepData.score ?? 0,
      duration_hours: (sleepData.duration ?? 0) / 3600,
      hrv_avg: sleepData.hrv ?? 0,
      hr_avg: sleepData.heartRate ?? 0,
      respiratory_rate: sleepData.respiratoryRate ?? 0,
      toss_turns: sleepData.tossTurns ?? 0,
      time_to_sleep_min: (sleepData.latency ?? 0) / 60,
      deep_sleep_pct: sleepData.deepSleepPct ?? 0,
      rem_sleep_pct: sleepData.remSleepPct ?? 0,
      bed_temp_f: status.bedTemp ?? 0,
      room_temp_f: status.roomTemp ?? 0,
    } : null;

    // Compute recovery score (1-10)
    let recoveryScore = 5;
    if (lastNight) {
      if (lastNight.score >= 80) recoveryScore += 2;
      else if (lastNight.score >= 60) recoveryScore += 1;
      else if (lastNight.score < 40) recoveryScore -= 2;
      
      if (lastNight.duration_hours >= 7.5) recoveryScore += 1;
      else if (lastNight.duration_hours < 5) recoveryScore -= 1;
      
      recoveryScore = Math.max(1, Math.min(10, recoveryScore));
    }

    res.json({ lastNight, recoveryScore });
  } catch (err) {
    console.error('Eight Sleep error:', err.message);
    res.status(503).json({ error: 'Eight Sleep unavailable', message: err.message });
  }
});

// ==================== HEALTH CHECK ====================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🏋️ Mobility API server running on port ${PORT}`);
});

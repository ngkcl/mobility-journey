import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const anthropic = new Anthropic();

// ==================== SUPABASE HELPERS ====================
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

async function supabaseFetch(path, options = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase ${path}: ${res.status} ${text}`);
  }
  return res.json();
}

async function fetchActiveProgram() {
  try {
    // Get the active monthly program
    const programs = await supabaseFetch('monthly_programs?active=eq.true&order=created_at.desc&limit=1');
    if (!programs.length) return null;
    const program = programs[0];

    // Get program exercises with exercise details
    const exercises = await supabaseFetch(
      `program_exercises?program_id=eq.${program.id}&order=order_index.asc&select=*,exercises(id,name,category)`
    );

    return { ...program, exercises };
  } catch (err) {
    console.error('Failed to fetch active program:', err.message);
    return null;
  }
}

async function fetchCoachAssignments() {
  try {
    const today = new Date().toISOString().split('T')[0];
    // Get active coach assignments: ongoing (no dates) or within date range
    const assignments = await supabaseFetch(
      `coach_assignments?completed=eq.false&or=(assigned_date.is.null,assigned_date.lte.${today})&or=(expires_date.is.null,expires_date.gte.${today})&select=*,exercises(id,name,category)`
    );
    return assignments;
  } catch (err) {
    console.error('Failed to fetch coach assignments:', err.message);
    return [];
  }
}

function formatProgramForPrompt(program) {
  if (!program) return 'No active monthly program.';

  const bySlot = {};
  for (const pe of program.exercises) {
    const slot = pe.session_slot;
    if (!bySlot[slot]) bySlot[slot] = [];
    const exName = pe.exercises?.name || 'Unknown';
    bySlot[slot].push({
      name: exName,
      sets: pe.sets,
      reps: pe.reps,
      hold_seconds: pe.hold_seconds,
      side: pe.side,
      mandatory: pe.mandatory,
      notes: pe.notes,
    });
  }

  let text = `MONTHLY BASE PROGRAM: "${program.name}" (${program.month})\n`;
  if (program.notes) text += `Program notes: ${program.notes}\n`;
  for (const [slot, exs] of Object.entries(bySlot)) {
    text += `\n${slot.toUpperCase()} SESSION:\n`;
    for (const ex of exs) {
      const details = [];
      if (ex.sets) details.push(`${ex.sets} sets`);
      if (ex.reps) details.push(`${ex.reps} reps`);
      if (ex.hold_seconds) details.push(`${ex.hold_seconds}s hold`);
      if (ex.side !== 'bilateral') details.push(`side: ${ex.side}`);
      text += `  - ${ex.name} (${details.join(', ')})${ex.mandatory ? ' [MANDATORY]' : ''} ${ex.notes ? '— ' + ex.notes : ''}\n`;
    }
  }
  return text;
}

function formatCoachAssignmentsForPrompt(assignments) {
  if (!assignments.length) return 'No active coach assignments.';

  let text = 'COACH ASSIGNMENTS (must be included):\n';
  for (const a of assignments) {
    const exName = a.exercises?.name || 'Unknown';
    const details = [];
    if (a.sets) details.push(`${a.sets} sets`);
    if (a.reps) details.push(`${a.reps} reps`);
    if (a.hold_seconds) details.push(`${a.hold_seconds}s hold`);
    if (a.side) details.push(`side: ${a.side}`);
    if (a.session_slot) details.push(`session: ${a.session_slot}`);
    text += `  - ${exName} (${details.join(', ')}) [${a.priority?.toUpperCase()}] source: ${a.source}`;
    if (a.coach_notes) text += ` — ${a.coach_notes}`;
    text += '\n';
  }
  return text;
}

// ==================== DAILY PLAN ====================
app.post('/api/daily-plan', async (req, res) => {
  try {
    const { date, context, metrics, postureTrend, workouts, correctiveSessions, gymDay, gymFocus } = req.body;

    // Fetch monthly program and coach assignments from Supabase
    const [activeProgram, coachAssignments] = await Promise.all([
      fetchActiveProgram(),
      fetchCoachAssignments(),
    ]);

    const programText = formatProgramForPrompt(activeProgram);
    const coachText = formatCoachAssignmentsForPrompt(coachAssignments);

    const systemPrompt = `You are a corrective exercise and posture specialist AI. You create daily movement plans for someone with scoliosis and right-side muscular imbalance.

CONTEXT:
- Patient has scoliosis with right-side muscular imbalance
- Goal: improve posture, reduce pain, build balanced strength
- They do 3 corrective sessions daily (morning, midday, evening)
- Some days are gym days (compound + isolation work)
- Track pain (1-10) and energy (1-10) daily

CRITICAL RULES:
1. You MUST include ALL mandatory exercises from the monthly base program in their assigned session slots
2. You MUST include ALL coach assignments, respecting their session slot preferences
3. High-priority coach assignments MUST appear first in their session
4. You may adjust the ORDER of exercises within a session for optimal flow
5. You may adjust INTENSITY (sets/reps) based on pain/energy levels, but never remove mandatory exercises
6. You may ADD supplementary exercises if there's room, but the base program exercises are non-negotiable
7. For each exercise, include the notes from the program as form cues

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

If gymDay is true, include a "gym" object instead of null with exercises, sets, reps, weight suggestions.`;

    const userMessage = `Generate today's plan for ${date}.

${programText}

${coachText}

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

REMEMBER: Include ALL mandatory base program exercises and ALL coach assignments. You may adjust intensity for pain/energy but NEVER remove mandatory exercises. Add supplementary work if appropriate.

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
    res.json({
      plan: parsed.plan,
      reasoning: parsed.reasoning || [],
      model: response.model,
      programName: activeProgram?.name || null,
      coachAssignmentCount: coachAssignments.length,
    });
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

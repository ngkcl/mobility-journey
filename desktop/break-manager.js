const fs = require('fs');
const path = require('path');
const os = require('os');

class BreakManager {
  constructor(options = {}) {
    this.dataDir = path.join(os.homedir(), '.posture-data');
    this.breaksFilePath = path.join(this.dataDir, 'breaks.json');
    this.exercisesPath = path.join(__dirname, 'exercises.json');

    // Settings
    this.breakInterval = options.breakInterval || 45 * 60 * 1000; // 45 minutes default
    this.enabled = options.enabled !== undefined ? options.enabled : true;
    this.snoozeTime = 5 * 60 * 1000; // 5 minutes

    // Tracking
    this.sittingStartTime = null;
    this.accumulatedSittingTime = 0;
    this.lastActivityTime = null;
    this.isOnBreak = false;
    this.breakStartTime = null;
    this.lastExerciseIndex = -1;
    this.isSnoozed = false;
    this.snoozeEndTime = null;

    // Callbacks
    this.onBreakDue = null;
    this.onBreakComplete = null;

    this.ensureDataDir();
    this.loadExercises();
    this.loadBreakHistory();

    // Start monitoring interval
    this.startMonitoring();
  }

  ensureDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  loadExercises() {
    try {
      const data = fs.readFileSync(this.exercisesPath, 'utf8');
      this.exercises = JSON.parse(data);
      console.log(`Loaded ${this.exercises.length} exercises`);
    } catch (error) {
      console.error('Error loading exercises:', error);
      this.exercises = [];
    }
  }

  loadBreakHistory() {
    try {
      if (fs.existsSync(this.breaksFilePath)) {
        const data = fs.readFileSync(this.breaksFilePath, 'utf8');
        this.breakHistory = JSON.parse(data);
      } else {
        this.breakHistory = {
          breaks: [],
          stats: {
            totalBreaksDue: 0,
            breaksTaken: 0,
            breaksSkipped: 0,
            breaksSnoozed: 0
          }
        };
        this.saveBreakHistory();
      }
    } catch (error) {
      console.error('Error loading break history:', error);
      this.breakHistory = {
        breaks: [],
        stats: {
          totalBreaksDue: 0,
          breaksTaken: 0,
          breaksSkipped: 0,
          breaksSnoozed: 0
        }
      };
    }
  }

  saveBreakHistory() {
    try {
      fs.writeFileSync(this.breaksFilePath, JSON.stringify(this.breakHistory, null, 2), 'utf8');
    } catch (error) {
      console.error('Error saving break history:', error);
    }
  }

  updateSettings(settings) {
    if (settings.breakInterval !== undefined) {
      this.breakInterval = settings.breakInterval;
    }
    if (settings.enabled !== undefined) {
      this.enabled = settings.enabled;
      if (!this.enabled) {
        // Reset sitting time when disabled
        this.resetSittingTimer();
      }
    }
  }

  getSettings() {
    return {
      breakInterval: this.breakInterval,
      enabled: this.enabled
    };
  }

  // Called when posture is detected (user is sitting)
  onUserSitting() {
    if (!this.enabled || this.isOnBreak) return;

    const now = Date.now();
    this.lastActivityTime = now;

    // Start sitting timer if not already started
    if (!this.sittingStartTime) {
      this.sittingStartTime = now;
      console.log('Started sitting timer');
    }
  }

  // Called when no posture is detected (user left desk)
  onUserAway(awayDuration) {
    // If user is away for more than 5 minutes, reset sitting timer
    if (awayDuration > 5 * 60 * 1000) {
      console.log('User away for 5+ minutes, resetting sitting timer');
      this.resetSittingTimer();
    }
  }

  resetSittingTimer() {
    this.sittingStartTime = null;
    this.accumulatedSittingTime = 0;
    this.isSnoozed = false;
    this.snoozeEndTime = null;
  }

  getSittingDuration() {
    if (!this.sittingStartTime) return 0;
    return Date.now() - this.sittingStartTime + this.accumulatedSittingTime;
  }

  checkBreakDue() {
    if (!this.enabled || this.isOnBreak || this.isSnoozed) return false;

    const sittingDuration = this.getSittingDuration();
    return sittingDuration >= this.breakInterval;
  }

  getNextExercise() {
    if (this.exercises.length === 0) return null;

    // Rotate through exercises, don't repeat consecutively
    this.lastExerciseIndex = (this.lastExerciseIndex + 1) % this.exercises.length;
    return this.exercises[this.lastExerciseIndex];
  }

  triggerBreak() {
    if (!this.enabled || this.isOnBreak) return null;

    const exercise = this.getNextExercise();
    if (!exercise) return null;

    this.breakHistory.stats.totalBreaksDue++;
    this.saveBreakHistory();

    console.log('Break due! Exercise:', exercise.name);

    if (this.onBreakDue) {
      this.onBreakDue(exercise);
    }

    return exercise;
  }

  startBreak(exercise) {
    this.isOnBreak = true;
    this.breakStartTime = Date.now();

    const breakRecord = {
      timestamp: this.breakStartTime,
      exercise: exercise,
      sittingDuration: this.getSittingDuration(),
      action: 'taken',
      completed: false
    };

    this.breakHistory.breaks.push(breakRecord);

    // Keep only last 500 breaks
    if (this.breakHistory.breaks.length > 500) {
      this.breakHistory.breaks = this.breakHistory.breaks.slice(-500);
    }

    this.breakHistory.stats.breaksTaken++;
    this.saveBreakHistory();

    console.log('Break started:', exercise.name);

    // Auto-complete break after exercise duration + 30 seconds buffer
    const breakDuration = (exercise.duration + 30) * 1000;
    setTimeout(() => {
      this.completeBreak();
    }, breakDuration);
  }

  completeBreak() {
    if (!this.isOnBreak) return;

    this.isOnBreak = false;
    this.breakStartTime = null;
    this.resetSittingTimer();

    // Mark last break as completed
    if (this.breakHistory.breaks.length > 0) {
      const lastBreak = this.breakHistory.breaks[this.breakHistory.breaks.length - 1];
      if (lastBreak.action === 'taken' && !lastBreak.completed) {
        lastBreak.completed = true;
        lastBreak.completedAt = Date.now();
        this.saveBreakHistory();
      }
    }

    console.log('Break completed');

    if (this.onBreakComplete) {
      this.onBreakComplete();
    }
  }

  skipBreak() {
    const breakRecord = {
      timestamp: Date.now(),
      sittingDuration: this.getSittingDuration(),
      action: 'skipped'
    };

    this.breakHistory.breaks.push(breakRecord);
    this.breakHistory.stats.breaksSkipped++;
    this.saveBreakHistory();

    // Reset sitting timer and start fresh
    this.resetSittingTimer();

    console.log('Break skipped');
  }

  snoozeBreak() {
    this.isSnoozed = true;
    this.snoozeEndTime = Date.now() + this.snoozeTime;

    const breakRecord = {
      timestamp: Date.now(),
      sittingDuration: this.getSittingDuration(),
      action: 'snoozed',
      snoozeUntil: this.snoozeEndTime
    };

    this.breakHistory.breaks.push(breakRecord);
    this.breakHistory.stats.breaksSnoozed++;
    this.saveBreakHistory();

    console.log('Break snoozed for 5 minutes');
  }

  getBreakStats() {
    const totalBreaksDue = this.breakHistory.stats.totalBreaksDue;
    const breaksTaken = this.breakHistory.stats.breaksTaken;
    const complianceRate = totalBreaksDue > 0
      ? Math.round((breaksTaken / totalBreaksDue) * 100)
      : 0;

    return {
      ...this.breakHistory.stats,
      complianceRate,
      recentBreaks: this.breakHistory.breaks.slice(-10)
    };
  }

  startMonitoring() {
    // Check every 30 seconds if break is due
    this.monitoringInterval = setInterval(() => {
      // Check if snooze expired
      if (this.isSnoozed && Date.now() >= this.snoozeEndTime) {
        this.isSnoozed = false;
        this.snoozeEndTime = null;
        console.log('Snooze expired');
      }

      // Check if user has been away (no activity for 5+ minutes)
      if (this.lastActivityTime && !this.isOnBreak) {
        const timeSinceActivity = Date.now() - this.lastActivityTime;
        if (timeSinceActivity > 5 * 60 * 1000) {
          this.onUserAway(timeSinceActivity);
        }
      }

      // Check if break is due
      if (this.checkBreakDue()) {
        this.triggerBreak();
      }
    }, 30000); // Check every 30 seconds
  }

  stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }
}

module.exports = BreakManager;

// Renderer Process - Posture Detection + UI
// Uses MediaPipe Pose via CDN scripts loaded in index.html

// DOM Elements
const cameraPreview = document.getElementById('camera-preview');
const poseCanvas = document.getElementById('pose-canvas');
const cameraStatus = document.getElementById('camera-status');
const scoreValue = document.getElementById('score-value');
const scoreProgress = document.getElementById('score-progress');
const statusIndicator = document.getElementById('status-indicator');
const statusMessage = document.getElementById('status-message');
const goodPosturePercent = document.getElementById('good-posture-percent');
const slouchCount = document.getElementById('slouch-count');
const streakCount = document.getElementById('streak-count');
const calibrateBtn = document.getElementById('calibrate-btn');
const pauseBtn = document.getElementById('pause-btn');
const pauseIcon = document.getElementById('pause-icon');
const pauseText = document.getElementById('pause-text');

// Constants
const CIRCLE_CIRCUMFERENCE = 326.73;

// State
let isPaused = false;
let isCalibrating = false;
let isCalibrated = false;
let cameraStream = null;
let pose = null;

// Baseline (set during calibration)
let baseline = null; // { headForwardDeg, shoulderTiltDeg }

// Stats tracking
let stats = {
  goodFrames: 0,
  totalFrames: 0,
  slouches: 0,
  currentStreakSec: 0,
  lastGoodTime: null,
  currentState: 'UNCALIBRATED'
};

// Slouch timing
let warningStart = null;
let slouchStart = null;
const WARNING_MS = 5000;
const SLOUCH_MS = 15000;

// ===== POSTURE MATH (from cameraPosture.ts) =====

function computeHeadForwardDeg(landmarks) {
  const { nose, leftEar, rightEar, leftShoulder, rightShoulder } = landmarks;
  const earMidX = (leftEar.x + rightEar.x) / 2;
  const earMidY = (leftEar.y + rightEar.y) / 2;
  const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
  const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
  
  const dx = earMidX - shoulderMidX;
  const dy = earMidY - shoulderMidY;
  // In image coords, forward lean = ears moving forward (lower y relative to shoulders)
  // We measure the angle of the ear-shoulder vector from vertical
  const angleRad = Math.atan2(Math.abs(dx), Math.abs(dy));
  return angleRad * (180 / Math.PI);
}

function computeShoulderTiltDeg(landmarks) {
  const { leftShoulder, rightShoulder } = landmarks;
  const dx = rightShoulder.x - leftShoulder.x;
  const dy = rightShoulder.y - leftShoulder.y;
  return Math.atan2(dy, dx) * (180 / Math.PI);
}

function extractLandmarks(poseLandmarks) {
  if (!poseLandmarks || poseLandmarks.length < 13) return null;
  return {
    nose: poseLandmarks[0],
    leftEar: poseLandmarks[7],
    rightEar: poseLandmarks[8],
    leftShoulder: poseLandmarks[11],
    rightShoulder: poseLandmarks[12]
  };
}

// ===== INITIALIZATION =====

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Renderer loaded');
  await initCamera();
  initMediaPipe();
  setupEventListeners();
});

async function initCamera() {
  try {
    updateCameraStatus('Requesting camera...', false);
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
    });
    cameraPreview.srcObject = cameraStream;
    await new Promise(r => { cameraPreview.onloadedmetadata = r; });
    poseCanvas.width = cameraPreview.videoWidth;
    poseCanvas.height = cameraPreview.videoHeight;
    updateCameraStatus('Active', true);
  } catch (err) {
    console.error('Camera failed:', err);
    updateCameraStatus('Camera denied', false, true);
  }
}

function initMediaPipe() {
  if (typeof Pose === 'undefined') {
    console.error('MediaPipe Pose not loaded. Make sure CDN scripts are in index.html');
    updateCameraStatus('MediaPipe not loaded', false, true);
    return;
  }

  pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
  });

  pose.setOptions({
    modelComplexity: 1,
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });

  pose.onResults(onPoseResults);

  // Start detection loop
  detectLoop();
}

async function detectLoop() {
  if (!pose || !cameraPreview || cameraPreview.readyState < 2) {
    setTimeout(detectLoop, 500);
    return;
  }

  if (!isPaused) {
    try {
      await pose.send({ image: cameraPreview });
    } catch (e) {
      console.warn('Pose send error:', e);
    }
  }

  // Run every ~1.5 seconds to save CPU
  setTimeout(detectLoop, 1500);
}

// ===== POSE RESULTS =====

function onPoseResults(results) {
  if (!results.poseLandmarks) return;

  const landmarks = extractLandmarks(results.poseLandmarks);
  if (!landmarks) return;

  // Draw landmarks on canvas
  drawLandmarks(results.poseLandmarks);

  if (!isCalibrated) {
    statusMessage.textContent = 'Calibration needed — sit up straight & click Calibrate';
    return;
  }

  // Compute current angles
  const headForward = computeHeadForwardDeg(landmarks);
  const shoulderTilt = computeShoulderTiltDeg(landmarks);

  const headDelta = Math.abs(headForward - baseline.headForwardDeg);
  const shoulderDelta = Math.abs(shoulderTilt - baseline.shoulderTiltDeg);

  // Score: 100 = perfect, decreases as you deviate
  const headScore = Math.max(0, 100 - headDelta * 5);
  const shoulderScore = Math.max(0, 100 - shoulderDelta * 3);
  const score = Math.round(headScore * 0.7 + shoulderScore * 0.3);

  // Determine state
  const HEAD_THRESHOLD = 10;
  const SHOULDER_THRESHOLD = 8;
  const now = Date.now();

  let frameState = 'GOOD';
  if (headDelta > HEAD_THRESHOLD || shoulderDelta > SHOULDER_THRESHOLD) {
    frameState = 'BAD';
  } else if (headDelta > HEAD_THRESHOLD * 0.6 || shoulderDelta > SHOULDER_THRESHOLD * 0.6) {
    frameState = 'WARNING';
  }

  // State machine with timing
  stats.totalFrames++;

  if (frameState === 'GOOD') {
    warningStart = null;
    slouchStart = null;
    stats.goodFrames++;
    stats.currentState = 'GOOD';
    if (!stats.lastGoodTime) stats.lastGoodTime = now;
    stats.currentStreakSec = Math.round((now - stats.lastGoodTime) / 1000);
  } else if (frameState === 'WARNING') {
    if (!warningStart) warningStart = now;
    slouchStart = null; // Reset slouch timer when in warning state
    if (now - warningStart > WARNING_MS) {
      stats.currentState = 'WARNING';
    } else {
      // Still good during the 5s grace period
      stats.currentState = 'GOOD';
    }
    stats.lastGoodTime = null;
    stats.currentStreakSec = 0;
  } else {
    // frameState === 'BAD'
    if (!slouchStart) {
      slouchStart = now;
    }
    if (now - slouchStart > SLOUCH_MS) {
      if (stats.currentState !== 'SLOUCHING') {
        stats.slouches++;
        // Notify main process for system notification
        if (window.electron) {
          window.electron.send('posture-state-changed', 'slouching');
        }
      }
      stats.currentState = 'SLOUCHING';
    } else {
      // Still warning during the 15s grace period
      stats.currentState = 'WARNING';
    }
    warningStart = null; // Reset warning timer when in bad state
    stats.lastGoodTime = null;
    stats.currentStreakSec = 0;
  }

  // Update UI
  updateScoreDisplay(score);
  updatePostureState(stats.currentState);
  updateStats();

  // Notify main for tray icon
  if (window.electron) {
    const stateMap = { 'GOOD': 'good', 'WARNING': 'warning', 'SLOUCHING': 'slouching' };
    window.electron.send('posture-state-changed', stateMap[stats.currentState] || 'good');
  }
}

// ===== UI UPDATES =====

function updateCameraStatus(text, active, error) {
  const statusText = cameraStatus.querySelector('.status-text');
  statusText.textContent = text;
  cameraStatus.classList.remove('active', 'error');
  if (active) cameraStatus.classList.add('active');
  if (error) cameraStatus.classList.add('error');
}

function updateScoreDisplay(score) {
  scoreValue.textContent = score;
  const offset = CIRCLE_CIRCUMFERENCE - (score / 100) * CIRCLE_CIRCUMFERENCE;
  scoreProgress.style.strokeDashoffset = offset;

  scoreProgress.classList.remove('good', 'warning', 'bad');
  if (score >= 80) scoreProgress.classList.add('good');
  else if (score >= 60) scoreProgress.classList.add('warning');
  else scoreProgress.classList.add('bad');
}

function updatePostureState(state) {
  const stateMap = {
    'GOOD': { cls: 'good', msg: '✅ Good posture' },
    'WARNING': { cls: 'warning', msg: '⚠️ Check your posture' },
    'SLOUCHING': { cls: 'bad', msg: '🔴 Slouching!' },
    'UNCALIBRATED': { cls: '', msg: 'Calibration needed' }
  };
  const info = stateMap[state] || stateMap['UNCALIBRATED'];
  statusIndicator.classList.remove('good', 'warning', 'bad');
  if (info.cls) statusIndicator.classList.add(info.cls);
  if (!isPaused) statusMessage.textContent = info.msg;
}

function updateStats() {
  const goodPct = stats.totalFrames > 0 ? Math.round((stats.goodFrames / stats.totalFrames) * 100) : 0;
  goodPosturePercent.textContent = `${goodPct}%`;
  slouchCount.textContent = stats.slouches;
  streakCount.textContent = `${stats.currentStreakSec}s`;
}

function drawLandmarks(poseLandmarks) {
  const ctx = poseCanvas.getContext('2d');
  ctx.clearRect(0, 0, poseCanvas.width, poseCanvas.height);

  const keyIndices = [0, 7, 8, 11, 12]; // nose, ears, shoulders
  ctx.fillStyle = '#14b8a6';
  ctx.strokeStyle = '#14b8a6';
  ctx.lineWidth = 2;

  keyIndices.forEach(i => {
    if (poseLandmarks[i]) {
      const x = poseLandmarks[i].x * poseCanvas.width;
      const y = poseLandmarks[i].y * poseCanvas.height;
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, 2 * Math.PI);
      ctx.fill();
    }
  });

  // Shoulder line
  if (poseLandmarks[11] && poseLandmarks[12]) {
    ctx.beginPath();
    ctx.moveTo(poseLandmarks[11].x * poseCanvas.width, poseLandmarks[11].y * poseCanvas.height);
    ctx.lineTo(poseLandmarks[12].x * poseCanvas.width, poseLandmarks[12].y * poseCanvas.height);
    ctx.stroke();
  }

  // Nose to shoulder midpoint (posture line)
  if (poseLandmarks[0] && poseLandmarks[11] && poseLandmarks[12]) {
    const midX = (poseLandmarks[11].x + poseLandmarks[12].x) / 2 * poseCanvas.width;
    const midY = (poseLandmarks[11].y + poseLandmarks[12].y) / 2 * poseCanvas.height;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(poseLandmarks[0].x * poseCanvas.width, poseLandmarks[0].y * poseCanvas.height);
    ctx.lineTo(midX, midY);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// ===== EVENT LISTENERS =====

function setupEventListeners() {
  calibrateBtn.addEventListener('click', handleCalibrate);
  pauseBtn.addEventListener('click', handlePauseToggle);
}

function handleCalibrate() {
  if (isCalibrating) return;
  isCalibrating = true;
  calibrateBtn.disabled = true;
  calibrateBtn.classList.add('calibrating');
  statusMessage.textContent = '📸 Sit up straight... capturing in 3s';

  // Wait 3 seconds then capture baseline
  setTimeout(() => {
    // Get current frame landmarks
    if (pose && cameraPreview && cameraPreview.readyState >= 2) {
      pose.send({ image: cameraPreview }).then(() => {
        // The onPoseResults callback will have updated currentLandmarks
        // We need to capture on next result
      });
    }

    // Use a one-shot results handler for calibration
    const calibrationHandler = (results) => {
      if (!results.poseLandmarks) {
        statusMessage.textContent = '❌ No pose detected. Try again.';
        isCalibrating = false;
        calibrateBtn.disabled = false;
        calibrateBtn.classList.remove('calibrating');
        pose.onResults(onPoseResults);
        return;
      }

      const landmarks = extractLandmarks(results.poseLandmarks);
      if (!landmarks) {
        statusMessage.textContent = '❌ Could not detect shoulders. Try again.';
        isCalibrating = false;
        calibrateBtn.disabled = false;
        calibrateBtn.classList.remove('calibrating');
        pose.onResults(onPoseResults);
        return;
      }

      baseline = {
        headForwardDeg: computeHeadForwardDeg(landmarks),
        shoulderTiltDeg: computeShoulderTiltDeg(landmarks)
      };

      isCalibrated = true;
      isCalibrating = false;
      calibrateBtn.disabled = false;
      calibrateBtn.classList.remove('calibrating');
      statusMessage.textContent = '✅ Calibrated! Monitoring posture...';

      // Reset stats
      stats.goodFrames = 0;
      stats.totalFrames = 0;
      stats.slouches = 0;
      stats.currentStreakSec = 0;
      stats.lastGoodTime = Date.now();

      // Restore normal handler
      pose.onResults(onPoseResults);
    };

    pose.onResults(calibrationHandler);

    // Trigger a frame
    if (cameraPreview.readyState >= 2) {
      pose.send({ image: cameraPreview });
    }
  }, 3000);
}

function handlePauseToggle() {
  isPaused = !isPaused;
  if (isPaused) {
    pauseIcon.textContent = '▶️';
    pauseText.textContent = 'Resume';
    statusMessage.textContent = '⏸ Monitoring paused';
  } else {
    pauseIcon.textContent = '⏸';
    pauseText.textContent = 'Pause';
    statusMessage.textContent = isCalibrated ? '✅ Monitoring...' : 'Calibration needed';
  }
}

// Cleanup
window.addEventListener('beforeunload', () => {
  if (cameraStream) cameraStream.getTracks().forEach(t => t.stop());
  if (pose) pose.close();
});

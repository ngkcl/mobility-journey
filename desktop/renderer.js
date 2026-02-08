// Renderer Process - UI Logic and IPC Communication
// This handles the popover window UI, camera preview, and communication with main/vision processes

// DOM Elements
const cameraPreview = document.getElementById('camera-preview');
const poseCanvas = document.getElementById('pose-canvas');
const cameraStatus = document.getElementById('camera-status');
const scoreValue = document.getElementById('score-value');
const scoreProgress = document.getElementById('score-progress');
const scoreRing = document.getElementById('score-ring');
const statusIndicator = document.getElementById('status-indicator');
const statusMessage = document.getElementById('status-message');
const goodPosturePercent = document.getElementById('good-posture-percent');
const slouchCount = document.getElementById('slouch-count');
const streakCount = document.getElementById('streak-count');
const calibrateBtn = document.getElementById('calibrate-btn');
const pauseBtn = document.getElementById('pause-btn');
const pauseIcon = document.getElementById('pause-icon');
const pauseText = document.getElementById('pause-text');

// State
let isPaused = false;
let isCalibrating = false;
let cameraStream = null;
let currentScore = 0;

// Constants
const CIRCLE_CIRCUMFERENCE = 326.73; // 2 * PI * 52 (radius from SVG)

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Renderer process loaded');
    await initializeCamera();
    setupEventListeners();
    requestInitialData();
});

// Camera Initialization
async function initializeCamera() {
    try {
        updateCameraStatus('Requesting camera access...', false);

        cameraStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user'
            }
        });

        cameraPreview.srcObject = cameraStream;

        // Wait for video to be ready
        await new Promise((resolve) => {
            cameraPreview.onloadedmetadata = resolve;
        });

        // Set canvas size to match video
        poseCanvas.width = cameraPreview.videoWidth;
        poseCanvas.height = cameraPreview.videoHeight;

        updateCameraStatus('Active', true);

        // Notify main process that camera is ready
        if (window.electron) {
            window.electron.send('camera-ready', {
                width: cameraPreview.videoWidth,
                height: cameraPreview.videoHeight
            });
        }

    } catch (error) {
        console.error('Camera initialization failed:', error);
        updateCameraStatus('Camera access denied', false, true);

        if (window.electron) {
            window.electron.send('camera-error', error.message);
        }
    }
}

function updateCameraStatus(text, active = false, error = false) {
    const statusText = cameraStatus.querySelector('.status-text');
    statusText.textContent = text;

    cameraStatus.classList.remove('active', 'error');
    if (active) cameraStatus.classList.add('active');
    if (error) cameraStatus.classList.add('error');
}

// Event Listeners
function setupEventListeners() {
    calibrateBtn.addEventListener('click', handleCalibrate);
    pauseBtn.addEventListener('click', handlePauseToggle);

    // IPC listeners (will be set up by electron-shell via preload)
    if (window.electron) {
        // Listen for posture updates from vision detection
        window.electron.on('posture-update', handlePostureUpdate);

        // Listen for stats updates
        window.electron.on('stats-update', handleStatsUpdate);

        // Listen for calibration status
        window.electron.on('calibration-status', handleCalibrationStatus);

        // Listen for pause state changes
        window.electron.on('pause-state', handlePauseState);
    }
}

// Request Initial Data
function requestInitialData() {
    if (window.electron) {
        window.electron.send('request-stats');
        window.electron.send('request-posture-state');
    }
}

// Calibration Handler
function handleCalibrate() {
    if (isCalibrating) return;

    isCalibrating = true;
    calibrateBtn.disabled = true;
    calibrateBtn.classList.add('calibrating');

    // Update UI to show calibration in progress
    statusMessage.textContent = 'Sit up straight and hold...';
    statusIndicator.classList.remove('good', 'warning', 'bad');

    // Send calibration request to main process
    if (window.electron) {
        window.electron.send('start-calibration');
    }

    // Calibration will complete when we receive 'calibration-status' event
}

function handleCalibrationStatus(event, data) {
    const { success, message } = data;

    isCalibrating = false;
    calibrateBtn.disabled = false;
    calibrateBtn.classList.remove('calibrating');

    if (success) {
        statusMessage.textContent = 'Calibration successful';
        // Visual feedback
        scoreRing.style.animation = 'none';
        setTimeout(() => {
            scoreRing.style.animation = '';
        }, 100);
    } else {
        statusMessage.textContent = message || 'Calibration failed';
    }
}

// Pause/Resume Handler
function handlePauseToggle() {
    isPaused = !isPaused;

    if (window.electron) {
        window.electron.send('toggle-pause', isPaused);
    }

    updatePauseButton();
}

function handlePauseState(event, paused) {
    isPaused = paused;
    updatePauseButton();
}

function updatePauseButton() {
    if (isPaused) {
        pauseIcon.textContent = '▶️';
        pauseText.textContent = 'Resume';
        pauseBtn.style.backgroundColor = 'var(--teal)';
        pauseBtn.style.color = 'var(--bg-deep)';
        statusMessage.textContent = 'Monitoring paused';
    } else {
        pauseIcon.textContent = '⏸';
        pauseText.textContent = 'Pause';
        pauseBtn.style.backgroundColor = '';
        pauseBtn.style.color = '';
    }
}

// Posture Update Handler
function handlePostureUpdate(event, data) {
    const { score, state, angle } = data;

    // Update score display
    if (score !== undefined && score !== null) {
        currentScore = Math.round(score);
        scoreValue.textContent = currentScore;

        // Update circular progress
        updateScoreRing(currentScore);
    }

    // Update state indicator
    if (state) {
        updatePostureState(state);
    }

    // Draw pose landmarks if provided
    if (data.landmarks) {
        drawPoseLandmarks(data.landmarks);
    }
}

function updateScoreRing(score) {
    // Calculate stroke-dashoffset (0-100 maps to full circle to no circle)
    const offset = CIRCLE_CIRCUMFERENCE - (score / 100) * CIRCLE_CIRCUMFERENCE;
    scoreProgress.style.strokeDashoffset = offset;

    // Update color based on score
    scoreProgress.classList.remove('good', 'warning', 'bad');
    if (score >= 80) {
        scoreProgress.classList.add('good');
    } else if (score >= 60) {
        scoreProgress.classList.add('warning');
    } else {
        scoreProgress.classList.add('bad');
    }
}

function updatePostureState(state) {
    const stateMap = {
        'GOOD': { class: 'good', message: 'Good posture' },
        'WARNING': { class: 'warning', message: 'Posture needs attention' },
        'SLOUCHING': { class: 'bad', message: 'Slouching detected' },
        'UNCALIBRATED': { class: '', message: 'Calibration needed' }
    };

    const stateInfo = stateMap[state] || stateMap['UNCALIBRATED'];

    statusIndicator.classList.remove('good', 'warning', 'bad');
    if (stateInfo.class) {
        statusIndicator.classList.add(stateInfo.class);
    }

    if (!isPaused) {
        statusMessage.textContent = stateInfo.message;
    }
}

// Stats Update Handler
function handleStatsUpdate(event, data) {
    const { goodPosturePercent: goodPercent, slouchCount: slouches, currentStreak } = data;

    // Update stats display
    if (goodPercent !== undefined && goodPercent !== null) {
        goodPosturePercent.textContent = `${Math.round(goodPercent)}%`;
    }

    if (slouches !== undefined && slouches !== null) {
        slouchCount.textContent = slouches;
    }

    if (currentStreak !== undefined && currentStreak !== null) {
        streakCount.textContent = currentStreak;
    }
}

// Draw Pose Landmarks on Canvas
function drawPoseLandmarks(landmarks) {
    const ctx = poseCanvas.getContext('2d');
    ctx.clearRect(0, 0, poseCanvas.width, poseCanvas.height);

    if (!landmarks || landmarks.length === 0) return;

    // Key landmarks to draw: shoulders, ears, nose
    const keyPoints = [
        { index: 0, name: 'nose' },
        { index: 7, name: 'left_ear' },
        { index: 8, name: 'right_ear' },
        { index: 11, name: 'left_shoulder' },
        { index: 12, name: 'right_shoulder' }
    ];

    // Draw landmarks
    ctx.fillStyle = '#14b8a6';
    ctx.strokeStyle = '#14b8a6';
    ctx.lineWidth = 2;

    keyPoints.forEach(({ index }) => {
        if (landmarks[index]) {
            const x = landmarks[index].x * poseCanvas.width;
            const y = landmarks[index].y * poseCanvas.height;

            // Draw point
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fill();
        }
    });

    // Draw connections
    // Shoulders line
    if (landmarks[11] && landmarks[12]) {
        const leftShoulder = {
            x: landmarks[11].x * poseCanvas.width,
            y: landmarks[11].y * poseCanvas.height
        };
        const rightShoulder = {
            x: landmarks[12].x * poseCanvas.width,
            y: landmarks[12].y * poseCanvas.height
        };

        ctx.beginPath();
        ctx.moveTo(leftShoulder.x, leftShoulder.y);
        ctx.lineTo(rightShoulder.x, rightShoulder.y);
        ctx.stroke();
    }

    // Head to shoulders (for posture visualization)
    if (landmarks[0] && landmarks[11] && landmarks[12]) {
        const nose = {
            x: landmarks[0].x * poseCanvas.width,
            y: landmarks[0].y * poseCanvas.height
        };
        const shoulderMidpoint = {
            x: (landmarks[11].x + landmarks[12].x) / 2 * poseCanvas.width,
            y: (landmarks[11].y + landmarks[12].y) / 2 * poseCanvas.height
        };

        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(nose.x, nose.y);
        ctx.lineTo(shoulderMidpoint.x, shoulderMidpoint.y);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

// Cleanup on window close
window.addEventListener('beforeunload', () => {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
    }
});

// Expose functions for testing/debugging
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        handlePostureUpdate,
        handleStatsUpdate,
        updateScoreRing,
        updatePostureState
    };
}

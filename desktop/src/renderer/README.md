# Vision/Detection System - Renderer Process

This directory contains the vision and posture detection implementation for the Electron renderer process.

## Architecture

### Core Modules

#### 1. `lib/webcam-capture.ts`
Handles webcam access using `navigator.mediaDevices.getUserMedia()`.

**Features:**
- Permission request handling
- Device enumeration for multiple webcams
- Stream management (start/stop)
- Configurable resolution (default: 640x480)

#### 2. `lib/mediapipe-detector.ts`
Wraps MediaPipe Pose detection library.

**Features:**
- Initializes MediaPipe Pose model from CDN
- Extracts 5 key landmarks: nose, left/right ears, left/right shoulders
- Converts MediaPipe format to our `CameraPoseLandmarks` type
- Configurable model complexity and confidence thresholds

**MediaPipe Landmark Indices:**
- Nose: 0
- Left Ear: 7
- Right Ear: 8
- Left Shoulder: 11
- Right Shoulder: 12

#### 3. `lib/posture-monitor.ts`
Main orchestrator that integrates webcam, MediaPipe, and posture detection.

**Features:**
- Frame capture every 1-2 seconds (configurable)
- Manages webcam and detector lifecycle
- Calibration flow (captures baseline posture)
- Real-time posture analysis using `cameraPosture.ts` logic
- Event callbacks for updates and errors

**State Machine:**
```
GOOD_POSTURE → WARNING (5s of bad posture) → SLOUCHING (30s of bad posture)
              ↓                              ↓
              ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ←
           (returns to GOOD when posture corrects)
```

#### 4. `index.ts`
Main renderer script with UI integration and IPC handling.

**Responsibilities:**
- Initialize PostureMonitor
- Handle calibration button clicks
- Update UI with posture state and metrics
- Send IPC messages to main process
- Listen for IPC commands (calibrate, start, stop)

#### 5. `preload.ts`
Secure IPC bridge using Electron's contextBridge.

**Exposed API:**
```typescript
window.electronAPI = {
  sendPostureUpdate(update)
  sendPostureEvent(event)
  sendCalibrationComplete(data)
  sendCameraError(error)
  onCalibrationRequest(callback)
  onCameraStart(callback)
  onCameraStop(callback)
}
```

## Posture Detection Logic

### Metrics Calculated
From `../../shared/cameraPosture.ts`:

1. **Head Forward Angle**: Measures forward head tilt
   - Calculated from nose Z position relative to shoulder midpoint
   - Delta from baseline triggers warning/slouching state

2. **Shoulder Tilt**: Measures shoulder height difference
   - Calculated from left/right shoulder Y positions
   - Indicates leaning to one side

### Thresholds (Default)
- Head Forward Threshold: 12° deviation from baseline
- Shoulder Tilt Threshold: 8° deviation from baseline
- Warning Duration: 5 seconds
- Slouching Duration: 30 seconds

### Calibration
User clicks "Calibrate Posture" while sitting up straight. The system:
1. Captures current landmarks
2. Calculates head forward angle and shoulder tilt
3. Stores as baseline for future comparisons
4. All future measurements are compared against this baseline

## IPC Communication

### Renderer → Main
- `posture:update` - Sends posture state and metrics every analysis cycle
- `posture:event` - Sends event when state changes (GOOD → WARNING → SLOUCHING)
- `calibration:complete` - Sends baseline data after successful calibration
- `camera:error` - Sends error messages

### Main → Renderer
- `calibration:request` - Triggers calibration
- `camera:start` - Starts monitoring
- `camera:stop` - Stops monitoring

## UI Components

### HTML Elements
- `#video` - Hidden video element for webcam feed
- `#posture-state` - Shows current state (GOOD/WARNING/SLOUCHING)
- `#posture-metrics` - Shows head forward and shoulder tilt angles
- `#calibrate-btn` - Triggers calibration
- `#calibration-status` - Shows calibration success/failure
- `#error-message` - Shows error messages

## Dependencies

```json
{
  "@mediapipe/pose": "^0.5.1635989137",
  "@mediapipe/camera_utils": "^0.3.1632432234"
}
```

## Performance Considerations

1. **Frame Rate**: Analysis runs every 1.5 seconds (not every frame)
   - Reduces CPU usage
   - Sufficient for posture monitoring
   - Configurable via `frameCaptureIntervalMs`

2. **MediaPipe Model Complexity**: Set to 1 (medium)
   - Balance between accuracy and performance
   - Can be adjusted for faster/slower machines

3. **Video Resolution**: 640x480 default
   - Adequate for landmark detection
   - Lower resolution = better performance

## Integration with Main Process

The main process should:
1. Create a BrowserWindow with this HTML
2. Set preload script to `preload.js`
3. Listen for IPC events from renderer
4. Update tray icon based on posture state
5. Trigger notifications on slouching events
6. Store calibration data in user settings

## Future Enhancements

- [ ] Add visual pose overlay on video feed
- [ ] Support multiple camera selection
- [ ] Configurable sensitivity settings
- [ ] Pause during full-screen apps (meeting detection)
- [ ] Export posture history for analytics

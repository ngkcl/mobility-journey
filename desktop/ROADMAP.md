# Posture Menu Bar App — Roadmap

## v1 (Current - MVP)
- [x] Electron menu bar app
- [x] Webcam + MediaPipe pose detection
- [x] Slouch detection with state machine
- [x] Calibration flow
- [x] Score calculation
- [x] Native macOS notifications
- [ ] QA + UI polish (Agent Teams in progress)

## v2 (Next)
- [ ] Persist stats to local JSON (survive app restart)
- [ ] Sync posture data to Supabase (same DB as mobile app)
- [ ] Daily/weekly posture reports
- [ ] Auto-calibrate after X minutes of good posture
- [ ] Smart notifications (don't spam, learn patterns)
- [ ] Keyboard shortcut to recalibrate (Cmd+Shift+P)
- [ ] System tray context menu (Calibrate, Pause, Quit, Stats)

## v3 (Future)
- [ ] ML model trained on user's specific posture patterns
- [ ] Integration with Eight Sleep (sleep posture → day posture correlation)
- [ ] Multiple monitor/camera support
- [ ] Screen break reminders based on posture fatigue
- [ ] Export data for physiotherapist

import { contextBridge, ipcRenderer } from 'electron';
import type { PostureUpdate, CalibrationData } from '../shared/ipc-types';
import { IPC_CHANNELS } from '../shared/ipc-types';

contextBridge.exposeInMainWorld('electronAPI', {
  sendPostureUpdate: (update: PostureUpdate) => {
    ipcRenderer.send(IPC_CHANNELS.POSTURE_UPDATE, update);
  },

  sendPostureEvent: (event: PostureUpdate['event']) => {
    ipcRenderer.send(IPC_CHANNELS.POSTURE_EVENT, event);
  },

  sendCalibrationComplete: (data: CalibrationData) => {
    ipcRenderer.send(IPC_CHANNELS.CALIBRATION_COMPLETE, data);
  },

  sendCameraError: (error: string) => {
    ipcRenderer.send(IPC_CHANNELS.CAMERA_ERROR, error);
  },

  onCalibrationRequest: (callback: () => void) => {
    ipcRenderer.on(IPC_CHANNELS.CALIBRATION_REQUEST, () => callback());
  },

  onCameraStart: (callback: () => void) => {
    ipcRenderer.on(IPC_CHANNELS.CAMERA_START, () => callback());
  },

  onCameraStop: (callback: () => void) => {
    ipcRenderer.on(IPC_CHANNELS.CAMERA_STOP, () => callback());
  },
});

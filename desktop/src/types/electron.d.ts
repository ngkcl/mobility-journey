// Re-export electron types for proper module resolution
// This allows imports like `import { contextBridge } from 'electron'` to work

/// <reference types="electron" />

// Ensure electron module declarations are available
declare module 'electron' {
  export * from 'electron/main';
  export * from 'electron/common';
  export * from 'electron/renderer';
}

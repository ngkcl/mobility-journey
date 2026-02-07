import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { ToastTone } from '../lib/types';

interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  pushToast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const toneConfig: Record<ToastTone, { icon: keyof typeof Ionicons.glyphMap; color: string; bg: string; border: string }> = {
  error: { icon: 'alert-circle', color: '#fca5a5', bg: 'rgba(239,68,68,0.15)', border: 'rgba(239,68,68,0.4)' },
  success: { icon: 'checkmark-circle', color: '#6ee7b7', bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.4)' },
  info: { icon: 'information-circle', color: '#99f6e4', bg: 'rgba(20,184,166,0.15)', border: 'rgba(20,184,166,0.4)' },
};

function ToastItem({ toast, onDone }: { toast: Toast; onDone: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: -20, duration: 200, useNativeDriver: true }),
      ]).start(onDone);
    }, 4000);

    return () => clearTimeout(timer);
  }, []);

  const config = toneConfig[toast.tone];

  return (
    <Animated.View
      style={{
        opacity,
        transform: [{ translateY }],
        backgroundColor: config.bg,
        borderColor: config.border,
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        marginBottom: 8,
      }}
    >
      <Ionicons name={config.icon} size={18} color={config.color} style={{ marginTop: 1 }} />
      <Text style={{ color: config.color, fontSize: 14, flex: 1, lineHeight: 20 }}>
        {toast.message}
      </Text>
    </Animated.View>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((message: string, tone: ToastTone = 'info') => {
    // Suppress error toasts related to Supabase/network when not configured
    if (tone === 'error' && (
      message.toLowerCase().includes('load') ||
      message.toLowerCase().includes('fetch') ||
      message.toLowerCase().includes('network') ||
      message.toLowerCase().includes('supabase') ||
      message.toLowerCase().includes('failed')
    )) {
      // Check if supabase is configured - if not, silently ignore
      const { isSupabaseConfigured } = require('../lib/supabase');
      if (!isSupabaseConfigured()) return;
    }
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { id, message, tone }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View
        style={{
          position: 'absolute',
          top: 60,
          right: 16,
          left: 16,
          zIndex: 9999,
          pointerEvents: 'none',
        }}
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDone={() => removeToast(toast.id)} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

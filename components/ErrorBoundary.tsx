import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, typography, spacing, radii, shared } from '../lib/theme';

interface Props {
  children: ReactNode;
  /** Optional fallback to render instead of default error UI */
  fallback?: ReactNode;
  /** Screen name for error reporting context */
  screenName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error for debugging — could integrate with Sentry later
    console.error(
      `[ErrorBoundary${this.props.screenName ? ` @ ${this.props.screenName}` : ''}]`,
      error.message,
      errorInfo.componentStack,
    );
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <View style={styles.container}>
          <View style={styles.card}>
            <View style={styles.iconContainer}>
              <Ionicons name="warning-outline" size={40} color={colors.warning} />
            </View>
            <Text style={styles.title}>Something went wrong</Text>
            <Text style={styles.message}>
              {this.state.error?.message || 'An unexpected error occurred.'}
            </Text>
            {this.props.screenName && (
              <Text style={styles.context}>Screen: {this.props.screenName}</Text>
            )}
            <TouchableOpacity
              style={shared.btnPrimary}
              onPress={this.handleRetry}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh-outline" size={18} color="#fff" />
              <Text style={shared.btnPrimaryText}>Try Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgDeep,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.bgBase,
    borderRadius: radii.xl,
    padding: spacing['3xl'],
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    maxWidth: 320,
    width: '100%',
  },
  iconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.warningDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  message: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  context: {
    ...typography.small,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
});

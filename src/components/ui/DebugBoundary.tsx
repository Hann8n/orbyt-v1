import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Colors } from './UI';

interface DebugBoundaryProps {
  children: React.ReactNode;
  label?: string;
}

interface DebugBoundaryState {
  hasError: boolean;
  error?: Error | null;
  errorInfo?: React.ErrorInfo | null;
}

export default class DebugBoundary extends React.Component<DebugBoundaryProps, DebugBoundaryState> {
  constructor(props: DebugBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ error, errorInfo });
    if (__DEV__) {
      // Pause execution immediately when an error is caught
      // so breakpoints and call stacks are available.
      // eslint-disable-next-line no-debugger
      debugger;
      // Also log for visibility in Metro
      // eslint-disable-next-line no-console
      console.error('[DebugBoundary]', this.props.label || 'UnnamedBoundary', error, errorInfo);
    }
  }

  private reset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      const errorText = `${this.state.error?.name || 'Error'}: ${this.state.error?.message || ''}`;
      const stackText = this.state.errorInfo?.componentStack || this.state.error?.stack || '';

      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something went wrong{this.props.label ? ` in ${this.props.label}` : ''}.</Text>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.error}>{errorText}</Text>
            {!!stackText && <Text style={styles.stack}>{stackText}</Text>}
          </ScrollView>
          <TouchableOpacity onPress={this.reset} style={styles.button} activeOpacity={0.7}>
            <Text style={styles.buttonText}>Try to recover</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children as React.ReactElement;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  title: {
    color: Colors.white,
    fontSize: 18,
    fontFamily: 'Firma-SemiBold',
    marginBottom: 12,
  },
  scroll: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.mediumGray,
    borderRadius: 12,
    backgroundColor: Colors.darkGray,
  },
  scrollContent: {
    padding: 12,
  },
  error: {
    color: Colors.white,
    fontSize: 14,
    marginBottom: 8,
    fontFamily: 'Firma-Medium',
  },
  stack: {
    color: Colors.lightGray,
    fontSize: 12,
    fontFamily: 'Firma-Regular',
  },
  button: {
    marginTop: 16,
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.darkGray,
    borderWidth: 1,
    borderColor: Colors.mediumGray,
  },
  buttonText: {
    color: Colors.white,
    fontFamily: 'Firma-SemiBold',
    fontSize: 14,
  },
});




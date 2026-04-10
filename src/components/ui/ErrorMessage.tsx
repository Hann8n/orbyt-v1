import React from 'react';
import { Text } from 'react-native';
import { authSheetStyles } from './AuthSheetStyles';
import { SquircleView } from './Squircle';

interface ErrorMessageProps {
  error: string | null;
}

/**
 * Reusable error message component for auth sheets
 * Only renders when error is present
 */
const ErrorMessage: React.FC<ErrorMessageProps> = ({ error }) => {
  if (!error) return null;

  return (
    <SquircleView style={authSheetStyles.errorContainer}>
      <Text style={authSheetStyles.errorText}>{error}</Text>
    </SquircleView>
  );
};

export default ErrorMessage;

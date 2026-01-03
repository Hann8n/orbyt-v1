/**
 * React Query Error Boundary Wrapper
 * 
 * Integrates ErrorBoundary with React Query's QueryErrorResetBoundary
 * to properly handle React Query errors and allow resetting queries.
 * 
 * This is the recommended way to handle errors in React Query v5.
 * 
 * Usage:
 * ```tsx
 * <QueryErrorBoundary>
 *   <YourComponentWithQueries />
 * </QueryErrorBoundary>
 * ```
 */

import React, { ReactNode } from 'react';
import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorBoundary, ErrorBoundaryProps } from './ErrorBoundary';

export interface QueryErrorBoundaryProps extends Omit<ErrorBoundaryProps, 'children'> {
  children: ReactNode;
  fallback?: ErrorBoundaryProps['fallback'];
}

/**
 * Error Boundary that integrates with React Query
 * 
 * Wraps children with QueryErrorResetBoundary to allow React Query
 * to reset failed queries when the error boundary resets.
 */
export const QueryErrorBoundary: React.FC<QueryErrorBoundaryProps> = ({
  children,
  fallback,
  onReset,
  ...errorBoundaryProps
}) => {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          {...errorBoundaryProps}
          fallback={fallback}
          onReset={() => {
            // Reset React Query queries when error boundary resets
            reset();
            // Call custom onReset if provided
            onReset?.();
          }}
        >
          {children}
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
};

export default QueryErrorBoundary;

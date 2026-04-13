import React from 'react';
import StatusMessage from './StatusMessage';

interface ErrorMessageProps {
  message: string;
  actionLink?: string;
  actionText?: string;
  helpText?: string;
  onActionPress?: () => void;
}

/**
 * A specialized error message component that uses StatusMessage internally
 */
const ErrorMessage = (props: ErrorMessageProps) => {
  return <StatusMessage {...props} type="error" />;
};

export default ErrorMessage; 
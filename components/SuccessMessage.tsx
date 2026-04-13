import React from 'react';
import StatusMessage from './StatusMessage';

interface SuccessMessageProps {
  message: string;
  actionLink?: string;
  actionText?: string;
  helpText?: string;
  onActionPress?: () => void;
}

/**
 * A specialized success message component that uses StatusMessage internally
 */
const SuccessMessage = (props: SuccessMessageProps) => {
  return <StatusMessage {...props} type="success" />;
};

export default SuccessMessage; 
import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import SimpleLocationDisclosureModal from './SimpleLocationDisclosureModal';
import { 
import { log, warn, error } from '../utils/productionLogger';

  checkLocationPermissionStatus, 
  handleLocationPermissionAfterDisclosure,
  LocationPermissionResult 
} from '../utils/locationPermissionManager';

interface LocationPermissionWrapperProps {
  children: React.ReactNode;
  onPermissionResult?: (result: LocationPermissionResult) => void;
}

export default function LocationPermissionWrapper({ 
  children, 
  onPermissionResult 
}: LocationPermissionWrapperProps) {
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [isCheckingPermission, setIsCheckingPermission] = useState(true);

  useEffect(() => {
    checkInitialPermissionStatus();
  }, []);

  const checkInitialPermissionStatus = async () => {
    try {
      setIsCheckingPermission(true);
      const result = await checkLocationPermissionStatus();
      
      if (result.needsDisclosure) {
        setShowDisclosure(true);
      } else {
        onPermissionResult?.(result);
      }
    } catch (error) {
      error('[LocationPermissionWrapper] Error checking permission status:', error);
      onPermissionResult?.({
        granted: false,
        canAskAgain: true,
        status: 'error',
        needsDisclosure: false
      });
    } finally {
      setIsCheckingPermission(false);
    }
  };

  const handleDisclosureAccept = async () => {
    try {
      setShowDisclosure(false);
      const result = await handleLocationPermissionAfterDisclosure();
      onPermissionResult?.(result);
    } catch (error) {
      error('[LocationPermissionWrapper] Error handling disclosure acceptance:', error);
      onPermissionResult?.({
        granted: false,
        canAskAgain: true,
        status: 'error',
        needsDisclosure: false
      });
    }
  };

  const handleDisclosureDecline = () => {
    setShowDisclosure(false);
    onPermissionResult?.({
      granted: false,
      canAskAgain: true,
      status: 'denied',
      needsDisclosure: false
    });
  };

  return (
    <View style={{ flex: 1 }}>
      {children}
      
      <SimpleLocationDisclosureModal
        visible={showDisclosure}
        onAccept={handleDisclosureAccept}
        onDecline={handleDisclosureDecline}
      />
    </View>
  );
}

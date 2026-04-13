import { useState, useEffect } from 'react';

export type LocationType = {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: number;
};

/**
 * Device GPS is not used. Hook keeps the same shape for screens that optional chaining / null checks.
 */
export default function useLocation() {
  const [location, setLocation] = useState<LocationType | null>(null);
  const [storedLocation, setStoredLocation] = useState<LocationType | null>(null);
  const [errorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [usingStoredLocation] = useState(false);

  useEffect(() => {
    setLoading(false);
  }, []);

  const updateLocation = async () => {
    setLoading(false);
  };

  const clearStoredLocation = async () => {
    setStoredLocation(null);
    setLocation(null);
  };

  return {
    location,
    storedLocation,
    errorMsg,
    loading,
    updateLocation,
    clearStoredLocation,
    usingStoredLocation,
  };
}

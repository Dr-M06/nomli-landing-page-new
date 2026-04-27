import { useMemo } from 'react';
import { getAgeGateFlags } from '../utils/ageGate';

export default function useAgeGate({
  profile,
  user,
}: {
  profile?: any;
  user?: any;
}) {
  return useMemo(() => {
    return getAgeGateFlags({
      profile,
      userMetadata: user?.user_metadata,
    });
  }, [profile, user?.user_metadata]);
}


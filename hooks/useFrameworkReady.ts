import { useEffect, useState } from 'react';

export function useFrameworkReady() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return { ready };
}
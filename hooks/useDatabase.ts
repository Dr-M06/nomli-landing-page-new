import { useDatabaseContext } from '../contexts/DatabaseContext';

/**
 * Hook to access database initialization state
 * 
 * This hook provides access to the database context, allowing components
 * to check if the database has been initialized and to trigger reinitialization
 * if needed.
 * 
 * @returns Database context state and methods
 */
export function useDatabase() {
  const context = useDatabaseContext();
  
  if (context === undefined) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  
  return context;
}
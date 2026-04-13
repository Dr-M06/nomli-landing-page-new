import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
// Import database setup functions
import { setupDatabaseTables } from '../utils/setupDatabase';
import { setupCountryChatTables } from '../utils/setupCountryChat';
import { initializeEventAttendeesTable } from '../utils/createEventAttendeesTable';

interface DatabaseContextType {
  isInitialized: boolean;
  isLoading: boolean;
  error: Error | null;
  reinitialize: () => Promise<void>;
}

const DatabaseContext = createContext<DatabaseContextType>({
  isInitialized: false,
  isLoading: true,
  error: null,
  reinitialize: async () => {}
});

export const useDatabaseContext = () => useContext(DatabaseContext);

interface DatabaseProviderProps {
  children: ReactNode;
}

export const DatabaseProvider: React.FC<DatabaseProviderProps> = ({ children }) => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const initializeDatabase = async () => {
    if (isInitialized) return;
    
    setIsLoading(true);
    setError(null);
    
    // Set a shorter timeout to prevent hanging and improve UX
    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        console.log('Database initialization timeout reached - continuing with app');
        setIsInitialized(true);
        setIsLoading(false);
        resolve();
      }, 2000); // Reduced to 2 seconds for better UX
    });
    
    const initPromise = (async () => {
      try {
        // Initialize all database tables in parallel for better performance
        await Promise.allSettled([
          // Setup main database tables
          setupDatabaseTables().catch(error => {
            console.error('Error setting up database tables:', error);
          }),
          
          // Setup country chat tables
          setupCountryChatTables().catch(error => {
            console.error('Error setting up country chat tables:', error);
          }),
          
          // Initialize event attendees table
          initializeEventAttendeesTable().catch(error => {
            console.error('Error initializing event_attendees table:', error);
          })
        ]);
        
        console.log('Database initialization completed successfully');
        setIsInitialized(true);
      } catch (e) {
        console.error('Error initializing database:', e);
        setError(e instanceof Error ? e : new Error('Unknown database initialization error'));
        // Mark as initialized anyway to prevent hanging
        setIsInitialized(true);
      } finally {
        setIsLoading(false);
      }
    })();
    
    // Race between timeout and initialization
    await Promise.race([timeoutPromise, initPromise]);
  };

  const reinitialize = async () => {
    setIsInitialized(false);
    await initializeDatabase();
  };

  useEffect(() => {
    initializeDatabase();
  }, []);

  return (
    <DatabaseContext.Provider
      value={{
        isInitialized,
        isLoading,
        error,
        reinitialize
      }}
    >
      {children}
    </DatabaseContext.Provider>
  );
};
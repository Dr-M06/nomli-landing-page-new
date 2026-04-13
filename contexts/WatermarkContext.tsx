import React, { createContext, useContext } from 'react';

interface WatermarkContextType {
  showWatermarks: boolean;
}

const WatermarkContext = createContext<WatermarkContextType | undefined>(undefined);

export const useWatermark = () => {
  const context = useContext(WatermarkContext);
  if (context === undefined) {
    throw new Error('useWatermark must be used within a WatermarkProvider');
  }
  return context;
};

interface WatermarkProviderProps {
  children: React.ReactNode;
}

export const WatermarkProvider: React.FC<WatermarkProviderProps> = ({ children }) => {
  // Watermarks are always shown - users cannot disable them
  const value = {
    showWatermarks: true,
  };

  return (
    <WatermarkContext.Provider value={value}>
      {children}
    </WatermarkContext.Provider>
  );
};

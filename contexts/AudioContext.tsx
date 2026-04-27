import React, { createContext, useContext, useRef, ReactNode } from 'react';

interface AudioContextType {
  currentlyPlaying: React.MutableRefObject<{
    playerId: string;
    stopFunction: () => Promise<void>;
  } | null>;
  registerPlayer: (playerId: string, stopFunction: () => Promise<void>) => void;
  unregisterPlayer: (playerId: string) => void;
  stopAllOthers: (playerId: string) => Promise<void>;
}

const AudioContext = createContext<AudioContextType | undefined>(undefined);

interface AudioProviderProps {
  children: ReactNode;
}

export const AudioProvider: React.FC<AudioProviderProps> = ({ children }) => {
  console.log('[AudioProvider] Mounting AudioProvider');
  const currentlyPlaying = useRef<{
    playerId: string;
    stopFunction: () => Promise<void>;
  } | null>(null);

  const registerPlayer = (playerId: string, stopFunction: () => Promise<void>) => {
    // Don't register if this player is already playing
    if (currentlyPlaying.current?.playerId === playerId) {
      return;
    }
    
    // Stop any currently playing audio before registering this one
    if (currentlyPlaying.current) {
      currentlyPlaying.current.stopFunction().catch(err => {
        console.log('[AudioContext] Error stopping previous player:', err);
      });
    }
    
    currentlyPlaying.current = { playerId, stopFunction };
  };

  const unregisterPlayer = (playerId: string) => {
    if (currentlyPlaying.current?.playerId === playerId) {
      currentlyPlaying.current = null;
    }
  };

  const stopAllOthers = async (playerId: string) => {
    if (currentlyPlaying.current && currentlyPlaying.current.playerId !== playerId) {
      try {
        await currentlyPlaying.current.stopFunction();
      } catch (err) {
        console.log('[AudioContext] Error stopping other player:', err);
      }
      currentlyPlaying.current = null;
    }
  };

  const value: AudioContextType = {
    currentlyPlaying,
    registerPlayer,
    unregisterPlayer,
    stopAllOthers,
  };

  return (
    <AudioContext.Provider value={value}>
      {children}
    </AudioContext.Provider>
  );
};

// Global fallback for audio coordination
const globalAudioState = {
  currentlyPlaying: null as {
    playerId: string;
    stopFunction: () => Promise<void>;
  } | null,
};

export const useAudio = (): AudioContextType => {
  const context = useContext(AudioContext);
  
  if (context === undefined) {
    // Use global fallback for audio coordination
    const fallbackRef = { current: globalAudioState.currentlyPlaying };
    
    return {
      currentlyPlaying: fallbackRef,
      registerPlayer: (playerId: string, stopFunction: () => Promise<void>) => {
        if (globalAudioState.currentlyPlaying && globalAudioState.currentlyPlaying.playerId !== playerId) {
          // Stop any currently playing before registering new one
          globalAudioState.currentlyPlaying.stopFunction().catch(() => {});
        }
        globalAudioState.currentlyPlaying = { playerId, stopFunction };
        fallbackRef.current = globalAudioState.currentlyPlaying;
      },
      unregisterPlayer: (playerId: string) => {
        if (globalAudioState.currentlyPlaying?.playerId === playerId) {
          globalAudioState.currentlyPlaying = null;
          fallbackRef.current = null;
        }
      },
      stopAllOthers: async (playerId: string) => {
        if (globalAudioState.currentlyPlaying && globalAudioState.currentlyPlaying.playerId !== playerId) {
          try {
            await globalAudioState.currentlyPlaying.stopFunction();
          } catch (err) {
            console.log('[useAudio] Error stopping other player:', err);
          }
          globalAudioState.currentlyPlaying = null;
          fallbackRef.current = null;
        }
      },
    };
  }
  
  return context;
}; 
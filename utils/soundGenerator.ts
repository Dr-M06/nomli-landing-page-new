import { Audio } from 'expo-av';
import { log, warn, error } from './productionLogger';


// Generate a pleasant chime sound using Web Audio API
export const generateChimeSound = async (frequency: number = 800, duration: number = 200) => {
  try {
    // Create a simple sine wave tone
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + duration / 1000);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + duration / 1000);
    
    return true;
  } catch (error) {
    log('Could not generate chime sound:', error);
    return false;
  }
};

// Play a pleasant gift sound
export const playGiftSound = async (rarity: string, price: number) => {
  try {
    // Use different frequencies based on rarity
    const frequencies = {
      legendary: [800, 1000],
      epic: [600, 800],
      rare: [400, 600],
      common: [300, 500]
    };
    
    const baseFreq = frequencies[rarity as keyof typeof frequencies] || frequencies.common;
    
    // Play first tone
    await generateChimeSound(baseFreq[0], 150);
    
    // Play second tone for premium gifts
    if (rarity === 'legendary' || price >= 500) {
      setTimeout(async () => {
        await generateChimeSound(baseFreq[1], 200);
      }, 100);
    }
    
    return true;
  } catch (error) {
    log('Could not play gift sound:', error);
    return false;
  }
};

import { Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';

class CallAlertService {
  private incomingInterval: ReturnType<typeof setInterval> | null = null;
  private dialingInterval: ReturnType<typeof setInterval> | null = null;

  startIncomingAlert(): void {
    this.stopIncomingAlert();
    // Ring-like vibration pattern while incoming modal is visible.
    Vibration.vibrate([0, 600, 300, 600], true);
    this.incomingInterval = setInterval(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    }, 2200);
  }

  stopIncomingAlert(): void {
    if (this.incomingInterval) {
      clearInterval(this.incomingInterval);
      this.incomingInterval = null;
    }
    Vibration.cancel();
  }

  startDialingAlert(): void {
    this.stopDialingAlert();
    // Short pulse while caller is waiting for connection.
    this.dialingInterval = setInterval(() => {
      Vibration.vibrate(80);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }, 1800);
  }

  stopDialingAlert(): void {
    if (this.dialingInterval) {
      clearInterval(this.dialingInterval);
      this.dialingInterval = null;
    }
  }

  stopAll(): void {
    this.stopIncomingAlert();
    this.stopDialingAlert();
  }
}

export const callAlertService = new CallAlertService();

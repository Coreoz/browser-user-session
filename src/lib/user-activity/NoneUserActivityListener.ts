import { UserActivityListener } from './UserActivityListener';

export class NoneUserActivityListener implements UserActivityListener {
  triggerNewActivity: undefined | (() => void);

  startUserActivityDetector(registerUserActivity: () => void): void {
    this.triggerNewActivity = registerUserActivity;
  }

  stopUserActivityDetector(): void {
    this.triggerNewActivity = undefined;
  }

  simulateActivity(): void {
    this.triggerNewActivity?.();
  }
}

import { UserActivityListener } from './UserActivityListener';

export class NoneUserActivityListener implements UserActivityListener {
  // eslint-disable-next-line class-methods-use-this
  startUserActivityDetector(): void {
  }

  // eslint-disable-next-line class-methods-use-this
  stopUserActivityDetector(): void {
  }
}

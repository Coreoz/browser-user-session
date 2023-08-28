import { Job, Scheduler } from 'simple-job-scheduler';
import { UserActivityListener } from './user-activity/UserActivityListener';

/**
 * Manages user idleness detection in the webpage.
 * The user activity monitoring can be customized,
 * but default it checks mouse events, keyboards events and touch events.
 */
export class IdlenessDetector {
  // value is defined only when the idleness detection is running, else its value is undefined
  private idlenessDetectionJob?: Job;

  private onIdlenessDetected?: () => void;

  private registerUserActivityFunction?: () => void;

  private onNewActivityDetected?: () => void;

  private lastActivityTimestampInMillis: number = 0;

  private inactiveDurationInMilliseconds: number = 0;

  private idlenessDetectionCheckThreshold: number = 0;

  constructor(
    private readonly scheduler: Scheduler,
    private readonly userActivityListener: UserActivityListener,
  ) {
  }

  /**
   * Start monitoring user activity and running actions in case of idleness
   * @param onIdlenessDetected Function that will be called
   * by the IdlenessDetector when some idleness is detected
   * @param onNewActivityDetected Function that will be called
   * by the a activity has been detected by the userActivityListener
   * @param inactiveDurationInMilliseconds Threshold time in millisecond
   * after which the idleness job is cancelled
   * @param idlenessDetectionCheckThreshold Define the time interval
   * between each idleness check
   */
  startService(
    onIdlenessDetected: () => void,
    onNewActivityDetected: () => void,
    inactiveDurationInMilliseconds: number,
    idlenessDetectionCheckThreshold: number,
  ): void {
    this.inactiveDurationInMilliseconds = inactiveDurationInMilliseconds;
    this.idlenessDetectionCheckThreshold = idlenessDetectionCheckThreshold;
    this.onIdlenessDetected = onIdlenessDetected;
    this.onNewActivityDetected = onNewActivityDetected;
    if (this.idlenessDetectionJob) {
      // do not start the service if it is already started
      return;
    }
    this.registerUserActivityFunction = () => this.registerUserActivity();
    this.lastActivityTimestampInMillis = Date.now();
    this.userActivityListener.startUserActivityDetector(this.registerUserActivityFunction);
    this.startIdlenessDetection();
  }

  /**
   * Stop monitoring user activity and running actions in case of idleness
   */
  stopService(): void {
    if (this.registerUserActivityFunction) {
      this.userActivityListener.stopUserActivityDetector(this.registerUserActivityFunction);
    }
    this.stopIdlenessDetection();
    this.registerUserActivityFunction = undefined;
  }

  /**
   * Get the number of milliseconds since the user is idle
   */
  idleTimeInMillis(): number {
    return Date.now() - this.lastActivityTimestampInMillis;
  }

  /**
   * Indicate that a user activity has been detected.
   * The inactivity counter is reset.
   * onNewActivityDetected is executed only if the idleness job is not running
   * and result can cancel the restart of the job
   */
  private registerUserActivity(): void {
    if (!this.idlenessDetectionJob) {
      this.onNewActivityDetected?.();
    }
    this.lastActivityTimestampInMillis = Date.now();
    if (this.idlenessDetectionJob === undefined) {
      this.startIdlenessDetection();
    }
  }

  private startIdlenessDetection(): void {
    this.idlenessDetectionJob = this.scheduler.schedule(
      'Idleness detector',
      () => this.verifyUserIdleness(),
      this.idlenessDetectionCheckThreshold,
    );
  }

  private stopIdlenessDetection(): void {
    this.idlenessDetectionJob?.cancel();
    this.idlenessDetectionJob = undefined;
  }

  /**
   * If the global idleness overcome the idleness threshold,
   * then the onIdlenessDetected function is called
   */
  private verifyUserIdleness(): void {
    if (this.idleTimeInMillis() > this.inactiveDurationInMilliseconds) {
      this.onIdlenessDetected?.();
      this.stopIdlenessDetection();
    }
  }
}

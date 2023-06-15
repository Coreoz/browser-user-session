import { Job, Scheduler } from 'simple-job-scheduler';
import { UserActivityListener } from './user-activity/UserActivityListener';

/**
 * Manages user idleness detection in the webpage.
 * The user activity monitoring can be customized,
 * but default it checks mouse events, keyboards events and touch events.
 */
export class IdlenessDetector {
  private detectorJob?: Job;

  private isIdlenessRunning: boolean;

  private onIdlenessDetected?: () => void;

  private registerUserActivityFunction?: () => void;

  private onNewActivityDetected?: () => boolean;

  private lastActivityTimestampInMillis: number = 0;

  constructor(private readonly scheduler: Scheduler, private readonly userActivityListener: UserActivityListener) {
    this.isIdlenessRunning = false;
  }

  /**
   * Start monitoring user activity and running actions in case of idleness
   * @param onIdlenessDetected Function that will be called by the IdlenessDetector when some idleness is detected
   * @param onNewActivityDetected Function that will be called by the a activity has been detected by the userActivityListener
   * @param inactiveDurationInMilliseconds Threshold time in millisecond after which the idleness job is cancelled
   * @param idlenessDetectionCheckThreshold Define the time interval between each idleness check
   */
  startService(
    onIdlenessDetected: () => void,
    onNewActivityDetected: () => boolean,
    inactiveDurationInMilliseconds: number,
    idlenessDetectionCheckThreshold: number,
  ) {
    this.onIdlenessDetected = onIdlenessDetected;
    this.onNewActivityDetected = onNewActivityDetected;
    if (this.detectorJob) {
      // do not start the service if it is already started
      return;
    }
    this.registerUserActivityFunction = () => this.registerUserActivity(
      inactiveDurationInMilliseconds, idlenessDetectionCheckThreshold,
    );
    this.lastActivityTimestampInMillis = Date.now();
    this.userActivityListener.startUserActivityDetector(this.registerUserActivityFunction);
    this.startIdlenessDetection(inactiveDurationInMilliseconds, idlenessDetectionCheckThreshold);
  }

  /**
   * Stop monitoring user activity and running actions in case of idleness
   */
  stopService() {
    if (this.registerUserActivityFunction) {
      this.userActivityListener.stopUserActivityDetector(this.registerUserActivityFunction);
    }
    this.stopIdlenessDetection();
    this.registerUserActivityFunction = undefined;
  }

  /**
   * Get the number of milliseconds since the user is idle
   */
  idleTimeInMillis() {
    return Date.now() - this.lastActivityTimestampInMillis;
  }

  /**
   * Indicate that a user activity has been detected.
   * The inactivity counter is reset.
   * onNewActivityDetected is executed only if the idleness job is not running and result can cancel the restart of the job
   */
  private registerUserActivity(
    inactiveDurationInMillis: number, idlenessDetectionCheckThreshold: number,
  ) {
    if (!this.isIdlenessRunning) {
      const idlenessDetectionMustNotRestart: boolean | undefined = this.onNewActivityDetected?.();
      if (idlenessDetectionMustNotRestart) {
        return;
      }
    }
    this.lastActivityTimestampInMillis = Date.now();
    if (this.detectorJob === undefined) {
      this.startIdlenessDetection(inactiveDurationInMillis, idlenessDetectionCheckThreshold);
    }
  }

  private startIdlenessDetection(
    inactiveDurationInMillis: number, idlenessDetectionCheckThreshold: number,
  ) {
    this.isIdlenessRunning = true;
    this.detectorJob = this.scheduler.schedule(
      'Idleness detector',
      () => this.verifyUserIdleness(inactiveDurationInMillis),
      idlenessDetectionCheckThreshold,
    );
  }

  private stopIdlenessDetection() {
    this.detectorJob?.cancel();
    this.detectorJob = undefined;
    this.isIdlenessRunning = false;
  }

  /**
   * If the global idleness overcome the idleness threshold,
   * then the onIdlenessDetected function is called
   */
  private verifyUserIdleness(inactiveDurationInMillis: number) {
    if (this.idleTimeInMillis() > inactiveDurationInMillis) {
      this.onIdlenessDetected?.();
      this.stopIdlenessDetection();
    }
  }
}

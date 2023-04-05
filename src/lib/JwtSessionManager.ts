import { decode } from 'js-base64';
import { Observable, observable, WritableObservable } from 'micro-observables';
import { HttpError, HttpPromise } from 'simple-http-rest-client';
import { Job, Scheduler } from 'simple-job-scheduler';
import { Logger } from 'simple-logging-system';
import IdlenessDetector from './IdlenessDetector';
import {
  PageActivity,
  PageActivityManager,
} from './page-activity/PageActivityManager';
import { IdlenessDetector } from './IdlenessDetector';

const logger = new Logger('JwtSessionManager');

const IDLENESS_CHECK_INTERVAL = 1000;

export type ExpirableJwtValue = {
  exp: number;
};

export type RefreshableJwtToken = {
  webSessionToken: string,
  refreshDurationInMillis: number,
  inactiveDurationInMillis: number,
};

export interface SessionRefresher {
  refresh(webSessionToken: string): HttpPromise<RefreshableJwtToken>;
}

export type JwtSessionManagerConfig = {
  thresholdInMillisToDetectExpiredSession: number,
  localStorageCurrentSession: string,
  httpErrorAlreadyExpiredSessionToken: string,
};

/**
 * Handle the whole lifetime journey of a JWT session in the browser.
 */
export class JwtSessionManager<U extends ExpirableJwtValue> {
  private currentSession: WritableObservable<RefreshableJwtToken | undefined>;

  private currentUser: WritableObservable<U | undefined>;

  private currentUserExpirationDateInSeconds?: number;

  private refreshSessionTokenScheduledJob?: Job;

  constructor(
    private readonly sessionRefresher: SessionRefresher,
    private readonly scheduler: Scheduler,
    private readonly idlenessDetector: IdlenessDetector,
    private readonly config: JwtSessionManagerConfig,
  ) {
    this.currentSession = observable(undefined);
    this.currentUser = observable(undefined);
  }

  // data access

  /**
   * Get the JWT session, generally to make API calls
   */
  getSessionToken(): Observable<string | undefined> {
    return this.currentSession.readOnly().select(
      (session: RefreshableJwtToken | undefined) => session?.webSessionToken,
    );
  }

  /**
   * Get the current user corresponding to the current JWT session
   */
  getCurrentUser(): Observable<U | undefined> {
    return this.currentUser.readOnly();
  }

  /**
   * Verify if there is a current user present
   */
  isAuthenticated(): Observable<boolean> {
    return this.currentUser.select((user: U | undefined) => user !== undefined);
  }

  // actions

  /**
   * Declare a new user session.
   * It should be called after a successful authentication call that returns a JWT sessionToken
   * @returns the current User if the session is still valid, or else `undefined`
   */
  registerNewSession(sessionToken: RefreshableJwtToken): U | undefined {
    const user = this.storeNewSession(sessionToken);
    if (user !== undefined) {
      this.currentUser.set(user);
      this.startSessionRefreshAndIdleDetection(
        sessionToken.refreshDurationInMillis, sessionToken.inactiveDurationInMillis,
      );
      return user;
    }
    return undefined;
  }

  /**
   * Discard the user session as well as the JWT token
   */
  disconnect(): void {
    logger.info('Manual disconnection');
    this.discardSession();
  }

  /**
   * Try restauring the user session from the browser local storage
   */
  tryInitializingSessionFromStorage(): void {
    const webSessionString = localStorage.getItem(this.config.localStorageCurrentSession);
    if (webSessionString) {
      const sessionToken: RefreshableJwtToken = JSON.parse(webSessionString);
      logger.info('Found existing session in local storage, will try to use it', sessionToken.webSessionToken);
      const currentUser = this.registerNewSession(sessionToken);
      if (currentUser === undefined) {
        logger.info('The local storage session was expired, trashing it...');
        this.discardSession();
      } else {
        // refresh ASAP the session, else the session might be disconnected before the first refresh
        this.refreshSession();
      }
    } else {
      logger.info('No existing session in local storage');
    }
  }

  /**
   * Synchronize changes added to the localStorage from other tabs in order to:
   * - Disconnect the user when the localStorage session is deleted from another tab
   * - Update the session token when it is updated from another tab
   * - Authenticate the user if he is connected from another tab
   */
  synchronizeSessionFromOtherBrowserTags(): void {
    window.removeEventListener('storage', this.handleStorageChangeFromOtherTab, false);
    window.addEventListener('storage', this.handleStorageChangeFromOtherTab, false);
  }

  // internals

  private handleStorageChangeFromOtherTab = (event: StorageEvent): void => {
    if (event.key === this.config.localStorageCurrentSession || event.key === null) {
      if (!event.newValue) {
        // the session has been discarded!
        logger.info('Discarding session since it has been discarded in another tab...');
        this.discardSession();
      } else if (event.oldValue) {
        // the session has been updated.
        logger.debug('Updating session since it has been updated in another tab...');
        const sessionToken: RefreshableJwtToken = JSON.parse(event.newValue);
        this.updateCurrentSession(sessionToken);
      } else {
        // the session has been created!
        logger.info('Creating user session since it has been created in another tab...');
        const sessionToken: RefreshableJwtToken = JSON.parse(event.newValue);
        this.registerNewSession(sessionToken);
      }
    }
  };

  private discardSession(): void {
    localStorage.removeItem(this.config.localStorageCurrentSession);
    this.currentSession.set(undefined);
    this.currentUser.set(undefined);
    this.currentUserExpirationDateInSeconds = undefined;
    this.refreshSessionTokenScheduledJob?.cancel();
    this.idlenessDetector.stopService();
  }

  private storeNewSession(sessionToken: RefreshableJwtToken): U | undefined {
    const user = this.updateCurrentSession(sessionToken);
    if (user) {
      // If the session is ok, it can be stored
      localStorage.setItem(this.config.localStorageCurrentSession, JSON.stringify(sessionToken));
    }
    return user;
  }

  private updateCurrentSession(sessionToken: RefreshableJwtToken): U | undefined {
    const user = this.parseJwtSession(sessionToken.webSessionToken);
    if (!this.isUserSessionValid(user?.exp)) {
      logger.info(
        'Tried to store an expired session, '
        + `current date=${new Date()} session expiration date=${new Date(user.exp * 1000)}, `
        + 'you may need to fix your computer clock', user,
      );
      return undefined;
    }

    this.currentSession.set(sessionToken);
    this.currentUserExpirationDateInSeconds = user.exp;
    return user;
  }

  private refreshSession(): void {
    const currentSession = this.currentSession.get();
    if (currentSession === undefined) {
      logger.error('Trying to refresh session whereas the current session is empty');
      return;
    }

    this
      .sessionRefresher
      .refresh(currentSession.webSessionToken)
      .then((updatedSessionToken: RefreshableJwtToken) => this.storeNewSession(updatedSessionToken))
      .catch((error: HttpError) => {
        if (error.errorCode === this.config.httpErrorAlreadyExpiredSessionToken) {
          logger.info('Session is expired, disconnecting...');
          this.discardSession();
        } else {
          logger.warn('Could not update session token', { error });
        }
      });
  }

  private startSessionRefreshAndIdleDetection(refreshDurationInMillis: number, inactiveDurationInMillis: number): void {
    this.startSessionRefresh(refreshDurationInMillis);
    this.idlenessDetector.startService(
      () => {
        logger.info('Idleness detected, disconnecting...');
        this.refreshSessionTokenScheduledJob?.cancel();
      },
      () => this.onNewUserActivityDetected(refreshDurationInMillis),
      inactiveDurationInMillis,
      IDLENESS_CHECK_INTERVAL,
    );
  }

  private startSessionRefresh(refreshDurationInMillis: number): void {
    this.refreshSessionTokenScheduledJob = this.scheduler.schedule(
      'Refresh session token',
      () => {
        this.refreshSession()
      },
      refreshDurationInMillis,
    );
  }

  private onNewUserActivityDetected(refreshDurationInMillis: number): boolean {
    if (!this.isUserSessionValid(this.currentUserExpirationDateInSeconds)) {
      logger.info('Expired session detected on browser page active, disconnecting...');
      this.discardSession();
      return true;
    }
    logger.info('Page became active, refresh token started...');
    this.startSessionRefresh(refreshDurationInMillis);
    return false; // idleness job must be restarted
  }

  private isUserSessionValid(expirationDateInSeconds?: number): boolean {
    return expirationDateInSeconds !== undefined
      && (
        expirationDateInSeconds * 1000
        + this.config.thresholdInMillisToDetectExpiredSession
        > Date.now()
      );
  }

  private parseJwtSession(webSessionToken: string): U {
    return JSON.parse(decode(webSessionToken.split('.')[1]));
  }
}

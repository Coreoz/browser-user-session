import { Scheduler } from 'simple-job-scheduler';
import {
  IdlenessDetector,
  IdlenessDetectorSchedulerRestartState,
} from '../lib/IdlenessDetector';
import {
  NoneUserActivityListener,
} from '../lib/user-activity/NoneUserActivityListener';

const waitTimeout = (durationInMillis: number) => new Promise((resolve) => {
  setTimeout(resolve, durationInMillis);
});

describe('Test idleness detector component', () => {
  let idlenessDetectedCount: number;
  let refreshRestartCount: number;

  const noneActivityListener = new NoneUserActivityListener();
  const idlenessDetector = new IdlenessDetector(
    new Scheduler(),
    noneActivityListener,
  );

  const scheduler = new Scheduler();

  beforeEach(() => {
    idlenessDetectedCount = 0;
    refreshRestartCount = 0;

    idlenessDetector.startService(
      () => {
        idlenessDetectedCount += 1;
      },
      () => {
        refreshRestartCount += 1;
        return IdlenessDetectorSchedulerRestartState.RESTART;
      },
      60,
      10,
    );
  });

  afterEach(() => {
    scheduler.cancelAll();
    idlenessDetector.stopService();
  });

  it(
    'if there is no activity, the onIdlenessDetected function must be called once',
    async () => {
      await waitTimeout(200);
      expect(idlenessDetectedCount).toEqual(1);
      expect(refreshRestartCount).toEqual(0);
    },
  );

  it(
    'verify that after the service is stopped,'
    + ' no idleness is monitored anymore',
    async () => {
      idlenessDetector.stopService();
      await waitTimeout(1000);
      expect(idlenessDetectedCount).toEqual(0);
      expect(refreshRestartCount).toEqual(0);
    },
  );

  it(
    'if there is some activity, verify that the idleTime is correctly reset '
    + 'and that the onIdlenessDetected function is not called',
    async () => {
      await waitTimeout(20);
      noneActivityListener.simulateActivity();
      await waitTimeout(20);
      noneActivityListener.simulateActivity();
      await waitTimeout(20);
      noneActivityListener.simulateActivity();
      await waitTimeout(20);
      noneActivityListener.simulateActivity();
      await waitTimeout(20);
      noneActivityListener.simulateActivity();
      expect(idlenessDetector.idleTimeInMillis()).toBeLessThanOrEqual(20);
      expect(idlenessDetectedCount).toEqual(0);
      expect(refreshRestartCount).toEqual(0);
    },
  );

  it(
    'after some idleness has been detected and onIdlenessDetected function has been called,' +
    ' make sure that once some activity is registered, new idleness can be detected',
    async () => {
      await waitTimeout(500);
      expect(idlenessDetectedCount).toEqual(1);
      noneActivityListener.simulateActivity();
      await waitTimeout(500);
      expect(idlenessDetectedCount).toEqual(2);
      expect(refreshRestartCount).toEqual(1);
    });

  it(
    'verify that if a service is started twice,'
    + ' then the second start will not actually start the service',
    async () => {
      idlenessDetector.startService(
        () => {
        },
        () => IdlenessDetectorSchedulerRestartState.STOP,
        60,
        10,
      );
      idlenessDetector.startService(
        () => {
          idlenessDetectedCount += 1;
        },
        () => IdlenessDetectorSchedulerRestartState.STOP,
        60,
        10,
      );
      await waitTimeout(200);
      // if the service was started multiple times, the idleness count would be greater than 1
      expect(idlenessDetectedCount).toEqual(1);
      expect(idlenessDetectedCount).toEqual(1);
    },
  );
});

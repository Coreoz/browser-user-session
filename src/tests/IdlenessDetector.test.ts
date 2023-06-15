import { Scheduler } from 'simple-job-scheduler';
import { IdlenessDetector } from '../index';
import { NoneUserActivityListener }
  from '../lib/user-activity/NoneUserActivityListener';

const waitTimeout = (time: number) => {
  setTimeout(() => {
    console.log(`Wait for ${time}`);
  }, time);
};

describe('Test idleness detector component', () => {
  let registerUserActivityFunction: () => void;
  let idlenessDetectedCount: number = 0;
  let refreshRestartCount: number = 0;

  const scheduler = new Scheduler();

  // setTimeout n'est pas précis du tout, du coup il faut prévoir pas mal de marge pour les tests
  // const idlenessDetector = new IdlenessDetector({
  //     startUserActivityDetector,
  //     stopUserActivityDetector: () => {
  //     },
  //     onIdlenessDetected: () => {
  //       idlenessDetectedCount++;
  //     },
  //     scheduler,
  //   },
  // );

  const idlenessDetector = new IdlenessDetector(
    new Scheduler(),
    new NoneUserActivityListener(),
  );

  beforeEach(() => {
    idlenessDetectedCount = 0;
    idlenessDetector.startService(
      () => {
        idlenessDetectedCount += 1;
      },
      () => {
        refreshRestartCount += 1;
        return true;
      },
      60,
      10,
    );
  });

  afterEach(() => {
    idlenessDetector.stopService();
    scheduler.cancelAll();
  });

  it(
    'if there is no activity, the onIdlenessDetected function must be called once',
    async () => {
      await waitTimeout(200);
      expect(idlenessDetectedCount).toEqual(1);
    },
  );

  it(
    'if there is some activity, '
    + 'verify that the idleTime is correctly '
    + 'reset and that the onIdlenessDetected function is not called',
    async () => {
      await waitTimeout(20);
      registerUserActivityFunction();
      await waitTimeout(20);
      registerUserActivityFunction();
      await waitTimeout(20);
      registerUserActivityFunction();
      await waitTimeout(20);
      registerUserActivityFunction();
      await waitTimeout(20);
      registerUserActivityFunction();

      expect(idlenessDetector.idleTimeInMillis()).toBeLessThan(20);
      expect(idlenessDetectedCount).toEqual(0);
    },
  );

  it(
    'after some idleness has been detected and onIdlenessDetected '
    + 'function has been called, make sure that once some activity is registered,'
    + ' new idleness can be detected',
    async () => {
      await waitTimeout(100);
      expect(idlenessDetectedCount).toEqual(1);
      registerUserActivityFunction();
      await waitTimeout(100);
      expect(idlenessDetectedCount).toEqual(2);
    },
  );

  it(
    'verify that after the service is stopped,'
    + ' no idleness is monitored anymore',
    async () => {
      idlenessDetector.stopService();
      await waitTimeout(100);
      expect(idlenessDetectedCount).toEqual(0);
    },
  );

  it(
    'verify that if a service is started twice,'
    + ' then the second start will not actually start the service',
    async () => {
      idlenessDetector.startService(() => {
      }, 60, 10);
      idlenessDetector.startService(() => {
      }, 60, 10);
      await waitTimeout(200);
      // if the service was started multiple times, the idleness count would be greater than 1
      expect(idlenessDetectedCount).toEqual(1);
    },
  );
});

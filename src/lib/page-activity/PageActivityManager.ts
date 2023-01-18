export enum PageActivity {
  ACTIVE,
  INACTIVE,
}

export abstract class PageActivityManager {
  abstract startService(onBrowserPageActivityChange: (pageActivityEvent: PageActivity) => void): void;

  abstract stopService(): void;
}

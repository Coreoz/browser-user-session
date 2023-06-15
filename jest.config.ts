import { Config } from 'jest';
import { defaults } from 'jest-config';

const config: Config = {
  bail: true,
  roots: ['<rootDir>/src/'],
  moduleFileExtensions: [...defaults.moduleFileExtensions, 'ts', 'tsx'],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  setupFilesAfterEnv: [
    './src/tests/setupTests.ts',
  ],
  globals: {
    'ts-jest': {
      'tsconfig': 'tsconfig.json',
    },
  },
  verbose: true,
};

export default config;

import type { Config } from 'jest';

const config: Config = {
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testEnvironment: 'node',
  transform: {
    '^.+\.ts$': ['ts-jest', { useESM: true }],
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\.{1,2}/.*)\.js$': '',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
};

export default config;

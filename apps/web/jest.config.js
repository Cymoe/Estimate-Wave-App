export default {
  preset: 'ts-jest',
  testEnvironment: 'jsdom', // Required for DOMPurify
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testMatch: ['**/__tests__/**/*.[jt]s?(x)', '**/?(*.)+(spec|test).[jt]s?(x)'],
  // Convex backend tests run under vitest (npm run test:convex).
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/convex/'],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
}; 
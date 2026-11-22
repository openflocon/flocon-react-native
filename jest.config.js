module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/packages'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  modulePathIgnorePatterns: ['<rootDir>/sample', '/build/'],
  moduleNameMapper: {
    '^@openflocon/react-native$': '<rootDir>/packages/react-native/src/index.ts',
    // React Native itself does not run in Node: the SDK only uses AppState from it
    '^react-native$': '<rootDir>/tool/jest/react-native.js',
  },
};

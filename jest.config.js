// Jest runs through the jest-expo preset so React Native code can be tested.
module.exports = {
  preset: 'jest-expo',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};

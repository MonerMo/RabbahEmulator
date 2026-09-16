module.exports = {
  preset: '@react-native/jest-preset',
  // The Turbo Module cannot load in Jest (no native code): every test sees the TypeScript FakeDevice instead.
  moduleNameMapper: {
    '^@rabbah/mdb-device$': '<rootDir>/__mocks__/@rabbah/mdb-device.ts',
  },
};

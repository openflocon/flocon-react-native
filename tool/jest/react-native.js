// The part of React Native the SDK uses, for the tests in Node.
const listeners = new Set();
module.exports = {
  AppState: {
    addEventListener(_type, listener) {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
    __emit(state) {
      listeners.forEach((l) => l(state));
    },
  },
  ErrorUtils: undefined,
};

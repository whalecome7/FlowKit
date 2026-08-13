/* eslint-disable no-undef */
// Jest 全局 setup：mock 原生模块
jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    requestPermission: jest
      .fn()
      .mockResolvedValue({ authorizationStatus: 1 }), // AUTHORIZED
    createChannel: jest.fn().mockResolvedValue('flowkit-trigger'),
    displayNotification: jest.fn().mockResolvedValue(undefined),
  },
  AndroidImportance: { HIGH: 4 },
  AuthorizationStatus: {
    NOT_DETERMINED: -1,
    DENIED: 0,
    AUTHORIZED: 1,
    PROVISIONAL: 2,
  },
}));

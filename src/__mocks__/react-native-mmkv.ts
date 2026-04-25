/* global jest */
export const MMKV = jest.fn().mockImplementation(() => ({
  set: jest.fn(),
  getString: jest.fn(),
  getNumber: jest.fn(),
  getBoolean: jest.fn(),
  delete: jest.fn(),
  getAllKeys: jest.fn().mockReturnValue([]),
  contains: jest.fn().mockReturnValue(false),
}));

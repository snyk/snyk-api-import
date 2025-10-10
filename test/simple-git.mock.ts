import { jest } from '@jest/globals';

export const mockClone = jest.fn();
export const mockFetch = jest.fn();
export const mockRaw = jest.fn();
export const mockCheckout = jest.fn();
export const mockPull = jest.fn();
export const mockAddRemote = jest.fn();
export const mockPush = jest.fn();
export const mockLog = jest.fn();

export function simpleGit() {
  return {
    clone: mockClone,
    fetch: mockFetch,
    raw: mockRaw,
    checkout: mockCheckout,
    pull: mockPull,
    addRemote: mockAddRemote,
    push: mockPush,
    log: mockLog,
  };
}

export default simpleGit;

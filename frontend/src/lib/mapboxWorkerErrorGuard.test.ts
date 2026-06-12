import { describe, expect, it } from 'vitest';
import {
  isBenignMapboxErrorCbError,
  isBenignMapboxVectorTileParseError,
  isRecoverableMapboxMapError,
} from './mapboxWorkerErrorGuard';

describe('mapboxWorkerErrorGuard', () => {
  it('treats errorCb TypeError as recoverable', () => {
    const err = new TypeError('this.errorCb is not a function');
    expect(isBenignMapboxErrorCbError(err)).toBe(true);
    expect(isRecoverableMapboxMapError(err)).toBe(true);
  });

  it('treats invalid MVT tile bytes as recoverable', () => {
    const err = new Error('Unimplemented type: 4');
    expect(isBenignMapboxVectorTileParseError(err)).toBe(true);
    expect(isRecoverableMapboxMapError(err)).toBe(true);
  });
});

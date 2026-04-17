import { describe, expect, it } from 'vitest';
import { OpenNfseError } from './base.js';

class TestError extends OpenNfseError {}

describe('OpenNfseError', () => {
  it('sets name to the subclass constructor name', () => {
    expect(new TestError('boom').name).toBe('TestError');
  });

  it('preserves the message', () => {
    expect(new TestError('boom').message).toBe('boom');
  });

  it('propagates cause', () => {
    const cause = new Error('root');
    expect(new TestError('boom', { cause }).cause).toBe(cause);
  });

  it('is an Error and an OpenNfseError', () => {
    const err = new TestError('boom');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(OpenNfseError);
  });
});

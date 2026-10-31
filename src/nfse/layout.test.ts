import { describe, expect, it } from 'vitest';
import { InvalidLayoutError } from '../errors/validation.js';
import { assertLayout, LAYOUTS } from './layout.js';

describe('assertLayout', () => {
  it('aceita os ids conhecidos', () => {
    expect(assertLayout('nt004')).toBe('nt004');
    expect(assertLayout('nt009')).toBe('nt009');
    expect(LAYOUTS).toEqual(['nt004', 'nt009']);
  });

  it.each(['NT009', 'nt010', undefined, 9])('rejeita %s', (v) => {
    expect(() => assertLayout(v)).toThrow(InvalidLayoutError);
  });

  it('expõe o valor recebido e lista os válidos na mensagem', () => {
    try {
      assertLayout('nt010');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidLayoutError);
      expect((e as InvalidLayoutError).received).toBe('nt010');
      expect((e as Error).message).toContain('nt004');
      expect((e as Error).message).toContain('nt009');
    }
  });
});

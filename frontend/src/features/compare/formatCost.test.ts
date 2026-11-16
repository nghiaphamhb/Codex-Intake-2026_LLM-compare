import { describe, expect, it } from 'vitest';
import { formatCostUsd } from './formatCost';

describe('formatCostUsd', () => {
  it.each([
    [0, '$0,0000'],
    [0.0016, '$0,0016'],
    [0.00001, '< $0,0001'],
    [Number.MIN_VALUE, '< $0,0001'],
    [0.00009999, '< $0,0001'],
    [0.0001, '$0,0001'],
    [1.23456, '$1,2346'],
    [1234.56789, '$1234,5679'],
  ])('formats %s as %s', (value, expected) => {
    expect(formatCostUsd(value)).toBe(expected);
  });

  it.each([undefined, null, -1, NaN, Infinity, -Infinity])(
    'omits unavailable or invalid cost %s',
    (value) => {
      expect(formatCostUsd(value)).toBeUndefined();
    },
  );
});

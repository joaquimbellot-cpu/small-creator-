import { describe, expect, it } from 'vitest';
import { describeRange, formatFull, formatRange, formatShort, makeScale, niceNumber, parseRange, parseShortNumber } from './numbers';

describe('parseShortNumber', () => {
  it('reads plain numbers, k and M', () => {
    expect(parseShortNumber('10k')).toBe(10000);
    expect(parseShortNumber('10K')).toBe(10000);
    expect(parseShortNumber('1.5M')).toBe(1500000);
    expect(parseShortNumber(' 12,500 ')).toBe(12500);
    expect(parseShortNumber('$3k')).toBe(3000);
    expect(parseShortNumber('.5k')).toBe(500);
    expect(parseShortNumber('0')).toBe(0);
  });
  it('rejects text, empty and negatives', () => {
    for (const bad of ['', '   ', 'abc', '10kk', '-5', '1.2.3k', '10 thousand', null, undefined]) expect(parseShortNumber(bad as string)).toBeNull();
  });
  it('passes numbers through', () => {
    expect(parseShortNumber(12.6)).toBe(13);
    expect(parseShortNumber(NaN)).toBeNull();
  });
});

describe('formatShort', () => {
  it('shortens', () => {
    expect(formatShort(950)).toBe('950');
    expect(formatShort(1000)).toBe('1k');
    expect(formatShort(1500)).toBe('1.5k');
    expect(formatShort(12500)).toBe('13k');
    expect(formatShort(100000)).toBe('100k');
    expect(formatShort(1000000)).toBe('1M');
    expect(formatShort(2500000)).toBe('2.5M');
  });
  it('round-trips the values the slider produces', () => {
    for (const v of [1000, 1500, 12000, 56000, 250000, 1000000]) expect(parseShortNumber(formatShort(v))).toBe(v);
  });
});

describe('formatFull', () => {
  it('adds thousands separators', () => expect(formatFull(1234567)).toBe('1,234,567'));
});

describe('niceNumber', () => {
  it('keeps two significant digits', () => {
    expect(niceNumber(11873)).toBe(12000);
    expect(niceNumber(1071)).toBe(1100);
    expect(niceNumber(0)).toBe(0);
  });
});

describe('makeScale (log, 1k to 1M)', () => {
  const sc = makeScale(1000, 1000000, 'log');
  it('has the right ends and middle', () => {
    expect(sc.toValue(0)).toBe(1000);
    expect(sc.toValue(100)).toBe(1000000);
    expect(sc.toValue(33)).toBe(9800);
    expect(sc.toValue(50)).toBe(32000);
    expect(sc.toPosition(1000)).toBe(0);
    expect(sc.toPosition(10000)).toBe(33);
    expect(sc.toPosition(1000000)).toBe(100);
  });
  it('clamps outside the range', () => {
    expect(sc.toPosition(10)).toBe(0);
    expect(sc.toPosition(5e7)).toBe(100);
  });
  it('is increasing', () => {
    let last = 0;
    for (let t = 0; t <= 100; t++) { const v = sc.toValue(t); expect(v).toBeGreaterThanOrEqual(last); last = v; }
  });
  it('round-trips within one step', () => {
    for (let t = 0; t <= 100; t++) expect(Math.abs(sc.toPosition(sc.toValue(t)) - t)).toBeLessThanOrEqual(1);
  });
});

describe('makeScale (linear)', () => {
  const sc = makeScale(0, 1000, 'linear');
  it('maps evenly', () => {
    expect(sc.toValue(50)).toBe(500);
    expect(sc.toPosition(250)).toBe(25);
  });
});

describe('ranges', () => {
  it('parses', () => {
    expect(parseRange('10000-50000')).toEqual([10000, 50000]);
    expect(parseRange('10000-')).toEqual([10000, null]);
    expect(parseRange('-50000')).toEqual([null, 50000]);
    expect(parseRange('50000-10000')).toEqual([10000, 50000]);
  });
  it('rejects bad text', () => {
    for (const bad of ['', '-', 'abc', '1-2-3', null, undefined, '10k-20k']) expect(parseRange(bad)).toBeNull();
  });
  it('formats', () => {
    expect(formatRange(1000, 5000)).toBe('1000-5000');
    expect(formatRange(1000, null)).toBe('1000-');
    expect(formatRange(null, 5000)).toBe('-5000');
    expect(formatRange(null, null)).toBeNull();
  });
  it('describes', () => {
    expect(describeRange(10000, 50000)).toBe('10k to 50k');
    expect(describeRange(100000, null)).toBe('100k and above');
    expect(describeRange(null, 5000)).toBe('up to 5k');
    expect(describeRange(null, null)).toBe('Any');
  });
});

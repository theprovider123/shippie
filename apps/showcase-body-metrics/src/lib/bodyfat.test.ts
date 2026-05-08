import { describe, expect, test } from 'bun:test';
import { navyBodyFat, leanMassKg, bodyFatBand, METHODS } from './bodyfat.ts';

describe('navyBodyFat', () => {
  test('male — typical inputs return a sane percentage', () => {
    const pct = navyBodyFat({
      sex: 'male',
      heightCm: 180,
      neckCm: 38,
      waistCm: 85,
    });
    expect(pct).not.toBeNull();
    expect(pct as number).toBeGreaterThan(8);
    expect(pct as number).toBeLessThan(25);
  });

  test('female — typical inputs return a sane percentage', () => {
    // Navy formula tends to overshoot for women — a lean adult
    // (waist 60, hip 85, neck 30, height 170) lands ~40%; a
    // higher-body-fat individual lands well over 40%.
    const pct = navyBodyFat({
      sex: 'female',
      heightCm: 170,
      neckCm: 30,
      waistCm: 60,
      hipCm: 85,
    });
    expect(pct).not.toBeNull();
    expect(pct as number).toBeGreaterThan(15);
    expect(pct as number).toBeLessThan(60);
  });

  test('returns null on missing hip for female', () => {
    expect(
      navyBodyFat({ sex: 'female', heightCm: 165, neckCm: 32, waistCm: 72 }),
    ).toBeNull();
  });

  test('returns null on negative inputs', () => {
    expect(
      navyBodyFat({ sex: 'male', heightCm: -1, neckCm: 38, waistCm: 85 }),
    ).toBeNull();
  });

  test('returns null when waist <= neck for male', () => {
    expect(
      navyBodyFat({ sex: 'male', heightCm: 180, neckCm: 90, waistCm: 80 }),
    ).toBeNull();
  });
});

describe('leanMassKg', () => {
  test('80 kg @ 20% body fat → 64 kg lean', () => {
    expect(leanMassKg(80, 20)).toBe(64);
  });

  test('rejects nonsensical body-fat values', () => {
    expect(leanMassKg(80, -1)).toBeNull();
    expect(leanMassKg(80, 101)).toBeNull();
    expect(leanMassKg(0, 20)).toBeNull();
  });
});

describe('bodyFatBand', () => {
  test('scale band is wider than tape band', () => {
    const scale = bodyFatBand(20, 'scale');
    const navy = bodyFatBand(20, 'navy');
    expect(scale.high - scale.low).toBeGreaterThan(navy.high - navy.low);
  });

  test('low never goes below zero', () => {
    expect(bodyFatBand(2, 'scale').low).toBe(0);
  });

  test('every method has a non-empty caveat', () => {
    for (const info of Object.values(METHODS)) {
      expect(info.caveat.length).toBeGreaterThan(10);
    }
  });
});

import { describe, it, expect } from 'vitest';
import {
  normalizePortalPhone,
  isValidPortalPhone,
  isValidNationalId,
  waMeLink,
} from '../patient-portal/helpers.js';

describe('portal phone helpers', () => {
  it('normalizes country code + local number to E.164', () => {
    expect(normalizePortalPhone('+966', '512345678')).toBe('+966512345678');
    expect(normalizePortalPhone('966', '512345678')).toBe('+966512345678');
  });

  it('strips a repeated country code prefix from the local number', () => {
    expect(normalizePortalPhone('+966', '966512345678')).toBe('+966512345678');
  });

  it('normalizes Egyptian numbers from local, +, and 00 formats to one E.164', () => {
    expect(normalizePortalPhone('+20', '01003438250')).toBe('+201003438250');
    expect(normalizePortalPhone('+20', '+201003438250')).toBe('+201003438250');
    expect(normalizePortalPhone('+20', '00201003438250')).toBe('+201003438250');
    expect(normalizePortalPhone('20', '01003438250')).toBe('+201003438250');
  });

  it('normalizes Saudi numbers from local and + formats to one E.164', () => {
    expect(normalizePortalPhone('+966', '05550000088')).toBe('+9665550000088');
    expect(normalizePortalPhone('+966', '+966555000088')).toBe('+966555000088');
    expect(normalizePortalPhone('+966', '5550000088')).toBe('+9665550000088');
  });

  it('validates phone + country code combinations', () => {
    expect(isValidPortalPhone('+966', '512345678')).toBe(true);
    expect(isValidPortalPhone('+20', '1001234567')).toBe(true);
    expect(isValidPortalPhone('+20', '01003438250')).toBe(true);
    expect(isValidPortalPhone('+20', '00201003438250')).toBe(true);
    expect(isValidPortalPhone('+20', '+201003438250')).toBe(true);
    expect(isValidPortalPhone('', '512345678')).toBe(false);
    expect(isValidPortalPhone('+966', '123')).toBe(false);
    expect(isValidPortalPhone('+20', '123')).toBe(false);
  });

  it('validates 14-digit national IDs', () => {
    expect(isValidNationalId('26804071600173')).toBe(true);
    expect(isValidNationalId('1234567890123')).toBe(false);
    expect(isValidNationalId('123456789012345')).toBe(false);
    expect(isValidNationalId('abcdefghijklmn')).toBe(false);
  });

  it('builds wa.me click-to-chat links', () => {
    const link = waMeLink('+966512345678', 'Your Vision Healthcare OTP is 123456');
    expect(link).toBe('https://wa.me/966512345678?text=Your%20Vision%20Healthcare%20OTP%20is%20123456');
  });
});

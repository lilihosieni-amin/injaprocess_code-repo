import { describe, it, expect } from 'vitest'
import { toLatinDigits, normalisePhone } from './digits'

describe('toLatinDigits', () => {
  it('folds Persian digits', () => {
    expect(toLatinDigits('۰۹۱۲۳۴۵۶۷۸۹')).toBe('09123456789')
  })
  it('folds Arabic-Indic digits', () => {
    expect(toLatinDigits('٠٩١٢٣٤٥٦٧٨٩')).toBe('09123456789')
  })
  it('leaves latin digits and other text alone', () => {
    expect(toLatinDigits('cashier-013')).toBe('cashier-013')
  })
})

describe('normalisePhone', () => {
  it('strips separators', () => {
    expect(normalisePhone('0912 345 6789')).toBe('09123456789')
    expect(normalisePhone('0912-345-6789')).toBe('09123456789')
    expect(normalisePhone('(0912) 3456789')).toBe('09123456789')
  })
  it('rewrites a country code to a leading zero', () => {
    expect(normalisePhone('+989123456789')).toBe('09123456789')
    expect(normalisePhone('00989123456789')).toBe('09123456789')
    expect(normalisePhone('989123456789')).toBe('09123456789')
  })
  it('handles Persian digits with a country code together', () => {
    expect(normalisePhone('+۹۸۹۱۲۳۴۵۶۷۸۹')).toBe('09123456789')
  })
  it('leaves an already-canonical number unchanged', () => {
    expect(normalisePhone('09123456789')).toBe('09123456789')
  })
  it('handles a country code prepended to a number that kept its leading zero', () => {
    expect(normalisePhone('+98 0912 345 6789')).toBe('09123456789')
    expect(normalisePhone('0098 0912 345 6789')).toBe('09123456789')
    expect(normalisePhone('98 0912 345 6789')).toBe('09123456789')
  })
  it('handles that same shape in Persian digits', () => {
    expect(normalisePhone('+۹۸۰۹۱۲۳۴۵۶۷۸۹')).toBe('09123456789')
  })
  it('does not mistake a subscriber number beginning 98 for a country code', () => {
    // 09891234567 is a legitimate number; the 98 is part of the subscriber digits.
    expect(normalisePhone('09891234567')).toBe('09891234567')
  })
  it('returns an empty string for empty input rather than a bare zero', () => {
    expect(normalisePhone('')).toBe('')
    expect(normalisePhone('  ')).toBe('')
  })
})

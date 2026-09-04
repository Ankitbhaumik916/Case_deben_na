import { describe, expect, it } from 'vitest';
import {
  looksLikeMarkup,
  plainToRichText,
  richTextIsEmpty,
  richTextToPlain,
} from '../src/lib/rich-text';

/**
 * The pure half of the rich text helpers. sanitizeToFragment needs a real DOM
 * parser and is exercised in the browser and by verify-edits.mjs; what is
 * covered here is everything that decides whether a field counts as answered
 * and what reaches the search index.
 */

describe('richTextToPlain', () => {
  it('drops tags and keeps the words', () => {
    expect(richTextToPlain('<p>Point of <strong>origin</strong> identified</p>')).toBe(
      'Point of origin identified',
    );
  });

  it('puts a space where a block ended, so words do not run together', () => {
    expect(richTextToPlain('<li>first</li><li>second</li>')).toBe('first second');
    expect(richTextToPlain('<p>one</p><p>two</p>')).toBe('one two');
  });

  it('turns entities back into the characters they stand for', () => {
    expect(richTextToPlain('<p>Smith &amp; Sons</p>')).toBe('Smith & Sons');
    expect(richTextToPlain('<p>5 &lt; 7</p>')).toBe('5 < 7');
    expect(richTextToPlain('<p>a&nbsp;b</p>')).toBe('a b');
  });

  it('is empty for markup with no words in it', () => {
    // This is what a browser leaves behind when a field is cleared. Judged as
    // raw text it reads as filled, and the section would claim an answer.
    expect(richTextToPlain('<p><br></p>')).toBe('');
    expect(richTextToPlain('<p></p>')).toBe('');
    expect(richTextIsEmpty('<p><br></p>')).toBe(true);
    expect(richTextIsEmpty('<ul><li></li></ul>')).toBe(true);
    expect(richTextIsEmpty('<p>something</p>')).toBe(false);
  });

  it('handles null and undefined without throwing', () => {
    expect(richTextToPlain(null)).toBe('');
    expect(richTextToPlain(undefined)).toBe('');
    expect(richTextIsEmpty(null)).toBe(true);
  });
});

describe('looksLikeMarkup', () => {
  it('recognises the subset the editor produces', () => {
    expect(looksLikeMarkup('<p>hello</p>')).toBe(true);
    expect(looksLikeMarkup('a<br>b')).toBe(true);
    expect(looksLikeMarkup('<ul><li>x</li></ul>')).toBe(true);
  });

  it('leaves plain text alone, including text that merely contains angle brackets', () => {
    expect(looksLikeMarkup('Scene notes from 14:20')).toBe(false);
    expect(looksLikeMarkup('temperature < 300C')).toBe(false);
    expect(looksLikeMarkup('a <> b')).toBe(false);
  });
});

describe('plainToRichText', () => {
  it('makes a paragraph per blank-line-separated block', () => {
    expect(plainToRichText('one\n\ntwo')).toBe('<p>one</p><p>two</p>');
  });

  it('keeps single line breaks inside a paragraph', () => {
    expect(plainToRichText('one\ntwo')).toBe('<p>one<br>two</p>');
  });

  it('escapes anything that would otherwise become markup', () => {
    // A value typed before rich text existed must not turn into live markup
    // the moment it is promoted.
    expect(plainToRichText('<script>alert(1)</script>')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
    expect(plainToRichText('Smith & Sons')).toBe('<p>Smith &amp; Sons</p>');
  });

  it('round-trips back to the text it started from', () => {
    const original = 'Seat of fire in the north-east corner.\n\nNo accelerant detected.';
    expect(richTextToPlain(plainToRichText(original))).toBe(
      'Seat of fire in the north-east corner. No accelerant detected.',
    );
  });
});

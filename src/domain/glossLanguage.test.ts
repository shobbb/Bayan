import { describe, it, expect } from 'vitest';
import { glossFieldFor, glossFor, glossLanguageFor, hasGloss } from './glossLanguage';

const english = { gloss: 'book', glossAr: null };
const both = { gloss: 'book', glossAr: 'شَيْءٌ يُقْرَأُ' };

describe('glossLanguageFor', () => {
  it('reads the setting', () => {
    expect(glossLanguageFor(true)).toBe('arabic');
    expect(glossLanguageFor(false)).toBe('english');
  });
});

describe('glossFor', () => {
  it('returns the definition in the asked-for language', () => {
    expect(glossFor(both, 'english')).toBe('book');
    expect(glossFor(both, 'arabic')).toBe('شَيْءٌ يُقْرَأُ');
  });

  // A learner who asked for Arabic and is shown English has been told the
  // setting does not work. An empty gloss is honest, and it is what routes the
  // word to the translation pass.
  it('never falls back to the other language', () => {
    expect(glossFor(english, 'arabic')).toBe('');
    expect(glossFor({ gloss: '', glossAr: 'مَعْنًى' }, 'english')).toBe('');
  });

  it('treats an absent field and an empty one alike', () => {
    expect(glossFor({ gloss: 'book' }, 'arabic')).toBe('');
    expect(glossFor({ gloss: 'book', glossAr: '   ' }, 'arabic')).toBe('');
  });
});

describe('hasGloss', () => {
  it('is what decides whether a word can be a card in this language', () => {
    expect(hasGloss(both, 'arabic')).toBe(true);
    expect(hasGloss(english, 'arabic')).toBe(false);
    expect(hasGloss(english, 'english')).toBe(true);
  });
});

describe('glossFieldFor', () => {
  it('names the field a definition is written to', () => {
    expect(glossFieldFor('english')).toBe('gloss');
    expect(glossFieldFor('arabic')).toBe('glossAr');
  });
});

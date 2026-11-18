import { escapeLikePattern } from '../../src/modules/contacts/contacts.repository';

/**
 * T208: the search term reaches PostgreSQL through a parameterised `LIKE` pattern, so the only
 * transformation that must stay correct is metacharacter escaping (spec edge case: special
 * characters must not act as wildcards and must not enable SQL injection).
 */
describe('contact search term escaping (T208)', () => {
  it('leaves plain and accented text untouched', () => {
    expect(escapeLikePattern('nguyen')).toBe('nguyen');
    expect(escapeLikePattern('Nguyễn Văn An')).toBe('Nguyễn Văn An');
    expect(escapeLikePattern('an.nguyen@acme.test')).toBe('an.nguyen@acme.test');
  });

  it('escapes percent, underscore and backslash so they match literally', () => {
    expect(escapeLikePattern('100%')).toBe('100\\%');
    expect(escapeLikePattern('under_score')).toBe('under\\_score');
    expect(escapeLikePattern('back\\slash')).toBe('back\\\\slash');
  });

  it('escapes every metacharacter in a mixed term', () => {
    expect(escapeLikePattern('%_\\')).toBe('\\%\\_\\\\');
    expect(escapeLikePattern('%%')).toBe('\\%\\%');
  });

  it('keeps an empty term empty and a quote inert', () => {
    expect(escapeLikePattern('')).toBe('');
    expect(escapeLikePattern("' OR 1=1 --")).toBe("' OR 1=1 --");
  });
});

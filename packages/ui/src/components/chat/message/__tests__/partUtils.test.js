import { describe, expect, it } from 'bun:test';

import { extractTextContent, isEmptyTextPart } from '../partUtils';

describe('partUtils text extraction', () => {
  it('uses the longest visible text candidate from text, content, or value', () => {
    expect(extractTextContent({ type: 'text', text: '', content: 'visible content', value: 'value' })).toBe('visible content');
    expect(extractTextContent({ type: 'text', text: 'short', content: 'longer visible content', value: '' })).toBe('longer visible content');
    expect(extractTextContent({ type: 'text', value: 'visible value' })).toBe('visible value');
  });

  it('does not treat a text part as empty when fallback visible text exists', () => {
    expect(isEmptyTextPart({ type: 'text', text: '', content: 'visible content' })).toBe(false);
  });

  it('treats whitespace-only visible text as empty', () => {
    expect(isEmptyTextPart({ type: 'text', text: '   ', content: '\n\t' })).toBe(true);
  });
});

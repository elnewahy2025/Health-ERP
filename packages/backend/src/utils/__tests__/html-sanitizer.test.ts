import { describe, it, expect } from 'vitest';
import { sanitizeTemplateHtml } from '../html-sanitizer.js';

describe('sanitizeTemplateHtml', () => {
  it('strips script tags and event handlers', () => {
    const out = sanitizeTemplateHtml('<p onclick="alert(1)">Hello <script>evil()</script></p>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('onclick');
    expect(out).toContain('Hello');
  });

  it('blocks javascript: URLs', () => {
    const out = sanitizeTemplateHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain('javascript:');
  });

  it('keeps legitimate print formatting', () => {
    const out = sanitizeTemplateHtml('<table><tr><th>Name</th></tr></table><b>Bold</b>');
    expect(out).toContain('<table>');
    expect(out).toContain('<b>Bold</b>');
  });

  it('preserves variable placeholders', () => {
    const out = sanitizeTemplateHtml('<p>Patient: {{first_name}}</p>');
    expect(out).toContain('{{first_name}}');
  });
});

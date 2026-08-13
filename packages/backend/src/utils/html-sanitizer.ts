import sanitizeHtml from 'sanitize-html';

// Shared allowlist for print-template HTML. Keeps formatting that documents
// legitimately need (tables, inline styles, images) while stripping scripts,
// event handlers, <iframe>/<object>/<embed>, and javascript: URLs.
const TEMPLATE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'div', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'b', 'strong', 'i', 'em', 'u', 's', 'small', 'sup', 'sub', 'mark',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote', 'pre', 'code',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
    'img', 'a', 'hr', 'section', 'header', 'footer', 'article',
  ],
  allowedAttributes: {
    'a': ['href', 'target', 'rel'],
    'img': ['src', 'alt', 'width', 'height'],
    '*': ['class', 'style', 'id'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  allowProtocolRelative: false,
};

/**
 * Sanitizes print-template HTML so stored templates and rendered documents
 * cannot carry executable content (stored XSS). Applied both when templates
 * are saved and after {{variable}} substitution at render time.
 */
export function sanitizeTemplateHtml(html: string): string {
  return sanitizeHtml(html, TEMPLATE_OPTIONS);
}

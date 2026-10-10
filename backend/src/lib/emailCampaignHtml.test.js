import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  contentFromMessage, normalizeContent, personalize, personalizeText, renderEmailHtml, safeUrl,
} from './emailCampaignHtml.js';

test('a plain message is laid out as headline, paragraphs, list and button', () => {
  const c = contentFromMessage(
    'Diwali Sale is live\n\nHi {{first_name}}, everything is 30% off this week.\n\n- Free shipping\n- Easy returns\n\nShop now: https://shop.example.com/sale',
  );
  assert.equal(c.headline, 'Diwali Sale is live');
  assert.deepEqual(c.bullets, ['Free shipping', 'Easy returns']);
  assert.equal(c.ctaUrl, 'https://shop.example.com/sale');
  assert.equal(c.ctaText, 'Learn more');
  assert.ok(c.paragraphs[0].includes('30% off'));
});

test('a one-line message has no headline taken from it', () => {
  const c = contentFromMessage('Our store opens at 10 tomorrow.');
  assert.equal(c.headline, '');
  assert.deepEqual(c.paragraphs, ['Our store opens at 10 tomorrow.']);
});

test('only http(s) links survive as the button', () => {
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('data:text/html,hi'), null);
  assert.equal(safeUrl('example.com/x'), 'https://example.com/x');
  assert.equal(normalizeContent({ ctaUrl: 'javascript:alert(1)' }).ctaUrl, '');
});

test('content is escaped, so markup in a message or AI reply is printed, not rendered', () => {
  const html = renderEmailHtml({
    content: { headline: '<script>x</script>', paragraphs: ['<img src=x onerror=alert(1)> and **bold**'] },
    brandName: 'Acme',
  });
  assert.ok(!html.includes('<script>x'));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('<strong>bold</strong>'));
});

test('an invalid accent colour falls back to the default', () => {
  const html = renderEmailHtml({ content: { paragraphs: ['hi'] }, accentColor: 'red;}', brandName: 'Acme' });
  assert.ok(html.includes('#0d9488'));
  assert.ok(!html.includes('red;}'));
});

test('placeholders are filled per recipient and escaped', () => {
  assert.equal(personalize('Hi {{first_name}} ({{ email }})', { name: 'Priya Sharma', email: 'p@x.com' }), 'Hi Priya (p@x.com)');
  assert.equal(personalize('Hi {{name}}', { name: '<b>Bob</b>' }), 'Hi &lt;b&gt;Bob&lt;/b&gt;');
  assert.equal(personalize('Hi {{name}}', {}), 'Hi there');
  assert.equal(personalizeText('Offer for {{first_name}}', { name: 'Ravi K' }), 'Offer for Ravi');
});

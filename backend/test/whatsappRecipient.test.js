import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildWhatsAppJid,
  normaliseWhatsAppRecipient
} from '../src/services/whatsappService.js';

test('normaliseWhatsAppRecipient normaliza formatos argentinos móviles comunes', () => {
  const cases = [
    ['11 1234-5678', '549', '5491112345678'],
    ['011 1234-5678', '549', '5491112345678'],
    ['15 1234-5678', '54911', '5491112345678'],
    ['11 15 1234-5678', '549', '5491112345678'],
    ['+54 11 1234-5678', '549', '5491112345678'],
    ['54 11 1234-5678', '549', '5491112345678'],
    ['+54 9 11 1234-5678', '549', '5491112345678'],
    ['54 9 11 1234-5678', '549', '5491112345678'],
    ['5491112345678', '549', '5491112345678']
  ];

  for (const [value, areaCode, expected] of cases) {
    assert.equal(normaliseWhatsAppRecipient(value, areaCode), expected, value);
  }
});

test('normaliseWhatsAppRecipient usa el área argentina configurada para números locales', () => {
  assert.equal(normaliseWhatsAppRecipient('15 123-4567', '549351'), '5493511234567');
  assert.equal(normaliseWhatsAppRecipient('123-4567', '549351'), '5493511234567');
  assert.equal(normaliseWhatsAppRecipient('0351 15 123-4567', '549'), '5493511234567');
});

test('normaliseWhatsAppRecipient conserva el armado genérico de números extranjeros', () => {
  assert.equal(normaliseWhatsAppRecipient('+1 (415) 555-0100', '1'), '14155550100');
  assert.equal(normaliseWhatsAppRecipient('(415) 555-0100', '1'), '14155550100');
  assert.equal(buildWhatsAppJid('+1 (415) 555-0100', '1'), '14155550100@s.whatsapp.net');
});

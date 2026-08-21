/**
 * FINPA PIN email delivery — Google Apps Script Web App
 *
 * Deploy settings:
 * - Execute as: Me
 * - Who has access: Anyone
 *
 * Script property (Project Settings → Script properties):
 * - FINPA_PIN_EMAIL_WEBHOOK_SECRET = same value as Belmo env FINPA_PIN_EMAIL_WEBHOOK_SECRET
 *
 * Belmo env:
 * - FINPA_PIN_EMAIL_WEBHOOK_URL = this Web App /exec URL
 * - FINPA_PIN_EMAIL_WEBHOOK_SECRET = shared secret (never commit)
 *
 * Do not merge into the Paystack router Apps Script.
 */

function doPost(e) {
  try {
    var configuredSecret = String(PropertiesService.getScriptProperties().getProperty('FINPA_PIN_EMAIL_WEBHOOK_SECRET') || '');
    var headerSecret = getHeader_(e, 'x-finpa-email-secret');
    if (!configuredSecret || !headerSecret || !safeEqual_(configuredSecret, headerSecret)) {
      return json_(401, { ok: false, code: 'UNAUTHORIZED' });
    }

    var raw = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
    var data = JSON.parse(raw);

    if (String(data.product || '') !== 'finpa') return json_(400, { ok: false, code: 'INVALID_PRODUCT' });

    var to = String(data.to || '').trim().toLowerCase();
    var pin = String(data.pin || '').trim().toUpperCase();
    var reference = String(data.reference || '').trim();

    if (!/^\S+@\S+\.\S+$/.test(to)) return json_(400, { ok: false, code: 'INVALID_EMAIL' });
    if (!/^FINPA-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(pin)) return json_(400, { ok: false, code: 'INVALID_PIN' });

    var buyerName = String(data.buyer_name || '').trim();
    var planId = String(data.plan_id || '').replace(/_/g, ' ');
    var period = String(data.period || '').trim();
    var durationDays = String(data.duration_days || '').trim();
    var currency = String(data.currency || '').trim();
    var amountPaid = Number(data.amount_paid || 0) / 100;
    var amountText = currency ? (currency + ' ' + amountPaid.toLocaleString()) : '';

    var subject = 'Your FINPA activation PIN';
    var plain = [
      'Hello' + (buyerName ? ' ' + buyerName : '') + ',',
      '',
      'Thank you for your FINPA payment. Your activation PIN is:',
      '',
      pin,
      '',
      'Plan: ' + planId,
      'Period: ' + period,
      'Duration: ' + durationDays + ' days',
      'Amount: ' + amountText,
      'Reference: ' + reference,
      '',
      'Open FINPA, choose Activate with PIN, then enter the PIN exactly as shown above.',
      '',
      'If you did not make this payment or need help, reply to this email.',
      '',
      'Fidean Technologies'
    ].join('\n');

    var html = '<div style="font-family:Inter,Arial,sans-serif;background:#f6f8ff;padding:28px">'
      + '<div style="max-width:640px;margin:auto;background:#fff;border-radius:24px;padding:28px;border:1px solid #e6e9f5">'
      + '<div style="display:inline-block;background:#3C2DC4;color:#fff;padding:8px 12px;border-radius:999px;font-weight:800;font-size:13px">FINPA Payment Confirmed</div>'
      + '<h1 style="color:#101828;margin:18px 0 8px;font-size:30px;line-height:1.1">Your FINPA activation PIN</h1>'
      + '<p style="color:#667085;font-size:16px;line-height:1.6">Thank you for your payment. Use the PIN below to activate FINPA.</p>'
      + '<div style="font-size:30px;letter-spacing:2px;font-weight:900;color:#3C2DC4;background:#eef2ff;border:1px dashed #3C2DC4;border-radius:18px;padding:18px;text-align:center;margin:22px 0">' + escapeHtml_(pin) + '</div>'
      + '<table style="width:100%;border-collapse:collapse;color:#101828">'
      + row_('Plan', planId) + row_('Period', period) + row_('Duration', durationDays + ' days') + row_('Amount', amountText) + row_('Reference', reference)
      + '</table>'
      + '<p style="color:#667085;font-size:14px;line-height:1.6;margin-top:22px">Open FINPA, choose <strong>Activate with PIN</strong>, then enter the PIN exactly as shown. If you need help, reply to this email.</p>'
      + '<p style="color:#667085;font-size:13px;margin-top:22px">Fidean Technologies</p>'
      + '</div></div>';

    MailApp.sendEmail({
      to: to,
      subject: subject,
      body: plain,
      htmlBody: html,
      name: 'FINPA by Fidean'
    });

    return json_(200, { ok: true, sent: true });
  } catch (err) {
    console.error('FINPA email webhook failed: ' + (err && err.message ? err.message : err));
    return json_(500, { ok: false, code: 'EMAIL_FAILED' });
  }
}

function getHeader_(e, key) {
  var headers = (e && e.headers) || {};
  var lower = String(key).toLowerCase();
  for (var k in headers) {
    if (String(k).toLowerCase() === lower) return String(headers[k] || '');
  }
  return '';
}

function safeEqual_(a, b) {
  a = String(a || '');
  b = String(b || '');
  if (a.length !== b.length) return false;
  var out = 0;
  for (var i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function escapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function row_(label, value) {
  return '<tr><td style="padding:10px 0;border-bottom:1px solid #f0f2f8;color:#667085;font-weight:700">' + escapeHtml_(label) + '</td>'
    + '<td style="padding:10px 0;border-bottom:1px solid #f0f2f8;text-align:right;font-weight:800">' + escapeHtml_(value) + '</td></tr>';
}

function json_(status, body) {
  // Apps Script ContentService cannot reliably set HTTP status; body.ok is authoritative.
  return ContentService
    .createTextOutput(JSON.stringify(body))
    .setMimeType(ContentService.MimeType.JSON);
}

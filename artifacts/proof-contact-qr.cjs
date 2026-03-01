const fs = require('fs');
const { chromium } = require('playwright');

(async () => {
  const out = {
    url: 'http://127.0.0.1:8888/board.html?b=free',
    baselineConsoleErrors: [],
    interactionConsoleErrors: [],
    pageErrors: [],
    modalCopyToast: null,
    footerCopyToast: null,
    modalUrlText: null,
    footerCopyButtonCount: null,
    clipboardReadback: null
  };

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();

  const baseline = [];
  const interaction = [];
  let phase = 'baseline';

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    if (phase === 'baseline') baseline.push(msg.text());
    else interaction.push(msg.text());
  });
  page.on('pageerror', (err) => {
    out.pageErrors.push(String(err && err.message || err));
  });

  await page.goto(out.url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);

  const authOverlay = page.locator('#authModalOverlay, #authModal');
  if (await authOverlay.count()) {
    const visible = await authOverlay.first().isVisible().catch(() => false);
    if (visible) {
      const close = page.locator('#authModalClose, #authCancelBtn').first();
      if (await close.count()) {
        await close.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(150);
      }
    }
  }

  out.baselineConsoleErrors = baseline.slice();
  phase = 'interaction';

  out.footerCopyButtonCount = await page.locator('#btnCopyKakaoLink').count();

  await page.locator('#btnContactOpen').click();
  await page.locator('#contactModal').waitFor({ state: 'visible' });
  await page.waitForTimeout(180);
  out.modalUrlText = (await page.locator('#kakaoLinkPreview').textContent() || '').trim();

  await page.locator('#btnCopyKakaoLink2').click();
  await page.waitForTimeout(220);
  out.modalCopyToast = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('div'));
    const hit = nodes.find((el) => {
      const t = (el.textContent || '').trim();
      return t === '복사됨' || t === '복사 실패';
    });
    return hit ? (hit.textContent || '').trim() : null;
  });
  await page.screenshot({ path: 'artifacts/proof-modal-copy.png', fullPage: true });

  await page.locator('#btnCloseContact').click();
  await page.waitForTimeout(120);

  await page.locator('footer img').first().click();
  await page.waitForTimeout(220);
  out.footerCopyToast = await page.evaluate(() => {
    const nodes = Array.from(document.querySelectorAll('div'));
    const hit = nodes.find((el) => {
      const t = (el.textContent || '').trim();
      return t === '복사됨' || t === '복사 실패';
    });
    return hit ? (hit.textContent || '').trim() : null;
  });
  await page.screenshot({ path: 'artifacts/proof-footer-qr-copy.png', fullPage: true });

  out.interactionConsoleErrors = interaction.slice();

  out.clipboardReadback = await page.evaluate(async () => {
    try {
      if (!navigator.clipboard || !window.isSecureContext) return null;
      return await navigator.clipboard.readText();
    } catch (_e) {
      return null;
    }
  });

  fs.writeFileSync('artifacts/proof-contact-qr.json', JSON.stringify(out, null, 2), 'utf8');

  await context.close();
  await browser.close();
})();

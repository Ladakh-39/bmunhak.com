const { chromium } = require('playwright');
(async () => {
  const paths = [
    '/write.html',
    '/records.html',
    '/profile.html',
    '/my.html',
    '/accumulated.html',
    '/post.html?id=1',
    '/board.html?b=free'
  ];
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  for (const p of paths) {
    const page = await browser.newPage();
    const errors = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', (err) => errors.push('PAGE:' + (err && err.message || err)));
    await page.goto('http://127.0.0.1:8888' + p, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1600);
    console.log(p + ' => ' + errors.length);
    if (errors[0]) console.log('  first: ' + errors[0]);
    await page.close();
  }
  await browser.close();
})();

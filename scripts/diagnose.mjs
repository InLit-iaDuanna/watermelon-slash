// 一次性诊断脚本:打开页面 → 自动模拟点击 CTA → 抓 30 秒内所有日志/错误/网络失败
import { webkit } from 'playwright';

const URL_BASE = 'https://localhost:5173';

const main = async () => {
  const browser = await webkit.launch({ headless: true });
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
    permissions: ['camera', 'microphone'],
  });
  const page = await ctx.newPage();

  page.on('console', (msg) => console.log(`[console.${msg.type()}]`, msg.text()));
  page.on('pageerror', (err) => console.log('[pageerror]', err.message, err.stack));
  page.on('requestfailed', (req) =>
    console.log('[requestfailed]', req.url(), '→', req.failure()?.errorText),
  );
  page.on('response', (res) => {
    if (res.status() >= 400) console.log('[http]', res.status(), res.url());
  });

  console.log('---navigating---');
  await page.goto(URL_BASE + '/', { waitUntil: 'load', timeout: 20_000 });
  console.log('---page loaded, snapshot HUD---');
  await page.waitForTimeout(500);

  // 找 landing 上的"开始切瓜"或类似的 CTA 按钮
  const buttons = await page.$$('button');
  console.log(`---found ${buttons.length} buttons---`);
  for (const b of buttons) {
    const t = await b.textContent();
    console.log(`  button: "${t?.trim()}"`);
  }
  if (buttons.length > 0) {
    console.log('---clicking first button (CTA)---');
    await buttons[0].click();
  }

  // 等 35 秒看模型加载流程
  for (let s = 0; s < 35; s += 1) {
    await page.waitForTimeout(1000);
    const loading = await page.$('[data-loading-text]');
    const error = await page.$('[data-error-msg]');
    const loadingText = loading ? await loading.textContent() : null;
    const errorText = error ? await error.textContent() : null;
    const errVisible = error ? await error.isVisible() : false;
    console.log(
      `[t+${s + 1}s] loading="${loadingText?.trim() ?? ''}" error=${errVisible ? `"${errorText?.trim()}"` : 'hidden'}`,
    );
    if (errVisible && errorText) {
      console.log('---ERROR SHOWN, breaking---');
      break;
    }
  }

  await browser.close();
};

main().catch((e) => {
  console.error('main failed:', e);
  process.exit(1);
});

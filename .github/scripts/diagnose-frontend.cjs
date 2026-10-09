const { chromium } = require('playwright');
const { spawn } = require('node:child_process');

async function run() {
  const preview = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', '4173'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  preview.stdout.on('data', (chunk) => process.stdout.write('[preview] ' + chunk));
  preview.stderr.on('data', (chunk) => process.stderr.write('[preview] ' + chunk));

  let browser;
  let failed = false;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox'] });
    const urls = [
      'http://127.0.0.1:4173/',
      'https://del-985.github.io/Pioneer-Employees/',
      'https://employee.pioneeroutdoorservices.com/',
    ];
    for (const url of urls) {
      const page = await browser.newPage();
      const errors = [];
      const responses = [];
      page.on('pageerror', (error) => errors.push('UNHANDLED_JS: ' + error.message + '\n' + (error.stack || '')));
      page.on('console', (event) => { if (event.type() === 'error') errors.push('CONSOLE: ' + event.text()); });
      page.on('requestfailed', (req) => errors.push('REQUEST_FAILED: ' + req.url() + ' ' + (req.failure()?.errorText || '')));
      page.on('response', (res) => { if (res.status() >= 400) responses.push(res.status() + ' ' + res.url()); });
      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(5000);
        const details = await page.evaluate(() => ({
          title: document.title,
          path: location.href,
          rootHtml: document.getElementById('root')?.innerHTML?.slice(0, 1400),
          rootText: document.getElementById('root')?.innerText?.slice(0, 450),
          scripts: [...document.querySelectorAll('script[src]')].map((e) => e.src),
          stylesheets: [...document.querySelectorAll('link[rel=stylesheet]')].map((e) => e.href),
        }));
        console.log(JSON.stringify({ url, httpStatus: response?.status(), ...details, errors, badResponses: responses }, null, 2));
        if (!details.rootText?.trim()) failed = true;
      } catch (error) {
        console.error('BROWSER_ERROR for ' + url + ': ' + error.stack);
        failed = true;
      } finally { await page.close(); }
    }
  } finally {
    if (browser) await browser.close();
    preview.kill('SIGTERM');
  }
  // npm may leave the Vite child process alive after SIGTERM. Explicitly exit
  // after both browser inspections so CI does not hang on the preview pipe.
  process.exit(failed ? 1 : 0);
}
run().catch(e => { console.error(e.stack); process.exit(1); });

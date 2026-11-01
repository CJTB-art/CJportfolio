// One-off visual audit. Run with `node scripts/shots.mjs` after `npm run dev`.
// Playwright is intentionally not a project dependency; `?demo=1` fixtures exist only in Vite dev builds.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.PASA_SHOT_BASE_URL ?? 'http://127.0.0.1:8000';
const chromePath = process.env.PASA_CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
const outRoot = process.env.PASA_SHOTS_DIR ?? path.resolve('artifacts', 'screenshots', `redesign-round2-${stamp}`);
const viewports = [
  [320, 568], [360, 640], [390, 844], [430, 932], [568, 320],
  [667, 375], [844, 390], [768, 1024], [1024, 768], [1280, 720],
  [1280, 500], [1440, 900], [1920, 1080]
].map(([width, height]) => ({ width, height }));

const routes = [
  { id: 'welcome', path: '/welcome', kind: 'entry', vertical: 'welcome' },
  { id: 'login', path: '/login?demo=1&view=login', kind: 'entry' },
  { id: 'signup', path: '/login?demo=1&view=signup', kind: 'entry' },
  { id: 'forgot', path: '/login?demo=1&view=forgot', kind: 'entry' },
  { id: 'sent', path: '/login?demo=1&view=sent', kind: 'entry' },
  { id: 'reset-password', path: '/reset-password?demo=1', kind: 'entry' },
  ...[1, 2, 3, 4].map((step) => ({ id: `onboarding-step-${step}`, path: `/onboarding?demo=1&step=${step}&baseline=none`, kind: 'entry' })),
  { id: 'home', path: '/', kind: 'app' },
  { id: 'home-no-baseline', path: '/?baseline=none', kind: 'app' },
  { id: 'home-zero-streak', path: '/?streak=0', kind: 'app' },
  { id: 'review-general', path: '/review/general', kind: 'app' },
  { id: 'review-professional', path: '/review/professional', kind: 'app' },
  { id: 'review-major', path: '/review/major', kind: 'app' },
  { id: 'notes', path: '/notes', kind: 'app' },
  { id: 'flashcards', path: '/flashcards', kind: 'app' },
  { id: 'flashcards-session', path: '/flashcards/session', kind: 'app' },
  { id: 'flashcards-results', path: '/flashcards/results', kind: 'app' },
  { id: 'practice-drills', path: '/practice?mode=drill', kind: 'app' },
  { id: 'practice-mock', path: '/practice?mode=mock', kind: 'app' },
  { id: 'practice-sprint', path: '/practice?mode=sprint', kind: 'app' },
  { id: 'drills-hub', path: '/drills', kind: 'app' },
  { id: 'drills-session', path: '/drills/session', kind: 'app' },
  { id: 'drills-results', path: '/drills/results', kind: 'app' },
  { id: 'mock-setup', path: '/practice?mode=mock', kind: 'app' },
  { id: 'mock-hub', path: '/mock', kind: 'app' },
  { id: 'mock-exam', path: '/mock/exam', kind: 'app' },
  { id: 'mock-results', path: '/mock/results', kind: 'app' },
  { id: 'sprint-setup', path: '/sprint', kind: 'app' },
  { id: 'sprint-round', path: '/sprint/round', kind: 'app' },
  { id: 'sprint-results', path: '/sprint/results', kind: 'app' },
  { id: 'progress', path: '/progress', kind: 'app' },
  { id: 'errors', path: '/errors', kind: 'app' },
  { id: 'weak', path: '/weak', kind: 'app' },
  { id: 'baseline-results', path: '/baseline/results', kind: 'app' },
  { id: 'plan', path: '/plan', kind: 'app' },
  { id: 'countdown-redirect', path: '/countdown', kind: 'app' },
  { id: 'community', path: '/community', kind: 'app' },
  { id: 'profile', path: '/profile', kind: 'app' },
  { id: 'settings', path: '/settings', kind: 'app' },
  ...['empty', 'one', 'two', 'full'].map((scenario) => ({ id: `leaderboard-${scenario}`, path: `/leaderboard?leaderboardDemo=${scenario}`, kind: 'app' })),
  ...[
    ['admin-dashboard', '/admin/dashboard'],
    ['admin-questions', '/admin/questions'],
    ['admin-question-editor', '/admin/questions/pasa-audit-question'],
    ['admin-duplicate-questions', '/admin/questions/duplicates'],
    ['admin-review', '/admin/review'],
    ['admin-lessons', '/admin/lessons'],
    ['admin-flagged', '/admin/flagged'],
    ['admin-feedback', '/admin/feedback'],
    ['admin-community', '/admin/community'],
    ['admin-buddy', '/admin/buddy'],
    ['admin-users', '/admin/users'],
    ['admin-settings', '/admin/settings'],
    ['admin-audit', '/admin/audit'],
    ['admin-leaderboard', '/admin/leaderboard']
  ].map(([id, path]) => ({ id, path, kind: 'admin' })),
  { id: 'feedback', path: '/feedback', kind: 'app' },
  { id: 'terms', path: '/terms.html', kind: 'legal', vertical: 'legal' },
  { id: 'privacy', path: '/privacy.html', kind: 'legal', vertical: 'legal' },
  { id: 'data-deletion', path: '/data-deletion.html', kind: 'legal', vertical: 'legal' },
  { id: 'not-found', path: '/round-two-not-found', kind: 'app' }
];

const themes = ['light', 'dark'];
const onlyRoutes = process.env.PASA_SHOT_ROUTES?.split(',').filter(Boolean);
const onlyViewports = process.env.PASA_SHOT_VIEWPORTS?.split(',').filter(Boolean);
const selectedRoutes = onlyRoutes ? routes.filter((route) => onlyRoutes.includes(route.id)) : routes;
const selectedViewports = onlyViewports ? viewports.filter((viewport) => onlyViewports.includes(`${viewport.width}x${viewport.height}`)) : viewports;
const failures = [];
const browserErrors = [];
const skippedRoutes = [];
let captured = 0;
const fontReports = new Map();

async function waitForFonts(page) {
  return page.evaluate(async () => {
    const faces = [
      ['800 20px "Fraunces"', 'Pasa Welcome'],
      ['650 16px "Bricolage Grotesque"', 'Pasa Welcome']
    ];
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const loads = Promise.all(faces.map(([font, sample]) => document.fonts.load(font, sample))).catch(() => []);
      await Promise.race([loads, new Promise((resolve) => setTimeout(resolve, 1200))]);
      const [fraunces, bricolage] = faces.map(([font, sample]) => document.fonts.check(font, sample));
      if (fraunces && bricolage) return { fraunces, bricolage };
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return {
      fraunces: document.fonts.check(faces[0][0], faces[0][1]),
      bricolage: document.fonts.check(faces[1][0], faces[1][1])
    };
  });
}

await fs.mkdir(outRoot, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: chromePath, args: ['--disable-dev-shm-usage'] });

try {
  for (const route of selectedRoutes) {
    for (const theme of themes) {
      const context = await browser.newContext({ viewport: viewports[0], deviceScaleFactor: 1, colorScheme: theme });
      await context.addInitScript(() => { try { localStorage.setItem('pasa:resources-ready', '1'); } catch { /* isolated capture context */ } });
      await context.route('https://*.supabase.co/**', async (route) => {
        const request = route.request();
        let body = [];
        if (request.url().includes('/rpc/random_questions') && request.method() === 'POST') {
          let args = {};
          try { args = request.postDataJSON(); } catch { /* return an empty set for malformed demo requests */ }
          body = Array.from({ length: Math.max(0, Math.min(200, Number(args.p_n) || 0)) }, (_, i) => ({
            id: `pasa-audit-${args.p_subject ?? 'subject'}-${args.p_topic ?? 'topic'}-${i + 1}`,
            code: `AUDIT-${i + 1}`,
            subject: args.p_subject ?? 'Professional Education',
            area: args.p_area ?? 'Assessment of Learning',
            topic: args.p_topic ?? 'Assessment of Learning',
            skill: 'Assessment for learning',
            q: 'Which assessment helps a teacher adjust instruction during a lesson?',
            options: ['Diagnostic assessment', 'Formative assessment', 'Summative assessment', 'Placement assessment'],
            answer: 1,
            why: 'Formative assessment helps teachers adjust instruction while learning is happening.',
            status: 'live'
          }));
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      });
      const page = await context.newPage();
      page.on('pageerror', (error) => browserErrors.push({ route: route.id, theme, error: error.message }));
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        // This route intentionally probes the not-found screen; its document 404 is expected.
        if (route.id === 'not-found' && message.text().includes('404')) return;
        browserErrors.push({ route: route.id, theme, error: message.text() });
      });
      const target = new URL(route.path, baseUrl);
      if (route.kind === 'app' || route.kind === 'entry') {
        target.searchParams.set('demo', '1');
        target.searchParams.set('theme', theme);
      } else if (route.kind === 'admin' && (!process.env.PASA_SHOT_ADMIN_EMAIL || !process.env.PASA_SHOT_ADMIN_PASSWORD)) {
        target.searchParams.set('demo', '1');
        target.searchParams.set(route.id === 'admin-leaderboard' ? 'leaderboardAdminDemo' : 'adminDemo', '1');
      }
      const url = target.toString();

      try {
        if (route.kind === 'admin' && process.env.PASA_SHOT_ADMIN_EMAIL && process.env.PASA_SHOT_ADMIN_PASSWORD) {
          const loginUrl = new URL('/login', baseUrl);
          await page.goto(loginUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.locator('#lg-email').fill(process.env.PASA_SHOT_ADMIN_EMAIL);
          await page.locator('#lg-pw').fill(process.env.PASA_SHOT_ADMIN_PASSWORD);
          await page.locator('form button[type="submit"]').click();
          await page.waitForTimeout(1200);
        }
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        if (route.kind === 'app') await page.waitForSelector('.app-shell', { timeout: 15000 });
        if (route.kind === 'admin') await page.waitForSelector('.adm', { timeout: 15000 });
        if (route.kind === 'entry') await page.waitForSelector('.paper-stage', { timeout: 15000 });
        if (route.kind === 'app' || route.id.startsWith('onboarding-step-')) {
          await page.waitForFunction(() => document.documentElement.dataset.designDemoReady === 'true', { timeout: 15000 });
        }
        await waitForFonts(page);
        await page.waitForTimeout(250);

        for (const viewport of selectedViewports) {
          await page.setViewportSize(viewport);
          await page.evaluate(async () => {
            [...document.images].forEach((img) => { img.loading = 'eager'; });
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          });
          await waitForFonts(page);
          const metrics = await page.evaluate(() => {
            const root = document.documentElement;
            const main = document.querySelector('main.app-main');
            return {
              viewport: `${innerWidth}x${innerHeight}`,
              documentHeight: root.scrollHeight,
              mainHeight: main?.scrollHeight ?? null,
              mainClientHeight: main?.clientHeight ?? null,
              documentWidth: root.scrollWidth,
              innerWidth,
              offscreenControls: [...document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [role="tab"], [role="radio"]')]
                .filter((el) => {
                  const style = getComputedStyle(el), r = el.getBoundingClientRect();
                  if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0 || !r.width || !r.height) return false;
                  if (el.closest('details:not([open]), [hidden], [inert], [aria-hidden="true"]')) return false;
                  if (el.closest('.adm-side:not(.open)')) return false;
                  const outsideX = r.left < -2 || r.right > innerWidth + 2;
                  const outsideY = r.top < -2 || r.bottom > innerHeight + 2;
                  if (!outsideX && !outsideY) return false;
                  for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
                    const overflow = getComputedStyle(parent);
                    if (outsideY && parent.scrollHeight > parent.clientHeight + 2 && /auto|scroll/.test(overflow.overflowY)) return false;
                    if (outsideX && parent.scrollWidth > parent.clientWidth + 2 && /auto|scroll/.test(overflow.overflowX)) return false;
                  }
                  return true;
                })
                .slice(0, 12)
                .map((el) => ({ label: (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 70), rect: (() => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]; })() })),
              fraunces: document.fonts.check('800 20px "Fraunces"', 'Pasa Welcome'),
              bricolage: document.fonts.check('650 16px "Bricolage Grotesque"', 'Pasa Welcome'),
              headingFont: getComputedStyle(document.querySelector('h1, .lg-title') ?? document.body).fontFamily
            };
          });
          fontReports.set(`${route.id}:${theme}:${metrics.viewport}`, metrics);

          const phoneWidth = viewport.width < 1024;
          const shortFormScroll = ['login', 'signup', 'reset-password'].includes(route.id) && viewport.height <= 512;
          const allowDocumentVertical = route.vertical === 'legal' || (route.vertical === 'welcome' && !phoneWidth) || shortFormScroll;
          if (!allowDocumentVertical && metrics.documentHeight > viewport.height + 2) {
            failures.push({ route: route.id, theme, viewport: metrics.viewport, invariant: 'document scrollHeight <= innerHeight', actual: metrics.documentHeight });
          }
          if (route.kind === 'app' && metrics.mainHeight !== null && metrics.mainHeight > metrics.mainClientHeight + 2) {
            failures.push({ route: route.id, theme, viewport: metrics.viewport, invariant: 'main scrollHeight <= main clientHeight', actual: `${metrics.mainHeight}/${metrics.mainClientHeight}` });
          }
          if (metrics.documentWidth > viewport.width + 2) {
            failures.push({ route: route.id, theme, viewport: metrics.viewport, invariant: 'scrollWidth <= innerWidth', actual: metrics.documentWidth });
          }
          if (metrics.offscreenControls.length && !shortFormScroll && route.kind !== 'legal') {
            failures.push({ route: route.id, theme, viewport: metrics.viewport, invariant: 'interactive controls stay within the viewport', actual: JSON.stringify(metrics.offscreenControls) });
          }

          const folder = path.join(outRoot, route.id, theme);
          await fs.mkdir(folder, { recursive: true });
          await page.screenshot({ path: path.join(folder, `${viewport.width}x${viewport.height}.jpg`), type: 'jpeg', quality: 76, animations: 'disabled' });
          captured++;

          if (['welcome', 'login', 'home'].includes(route.id)) {
            await page.evaluate(() => document.documentElement.classList.add('lite'));
            await page.waitForTimeout(30);
            await page.screenshot({ path: path.join(folder, `${viewport.width}x${viewport.height}-lite.jpg`), type: 'jpeg', quality: 76, animations: 'disabled' });
            await page.evaluate(() => document.documentElement.classList.remove('lite'));
          }
        }
      } catch (error) {
        failures.push({ route: route.id, theme, viewport: 'all', invariant: 'route loads and captures', actual: error.message });
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}

const failureCsv = ['route,theme,viewport,invariant,actual', ...failures.map((f) => [f.route, f.theme, f.viewport, f.invariant, String(f.actual).replaceAll(',', ';')].join(','))].join('\n');
const fontLines = [...fontReports.entries()].map(([key, report]) => `${key}\t${report.viewport}\tFraunces=${report.fraunces}\tBricolage=${report.bricolage}\t${report.headingFont}`);
await fs.writeFile(path.join(outRoot, 'scroll-failures.csv'), `${failureCsv}\n`, 'utf8');
await fs.writeFile(path.join(outRoot, 'font-checks.tsv'), `${fontLines.join('\n')}\n`, 'utf8');
await fs.writeFile(path.join(outRoot, 'browser-errors.json'), `${JSON.stringify(browserErrors, null, 2)}\n`, 'utf8');
console.log(`screenshots=${captured} (+ lite variants for Home, Welcome, Login)`);
console.log(`routes=${selectedRoutes.length} themes=${themes.length} viewports=${selectedViewports.length}`);
if (skippedRoutes.length) console.log(`skipped_routes=${skippedRoutes.join(',')} (set PASA_SHOT_ADMIN_EMAIL and PASA_SHOT_ADMIN_PASSWORD to capture admin)`);
console.log(`scroll_failures=${failures.length} browser_errors=${browserErrors.length}`);
console.log(`artifacts=${outRoot}`);
if (failures.length) {
  console.log('Scroll failure table:');
  console.table(failures);
  process.exitCode = 1;
}
if (browserErrors.length) {
  console.log('Browser error table:');
  console.table(browserErrors);
  process.exitCode = 1;
}

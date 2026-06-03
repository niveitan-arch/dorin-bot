import { launchYad2Context } from './yad2-session';

async function main() {
  // Reuse the persistent profile so we inspect the REAL (post-captcha) feed.
  const headless = process.env.YAD2_HEADLESS !== 'false';
  const ctx = await launchYad2Context(headless);
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  const jsonResponses: { url: string; status: number; len: number; keys: string }[] = [];
  page.on('response', async (res) => {
    const url = res.url();
    const ct = res.headers()['content-type'] || '';
    if (!ct.includes('json')) return;
    try {
      const body = await res.text();
      let keys = '';
      try {
        const j = JSON.parse(body);
        keys = Array.isArray(j) ? `ARRAY(${j.length})` : Object.keys(j).slice(0, 12).join(',');
      } catch {
        keys = '<non-json>';
      }
      jsonResponses.push({ url, status: res.status(), len: body.length, keys });
    } catch {
      /* ignore */
    }
  });

  const target = 'https://www.yad2.co.il/realestate/rent';
  console.log('[debug] goto', target);
  const resp = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });
  console.log('[debug] response status:', resp?.status());
  await page.waitForTimeout(6000);

  const finalUrl = page.url();
  const title = await page.title();
  const bodyText = (await page.evaluate(() => document.body?.innerText || '')).slice(0, 400);
  const hasNextData = await page.evaluate(() => !!document.getElementById('__NEXT_DATA__'));

  console.log('[debug] finalUrl:', finalUrl);
  console.log('[debug] title:', title);
  console.log('[debug] __NEXT_DATA__ present:', hasNextData);
  console.log('[debug] body[0..400]:', JSON.stringify(bodyText));

  const blockMarkers = ['px-captcha', 'Access to this page has been denied', 'PerimeterX', 'shieldsquare', 'אימות', 'verify you are human', 'unusual'];
  const blocked = blockMarkers.some((m) => bodyText.toLowerCase().includes(m.toLowerCase()) || title.toLowerCase().includes(m.toLowerCase()));
  console.log('[debug] LIKELY BLOCKED:', blocked);

  console.log('[debug] --- JSON responses seen (' + jsonResponses.length + ') ---');
  for (const r of jsonResponses) {
    console.log(`  [${r.status}] len=${r.len} keys=[${r.keys}]\n      ${r.url}`);
  }

  // Peek into __NEXT_DATA__ for a listings array shape, if present.
  if (hasNextData) {
    const nd = await page.evaluate(() => {
      try {
        const el = document.getElementById('__NEXT_DATA__');
        const j = JSON.parse(el?.textContent || '{}');
        const walk = (o: any, path: string, depth: number): string[] => {
          if (depth > 6 || !o || typeof o !== 'object') return [];
          const out: string[] = [];
          for (const k of Object.keys(o)) {
            const v = (o as any)[k];
            if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') {
              out.push(`${path}.${k} = ARRAY(${v.length}) firstKeys=[${Object.keys(v[0]).slice(0, 14).join(',')}]`);
            } else if (v && typeof v === 'object') {
              out.push(...walk(v, `${path}.${k}`, depth + 1));
            }
          }
          return out;
        };
        return walk(j, 'NEXT', 0).slice(0, 40);
      } catch (e) {
        return ['<parse error: ' + (e as Error).message + '>'];
      }
    });
    console.log('[debug] --- __NEXT_DATA__ array paths ---');
    for (const line of nd) console.log('  ' + line);
  }

  await ctx.close();
}

main().catch((e) => {
  console.error('debug failed:', e);
  process.exit(1);
});

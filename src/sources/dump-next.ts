import fs from 'fs';
import path from 'path';
import { launchYad2Context, pageIsBlocked } from './yad2-session';

async function main() {
  const ctx = await launchYad2Context(process.env.YAD2_HEADLESS !== 'false');
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  const feedXhr: string[] = [];
  page.on('response', async (res) => {
    const u = res.url();
    if (!/gw\.yad2\.co\.il/.test(u)) return;
    if (!/feed|markers|realestate|search/i.test(u)) return;
    try {
      const j = await res.json();
      const find = (o: any, d: number): string => {
        if (d > 4 || !o || typeof o !== 'object') return '';
        for (const k of Object.keys(o)) {
          const v = o[k];
          if (Array.isArray(v) && v.length && typeof v[0] === 'object') return `${k}=ARRAY(${v.length}) keys=[${Object.keys(v[0]).slice(0, 20).join(',')}]`;
          if (v && typeof v === 'object') { const r = find(v, d + 1); if (r) return `${k}.${r}`; }
        }
        return '';
      };
      feedXhr.push(`[${res.status()}] ${u}\n      ${find(j, 0)}`);
    } catch { /* ignore */ }
  });

  const url = process.argv[2] || 'https://www.yad2.co.il/realestate/rent';
  console.log('goto', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);

  if (await pageIsBlocked(page)) {
    console.log('BLOCKED — run npm run yad2:login again.');
    await ctx.close();
    process.exit(1);
  }

  // Pass a STRING to evaluate so tsx/esbuild does not inject __name helpers.
  const text = (await page.evaluate(
    "(document.getElementById('__NEXT_DATA__')||{}).textContent || ''"
  )) as string;

  const outFile = path.join(process.cwd(), 'data', 'yad2-next.json');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, text, 'utf8');
  console.log('wrote', outFile, 'bytes=', text.length);

  await ctx.close();

  // Walk the JSON in Node (no browser injection issues) to find arrays of objects.
  const json = JSON.parse(text);
  const hits: string[] = [];
  console.log('--- feed XHRs seen (' + feedXhr.length + ') ---');
  for (const f of feedXhr) console.log('  ' + f);

  // Example canonical search URLs that Yad2 itself links to (reveals param names).
  const recLinks = json?.props?.pageProps?.lobbyData?.recommendationLinks;
  if (Array.isArray(recLinks)) {
    console.log('--- recommendationLinks sample urls ---');
    for (const group of recLinks.slice(0, 4)) {
      for (const l of (group?.links || []).slice(0, 4)) {
        console.log(`  ${l?.text}  ->  ${l?.url}`);
      }
    }
  }

  // Inspect the React Query SSR cache specifically — the search feed usually lives here.
  const queries = json?.props?.pageProps?.dehydratedState?.queries;
  if (Array.isArray(queries)) {
    console.log('--- dehydratedState.queries (' + queries.length + ') ---');
    queries.forEach((q: any, i: number) => {
      console.log(`query[${i}] key=${JSON.stringify(q?.queryKey)}`);
      const data = q?.state?.data;
      if (data && typeof data === 'object') {
        console.log(`  data keys=[${Object.keys(data).slice(0, 20).join(',')}]`);
        for (const k of Object.keys(data)) {
          if (Array.isArray((data as any)[k])) {
            const arr = (data as any)[k];
            console.log(`  data.${k} = ARRAY(${arr.length})` + (arr[0] && typeof arr[0] === 'object' ? ` firstKeys=[${Object.keys(arr[0]).slice(0, 22).join(',')}]` : ''));
          }
        }
      }
    });
  }

  const walk = (o: any, p: string, d: number) => {
    if (d > 14 || !o || typeof o !== 'object') return;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object' && v[0] !== null) {
        hits.push(`${p}.${k} = ARRAY(${v.length}) firstKeys=[${Object.keys(v[0]).slice(0, 20).join(',')}]`);
        walk(v[0], `${p}.${k}[0]`, d + 1);
      } else if (v && typeof v === 'object') {
        walk(v, `${p}.${k}`, d + 1);
      }
    }
  };
  walk(json, 'NEXT', 0);
  console.log('--- arrays of objects ---');
  for (const h of hits) console.log(h);
}

main().catch((e) => {
  console.error('dump-next failed:', e);
  process.exit(1);
});

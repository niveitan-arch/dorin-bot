import { launchYad2Context, pageIsBlocked, PROFILE_DIR } from './yad2-session';

// One-time (and occasional refresh) manual captcha solve.
// Opens a VISIBLE Chromium window (via WSLg). You solve the ShieldSquare/hCaptcha
// once; the resulting session cookies are persisted to the profile dir and reused
// by the headless bot afterwards.
async function main() {
  console.log('Opening a visible Yad2 window for you to solve the captcha...');
  console.log('Profile (cookies) will be saved to:', PROFILE_DIR);

  const context = await launchYad2Context(false); // headed
  const page = context.pages()[0] ?? (await context.newPage());

  await page.goto('https://www.yad2.co.il/realestate/rent', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });

  console.log('\n>>> In the browser window: solve the captcha if shown, until you SEE real apartment listings.');
  console.log('>>> Waiting up to 5 minutes for you to get past the wall...\n');

  const maxChecks = 150; // ~5 min at 2s intervals
  let ok = false;
  for (let i = 0; i < maxChecks; i++) {
    await page.waitForTimeout(2000);
    const blocked = await pageIsBlocked(page);
    const url = page.url();
    if (!blocked && /yad2\.co\.il\/realestate/.test(url)) {
      ok = true;
      break;
    }
  }

  if (ok) {
    // settle so any clearance cookies are written
    await page.waitForTimeout(2000);
    console.log('\n✅ Looks like you are past the captcha. Session saved.');
    console.log('You can close this and run:  npm run scrape:yad2   to confirm listings come through.');
  } else {
    console.log('\n⚠️  Timed out without detecting a clear listings page. If you DID solve it, the session may still be saved — try `npm run scrape:yad2`.');
  }

  await page.waitForTimeout(1500);
  await context.close();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('yad2-login failed:', e);
  process.exit(1);
});

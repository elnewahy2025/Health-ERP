import { chromium } from 'playwright';

const BASE = 'https://vision-healthcare-erp.vercel.app';
const PID = '61773b89-10ef-40b4-b033-073d2e85004c';
const results = [];
const report = (name, ok, detail='') => { results.push({name, ok}); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(20000);

try {
  await page.goto(BASE + '/login', { waitUntil: 'networkidle' });
  await page.fill('input[placeholder="vision"]', 'demo');
  await page.fill('input[type="email"]', 'admin@demo.com');
  await page.fill('input[type="password"]', 'Admin@123');
  await page.click('button[type="submit"]');
  await page.waitForURL(u => !u.pathname.includes('/login'), { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(2000);

  // open patient detail
  await page.goto(BASE + '/patients/' + PID, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const editBtn = page.getByRole('button', { name: /edit/i });
  report('view mode: Edit button visible', await editBtn.count() > 0);
  const inputsInView = await page.locator('input, select').count();
  report('view mode: no editable inputs', inputsInView === 0, `inputs=${inputsInView}`);

  // switch to edit
  await editBtn.first().click();
  await page.waitForTimeout(800);
  const inputsInEdit = await page.locator('input, select').count();
  report('edit mode: inputs editable', inputsInEdit > 0, `inputs=${inputsInEdit}`);
  const viewBtn = page.getByRole('button', { name: /view/i });
  report('edit mode: View button visible', await viewBtn.count() > 0);

  // change nationality and save
  const nat = page.getByLabel(/Nationality/);
  await nat.fill('Egyptian');
  await page.getByRole('button', { name: /save/i }).click();
  await page.waitForTimeout(2500);
  const bodyAfterSave = await page.locator('body').innerText();
  report('save shows success toast', bodyAfterSave.includes('Patient updated successfully'), '');
  const inputsAfterSave = await page.locator('input, select').count();
  report('back to view mode after save', inputsAfterSave === 0, `inputs=${inputsAfterSave}`);
  report('updated value shown in view', bodyAfterSave.includes('Egyptian'));

  // reload persists
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const bodyAfterReload = await page.locator('body').innerText();
  report('value persists after reload', bodyAfterReload.includes('Egyptian'));
} catch (e) {
  console.log('EXCEPTION', e.message);
  report('script completed', false, e.message);
} finally {
  await browser.close();
}
const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);

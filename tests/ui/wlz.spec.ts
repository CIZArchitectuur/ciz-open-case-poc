import { test, expect, type Browser, type Locator, type Page } from '@playwright/test';

async function setDemoBanner(page: Page, stage: string) {
  if (process.env.PLAYWRIGHT_HEADLESS !== 'false') return;
  await page.evaluate(label => {
    let banner = document.getElementById('playwright-demo-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'playwright-demo-banner';
      Object.assign(banner.style, {
        position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
        zIndex: '2147483647', pointerEvents: 'none', maxWidth: '88vw',
        padding: '14px 22px', borderRadius: '14px', background: '#073b36',
        boxShadow: '0 8px 28px #0006', color: '#fff', font: 'bold 25px Arial, sans-serif',
        textAlign: 'center'
      });
      document.body.appendChild(banner);
    }
    banner.textContent = label;
  }, stage);
}

async function showDemoStage(page: Page, stage: string, focus?: Locator) {
  if (process.env.PLAYWRIGHT_HEADLESS !== 'false') return;
  await page.bringToFront();
  if (focus) {
    await focus.scrollIntoViewIfNeeded();
    await focus.evaluate(element => {
      document.querySelectorAll('[data-playwright-demo-focus]').forEach(previous => previous.removeAttribute('data-playwright-demo-focus'));
      element.setAttribute('data-playwright-demo-focus', '');
      if (!document.getElementById('playwright-demo-focus-style')) {
        const style = document.createElement('style');
        style.id = 'playwright-demo-focus-style';
        style.textContent = '[data-playwright-demo-focus] { outline: 4px solid #e68b12 !important; outline-offset: 4px !important; }';
        document.head.appendChild(style);
      }
    });
  }
  await setDemoBanner(page, stage);
  console.log(`Demo: ${stage}`);
  await page.waitForTimeout(3000);
}

async function signIn(browser: Browser, path: string, username: string, password: string) {
  const context = await browser.newContext({ baseURL: 'http://localhost:3000' });
  const page = await context.newPage();
  await page.goto(path);
  await page.getByRole('button', { name: 'Inloggen als medewerker' }).click();
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await expect(page.getByRole('button', { name: 'Uitloggen' })).toBeVisible();
  return { context, page };
}

async function completePolicyFields(page: Page, card: Locator) {
  const fields = card.locator('.policy-checks .policy-field');
  const total = await fields.count();
  for (let index = 0; index < total; index++) {
    const field = fields.nth(index);
    if (process.env.PLAYWRIGHT_HEADLESS === 'false') {
      await field.scrollIntoViewIfNeeded();
      await setDemoBanner(page, `CIZ · Beleidscontrole ${index + 1}/${total}`);
    }
    const select = field.locator('select');
    if (await select.count()) {
      if (await select.isDisabled()) continue;
      const values = await select.locator('option').evaluateAll(options =>
        options.map(option => (option as HTMLOptionElement).value).filter(Boolean));
      if (values.length) await select.selectOption(values.includes('false') ? 'false' : values[0]);
    } else if (await field.locator('input').count()) {
      const input = field.locator('input');
      if (await input.getAttribute('type') === 'date') await input.fill('2026-01-01');
      else if (await input.getAttribute('type') === 'number') await input.fill('1');
      else await input.fill('Fictieve testwaarde');
    } else if (await field.locator('textarea').count()) {
      await field.locator('textarea').fill('Fictieve motivering voor de browsertest.');
    }
  }
}

test('gewone Wlz-aanvraag: formulier, CIZ-registratie, triage, rechtstreekse beslissing en verzending', async ({ browser }) => {
  const applicant = await browser.newContext({ baseURL: 'http://localhost:3000' });
  const applicantPage = await applicant.newPage();
  const name = `Fictieve UI cliënt ${Date.now()}`;
  await applicantPage.addInitScript(() => window.localStorage.removeItem('ciz-last-case-id'));
  await applicantPage.goto('/aanvrager');
  await showDemoStage(applicantPage, 'Aanvrager · 1/5 Persoonsgegevens', applicantPage.getByRole('heading', { name: 'Persoonlijke gegevens' }));
  await applicantPage.getByLabel('Aanvrager-ID').fill(`ui-${Date.now()}`);
  await applicantPage.getByLabel('Volledige naam').fill(name);
  await applicantPage.getByLabel('Achternaam').fill('Testcliënt');
  await applicantPage.getByLabel('Voorletters').fill('F');
  await applicantPage.getByLabel('BSN').fill(String(Date.now()).slice(-9));
  await applicantPage.getByLabel('Geboortedatum').fill('1990-01-01');
  await applicantPage.getByRole('button', { name: 'Volgende' }).click();

  await showDemoStage(applicantPage, 'Aanvrager · 2/5 Woonadres', applicantPage.getByRole('heading', { name: 'Woonadres' }));
  await applicantPage.getByLabel('Straat').fill('Fictieve straat');
  await applicantPage.getByLabel('Huisnummer').fill('1');
  await applicantPage.getByLabel('Postcode').fill('1234 AB');
  await applicantPage.getByLabel('Woonplaats').fill('Teststad');
  await applicantPage.getByRole('button', { name: 'Volgende' }).click();

  await showDemoStage(applicantPage, 'Aanvrager · 3/5 Zorgvraag', applicantPage.getByRole('heading', { name: 'Zorgvraag' }));
  await applicantPage.getByLabel('Er is naar verwachting blijvend intensieve zorg nodig').check();
  await applicantPage.getByLabel('Er is naar verwachting permanent toezicht nodig').check();
  await applicantPage.getByRole('button', { name: 'Volgende' }).click();

  await showDemoStage(applicantPage, 'Aanvrager · 4/5 Ondertekening', applicantPage.getByRole('heading', { name: 'Ondertekening en vertegenwoordiging' }));
  await expect(applicantPage.getByLabel('Wie doet de aanvraag?')).toHaveValue('client');
  await expect(applicantPage.getByLabel('Wie heeft de aanvraag ondertekend?')).toHaveValue('client');
  await applicantPage.getByRole('button', { name: 'Volgende' }).click();

  await showDemoStage(applicantPage, 'Aanvrager · 5/5 Controleren en indienen', applicantPage.getByRole('heading', { name: 'Controleer uw aanvraag' }));
  await expect(applicantPage.getByRole('heading', { name: 'Controleer uw aanvraag' })).toBeVisible();
  const [createdResponse] = await Promise.all([
    applicantPage.waitForResponse(response => response.url().endsWith('/api/cases') && response.request().method() === 'POST'),
    applicantPage.getByRole('button', { name: 'Aanvraag indienen' }).click()
  ]);
  expect(createdResponse.status()).toBe(201);
  const createdCase = await createdResponse.json() as { caseId: string };
  expect(createdCase.caseId).toBeTruthy();
  await expect(applicantPage.locator('.result-heading h3')).toHaveText(name);
  await showDemoStage(applicantPage, 'Aanvrager · Aanvraag ingediend', applicantPage.locator('.result-heading'));

  const staff = await signIn(browser, '/ciz-medewerker', 'ciz.medewerker', 'ciz-test-only');
  const registration = staff.page.locator('.work-card').filter({ has: staff.page.getByRole('heading', { name }) });
  await expect(registration).toBeVisible();
  await showDemoStage(staff.page, 'CIZ · Registreren en controleren', registration);
  await completePolicyFields(staff.page, registration);
  await showDemoStage(staff.page, 'CIZ · Registratie accepteren', registration.getByLabel('Uitkomst registratie en acceptatie'));
  await registration.getByLabel('Uitkomst registratie en acceptatie').selectOption('ACCEPTED');
  await showDemoStage(staff.page, 'CIZ · Registratie vastleggen', registration.getByRole('button', { name: 'Registratie vastleggen' }));
  const [registrationResponse] = await Promise.all([
    staff.page.waitForResponse(response => response.url().endsWith('/complete') && response.request().method() === 'POST'),
    registration.getByRole('button', { name: 'Registratie vastleggen' }).click()
  ]);
  expect(registrationResponse.status()).toBe(200);
  await expect(registration).toHaveCount(0);
  await showDemoStage(staff.page, 'CIZ · Registratie afgerond');

  const reviewer = await signIn(browser, '/beoordelaar', 'beoordelaar', 'beoordelaar-test-only');
  const triage = reviewer.page.locator('.work-card').filter({ has: reviewer.page.getByRole('heading', { name }) });
  await expect(triage).toBeVisible();
  await showDemoStage(reviewer.page, 'Beoordelaar · Triage', triage);
  await triage.getByLabel('Uitkomst triage').selectOption('DIRECT_HANDLED');
  await triage.getByLabel('Uitkomst directe afhandeling').selectOption('GRANTED');
  await triage.getByLabel('Korte toelichting').fill('Fictieve directe afhandeling voor de UI-test.');
  await triage.getByLabel('Zorgprofiel (optioneel)').fill('Fictief PoC-profiel');
  await triage.getByLabel('Grondslagen (optioneel, één per regel)').fill('Fictieve grondslag');
  await showDemoStage(reviewer.page, 'Beoordelaar · Directe beslissing vastleggen', triage.getByRole('button', { name: 'Triage vastleggen' }));
  await triage.getByRole('button', { name: 'Triage vastleggen' }).click();
  await expect(triage).toHaveCount(0);

  await staff.page.getByRole('button', { name: 'Vernieuwen' }).last().click();
  const outgoing = staff.page.locator('.work-card').filter({ has: staff.page.getByRole('heading', { name }) });
  await expect(outgoing).toBeVisible();
  await showDemoStage(staff.page, 'CIZ · Verzending vastleggen', outgoing);
  await outgoing.getByRole('button', { name: 'Verzending vastleggen' }).click();
  await expect(outgoing).toHaveCount(0);

  await applicantPage.reload();
  await expect(applicantPage.getByText('Aanvraag toegekend')).toBeVisible();
  await expect(applicantPage.getByText('Beslissing verstuurd')).toBeVisible();
  await expect(applicantPage.getByText('Zorgprofiel: Fictief PoC-profiel')).toBeVisible();
  await expect(applicantPage.getByText('Grondslagen: Fictieve grondslag')).toBeVisible();
  await showDemoStage(applicantPage, 'Aanvrager · Beslissing en voortgang', applicantPage.locator('.decision-result'));
  const demoHoldMs = Number(process.env.PLAYWRIGHT_DEMO_HOLD_MS ?? '0');
  if (demoHoldMs > 0) await applicantPage.waitForTimeout(demoHoldMs);
  await reviewer.context.close();
  await staff.context.close();
  await applicant.close();
});

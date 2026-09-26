import { test, expect, type Browser, type Page } from '@playwright/test';

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

async function completePolicyFields(card: ReturnType<Page['locator']>) {
  const fields = card.locator('.policy-checks .policy-field');
  for (let index = 0; index < await fields.count(); index++) {
    const field = fields.nth(index);
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

test('gewone Wlz-aanvraag: aanvrager, CIZ-registratie, triage, rechtstreekse beslissing en verzending', async ({ browser }) => {
  const applicant = await browser.newContext({ baseURL: 'http://localhost:3000' });
  const applicantPage = await applicant.newPage();
  const name = `Fictieve UI cliënt ${Date.now()}`;
  await applicantPage.addInitScript(() => window.localStorage.removeItem('ciz-last-case-id'));
  const createdResponse = await applicant.request.post('/api/cases', { data: {
    applicantId: `ui-${Date.now()}`,
    clientName: name,
    lastName: 'Testcliënt',
    initials: 'F',
    citizenServiceNumber: String(Date.now()).slice(-9),
    birthDate: '1990-01-01',
    street: 'Fictieve straat',
    houseNumber: '1',
    postalCode: '1234 AB',
    city: 'Teststad',
    country: 'Nederland',
    permanentCareNeed: true,
    permanentSupervision: true,
    applicantRole: 'client',
    signedBy: 'client'
  } });
  expect(createdResponse.status()).toBe(201);
  const createdCase = await createdResponse.json() as { caseId: string };
  const caseId = createdCase.caseId;
  await applicantPage.goto(`/aanvrager?caseId=${caseId}`);
  await expect(applicantPage.locator('.result-heading h3')).toHaveText(name);

  const staff = await signIn(browser, '/ciz-medewerker', 'ciz.medewerker', 'ciz-test-only');
  const registration = staff.page.locator('.work-card').filter({ has: staff.page.getByRole('heading', { name }) });
  await expect(registration).toBeVisible();
  await completePolicyFields(registration);
  await registration.getByLabel('Uitkomst registratie en acceptatie').selectOption('ACCEPTED');
  await registration.getByRole('button', { name: 'Registratie vastleggen' }).evaluate(button => (button as HTMLButtonElement).click());
  await expect(registration).toHaveCount(0);

  const reviewer = await signIn(browser, '/beoordelaar', 'beoordelaar', 'beoordelaar-test-only');
  const triage = reviewer.page.locator('.work-card').filter({ has: reviewer.page.getByRole('heading', { name }) });
  await expect(triage).toBeVisible();
  await triage.getByLabel('Uitkomst triage').selectOption('DIRECT_HANDLED');
  await triage.getByLabel('Uitkomst directe afhandeling').selectOption('GRANTED');
  await triage.getByLabel('Korte toelichting').fill('Fictieve directe afhandeling voor de UI-test.');
  await triage.getByRole('button', { name: 'Triage vastleggen' }).evaluate(button => (button as HTMLButtonElement).click());
  await expect(triage).toHaveCount(0);

  await staff.page.getByRole('button', { name: 'Vernieuwen' }).last().click();
  const outgoing = staff.page.locator('.work-card').filter({ has: staff.page.getByRole('heading', { name }) });
  await expect(outgoing).toBeVisible();
  await outgoing.getByRole('button', { name: 'Verzending vastleggen' }).evaluate(button => (button as HTMLButtonElement).click());
  await expect(outgoing).toHaveCount(0);

  await applicantPage.reload();
  await expect(applicantPage.getByText('Aanvraag toegekend')).toBeVisible();
  await expect(applicantPage.getByText('Beslissing verstuurd')).toBeVisible();
  await reviewer.context.close();
  await staff.context.close();
  await applicant.close();
});

import { test, expect, type Browser, type Locator, type Page } from '@playwright/test';
import { readableDocumentText } from './documentText';

test('OCR weergave toont leesbare tekst en geen ruwe JSON', () => {
  expect(readableDocumentText('Eerste regel\\nTweede regel')).toBe('Eerste regel\nTweede regel');
  expect(readableDocumentText('{"text":"Fictieve bron\\nVolgende regel"}')).toBe('Fictieve bron\nVolgende regel');
  expect(readableDocumentText('{"unknown":{"patient":"voorbeeld"}}')).not.toContain('patient');
  expect(readableDocumentText('{invalid')).toContain('oorspronkelijke document');
});

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
  await card.locator('.policy-group').evaluateAll(groups => groups.forEach(group => (group as HTMLDetailsElement).open = true));
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

async function demonstrateOcr(page: Page, card: Locator) {
  const button = card.getByRole('button', {name: 'PDF uitlezen', exact: true});
  const extraction = card.getByRole('region', {name: 'Document uitlezen', exact: true});
  if (await button.isVisible()) {
    await showDemoStage(page, 'Onderzoeker · PDF-uitlezing starten', button);
    try {
      await button.click({timeout: 2_000});
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'TimeoutError') throw error;
      await expect(button).toBeHidden();
    }
  } else {
    await showDemoStage(page, 'BAS · Documentanalyse automatisch gestart na indiening', extraction);
  }
  if (process.env.EXPECT_REAL_OCR === 'true') {
    const ready = extraction.getByRole('heading', {name: 'Controle nodig', exact: true});
    const error = extraction.getByRole('alert');
    const failed = extraction.getByText('Verwerking niet geslaagd. Controleer het document handmatig.', {exact: true});
    const outcome = await Promise.race([
      ready.waitFor({state: 'visible', timeout: 1_800_000}).then(() => 'ready'),
      error.waitFor({state: 'visible', timeout: 1_800_000}).then(async () => `error: ${await error.innerText()}`),
      failed.waitFor({state: 'visible', timeout: 1_800_000}).then(() => 'failed')
    ]);
    expect(outcome).toBe('ready');
    await expect(extraction.getByText('Simulatie — geen echte OCR.', {exact: true})).toHaveCount(0);
    await expect(extraction.locator('details')).not.toHaveCount(0);
    await extraction.locator('.ocr-technical-details summary').click();
    await expect(extraction.getByText('gpt-6.1-sol', {exact: true})).toBeVisible();
    await showDemoStage(page, 'Onderzoeker · OCR-bron en modelversie bekijken', extraction.locator('.ocr-technical-details'));
    await showDemoStage(page, 'Onderzoeker · OCR klaar — herkende documentgegevens controleren', extraction.getByRole('region', {name: 'Geëxtraheerde documentgegevens'}));
  } else {
    await expect(extraction.getByText('Simulatie — geen echte OCR.', {exact: true})).toBeVisible();
    await expect(extraction.getByRole('heading', {name: 'Controle nodig', exact: true})).toBeVisible();
    await showDemoStage(page, 'Onderzoeker · Voorbeeld van herkende documentgegevens — simulatie', extraction.getByRole('region', {name: 'Geëxtraheerde documentgegevens'}));
  }
  await expect(extraction.getByRole('region', {name: 'Geëxtraheerde documentgegevens'})).toBeVisible();
  await extraction.locator('summary').first().click();
  await showDemoStage(page, 'Onderzoeker · Bronfragment en paginaverwijzing bekijken', extraction.locator('details').first());
  const extractedText = (await extraction.locator('.ocr-fragment-body pre').allTextContents()).join('\n\n').slice(0, 20000);
  expect(extractedText.trim().length).toBeGreaterThan(0);
  await extraction.getByRole('button', {name: 'Vergelijk met PDF', exact: true}).first().click();
  const sourceDialog = extraction.getByRole('dialog', {name: /Bron:/});
  await expect(sourceDialog.getByRole('heading', {name: /Uitgelezen tekst/})).toBeVisible();
  await showDemoStage(page, 'Onderzoeker · Geëxtraheerde tekst naast de PDF vergelijken', sourceDialog);
  await sourceDialog.getByRole('button', {name: 'Sluiten'}).click();
  const confirm = extraction.getByRole('button', {name: 'Gecontroleerde tekst vastleggen'});
  await expect(confirm).toBeDisabled();
  await showDemoStage(page, 'Onderzoeker · Herkende tekst na broncontrole vastleggen', extraction.getByLabel('Tekst na controle'));
  await extraction.getByLabel('Tekst na controle').fill(extractedText);
  await expect(confirm).toBeDisabled();
  await extraction.getByRole('checkbox').check();
  await showDemoStage(page, 'Onderzoeker · Menselijke controle bevestigen — geen automatische beleidsfeiten', confirm);
  await confirm.click();
  await expect(extraction.getByText('Gecontroleerde tekst', {exact: true})).toBeVisible();
  await showDemoStage(page, 'Onderzoeker · Gecontroleerd resultaat met audit opgeslagen', extraction);
}

for (const portal of ['/aanvrager', '/zorgaanbieder']) {
test(`gewone Wlz-aanvraag via ${portal}: formulier, PDF, OCR, registratie, triage, onderzoek en besluit`, async ({ browser }) => {
  const applicant = await browser.newContext({ baseURL: 'http://localhost:3000' });
  const applicantPage = await applicant.newPage();
  const name = `Fictieve UI cliënt ${Date.now()}`;
  await applicantPage.addInitScript(() => window.localStorage.removeItem('ciz-last-case-id'));
  await applicantPage.goto(portal);
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
    applicantPage.waitForResponse(response => response.url().endsWith('/api/cases/drafts') && response.request().method() === 'POST'),
    applicantPage.getByRole('button', { name: 'Aanvraag indienen' }).click()
  ]);
  expect(createdResponse.status()).toBe(201);
  const createdCase = await createdResponse.json() as { caseId: string };
  expect(createdCase.caseId).toBeTruthy();
  await expect(applicantPage.locator('.result-heading h3')).toHaveText(name);
  await showDemoStage(applicantPage, 'Aanvrager · Aanvraag ingediend', applicantPage.locator('.result-heading'));

  const ao = await signIn(browser, '/ciz-medewerker', 'ciz.medewerker', 'ciz-test-only');
  await ao.page.getByLabel('Dossier zoeken').fill(name);
  await ao.page.getByRole('button', {name: `Open dossier ${name}`,exact:true}).click();
  await expect(ao.page.getByRole('button',{name:'Registratie vastleggen'})).toHaveCount(0);
  await showDemoStage(ao.page,'AO · Ontvangen PDF uploaden',ao.page.getByLabel('Ontvangen document',{exact:true}));
  await ao.page.getByLabel('Ontvangen document',{exact:true}).setInputFiles('fixtures/ocr/ann7_ann8_pagescombined_filled.pdf');
  const uploadButton = ao.page.getByRole('button',{name:'Document uploaden',exact:true});
  await expect(uploadButton).toBeEnabled();
  const [uploaded] = await Promise.all([
    ao.page.waitForResponse(response => response.url().includes(`/api/cases/${createdCase.caseId}/documents`) && response.request().method() === 'POST'),
    uploadButton.click()
  ]);
  expect(uploaded.status()).toBe(201);
  await expect(ao.page.locator('.document-list').getByText('ann7_ann8_pagescombined_filled.pdf',{exact:true})).toBeVisible();

  const staff = await signIn(browser, '/beoordelaar', 'beoordelaar', 'beoordelaar-test-only');
  await staff.page.getByLabel('Dossier zoeken').fill(name);
  await staff.page.getByRole('button',{name:`Open dossier ${name}`,exact:true}).click();
  const registration = staff.page.locator('.work-card').filter({has:staff.page.getByRole('heading',{name,exact:true})});
  await expect(registration).toBeVisible();
  await showDemoStage(staff.page,'Onderzoeker · Registreren en controleren',registration);
  await completePolicyFields(staff.page,registration);
  await showDemoStage(staff.page, 'Onderzoeker · Registratie accepteren', registration.getByLabel('Uitkomst registratie en acceptatie'));
  await registration.getByLabel('Uitkomst registratie en acceptatie').selectOption('ACCEPTED');
  await showDemoStage(staff.page, 'Onderzoeker · Registratie vastleggen', registration.getByRole('button', { name: 'Registratie vastleggen' }));
  const [registrationResponse] = await Promise.all([
    staff.page.waitForResponse(response => response.url().endsWith('/complete') && response.request().method() === 'POST'),
    registration.getByRole('button', { name: 'Registratie vastleggen' }).click()
  ]);
  expect(registrationResponse.status()).toBe(200);
  await expect(registration).toHaveCount(0);
  await showDemoStage(staff.page, 'Onderzoeker · Registratie afgerond');

  const reviewer = staff;
  await reviewer.page.getByRole('button',{name:'Triage',exact:true}).click();
  await reviewer.page.getByLabel('Dossier zoeken').fill(name);
  await reviewer.page.getByRole('button',{name:`Open dossier ${name}`,exact:true}).click();
  const triage = reviewer.page.locator('.work-card').filter({ has: reviewer.page.getByRole('heading', { name }) });
  await expect(triage).toBeVisible();
  await expect(triage.getByRole('navigation', { name: 'Navigatie in dossier' })).toBeVisible();
  await expect(triage.getByText('Aanvraag ontvangen', { exact: true })).toBeVisible();
  await expect(triage.getByText('Registratie gecontroleerd', { exact: true })).toBeVisible();
  await expect(triage.getByRole('link', { name: 'Beleidsuitkomst' })).toBeVisible();
  await expect(triage.locator('summary').filter({ hasText: 'Beleidsuitkomst' })).toBeVisible();
  await expect(triage.getByText('Aanvraag en context', { exact: true })).toBeVisible();
  const applicationFactColumns = await triage.locator('.triage-application-facts').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
  expect(applicationFactColumns).toBeGreaterThanOrEqual(2);
  await showDemoStage(reviewer.page, 'Onderzoeker · Triage', triage);
  await triage.getByRole('radio', { name: /Nader onderzoek inplannen/ }).check();
  await showDemoStage(reviewer.page, 'Onderzoeker · Nader onderzoek inplannen', triage.getByRole('button', { name: 'Triage vastleggen' }));
  await triage.getByRole('button', { name: 'Triage vastleggen' }).click();
  await expect(triage).toHaveCount(0);

  await reviewer.page.getByRole('button',{name:'Onderzoek',exact:true}).click();
  await reviewer.page.getByLabel('Dossier zoeken').fill(name);
  await reviewer.page.getByRole('button',{name:`Open dossier ${name}`,exact:true}).click();
  const investigation = reviewer.page.locator('.work-card').filter({has:reviewer.page.getByRole('heading',{name,exact:true})});
  await expect(investigation.locator('.assessment-review-layout')).toBeVisible();
  if (process.env.SKIP_DOCUMENT_PROCESSING !== 'true') {
    await demonstrateOcr(reviewer.page, investigation);
    const extractedData = investigation.getByRole('region',{name:'Geëxtraheerde documentgegevens'});
    await expect(extractedData).toBeVisible();
    await expect(extractedData.getByText('tekstfragmenten')).toBeVisible();
  }
  if (process.env.EXPECT_ANALYSIS_MOCK==='true') {
    const analysis=investigation.getByRole('region',{name:'Stoornissenanalyse'});
    // BAS may already have processed the submitted document snapshot automatically.
    const trigger=analysis.getByRole('button',{name:'Dossier analyseren',exact:true});
    if(await trigger.isVisible() && await trigger.isEnabled()) await trigger.click();
    await expect(analysis.getByText('Simulatie voor contracttests — RobBERT is niet uitgevoerd.',{exact:true})).toBeVisible();
    await expect(analysis.getByLabel(/^Ernstscore/)).toHaveValue('2');
    await analysis.getByLabel(/^Ernstscore/).selectOption('0');
    await analysis.getByLabel(/^Beoordeling/).selectOption('ADJUSTED');
    await analysis.getByRole('checkbox').check();
    await analysis.getByRole('button',{name:'Bevindingen vastleggen',exact:true}).click();
    await expect(analysis.getByText(/Laatste menselijke controle/)).toBeVisible();
  }
  await showDemoStage(reviewer.page,'Onderzoeker · Documentbronnen naast de beoordeling',investigation.locator('.assessment-review-layout'));
  await completePolicyFields(reviewer.page,investigation);
  await investigation.getByLabel('Inhoudelijke uitkomst').selectOption('GRANTED');
  await investigation.getByLabel('Motivering', {exact:true}).fill('Fictieve inhoudelijke beoordeling op basis van handmatig gecontroleerde dossierinformatie.');
  await investigation.getByLabel('Zorgprofiel (optioneel)').fill('Fictief PoC-profiel');
  await investigation.getByLabel('Grondslagen (optioneel, één per regel)').fill('Fictieve grondslag');
  await showDemoStage(reviewer.page,'Onderzoeker · Beslissing na beoordeling vastleggen',investigation.getByRole('button',{name:'Onderzoek en besluit vastleggen'}));
  await investigation.getByRole('button',{name:'Onderzoek en besluit vastleggen'}).click();
  await expect(investigation).toHaveCount(0);

  await staff.page.getByRole('button',{name:'Verzending',exact:true}).click();
  await staff.page.getByLabel('Dossier zoeken').fill(name);
  await staff.page.getByRole('button',{name:`Open dossier ${name}`,exact:true}).click();
  const outgoing = staff.page.locator('.work-card').filter({ has: staff.page.getByRole('heading', { name }) });
  await expect(outgoing).toBeVisible();
  await showDemoStage(staff.page, 'Onderzoeker · Verzending vastleggen', outgoing);
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
}

const { expect, test } = require('@playwright/test');
const path = require('node:path');

// Both fixtures are synthetic. The PDF combines native text with a separate bilingual image page.
for (const [filename, expected] of [
  ['mixed-native-scan.pdf', ['Operations profile', 'Native page 8', 'Quality Engineer', 'الرياض']],
  ['bilingual-resume.docx', ['Candidate name', 'مهندس\tMechanical Engineer', 'Bilingual résumé', 'Quality assurance', 'نهاية السيرة']],
]) {
  test(`extracts ${filename} in the browser without third-party requests`, async ({ page, context }) => {
    test.setTimeout(90_000);
    await page.goto('/robots.txt');
    const origin = new URL(page.url()).origin;
    const external = [];
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.protocol.startsWith('http') && url.origin !== origin) {
        external.push(url.origin);
        return route.abort();
      }
      return route.continue();
    });
    await page.evaluate(() => document.body.appendChild(Object.assign(document.createElement('input'), { type: 'file' })));
    await page.locator('input').setInputFiles(path.join(__dirname, 'fixtures', filename));
    const text = await page.evaluate(async () => {
      const { extractResumeFileText } = await import('/resume-extraction.js');
      return extractResumeFileText(document.querySelector('input').files[0]);
    });
    for (const section of expected) expect(text).toContain(section);
    expect(external).toEqual([]);
  });
}

test.describe('mobile PDF text recovery', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  for (const filename of ['bilingual-damaged-layer.pdf', 'unrecoverable-layer.pdf']) {
    test(`handles ${filename} without accepting an email and corrupt hidden layer`, async ({ page, context }) => {
      test.setTimeout(100_000);
      await page.goto('/robots.txt');
      const origin = new URL(page.url()).origin;
      await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      await page.evaluate(() => document.body.appendChild(Object.assign(document.createElement('input'), { type: 'file' })));
      await page.locator('input').setInputFiles(path.join(__dirname, 'fixtures', filename));
      const result = await page.evaluate(async () => {
        const { extractResumeFileText } = await import('/resume-extraction.js');
        try { return { text: await extractResumeFileText(document.querySelector('input').files[0]) }; }
        catch (error) { return { code: error.code }; }
      });
      if (filename === 'unrecoverable-layer.pdf') {
        expect(result.code).toBe('RESUME_TEXT_DAMAGED');
      } else {
        expect(result.text).toContain('الرياض');
        expect(result.text).toContain('Translation Specialist');
        expect(result.text).toContain('candidate@example.org');
        expect(result.text).not.toContain('XQZZRB');
      }
    });
  }
});

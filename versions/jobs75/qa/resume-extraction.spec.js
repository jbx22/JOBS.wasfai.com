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

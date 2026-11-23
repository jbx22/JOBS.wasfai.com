import assert from 'node:assert/strict';
import test from 'node:test';
import { validateFile } from '../functions/api/resumes/_files.js';
import { extractResumeFileText, resumeExtractionErrorMessage } from '../public/resume-extraction.js';

test('extracts UTF-8 Arabic and English plain text with or without a BOM', async () => {
  const text = 'مهندس في الرياض\nMechanical engineer';
  assert.equal(await extractResumeFileText(new File(['\uFEFF', text], 'profile.MD')), text);
});

test('rejects invalid files before reading or uploading', async () => {
  for (const [file, code] of [
    [new File([], 'empty.pdf'), 'RESUME_FILE_EMPTY'],
    [{ size: 10 * 1024 * 1024 + 1, name: 'large.pdf' }, 'RESUME_FILE_TOO_LARGE'],
    [new File(['abc'], 'profile.doc'), 'DOC_LEGACY_UNSUPPORTED'],
    [new File(['abc'], 'profile.exe'), 'RESUME_FILE_TYPE'],
    [new File([new Uint8Array([0xff])], 'profile.txt'), 'RESUME_FILE_BINARY'],
    [new File(['a\0b'], 'profile.txt'), 'RESUME_FILE_BINARY'],
  ]) {
    await assert.rejects(() => extractResumeFileText(file), error => {
      assert.equal(error.code, code);
      assert.match(resumeExtractionErrorMessage(error), /[\u0600-\u06ff]/);
      return true;
    });
  }
});

test('the text picker and encrypted storage accept the same .text filename', async () => {
  const file = new File(['مهندسة جودة'], 'Candidate.TEXT');
  assert.equal(await extractResumeFileText(file), 'مهندسة جودة');
  assert.equal(validateFile(file, new Uint8Array(await file.arrayBuffer())).type, 'text/plain');
});

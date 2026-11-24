import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessResumeText, resumeContacts } from '../public/resume-text-quality.js';

test('contact details and broken glyphs do not make a résumé readable', () => {
  const email = 'candidate@example.org';
  for (const text of [email, email + '\n' + 'ق س ر ف . ل د ڤ ث ط '.repeat(12),
    email + '\n' + 'XQZZRB! ZXQWRH & KLMNP! '.repeat(8),
    email + '\n' + '(cid:009) � \uE305 '.repeat(20),
    email + '\n' + 'غثخق ظصغض قظظخ ضغثق صصغظ دغخث خطصغ فخذظ',
    email + '\n' + 'لا ره تل بق اذ تر سي نا '.repeat(9)]) {
    assert.equal(assessResumeText(text).readable, false);
  }
  assert.deepEqual(resumeContacts('internship 2015-2022\n' + email + '\n+966 55 123 4567'), [email, '+966 55 123 4567']);
});

test('coherent concise English and Arabic remain eligible without dates or a matching dictionary', () => {
  for (const text of ['Dental assistant trained in sterilization, patient reception and appointment scheduling.',
    'مترجمة مبتدئة أحرر تقارير عربية وأراجع النصوص وأترجم المواد التدريبية للفرق.',
    'نورة أحمد\nمساعدة إدارية\nتنظيم المواعيد وخدمة العملاء وإعداد التقارير\nExcel · إدارة الملفات',
    'Nora Saleh\nNew graduate in chemistry. Tested soil samples and prepared laboratory reports.',
    'Coordinated purchase orders and reconciled monthly inventory values. '.repeat(4) + '(cid:34)��']) {
    const quality = assessResumeText(text);
    assert.equal(quality.readable, true, text); assert.equal(quality.damaged, false);
  }
});

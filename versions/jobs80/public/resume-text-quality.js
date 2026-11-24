// Used for pasted text, PDF text layers, local OCR and server-side validation.
// Contact details can be preserved, but never count as evidence of a readable résumé body.
const CONTACT = /[\p{L}\p{N}.!#$%&'*+/=?^_`{|}~-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}|(?:https?:\/\/|www\.)\S+|(?:\+?[\d٠-٩۰-۹][\d٠-٩۰-۹ ().-]{6,}[\d٠-٩۰-۹])/giu;
const ARTIFACT = /\(?cid:\d+\)?|\uFFFD|[\uE000-\uF8FF\u0000-\u0008\u000b\u000c\u000e-\u001f]|(?:[ØÙ][\u0080-\u00BF])|(?:Ã[\u0080-\u00BF])/giu;
const WORD = /[\p{L}\p{M}]+/gu;

function isContact(value) {
  if (value.includes('@') || /^(?:https?:\/\/|www\.)/iu.test(value)) return true;
  const digits = value.match(/[\d٠-٩۰-۹]/gu) || [];
  return digits.length >= 9 && digits.length <= 15;
}

export function resumeContacts(text) {
  return (String(text || '').match(CONTACT) || []).filter(isContact);
}

export function assessResumeText(value) {
  const text = String(value || '').normalize('NFKC').replace(/[\u061c\u200b-\u200f\u202a-\u202e\u2066-\u2069\u0640]/gu, '').replace(CONTACT, value => isContact(value) ? ' ' : value);
  const artifacts = (text.match(ARTIFACT) || []).length;
  const body = text.replace(ARTIFACT, ' ').replace(/\p{M}/gu, '');
  const tokens = body.match(WORD) || [];
  const useful = [];
  let singles = 0;
  let suspect = 0;
  let usefulLetters = 0;
  let arabicWords = 0;
  let unusualArabicRuns = 0;
  for (const token of tokens) {
    if (token.length === 1) { singles++; continue; }
    const mixed = /\p{Script=Arabic}/u.test(token) && /\p{Script=Latin}/u.test(token);
    const repeated = /(\p{L})\1{3,}|(\p{L}{2,3})\2{3,}/iu.test(token);
    const garbledLatin = /^[A-Za-z]{5,}$/.test(token) && !/[aeiouy]/i.test(token);
    if (mixed || repeated || garbledLatin || token.length > 32) { suspect++; continue; }
    if (token.length >= 3 && /^\p{Script=Arabic}+$/u.test(token)) {
      arabicWords++;
      if (!/[اأإآويىهةنلتمب]/u.test(token)) unusualArabicRuns++;
    }
    useful.push(token.toLowerCase());
    usefulLetters += token.length;
  }
  const distinct = new Set(useful).size;
  const words = useful.length;
  const short = useful.filter(word => word.length === 2).length;
  const fragmentary = tokens.length >= 10 && (singles + short) > tokens.length * 0.67 && usefulLetters < tokens.length * 3;
  const symbols = (body.match(/[^\p{L}\p{M}\p{N}\s.,:;!?@+#/()&«»%٪،؛؟'’"•–—\-]/gu) || []).length;
  const visible = body.replace(/\s/gu, '').length;
  const separators = (body.match(/[^\p{L}\p{N}\s]/gu) || []).length;
  // A single short Arabic technical term can consist entirely of uncommon letters. A whole
  // paragraph dominated by those sequences is typical of a damaged character map.
  const corruptArabic = arabicWords >= 6 && unusualArabicRuns > arabicWords * 0.65;
  const broken = corruptArabic || fragmentary || (artifacts > 1 && artifacts > words * 0.23) || (suspect >= 2 && suspect > words * 0.35) ||
    (singles >= 6 && singles > words * 1.25) || (tokens.length >= 12 && distinct < 4) ||
    (visible >= 20 && (symbols > visible * 0.18 || (separators > visible * 0.34 && words < separators)));
  const score = Math.max(0, Math.min(100, Math.round(65 + Math.min(distinct, 20) -
    64 * (artifacts + suspect + singles / 2) / Math.max(1, tokens.length) - 40 * symbols / Math.max(1, visible))));
  return { readable: !broken && distinct >= 5 && words >= 7 && usefulLetters >= 32, damaged: Boolean(broken), usefulWords: words, score };
}

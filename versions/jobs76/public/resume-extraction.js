const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_XML_BYTES = 12 * 1024 * 1024;
const MAX_PDF_PAGES = 100;
const MAX_OCR_PAGES = 8;
const OCR_DIR = new URL('./vendor/resume/ocr-5.1.1/', import.meta.url).href;

const messages = {
  RESUME_FILE_EMPTY: 'الملف فارغ. اختر نسخة تحتوي على نص السيرة.',
  RESUME_FILE_TOO_LARGE: 'الحد الأقصى لحجم ملف السيرة 10 ميبيبايت. صغّر حجم الملف أو الصق نصه.',
  RESUME_FILE_TYPE: 'اختر ملف PDF أو DOCX أو TXT أو MD.',
  RESUME_FILE_BINARY: 'تعذرت قراءة الملف كنص. احفظه بترميز UTF-8 أو استخدم PDF أو DOCX.',
  DOC_LEGACY_UNSUPPORTED: 'ملف DOC القديم غير مدعوم. احفظه بصيغة DOCX أو PDF ثم أعد رفعه.',
  DOCX_INVALID: 'تعذرت قراءة مستند Word. افتحه ثم احفظ نسخة DOCX جديدة أو الصق النص.',
  DOCX_TOO_LARGE: 'يتجاوز نص مستند Word حد القراءة. ارفع نسخة أقصر أو الصق نص السيرة.',
  PDF_PASSWORD: 'ملف PDF محمي بكلمة مرور. ارفع نسخة يمكنك قراءتها دون كلمة مرور.',
  PDF_PAGE_LIMIT: 'يقبل قارئ PDF حتى 100 صفحة. ارفع صفحات السيرة فقط.',
  OCR_PAGE_LIMIT: 'يقبل التعرف الضوئي حتى 8 صفحات مصوّرة. اختر الصفحات المطلوبة أو الصق النص.',
  OCR_TIMEOUT: 'استغرقت قراءة الصفحة المصوّرة وقتاً طويلاً. جرّب ملفاً أقل دقة أو الصق النص.',
  OCR_UNREADABLE: 'تعذرت قراءة الصفحات المصوّرة. جرّب صورة أوضح داخل PDF أو الصق النص.',
};

function failure(code) {
  return Object.assign(new Error(code), { code });
}

export function resumeExtractionErrorMessage(error) {
  return messages[error?.code] || 'تعذرت قراءة السيرة. جرّب نسخة PDF أو DOCX سليمة أو الصق النص.';
}

export async function extractResumeFileText(file, onProgress = () => {}) {
  if (!file?.size) throw failure('RESUME_FILE_EMPTY');
  if (file.size > MAX_FILE_BYTES) throw failure('RESUME_FILE_TOO_LARGE');
  const extension = file.name.split('.').pop().toLowerCase();
  if (extension === 'pdf') return extractPdf(file, onProgress);
  if (extension === 'docx') return extractDocx(file);
  if (extension === 'doc') throw failure('DOC_LEGACY_UNSUPPORTED');
  if (!['txt', 'md', 'text'].includes(extension)) throw failure('RESUME_FILE_TYPE');
  const bytes = await file.arrayBuffer();
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.includes('\0')) throw failure('RESUME_FILE_BINARY');
    return text.trim();
  } catch { throw failure('RESUME_FILE_BINARY'); }
}

// Cap the inflated XML while streaming, even if the ZIP directory reports a different size.
async function readWordXml(entry, budget) {
  if (!entry) throw failure('DOCX_INVALID');
  const text = await new Promise((resolve, reject) => {
    const stream = entry.internalStream('uint8array');
    const parts = [];
    const decoder = new TextDecoder();
    stream.on('data', (chunk) => {
      budget.remaining -= chunk.byteLength;
      if (budget.remaining < 0) {
        stream.pause();
        reject(failure('DOCX_TOO_LARGE'));
        return;
      }
      parts.push(decoder.decode(chunk, { stream: true }));
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(parts.join('') + decoder.decode()));
    stream.resume();
  });
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  if (xml.querySelector('parsererror')) throw failure('DOCX_INVALID');
  return xml;
}

function wordParagraphs(xml) {
  // Exclude XML field instructions and deleted text. Keep real paragraph, tab and line boundaries.
  const word = xml.documentElement.namespaceURI;
  return Array.from(xml.getElementsByTagNameNS(word, 'p'), (paragraph) => {
    let text = '';
    for (const node of paragraph.getElementsByTagNameNS(word, '*')) {
      if (node.localName === 't') text += node.textContent;
      if (node.localName === 'tab') text += '\t';
      if (node.localName === 'br' || node.localName === 'cr') text += '\n';
    }
    return text.replace(/\u00a0/g, ' ').trim();
  }).filter(Boolean).join('\n');
}

async function extractDocx(file) {
  // The upstream browser bundle exposes JSZip on window; its script is loaded only for DOCX.
  await import('./vendor/resume/jszip-3.10.1/jszip.min.js');
  const budget = { remaining: MAX_XML_BYTES };
  try {
    const zip = await globalThis.JSZip.loadAsync(await file.arrayBuffer());
    const body = await readWordXml(zip.file('word/document.xml'), budget);
    if (body.documentElement.localName !== 'document') throw failure('DOCX_INVALID');
    const references = [...body.getElementsByTagName('*')].filter(el => ['headerReference','footerReference'].includes(el.localName));
    const before = [], after = [];
    if (references.length) {
      const relationships = await readWordXml(zip.file('word/_rels/document.xml.rels'), budget);
      const ids = new Set(references.map(el => [...el.attributes].find(attr => attr.localName === 'id')?.value));
      for (const rel of relationships.getElementsByTagNameNS('*', 'Relationship')) {
        if (!ids.has(rel.getAttribute('Id')) || rel.getAttribute('TargetMode') === 'External') continue;
        const kind = rel.getAttribute('Type')?.split('/').pop();
        if (kind !== 'header' && kind !== 'footer') continue;
        // Resolve only ZIP member names. Relationships never trigger network requests.
        const relative = new URL(rel.getAttribute('Target'), 'https://word.invalid/word/document.xml');
        if (relative.origin !== 'https://word.invalid') continue;
        const name = decodeURIComponent(relative.pathname.slice(1));
        const text = wordParagraphs(await readWordXml(zip.file(name), budget));
        (kind === 'header' ? before : after).push(text);
      }
    }
    return [...before, wordParagraphs(body), ...after].filter(Boolean).join('\n\n');
  } catch (error) { throw error?.code ? error : failure('DOCX_INVALID'); }
}

function pdfPageText(items) {
  const rows = [];
  for (const item of items) {
    const text = item.str?.trim();
    if (!text) continue;
    const [, , , , x, y] = item.transform;
    let row = rows.find(candidate => Math.abs(candidate.y - y) < 3);
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ text, x, rtl: item.dir === 'rtl' });
  }
  return rows.sort((a, b) => b.y - a.y).map(row => {
    const rtl = row.parts.some(part => part.rtl);
    return row.parts.sort((a, b) => rtl ? b.x - a.x : a.x - b.x).map(part => part.text).join(' ');
  }).join('\n');
}

async function needsOcr(page, text, ops) {
  if (/\(cid:\d+\)|�{2,}/i.test(text)) return true;
  if ((text.match(/\p{L}/gu) || []).length >= 80) return false;
  const marks = await page.getOperatorList();
  const images = [ops.paintImageXObject, ops.paintInlineImageXObject, ops.paintImageXObjectRepeat, ops.paintImageMaskXObject];
  return marks.fnArray.some(op => images.includes(op) || (!text && op === ops.constructPath));
}

async function startOcr(onProgress) {
  const { default: Tesseract } = await import('./vendor/resume/ocr-5.1.1/tesseract.esm.min.js');
  // v5 reports language/initialization failures through errorHandler as well as its returned promise.
  return new Promise((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      reject(failure('OCR_TIMEOUT'));
    }, 120_000);
    Tesseract.createWorker(['ara', 'eng'], 1, {
      workerPath: OCR_DIR + 'worker.min.js', workerBlobURL: false,
      corePath: OCR_DIR + 'tesseract-core-lstm.wasm.js', langPath: OCR_DIR,
      errorHandler: () => { clearTimeout(timer); reject(failure('OCR_UNREADABLE')); },
      logger: ({ status, progress }) => {
        if (status === 'recognizing text') onProgress(`جاري التعرّف على نص الصفحة: ${Math.round(progress * 100)}٪`);
      },
    }).then(worker => {
      clearTimeout(timer);
      if (timedOut) worker.terminate();
      else resolve(worker);
    }, error => { clearTimeout(timer); reject(error); });
  });
}

async function recognizePage(page, worker) {
  const size = page.getViewport({ scale: 1 });
  const scale = Math.min(2, Math.sqrt(4_000_000 / (size.width * size.height)), 4096 / Math.max(size.width, size.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  try {
    await page.render({ canvasContext: canvas.getContext('2d', { willReadFrequently: true }), viewport }).promise;
    let timer;
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(failure('OCR_TIMEOUT')), 120_000);
      });
      const result = await Promise.race([worker.recognize(canvas), timeout]);
      return result.data.text.trim();
    } finally { clearTimeout(timer); }
  } finally { canvas.width = canvas.height = 1; }
}

async function extractPdf(file, onProgress) {
  const pdfjs = await import('./vendor/resume/pdfjs-4.10.38/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/resume/pdfjs-4.10.38/pdf.worker.min.mjs', import.meta.url).href;
  const loading = pdfjs.getDocument({ data: await file.arrayBuffer(), isEvalSupported: false, useSystemFonts: true });
  let worker;
  try {
    const pdf = await loading.promise;
    if (pdf.numPages > MAX_PDF_PAGES) throw failure('PDF_PAGE_LIMIT');
    const parts = [];
    let ocrCount = 0;
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      try {
        const content = await page.getTextContent();
        let text = pdfPageText(content.items);
        if (await needsOcr(page, text, pdfjs.OPS)) {
          if (++ocrCount > MAX_OCR_PAGES) throw failure('OCR_PAGE_LIMIT');
          onProgress(`جاري قراءة الصفحة المصوّرة ${number} من ${pdf.numPages} بالعربية والإنجليزية...`);
          worker ??= await startOcr(onProgress);
          const recognized = await recognizePage(page, worker);
          if (recognized) {
            // Preserve readable native lines that the raster pass missed.
            const normalized = recognized.replace(/\s+/g, ' ').trim();
            const missing = text.split('\n').filter(line => line && !/[�]|\(cid:\d+\)/i.test(line) && !normalized.includes(line.replace(/\s+/g, ' ').trim()));
            text = [...missing, recognized].join('\n');
          }
        }
        if (text) parts.push(text);
      } finally { page.cleanup(); }
    }
    if (!parts.length && ocrCount) throw failure('OCR_UNREADABLE');
    return parts.join('\n\n');
  } catch (error) {
    if (error?.name === 'PasswordException') throw failure('PDF_PASSWORD');
    throw error;
  } finally {
    try { await worker?.terminate(); } finally { await loading.destroy(); }
  }
}

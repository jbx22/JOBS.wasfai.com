export function buildDocx(text, language = "") {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${text
      .split(/\r\n|[\r\n]/)
      .map((line) => docxParagraph(line, language))
      .join("\n")}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`;
  return zipStore([
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`],
    ["word/document.xml", documentXml],
  ]);
}

function docxParagraph(line, language) {
  const firstLetter = line.match(/\p{L}/u)?.[0] || "";
  const rtl = language === "ar" || (!language && /\p{Script=Arabic}/u.test(firstLetter));
  const direction = rtl ? '<w:pPr><w:bidi/><w:jc w:val="right"/></w:pPr>' : '';
  const run = rtl ? '<w:rPr><w:rtl/><w:lang w:bidi="ar-SA"/></w:rPr>' : '';
  // ECMA-376 text nodes must contain valid XML 1.0 characters.
  const escaped = line.replace(/[^\x09\x0a\x0d\x20-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return `<w:p>${direction}<w:r>${run}<w:t xml:space="preserve">${escaped || " "}</w:t></w:r></w:p>`;
}

function zipStore(entries) {
  const encoder = new TextEncoder();
  const files = entries.map(([name, content]) => ({
    name,
    nameBytes: encoder.encode(name),
    data: encoder.encode(content),
  }));
  let offset = 0;
  const localParts = [];
  const centralParts = [];
  for (const file of files) {
    const crc = crc32(file.data);
    const local = concatBytes([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc),
      u32(file.data.length), u32(file.data.length), u16(file.nameBytes.length), u16(0),
      file.nameBytes, file.data,
    ]);
    localParts.push(local);
    centralParts.push(concatBytes([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc),
      u32(file.data.length), u32(file.data.length), u16(file.nameBytes.length), u16(0),
      u16(0), u16(0), u16(0), u32(0), u32(offset), file.nameBytes,
    ]));
    offset += local.length;
  }
  const central = concatBytes(centralParts);
  return concatBytes([
    ...localParts,
    central,
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(central.length), u32(offset), u16(0),
  ]);
}

function crc32(bytes) {
  let crc = -1;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

function u16(value) {
  return new Uint8Array([value & 255, (value >>> 8) & 255]);
}

function u32(value) {
  return new Uint8Array([value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255]);
}

function concatBytes(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

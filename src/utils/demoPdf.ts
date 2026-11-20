/**
 * Deterministic minimal PDF generator for demonstration documents (client & local previews).
 * Generates a valid single-page or multi-page PDF 1.4 data URL with no external network requests.
 */
function sanitizePdfText(text: string): string {
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, ' ');
  return normalized.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function encodeBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function createDemoPdfDataUrl(title: string, linesOrPages: string[] | string[][]): string {
  const pages: string[][] =
    Array.isArray(linesOrPages[0])
      ? (linesOrPages as string[][])
      : [linesOrPages as string[]];

  const safeTitle = sanitizePdfText(title);
  const pageCount = pages.length;

  const pageRefs: string[] = [];
  const pageObjects: string[] = [];

  for (let p = 0; p < pageCount; p++) {
    const pageObjId = 4 + p * 2;
    const contentObjId = 5 + p * 2;
    pageRefs.push(`${pageObjId} 0 R`);

    const pageLines = (pages[p] || []).slice(0, 22).map((l) => sanitizePdfText(l));
    const streamOps: string[] = [
      'BT',
      '/F1 14 Tf',
      '50 760 Td',
      `(${safeTitle}) Tj`,
      '/F1 10 Tf',
      '0 -24 Td',
      `(DOCUMENT DE DEMONSTRATION - PLATEFORME GCD USMBA FES - Page ${p + 1}/${pageCount}) Tj`,
      '0 -22 Td',
    ];
    for (const line of pageLines) {
      streamOps.push(`(${line}) Tj`);
      streamOps.push('0 -16 Td');
    }
    streamOps.push('ET');
    const contentStream = streamOps.join('\n');

    pageObjects.push(
      `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contentObjId} 0 R /Resources << /Font << /F1 3 0 R >> >> >>\nendobj\n`
    );
    pageObjects.push(
      `${contentObjId} 0 obj\n<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream\nendobj\n`
    );
  }

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    `2 0 obj\n<< /Type /Pages /Kids [${pageRefs.join(' ')}] /Count ${pageCount} >>\nendobj\n`,
    '3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    ...pageObjects,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return `data:application/pdf;base64,${encodeBase64Utf8(pdf)}`;
}

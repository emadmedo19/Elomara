// Print only a snapshot of the statement, never the scrolling app or its modal.
export const statementPrintCss = `
@page { size: A4 portrait; margin: 10mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: white; color: #111827; direction: rtl; font: 9pt Arial, sans-serif; }
body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
#printable-statement { width: 100%; margin: 0; padding: 0; }
#printable-statement > div + div { margin-top: 12px; }
[data-statement-header] { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 2px solid #0f2537; padding-bottom: 10px; break-inside: avoid; }
[data-statement-header] > div:first-child { display: flex; align-items: center; gap: 10px; }
[data-statement-header] > div:last-child { text-align: left; }
img { width: 42px; height: 42px; object-fit: contain; }
h1 { font-size: 15pt; margin: 0 0 5px; color: #0f2537; }
p { margin: 4px 0; }
h3 { font-size: 10pt; margin: 0 0 6px; break-after: avoid; }
span.block { display: block; }
[data-statement-kpis] { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; text-align: center; break-inside: avoid; }
[data-statement-kpis] > div { padding: 8px 3px; border: 1px solid #d5dfe5; border-radius: 6px; background: #f8fafc; }
[data-statement-kpis] span { display: block; margin-top: 3px; }
.statement-table-scroll { width: 100%; overflow: visible; }
table { width: 100%; min-width: 0 !important; max-width: 100%; border-collapse: collapse; table-layout: fixed; direction: rtl; font-size: 8pt; overflow: visible; }
th, td { padding: 5px 3px; border: 1px solid #cbd5e1; text-align: right; overflow-wrap: anywhere; vertical-align: middle; }
thead { display: table-header-group; background: #0f2537; color: white; }
tbody { display: table-row-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
.font-bold { font-weight: bold; }
.text-teal-700, .text-emerald-700 { color: #0f766e; }
.text-rose-600 { color: #be123c; }
[data-statement-signatures] { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; text-align: center; padding-top: 12px; border-top: 1px solid #cbd5e1; break-inside: avoid; }
[data-statement-signatures] > div > span { display: block; margin-bottom: 18px; }
[data-statement-signatures] p { border-top: 1px dashed #94a3b8; padding-top: 4px; }
[data-statement-signatures] > div:last-child > div { border: 2px solid #86b9b0; border-radius: 50%; width: 65px; height: 65px; margin: auto; padding: 8px; display: flex; align-items: center; justify-content: center; color: #115e59; }
`;

export async function buildStatementPrintHtml(element: HTMLElement, title: string): Promise<string> {
  const snapshot = element.cloneNode(true) as HTMLElement;
  const images = Array.from(element.querySelectorAll('img'));
  const copies = Array.from(snapshot.querySelectorAll('img'));
  await Promise.all(images.map(async (image, index) => {
    if (!image.complete || !image.naturalWidth) await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to prepare statement logo');
    context.drawImage(image, 0, 0);
    copies[index].src = canvas.toDataURL('image/png');
    copies[index].removeAttribute('srcset');
  }));
  const output = document.implementation.createHTMLDocument(title);
  output.documentElement.lang = 'ar';
  output.documentElement.dir = 'rtl';
  const charset = output.createElement('meta');
  charset.setAttribute('charset', 'utf-8');
  output.head.prepend(charset);
  const style = output.createElement('style');
  style.textContent = statementPrintCss;
  output.head.append(style);
  output.body.append(snapshot);
  return '<!doctype html>' + output.documentElement.outerHTML;
}

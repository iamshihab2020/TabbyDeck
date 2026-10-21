import QRCode from 'qrcode';

/** QR code as a crisp SVG string (one path, 4-module quiet zone), built synchronously from the module matrix. */
export function qrSvg(text: string): string {
  const { size, data } = QRCode.create(text, { errorCorrectionLevel: 'M' }).modules;
  const q = 4, n = size + q * 2;
  let d = '';
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (data[y * size + x]) d += `M${x + q} ${y + q}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${d}" fill="#121110"/></svg>`;
}

#!/usr/bin/env node
// Post-proceso de la ciudad 3D de yoshi389111/github-profile-3d-contrib.
// Conserva SOLO la ciudad isométrica (elimina radar, tarta de lenguajes —que usa
// colores de GitHub y rompe el B/N— y textos en fuentes del sistema), deja el
// fondo transparente y recorta el lienzo al contenido.
//
// Uso: node scripts/city/mono.mjs <entrada.svg> <salida.svg>
// Sin dependencias.

import fs from 'node:fs';

const [, , input, output] = process.argv;
if (!input || !output) {
  console.error('Uso: node mono.mjs <entrada.svg> <salida.svg>');
  process.exit(1);
}

const src = fs.readFileSync(input, 'utf8');

// Geometría fija de la librería (create-svg.ts / create-3d-contrib.ts, v0.9.x)
const W = 1280, H = 850;
const dx = W / 64;
const dy = dx * Math.tan(Math.PI / 6);
const dxx = dx * 0.9, dyy = dy * 0.9;

// 1. <style> original (clases de color de las caras)
const style = (src.match(/<style>[\s\S]*?<\/style>/) || [''])[0]
  .replace(/\*\s*\{[^}]*font-family[^}]*\}/, '');
const defs = (src.match(/<defs>[\s\S]*?<\/defs>/) || [''])[0];

// 2. Primer <g> tras el rectángulo de fondo = calendario 3D
const bgEnd = src.indexOf('</rect>', src.indexOf('class="fill-bg"'));
const start = src.indexOf('<g', bgEnd);
if (bgEnd < 0 || start < 0) throw new Error('Estructura inesperada: no se encontró el calendario 3D');
const tagRe = /<(\/?)g\b[^>]*?(\/?)>/g;
tagRe.lastIndex = start;
let depth = 0, end = -1, m;
while ((m = tagRe.exec(src))) {
  if (m[1]) depth--;
  else if (!m[2]) depth++;
  if (depth === 0) { end = tagRe.lastIndex; break; }
}
if (end < 0) throw new Error('No se pudo aislar el grupo del calendario');
const city = src.slice(start, end);

// 3. Recorte: x de la primera a la última columna; y desde la barra más alta.
// Solo los grupos-barra (<g transform="translate(x y)">); los rect internos también usan translate.
const bars = [...city.matchAll(/<g transform="translate\(([-\d.]+)[ ,]+([-\d.]+)\)"/g)];
if (!bars.length) throw new Error('No se encontraron barras en el calendario');
const xs = bars.map((t) => +t[1]);
const ys = bars.map((t) => +t[2]);
const pad = 12;
const x0 = Math.floor(Math.min(...xs) - pad);
const x1 = Math.ceil(Math.max(...xs) + 2 * dxx + pad);
const y0 = Math.floor(Math.min(...ys) - dyy - pad);
const y1 = Math.ceil(H - 2 * dy + 2 * dyy + pad);
const w = x1 - x0, h = y1 - y0;

const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Contribuciones de los últimos 12 meses en forma de ciudad isométrica">
${style}
${defs}
${city}
</svg>
`;
fs.writeFileSync(output, out);
console.log(`ciudad → ${output} (${w}×${h}, ${(out.length / 1024).toFixed(0)} KB)`);

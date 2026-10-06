#!/usr/bin/env node
// Generador de estadísticas del perfil — sistema «Cinta» (B/N).
// Sin dependencias: Node ≥ 18 (fetch nativo). Texto convertido a trazos con el
// atlas de glifos `glyphs.json` (Geist / Geist Mono, OFL 1.1).
//
// Uso:
//   GITHUB_TOKEN=… node scripts/stats/generate.mjs --user Ju4nmaFd3z --out dist
//   node scripts/stats/generate.mjs --fixture datos.json --out carpeta   (sin red)
//   Opcional: --dump datos.json  (guarda los datos normalizados)
//
// Salida: stats-dark.svg y stats-light.svg

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => (a.startsWith('--') ? [...acc, [a.slice(2), arr[i + 1]]] : acc), []),
);
const USER = args.user || process.env.GITHUB_REPOSITORY_OWNER || 'Ju4nmaFd3z';
const OUT = args.out || 'dist';

// ───────────────────────── Datos ─────────────────────────
const LEVEL = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

async function fetchData(login) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('Falta GITHUB_TOKEN');
  const query = `query($login:String!){
    user(login:$login){
      login name createdAt
      followers{ totalCount }
      contributionsCollection{
        totalCommitContributions totalPullRequestContributions totalIssueContributions restrictedContributionsCount
        contributionCalendar{ totalContributions weeks{ contributionDays{ date contributionCount contributionLevel } } }
      }
      repositories(first:100, ownerAffiliations:OWNER, isFork:false, privacy:PUBLIC, orderBy:{field:PUSHED_AT, direction:DESC}){
        totalCount
        nodes{ stargazerCount forkCount languages(first:10, orderBy:{field:SIZE, direction:DESC}){ edges{ size node{ name } } } }
      }
    }
  }`;
  const res = await fetch(process.env.GITHUB_GRAPHQL || 'https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'ju4nmafd3z-profile-stats' },
    body: JSON.stringify({ query, variables: { login } }),
  });
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.errors) throw new Error('GraphQL: ' + JSON.stringify(json.errors));
  const u = json.data.user;
  const cc = u.contributionsCollection;
  const calendar = cc.contributionCalendar.weeks.flatMap((w) => w.contributionDays)
    .map((d) => ({ date: d.date, count: d.contributionCount, level: LEVEL[d.contributionLevel] ?? 0 }));
  const langs = {};
  for (const r of u.repositories.nodes) for (const e of r.languages.edges) langs[e.node.name] = (langs[e.node.name] || 0) + e.size;
  return {
    login: u.login, name: u.name, generatedAt: new Date().toISOString(),
    totalContributions: cc.contributionCalendar.totalContributions,
    commits: cc.totalCommitContributions, pullRequests: cc.totalPullRequestContributions, issues: cc.totalIssueContributions,
    calendar,
    repos: u.repositories.totalCount,
    stars: u.repositories.nodes.reduce((a, r) => a + r.stargazerCount, 0),
    forks: u.repositories.nodes.reduce((a, r) => a + r.forkCount, 0),
    followers: u.followers.totalCount,
    languages: Object.entries(langs).map(([name, size]) => ({ name, size })).sort((a, b) => b.size - a.size),
  };
}

function streaks(cal) {
  const days = [...cal].sort((a, b) => a.date.localeCompare(b.date));
  let longest = 0, run = 0;
  for (const d of days) { run = d.count > 0 ? run + 1 : 0; longest = Math.max(longest, run); }
  let i = days.length - 1;
  if (i >= 0 && days[i].count === 0) i--; // el día de hoy aún no ha terminado
  let current = 0;
  while (i >= 0 && days[i].count > 0) { current++; i--; }
  return { current, longest };
}

// ───────────────────────── Tipografía (atlas) ─────────────────────────
const ATLAS = JSON.parse(fs.readFileSync(path.join(HERE, 'glyphs.json'), 'utf8')).fonts;
const fx = (n) => { const t = n.toFixed(2).replace(/\.?0+$/, ''); return t === '-0' ? '0' : t; };

function measure(font, str, size, tracking = 0) {
  const f = ATLAS[font]; const k = size / 1000; const ch = [...str];
  let w = 0;
  ch.forEach((c, i) => {
    w += ((f.glyphs[c] || f.glyphs['?'])[0]) * k;
    if (i < ch.length - 1) w += ((f.kern[c + ch[i + 1]] || 0) * k) + tracking * size;
  });
  return w;
}
/** Devuelve el atributo d de una línea de texto. */
function textD(font, str, size, x, y, { tracking = 0, align = 'left' } = {}) {
  const f = ATLAS[font]; const k = size / 1000; const ch = [...str];
  const w = measure(font, str, size, tracking);
  let cx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  let d = '';
  ch.forEach((c, i) => {
    const g = f.glyphs[c] || f.glyphs['?'];
    if (g[1]) {
      let isX = true;
      d += g[1].replace(/-?\d+(?:\.\d+)?/g, (n) => { const v = isX ? cx + +n * k : y + +n * k; isX = !isX; return ' ' + fx(v); })
        .replace(/([MLQCZ]) /g, '$1');
    }
    cx += g[0] * k + (i < ch.length - 1 ? (f.kern[c + ch[i + 1]] || 0) * k + tracking * size : 0);
  });
  return { d, w };
}
const label = (str, x, y, cls = 'f3', align = 'left') =>
  `<path class="${cls}" d="${textD('mono400', str.toUpperCase(), 11, x, y, { tracking: 0.06, align }).d}"/>`;
const num = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

// ───────────────────────── Render ─────────────────────────
const PAL = {
  dark: { fg: '#FFFFFF', fg2: '#A3A3A3', fg3: '#737373' },
  light: { fg: '#0A0A0A', fg2: '#525252', fg3: '#8A8A8A' },
};
const W = 832, M = 40, COL = (i) => M + i * 64;
const OUT_EASE = 'cubic-bezier(.16,1,.3,1)', INOUT = 'cubic-bezier(.65,0,.35,1)';

function render(data, mode) {
  const p = PAL[mode];
  const { current, longest } = streaks(data.calendar);
  const date = new Date(data.generatedAt);
  const fecha = `${String(date.getUTCDate()).padStart(2, '0')}.${String(date.getUTCMonth() + 1).padStart(2, '0')}.${date.getUTCFullYear()}`;
  const cells = [
    { k: 'Contribuciones', v: num(data.totalContributions), s: 'Últimos 12 meses' },
    { k: 'Racha actual', v: num(current), s: current === 1 ? 'Día seguido' : 'Días seguidos' },
    { k: 'Racha máxima', v: num(longest), s: 'Días · 12 meses' },
    { k: 'Repositorios', v: num(data.repos), s: `${num(data.stars)} ${data.stars === 1 ? "estrella" : "estrellas"}` },
  ];
  let body = '';
  const hl = (x1, y1, x2, y2, d = 0) => `<line class="hl" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="animation-delay:${d}ms"/>`;

  body += `<g class="fade">${label('Resumen · últimos 12 meses', M, 20, 'f1')}${label('@' + data.login, COL(4), 20)}${label('Actualizado ' + fecha, W - M, 20, 'f3', 'right')}</g>`;
  body += hl(M, 32, W - M, 32);
  cells.forEach((c, i) => {
    const x = COL(i * 3);
    if (i) body += `<line class="vl" x1="${x - 8}" y1="44" x2="${x - 8}" y2="152" style="animation-delay:${200 + i * 80}ms"/>`;
    body += `<g class="fade" style="animation-delay:${250 + i * 90}ms">${label(c.k, x, 58)}${label(c.s, x, 146, 'f2')}</g>`;
    const n = textD('sans600', c.v, 56, x - 2, 120, { tracking: -0.04 });
    body += `<g clip-path="url(#cn)"><path class="f1 rise" style="animation-delay:${350 + i * 90}ms" d="${n.d}"/></g>`;
  });
  body += hl(M, 168, W - M, 168, 300);

  // Lenguajes
  const total = data.languages.reduce((a, l) => a + l.size, 0) || 1;
  const top = data.languages.slice(0, 5);
  const rest = total - top.reduce((a, l) => a + l.size, 0);
  const segs = [...top.map((l) => ({ name: l.name, size: l.size })), ...(rest > 0 ? [{ name: 'Otros', size: rest, other: true }] : [])];
  const OP = [1, 0.72, 0.5, 0.32, 0.18];
  body += `<g class="fade" style="animation-delay:500ms">${label('Lenguajes · tamaño de código en repos propios', M, 194)}${label(`Top ${top.length}`, W - M, 194, 'f3', 'right')}</g>`;
  const gap = 3, barW = W - 2 * M - gap * (segs.length - 1);
  let x = M;
  const colW = (W - 2 * M) / segs.length;
  segs.forEach((s, i) => {
    const w = Math.max(2, (s.size / total) * barW);
    const style = `animation-delay:${600 + i * 90}ms`;
    body += s.other
      ? `<rect class="seg other" x="${fx(x + 0.5)}" y="208.5" width="${fx(Math.max(1, w - 1))}" height="9" style="${style}"/>`
      : `<rect class="seg" x="${fx(x)}" y="208" width="${fx(w)}" height="10" fill="${p.fg}" fill-opacity="${OP[i]}" style="${style}"/>`;
    x += w + gap;
    const lx = M + i * colW;
    const pct = ((s.size / total) * 100).toFixed(1).replace('.', ',') + ' %';
    body += `<g class="fade" style="animation-delay:${800 + i * 70}ms">`;
    body += s.other
      ? `<rect x="${fx(lx + 0.5)}" y="238.5" width="7" height="7" fill="none" stroke="${p.fg}" stroke-opacity=".5"/>`
      : `<rect x="${fx(lx)}" y="238" width="8" height="8" fill="${p.fg}" fill-opacity="${OP[i]}"/>`;
    body += `<path class="f1" d="${textD('sans400', s.name, 14, lx + 14, 246).d}"/>`;
    body += label(pct, lx + 14, 264, 'f3');
    body += '</g>';
  });
  const H = 288;

  const css = `<style>
.f1{fill:${p.fg}}.f2{fill:${p.fg2}}.f3{fill:${p.fg3}}
.hl,.vl{stroke:${p.fg};stroke-opacity:.18;stroke-width:1;vector-effect:non-scaling-stroke;transform-box:fill-box}
.hl{transform-origin:0 50%;animation:gx 1200ms ${INOUT} both}
.vl{transform-origin:50% 0;animation:gy 1000ms ${INOUT} both}
.fade{animation:fade 800ms ${OUT_EASE} both}
.rise{animation:rise 1100ms ${OUT_EASE} both}
.seg{transform-box:fill-box;transform-origin:0 50%;animation:gx 1100ms ${OUT_EASE} both}
.other{fill:none;stroke:${p.fg};stroke-opacity:.5;stroke-width:1;vector-effect:non-scaling-stroke}
@keyframes gx{from{transform:scaleX(0)}}
@keyframes gy{from{transform:scaleY(0)}}
@keyframes fade{from{opacity:0;transform:translateY(6px)}}
@keyframes rise{from{transform:translateY(64px)}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}
</style>`;
  const desc = `${data.totalContributions} contribuciones en los últimos 12 meses; racha actual ${current} días, máxima ${longest}; ${data.repos} repositorios públicos y ${data.stars} estrellas. Lenguajes: ${segs.map((s) => `${s.name} ${((s.size / total) * 100).toFixed(1)}%`).join(', ')}.`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" fill="none" role="img" aria-labelledby="t d">
<title id="t">Actividad en GitHub de ${data.name || data.login}</title>
<desc id="d">${desc.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</desc>
${css}
<defs><clipPath id="cn"><rect x="0" y="64" width="${W}" height="66"/></clipPath></defs>
${body}
</svg>
`;
}

// ───────────────────────── Main ─────────────────────────
const data = args.fixture ? JSON.parse(fs.readFileSync(args.fixture, 'utf8')) : await fetchData(USER);
if (args.dump) fs.writeFileSync(args.dump, JSON.stringify(data, null, 1));
fs.mkdirSync(OUT, { recursive: true });
for (const mode of ['dark', 'light']) {
  const file = path.join(OUT, `stats-${mode}.svg`);
  fs.writeFileSync(file, render(data, mode));
  console.log('estadísticas →', file);
}

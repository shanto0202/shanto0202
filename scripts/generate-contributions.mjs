import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const username = process.env.GITHUB_USER || 'shanto0202';

if (!/^[A-Za-z0-9-]{1,39}$/.test(username)) {
  throw new Error(`Invalid GitHub username: ${username}`);
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(
  process.env.OUTPUT_PATH || resolve(scriptDirectory, '..', 'assets', 'contributions.svg'),
);
const endpoint = `https://github-contributions-api.jogruber.de/v4/${username}?y=last`;

const response = await fetch(endpoint, {
  headers: { Accept: 'application/json', 'User-Agent': `${username}-profile-readme` },
});

if (!response.ok) {
  throw new Error(`Contribution API returned HTTP ${response.status}`);
}

const payload = await response.json();

if (!Array.isArray(payload.contributions) || payload.contributions.length === 0) {
  throw new Error('Contribution API returned no calendar data');
}

const contributions = payload.contributions
  .map(({ date, count, level }) => ({
    date: String(date),
    count: Number(count) || 0,
    level: Math.min(4, Math.max(0, Number(level) || 0)),
  }))
  .sort((left, right) => left.date.localeCompare(right.date));

const parseDate = (date) => new Date(`${date}T00:00:00Z`);
const toDateKey = (date) => date.toISOString().slice(0, 10);
const addDays = (date, days) => {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
};
const escapeXml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const contributionByDate = new Map(contributions.map((day) => [day.date, day]));
const firstDate = parseDate(contributions[0].date);
const lastDate = parseDate(contributions.at(-1).date);
const calendarStart = addDays(firstDate, -firstDate.getUTCDay());
const calendarEnd = addDays(lastDate, 6 - lastDate.getUTCDay());
const weeks = [];

for (let weekStart = calendarStart; weekStart <= calendarEnd; weekStart = addDays(weekStart, 7)) {
  const week = [];
  for (let weekday = 0; weekday < 7; weekday += 1) {
    const date = addDays(weekStart, weekday);
    const key = toDateKey(date);
    const contribution = contributionByDate.get(key);
    week.push({
      date: key,
      count: contribution?.count ?? 0,
      level: contribution?.level ?? 0,
      inRange: date >= firstDate && date <= lastDate,
    });
  }
  weeks.push(week);
}

const width = 980;
const height = 264;
const gridX = 70;
const gridY = 91;
const cellSize = 12;
const gap = 3;
const step = cellSize + gap;
const gridWidth = weeks.length * step - gap;
const total = contributions.reduce((sum, day) => sum + day.count, 0);
const colors = ['#151E2A', '#123B52', '#0E7490', '#14B8A6', '#5EEAD4'];
const monthFormatter = new Intl.DateTimeFormat('en', { month: 'short', timeZone: 'UTC' });

const cells = [];
for (let weekIndex = 0; weekIndex < weeks.length; weekIndex += 1) {
  for (let weekday = 0; weekday < 7; weekday += 1) {
    const day = weeks[weekIndex][weekday];
    const x = gridX + weekIndex * step;
    const y = gridY + weekday * step;
    const fill = day.inRange ? colors[day.level] : '#101721';
    const opacity = day.inRange ? 1 : 0.42;
    cells.push(
      `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="3" fill="${fill}" stroke="#263445" stroke-opacity="${day.level === 0 ? '.65' : '.28'}" opacity="${opacity}"><title>${escapeXml(day.date)}: ${day.count} contribution${day.count === 1 ? '' : 's'}</title></rect>`,
    );
  }
}

const months = [];
let previousMonth = '';
let previousMonthX = -100;
for (let weekIndex = 0; weekIndex < weeks.length; weekIndex += 1) {
  const visibleDays = weeks[weekIndex].filter((day) => day.inRange);
  if (visibleDays.length === 0) continue;
  const firstVisibleDate = parseDate(visibleDays[0].date);
  const monthKey = `${firstVisibleDate.getUTCFullYear()}-${firstVisibleDate.getUTCMonth()}`;
  const x = gridX + weekIndex * step;
  if (monthKey !== previousMonth && x - previousMonthX >= 34) {
    months.push(`<text x="${x}" y="77" fill="#94A3B8" font-size="12">${monthFormatter.format(firstVisibleDate)}</text>`);
    previousMonth = monthKey;
    previousMonthX = x;
  }
}

const updated = new Intl.DateTimeFormat('en', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
}).format(new Date());

const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(username)} GitHub contribution calendar</title>
  <desc id="desc">${total} public contributions across the last twelve months.</desc>
  <defs>
    <linearGradient id="background" x1="0" y1="0" x2="${width}" y2="${height}" gradientUnits="userSpaceOnUse">
      <stop stop-color="#0B0F17"/><stop offset=".55" stop-color="#0D1623"/><stop offset="1" stop-color="#0A111B"/>
    </linearGradient>
    <linearGradient id="accent" x1="44" y1="0" x2="1156" y2="0" gradientUnits="userSpaceOnUse">
      <stop stop-color="#38BDF8"/><stop offset=".48" stop-color="#2DD4BF"/><stop offset="1" stop-color="#F59E0B"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" rx="22" fill="url(#background)"/>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="21" stroke="#263445"/>
  <rect x="35" y="28" width="5" height="25" rx="2.5" fill="url(#accent)"/>
  <text x="52" y="46" fill="#E2E8F0" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="16" font-weight="700" letter-spacing="1.2">CONTRIBUTION SIGNAL</text>
  <text x="52" y="65" fill="#94A3B8" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="11" letter-spacing=".7">LAST 12 MONTHS / PUBLIC ACTIVITY</text>
  <text x="944" y="46" text-anchor="end" fill="#F8FAFC" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="23" font-weight="700">${total}</text>
  <text x="944" y="64" text-anchor="end" fill="#94A3B8" font-family="Segoe UI, Inter, Arial, sans-serif" font-size="10" letter-spacing=".8">CONTRIBUTIONS</text>
  <g font-family="Segoe UI, Inter, Arial, sans-serif">${months.join('')}
    <text x="56" y="116" text-anchor="end" fill="#94A3B8" font-size="11">Mon</text>
    <text x="56" y="146" text-anchor="end" fill="#94A3B8" font-size="11">Wed</text>
    <text x="56" y="176" text-anchor="end" fill="#94A3B8" font-size="11">Fri</text>
    ${cells.join('')}
    <text x="${gridX}" y="233" fill="#94A3B8" font-size="10" letter-spacing=".6">UPDATED ${escapeXml(updated.toUpperCase())}</text>
    <g transform="translate(${Math.min(gridX + gridWidth - 188, 770)} 221)">
      <text x="0" y="11" fill="#94A3B8" font-size="10">LESS</text>
      ${colors.map((color, index) => `<rect x="${38 + index * 20}" y="0" width="13" height="13" rx="3" fill="${color}" stroke="#263445" stroke-opacity=".55"/>`).join('')}
      <text x="146" y="11" fill="#94A3B8" font-size="10">MORE</text>
    </g>
  </g>
  <rect x="35" y="247" width="910" height="2" rx="1" fill="url(#accent)" opacity=".65"/>
</svg>
`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, svg, 'utf8');
console.log(`Generated ${outputPath} with ${weeks.length} weeks and ${total} contributions.`);

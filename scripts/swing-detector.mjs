// Detects pairs where all 3 layers (Macro · Kỹ thuật · COT) agree (3/3
// confluence) and sends a Telegram alert — but only for NEW or CHANGED
// signals, by diffing against data/alert-state.json. This means the user
// gets pinged when something actually flips, not every single day.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dotsAgree } from './lib/scoring.mjs';
import { sendTelegram } from './lib/telegram.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dataPath = path.join(root, 'data/dashboard.json');
const statePath = path.join(root, 'data/alert-state.json');

function loadState() {
  try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); }
  catch { return {}; }
}

function allPairs(data) {
  return [...data.pairs.usd, ...data.pairs.cross];
}

async function main() {
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const prevState = loadState();
  const newState = {};
  const messages = [];

  for (const p of allPairs(data)) {
    const direction = dotsAgree(p.dots); // 'up' | 'down' | null
    newState[p.code] = direction;
    const prevDirection = prevState[p.code] ?? null;

    if (direction && direction !== prevDirection) {
      const arrow = direction === 'up' ? '📈 TĂNG' : '📉 GIẢM';
      messages.push(
        `<b>🎯 ${p.code}</b> — Confluence 3/3 MỚI: ${arrow}\n` +
        `Giá: ${p.price} · ATR: ${p.atr}\n` +
        `${p.signalBox || ''}`
      );
    } else if (!direction && prevDirection) {
      messages.push(`<b>⚠️ ${p.code}</b> — Confluence 3/3 đã VỠ (không còn đồng thuận cả 3 lớp). Giá hiện tại: ${p.price}`);
    }
  }

  if (messages.length === 0) {
    console.log('swing-detector: no new confluence changes today.');
  } else {
    const header = `📡 <b>FX Swing Alert</b> — ${data.meta.dateLabel || new Date().toLocaleDateString('vi-VN')}\n\n`;
    // Telegram messages cap ~4096 chars; batch if needed.
    let batch = header;
    for (const m of messages) {
      if ((batch + m).length > 3800) { await sendTelegram(batch); batch = ''; }
      batch += m + '\n\n';
    }
    if (batch.trim()) await sendTelegram(batch);
  }

  fs.writeFileSync(statePath, JSON.stringify(newState, null, 2));
}

main().catch(e => {
  console.error('swing-detector.mjs failed:', e);
  process.exit(1);
});

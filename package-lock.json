// Renders docs/index.html from data/dashboard.json.
// Layout/CSS/JS never change here — only data changes. This is what keeps
// LLM update costs low: the model only ever has to produce/patch JSON, never HTML.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { scoreColorClass, scoreBarColor, zClass } from './lib/scoring.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

const data = JSON.parse(fs.readFileSync(path.join(root, 'data/dashboard.json'), 'utf8'));
const style = fs.readFileSync(path.join(root, 'templates/style.css.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'templates/script.js.html'), 'utf8');
const methodology = fs.readFileSync(path.join(root, 'templates/methodology.html'), 'utf8');

const esc = (s) => (s ?? '').toString();

function dotHtml(dir) {
  if (dir === 'up') return '<span class="dot-up">↑</span>';
  if (dir === 'down') return '<span class="dot-dn">↓</span>';
  return '<span class="dot-nt">—</span>';
}
function dotsHtml(dots) {
  return `<div class="dots">${(dots || []).map(dotHtml).join('')}</div>`;
}

// ---------- HEADER ----------
function renderHeader() {
  const m = data.meta;
  return `
<div class="header-sub">${esc(m.subtitle)}</div>
<div class="header-title">${esc(m.title)}</div>
<div class="header-desc">${esc(m.desc)}</div>
<div class="badges">
  <span class="badge badge-gray">${esc(m.badgeGray)}</span>
  <span class="badge badge-fire">${esc(m.badgeFire)}</span>
</div>`;
}

// ---------- MARKET BAR ----------
function renderMarketBar() {
  const items = data.marketBar.map(i => `<div class="mitem"><span>${esc(i.label)} </span><b>${esc(i.value)}</b></div>`).join('\n  ');
  return `<div class="mbar">\n  ${items}\n</div>`;
}

// ---------- NARRATIVE ----------
const TAG_STYLES = {
  'CHỦ ĐẠO': 'background:#78350f;color:#fef08a',
  'ĐỊA CHÍNH TRỊ': 'background:#1a2a1a;color:#86efac',
  'NGẮN HẠN': 'background:#1e3a5f;color:#93c5fd',
};
function tagStyle(tag) {
  const key = Object.keys(TAG_STYLES).find(k => tag.includes(k));
  return TAG_STYLES[key] || 'background:#27272a;color:#a1a1aa';
}
function impactClass(type) {
  return type === 'pos' ? 'impact-pos' : type === 'neg' ? 'impact-neg' : 'impact-neu';
}
function renderNarrative() {
  const n = data.narrative;
  const themes = n.themes.map(t => `
    <div class="narrative-theme">
      <div class="narrative-theme-title">
        <span style="${tagStyle(t.tag)};padding:1px 6px;border-radius:4px;font-size:10px">${esc(t.tag)}</span>
        ${esc(t.title)}
      </div>
      <div class="narrative-theme-body">${esc(t.body)}</div>
      <div class="narrative-impact">
        ${t.impacts.map(i => `<span class="impact-tag ${impactClass(i.type)}">${esc(i.text)}</span>`).join('\n        ')}
      </div>
    </div>`).join('\n');

  const bg = n.background.map(b => `
      <div style="background:#27272a;border-radius:8px;padding:8px 10px">
        <div style="font-size:10px;font-weight:600;color:#facc15;margin-bottom:3px">${esc(b.title)}</div>
        <div style="font-size:11px;color:#a1a1aa">${esc(b.body)}</div>
      </div>`).join('');

  return `
<div class="narrative-panel">
  <div class="narrative-header">
    <div class="narrative-title">📡 Market Narrative — Câu chuyện đang chi phối thị trường</div>
    <div class="narrative-updated">Cập nhật: ${esc(n.updated)}</div>
  </div>
  <div class="narrative-body">
${themes}
    <div class="narrative-divider">🌐 Background Themes — Luôn hiện diện</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${bg}
    </div>
  </div>
</div>`;
}

// ---------- HEATMAP ----------
function renderHeatmap() {
  const sorted = [...data.currencies].sort((a, b) => b.score - a.score);
  const cards = sorted.map((c, idx) => {
    const cls = scoreColorClass(c.score);
    const st = stanceStyleFor(c);
    const arrow = c.rankArrow || '';
    return `
      <div class="hm-card">
        <div class="hm-flag">${esc(c.flag)}</div><div class="hm-code">${esc(c.code)}</div>
        <div class="hm-score ${cls}">${c.score}</div>
        <div class="hm-stance" style="${st.style}">${esc(st.short)}</div>
        <div class="hm-rank">#${idx + 1}${arrow ? ' ' + arrow : ''}</div>
      </div>`;
  }).join('');
  return `
<div class="section" id="sec-heatmap">
  <button class="section-btn open" onclick="toggle('heatmap','sec-heatmap')">
    <div class="section-btn-inner">🔢 Stance Ranking — Hawkish → Dovish</div>
    <span class="chevron">▼</span>
  </button>
  <div class="section-content" id="heatmap">
    <div class="heatmap">${cards}
    </div>
    <div style="margin-top:12px;font-size:11px;color:#52525b">
      Score = Macro × 0.70 + Yếu tố phụ × 0.30 · <span class="green">≥7.5</span> Hawkish mạnh · <span class="yellow">5.5–7.4</span> N-Hawk · <span style="color:#93c5fd">4.5–5.4</span> Neutral · <span class="red">&lt;4.5</span> Dovish · 8 đồng tiền
    </div>
  </div>
</div>`;
}

function stanceStyleFor(c) {
  // Use explicit stanceStyle/short label if present in data, else derive from score.
  if (c.stanceStyle) {
    const shortLabel = (c.stance || '').split('(')[0].trim();
    return { style: c.stanceStyle, short: shortLabel };
  }
  return { style: 'background:#27272a;color:#a1a1aa', short: 'Neutral' };
}

// ---------- SPOTLIGHT ----------
function renderSpotlight() {
  const conf = data.spotlight.confluence.map(s => `
    <div style="background:#0a0a0a;border-radius:8px;padding:10px 12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-weight:700;color:#fafafa;font-size:13px">${esc(s.pair)}</span>
        ${dotsHtml(s.dots)}
      </div>
      <div style="font-size:11px;color:#71717a">${esc(s.text)}</div>
    </div>`).join('');
  const div = data.spotlight.divergence.map(s => `
    <div style="background:#0a0a0a;border-radius:8px;padding:10px 12px;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-weight:700;color:#fafafa;font-size:13px">${esc(s.pair)}</span>
        ${dotsHtml(s.dots)}
      </div>
      <div style="font-size:11px;color:#71717a">${esc(s.text)}</div>
    </div>`).join('');
  return `
<div class="section" id="sec-spot">
  <button class="section-btn open" onclick="toggle('spot','sec-spot')">
    <div class="section-btn-inner">🎯 Pairs Spotlight — Confluence & Divergence</div>
    <span class="chevron">▼</span>
  </button>
  <div class="section-content" id="spot">
    <div style="font-size:12px;color:#71717a;margin-bottom:10px">✅ = 3/3 lớp đồng thuận · ⚠️ = phân kỳ thận trọng · [Macro · Kỹ thuật · COT]</div>
    <div style="font-size:12px;font-weight:600;color:#4ade80;margin-bottom:8px">✅ Confluence Mạnh Nhất (3/3)</div>
    ${conf}
    <div style="font-size:12px;font-weight:600;color:#facc15;margin-bottom:8px;margin-top:12px">⚠️ Phân Kỳ — Cần Thận Trọng</div>
    ${div}
  </div>
</div>`;
}

// ---------- PAIRS TABLE ----------
function renderPairRow(p) {
  const bg = p.highlight ? ' style="background:rgba(74,222,128,0.05)"' : '';
  const spread = p.spreadTag ? ` <span class="spread-tag ${spreadClass(p.spreadTag)}">${esc(p.spreadTag)}</span>` : '';
  return `
      <div class="pair-row">
        <button class="pair-btn"${bg} onclick="togglePair('${p.id}')">
          <span class="pair-code">${esc(p.code)}</span><span class="pair-price">${esc(p.price)}</span>
          <span class="pair-atr">${esc(p.atr)}</span>
          ${dotsHtml(p.dots)}
          <span style="color:#71717a;font-size:12px">▼</span>
        </button>
        <div class="pair-detail" id="${p.id}">
          <div><span class="pair-detail-label">Cấu trúc: </span>${esc(p.structure)}</div>
          <div style="margin-top:5px"><span class="pair-detail-label">Bond Yield: </span>${esc(p.bondYield)}${spread}</div>
          <div class="signal-box">${esc(p.signalBox)}</div>
        </div>
      </div>`;
}
function spreadClass(tag) {
  if (tag.includes('Giãn')) return 'spread-widen';
  if (tag.includes('Thu hẹp')) return 'spread-narrow';
  return 'spread-stable';
}
function renderPairsTable() {
  const usdRows = data.pairs.usd.map(renderPairRow).join('');
  const groups = [...new Set(data.pairs.cross.map(p => p.group))];
  const crossRows = groups.map(g => {
    const rows = data.pairs.cross.filter(p => p.group === g).map(renderPairRow).join('');
    return `
      <div style="font-size:11px;font-weight:600;color:#71717a;padding:6px 12px 2px;background:#0a0a0a">${esc(g)} CROSSES</div>${rows}`;
  }).join('');

  return `
<div class="section" id="sec-pairs">
  <button class="section-btn" onclick="toggle('pairs','sec-pairs')">
    <div class="section-btn-inner">📊 Bảng Cặp Tiền — Click để mở chi tiết</div>
    <span class="chevron">▼</span>
  </button>
  <div class="section-content" id="pairs" style="display:none">
    <div class="tab-bar">
      <button class="tab-btn tab-active" id="tab-usd" onclick="switchTab('usd')">USD Pairs</button>
      <button class="tab-btn tab-inactive" id="tab-cross" onclick="switchTab('cross')">Cross Pairs</button>
    </div>
    <div style="font-size:11px;color:#52525b;margin-bottom:8px">↑ Bullish base · ↓ Bearish base · — Neutral &nbsp;|&nbsp; [Macro · Kỹ thuật · COT] · Click dòng để xem chi tiết</div>
    <div id="usd-pairs">${usdRows}
    </div>
    <div id="cross-pairs" style="display:none">
      <div style="font-size:11px;color:#52525b;margin-bottom:6px">✅ = 3/3 · ⚠️ = phân kỳ · Yield spread: <span class="spread-tag spread-widen">↗ Giãn rộng</span> = nghiêng base ccy · <span class="spread-tag spread-narrow">↘ Thu hẹp</span> = bất lợi base ccy · <span class="spread-tag spread-stable">→ Ổn định</span></div>${crossRows}
    </div>
  </div>
</div>`;
}

// ---------- COT ----------
function renderCot() {
  const cards = data.cot.map(c => {
    const groups = c.groups.map(g => `
        <div class="cot-group-box">
          <div class="cot-group-label">${esc(g.label)}</div>
          <div class="cot-group-net ${g.net.trim().startsWith('−') || g.net.trim().startsWith('-') ? 'flow-short' : 'flow-long'}">${esc(g.net)}</div>
          <div class="cot-group-flow ${esc(g.flowClass)}">${esc(g.flow)}</div>
        </div>`).join('');
    return `
    <div class="cot-card">
      <div class="cot-head">
        <span style="font-size:16px">${esc(c.flag)}</span>
        <span style="font-weight:700;color:#fafafa;font-size:13px">${esc(c.code)}</span>
        <span style="font-size:11px;background:#27272a;color:#a1a1aa;border-radius:4px;padding:2px 7px">${esc(c.tag)}</span>
        <span class="cot-zscore ${esc(c.zClass)}">${esc(c.zscore)}</span>
      </div>
      <div class="cot-group-row">${groups}
      </div>
      <div class="cot-buyside">${esc(c.buyside)}</div>
    </div>`;
  }).join('');
  const cutoff = data.cotMeta && data.cotMeta.cutoff ? ` (cutoff ${esc(data.cotMeta.cutoff)})` : '';
  return `
<div class="section" id="sec-cot">
  <button class="section-btn" onclick="toggle('cot','sec-cot')">
    <div class="section-btn-inner">👥 COT — CFTC Financial TFF: Dealer · Asset Manager · Leveraged Funds${cutoff}</div>
    <span class="chevron">▼</span>
  </button>
  <div class="section-content" id="cot" style="display:none">
    ${cards}
  </div>
</div>`;
}

// ---------- RISK CALENDAR ----------
function renderRiskCalendar() {
  const rows = (data.riskCalendar || []).map((r, i) => {
    const border = i === (data.riskCalendar.length - 1) ? ' style="border-bottom:none"' : '';
    const badgeClass = r.importance === 'high' ? 'risk-high' : 'risk-med';
    const badgeText = r.importance === 'high' ? '🔴 Cao' : '🟡 TB';
    return `    <div class="risk-row"${border}><div class="risk-date">${esc(r.date)}</div><div class="risk-event">${esc(r.event)}</div><div class="${badgeClass}">${badgeText}</div></div>`;
  }).join('\n');
  return `
<div class="section" id="sec-risk">
  <button class="section-btn" onclick="toggle('risk','sec-risk')">
    <div class="section-btn-inner">🔴 Lịch Rủi Ro Cao — Thận Trọng Khi Mở Lệnh Mới</div>
    <span class="chevron">▼</span>
  </button>
  <div class="section-content" id="risk" style="display:none">
${rows}
  </div>
</div>`;
}

// ---------- CURRENCY CARDS ----------
function renderUpcoming(list) {
  return list.map(e => `      <div><span class="upcoming-date">${esc(e.date)}</span>${esc(e.text)}</div>`).join('\n');
}
function renderHistory(list) {
  return list.map(h => `      <div class="history-item"><span class="history-date">${esc(h.date)}:</span> <span class="history-score ${scoreColorClass(parseFloat(h.score))}">${esc(h.score)}</span> — ${esc(h.note)}</div>`).join('\n');
}
function renderMetaGrid(list) {
  if (!list || !list.length) return '';
  return `
    <div class="meta-grid">
      ${list.map(m => `<div class="meta-box"><div class="meta-label">${esc(m.label)}</div><div class="meta-val">${esc(m.val)}</div><div class="meta-note">${esc(m.note)}</div></div>`).join('\n      ')}
    </div>`;
}
function renderCurrencyCard(c) {
  const id = c.code.toLowerCase();
  const cls = scoreColorClass(c.score);
  const barColor = scoreBarColor(c.score);
  const summary = c.summaryLines.map((l, i) => {
    const [label, ...rest] = l.split(':');
    const val = rest.join(':').trim();
    const style = i === 0 ? ' class="cur-rate"' : ' style="font-size:12px;color:#a1a1aa;margin-top:5px"';
    return `    <div${style}><span style="color:#71717a">${esc(label)}: </span>${i === 0 ? `<b style="color:#e4e4e7">${esc(val)}</b>` : esc(val)}</div>`;
  }).join('\n');

  const secondary = c.secondaryFactor ? `
    <div class="secondary-box">
      <div class="secondary-title">🔍 ${esc(c.secondaryFactor.title)}<span class="secondary-score">${esc(c.secondaryFactor.score)}</span></div>
      <div class="secondary-text">${esc(c.secondaryFactor.text)}</div>
    </div>` : '';

  return `
<div class="cur-card">
  <button class="cur-head" onclick="toggleCur('${id}')">
    <span class="cur-flag">${esc(c.flag)}</span>
    <div class="cur-info">
      <div><span class="cur-code">${esc(c.code)}</span><span class="cur-stance" style="${esc(c.stanceStyle)}">${esc(c.stance)}</span></div>
      <div class="cur-bank">${esc(c.bank)}${c.governor ? ' · ' + esc(c.governor) : ''}</div>
    </div>
    <div class="cur-scores">
      <div class="cur-main-score ${cls}">${c.score}</div>
      <div class="cur-sub-scores">M:${c.macroScore} S:${c.secondaryScore}</div>
      <div class="score-bar"><div class="score-bar-fill" style="width:${Math.round(c.score * 10)}%;background:${barColor}"></div></div>
    </div>
    <span style="color:#71717a;font-size:12px;margin-left:6px">▼</span>
  </button>
  <div class="cur-summary">
${summary}
  </div>
  <div class="cur-body" id="${id}">
    <div class="cur-section"><div class="cur-section-title">📋 Narrative</div>
    <div class="cur-text">${esc(c.narrative)}</div></div>
    <div class="cur-section"><div class="cur-section-title">🗣 Forward Guidance</div>
    <div class="cur-text">${esc(c.forwardGuidance)}</div></div>
    <div class="event-box"><div class="event-label">⚡ Sự kiện thay đổi gần nhất</div>
    <div class="event-text">${esc(c.latestEvent)}</div></div>
    <div class="cur-section"><div class="cur-section-title">📅 Upcoming Events</div>
    <div style="font-size:12px;color:#a1a1aa">
${renderUpcoming(c.upcomingEvents)}
    </div></div>${secondary}
    <div class="cur-section"><div class="cur-section-title">📈 Score History</div>
    <div class="history-list">
${renderHistory(c.scoreHistory)}
    </div></div>${renderMetaGrid(c.metaGrid)}
  </div>
</div>`;
}
function renderCurrencyCards() {
  // preserve the canonical G8+NZD display order
  const order = ['AUD', 'USD', 'EUR', 'JPY', 'GBP', 'CHF', 'CAD', 'NZD'];
  const byCode = Object.fromEntries(data.currencies.map(c => [c.code, c]));
  return order.filter(o => byCode[o]).map(o => renderCurrencyCard(byCode[o])).join('\n');
}

// ---------- ASSEMBLE ----------
function render() {
  const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>G8+NZD Macro FX Dashboard — ${esc(data.meta.dateLabel)}</title>
${style}
</head>
<body>
<div class="wrap">
<!-- HEADER -->${renderHeader()}
<!-- MARKET BAR -->
${renderMarketBar()}
<!-- MARKET NARRATIVE -->${renderNarrative()}
<!-- HEATMAP -->${renderHeatmap()}
<!-- SPOTLIGHT -->${renderSpotlight()}
<!-- PAIRS TABLE -->${renderPairsTable()}
<!-- COT -->${renderCot()}
<!-- RISK CALENDAR -->${renderRiskCalendar()}
<!-- CURRENCY CARDS -->
${renderCurrencyCards()}
${methodology}
<div class="footer">Không phải lời khuyên đầu tư · Dữ liệu tổng hợp từ nguồn công khai · ${esc(data.meta.sources)} · ${esc(data.meta.dateLabel)}</div>
</div><!-- /wrap -->
${script}
</body>
</html>`;
  const outDir = path.join(root, 'docs');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  console.log('Rendered docs/index.html (' + html.length + ' bytes)');
}

render();

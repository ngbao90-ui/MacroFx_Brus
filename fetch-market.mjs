// One-time extraction: parses source.html (the original hand-built dashboard)
// into data/dashboard.json. This is only used to bootstrap the initial dataset;
// after that, data/dashboard.json is the single source of truth and is updated
// by scripts/llm-update.mjs + scripts/fetch-market.mjs instead.
import * as cheerio from 'cheerio';
import fs from 'fs';

const html = fs.readFileSync(new URL('../reference/original-dashboard.html', import.meta.url), 'utf8');
const $ = cheerio.load(html);
const text = (el) => $(el).text().trim().replace(/\s+/g, ' ');

// ---------- META ----------
const badgeGray = text($('.badge-gray').get(0));
const badgeFire = text($('.badge-fire').get(0));
const dateMatch = badgeGray.match(/(\d{2}\/\d{2}\/\d{4})/);
const meta = {
  title: text('.header-title'),
  subtitle: text('.header-sub'),
  desc: text('.header-desc'),
  dateLabel: dateMatch ? dateMatch[1] : '',
  badgeGray,
  badgeFire,
  sources: 'FMP · TradingView · Tradingster',
};

// ---------- MARKET BAR ----------
const marketBar = [];
$('.mbar .mitem').each((_, el) => {
  const label = text($(el).find('span').get(0)).trim();
  const value = text($(el).find('b').get(0)).trim();
  marketBar.push({ label, value });
});

// ---------- NARRATIVE ----------
const themes = [];
$('.narrative-theme').each((_, el) => {
  const tagEl = $(el).find('.narrative-theme-title span').first();
  const tag = text(tagEl);
  const fullTitle = text($(el).find('.narrative-theme-title'));
  const title = fullTitle.replace(tag, '').trim();
  const body = text($(el).find('.narrative-theme-body'));
  const impacts = [];
  $(el).find('.impact-tag').each((__, t) => {
    const cls = $(t).attr('class') || '';
    let type = 'neu';
    if (cls.includes('impact-pos')) type = 'pos';
    else if (cls.includes('impact-neg')) type = 'neg';
    impacts.push({ type, text: text(t) });
  });
  themes.push({ tag, title, body, impacts });
});
const background = [];
$('.narrative-divider').nextAll().first().find('> div').each((_, el) => {
  const title = text($(el).find('div').get(0));
  const body = text($(el).find('div').get(1));
  background.push({ title, body });
});
const narrative = {
  updated: text('.narrative-updated').replace('Cập nhật:', '').trim(),
  themes,
  background,
};

// ---------- HEATMAP (rank order comes from here; full currency detail comes from .cur-card) ----------
const heatmapOrder = [];
$('.hm-card').each((_, el) => {
  const code = text($(el).find('.hm-code'));
  const rank = text($(el).find('.hm-rank'));
  heatmapOrder.push({ code, rank });
});

// ---------- CURRENCIES ----------
const currencies = [];
$('.cur-card').each((_, card) => {
  const code = text($(card).find('.cur-code'));
  const flag = text($(card).find('.cur-flag'));
  const stance = text($(card).find('.cur-stance'));
  const stanceStyle = $(card).find('.cur-stance').attr('style') || '';
  const bankLine = text($(card).find('.cur-bank'));
  const [bank, governor] = bankLine.split('·').map(s => s && s.trim());
  const score = parseFloat(text($(card).find('.cur-main-score')));
  const subScores = text($(card).find('.cur-sub-scores')); // "M:7.9 S:7.5"
  const mMatch = subScores.match(/M:([\d.]+)/);
  const sMatch = subScores.match(/S:([\d.]+)/);

  const summaryLines = [];
  $(card).find('.cur-summary > div').each((_, l) => summaryLines.push(text(l)));

  const body = $(card).find('.cur-body');
  const sections = {};
  body.find('.cur-section').each((_, sec) => {
    const title = text($(sec).find('.cur-section-title'));
    if (title.includes('Narrative')) sections.narrative = text($(sec).find('.cur-text'));
    else if (title.includes('Forward Guidance')) sections.forwardGuidance = text($(sec).find('.cur-text'));
    else if (title.includes('Upcoming Events')) {
      const items = [];
      $(sec).find('div > div, div').each((_, d) => {
        // handled below more precisely
      });
      const upcoming = [];
      $(sec).find('.upcoming-date').each((_, ud) => {
        const date = text(ud);
        const full = text($(ud).parent());
        const evText = full.replace(date, '').trim();
        upcoming.push({ date, text: evText });
      });
      sections.upcomingEvents = upcoming;
    } else if (title.includes('Score History')) {
      const hist = [];
      $(sec).find('.history-item').each((_, hi) => {
        const date = text($(hi).find('.history-date')).replace(':', '');
        const score = text($(hi).find('.history-score'));
        const full = text(hi);
        const note = full.split('—').slice(1).join('—').trim();
        hist.push({ date, score, note });
      });
      sections.scoreHistory = hist;
    }
  });
  const eventBox = body.find('.event-box');
  const latestEvent = text(eventBox.find('.event-text'));
  const secondaryBox = body.find('.secondary-box');
  const secondaryTitleRaw = text(secondaryBox.find('.secondary-title'));
  const secondaryScoreText = text(secondaryBox.find('.secondary-score'));
  const secondaryFactor = secondaryBox.length ? {
    title: secondaryTitleRaw.replace(secondaryScoreText, '').trim(),
    score: secondaryScoreText.trim(),
    text: text(secondaryBox.find('.secondary-text')),
  } : null;
  const metaGrid = [];
  body.find('.meta-grid .meta-box').each((_, mb) => {
    metaGrid.push({
      label: text($(mb).find('.meta-label')),
      val: text($(mb).find('.meta-val')),
      note: text($(mb).find('.meta-note')),
    });
  });

  currencies.push({
    code, flag, stance, stanceStyle,
    bank: bank || '', governor: governor || '',
    score, macroScore: mMatch ? parseFloat(mMatch[1]) : null,
    secondaryScore: sMatch ? parseFloat(sMatch[1]) : null,
    summaryLines,
    narrative: sections.narrative || '',
    forwardGuidance: sections.forwardGuidance || '',
    latestEvent,
    upcomingEvents: sections.upcomingEvents || [],
    secondaryFactor,
    scoreHistory: sections.scoreHistory || [],
    metaGrid,
  });
});

// ---------- COT ----------
const cot = [];
$('.cot-card').each((_, card) => {
  const flag = text($(card).find('.cot-head span').get(0));
  const code = text($(card).find('.cot-head span').get(1));
  const tag = text($(card).find('.cot-head span').get(2));
  const zscore = text($(card).find('.cot-zscore'));
  const zClass = ($(card).find('.cot-zscore').attr('class') || '').replace('cot-zscore', '').trim();
  const groups = [];
  $(card).find('.cot-group-box').each((_, g) => {
    groups.push({
      label: text($(g).find('.cot-group-label')),
      net: text($(g).find('.cot-group-net')),
      flow: text($(g).find('.cot-group-flow')),
      flowClass: ($(g).find('.cot-group-flow').attr('class') || '').replace('cot-group-flow', '').trim(),
    });
  });
  const buyside = text($(card).find('.cot-buyside'));
  cot.push({ code, flag, tag, zscore, zClass, groups, buyside });
});

// ---------- PAIRS ----------
function parsePairRow(el) {
  const btn = $(el).find('.pair-btn');
  const code = text(btn.find('.pair-code'));
  const price = text(btn.find('.pair-price'));
  const atr = text(btn.find('.pair-atr'));
  const highlighted = /rgba\(74,222,128/.test(btn.attr('style') || '');
  const dots = [];
  btn.find('.dots span').each((_, d) => {
    const cls = $(d).attr('class');
    dots.push(cls.includes('dot-up') ? 'up' : cls.includes('dot-dn') ? 'down' : 'neutral');
  });
  const detail = $(el).find('.pair-detail');
  const detailDivs = detail.find('> div');
  const structure = text(detailDivs.get(0)).replace('Cấu trúc:', '').trim();
  const bondYieldDiv = detail.find('> div').eq(1);
  const spreadTagEl = bondYieldDiv.find('.spread-tag');
  const spreadTag = spreadTagEl.length ? text(spreadTagEl) : null;
  const bondYield = text(bondYieldDiv).replace('Bond Yield:', '').replace(spreadTag || '', '').trim();
  const signalBox = text(detail.find('.signal-box'));
  return { code, id: detail.attr('id'), price, atr, highlight: highlighted, dots, structure, bondYield, spreadTag, signalBox };
}

const usdPairs = [];
$('#usd-pairs .pair-row').each((_, el) => usdPairs.push(parsePairRow(el)));

const crossPairs = [];
let currentGroup = null;
$('#cross-pairs').children().each((_, el) => {
  if ($(el).hasClass('pair-row')) {
    const p = parsePairRow(el);
    p.group = currentGroup;
    crossPairs.push(p);
  } else {
    const t = text(el);
    if (t && t.includes('CROSSES')) currentGroup = t.replace(' CROSSES', '');
  }
});

// ---------- SPOTLIGHT ----------
const spotSection = $('#spot');
const confluence = [];
const divergence = [];
let mode = 'confluence';
spotSection.children().each((_, el) => {
  const t = text(el);
  if (t.includes('Phân Kỳ')) { mode = 'divergence'; return; }
  if (t.includes('Confluence Mạnh Nhất')) { mode = 'confluence'; return; }
  if ($(el).attr('style') && $(el).attr('style').includes('background:#0a0a0a')) {
    const pair = text($(el).find('span').first());
    const dots = [];
    $(el).find('.dots span').each((_, d) => {
      const cls = $(d).attr('class');
      dots.push(cls.includes('dot-up') ? 'up' : cls.includes('dot-dn') ? 'down' : 'neutral');
    });
    const body = text($(el).find('div').last());
    (mode === 'confluence' ? confluence : divergence).push({ pair, dots, text: body });
  }
});

// ---------- COT section meta (cutoff date in title) ----------
const cotTitle = text('#sec-cot .section-btn-inner');
const cotCutoffMatch = cotTitle.match(/cutoff\s*([\d/]+)/i);
const cotMeta = { cutoff: cotCutoffMatch ? cotCutoffMatch[1] : '' };

// ---------- RISK CALENDAR ----------
const riskCalendar = [];
$('#risk .risk-row').each((_, el) => {
  const date = text($(el).find('.risk-date'));
  const event = text($(el).find('.risk-event'));
  const highEl = $(el).find('.risk-high, .risk-med');
  const importance = highEl.hasClass('risk-high') ? 'high' : 'medium';
  riskCalendar.push({ date, event, importance });
});

const dashboard = {
  meta,
  marketBar,
  narrative,
  heatmapOrder,
  currencies,
  cot,
  cotMeta,
  pairs: { usd: usdPairs, cross: crossPairs },
  spotlight: { confluence, divergence },
  riskCalendar,
};

fs.writeFileSync(new URL('../data/dashboard.json', import.meta.url), JSON.stringify(dashboard, null, 2));
console.log('Extracted currencies:', currencies.length, 'usdPairs:', usdPairs.length, 'crossPairs:', crossPairs.length, 'cot:', cot.length);

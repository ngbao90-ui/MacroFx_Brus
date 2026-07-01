// Core cost-saving step: the LLM never sees or produces HTML. It receives the
// current dashboard.json (with today's live prices already merged in by
// fetch-market.mjs) and returns ONLY a JSON *patch* — the objects that
// actually need to change. render.mjs turns whatever JSON exists into HTML
// afterwards, deterministically and for free.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { callLLM } from './lib/llm-provider.mjs';
import { applyPatch } from './lib/merge-patch.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dataPath = path.join(root, 'data/dashboard.json');

const SYSTEM_PROMPT = `Bạn là trợ lý phân tích Macro FX, duy trì một dashboard G8+NZD (USD, EUR, JPY, GBP, CHF, CAD, AUD, NZD) dạng JSON.

QUY TẮC BẤT BIẾN:
1. Bạn KHÔNG BAO GIỜ output HTML. Bạn chỉ output MỘT object JSON hợp lệ — "patch" — chứa các phần dữ liệu cần thay đổi. Không giải thích, không markdown, khô[...]
2. Patch chỉ chứa các object đã thay đổi thật sự (để tiết kiệm token). Nếu một đồng tiền không có tin gì mới, ĐỪNG đưa nó vào "currencies". Nếu một c[...]
3. QUAN TRỌNG NHẤT — TÍNH LOGIC LIÊN KẾT: nếu bạn thay đổi bất kỳ điều gì về một đồng tiền (score, narrative, forward guidance, sự kiện mới), bạn PHẢI k[...]
   - currencies[]: score, macroScore, secondaryScore, stance, narrative, forwardGuidance, latestEvent, scoreHistory (append 1 dòng mới nếu có sự kiện đáng kể, giữ tối đa 5 dòng[...]
   - pairs.usd[] và pairs.cross[]: MỌI cặp tiền có chứa đồng tiền đó — cập nhật lại "dots" (3 lớp: macro/kỹ thuật/COT), "structure", "bondYield", "spreadTag", "signa[...]
   - spotlight.confluence / spotlight.divergence: thêm/bớt/sửa cặp tiền nếu trạng thái 3/3 hoặc phân kỳ thay đổi.
   - narrative.themes: cập nhật nếu có chủ đề vĩ mô lớn thay đổi (banner chính của dashboard).
   - cot[]: chỉ cập nhật nếu có dữ liệu COT mới (thường vào thứ Sáu, dữ liệu Tradingster cắt vào thứ Ba trước đó).
   - riskCalendar: thêm sự kiện mới sắp tới nếu có, có thể xoá sự kiện đã qua ngày.
4. Điểm số (score) 0–10: Score = Macro_Core × 0.70 + Secondary_Factor × 0.30. Macro_Core dựa trên: (a) data thực tế lạm phát/lao động vs mục tiêu, (b) delta vs kỳ vọng[...]
5. Với mỗi cặp tiền, "dots" là mảng 3 phần tử ["up"|"down"|"neutral", ...] theo thứ tự [Macro, Kỹ thuật, COT]. 3/3 cùng chiều = confluence mạnh (đặt "highlight": tru[...]
6. Không đưa ra lời khuyên đầu tư trực tiếp — chỉ mô tả setup/bias theo dữ liệu.
7. Tất cả text bằng tiếng Việt, giữ văn phong ngắn gọn, số liệu cụ thể, giống với văn phong hiện có trong JSON hiện tại (làm mẫu).
8. Nếu bạn có công cụ web_search, chỉ dùng để: (a) kiểm tra tin tức/số liệu vĩ mô mới nhất trong 24-48h qua cho các đồng tiền G8+NZD, (b) vào thứ Sáu, tra c[...]
9. Nếu KHÔNG có gì đáng kể thay đổi so với dữ liệu hiện tại, trả về {} (patch rỗng) — điều này hoàn toàn bình thường và tiết kiệm chi phí.

ĐỊNH DẠNG OUTPUT: một JSON object duy nhất, ví dụ:
{"currencies":[{"code":"CAD","score":3.6,"narrative":"..."}],"pairs":{"usd":[{"code":"USDCAD","price":"1.4210","dots":["up","up","up"],"highlight":true,"signalBox":"..."}],"cross":[]},"spotlight":[...]

**CRITICAL**: Output ONLY valid JSON. No markdown, no explanations, no text before or after the JSON object.`;

function pruneForPrompt(data) {
  // Trim history to keep the prompt small; the LLM only needs recent context.
  const clone = JSON.parse(JSON.stringify(data));
  for (const c of clone.currencies) {
    if (c.scoreHistory) c.scoreHistory = c.scoreHistory.slice(-3);
  }
  return clone;
}

function extractJson(text) {
  try {
    // Try direct JSON parse first
    return JSON.parse(text.trim());
  } catch (e) {
    // Remove markdown code blocks
    let trimmed = text.trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '');
    
    // Find first { and last }
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    
    if (firstBrace === -1 || lastBrace === -1) {
      throw new Error('No JSON object found in LLM response');
    }
    
    const jsonStr = trimmed.slice(firstBrace, lastBrace + 1);
    
    try {
      return JSON.parse(jsonStr);
    } catch (parseErr) {
      // Try to fix common issues
      let fixed = jsonStr;
      
      // Fix unescaped newlines in strings
      fixed = fixed.replace(/[\n\r]/g, ' ');
      
      // Try parsing again
      try {
        return JSON.parse(fixed);
      } catch (err2) {
        throw new Error(`Failed to parse JSON after fix attempts: ${parseErr.message}`);
      }
    }
  }
}

async function main() {
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const today = new Date();
  const isFriday = today.getUTCDay() === 5; // COT / weekly research day
  const dateLabel = today.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

  const promptData = pruneForPrompt(data);
  const userMsg = `Hôm nay là ${dateLabel} (giờ Việt Nam). ${isFriday ? 'Hôm nay là thứ Sáu — hãy kiểm tra và cập nhật object "cot" nếu có dữ liệu Tradingster mới.' : 'Hãy kiểm tra tin tức vĩ mô 24-48h gần nhất.'}

Dữ liệu dashboard hiện tại (giá đã được cập nhật tự động từ FMP, bạn không cần tự tính lại giá FX):
${JSON.stringify(promptData)}

Hãy tìm tin tức vĩ mô mới nhất (nếu có web_search) cho USD, EUR, JPY, GBP, CHF, CAD, AUD, NZD trong 24-48h qua, và trả về JSON patch theo đúng quy tắc trong system prompt. Output ONLY the JSON object, nothing else.`;

  const useWebSearch = process.env.ENABLE_WEB_SEARCH === 'true' || isFriday;

  let patch = {};
  try {
    const raw = await callLLM({
      system: SYSTEM_PROMPT,
      user: userMsg,
      maxTokens: 8000,
      useWebSearch,
    });

    console.log('[LLM Response Length]', raw.length, 'chars');

    try {
      patch = extractJson(raw);
      console.log('[LLM Patch Extracted]', Object.keys(patch).length === 0 ? 'empty' : 'has updates');
    } catch (parseErr) {
      console.error('[JSON Parse Failed]', parseErr.message);
      console.error('[Response Preview]', raw.slice(0, 500));
      console.warn('LLM returned invalid JSON, using empty patch (dashboard unchanged).');
      patch = {};
    }
  } catch (llmErr) {
    console.error('[LLM Call Failed]', llmErr.message);
    console.warn('LLM provider error, using empty patch (dashboard unchanged).');
    patch = {};
  }

  if (Object.keys(patch).length === 0) {
    console.log('[Result] No macro-relevant changes detected, dashboard.json left as-is.');
    console.log('[Dashboard] Updating only meta.updatedAt timestamp.');
    data.meta.updatedAt = new Date().toISOString();
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
  } else {
    try {
      const merged = applyPatch(data, patch);
      merged.meta.dateLabel = dateLabel;
      merged.meta.updatedAt = new Date().toISOString();
      fs.writeFileSync(dataPath, JSON.stringify(merged, null, 2));
      console.log('[Result] Patch applied with keys:', Object.keys(patch).join(', '));
    } catch (mergeErr) {
      console.error('[Patch Apply Failed]', mergeErr.message);
      console.warn('Failed to apply patch, leaving dashboard.json unchanged.');
      data.meta.updatedAt = new Date().toISOString();
      fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    }
  }
}

main().catch(e => {
  console.error('[FATAL]', e.message);
  // Don't exit with error - allow workflow to continue
  console.warn('Workflow continuing despite llm-update error.');
  process.exit(0);
});

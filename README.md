# G8+NZD Macro FX Dashboard — Auto-Update Pipeline

Kiến trúc **"Data JSON + Template"**: dữ liệu sống trong `data/dashboard.json`, layout/CSS/JS cố định trong `scripts/render.mjs` + `templates/`. Mỗi lần cập nhật, LLM chỉ cần trả về một **JSON patch nhỏ** (các object thay đổi), không phải toàn bộ HTML → giảm ~90% token so với việc bắt LLM viết lại cả trang mỗi ngày.

```
fx-dashboard/
├── data/
│   ├── dashboard.json      ← NGUỒN DỮ LIỆU DUY NHẤT (currencies, pairs, cot, narrative...)
│   └── alert-state.json    ← trạng thái confluence 3/3 lần trước (để chống spam Telegram)
├── docs/
│   └── index.html          ← HTML được render tự động (GitHub Pages trỏ vào đây)
├── templates/
│   ├── style.css.html      ← CSS tĩnh, không đổi
│   ├── script.js.html      ← JS tĩnh (toggle/tab), không đổi
│   └── methodology.html    ← Phần "Phương pháp luận" tĩnh, hiếm khi đổi
├── scripts/
│   ├── fetch-market.mjs    ← Lấy giá live từ FMP (KHÔNG tốn token LLM)
│   ├── llm-update.mjs      ← Gọi LLM, nhận JSON patch, merge vào dashboard.json
│   ├── render.mjs          ← dashboard.json → docs/index.html (thuần code, miễn phí)
│   ├── swing-detector.mjs  ← Quét tín hiệu 3/3 confluence mới → gửi Telegram
│   ├── parse-source.mjs    ← (chỉ chạy 1 lần) trích xuất dashboard.json từ file HTML gốc
│   └── lib/
│       ├── llm-provider.mjs  ← abstraction đa provider (Anthropic/DeepSeek/OpenRouter/khác)
│       ├── merge-patch.mjs   ← merge JSON patch vào dataset đầy đủ theo key (code/id)
│       ├── scoring.mjs       ← helper màu sắc/class/threshold điểm số
│       └── telegram.mjs      ← gửi tin nhắn Telegram
└── .github/workflows/
    └── daily-update.yml    ← chạy tự động mỗi sáng 6h VN
```

## 1. Setup GitHub repo

1. Tạo repo mới trên GitHub (public hoặc private đều được, GitHub Pages free hoạt động cả 2 loại với tài khoản có Pages).
2. Upload toàn bộ nội dung thư mục này lên repo (giữ nguyên cấu trúc).
3. Vào **Settings → Pages**:
   - Source: **Deploy from a branch**
   - Branch: `main`, folder: **`/docs`**
   - Save. Sau vài phút, dashboard sẽ có tại `https://<username>.github.io/<repo>/`.

## 2. Khai báo Secrets & Variables

Vào **Settings → Secrets and variables → Actions**.

### Secrets (bắt buộc theo nhu cầu)
| Secret | Dùng cho |
|---|---|
| `FMP_API_KEY` | Lấy giá FX/Gold/Oil/S&P500/US10Y hàng ngày (bắt buộc) |
| `TELEGRAM_BOT_TOKEN` | Gửi cảnh báo swing signal (bắt buộc nếu muốn alert) |
| `TELEGRAM_CHAT_ID` | ID chat/nhóm nhận cảnh báo |
| `ANTHROPIC_API_KEY` | Nếu dùng provider `anthropic` (Claude) |
| `DEEPSEEK_API_KEY` | Nếu dùng provider `deepseek` |
| `OPENROUTER_API_KEY` | Nếu dùng provider `openrouter` (GLM, Codex/GPT, Qwen...) |
| `OPENAI_COMPATIBLE_API_KEY` | Nếu dùng endpoint OpenAI-compatible khác |

Chỉ cần khai báo API key của provider bạn thật sự dùng.

### Variables (Settings → Secrets and variables → Actions → tab **Variables**)
| Variable | Giá trị ví dụ | Ghi chú |
|---|---|---|
| `LLM_PROVIDER` | `anthropic` \| `deepseek` \| `openrouter` \| `openai_compatible` | Chọn model chính chạy hàng ngày |
| `LLM_MODEL` | (để trống = mặc định) | vd `claude-sonnet-4-6`, `deepseek-chat`, `z-ai/glm-4.6`, `openai/gpt-5-codex` |
| `ENABLE_WEB_SEARCH` | `true`/`false` | Chỉ áp dụng khi provider = `anthropic`. Tự động bật vào **thứ Sáu** để cập nhật COT dù để `false` |
| `OPENAI_COMPATIBLE_BASE_URL` | vd `https://api.example.com/v1` | Chỉ cần nếu dùng `openai_compatible` |
| `OPENAI_COMPATIBLE_MODEL` | tên model | Chỉ cần nếu dùng `openai_compatible` |

**Đổi model bất kỳ lúc nào**: chỉ cần sửa Variable `LLM_PROVIDER`/`LLM_MODEL` — không cần sửa code. Bạn cũng có thể ép provider cho 1 lần chạy cụ thể qua **Actions → Daily FX Dashboard Update → Run workflow → llm_provider**.

Lấy `TELEGRAM_CHAT_ID`: nhắn cho bot của bạn 1 tin bất kỳ, rồi mở `https://api.telegram.org/bot<TOKEN>/getUpdates`, đọc field `chat.id`.

## 3. Cách hoạt động mỗi ngày (workflow `daily-update.yml`)

Chạy tự động **6:00 sáng giờ Việt Nam** (cron `0 23 * * *` UTC), hoặc bấm chạy tay ở tab Actions:

1. **`fetch-market.mjs`** — gọi FMP lấy giá 27 cặp FX + Gold/WTI/Brent/S&P500/US10Y/DXY, ghi thẳng vào `dashboard.json`. Bước này **không tốn token LLM**.
2. **`llm-update.mjs`** — gửi cho LLM: dữ liệu hiện tại (đã có giá mới) + system prompt quy định rõ **tính logic liên kết** (đổi 1 đồng tiền → phải đồng bộ heatmap, mọi cặp tiền liên quan, spotlight, COT nếu có). LLM trả về **JSON patch** (chỉ phần thay đổi) → merge vào `dashboard.json`. Nếu không có gì đáng cập nhật, LLM trả `{}` — không tốn thêm gì.
3. **`render.mjs`** — sinh lại `docs/index.html` từ `dashboard.json` + template tĩnh. Không dùng LLM.
4. **`swing-detector.mjs`** — quét toàn bộ cặp tiền tìm tín hiệu **3/3 confluence mới** (macro + kỹ thuật + COT cùng chiều) so với hôm qua (`alert-state.json`), gửi Telegram nếu có thay đổi.
5. Commit + push `data/dashboard.json`, `data/alert-state.json`, `docs/index.html` về `main` → GitHub Pages tự cập nhật.

## 4. Chạy thử ở máy local

```bash
npm install
cp .env.example .env   # điền API keys
export $(grep -v '^#' .env | xargs)   # load env vào shell (Linux/Mac)
npm run update-all
```

Hoặc chạy từng bước: `npm run fetch-market`, `npm run llm-update`, `npm run render`, `npm run swing-detect`.

## 5. Tuỳ chọn model — chi phí thấp nhất

Vì mỗi lần chạy LLM chỉ nhận/trả một JSON patch nhỏ (thường vài trăm đến vài nghìn token, thay vì toàn bộ ~30K token HTML mỗi ngày), bạn có thể dùng bất kỳ provider nào rẻ:

- **DeepSeek** (`deepseek-chat`) — rẻ nhất, phù hợp chạy hàng ngày.
- **OpenRouter → GLM** (`z-ai/glm-4.6`) hoặc **Qwen** — rẻ, chất lượng tiếng Việt khá.
- **OpenRouter → Codex/GPT** (`openai/gpt-5-codex` hoặc tương đương) — mạnh hơn, chi phí cao hơn.
- **Anthropic Claude** (`claude-sonnet-4-6`) — chất lượng phân tích tốt nhất, có web search tích hợp sẵn (không cần thêm code) — khuyến nghị dùng vào **thứ Sáu** (ngày cập nhật COT) hoặc khi có sự kiện lớn (FOMC, NFP...), còn ngày thường có thể để DeepSeek/GLM chạy.

Mẹo: đặt `LLM_PROVIDER=deepseek` mặc định cho cron hàng ngày, rồi dùng **Run workflow** thủ công với `llm_provider=anthropic` + `enable_web_search=true` vào các ngày có sự kiện lớn.

## 6. Cấu trúc `dashboard.json` (rút gọn)

```jsonc
{
  "meta": { "title", "dateLabel", "badgeGray", "badgeFire", "updatedAt" },
  "marketBar": [{ "label": "DXY", "value": "101.14" }, ...],
  "narrative": { "updated", "themes": [...], "background": [...] },
  "currencies": [
    { "code": "USD", "flag", "score", "macroScore", "secondaryScore",
      "stance", "stanceStyle", "bank", "governor", "summaryLines",
      "narrative", "forwardGuidance", "latestEvent",
      "upcomingEvents": [...], "secondaryFactor": {...},
      "scoreHistory": [...], "metaGrid": [...] }
  ],
  "cot": [ { "code", "flag", "tag", "zscore", "zClass", "groups": [...], "buyside" } ],
  "pairs": {
    "usd": [ { "code": "EURUSD", "id", "price", "atr", "dots": ["down","down","down"],
               "highlight", "structure", "bondYield", "spreadTag", "signalBox" } ],
    "cross": [ { ...same shape..., "group": "EUR" } ]
  },
  "spotlight": { "confluence": [...], "divergence": [...] },
  "riskCalendar": [ { "date", "event", "importance" } ]
}
```

Sửa tay file này bất cứ lúc nào rồi chạy `npm run render` nếu muốn override thủ công.

## 7. Ghi chú về COT / Tradingster

Tradingster không có API công khai ổn định, nên thay vì scrape HTML (dễ vỡ khi họ đổi giao diện), pipeline dùng **web_search tool của Claude** (chỉ khi `LLM_PROVIDER=anthropic`) vào thứ Sáu để tra cứu số liệu COT mới nhất và tự tính Z-score theo công thức trong `llm-update.mjs`. Nếu bạn dùng provider khác vào thứ Sáu, object `cot` sẽ giữ nguyên tuần trước — không sao, dữ liệu COT vốn chỉ cập nhật hàng tuần.

## 8. Không phải lời khuyên đầu tư

Dashboard tổng hợp dữ liệu công khai (FMP, TradingView, Tradingster) và phân tích tự động — chỉ mang tính tham khảo.

/* =========================================================
 * 共用設定與工具
 * 部署 Apps Script 後，把網址貼到 API_URL
 * ========================================================= */
const API_URL = "請貼上 Apps Script 網頁應用程式網址";

async function api(action, data = {}) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // 避免 CORS 預檢
    body: JSON.stringify({ action, ...data })
  });
  return res.json();
}

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function fmtSec(s) {
  s = Math.max(0, Math.round(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
  const p = n => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`;
}
const fmtMin = s => (Math.round((s || 0) / 6) / 10) + " 分";

function drillOf(code) { return DRILLS.find(d => d.code === code) || { code, name: code, target: 0, type: "drill" }; }
function examOf(year) { return EXAMS.find(e => String(e.year) === String(year)); }

function toast(msg, bad) {
  let t = $("#toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.className = "show" + (bad ? " bad" : "");
  clearTimeout(t._h); t._h = setTimeout(() => t.className = "", 2600);
}

/* 色票、風格卡、製作清單等存到 Google 試算表（瀏覽器只當暫存），換電腦或用手機都看得到 */
const CLOUD_KEYS = ["bp_palette", "bp_style", "bp_palettes", "bp_recipe", "bp_wheel2"];
const _syncT = {};
function store(k, v) {
  try {
    if (v === undefined) return JSON.parse(localStorage.getItem(k));
    localStorage.setItem(k, JSON.stringify(v));
  } catch (e) { if (v === undefined) return null; }
  if (CLOUD_KEYS.includes(k)) {
    clearTimeout(_syncT[k]);
    _syncT[k] = setTimeout(() => {
      let me = null; try { me = JSON.parse(localStorage.getItem("bp_me")); } catch (e) {}
      if (!me) return;
      api("setData", { ...me, key: k, value: JSON.stringify(v === undefined ? null : v) })
        .then(r => { if (!r.ok) toast("雲端儲存失敗：" + r.msg, true); })
        .catch(() => toast("網路不穩，這次修改還沒存到雲端", true));
    }, 1200);
  }
}
/* 登入後先從雲端載入，覆蓋瀏覽器暫存 */
async function cloudLoad() {
  let me = null; try { me = JSON.parse(localStorage.getItem("bp_me")); } catch (e) {}
  if (!me) return false;
  const r = await api("getData", me).catch(() => null);
  if (!r || !r.ok) return false;
  CLOUD_KEYS.forEach(k => { try { if (k in r.data) localStorage.setItem(k, r.data[k]); } catch (e) {} });
  return true;
}
function unstore(k) { try { localStorage.removeItem(k); } catch (e) {} }

function readFileB64(file) {
  return new Promise((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok({ name: file.name, type: file.type, data: String(r.result).split(",")[1] });
    r.onerror = no;
    r.readAsDataURL(file);
  });
}

/* 近 N 天的日期字串（台北時間） */
function lastDays(n) {
  const out = [], now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 864e5);
    out.push(d.toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" }));
  }
  return out;
}

/* 熱度格子：每天練習次數 */
function heatGrid(logs, days = 28) {
  const count = {};
  logs.forEach(l => count[l.date] = (count[l.date] || 0) + 1);
  return `<div class="heat">${lastDays(days).map(d => {
    const c = count[d] || 0, lv = c === 0 ? 0 : c < 2 ? 1 : c < 4 ? 2 : 3;
    return `<span class="lv${lv}" title="${d}：${c} 次"></span>`;
  }).join("")}</div><div class="heat-legend"><span>近 ${days} 天</span><span>少<i class="lv0"></i><i class="lv1"></i><i class="lv2"></i><i class="lv3"></i>多</span></div>`;
}

/* 各關卡時間紀錄表 */
function drillTable(logs) {
  const rows = DRILLS.filter(d => d.type === "drill").map(d => {
    const L = logs.filter(l => l.drill === d.code && l.seconds > 0);
    if (!L.length) return `<tr><td>${esc(d.name)}</td><td>${d.target} 分</td><td colspan="3" class="muted">尚未練習</td></tr>`;
    const best = Math.min(...L.map(l => l.seconds)), last = L[L.length - 1].seconds;
    const hit = last <= d.target * 60;
    const max = Math.max(...L.map(l => l.seconds), d.target * 60);
    const bars = L.slice(-8).map(l => `<i style="height:${Math.max(8, l.seconds / max * 100)}%" class="${l.seconds <= d.target * 60 ? "ok" : ""}" title="${l.date} ${fmtSec(l.seconds)}"></i>`).join("");
    return `<tr><td>${esc(d.name)}<div class="muted small">${L.length} 次</div></td><td>${d.target} 分</td>
      <td>${fmtSec(best)}</td><td class="${hit ? "good" : "warn"}">${fmtSec(last)}</td><td><div class="bars">${bars}</div></td></tr>`;
  }).join("");
  return `<table class="tbl"><thead><tr><th>關卡</th><th>目標</th><th>最佳</th><th>最近</th><th>最近 8 次</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/* 常漏規格排行 */
function missingRank(logs) {
  const c = {};
  logs.forEach(l => (l.missing || []).forEach(m => { if (m) c[m] = (c[m] || 0) + 1; }));
  const arr = Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (!arr.length) return `<p class="muted">還沒有資料（做完全真模擬或讀題拆解後會出現）</p>`;
  return `<ol class="rank">${arr.map(([k, v]) => `<li><span>${esc(k)}</span><b>${v} 次</b></li>`).join("")}</ol>`;
}

function statusTag(s) {
  const cls = s === "通過" ? "pass" : s === "再修" ? "redo" : "wait";
  return `<span class="tag ${cls}">${esc(s || "待批改")}</span>`;
}

/* 考古題全真模擬進度表：每份至少做兩次，檢討後才能再做 */
function mockAttempts(logs, year) {
  return logs.filter(l => l.drill === "M01" && String(l.year) === String(year));
}
function examGrid(logs, forStudent) {
  const maxN = Math.max(3, ...EXAMS.map(e => mockAttempts(logs, e.year).length));
  const head = Array.from({ length: maxN }, (_, i) => `<th>第 ${i + 1} 次</th>`).join("");
  const rows = EXAMS.map(e => {
    const A = mockAttempts(logs, e.year), n = A.length;
    const cells = Array.from({ length: maxN }, (_, i) => {
      const a = A[i]; if (!a) return `<td class="muted">—</td>`;
      const prev = A[i - 1], d = prev ? Math.round((prev.seconds - a.seconds) / 60) : null;
      return `<td><b>${fmtSec(a.seconds)}</b>${d !== null ? `<div class="small ${d > 0 ? "good" : "warn"}">${d > 0 ? "快了 " + d : "慢了 " + (-d)} 分</div>` : ""}
        <div>${statusTag(a.status === "待批改" ? "待檢討" : "已檢討")}</div></td>`;
    }).join("");
    let act = "";
    if (forStudent) {
      const wait = n > 0 && A[n - 1].status === "待批改";
      act = `<td>${wait ? `<button disabled>等老師檢討</button>` : `<button class="${n < 2 ? "primary" : ""}" data-year="${e.year}">做第 ${n + 1} 次</button>`}</td>`;
    }
    const main = e.note && e.note.includes("主力");
    return `<tr><td><b>${e.year}</b>${main ? ` <span class="tag pass">主力</span>` : ""}<div class="small muted">${esc(e.title)}</div>
      <div class="small">${n >= 2 ? `<span class="good">✓ 已達 2 次</span>` : `還差 ${2 - n} 次`}</div></td>${cells}${act}</tr>`;
  }).join("");
  return `<div style="overflow-x:auto"><table class="tbl grid"><thead><tr><th>考古題</th>${head}${forStudent ? "<th></th>" : ""}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* 頁尾著作權 */
const CREDIT = "© 2026 啾啾菇　商業簡報練習系統";
document.addEventListener("DOMContentLoaded", () => {
  const f = document.createElement("footer"); f.className = "credit";
  f.innerHTML = `<span>${CREDIT}</span>`;
  document.body.appendChild(f);
});

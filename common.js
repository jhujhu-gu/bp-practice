/* =========================================================
 * 共用設定與工具
 * 部署 Apps Script 後，把網址貼到 API_URL
 * ========================================================= */
const API_URL = "https://script.google.com/macros/s/AKfycbwawlLleZENS5owIkyjD9cH291PIHpTQWWOftCDza0cgZ9_dzOM55RY9hW6KwJWxwTy/exec";

async function api(action, data = {}) {
  if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(API_URL)) return { ok: false, msg: "common.js 的 API_URL 格式不對，結尾要是 /exec" };
  let res;
  try { res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // 避免 CORS 預檢
    body: JSON.stringify({ action, ...data })
  }); } catch (e) { return { ok: false, msg: "連不到後台：請確認部署的「誰可以存取」是「所有人」，或檢查網路" }; }
  const txt = await res.text();
  try { return JSON.parse(txt); }
  catch (e) {
    const login = /accounts\.google|ServiceLogin|登入/.test(txt);
    return { ok: false, msg: login ? "後台要求登入 Google：部署的「誰可以存取」請改成「所有人」" : "後台回傳的不是資料（可能尚未授權或部署有誤），請用瀏覽器直接打開 /exec 網址檢查" };
  }
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

const tgtText = d => d.target ? `目標 ${d.target} 分鐘` : "不限時間";
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
/* 把後台回傳的雲端資料寫進瀏覽器暫存 */
function applyCloud(data) { if (!data) return; CLOUD_KEYS.forEach(k => { try { if (k in data) localStorage.setItem(k, data[k]); } catch (e) {} }); }

/* ---------- 比賽倒數 ---------- */
const CONTEST = { name: "115 學年度技藝競賽", start: "2026-12-01", end: "2026-12-04" };
function countdownHtml() {
  const today = new Date(new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Taipei" }));
  const s = new Date(CONTEST.start), e = new Date(CONTEST.end);
  const d = Math.round((s - today) / 864e5);
  if (d > 0) return `距離 ${CONTEST.name} 還有 <b>${d}</b> 天`;
  if (today <= e) return `${CONTEST.name}進行中，加油！`;
  return `${CONTEST.name}已結束，辛苦了！`;
}
document.addEventListener("DOMContentLoaded", () => {
  const h = document.querySelector("header h1"); if (!h) return;
  const c = document.createElement("div"); c.className = "countdown"; c.innerHTML = countdownHtml();
  h.insertAdjacentElement("afterend", c);
});

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
    if (!L.length) return `<tr><td>${esc(d.name)}</td><td>${d.target ? d.target + " 分" : "不限"}</td><td colspan="3" class="muted">尚未練習</td></tr>`;
    const best = Math.min(...L.map(l => l.seconds)), last = L[L.length - 1].seconds;
    const hit = !d.target || last <= d.target * 60;
    const max = Math.max(...L.map(l => l.seconds), d.target * 60);
    const bars = L.slice(-8).map(l => `<i style="height:${Math.max(8, l.seconds / max * 100)}%" class="${!d.target || l.seconds <= d.target * 60 ? "ok" : ""}" title="${l.date} ${fmtSec(l.seconds)}"></i>`).join("");
    return `<tr><td>${esc(d.name)}<div class="muted small">${L.length} 次</div></td><td>${d.target ? d.target + " 分" : "不限"}</td>
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

/* ---------------- 母片養成 7 步驟（選手首頁、配色頁、老師後台共用同一套規則） ----------------
 * 需要老師確認的步驟，老師按「通過」才算完成（打勾）；
 * 已上傳還沒批改＝等老師（⏳）；老師按「再修」＝要修改（↻），並帶出老師評語。
 * L：練習紀錄（S01/S03/D00/D01）；loc：{ insp, picked, style, recipe } 選手自己完成的步驟 */
function masterFlow(L, loc) {
  L = L || []; loc = loc || {};
  const of = c => L.filter(l => l.drill === c), lastOf = a => a[a.length - 1];
  const D0 = of("D00"), last0 = lastOf(D0), S3 = of("S03"), lastS3 = lastOf(S3);
  const D1 = of("D01"), last1 = lastOf(D1), last3 = D1.slice(-3);
  const approved = !!last0 && D0.some(l => l.status === "通過") && last0.status !== "再修";
  const moved = D0.length > 0;   // 已經交過試做母片，前面三步一定做過了（老師端也能正確顯示）
  const S = [
    { k: "insp", n: "上傳靈感圖", st: moved || loc.insp || L.some(l => l.drill === "S01") ? "ok" : "todo" },
    { k: "insp", n: "吸色定配色", st: moved || loc.picked ? "ok" : "todo" },
    { k: "style", n: "形狀・字型・命名", st: moved || loc.style ? "ok" : "todo" }];
  const s4 = { k: "D00", n: "試做第一版母片" }, s5 = { k: "D00", n: "老師確認通過" };
  if (approved) { s4.st = "ok"; s5.st = "ok"; s5.sub = "老師已通過"; }
  else if (!last0) { s4.st = "todo"; s4.sub = "不限時間，做完上傳"; s5.st = "todo"; }
  else if (last0.status === "再修") { s4.st = "redo"; s4.sub = "老師請你再修"; s4.comment = last0.comment; s5.st = "todo"; s5.sub = "修好再上傳一次"; }
  else { s4.st = "wait"; s4.sub = "已上傳，等老師看"; s5.st = "wait"; s5.sub = "老師還沒看"; }
  const s6 = { k: "recipe", n: "寫母片製作清單" };
  if (!approved) s6.st = "lock";
  else if (lastS3 && lastS3.status === "再修") { s6.st = "redo"; s6.sub = "老師請你修改清單"; s6.comment = lastS3.comment; }
  else if (loc.recipe) { s6.st = "ok"; s6.sub = lastS3 ? (lastS3.status === "通過" ? "老師看過了" : "已交給老師") : ""; }
  else s6.st = "todo";
  const s7 = { k: "D01", n: "30 分鐘內重建 ×3" }, times = last3.map(l => fmtSec(l.seconds)).join("、");
  const fast3 = last3.length === 3 && last3.every(l => l.seconds <= 1800);
  if (!approved) s7.st = "lock";
  else if (last1 && last1.status === "再修") { s7.st = "redo"; s7.sub = "最近一次老師請你再修"; s7.comment = last1.comment; }
  else if (fast3 && last3.every(l => l.status === "通過")) { s7.st = "ok"; s7.sub = times; }
  else if (fast3) { s7.st = "wait"; s7.sub = "3 次都在 30 分內，等老師確認"; }
  else { s7.st = "todo"; s7.sub = last3.length ? "最近：" + times : "要連續 3 次 30 分鐘內"; }
  S.push(s4, s5, s6, s7);
  const cur = S.findIndex(s => s.st !== "ok");
  return { steps: S, approved, cur, done: S.filter(s => s.st === "ok").length };
}
/* 目前進度的說明（告訴選手現在卡在哪、該做什麼） */
function flowMsg(f) {
  if (f.cur < 0) return `<div class="fmsg ok">🎉 <b>母片已經背起來了！</b>七個步驟都完成，接下來專心練全真模擬，比賽前每週再重建一次母片保持手感。</div>`;
  const s = f.steps[f.cur], no = `第 ${f.cur + 1} 步「${s.n}」`;
  const redo = f.steps.find(x => x.st === "redo");
  if (redo) return `<div class="fmsg redo">↻ <b>老師請你修改：${esc(redo.n)}</b>${redo.comment ? `<div class="fq">老師評語：${esc(redo.comment)}</div>` : ""}
    <div class="small">照評語修改後再送一次，老師按「通過」才算完成。</div></div>`;
  if (s.st === "wait") return `<div class="fmsg wait">⏳ <b>${no}：等老師確認中</b><div class="small">${s.k === "D01" ? "老師確認這 3 次都沒問題後，才算背起來。" : "老師按「通過」後，才會開放「寫母片製作清單」和「30 分鐘內重建」。等待時可以先看色彩教學、練其他速度關卡。"}</div></div>`;
  return `<div class="fmsg">👉 <b>下一步：${no}</b>${s.sub ? `<span class="small muted">　${esc(s.sub)}</span>` : ""}</div>`;
}
/* 進度條＋步驟列 */
function flowBar(f, here) {
  const icon = (s, i) => ({ ok: "✓", wait: "⏳", redo: "↻", lock: "🔒" }[s.st] || i + 1);
  const pct = Math.round(f.done / f.steps.length * 100);
  return `<div class="fprog"><div class="fbar"><i style="width:${pct}%"></i></div><span>完成 ${f.done} / ${f.steps.length} 步</span></div>
    <div class="stepbar">${f.steps.map((s, i) => `<button class="sb ${s.st} ${i === f.cur ? "now" : ""} ${s.k === here ? "here" : ""}" data-sk="${s.k}">
    <span class="sn">${icon(s, i)}</span><span class="st">${s.n}${i === f.cur ? `<em class="nx">${s.st === "wait" ? "等老師" : s.st === "redo" ? "要修改" : "下一步"}</em>` : ""}${s.sub ? `<small>${esc(s.sub)}</small>` : ""}</span></button>`).join('<span class="sarr">›</span>')}</div>
    ${flowMsg(f)}`;
}
/* 選手自己完成的步驟（從這台電腦／雲端的資料判斷） */
function flowLocal() {
  const st = store("bp_style") || {}, saved = store("bp_palettes") || [], insp = store("bp_insp") || [];
  const rc = store("bp_recipe") || [];
  return { insp: insp.length > 0, picked: !!st.picked, style: !!(st.name && saved.some(x => x.shape)),
    recipe: rc.filter(r => r.sec && !r.sec.startsWith("0.") && (r.item || "").trim() && r.item !== "畫面外色票圈").length >= 3 };
}

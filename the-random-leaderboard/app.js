import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, collection, getDocs, query, where, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/*
✅ firebaseConfig 넣는 곳
Firebase 콘솔 → 프로젝트 설정 → 내 앱(웹 앱) → SDK 설정 및 구성 → config 복사
*/
const firebaseConfig = {
  apiKey: "AIzaSyCgyGWHWstnTbbOm8UmSMqtOdoNhoV7RvU",
  authDomain: "the-random-remastered.firebaseapp.com",
  projectId: "the-random-remastered",
  storageBucket: "the-random-remastered.firebasestorage.app",
  messagingSenderId: "726117255054",
  appId: "1:726117255054:web:e260d57feb6fa6b80bc6df"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const COL_PLAYERS = "updown_players";
const COL_LOGS = "updown_game_logs";

const $ = (id) => document.getElementById(id);

function setErr(msg){
  const box = $("errBox");
  box.style.display = "block";
  box.textContent = msg;
}

function fmtSec(x){
  if (x === null || x === undefined) return "-";
  const n = Number(x);
  if (!Number.isFinite(n) || n >= 1e9) return "-";
  return n.toFixed(2);
}

function kstTodayRange(){
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const kst = new Date(utc + 9 * 3600000);

  const start = new Date(kst);
  start.setHours(0,0,0,0);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);

  const startUtc = new Date(start.getTime() - 9 * 3600000);
  const endUtc = new Date(end.getTime() - 9 * 3600000);

  const label = `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,"0")}-${String(start.getDate()).padStart(2,"0")}`;
  return { startUtc, endUtc, label };
}

function renderTbody(tbodyId, rows, makeRow, colSpan){
  const tb = $(tbodyId);
  tb.innerHTML = "";
  if (!rows.length){
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = colSpan;
    td.className = "muted";
    td.textContent = "데이터 없음";
    tr.appendChild(td);
    tb.appendChild(tr);
    return;
  }
  rows.forEach((r, i) => tb.appendChild(makeRow(r, i)));
}

async function loadOverallTop10(){
  const snap = await getDocs(collection(db, COL_PLAYERS));
  const rows = [];
  snap.forEach(doc => {
    const d = doc.data() || {};
    if (d.best_attempts === null || d.best_attempts === undefined) return;
    rows.push({
      nickname: doc.id,
      best_attempts: Number(d.best_attempts),
      best_time_sec: (d.best_time_sec === undefined || d.best_time_sec === null) ? 1e9 : Number(d.best_time_sec),
      wins: Number(d.wins || 0),
      plays: Number(d.plays || 0),
    });
  });
  rows.sort((a,b)=> (a.best_attempts - b.best_attempts) || (a.best_time_sec - b.best_time_sec));
  const top = rows.slice(0,10);

  if (top.length){
    $("hofName").textContent = top[0].nickname;
    $("hofAttempts").textContent = `${top[0].best_attempts}회`;
    $("hofTime").textContent = `${fmtSec(top[0].best_time_sec)}s`;
  } else {
    $("hofName").textContent = "-";
    $("hofAttempts").textContent = "-";
    $("hofTime").textContent = "-";
  }

  const totalPlays = rows.reduce((s,r)=> s + (r.plays||0), 0);
  const totalWins = rows.reduce((s,r)=> s + (r.wins||0), 0);
  $("statPlays").textContent = String(totalPlays);
  $("statWins").textContent = String(totalWins);

  renderTbody("overallTbody", top, (r,i)=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i+1}</td>
      <td>${r.nickname}</td>
      <td>${r.best_attempts}</td>
      <td>${fmtSec(r.best_time_sec)}</td>
      <td>${r.wins}/${r.plays}</td>
    `;
    return tr;
  }, 5);
}

async function loadRecentLogs(){
  const qy = query(collection(db, COL_LOGS), orderBy("ts","desc"), limit(10));
  const snap = await getDocs(qy);
  const rows = [];
  snap.forEach(doc=>{
    const d = doc.data() || {};
    const ts = d.ts?.toDate?.() ?? null;
    const kstStr = ts ? new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year:"numeric", month:"2-digit", day:"2-digit",
      hour:"2-digit", minute:"2-digit", second:"2-digit"
    }).format(ts) : "-";
    rows.push({
      time: kstStr,
      name: d.name || "",
      result: (d.result || ""),
      attempts: d.attempts ?? "",
      time_sec: d.time_sec ?? null,
      difficulty: d.difficulty || "",
    });
  });

  const wins = rows
    .filter(r => String(r.result).toLowerCase() === "win")
    .map(r=> Number(r.attempts))
    .filter(n=> Number.isFinite(n));
  $("statAvgWinAttempts").textContent = wins.length
    ? (wins.reduce((a,b)=>a+b,0)/wins.length).toFixed(2)
    : "-";

  renderTbody("recentTbody", rows, (r)=>{
    const tr = document.createElement("tr");
    const isWin = String(r.result).toLowerCase() === "win";
    tr.innerHTML = `
      <td>${r.time}</td>
      <td>${r.name}</td>
      <td class="${isWin ? "good":"bad"}">${isWin ? "WIN" : "LOSS"}</td>
      <td>${r.attempts}</td>
      <td>${isWin ? fmtSec(r.time_sec) : "-"}</td>
      <td>${r.difficulty}</td>
    `;
    return tr;
  }, 6);
}

async function loadTodayTop10(){
  const { startUtc, endUtc, label } = kstTodayRange();
  $("todayDate").textContent = label;

  const qy = query(
    collection(db, COL_LOGS),
    where("ts", ">=", startUtc),
    where("ts", "<", endUtc),
    where("result", "==", "win")
  );
  const snap = await getDocs(qy);

  const best = new Map();
  snap.forEach(doc=>{
    const d = doc.data() || {};
    const name = d.name;
    const a = Number(d.attempts);
    const t = (d.time_sec === null || d.time_sec === undefined) ? 1e9 : Number(d.time_sec);
    if (!name || !Number.isFinite(a)) return;
    const cur = best.get(name);
    const cand = { a, t };
    if (!cur || (cand.a < cur.a) || (cand.a === cur.a && cand.t < cur.t)) best.set(name, cand);
  });

  const rows = Array.from(best.entries()).map(([nickname, v])=>({ nickname, best_attempts:v.a, best_time_sec:v.t }));
  rows.sort((x,y)=> (x.best_attempts - y.best_attempts) || (x.best_time_sec - y.best_time_sec));
  const top = rows.slice(0,10);

  renderTbody("todayTbody", top, (r,i)=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i+1}</td>
      <td>${r.nickname}</td>
      <td>${r.best_attempts}</td>
      <td>${fmtSec(r.best_time_sec)}</td>
    `;
    return tr;
  }, 4);
}

async function loadDifficultyTop(diff){
  const qy = query(
    collection(db, COL_LOGS),
    where("difficulty", "==", diff),
    where("result", "==", "win")
  );
  const snap = await getDocs(qy);

  const best = new Map();
  snap.forEach(doc=>{
    const d = doc.data() || {};
    const name = d.name;
    const a = Number(d.attempts);
    const t = (d.time_sec === null || d.time_sec === undefined) ? 1e9 : Number(d.time_sec);
    if (!name || !Number.isFinite(a)) return;
    const cur = best.get(name);
    const cand = { a, t };
    if (!cur || (cand.a < cur.a) || (cand.a === cur.a && cand.t < cur.t)) best.set(name, cand);
  });

  const rows = Array.from(best.entries()).map(([nickname, v])=>({ nickname, best_attempts:v.a, best_time_sec:v.t }));
  rows.sort((x,y)=> (x.best_attempts - y.best_attempts) || (x.best_time_sec - y.best_time_sec));
  const top = rows.slice(0,10);

  renderTbody("diffTbody", top, (r,i)=>{
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i+1}</td>
      <td>${r.nickname}</td>
      <td>${r.best_attempts}</td>
      <td>${fmtSec(r.best_time_sec)}</td>
    `;
    return tr;
  }, 4);
}

async function loadAll(){
  $("errBox").style.display = "none";
  try{
    await loadOverallTop10();
    await loadRecentLogs();
    await loadTodayTop10();
    await loadDifficultyTop("쉬움");
  }catch(e){
    console.error(e);
    setErr("데이터 로딩 실패: " + (e?.message || String(e)));
  }
}

document.querySelectorAll(".tab").forEach(btn=>{
  btn.addEventListener("click", async ()=>{
    document.querySelectorAll(".tab").forEach(b=> b.classList.remove("active"));
    btn.classList.add("active");
    await loadDifficultyTop(btn.dataset.diff);
  });
});

$("btnRefresh").addEventListener("click", loadAll);

loadAll();

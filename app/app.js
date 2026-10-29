import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { makeCatalog, parseDay, planFor, applyProfile, HAUPTBLOECKE } from "../src/planungssprache.js";
import { readWorkbook, isoDay, TAGE } from "../src/excel.js";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $app = document.getElementById("app");
const $who = document.getElementById("who");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const toast = (t) => { const el = document.getElementById("toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 3500); };
const dShort = (iso) => { const d = new Date(iso + "T12:00:00"); return `${TAGE[(d.getDay() + 6) % 7]} ${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.`; };
const RATE = ["leicht", "ok", "fordernd", "schwer", "am Limit"];
const CHIPS_TECHNIK = ["müde", "unkonzentriert", "Technik gut umgesetzt", "powervoll", "Spaß gehabt"];
const CHIPS_NEBEN = ["wenig Schlaf", "Schule/Prüfung", "Ärger", "unglücklich", "kein Bock", "Alles supi!"];
const WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const isoDow = (iso) => ((new Date(iso + "T12:00:00").getDay() + 6) % 7) + 1;
const seesDay = (person, iso) => !person?.training_days?.length || person.training_days.includes(isoDow(iso));
const daysText = (d) => (d?.length ? d.slice().sort().map((x) => WD[x - 1]).join(", ") : "alle Tage");
const STATUS = ["fit", "müde", "gestresst", "Muskelkater", "krank", "verletzt"];
const SET_RATED = new Set(["Spezielle Würfe"]); // zusätzlich zu allen Blöcken mit Doku „Set“

let catalog = null;
async function cat() {
  if (!catalog) catalog = makeCatalog(await (await fetch("../data/uebungskatalog.json")).json());
  return catalog;
}

// ───────────── Anmeldung ─────────────
async function start() {
  const { data: { session } } = await sb.auth.getSession();
  // Nur bei echtem Wechsel neu laden: Supabase meldet SIGNED_IN auch beim Wiederherstellen einer bestehenden Sitzung
  const hadSession = !!session;
  sb.auth.onAuthStateChange((ev) => {
    if (ev === "SIGNED_OUT" && hadSession) location.reload();
    if (ev === "SIGNED_IN" && !hadSession) location.reload();
  });
  if (!session) return showLogin();
  const { data: me, error } = await sb.from("people").select("*").eq("id", session.user.id).maybeSingle();
  $who.innerHTML = `<span>${esc(me?.name || session.user.email)}</span><button id="pwset">Passwort</button><button id="logout">Abmelden</button>`;
  document.getElementById("logout").onclick = () => sb.auth.signOut();
  document.getElementById("pwset").onclick = showPasswordForm;
  if (error) return ($app.innerHTML = `<div class="card"><p>Fehler beim Laden: ${esc(error.message)}</p></div>`);
  if (!me || !me.active) return showPending(session.user);
  if (me.role === "athletin") return athleteView(me);
  return trainerView(me);
}

function showLogin() {
  $app.innerHTML = `<div class="card" style="max-width:460px">
    <h1 id="lt">Anmelden</h1>
    <form id="lf" style="display:grid;gap:10px">
      <input id="email" type="email" required autocomplete="email" placeholder="E-Mail">
      <input id="pw" type="password" required minlength="8" autocomplete="current-password" placeholder="Passwort (mind. 8 Zeichen)">
      <button class="btn" id="lb">Anmelden</button>
    </form>
    <p class="small"><a href="#" id="toggle">Neu hier? Konto anlegen</a></p>
    <p class="small muted" id="lmsg"></p>
    <p class="small muted">Passwort vergessen? Dein Trainer setzt dir ein neues; deine Einträge bleiben erhalten.</p></div>`;
  let mode = "login";
  const $msg = document.getElementById("lmsg");
  document.getElementById("toggle").onclick = (e) => {
    e.preventDefault(); mode = mode === "login" ? "signup" : "login";
    document.getElementById("lt").textContent = mode === "login" ? "Anmelden" : "Konto anlegen";
    document.getElementById("lb").textContent = mode === "login" ? "Anmelden" : "Konto anlegen";
    document.getElementById("pw").autocomplete = mode === "login" ? "current-password" : "new-password";
    e.target.textContent = mode === "login" ? "Neu hier? Konto anlegen" : "Schon ein Konto? Anmelden";
    $msg.textContent = "";
  };
  document.getElementById("lf").onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById("email").value.trim(), password = document.getElementById("pw").value;
    $msg.textContent = "…";
    const { data, error } = mode === "login"
      ? await sb.auth.signInWithPassword({ email, password })
      : await sb.auth.signUp({ email, password });
    if (error) {
      $msg.textContent = /invalid login/i.test(error.message) ? "E-Mail oder Passwort stimmt nicht." : /already registered/i.test(error.message) ? "Diese E-Mail hat schon ein Konto. Bitte anmelden." : `Das hat nicht geklappt: ${error.message}`;
      return;
    }
    if (!data.session) { $msg.textContent = "Konto angelegt, aber noch nicht aktiv: In Supabase muss „Confirm email“ ausgeschaltet sein."; return; }
    location.reload();
  };
}

function showPasswordForm() {
  const box = document.createElement("div");
  box.className = "card"; box.style.maxWidth = "460px";
  box.innerHTML = `<h2>Passwort festlegen</h2><form id="pwf" class="row"><input id="npw" type="password" minlength="8" required autocomplete="new-password" placeholder="Neues Passwort (mind. 8 Zeichen)" style="flex:1"><button class="btn">Speichern</button></form>`;
  $app.prepend(box);
  box.querySelector("form").onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: box.querySelector("#npw").value });
    if (error) return toast("Nicht gespeichert: " + error.message);
    toast("Passwort gespeichert"); box.remove();
  };
}

function showPending(user) {
  $app.innerHTML = `<div class="card" style="max-width:560px">
    <h1>Fast geschafft</h1>
    <p>Du bist angemeldet, aber noch nicht freigeschaltet. Schick deinem Trainer diesen Code:</p>
    <p><code id="uid">${esc(user.id)}</code></p>
    <div class="row"><button class="btn ghost" id="copy">Code kopieren</button></div>
  </div>`;
  document.getElementById("copy").onclick = async () => {
    try { await navigator.clipboard.writeText(user.id); toast("Kopiert"); } catch { getSelection().selectAllChildren(document.getElementById("uid")); }
  };
}

// ───────────── Athletin ─────────────
async function athleteView(me) {
  if (!me.consent_app_at) return consentScreen(me);
  const today = isoDay(new Date());
  const { data: units, error } = await sb.from("units").select("id,date,slot,kw,phase,week_hint,changed_at,released_at").order("date", { ascending: false }).order("slot").limit(60);
  if (error) return ($app.innerHTML = `<div class="card">${esc(error.message)}</div>`);
  const { data: diaries } = await sb.from("diary_entries").select("unit_id").eq("athlete_id", me.id);
  const done = new Set((diaries || []).map((d) => d.unit_id));
  if (!units.length) return ($app.innerHTML = `<div class="card"><h2>Noch kein Training freigegeben</h2><p class="muted">Sobald dein Trainer den nächsten Tag freigibt, erscheint er hier.</p></div>`);
  let cur = units.find((u) => u.date === today) || units[0];
  const draw = async () => {
    $app.innerHTML = `<div class="days" role="group" aria-label="Trainingstag">${units.slice().reverse().map((u) => `<button data-id="${u.id}" aria-pressed="${u.id === cur.id}" class="${done.has(u.id) ? "done" : ""}">${dShort(u.date)}${u.slot === 2 ? " E2" : ""}<small>${u.date === today ? "heute" : "KW " + (u.kw ?? "")}</small></button>`).join("")}</div><div id="day"></div>`;
    const bar = $app.querySelector(".days"); bar.scrollLeft = bar.scrollWidth;
    $app.querySelectorAll(".days button").forEach((b) => (b.onclick = () => { cur = units.find((u) => u.id === +b.dataset.id); draw(); }));
    await dayForm(me, cur, () => { done.add(cur.id); draw(); });
  };
  draw();
}

async function dayForm(me, unit, onSaved) {
  const $d = document.getElementById("day");
  const [{ data: lines }, { data: entry }, { data: cal }, { data: tests }] = await Promise.all([
    sb.from("plan_lines").select("*").eq("unit_id", unit.id),
    sb.from("diary_entries").select("*, diary_items(*)").eq("athlete_id", me.id).eq("unit_id", unit.id).maybeSingle(),
    sb.from("calendar_entries").select("*").lte("date_from", unit.date).gte("date_to", unit.date),
    sb.from("tests").select("exercise_name,value,date").eq("athlete_id", me.id).eq("test_type", "1RM").order("date", { ascending: false }),
  ]);
  const { data: devs } = await sb.from("deviations").select("*").eq("athlete_id", me.id).eq("unit_id", unit.id);
  const rm0 = {}; for (const t of tests || []) if (t.exercise_name && !(t.exercise_name in rm0)) rm0[t.exercise_name] = Number(t.value);
  const items0 = (lines || []).map((l) => ({ ...l.parsed, lineId: l.id, pos: l.position ?? l.parsed.pos, block: l.block }))
    .sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99));
  const { data: prof } = me.profile_code ? await sb.from("profiles").select("*").eq("code", me.profile_code).maybeSingle() : { data: null };
  const pr = applyProfile(items0, prof, me.sex);
  const adj = applyDeviations(pr.items, rm0, devs || []);
  const plan = planFor(me.name, adj.items, adj.rm);
  const prev = new Map((entry?.diary_items || []).map((i) => [`${i.plan_line_id}|${i.actual?.name || ""}|${i.actual?.set || ""}`, i]));
  const st = { befinden: new Set(entry?.befinden?.length ? entry.befinden : [entry?.status && entry.status !== "eingeschränkt" ? entry.status : "fit"]), day: entry?.day_rating || null, chips: new Set(entry?.chips || []), note: entry?.note || "", items: new Map() };

  // Blöcke in Planreihenfolge bündeln
  const blocks = [];
  for (const e of plan) { const l = blocks[blocks.length - 1]; if (l && l.block === e.block) l.items.push(e); else blocks.push({ block: e.block, doku: e.doku, items: [e] }); }
  const changed = unit.changed_at && unit.released_at && new Date(unit.changed_at) > new Date(unit.released_at);
  const pills = [...(cal || []).map((c) => `<span class="pill ${c.kind === "Feiertag" ? "bad" : c.kind === "Schulferien" ? "warn" : "ok"}">${esc(c.title)}</span>`),
    unit.week_hint ? `<span class="pill">${esc(unit.week_hint)}</span>` : "", changed ? `<span class="pill warn">nach Freigabe geändert</span>` : ""].join("");

  const rateHTML = (key, val) => `<div class="rate" data-key="${key}">${RATE.map((r, i) => `<button type="button" data-v="${i + 1}" aria-pressed="${val === i + 1}" title="${r}" aria-label="${i + 1} ${r}">${i + 1}</button>`).join("")}<span class="rlabel">${val ? RATE[val - 1] : ""}</span></div>`;
  const chipHTML = (key, list, sel) => `<div class="chips" data-key="${key}">${list.map((c) => `<button type="button" data-v="${esc(c)}" aria-pressed="${sel.has(c)}">${esc(c)}</button>`).join("")}</div>`;

  let html = `<div class="row"><h2>${dShort(unit.date)}${unit.slot === 2 ? " · Einheit 2" : ""}</h2>${pills}</div>`;
  if (adj.notes.length) html += `<div class="card adj"><h3>Für dich angepasst</h3>${adj.notes.map((n) => `<p>${esc(n)}</p>`).join("")}</div>`;
  html += `<div class="card"><h3>Wie geht's dir?</h3>${chipHTML("status", STATUS, st.befinden)}</div>`;
  blocks.forEach((b, bi) => {
    html += `<section class="blk"><h3>${esc(b.block)}<small>${b.doku === "Set" ? "als Block bewerten" : b.doku === "je Übung" ? "je Übung bewerten" : b.doku === "Würfe" ? "Würfe eintragen" : "abhaken"}</small></h3>`;
    b.items.forEach((e, ii) => {
      const key = `${e.lineId}|${e.name}|`;
      const old = prev.get(key);
      html += `<div class="item"><div class="ihead"><span class="iname">${e.replaced ? `<span class="tag">statt ${esc(e.replaced)}</span>` : ""}${esc(e.name)}</span><span class="idose">${esc(e.dose)}</span></div>`;
      if (e.detail || e.note) html += `<div class="idetail">${esc([e.detail, e.note].filter(Boolean).join(" · "))}</div>`;
      if (b.doku === "je Übung" && !e.test) {
        const planKg = (e.dose.match(/([\d]+(?:,\d+)?) kg/) || [])[1] || "";
        html += `<div class="ist"><label>Ist <input data-ist="${esc(key)}" value="${esc(old?.actual?.ist ?? e.dose.split(" · ")[0])}"></label><label>kg <input data-kg="${esc(key)}" inputmode="decimal" style="width:76px" placeholder="kg" value="${esc(old?.actual?.kg ?? planKg)}"></label></div>${rateHTML("i:" + key, old?.rating || null)}`;
      }
      else if (e.test) html += `<label class="ist">Maximalgewicht kg <input data-test="${esc(e.name)}" data-ist="${esc(key)}" inputmode="decimal" value="${esc(old?.actual?.ist ?? "")}"></label>`;
      else if (b.doku === "Würfe") {
        const rows = old?.actual?.wuerfe?.length ? old.actual.wuerfe : [{ form: "", geraet: "", n: "" }];
        html += `<div class="throws" data-throws="${esc(key)}">${rows.map((r) => `<div class="tr"><input placeholder="Wurfform" value="${esc(r.form)}"><input placeholder="Gerät" value="${esc(r.geraet)}"><input placeholder="Würfe" inputmode="numeric" value="${esc(r.n)}"></div>`).join("")}<button type="button" class="btn ghost" data-addrow>+ Wurfform</button></div>${chipHTML("t:" + key, CHIPS_TECHNIK, new Set(old?.chips || []))}`;
      } else if (b.doku !== "Set" && !SET_RATED.has(b.block)) html += `<label class="check"><input type="checkbox" data-done="${esc(key)}" ${old?.actual?.done ? "checked" : ""}> erledigt</label>`;
      html += `</div>`;
    });
    if (b.doku === "Set" || SET_RATED.has(b.block)) {
      const sk = `${b.items[0].lineId}|SET:${b.block}|`;
      html += `<div class="item setrate"><span class="small muted">Wie schwer war ${b.block === "Zirkel" ? "der Zirkel" : "der Block"}?</span>${rateHTML("i:" + sk, prev.get(sk)?.rating || null)}</div>`;
    }
    html += `</section>`;
  });
  html += `<div class="card"><h3>Trainingstag gesamt</h3>${rateHTML("day", st.day)}<h3>Was war los?</h3>${chipHTML("neben", CHIPS_NEBEN, st.chips)}<textarea id="note" placeholder="Kommentar (freiwillig)">${esc(st.note)}</textarea>
    <button class="btn" id="save">${entry ? "Änderungen speichern" : "Training speichern"}</button></div>`;
  $d.innerHTML = html;

  // Interaktion
  const ratings = new Map(); const chipSel = new Map();
  $d.querySelectorAll(".rate").forEach((g) => g.querySelectorAll("button").forEach((b) => (b.onclick = () => {
    g.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", "false")); b.setAttribute("aria-pressed", "true"); ratings.set(g.dataset.key, +b.dataset.v);
    g.querySelector(".rlabel").textContent = RATE[+b.dataset.v - 1];
  })));
  $d.querySelectorAll(".rate").forEach((g) => { const s = g.querySelector('[aria-pressed="true"]'); if (s) ratings.set(g.dataset.key, +s.dataset.v); });
  $d.querySelectorAll(".chips").forEach((g) => {
    const isStatus = g.dataset.key === "status";
    chipSel.set(g.dataset.key, new Set([...g.querySelectorAll('[aria-pressed="true"]')].map((b) => b.dataset.v)));
    g.querySelectorAll("button").forEach((b) => (b.onclick = () => {
      const s = chipSel.get(g.dataset.key);
      if (s.has(b.dataset.v)) { s.delete(b.dataset.v); b.setAttribute("aria-pressed", "false"); } else { s.add(b.dataset.v); b.setAttribute("aria-pressed", "true"); }
      if (isStatus) { // „fit“ schließt alles andere aus
        if (b.dataset.v === "fit" && s.has("fit")) [...s].forEach((v) => v !== "fit" && s.delete(v));
        if (b.dataset.v !== "fit") s.delete("fit");
        g.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(s.has(x.dataset.v))));
      }
    }));
  });
  $d.querySelectorAll("[data-addrow]").forEach((b) => (b.onclick = () => {
    const r = document.createElement("div"); r.className = "tr";
    r.innerHTML = `<input placeholder="Wurfform"><input placeholder="Gerät"><input placeholder="Würfe" inputmode="numeric">`;
    b.before(r); r.querySelector("input").focus();
  }));

  document.getElementById("save").onclick = async () => {
    const dayRating = ratings.get("day");
    if (!dayRating) return toast("Bitte den Trainingstag gesamt bewerten");
    const btn = document.getElementById("save"); btn.disabled = true;
    const bef = [...chipSel.get("status")];
    const status = bef.includes("verletzt") ? "verletzt" : bef.includes("krank") ? "krank" : bef.find((v) => v !== "fit") || "fit";
    const row = { athlete_id: me.id, unit_id: unit.id, status, befinden: bef.length ? bef : ["fit"], day_rating: dayRating,
      chips: [...(chipSel.get("neben") || [])], note: document.getElementById("note").value.trim() || null, updated_at: new Date().toISOString() };
    const { data: saved, error } = await sb.from("diary_entries").upsert(row, { onConflict: "athlete_id,unit_id" }).select("id").single();
    if (error) { btn.disabled = false; return toast("Speichern fehlgeschlagen: " + error.message); }
    const out = [];
    const lineOf = (key) => +key.split("|")[0] || null;
    for (const [k, v] of ratings) if (k.startsWith("i:")) { const key = k.slice(2); out.push({ diary_id: saved.id, plan_line_id: lineOf(key), rating: v, actual: { name: key.split("|")[1] } }); }
    $d.querySelectorAll("[data-ist]").forEach((inp) => {
      const key = inp.dataset.ist; const ex = out.find((o) => `${o.plan_line_id}|${o.actual.name}|` === key);
      if (ex) ex.actual.ist = inp.value; else out.push({ diary_id: saved.id, plan_line_id: lineOf(key), actual: { name: key.split("|")[1], ist: inp.value } });
    });
    $d.querySelectorAll("[data-kg]").forEach((inp) => {
      const key = inp.dataset.kg; const ex = out.find((o) => `${o.plan_line_id}|${o.actual.name}|` === key);
      const kg = inp.value.trim() ? Number(inp.value.replace(",", ".")) : null;
      if (ex) ex.actual.kg = kg; else out.push({ diary_id: saved.id, plan_line_id: lineOf(key), actual: { name: key.split("|")[1], kg } });
    });
    const testRows = [...$d.querySelectorAll("[data-test]")].filter((i) => i.value.trim()).map((i) => ({ athlete_id: me.id, date: unit.date, test_type: "1RM",
      exercise_name: i.dataset.test, value: Number(i.value.replace(",", ".")), unit: "kg", context: "Test", created_by: me.id }));
    if (testRows.length) { const { error: et } = await sb.from("tests").upsert(testRows, { onConflict: "athlete_id,date,test_type,exercise_name" }); if (et) toast("Testwerte nicht gespeichert: " + et.message); }
    $d.querySelectorAll("[data-done]").forEach((cb) => out.push({ diary_id: saved.id, plan_line_id: lineOf(cb.dataset.done), actual: { name: cb.dataset.done.split("|")[1], done: cb.checked } }));
    $d.querySelectorAll("[data-throws]").forEach((w) => {
      const key = w.dataset.throws;
      const wuerfe = [...w.querySelectorAll(".tr")].map((r) => { const [a, b, c] = r.querySelectorAll("input"); return { form: a.value.trim(), geraet: b.value.trim(), n: c.value.trim() }; }).filter((r) => r.form || r.n);
      out.push({ diary_id: saved.id, plan_line_id: lineOf(key), actual: { name: key.split("|")[1], wuerfe }, chips: [...(chipSel.get("t:" + key) || [])] });
    });
    await sb.from("diary_items").delete().eq("diary_id", saved.id);
    const { error: e2 } = out.length ? await sb.from("diary_items").insert(out) : { error: null };
    btn.disabled = false;
    if (e2) return toast("Einzelwerte nicht gespeichert: " + e2.message);
    toast("Gespeichert"); onSaved();
  };
}

// ───────────── Trainer ─────────────
async function trainerView(me) {
  const tabs = me.role === "planer" ? ["Rückmeldungen", "Tagebuch", "Plan hochladen", "Freigabe", "Personen", "Sicherung"] : ["Rückmeldungen", "Tagebuch"];
  let cur = tabs[0];
  const draw = () => {
    $app.innerHTML = `<div class="tabs" role="tablist">${tabs.map((t) => `<button role="tab" aria-selected="${t === cur}">${t}</button>`).join("")}</div><div id="pane"></div>`;
    $app.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => { cur = b.textContent; draw(); }));
    ({ "Rückmeldungen": feedbackPane, "Tagebuch": diaryPane, "Plan hochladen": uploadPane, "Freigabe": releasePane, "Personen": peoplePane, "Sicherung": backupPane })[cur](me);
  };
  draw();
}

async function feedbackPane(me) {
  const $p = document.getElementById("pane");
  const since = isoDay(new Date(Date.now() - 28 * 864e5)); const today = isoDay(new Date());
  const [{ data: people }, { data: units }, { data: entries }] = await Promise.all([
    sb.from("people").select("id,name,role,active,training_days").eq("role", "athletin").eq("active", true).order("name"),
    sb.from("units").select("id,date,slot,released").gte("date", since).lte("date", today).eq("released", true).order("date"),
    sb.from("diary_entries").select("*, units(date,slot)").gte("created_at", since + "T00:00:00").order("created_at", { ascending: false }),
  ]);
  const { data: openTests } = await sb.from("tests").select("*").eq("confirmed", false).order("date", { ascending: false });
  // Hinweis Wiedereinstieg: die letzten 3 freigegebenen Einheiten krank/verletzt oder nicht dokumentiert
  const hints = (people || []).map((p) => {
    const last3 = (units || []).filter((u) => seesDay(p, u.date)).slice(-3);
    if (last3.length < 3) return { p, miss: 0 };
    const miss = last3.filter((u) => { const e = (entries || []).find((x) => x.athlete_id === p.id && x.unit_id === u.id); return !e || ["krank", "verletzt"].includes(e.status); });
    return { p, miss: miss.length };
  }).filter((h) => h.miss >= 3);
  const name = (id) => (people || []).find((p) => p.id === id)?.name || "?";
  $p.innerHTML = `${hints.length ? `<div class="card"><h3>Wiedereinstieg prüfen</h3>${hints.map((h) => `<div class="row" style="justify-content:space-between"><p><b>${esc(h.p.name)}</b>: die letzten ${h.miss} Einheiten krank, verletzt oder nicht dokumentiert.</p><button class="btn ghost" data-adjust="${esc(h.p.id)}">Anpassen</button></div>`).join("")}<div id="devform"></div></div>` : ""}
    ${(openTests || []).length ? `<div class="card"><h3>Neue Testwerte bestätigen</h3><div class="tablewrap"><table><thead><tr><th>Tag</th><th>Athletin</th><th>Übung</th><th>Wert</th><th></th></tr></thead><tbody>${openTests.map((t) => `<tr><td>${dShort(t.date)}</td><td>${esc(name(t.athlete_id))}</td><td>${esc(t.exercise_name || t.test_type)}</td><td>${esc(t.value)} ${esc(t.unit)}</td><td><button class="btn ghost" data-confirm="${t.id}">bestätigen</button></td></tr>`).join("")}</tbody></table></div></div>` : ""}
    <div class="card"><h3>Rückmeldungen der letzten 4 Wochen</h3>${(entries || []).length ? `<div class="tablewrap"><table><thead><tr><th>Tag</th><th>Athletin</th><th>Status</th><th>Tag gesamt</th><th>Nebenfaktoren</th><th>Kommentar</th></tr></thead><tbody>${entries.map((e) => `<tr><td>${e.units ? dShort(e.units.date) : ""}</td><td>${esc(name(e.athlete_id))}</td><td>${(e.befinden?.length ? e.befinden : [e.status]).map((v) => v === "fit" ? "fit" : `<span class="pill ${["krank", "verletzt"].includes(v) ? "bad" : "warn"}">${esc(v)}</span>`).join(" ")}</td><td>${e.day_rating ? `${e.day_rating} · ${RATE[e.day_rating - 1]}` : ""}</td><td>${esc((e.chips || []).join(", "))}</td><td>${esc(e.note || "")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Noch keine Rückmeldungen.</p>`}</div>`;
  $p.querySelectorAll("[data-adjust]").forEach((b) => (b.onclick = () => deviationForm(document.getElementById("devform"), me, people, b.dataset.adjust, "Wiedereinstieg")));
  $p.querySelectorAll("[data-confirm]").forEach((b) => (b.onclick = async () => {
    const { error } = await sb.from("tests").update({ confirmed: true }).eq("id", +b.dataset.confirm);
    if (error) return toast(error.message); toast("Bestätigt"); feedbackPane();
  }));
}

async function uploadPane(me) {
  const $p = document.getElementById("pane");
  $p.innerHTML = `<div class="card"><h3>Plan hochladen</h3><p class="muted">Excel-Datei wählen. Sie wird geprüft; erst wenn sie fehlerfrei ist, kannst du sie übernehmen. Bereits vorhandene Tage werden ersetzt, Tagebucheinträge bleiben erhalten.</p>
    <input type="file" id="f" accept=".xlsx,.xlsm"><div id="res"></div></div>`;
  document.getElementById("f").onchange = async (ev) => {
    const file = ev.target.files[0]; if (!file) return;
    const $r = document.getElementById("res"); $r.innerHTML = `<p class="muted">Prüfe …</p>`;
    let data;
    try { data = readWorkbook(XLSX, XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellDates: true })); }
    catch (e) { return ($r.innerHTML = `<p>Datei konnte nicht gelesen werden: ${esc(e.message)}</p>`); }
    const c = await cat();
    const { data: ppl } = await sb.from("people").select("name").eq("role", "athletin");
    const athletes = (ppl || []).map((p) => p.name);
    const notYet = data.athletes.filter((n) => !athletes.includes(n));
    const days = []; const problems = [];
    for (const w of data.weeks) w.days.forEach((d, di) => {
      d.cells.filter((x) => !HAUPTBLOECKE.includes(x.block)).forEach((x) => problems.push({ level: "Fehler", text: `Unbekannter Hauptblock „${x.block}“`, cell: x.cell, where: `KW ${w.kw} ${TAGE[di]}` }));
      const r = parseDay(d.cells, c, [...new Set([...athletes, ...data.athletes])]);
      r.problems.forEach((p) => problems.push({ ...p, where: `KW ${w.kw} ${TAGE[di]}` }));
      if (d.date) days.push({ w, d, items: r.items });
    });
    const errs = problems.filter((p) => p.level === "Fehler");
    const lines = days.reduce((a, x) => a + x.items.length, 0);
    $r.innerHTML = `<p><b>${data.weeks.length}</b> Wochen · <b>${days.filter((x) => x.items.length).length}</b> Trainingstage · <b>${lines}</b> Zeilen · <b>${errs.length}</b> Fehler · <b>${problems.length - errs.length}</b> Hinweise</p>
      ${notYet.length ? `<p class="small muted">Noch nicht freigeschaltet: ${esc(notYet.join(", "))}. Ihr Plan wird trotzdem übernommen und erscheint, sobald du sie unter „Personen“ freischaltest.</p>` : ""}${problems.map((p) => `<div class="prob"><span class="pill ${p.level === "Fehler" ? "bad" : "warn"}">${p.level}</span><span>${esc(p.where)}: ${esc(p.text)}</span><code>${esc(p.cell || "")}</code></div>`).join("")}
      <div class="row"><button class="btn" id="go" ${errs.length ? "disabled" : ""}>In die Datenbank übernehmen</button>${errs.length ? `<span class="small muted">Erst die Fehler in der Excel beheben.</span>` : ""}</div><p class="small muted" id="prog"></p>`;
    if (errs.length) return;
    document.getElementById("go").onclick = async () => {
      const btn = document.getElementById("go"); btn.disabled = true; const $g = document.getElementById("prog");
      const from = isoDay(days[0].d.date), to = isoDay(days[days.length - 1].d.date);
      // Kalender (Ferien, Feiertage, Termine) im Zeitraum ersetzen
      await sb.from("calendar_entries").delete().gte("date_from", from).lte("date_from", to);
      const calRows = [];
      for (const { d } of days) {
        const day = isoDay(d.date);
        if (d.kalender) calRows.push({ date_from: day, date_to: day, kind: /ferien/i.test(d.kalender) ? "Schulferien" : "Feiertag", title: d.kalender });
        if (d.termine) calRows.push({ date_from: day, date_to: day, kind: /^frei$/i.test(d.termine.trim()) ? "frei" : /wettkampf|meisterschaft|sportfest|werfertag/i.test(d.termine) ? "Wettkampf" : /trainingslager|\bTL\b/i.test(d.termine) ? "Trainingslager" : "Termin", title: d.termine });
      }
      if (calRows.length) { const { error } = await sb.from("calendar_entries").insert(calRows); if (error) return ($g.textContent = "Kalender: " + error.message); }
      let n = 0;
      for (const { w, d, items } of days) {
        if (!items.length) continue;
        for (const slot of [...new Set(items.map((i) => i.slot || 1))]) {
          const its = items.filter((i) => (i.slot || 1) === slot);
          const { data: u, error } = await sb.from("units").upsert({ date: isoDay(d.date), slot, kw: w.kw, phase: w.phase, week_hint: w.hint, changed_at: new Date().toISOString() }, { onConflict: "date,slot" }).select("id").single();
          if (error) return ($g.textContent = `${isoDay(d.date)}: ${error.message}`);
          await sb.from("plan_lines").delete().eq("unit_id", u.id);
          const { error: e2 } = await sb.from("plan_lines").insert(its.map((p) => ({ unit_id: u.id, position: p.pos, block: p.block, raw_text: p.raw, parsed: p, author_id: me.id, source_cell: p.cell })));
          if (e2) return ($g.textContent = `${isoDay(d.date)}: ${e2.message}`);
          n++; $g.textContent = `${n} Einheiten übernommen …`;
        }
      }
      $g.textContent = `Fertig: ${n} Einheiten übernommen. Unter „Freigabe“ gibst du die Tage für die Athletinnen frei.`; toast("Plan übernommen");
    };
  };
}

async function releasePane() {
  const $p = document.getElementById("pane");
  const today = isoDay(new Date());
  const { data: units } = await sb.from("units").select("id,date,slot,kw,released,changed_at,released_at").gte("date", isoDay(new Date(Date.now() - 7 * 864e5))).order("date").order("slot").limit(40);
  $p.innerHTML = `<div class="card"><h3>Freigabe</h3><p class="muted">Athletinnen sehen freigegebene Tage bis einschließlich heute, nie künftige. Du kannst also ruhig im Voraus freigeben.</p>
    <div class="row"><label>Freigeben bis <input type="date" id="upto" value="${today}"></label><button class="btn" id="rel">Freigeben</button></div>
    <div class="tablewrap"><table><thead><tr><th>Tag</th><th>KW</th><th>Status</th></tr></thead><tbody>${(units || []).map((u) => `<tr><td>${dShort(u.date)}${u.slot === 2 ? " E2" : ""}</td><td>${u.kw ?? ""}</td><td>${u.released ? (u.changed_at && u.released_at && new Date(u.changed_at) > new Date(u.released_at) ? `<span class="pill warn">freigegeben, danach geändert</span>` : `<span class="pill ok">freigegeben</span>`) : `<span class="pill">nicht freigegeben</span>`}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">Noch keine Einheiten. Erst unter „Plan hochladen“ übernehmen.</td></tr>`}</tbody></table></div></div>`;
  document.getElementById("rel").onclick = async () => {
    const upto = document.getElementById("upto").value;
    const { error } = await sb.from("units").update({ released: true, released_at: new Date().toISOString() }).lte("date", upto).eq("released", false);
    if (error) return toast(error.message);
    toast("Freigegeben"); releasePane();
  };
}

async function peoplePane() {
  const $p = document.getElementById("pane");
  const { data: people } = await sb.from("people").select("*").order("role").order("name");
  const { data: profiles } = await sb.from("profiles").select("*").order("code");
  const PROF = (profiles || []).map((x) => x.code);
  const IMPL = ["Kugel", "Diskus", "Speer", "Hammer"];
  $p.innerHTML = `<div class="card"><h3>Personen</h3>
    <div class="tablewrap"><table><thead><tr><th>Name</th><th>Rolle</th><th>Trainingstage</th><th>Profil · w/m</th><th>Einwilligung Papier</th><th>App bestätigt</th><th>aktiv</th><th></th></tr></thead><tbody>${(people || []).map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(x.role)}</td><td>${x.role === "athletin" ? `<div class="chips daysel" data-pid="${esc(x.id)}">${WD.map((w, i) => `<button type="button" data-d="${i + 1}" aria-pressed="${!!x.training_days?.includes(i + 1)}">${w}</button>`).join("")}</div><span class="small muted">${daysText(x.training_days)}</span>` : ""}</td><td>${x.role === "athletin" ? `<select class="psel" data-pid="${esc(x.id)}" data-f="profile_code"><option value="">–</option>${PROF.map((c) => `<option ${c === x.profile_code ? "selected" : ""}>${esc(c)}</option>`).join("")}</select> <select class="psel" data-pid="${esc(x.id)}" data-f="sex"><option value="">w/m</option><option value="w" ${x.sex === "w" ? "selected" : ""}>w</option><option value="m" ${x.sex === "m" ? "selected" : ""}>m</option></select>` : ""}</td><td>${esc(x.consent_on || "")}</td><td>${x.consent_app_at ? esc(x.consent_app_at.slice(0, 10)) : x.role === "athletin" ? '<span class="pill warn">offen</span>' : ""}</td><td>${x.active ? "ja" : "nein"}</td><td>${x.role !== "planer" ? `<button class="btn ghost" data-reset="${esc(x.id)}" data-name="${esc(x.name)}">Passwort zurücksetzen</button>` : ""}</td></tr>`).join("")}</tbody></table></div>
    <form id="rf" class="row" hidden><span id="rname"></span><input id="rpw" minlength="8" required placeholder="Vorläufiges Passwort (mind. 8 Zeichen)" style="flex:1"><button class="btn">Setzen</button></form></div>
    <div class="card"><h3>Person freischalten</h3><p class="muted small">Die Athletin meldet sich einmal mit ihrer E-Mail an und schickt dir den angezeigten Code.</p>
    <form id="pf" class="row"><input id="pid" required placeholder="Code (ID)" style="flex:2 1 240px"><input id="pname" required placeholder="Name wie im Plan" style="flex:1 1 120px">
    <select id="prole"><option value="athletin">Athletin</option><option value="cotrainer">Co-Trainer</option></select>
    <span class="small">Tage</span><div class="chips" id="pdays">${WD.map((w, i) => `<button type="button" data-d="${i + 1}" aria-pressed="false">${w}</button>`).join("")}</div><select id="pprof"><option value="">Profil</option>${PROF.map((c) => `<option>${esc(c)}</option>`).join("")}</select><select id="psex"><option value="">w/m</option><option value="w">w</option><option value="m">m</option></select><label class="small">Einwilligung <input type="date" id="pcons"></label><button class="btn">Freischalten</button></form></div>
    <div class="card"><h3>Profile</h3><p class="small muted">Umfang: Wiederholungen bei Kraft und Sprüngen in Prozent des Gruppenplans. Prozentwerte der Last bleiben gleich und beziehen sich auf den eigenen Maximaltest. Geräte erscheinen bei der Technik passend zu w/m.</p>
    <div class="tablewrap"><table><thead><tr><th>Profil</th><th>Umfang %</th>${IMPL.map((i) => `<th>${i} w / m</th>`).join("")}<th>gesperrte Übungen</th><th></th></tr></thead><tbody>${(profiles || []).map((x) => `<tr data-code="${esc(x.code)}"><td><b>${esc(x.code)}</b></td><td><input class="pf-f" type="number" step="5" value="${Math.round(Number(x.volume_factor) * 100)}" style="width:70px"></td>${IMPL.map((i) => `<td><input class="pf-i" data-i="${i}" data-s="w" value="${esc(x.implements?.[i]?.w || "")}" style="width:64px"> <input class="pf-i" data-i="${i}" data-s="m" value="${esc(x.implements?.[i]?.m || "")}" style="width:64px"></td>`).join("")}<td><input class="pf-b" value="${esc((x.blocked || []).join(", "))}" placeholder="Name wie im Katalog"></td><td><button class="btn ghost pf-save">Speichern</button></td></tr>`).join("")}</tbody></table></div></div>`;
  let resetId = null;
  $p.querySelectorAll("[data-reset]").forEach((b) => (b.onclick = () => {
    resetId = b.dataset.reset; const f = document.getElementById("rf"); f.hidden = false;
    document.getElementById("rname").textContent = `Neues Passwort für ${b.dataset.name}:`; document.getElementById("rpw").focus();
  }));
  document.getElementById("rf").onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await sb.rpc("reset_password", { target: resetId, new_password: document.getElementById("rpw").value });
    if (error) return toast("Nicht gesetzt: " + error.message);
    toast("Passwort gesetzt. Gib es der Athletin weiter; sie kann es danach unter „Passwort“ ändern.");
    document.getElementById("rf").hidden = true; document.getElementById("rpw").value = "";
  };
  document.querySelectorAll("#pdays button").forEach((b) => (b.onclick = () => b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"))));
  $p.querySelectorAll(".daysel").forEach((g) => g.querySelectorAll("button").forEach((b) => (b.onclick = async () => {
    b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true"));
    const days = [...g.querySelectorAll('[aria-pressed="true"]')].map((x) => +x.dataset.d);
    const { error } = await sb.from("people").update({ training_days: days.length ? days : null }).eq("id", g.dataset.pid);
    if (error) return toast("Nicht gespeichert: " + error.message);
    g.nextElementSibling.textContent = daysText(days); toast("Trainingstage gespeichert");
  })));
  $p.querySelectorAll(".psel").forEach((sel) => (sel.onchange = async () => {
    const { error } = await sb.from("people").update({ [sel.dataset.f]: sel.value || null }).eq("id", sel.dataset.pid);
    toast(error ? "Nicht gespeichert: " + error.message : "Gespeichert");
  }));
  $p.querySelectorAll(".pf-save").forEach((b) => (b.onclick = async () => {
    const tr = b.closest("tr"); const impl = {};
    tr.querySelectorAll(".pf-i").forEach((i) => { if (i.value.trim()) (impl[i.dataset.i] ||= {})[i.dataset.s] = i.value.trim(); });
    const row = { volume_factor: Number(tr.querySelector(".pf-f").value) / 100, implements: impl, blocked: tr.querySelector(".pf-b").value.split(",").map((x) => x.trim()).filter(Boolean) };
    const { error } = await sb.from("profiles").update(row).eq("code", tr.dataset.code);
    toast(error ? "Nicht gespeichert: " + error.message : `Profil ${tr.dataset.code} gespeichert`);
  }));
  document.getElementById("pf").onsubmit = async (e) => {
    e.preventDefault();
    const row = { id: document.getElementById("pid").value.trim(), name: document.getElementById("pname").value.trim(), role: document.getElementById("prole").value,
      profile_code: document.getElementById("pprof").value || null, sex: document.getElementById("psex").value || null, consent_on: document.getElementById("pcons").value || null,
      training_days: [...document.querySelectorAll('#pdays [aria-pressed="true"]')].map((b) => +b.dataset.d) };
    if (!row.training_days.length) row.training_days = null;
    const { error } = await sb.from("people").insert(row);
    if (error) return toast("Nicht gespeichert: " + error.message);
    toast(`${row.name} freigeschaltet`); peoplePane();
  };
}

// ───────────── Einwilligung ─────────────
function consentScreen(me) {
  $app.innerHTML = `<div class="card" style="max-width:620px">
    <h1>Bevor es losgeht</h1>
    <p>In dieser App führst du dein Trainingstagebuch. Dafür werden gespeichert:</p>
    <ul><li>dein Name, deine E-Mail und dein Geburtsjahr,</li><li>deine Trainingsdoku: Bewertungen, Gewichte, Würfe, Kommentare,</li><li>dein Befinden, auch <b>krank oder verletzt</b>,</li><li>Testwerte und Wettkampfergebnisse (die sieht die ganze Gruppe).</li></ul>
    <p>Tagebuch und Befinden sehen nur du und deine Trainer. Die Daten liegen auf einem Server in Frankfurt. Du kannst die Einwilligung jederzeit beim Trainer widerrufen.</p>
    <p><a href="../docs/einwilligung.html" target="_blank" rel="noopener">Vollständigen Text lesen</a></p>
    <label class="check" style="color:var(--ink)"><input type="checkbox" id="ok"> Ich habe den Text gelesen und willige ein.</label>
    <p class="small muted">Unter 18? Dann brauchst du zusätzlich die unterschriebene Einwilligung deiner Eltern auf Papier.</p>
    <button class="btn" id="go" disabled>Einwilligen und weiter</button></div>`;
  const ok = document.getElementById("ok"), go = document.getElementById("go");
  ok.onchange = () => (go.disabled = !ok.checked);
  go.onclick = async () => {
    const { error } = await sb.rpc("accept_consent");
    if (error) return toast("Nicht gespeichert: " + error.message);
    me.consent_app_at = new Date().toISOString(); athleteView(me);
  };
}

// ───────────── Abweichungen ─────────────
const DEV_KINDS = { last_prozent: "Last ändern (%)", umfang_prozent: "Umfang ändern (%)", block_weglassen: "Hauptblock weglassen", hinweis: "Nur Hinweis an die Athletin" };
const REASONS = ["Wiedereinstieg", "krank", "verletzt", "Wettkampf", "Schule", "Test", "Sonstiges"];
const devText = (d) => d.kind === "last_prozent" ? `Last ${d.value?.v > 0 ? "+" : ""}${d.value?.v} %` : d.kind === "umfang_prozent" ? `Umfang ${d.value?.v > 0 ? "+" : ""}${d.value?.v} %` : d.kind === "block_weglassen" ? `ohne ${d.value?.block}` : "Hinweis";

/** Abweichungen auf die geparsten Planzeilen anwenden (vor planFor) */
function applyDeviations(items, rm, devs) {
  let out = items.map((i) => JSON.parse(JSON.stringify(i)));
  const rmAdj = { ...rm }; const notes = [];
  for (const d of devs) {
    const v = Number(d.value?.v) || 0;
    if (d.kind === "last_prozent") {
      for (const k in rmAdj) rmAdj[k] = rmAdj[k] * (1 + v / 100);
      out.forEach((i) => { if (i.type === "strength") i.note = [i.note, `Last ${v > 0 ? "+" : ""}${v} %`].filter(Boolean).join(" · "); });
    } else if (d.kind === "umfang_prozent") {
      const f = 1 + v / 100, r = (x) => Math.max(1, Math.round(x * f));
      out.forEach((i) => {
        if (i.setGroups) i.setGroups = i.setGroups.map((g) => ({ ...g, sets: r(g.sets) }));
        if (i.type === "series" || i.type === "circuit" || i.type === "sequence") i.rounds = r(i.rounds);
        if (i.type === "runs") i.runs = r(i.runs);
        if (i.type === "count") i.count = Math.round(i.count * f);
      });
    } else if (d.kind === "block_weglassen") out = out.filter((i) => i.block !== d.value?.block);
    notes.push(`${devText(d)} · ${d.reason}${d.note ? " · " + d.note : ""}`);
  }
  return { items: out, rm: rmAdj, notes };
}

async function deviationForm(box, me, people, athleteId = null, reason = "Wiedereinstieg") {
  const today = isoDay(new Date());
  const { data: units } = await sb.from("units").select("id,date,slot").gte("date", today).order("date").order("slot").limit(30);
  if (!(units || []).length) return (box.innerHTML = `<p class="muted">Es sind noch keine kommenden Einheiten hochgeladen.</p>`);
  box.innerHTML = `<form class="card" id="dvf" style="margin-top:8px">
    <h3>Abweichung festlegen</h3>
    <div class="row"><label>Athletin <select id="dva">${(people || []).map((p) => `<option value="${esc(p.id)}" ${p.id === athleteId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
      <label>ab <select id="dvu">${units.map((u) => `<option value="${u.id}">${dShort(u.date)}${u.slot === 2 ? " E2" : ""}</option>`).join("")}</select></label>
      <label>für <select id="dvn">${[1, 2, 3, 4, 5].map((n) => `<option value="${n}">${n} Einheit${n > 1 ? "en" : ""}</option>`).join("")}</select></label></div>
    <div class="row"><label>Art <select id="dvk">${Object.entries(DEV_KINDS).map(([k, t]) => `<option value="${k}">${t}</option>`).join("")}</select></label>
      <label id="dvvl">Wert <input id="dvv" type="number" step="5" value="-10" style="width:80px"> %</label>
      <label id="dvbl" hidden>Block <select id="dvb">${HAUPTBLOECKE.map((b) => `<option>${esc(b)}</option>`).join("")}</select></label>
      <label>Anlass <select id="dvr">${REASONS.map((r) => `<option ${r === reason ? "selected" : ""}>${r}</option>`).join("")}</select></label></div>
    <input id="dvt" placeholder="Notiz an die Athletin (freiwillig)">
    <div class="row"><button class="btn">Speichern</button><span class="small muted">Die Athletin sieht die Anpassung oben in ihrem Tag; gesammelt werden daraus später deine Faustregeln.</span></div></form>`;
  const kind = document.getElementById("dvk");
  kind.onchange = () => { document.getElementById("dvvl").hidden = !kind.value.endsWith("prozent"); document.getElementById("dvbl").hidden = kind.value !== "block_weglassen"; };
  document.getElementById("dvf").onsubmit = async (e) => {
    e.preventDefault();
    const start = units.findIndex((u) => u.id === +document.getElementById("dvu").value);
    const sel = units.slice(start, start + +document.getElementById("dvn").value);
    const k = kind.value;
    const value = k.endsWith("prozent") ? { v: Number(document.getElementById("dvv").value) } : k === "block_weglassen" ? { block: document.getElementById("dvb").value } : null;
    const rows = sel.map((u) => ({ athlete_id: document.getElementById("dva").value, unit_id: u.id, kind: k, value, reason: document.getElementById("dvr").value, note: document.getElementById("dvt").value.trim() || null, author_id: me.id }));
    const { error } = await sb.from("deviations").insert(rows);
    if (error) return toast("Nicht gespeichert: " + error.message);
    toast(`Gespeichert für ${rows.length} Einheit${rows.length > 1 ? "en" : ""}`); box.innerHTML = "";
  };
}

// ───────────── Tagebuch je Athletin (Trainer) ─────────────
async function diaryPane(me) {
  const $p = document.getElementById("pane");
  const { data: people } = await sb.from("people").select("id,name,training_days,profile_code,sex").eq("role", "athletin").eq("active", true).order("name");
  const { data: profiles } = await sb.from("profiles").select("*");
  if (!(people || []).length) return ($p.innerHTML = `<div class="card"><p class="muted">Noch keine Athletinnen freigeschaltet.</p></div>`);
  let sel = diaryPane.sel && people.find((p) => p.id === diaryPane.sel) ? diaryPane.sel : people[0].id;
  $p.innerHTML = `<div class="row"><div class="chips" id="dpa">${people.map((p) => `<button type="button" data-id="${esc(p.id)}" aria-pressed="${p.id === sel}">${esc(p.name)}</button>`).join("")}</div>
    <button class="btn ghost" id="dpdev">Abweichung festlegen</button></div><div id="dpform"></div><div id="dplist" style="display:grid;gap:12px"><p class="muted">Lädt …</p></div>`;
  $p.querySelectorAll("#dpa button").forEach((b) => (b.onclick = () => { diaryPane.sel = b.dataset.id; diaryPane(me); }));
  document.getElementById("dpdev").onclick = () => deviationForm(document.getElementById("dpform"), me, people, sel, "Sonstiges");
  const ath = people.find((p) => p.id === sel);
  const since = isoDay(new Date(Date.now() - 21 * 864e5)), today = isoDay(new Date());
  const { data: allUnits } = await sb.from("units").select("id,date,slot").gte("date", since).lte("date", today).eq("released", true).order("date", { ascending: false }).order("slot");
  const units = (allUnits || []).filter((u) => seesDay(ath, u.date));
  const ids = units.map((u) => u.id);
  if (!ids.length) return (document.getElementById("dplist").innerHTML = `<p class="muted">In den letzten drei Wochen wurde nichts freigegeben.</p>`);
  const [{ data: lines }, { data: entries }, { data: tests }, { data: devs }] = await Promise.all([
    sb.from("plan_lines").select("*").in("unit_id", ids),
    sb.from("diary_entries").select("*, diary_items(*)").eq("athlete_id", sel).in("unit_id", ids),
    sb.from("tests").select("exercise_name,value,date").eq("athlete_id", sel).eq("test_type", "1RM").order("date", { ascending: false }),
    sb.from("deviations").select("*").eq("athlete_id", sel).in("unit_id", ids),
  ]);
  const rm0 = {}; for (const t of tests || []) if (t.exercise_name && !(t.exercise_name in rm0)) rm0[t.exercise_name] = Number(t.value);
  const dot = (v) => v ? `<span class="pill" style="background:var(--r${v});color:${v === 3 ? "#1d2320" : "#fff"}">${v} · ${RATE[v - 1]}</span>` : "";
  document.getElementById("dplist").innerHTML = units.map((u) => {
    const e = (entries || []).find((x) => x.unit_id === u.id);
    const its = (lines || []).filter((l) => l.unit_id === u.id).map((l) => ({ ...l.parsed, lineId: l.id, pos: l.position ?? l.parsed.pos, block: l.block })).sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99));
    const pr = applyProfile(its, (profiles || []).find((x) => x.code === ath.profile_code), ath.sex);
    const adj = applyDeviations(pr.items, rm0, (devs || []).filter((d) => d.unit_id === u.id));
    const plan = planFor(ath.name, adj.items, adj.rm);
    const di = new Map((e?.diary_items || []).map((i) => [`${i.plan_line_id}|${i.actual?.name || ""}`, i]));
    const blocks = []; for (const x of plan) { const l = blocks[blocks.length - 1]; if (l && l.block === x.block) l.items.push(x); else blocks.push({ block: x.block, items: [x] }); }
    const head = `<div class="row" style="justify-content:space-between"><h3>${dShort(u.date)}${u.slot === 2 ? " E2" : ""}</h3>${e ? `<span class="row">${(e.befinden?.length ? e.befinden : [e.status]).map((v) => `<span class="pill ${v === "fit" ? "ok" : ["krank", "verletzt"].includes(v) ? "bad" : "warn"}">${esc(v)}</span>`).join("")}${dot(e.day_rating)}</span>` : `<span class="pill warn">nicht dokumentiert</span>`}</div>`;
    const meta = e ? `${(e.chips || []).length ? `<p class="small">${esc(e.chips.join(" · "))}</p>` : ""}${e.note ? `<p class="small">„${esc(e.note)}“</p>` : ""}` : "";
    const body = blocks.map((b) => {
      const setI = di.get(`${b.items[0].lineId}|SET:${b.block}`);
      return `<div class="blk"><h3>${esc(b.block)}${setI?.rating ? dot(setI.rating) : ""}</h3>${b.items.map((x) => {
        const i = di.get(`${x.lineId}|${x.name}`); const a = i?.actual || {};
        const ist = [a.ist && a.ist !== x.dose.split(" · ")[0] ? `Ist ${a.ist}` : "", a.kg != null ? `${String(a.kg).replace(".", ",")} kg` : "", a.done === true ? "✓" : a.done === false ? "nicht erledigt" : "",
          (a.wuerfe || []).map((w) => `${w.form || "Würfe"}${w.geraet ? " (" + w.geraet + ")" : ""}: ${w.n}`).join(" · "), (i?.chips || []).join(", ")].filter(Boolean).join(" · ");
        return `<div class="item"><div class="ihead"><span class="iname">${x.replaced ? `<span class="tag">statt ${esc(x.replaced)}</span>` : ""}${esc(x.name)}</span><span class="idose">${esc(x.dose)}</span></div>${ist || i?.rating ? `<div class="idetail">${i?.rating ? dot(i.rating) + " " : ""}${esc(ist)}</div>` : ""}</div>`;
      }).join("")}</div>`;
    }).join("");
    return `<div class="card">${head}${adj.notes.length ? `<p class="small"><span class="pill warn">angepasst</span> ${esc(adj.notes.join(" · "))}</p>` : ""}${meta}${body}</div>`;
  }).join("");
}

// ───────────── Sicherung ─────────────
async function backupPane() {
  const $p = document.getElementById("pane");
  $p.innerHTML = `<div class="card"><h3>Sicherung</h3><p class="muted">Lädt alle Daten als Excel-Datei herunter: Personen, Pläne, Tagebuch, Tests, Ergebnisse, Abweichungen und Kalender. Am besten wöchentlich im Vereinskonto ablegen.</p>
    <div class="row"><button class="btn" id="bk">Sicherung herunterladen</button><span class="small muted" id="bkm"></span></div></div>`;
  document.getElementById("bk").onclick = async () => {
    const $m = document.getElementById("bkm"); const wb = XLSX.utils.book_new();
    const tables = ["people", "units", "plan_lines", "diary_entries", "diary_items", "tests", "results", "deviations", "calendar_entries", "rules", "comments"];
    for (const t of tables) {
      $m.textContent = `Lese ${t} …`;
      let rows = [], from = 0;
      for (;;) {
        const { data, error } = await sb.from(t).select("*").range(from, from + 999);
        if (error) return ($m.textContent = `${t}: ${error.message}`);
        rows = rows.concat(data); if (data.length < 1000) break; from += 1000;
      }
      const flat = rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v !== null && typeof v === "object" ? JSON.stringify(v) : v])));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(flat.length ? flat : [{ leer: "" }]), t.slice(0, 31));
    }
    XLSX.writeFile(wb, `Trainingsplanung_Sicherung_${isoDay(new Date())}.xlsx`);
    $m.textContent = "Fertig.";
  };
}

start();

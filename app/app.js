import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";
import { makeCatalog, parseDay, planFor, HAUPTBLOECKE } from "../src/planungssprache.js";
import { readWorkbook, isoDay, TAGE } from "../src/excel.js";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $app = document.getElementById("app");
const $who = document.getElementById("who");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const toast = (t) => { const el = document.getElementById("toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => (el.hidden = true), 3500); };
const dShort = (iso) => { const d = new Date(iso + "T12:00:00"); return `${TAGE[(d.getDay() + 6) % 7]} ${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.`; };
const RATE = ["leicht", "ok", "fordernd", "schwer", "am Limit"];
const CHIPS_TECHNIK = ["müde", "unkonzentriert", "Technik gut umgesetzt", "powervoll", "Spaß gehabt"];
const CHIPS_NEBEN = ["wenig Schlaf", "Schule/Prüfung", "Ärger", "kein Bock", "Yeah"];
const STATUS = ["fit", "eingeschränkt", "krank", "verletzt"];

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
    <p class="small muted">Nur für die allererste Einrichtung durch den Planer (Supabase → SQL Editor):<br><code>insert into people (id, name, role) values ('${esc(user.id)}', 'Alex', 'planer');</code></p></div>`;
  document.getElementById("copy").onclick = async () => {
    try { await navigator.clipboard.writeText(user.id); toast("Kopiert"); } catch { getSelection().selectAllChildren(document.getElementById("uid")); }
  };
}

// ───────────── Athletin ─────────────
async function athleteView(me) {
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
  const [{ data: lines }, { data: entry }, { data: cal }] = await Promise.all([
    sb.from("plan_lines").select("*").eq("unit_id", unit.id),
    sb.from("diary_entries").select("*, diary_items(*)").eq("athlete_id", me.id).eq("unit_id", unit.id).maybeSingle(),
    sb.from("calendar_entries").select("*").lte("date_from", unit.date).gte("date_to", unit.date),
  ]);
  const items = (lines || []).map((l) => ({ ...l.parsed, lineId: l.id, pos: l.position ?? l.parsed.pos, block: l.block }))
    .sort((a, b) => (a.pos ?? 99) - (b.pos ?? 99));
  const plan = planFor(me.name, items);
  const prev = new Map((entry?.diary_items || []).map((i) => [`${i.plan_line_id}|${i.actual?.name || ""}|${i.actual?.set || ""}`, i]));
  const st = { status: entry?.status || "fit", day: entry?.day_rating || null, chips: new Set(entry?.chips || []), note: entry?.note || "", items: new Map() };

  // Blöcke in Planreihenfolge bündeln
  const blocks = [];
  for (const e of plan) { const l = blocks[blocks.length - 1]; if (l && l.block === e.block) l.items.push(e); else blocks.push({ block: e.block, doku: e.doku, items: [e] }); }
  const changed = unit.changed_at && unit.released_at && new Date(unit.changed_at) > new Date(unit.released_at);
  const pills = [...(cal || []).map((c) => `<span class="pill ${c.kind === "Feiertag" ? "bad" : c.kind === "Schulferien" ? "warn" : "ok"}">${esc(c.title)}</span>`),
    unit.week_hint ? `<span class="pill">${esc(unit.week_hint)}</span>` : "", changed ? `<span class="pill warn">nach Freigabe geändert</span>` : ""].join("");

  const rateHTML = (key, val) => `<div class="rate" data-key="${key}">${RATE.map((r, i) => `<button type="button" data-v="${i + 1}" aria-pressed="${val === i + 1}">${i + 1}<br>${r}</button>`).join("")}</div>`;
  const chipHTML = (key, list, sel) => `<div class="chips" data-key="${key}">${list.map((c) => `<button type="button" data-v="${esc(c)}" aria-pressed="${sel.has(c)}">${esc(c)}</button>`).join("")}</div>`;

  let html = `<div class="row"><h2>${dShort(unit.date)}${unit.slot === 2 ? " · Einheit 2" : ""}</h2>${pills}</div>`;
  html += `<div class="card"><h3>Wie geht's dir?</h3>${chipHTML("status", STATUS, new Set([st.status]))}</div>`;
  blocks.forEach((b, bi) => {
    html += `<section class="blk"><h3>${esc(b.block)}<small>${b.doku === "Set" ? "als Set bewerten" : b.doku === "je Übung" ? "je Übung bewerten" : b.doku === "Würfe" ? "Würfe eintragen" : "abhaken"}</small></h3>`;
    b.items.forEach((e, ii) => {
      const key = `${e.lineId}|${e.name}|`;
      const old = prev.get(key);
      html += `<div class="item"><div class="ihead"><span class="iname">${e.replaced ? `<span class="tag">statt ${esc(e.replaced)}</span>` : ""}${esc(e.name)}</span><span class="idose">${esc(e.dose)}</span></div>`;
      if (e.detail || e.note) html += `<div class="idetail">${esc([e.detail, e.note].filter(Boolean).join(" · "))}</div>`;
      if (b.doku === "je Übung" && !e.test) html += `<label class="ist">Ist <input data-ist="${esc(key)}" value="${esc(old?.actual?.ist ?? e.dose)}"></label>${rateHTML("i:" + key, old?.rating || null)}`;
      else if (e.test) html += `<label class="ist">Ergebnis kg <input data-ist="${esc(key)}" inputmode="decimal" value="${esc(old?.actual?.ist ?? "")}"></label>`;
      else if (b.doku === "Würfe") {
        const rows = old?.actual?.wuerfe?.length ? old.actual.wuerfe : [{ form: "", geraet: "", n: "" }];
        html += `<div class="throws" data-throws="${esc(key)}">${rows.map((r) => `<div class="tr"><input placeholder="Wurfform" value="${esc(r.form)}"><input placeholder="Gerät" value="${esc(r.geraet)}"><input placeholder="Würfe" inputmode="numeric" value="${esc(r.n)}"></div>`).join("")}<button type="button" class="btn ghost" data-addrow>+ Wurfform</button></div>${chipHTML("t:" + key, CHIPS_TECHNIK, new Set(old?.chips || []))}`;
      } else if (b.doku !== "Set") html += `<label class="check"><input type="checkbox" data-done="${esc(key)}" ${old?.actual?.done === false ? "" : "checked"}> erledigt</label>`;
      html += `</div>`;
    });
    if (b.doku === "Set") {
      const sk = `${b.items[0].lineId}|SET:${b.block}|`;
      html += `<div class="item"><span class="small muted">Wie schwer war ${b.block === "Zirkel" ? "der Zirkel" : "das Set"}?</span>${rateHTML("i:" + sk, prev.get(sk)?.rating || null)}</div>`;
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
  })));
  $d.querySelectorAll(".rate").forEach((g) => { const s = g.querySelector('[aria-pressed="true"]'); if (s) ratings.set(g.dataset.key, +s.dataset.v); });
  $d.querySelectorAll(".chips").forEach((g) => {
    const single = g.dataset.key === "status";
    chipSel.set(g.dataset.key, new Set([...g.querySelectorAll('[aria-pressed="true"]')].map((b) => b.dataset.v)));
    g.querySelectorAll("button").forEach((b) => (b.onclick = () => {
      const s = chipSel.get(g.dataset.key);
      if (single) { s.clear(); g.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", "false")); }
      if (s.has(b.dataset.v) && !single) { s.delete(b.dataset.v); b.setAttribute("aria-pressed", "false"); } else { s.add(b.dataset.v); b.setAttribute("aria-pressed", "true"); }
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
    const row = { athlete_id: me.id, unit_id: unit.id, status: [...chipSel.get("status")][0] || "fit", day_rating: dayRating,
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
  const tabs = me.role === "planer" ? ["Rückmeldungen", "Plan hochladen", "Freigabe", "Personen"] : ["Rückmeldungen"];
  let cur = tabs[0];
  const draw = () => {
    $app.innerHTML = `<div class="tabs" role="tablist">${tabs.map((t) => `<button role="tab" aria-selected="${t === cur}">${t}</button>`).join("")}</div><div id="pane"></div>`;
    $app.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => { cur = b.textContent; draw(); }));
    ({ "Rückmeldungen": feedbackPane, "Plan hochladen": uploadPane, "Freigabe": releasePane, "Personen": peoplePane })[cur](me);
  };
  draw();
}

async function feedbackPane() {
  const $p = document.getElementById("pane");
  const since = isoDay(new Date(Date.now() - 28 * 864e5)); const today = isoDay(new Date());
  const [{ data: people }, { data: units }, { data: entries }] = await Promise.all([
    sb.from("people").select("id,name,role,active").eq("role", "athletin").eq("active", true).order("name"),
    sb.from("units").select("id,date,slot,released").gte("date", since).lte("date", today).eq("released", true).order("date"),
    sb.from("diary_entries").select("*, units(date,slot)").gte("created_at", since + "T00:00:00").order("created_at", { ascending: false }),
  ]);
  // Hinweis Wiedereinstieg: die letzten 3 freigegebenen Einheiten krank/verletzt oder nicht dokumentiert
  const last3 = (units || []).slice(-3);
  const hints = (people || []).map((p) => {
    const miss = last3.filter((u) => { const e = (entries || []).find((x) => x.athlete_id === p.id && x.unit_id === u.id); return !e || ["krank", "verletzt"].includes(e.status); });
    return { p, miss: miss.length };
  }).filter((h) => last3.length >= 3 && h.miss >= 3);
  const name = (id) => (people || []).find((p) => p.id === id)?.name || "?";
  $p.innerHTML = `${hints.length ? `<div class="card"><h3>Wiedereinstieg prüfen</h3>${hints.map((h) => `<p><b>${esc(h.p.name)}</b>: die letzten ${h.miss} Einheiten krank, verletzt oder nicht dokumentiert. Plan vor der nächsten Freigabe anpassen.</p>`).join("")}</div>` : ""}
    <div class="card"><h3>Rückmeldungen der letzten 4 Wochen</h3>${(entries || []).length ? `<div class="tablewrap"><table><thead><tr><th>Tag</th><th>Athletin</th><th>Status</th><th>Tag gesamt</th><th>Nebenfaktoren</th><th>Kommentar</th></tr></thead><tbody>${entries.map((e) => `<tr><td>${e.units ? dShort(e.units.date) : ""}</td><td>${esc(name(e.athlete_id))}</td><td>${e.status === "fit" ? "fit" : `<span class="pill ${e.status === "eingeschränkt" ? "warn" : "bad"}">${esc(e.status)}</span>`}</td><td>${e.day_rating ? `${e.day_rating} · ${RATE[e.day_rating - 1]}` : ""}</td><td>${esc((e.chips || []).join(", "))}</td><td>${esc(e.note || "")}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">Noch keine Rückmeldungen.</p>`}</div>`;
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
    const days = []; const problems = [];
    for (const w of data.weeks) w.days.forEach((d, di) => {
      d.cells.filter((x) => !HAUPTBLOECKE.includes(x.block)).forEach((x) => problems.push({ level: "Fehler", text: `Unbekannter Hauptblock „${x.block}“`, cell: x.cell, where: `KW ${w.kw} ${TAGE[di]}` }));
      const r = parseDay(d.cells, c, athletes.length ? athletes : data.athletes);
      r.problems.forEach((p) => problems.push({ ...p, where: `KW ${w.kw} ${TAGE[di]}` }));
      if (d.date) days.push({ w, d, items: r.items });
    });
    const errs = problems.filter((p) => p.level === "Fehler");
    const lines = days.reduce((a, x) => a + x.items.length, 0);
    $r.innerHTML = `<p><b>${data.weeks.length}</b> Wochen · <b>${days.filter((x) => x.items.length).length}</b> Trainingstage · <b>${lines}</b> Zeilen · <b>${errs.length}</b> Fehler · <b>${problems.length - errs.length}</b> Hinweise</p>
      ${problems.map((p) => `<div class="prob"><span class="pill ${p.level === "Fehler" ? "bad" : "warn"}">${p.level}</span><span>${esc(p.where)}: ${esc(p.text)}</span><code>${esc(p.cell || "")}</code></div>`).join("")}
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
  $p.innerHTML = `<div class="card"><h3>Personen</h3>
    <div class="tablewrap"><table><thead><tr><th>Name</th><th>Rolle</th><th>Profil</th><th>Einwilligung</th><th>aktiv</th><th></th></tr></thead><tbody>${(people || []).map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(x.role)}</td><td>${esc(x.profile_code || "")}</td><td>${esc(x.consent_on || "")}</td><td>${x.active ? "ja" : "nein"}</td><td>${x.role !== "planer" ? `<button class="btn ghost" data-reset="${esc(x.id)}" data-name="${esc(x.name)}">Passwort zurücksetzen</button>` : ""}</td></tr>`).join("")}</tbody></table></div>
    <form id="rf" class="row" hidden><span id="rname"></span><input id="rpw" minlength="8" required placeholder="Vorläufiges Passwort (mind. 8 Zeichen)" style="flex:1"><button class="btn">Setzen</button></form></div>
    <div class="card"><h3>Person freischalten</h3><p class="muted small">Die Athletin meldet sich einmal mit ihrer E-Mail an und schickt dir den angezeigten Code.</p>
    <form id="pf" class="row"><input id="pid" required placeholder="Code (ID)" style="flex:2 1 240px"><input id="pname" required placeholder="Name wie im Plan" style="flex:1 1 120px">
    <select id="prole"><option value="athletin">Athletin</option><option value="cotrainer">Co-Trainer</option></select>
    <input id="pprof" placeholder="Profil (U18)" style="width:110px"><label class="small">Einwilligung <input type="date" id="pcons"></label><button class="btn">Freischalten</button></form></div>`;
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
  document.getElementById("pf").onsubmit = async (e) => {
    e.preventDefault();
    const row = { id: document.getElementById("pid").value.trim(), name: document.getElementById("pname").value.trim(), role: document.getElementById("prole").value,
      profile_code: document.getElementById("pprof").value.trim() || null, consent_on: document.getElementById("pcons").value || null };
    const { error } = await sb.from("people").insert(row);
    if (error) return toast("Nicht gespeichert: " + error.message);
    toast(`${row.name} freigeschaltet`); peoplePane();
  };
}

start();

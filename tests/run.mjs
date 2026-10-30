// Automatische Prüfung bei jedem Hochladen:
// 1. Alle Module lassen sich im strengen Modulmodus laden (fängt Syntaxfehler wie reservierte Wörter)
// 2. Der Parser versteht den Beispielplan vollständig
// 3. Die App startet für Planer und Athletin mit einer simulierten Datenbank
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let failed = 0;
const ok = (msg) => console.log("✓ " + msg);
const fail = (msg) => { console.log("✗ " + msg); failed++; };

// 1 · Module laden
const tmp = fs.mkdtempSync(path.join(fs.realpathSync(process.env.RUNNER_TEMP || "/tmp"), "tp-"));
fs.mkdirSync(path.join(tmp, "app")); fs.mkdirSync(path.join(tmp, "src"));
for (const f of ["src/planungssprache.js", "src/excel.js", "app/config.js"]) fs.copyFileSync(path.join(root, f), path.join(tmp, f));
fs.writeFileSync(path.join(tmp, "app/app.js"), fs.readFileSync(path.join(root, "app/app.js"), "utf8")
  .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@[^"]+/, "./sbstub.js"));
fs.writeFileSync(path.join(tmp, "app/sbstub.js"), `
const q = (data) => { const o = { select: () => o, eq: () => o, in: () => o, gte: () => o, lte: () => o, order: () => o, limit: () => o, range: () => o,
  update: () => o, insert: () => o, upsert: () => o, delete: () => o,
  maybeSingle: async () => ({ data: Array.isArray(data) ? data[0] : data }), single: async () => ({ data }),
  then: (r) => r({ data: Array.isArray(data) ? data : data ? [data] : [] }) }; return o; };
export const createClient = () => ({
  auth: { getSession: async () => ({ data: { session: { user: { id: "u1", email: "t@t" } } } }), onAuthStateChange: () => {} },
  from: (t) => q(t === "people" ? globalThis.__ME : t === "profiles" ? { code: "U16", volume_factor: 0.8, implements: {} } : t === "app_meta" ? null : (globalThis.__DATA?.[t] ?? [])),
  rpc: async () => ({}),
});`);
let P;
try { P = await import(pathToFileURL(path.join(tmp, "src/planungssprache.js"))); await import(pathToFileURL(path.join(tmp, "src/excel.js"))); ok("Module laden"); }
catch (e) { fail("Module laden: " + e.message); }

// 2 · Parser am Beispielplan
if (P) {
  const cat = P.makeCatalog(JSON.parse(fs.readFileSync(path.join(root, "data/uebungskatalog.json"), "utf8")));
  const sample = JSON.parse(fs.readFileSync(path.join(root, "data/beispiel_kw44-53.json"), "utf8"));
  let lines = 0; const problems = [];
  for (const w of sample.weeks) for (const d of w.days) {
    const r = P.parseDay(d.cells, cat, sample.athletes);
    lines += r.items.length; problems.push(...r.problems.filter((p) => p.level === "Fehler").map((p) => `KW ${w.kw}: ${p.text} ${p.cell || ""}`));
    for (const a of sample.athletes) P.planFor(a, P.applyProfile(r.items, { code: "U16", volume_factor: 0.8, implements: {} }, "w").items, {});
  }
  problems.length ? fail(`Parser: ${problems.length} Fehler\n  ` + problems.slice(0, 10).join("\n  ")) : ok(`Parser: ${lines} Zeilen ohne Fehler`);
}

// 3 · App-Start
const els = {};
const mk = (id) => ({ id, innerHTML: "", textContent: "", hidden: false, value: "", scrollLeft: 0, scrollWidth: 0, querySelectorAll: () => [], querySelector: () => mk(),
  prepend() {}, before() {}, setAttribute() {}, addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} } });
globalThis.document = { getElementById: (id) => els[id] || (els[id] = mk(id)), querySelectorAll: () => [], createElement: () => mk(), addEventListener() {}, visibilityState: "visible" };
globalThis.location = { origin: "x", pathname: "/", reload() {} };
globalThis.window ??= {};
if (!globalThis.navigator?.userAgent) globalThis.navigator = { userAgent: "test" };
globalThis.fetch = async () => ({ json: async () => [] });
// Ein Trainingstag aus dem Beispielplan als simulierte Datenbank (für die Tagesansicht der Athletin)
if (P) {
  const cat = P.makeCatalog(JSON.parse(fs.readFileSync(path.join(root, "data/uebungskatalog.json"), "utf8")));
  const sample = JSON.parse(fs.readFileSync(path.join(root, "data/beispiel_kw44-53.json"), "utf8"));
  const day = sample.weeks.flatMap((w) => w.days).find((d) => d.cells.length > 3);
  const r = P.parseDay(day.cells, cat, sample.athletes);
  const today = new Date().toISOString().slice(0, 10);
  globalThis.__DATA = { units: [{ id: 1, date: today, slot: 1, kw: 1 }], plan_lines: r.items.map((p, i) => ({ id: i + 1, unit_id: 1, position: p.pos, block: p.block, raw_text: p.raw, parsed: p })) };
}
let rejected = null; process.on("unhandledRejection", (e) => { rejected = e; });
for (const role of ["planer", "athletin"]) {
  for (const k in els) delete els[k];
  globalThis.__ME = { id: "u1", name: role === "athletin" ? "Alena" : "Test", role, active: true, consent_app_at: "2026-01-01", profile_code: "U16", sex: "w" };
  rejected = null;
  try { await import(pathToFileURL(path.join(tmp, "app/app.js")) + "?" + role); } catch (e) { rejected = e; }
  await new Promise((r) => setTimeout(r, 300));
  const html = (els.app?.innerHTML || "") + (els.day?.innerHTML || "");
  if (role === "athletin" && !/Speichern/.test(html)) { fail("Tagesansicht der Athletin wurde nicht aufgebaut" + (rejected ? ": " + rejected.stack : "") + " | " + html.replace(/<[^>]+>/g, " ").slice(0, 200)); continue; }
  if (rejected) fail(`App-Start (${role}): ${rejected.message}`);
  else if (!html || /Lädt/.test(html)) fail(`App-Start (${role}): nichts angezeigt`);
  else if (role === "athletin" && !/Pause: /.test(html)) fail("Pausenangaben fehlen in der Tagesansicht");
  else if (role === "athletin" && !(/Heute nicht im Training/.test(html) && /Urlaub/.test(html) && /blk train/.test(html))) fail("Abwesenheit fehlt in der Tagesansicht");
  else ok(`App-Start (${role})`);
}
fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.log(`\n${failed} Prüfung(en) fehlgeschlagen`); process.exit(1); }
console.log("\nAlle Prüfungen bestanden");

// Planungssprache – Parser für Alex' Trainingspläne
// Läuft im Browser und in Node (ES-Modul). Keine Abhängigkeiten.
//
// Eine Planzeile:  [Position)] [E1:|E2:] [{Hauptblock}] [[Name, Name]] Inhalt [» Hinweis]
// Regeln mit Beispielen: siehe docs/planungssprache.md

export const HAUPTBLOECKE = [
  "Aufwärmen", "Sprint-/Lauf-ABC", "Hürden-ABC", "Stabi/Mobi", "Kraft Langhantel",
  "Spezielle Kraft", "Kräftigung", "Sprünge", "Sprint", "Tempoläufe", "Ausdauer",
  "Zirkel", "Technik", "Spezielle Würfe", "MedBälle groß", "MedBälle klein", "Spiel",
];

// Wie dokumentiert die Athletin den Block?
export const DOKU = {
  "Kraft Langhantel": "je Übung", "Spezielle Kraft": "je Übung",
  "Kräftigung": "Set", "Sprünge": "Set", "Zirkel": "Set",
  "Sprint": "Set", "Tempoläufe": "Set", "Ausdauer": "Set", "MedBälle groß": "Set", "MedBälle klein": "Set",
  "Technik": "Würfe", "Spezielle Würfe": "Würfe",
};

const norm = (s) => String(s).toLowerCase()
  .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
  .replace(/\bund\b|\bu\.\s?/g, "").replace(/[^a-z0-9]/g, "");

/** Übungskatalog mit Schreibweisen → Nachschlagefunktion */
export function makeCatalog(entries) {
  const map = new Map();
  for (const e of entries) {
    for (const k of [e.name, ...(e.aliases || [])]) {
      const n = norm(k);
      if (n && !map.has(n)) map.set(n, e);
    }
  }
  return {
    entries,
    find(text) {
      if (!text) return null;
      const t = String(text).trim();
      const direct = map.get(norm(t));
      if (direct) return direct;
      // Zusatz in Klammern am Ende abtrennen: "Leg Curl (vor+halten+zurück)"
      const m = t.match(/^(.+?)\s*\(([^)]*)\)\s*$/);
      if (m) { const e = map.get(norm(m[1])); if (e) return e; }
      // Seitenangaben abtrennen: "Busemann re + li"
      const s = t.replace(/\s+(re\s*\+\s*li|re|li)$/i, "");
      if (s !== t) { const e = map.get(norm(s)); if (e) return e; }
      return null;
    },
  };
}

const splitTop = (s, sep = ",") => {
  const out = []; let d = 0, cur = "";
  for (const ch of s) {
    if ("[(".includes(ch)) d++;
    if ("])".includes(ch)) d--;
    if (ch === sep && d === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
};
const names = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
const num = (s) => (s == null || s === "" ? null : Number(String(s).replace(",", ".")));

function parseItem(t, cat) {
  let alt = null, reps = null, hint = null, m;
  if ((m = t.match(/\[([^\]:]+):\s*([^\]]+)\]/))) {
    alt = { who: names(m[1]), raw: m[2].trim() };
    alt.exercise = cat.find(alt.raw);
    t = t.replace(m[0], "").trim();
  }
  if ((m = t.match(/\((\d+)\)\s*$/))) { reps = +m[1]; t = t.replace(m[0], "").trim(); }
  else if ((m = t.match(/^(.+?)\s*\(([^)]*)\)\s*$/)) && !cat.find(t)) { hint = m[2]; }
  const exercise = cat.find(t);
  return { raw: t, exercise, reps, alt, hint };
}

/**
 * Eine Zeile zerlegen.
 * @returns {object} { pos, slot, only, note, block?, type, ... , warnings: [] }
 */
export function parseLine(line, cat) {
  let l = String(line).trim();
  const r = { raw: line, pos: null, slot: null, only: null, note: null, blockOverride: null, warnings: [] };
  let m;
  if ((m = l.match(/^(\d{1,2})\)\s*(.*)$/))) { r.pos = +m[1]; l = m[2]; }
  if ((m = l.match(/^E([12]):\s*(.*)$/))) { r.slot = +m[1]; l = m[2]; }
  if (l.includes("»")) { const i = l.indexOf("»"); r.note = l.slice(i + 1).trim(); l = l.slice(0, i).trim(); }
  if ((m = l.match(/^\{([^}]+)\}\s*(.+)$/))) { r.blockOverride = m[1].trim(); l = m[2]; }
  if ((m = l.match(/^\[([^\]]+)\]\s*(.+)$/))) { r.only = names(m[1]); l = m[2]; }

  // Maximalkrafttest
  if ((m = l.match(/^1\s?RM:\s*(.+)$/i))) {
    return { ...r, type: "test", items: splitTop(m[1]).map((t) => parseItem(t, cat)) };
  }
  // Technik nach Gruppen
  if ((m = l.match(/^Technik\s+(\d+)'\s*[–-]\s*(.+)$/))) {
    const groups = m[2].split("|").map((g) => {
      const [w, ...rest] = g.split(":"); const d = rest.join(":");
      const h = d.match(/\(([^)]+)\)/);
      const disc = d.replace(/\(.*\)/, "").trim();
      return { who: names(w), disc, exercise: cat.find(disc), hint: h ? h[1] : null };
    });
    return { ...r, type: "technique", minutes: +m[1], groups };
  }
  // Zirkel
  if ((m = l.match(/^(\d+)x(\d+)x\((\d+)\/(\d+)\)\s*Zirkel(?:\s*„([^“]+)“)?(?:,\s*SP\s*([^(]+?))?\s*(?:\((.+)\))?$/))) {
    return { ...r, type: "circuit", rounds: +m[1], stations: +m[2], work: +m[3], rest: +m[4],
      name: m[5] || null, sp: m[6] ? m[6].trim() : null,
      stationList: m[7] ? splitTop(m[7]).map((t) => ({ raw: t, exercise: cat.find(t) })) : null };
  }
  // Kraftblock: "4x10x65%:", "4x10x65%, P 1':", "2x10x70%, 2x5x80%:", "4x12:", "3x5x60kg:"
  if ((m = l.match(/^((?:\d+x\d+(?:x\d+(?:[.,]\d+)?(?:%|kg))?\s*,\s*)*\d+x\d+(?:x\d+(?:[.,]\d+)?(?:%|kg))?)(?:\s*,\s*P\s*([^:]+))?:\s*(.+)$/))) {
    const sets = m[1].split(",").map((s) => {
      const k = s.trim().match(/^(\d+)x(\d+)(?:x(\d+(?:[.,]\d+)?)(%|kg))?$/);
      return { sets: +k[1], reps: +k[2], load: num(k[3]), unit: k[4] || null };
    });
    return { ...r, type: "strength", setGroups: sets, pause: m[2] ? m[2].trim() : null,
      items: splitTop(m[3]).map((t) => parseItem(t, cat)) };
  }
  // Läufe: "4x4x40m Sprint, TP, SP 3'" oder "6x50m Sprint, P 3'"
  if ((m = l.match(/^(?:(\d+)x)?(\d+)x(\d+)m\s+([^,]+?)(?:,\s*(TP|GP))?(?:,\s*P\s*([^,]+))?(?:,\s*SP\s*(.+))?$/))) {
    return { ...r, type: "runs", series: m[1] ? +m[1] : 1, runs: +m[2], distance: +m[3],
      exercise: cat.find(m[4]), rawName: m[4], pauseType: m[5] || null, pause: m[6] || null, sp: m[7] || null };
  }
  // Läufe ohne Strecke: "2x4 Rasendiagonalen, TP Kurzseite, SP 1:30'"
  if ((m = l.match(/^(\d+)x(\d+)\s+([A-Za-zÄÖÜäöü][^,(]*?)(?:,\s*(TP|GP)\s*([^,]*))?(?:,\s*SP\s*(.+))?$/)) && cat.find(m[3])) {
    return { ...r, type: "runs", series: +m[1], runs: +m[2], distance: null, exercise: cat.find(m[3]), rawName: m[3],
      pauseType: m[4] ? (m[4] + (m[5] ? " " + m[5].trim() : "")) : null, pause: null, sp: m[6] || null };
  }
  // Ablauf mit Stationen: "4x Russian Drill, P 3' (20 Raupe, Langseite, …)"
  if ((m = l.match(/^(\d+)x\s+([^,(]+?)(?:,\s*P\s*([^(]+))?\s*\((.+)\)$/))) {
    return { ...r, type: "sequence", rounds: +m[1], rawName: m[2].trim(), exercise: cat.find(m[2]),
      pause: m[3] ? m[3].trim() : null, parts: splitTop(m[4]) };
  }
  // Serie mit Liste: "5x (6 Hops, …)", "4x20 (…) + 100m Sprint, P 15'', SP 4'", "3x2x10 (…)"
  if ((m = l.match(/^(\d+)x(?:(\d+)x)?(\d*)\s*\((.+?)\)\s*(.*)$/))) {
    const items = splitTop(m[4]).map((x) => {
      const k = x.match(/^(\d+)\s+(.+)$/);
      const raw = k ? k[2] : x;
      return { count: k ? +k[1] : null, raw, exercise: cat.find(raw) };
    });
    return { ...r, type: "series", rounds: +m[1], sub: m[2] ? +m[2] : null, reps: m[3] ? +m[3] : null,
      items, tail: m[5].replace(/^\+\s*/, "").trim() || null };
  }
  // Zählübung: "100 gr. MedBall (5 kg)"
  if ((m = l.match(/^(\d+)\s+(.+?)(?:\s*\((\d+(?:[.,]\d+)?)\s*kg\))?$/)) && cat.find(m[2])) {
    return { ...r, type: "count", count: +m[1], exercise: cat.find(m[2]), rawName: m[2], kg: num(m[3]) };
  }
  // Zeitblock: "20' wl. an Hürden"
  if ((m = l.match(/^(\d+)'\s+(.+)$/))) {
    const base = m[2].replace(/\s*\(([^)]*)\)\s*$/, "");
    return { ...r, type: "time", minutes: +m[1], exercise: cat.find(m[2]) || cat.find(base), rawName: m[2] };
  }
  // Sonst: Übung mit optionalem Zusatz, z. B. "Minutenläufe (1', 2', 3'), TP 1'"
  const h = l.match(/^([^(,]+?)\s*(?:\((.+)\))?\s*(?:,\s*(.+))?$/);
  const ex = cat.find(l) || (h && cat.find(h[1]));
  return { ...r, type: "free", exercise: ex, rawName: h ? h[1] : l, detail: h ? [h[2], h[3]].filter(Boolean).join(" · ") : null };
}

/** Alle Übungen einer geparsten Zeile, die nicht im Katalog stehen */
export function unknownExercises(p) {
  const out = [];
  const chk = (raw, ex) => { if (raw && !ex) out.push(raw); };
  switch (p.type) {
    case "test": case "strength":
      p.items.forEach((i) => { chk(i.raw, i.exercise); if (i.alt) chk(i.alt.raw, i.alt.exercise); }); break;
    case "technique": p.groups.forEach((g) => chk(g.disc, g.exercise)); break;
    case "circuit": (p.stationList || []).forEach((s) => chk(s.raw, s.exercise)); break;
    case "series": p.items.forEach((i) => chk(i.raw, i.exercise)); break;
    case "runs": case "sequence": case "count": case "time": case "free": chk(p.rawName, p.exercise); break;
  }
  return out;
}

/** Alle Athletinnen-Namen, die in einer Zeile vorkommen */
export function namesIn(p) {
  const s = new Set(p.only || []);
  if (p.items) p.items.forEach((i) => i.alt && i.alt.who.forEach((n) => s.add(n)));
  if (p.groups) p.groups.forEach((g) => g.who.forEach((n) => s.add(n)));
  return [...s];
}

/**
 * Einen Trainingstag prüfen.
 * @param {Array<{block:string, lines:string[], cell?:string}>} cells – eine Zelle je Hauptblock
 * @returns {{ items: Array, problems: Array<{level:'Fehler'|'Hinweis', text:string, cell?:string}> }}
 */
export function parseDay(cells, cat, athletes = []) {
  const items = []; const problems = [];
  for (const c of cells) {
    for (const line of c.lines) {
      if (!line.trim()) continue;
      const p = parseLine(line, cat);
      p.block = p.blockOverride || c.block; p.cell = c.cell;
      for (const u of unknownExercises(p)) problems.push({ level: "Fehler", text: `„${u}“ ist nicht im Übungskatalog`, cell: c.cell });
      if (athletes.length) for (const n of namesIn(p)) if (!athletes.includes(n)) problems.push({ level: "Hinweis", text: `„${n}“ ist noch nicht freigeschaltet oder falsch geschrieben`, cell: c.cell });
      if (p.type === "free" && !p.exercise) { /* schon gemeldet */ }
      items.push(p);
    }
  }
  const numbered = items.filter((i) => i.pos != null);
  if (numbered.length && numbered.length < items.length)
    problems.push({ level: "Fehler", text: `Nur ${numbered.length} von ${items.length} Zeilen haben eine Position – entweder alle nummerieren oder keine` });
  const seen = new Map();
  for (const i of numbered) {
    const key = `${i.slot || 1}-${i.pos}`;
    if (seen.has(key)) problems.push({ level: "Fehler", text: `Position ${i.pos}) ist doppelt vergeben`, cell: i.cell });
    seen.set(key, i);
  }
  for (const slot of [...new Set(numbered.map((i) => i.slot || 1))]) {
    const ps = numbered.filter((i) => (i.slot || 1) === slot).map((i) => i.pos).sort((a, b) => a - b);
    for (let k = 1; k <= ps[ps.length - 1]; k++) if (!ps.includes(k)) { problems.push({ level: "Hinweis", text: `Position ${k}) fehlt${slot > 1 ? " in E" + slot : ""}` }); }
  }
  for (const t of items.filter((i) => i.type === "technique")) {
    const covered = new Set(t.groups.flatMap((g) => g.who));
    const missing = athletes.filter((a) => !covered.has(a));
    if (athletes.length && missing.length) problems.push({ level: "Hinweis", text: `Technik ohne Zuteilung: ${missing.join(", ")}`, cell: t.cell });
  }
  const order = (i) => (i.slot || 1) * 1000 + (i.pos ?? (HAUPTBLOECKE.indexOf(i.block) * 10 + 500));
  items.sort((a, b) => order(a) - order(b));
  return { items, problems };
}

const r25 = (x) => Math.round(x / 2.5) * 2.5;

/**
 * Plan einer Athletin für einen Tag berechnen.
 * @param {object} rm – { "Reißen": 57.5, ... } letzter gültiger Maximalwert je Übung
 */
export function planFor(athlete, dayItems, rm = {}, { markMissing = true } = {}) {
  const out = [];
  for (const p of dayItems) {
    if (p.only && !p.only.includes(athlete)) continue;
    const base = { block: p.block, pos: p.pos, slot: p.slot, note: p.note, doku: DOKU[p.block] || "abhaken", type: p.type, lineId: p.lineId ?? null };
    if (p.type === "strength" || p.type === "test") {
      for (const it of p.items) {
        let ex = it.exercise, name = ex ? ex.name : it.raw, replaced = null;
        if (it.alt && it.alt.who.includes(athlete)) { replaced = name; ex = it.alt.exercise; name = ex ? ex.name : it.alt.raw; }
        if (p.type === "test") { out.push({ ...base, name, replaced, dose: "Maximalkrafttest", test: true }); continue; }
        const dose = p.setGroups.map((g) => {
          const reps = it.reps || g.reps;
          let s = `${g.sets}×${reps}`, kg = null;
          if (g.unit === "%") {
            const one = ex && rm[ex.name];
            if (one) { const exact = one * g.load / 100; kg = { value: r25(exact), exact: Math.round(exact * 10) / 10, dir: r25(exact) > exact + 1e-9 ? "↑" : r25(exact) < exact - 1e-9 ? "↓" : "" }; s += ` · ${String(kg.value).replace(".", ",")} kg${kg.dir}`; }
            else s += ` · ${g.load} %${markMissing && ex && ex.rm ? " (1RM fehlt)" : ""}`;
          } else if (g.unit === "kg") s += ` · ${g.load} kg`;
          return s;
        }).join(" + ");
        out.push({ ...base, name, replaced, dose, pause: p.pause });
      }
    } else if (p.type === "technique") {
      const g = p.groups.find((x) => x.who.includes(athlete));
      out.push({ ...base, name: g ? g.disc : "Technik", dose: `${p.minutes}'`, detail: g && g.hint, missing: !g });
    } else if (p.type === "circuit") {
      out.push({ ...base, name: p.name ? `Zirkel „${p.name}“` : "Zirkel", dose: `${p.rounds} Runden · ${p.stations} Stationen · ${p.work}/${p.rest} s`,
        detail: p.stationList ? p.stationList.map((s) => s.exercise ? s.exercise.name : s.raw).join(" · ") : "Stationen wie beim letzten Zirkel" });
    } else if (p.type === "series") {
      out.push({ ...base, name: "Serie", dose: `${p.rounds}×${p.sub ? p.sub + "×" : ""}${p.reps || ""}`.replace(/×$/, "×"),
        detail: p.items.map((i) => (i.count ? i.count + " " : "") + (i.exercise ? i.exercise.name : i.raw)).join(" · ") + (p.tail ? " + " + p.tail : "") });
    } else if (p.type === "runs") {
      out.push({ ...base, name: p.exercise ? p.exercise.name : p.rawName, dose: `${p.series > 1 ? p.series + "×" : ""}${p.runs}${p.distance ? "×" + p.distance + " m" : " Läufe"}`,
        detail: [p.pauseType, p.pause && "P " + p.pause, p.sp && "SP " + p.sp].filter(Boolean).join(" · ") });
    } else if (p.type === "sequence") {
      out.push({ ...base, name: p.exercise ? p.exercise.name : p.rawName, dose: `${p.rounds} Runden`, detail: p.parts.join(" → ") });
    } else if (p.type === "count") {
      out.push({ ...base, name: p.exercise ? p.exercise.name : p.rawName, dose: `${p.count} Würfe${p.kg ? " · " + p.kg + " kg" : ""}` });
    } else if (p.type === "time") {
      out.push({ ...base, name: p.exercise ? p.exercise.name : p.rawName, dose: `${p.minutes}'` });
    } else {
      out.push({ ...base, name: p.exercise ? p.exercise.name : p.rawName, dose: "", detail: p.detail });
    }
  }
  return out;
}

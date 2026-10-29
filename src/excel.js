// Liest die Planungsvorlage (Blatt „Saisonplanung …“) mit SheetJS.
// Ergebnis: { athletes, sheetName, weeks:[{kw, phase, hint, days:[{date, kalender, termine, cells:[{block, lines, cell}]}]}] }

export const TAGE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

const colL = (i) => { let s = ""; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const toDate = (v) => v instanceof Date ? v : typeof v === "number" ? new Date(Math.round((v - 25569) * 864e5)) : null;

export function readWorkbook(XLSX, wb) {
  const sheetName = wb.SheetNames.find((n) => /saisonplanung/i.test(n)) || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: null });
  const hi = rows.findIndex((r) => r && r.includes("Hauptblock"));
  if (hi < 0) throw new Error(`Im Blatt „${sheetName}“ fehlt die Kopfzeile mit „Hauptblock“.`);
  const H = rows[hi]; const ci = (n) => H.indexOf(n);
  const cKW = ci("KW"), cMon = ci("Montag"), cPh = ci("Phase"), cHi = ci("Hinweis"), cBl = ci("Hauptblock"), cD = TAGE.map(ci);
  const weeks = []; let w = null;
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i] || []; const lab = r[cBl];
    if (lab === "Datum") {
      const mon = toDate(r[cMon]);
      w = { kw: r[cKW], phase: r[cPh], hint: r[cHi],
        days: TAGE.map((_, d) => ({ date: mon ? new Date(mon.getTime() + d * 864e5) : toDate(r[cD[d]]), kalender: "", termine: "", cells: [] })) };
      weeks.push(w); continue;
    }
    if (!w) continue;
    if (lab === "Kalender" || lab === "Termine") { TAGE.forEach((_, d) => { w.days[d][lab.toLowerCase()] = r[cD[d]] ? String(r[cD[d]]) : ""; }); continue; }
    if (typeof lab === "string" && lab.trim()) {
      TAGE.forEach((_, d) => {
        const v = r[cD[d]]; if (v == null || v === "") return;
        w.days[d].cells.push({ block: lab.trim(), lines: String(v).split(/\r?\n/), cell: `${colL(cD[d])}${i + 1}` });
      });
    }
  }
  let athletes = [];
  const as = wb.Sheets["Athletinnen"];
  if (as) athletes = XLSX.utils.sheet_to_json(as, { header: 1 }).slice(1).map((r) => r && r[0]).filter(Boolean).map(String);
  return { athletes, weeks, sheetName };
}

/** Datum als YYYY-MM-DD in Ortszeit */
export const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

# Sperrt alles außer den Planfeldern. Aufruf: python3 sperren.py EIN.xlsx AUS.xlsx PASSWORT
import sys, zipfile, re, shutil, openpyxl
from openpyxl.styles import Protection
from openpyxl.worksheet.protection import SheetProtection
src, dst, pw = sys.argv[1:4]
wb = openpyxl.load_workbook(src)
plan = wb.worksheets[0]
OPEN, LOCK = Protection(locked=False), Protection(locked=True)
hdr = [str(plan.cell(3, c).value or "").strip() for c in range(1, plan.max_column + 1)]
col = lambda name: hdr.index(name) + 1
cE, cPh, cHi, cNo = col("Hauptblock"), col("Phase"), col("Hinweis"), col("Notiz")
days = [col(d) for d in ("Mo", "Di", "Mi", "Do", "Fr", "Sa", "So")]
n_open = 0
for r in range(4, plan.max_row + 1):
    lab = str(plan.cell(r, cE).value or "").strip()
    for c in range(1, plan.max_column + 1): plan.cell(r, c).protection = LOCK
    if not lab: continue
    if lab == "Datum": cols = [cPh, cHi, cNo]
    elif lab == "Kalender": cols = []
    else: cols = days + [cNo]            # Termine und alle Hauptblockzeilen
    for c in cols: plan.cell(r, c).protection = OPEN; n_open += 1
    plan.row_dimensions[r].hidden = False   # nichts eingeklappt lassen: im geschützten Blatt geht Aufklappen nicht
for c in range(1, plan.max_column + 1):
    for r in range(1, 4): plan.cell(r, c).protection = LOCK
def protect(ws, allow_filter=False):
    ws.protection = SheetProtection(sheet=True, objects=True, scenarios=True, formatCells=False, formatColumns=False, formatRows=False,
        insertColumns=True, insertRows=True, insertHyperlinks=True, deleteColumns=True, deleteRows=True,
        selectLockedCells=False, selectUnlockedCells=False, sort=True, autoFilter=not allow_filter, pivotTables=True)
    ws.protection.set_password(pw)
protect(plan, allow_filter=True)
for ws in wb.worksheets[1:]: protect(ws)
wb.save(dst)
# x14-Erweiterungen (Feiertags-/Ferienfarben) aus dem Original wieder einsetzen
def sheet_files(z): return [n for n in z.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", n)]
zi = zipfile.ZipFile(src); zo = zipfile.ZipFile(dst)
fixed = {}
for n in sheet_files(zi):
    o = zi.read(n).decode("utf-8")
    if "<extLst" not in o: continue
    ext = o[o.find("<extLst"):o.find("</extLst>") + 9]
    s = zo.read(n).decode("utf-8")
    if "<extLst" in s: s = s[:s.find("<extLst")] + s[s.find("</extLst>") + 9:]
    if "xmlns:xm=" not in s: s = s.replace("<worksheet ", '<worksheet xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main" ', 1)
    if 'xmlns:x14=' not in s and 'x14:' in ext: s = s.replace("<worksheet ", '<worksheet xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main" ', 1)
    fixed[n] = s.replace("</worksheet>", ext + "</worksheet>")
tmp = dst + ".tmp"
with zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED) as zw:
    for it in zo.infolist():
        zw.writestr(it, fixed.get(it.filename, zo.read(it.filename)))
zo.close(); shutil.move(tmp, dst)
print(f"Planfelder offen: {n_open} · x14 erneut eingesetzt in: {list(fixed)}")

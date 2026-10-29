# Trainingsplanung Wurf

Planung in Excel, Dokumentation am Handy, Auswertung für den Trainer.
Kern ist die **Planungssprache**: Der Trainer schreibt wie gewohnt, das System versteht Übungen, Prozente, Ersatzübungen, Technikgruppen und Zirkel.

| Ordner | Inhalt |
|---|---|
| `src/planungssprache.js` | Parser der Planungssprache (Browser und Node, ohne Abhängigkeiten) |
| `data/uebungskatalog.json` | Übungskatalog mit Hauptblock, Zählart und Schreibweisen |
| `tools/pruefen.html` | Prüf- und Vorschauwerkzeug: Excel hochladen, Fehler je Zelle, Plan je Athletin |
| `supabase/001_schema.sql` | Datenbankschema mit Zugriffsregeln (Supabase, Region Frankfurt) |
| `docs/planungssprache.md` | Die 16 Regeln mit Beispielen |

## Stand
- Stufe 0: Übungskatalog, Planungsvorlage 2026/27, Prüfwerkzeug, Datenbankschema
- Stufe 1 (folgt): Handy-App der Athletinnen, Upload, Freigabe, Hinweis bei Fehltagen

Im Code stehen keine Daten und keine geheimen Schlüssel. Der öffentliche Supabase-Schlüssel ist für die App bestimmt; geschützt wird über die Zugriffsregeln in der Datenbank.

## App
`app/index.html` – Anmeldung mit E-Mail und Passwort (ohne Mailversand). Planer: Plan hochladen, Freigabe, Personen, Rückmeldungen. Athletinnen: freigegebene Tage bis heute, Doku je Hauptblock.
Adresse: https://alex-la-vfl.github.io/Trainingsplanung/app/

"""Baut eine eigenständige pruefen.html (Parser und Daten eingebettet) für die Vorschau als Artefakt."""
import sys, re, json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
html = (root/'tools/pruefen.html').read_text()
js = (root/'src/planungssprache.js').read_text().replace('export const', 'const').replace('export function', 'function')
cat = (root/'data/uebungskatalog.json').read_text(); smp = (root/'data/beispiel_kw44-53.json').read_text()
html = re.sub(r'/\*__INLINE_PARSER__\*/.*?/\*__END_INLINE_PARSER__\*/', lambda m: js, html, flags=re.S)
html = re.sub(r'/\*__INLINE_DATA__\*/.*?/\*__END_INLINE_DATA__\*/', lambda m: f'const CATALOG = {cat};\nconst SAMPLE = {smp};', html, flags=re.S)
pathlib.Path(sys.argv[1]).write_text(html); print('ok', len(html))

"""Régénère tables_embedded.js à partir de tables/registry.json et des CSV.

Le site peut ainsi être ouvert directement (double-clic sur index.html) : quand
le navigateur refuse de lire un fichier par fetch (protocole file://), le code
retombe sur ces copies intégrées.

Utilisation, depuis la racine du projet :

    python tools/embed_tables.py
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TABLES = ROOT / "tables"
OUT = ROOT / "tables_embedded.js"


def main():
    registry_text = (TABLES / "registry.json").read_text(encoding="utf-8")
    entries = json.loads(registry_text)

    files = {"tables/registry.json": registry_text}
    for entry in entries:
        name = entry.get("file")
        if not name:
            continue
        path = TABLES / name
        files["tables/" + name] = path.read_text(encoding="utf-8")

    lines = [
        "/*",
        " * Tables intégrées au site pour qu'il fonctionne même ouvert directement",
        " * (sans serveur local, donc sans fetch possible).",
        " * Fichier généré : python tools/embed_tables.py",
        " */",
        "(function (global) {",
        '  "use strict";',
        "  global.EMBEDDED_TABLES = global.EMBEDDED_TABLES || {};",
    ]
    for key, text in files.items():
        lines.append("  global.EMBEDDED_TABLES[%s] = %s;" %
                     (json.dumps(key, ensure_ascii=False), json.dumps(text, ensure_ascii=False)))
    lines.append("})(window);")
    lines.append("")

    OUT.write_text("\n".join(lines), encoding="utf-8", newline="\n")
    print("%s : %d fichiers (%d octets)" % (OUT.name, len(files), OUT.stat().st_size))


if __name__ == "__main__":
    main()

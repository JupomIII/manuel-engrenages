/*
 * Interface : lecture des tables, affichage des résultats et export.
 * Aucune dépendance, aucun build : le fichier est servi tel quel.
 */
(function () {
  "use strict";

  var CSV_PATH = "tables/Table 3. Gear Tooth Parts for American National Standard Coarse Pitch.csv";

  var els = {
    csvStatus: document.getElementById("csv-status"),
    tableSelect: document.getElementById("table-select"),
    tableQuery: document.getElementById("table-query"),
    tableSearch: document.getElementById("table-search"),
    tableFound: document.getElementById("table-found"),
    tableQueryRow: document.getElementById("table-query-row"),
    tableQueryText: document.getElementById("table-query-text"),
    formulaList: document.getElementById("formula-list"),
    formulaUse: document.getElementById("formula-use"),
    symbolTable: document.querySelector("table.symbols"),
    symbolUse: document.getElementById("symbol-use"),
    tableWrap: document.getElementById("table-wrap"),
    pitchTable: document.getElementById("pitch-table")
  };

  var state = {
    headers: [],
    rows: [],       // cellules dans l'ordre du fichier
    tables: [],     // tables du registre (Tables.load)
    table: null,    // table affichée, si elle vient du registre
    labels: [],     // en-tête de chaque colonne affichée (symbole + nom)
    fieldAt: null,  // colonne affichée -> champ du registre
    ref: { fields: [], row: -1 }, // colonnes et ligne lues pour le dernier train
    lastTooth: null // proportions retenues (table, colonnes, P)
  };

  // ---------- utilitaires ----------

  function num(value) {
    // Accepte "0,5" (virgule décimale) en plus de "0.5".
    var text = String(value).trim().replace(",", ".");
    var n = parseFloat(text);
    return isFinite(n) ? n : NaN;
  }

  function fmt(value, digits) {
    if (!isFinite(value)) return "—";
    return value.toFixed(digits === undefined ? 4 : digits);
  }

  // Même précision que les résultats, sans zéros inutiles : 24 et non 24.00000.
  function fmtTrim(value, digits) {
    if (!isFinite(value)) return "—";
    var text = value.toFixed(digits === undefined ? 5 : digits);
    if (text.indexOf(".") >= 0) text = text.replace(/0+$/, "").replace(/\.$/, "");
    return text;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  // ---------- CSV ----------

  function parseCsv(text) {
    // Parseur minimal (pas de champs entre guillemets) : suffisant ici.
    // Si les données deviennent plus riches, remplacer par un vrai parseur.
    var lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(function (line) {
      return line.trim() !== "";
    });
    if (lines.length === 0) return { headers: [], rows: [] };

    var headers = lines[0].split(",").map(function (h) { return h.trim(); });
    var rows = lines.slice(1).map(function (line) {
      var cells = line.split(",").map(function (c) { return c.trim(); });
      while (cells.length < headers.length) cells.push("");
      return cells;
    });
    return { headers: headers, rows: rows };
  }

  function referenceField(at) {
    return state.fieldAt ? state.fieldAt[at] : null;
  }

  function renderReferenceTable() {
    var ref = state.ref || { fields: [], row: -1 };
    var html = "<thead><tr>";
    state.headers.forEach(function (h, i) {
      var field = referenceField(i);
      var used = field && ref.fields.indexOf(field) >= 0;
      html += "<th" + (used ? ' class="is-used"' : "") + ">" + escapeHtml(state.labels[i] || h) + "</th>";
    });
    html += "</tr></thead><tbody>";
    state.rows.forEach(function (row, rowAt) {
      html += "<tr" + (rowAt === ref.row ? ' class="is-active"' : "") + ">";
      row.forEach(function (cell, i) {
        var field = referenceField(i);
        var used = field && ref.fields.indexOf(field) >= 0;
        html += "<td" + (used && rowAt === ref.row ? ' class="is-used"' : "") + ">" +
          escapeHtml(cell) + "</td>";
      });
      html += "</tr>";
    });
    html += "</tbody>";
    els.pitchTable.innerHTML = html;
  }

  async function loadReference(path) {
    path = path || CSV_PATH;
    try {
      var text;
      try {
        var response = await fetch(path, { cache: "no-cache" });
        if (!response.ok) throw new Error("HTTP " + response.status);
        text = await response.text();
      } catch (fetchError) {
        // Page ouverte sans serveur local : on utilise la copie intégrée.
        if (!(window.EMBEDDED_TABLES && window.EMBEDDED_TABLES[path])) throw fetchError;
        text = window.EMBEDDED_TABLES[path];
      }
      var parsed = parseCsv(text);
      if (parsed.rows.length === 0) throw new Error("fichier vide");

      state.headers = parsed.headers;
      state.rows = parsed.rows;
      state.labels = parsed.headers;
      state.fieldAt = null;
      state.ref = { fields: [], row: -1 };
      els.csvStatus.className = "";
      els.csvStatus.textContent = parsed.rows.length + " lignes chargées depuis " + path + ".";
      renderReferenceTable();
    } catch (error) {
      els.csvStatus.className = "message error";
      els.csvStatus.textContent = "Impossible de charger " + path + " (" + error.message + "). " +
        "Le fichier doit être servi par un serveur local (python -m http.server) ou par GitHub Pages.";
    }
  }

  // ---------- tables du Handbook ----------

  // Menu : les tables du registre (avec leur titre) puis celles enregistrées depuis le panneau OCR.
  async function buildTableMenu() {
    var options = "";
    var declared = {};
    state.tables.forEach(function (table) {
      if (table.file) declared["tables/" + table.file] = true;
      options += '<option value="id:' + escapeHtml(table.id) + '">' + escapeHtml(table.title) + "</option>";
    });
    try {
      var response = await fetch("tables/index.json", { cache: "no-cache" });
      if (response.ok) {
        (await response.json()).forEach(function (entry) {
          if (!entry.file || declared["tables/" + entry.file]) return;
          options += '<option value="file:' + escapeHtml("tables/" + entry.file) + '">' +
            escapeHtml("OCR — " + entry.file) + "</option>";
        });
      }
    } catch (error) {
      // Source absente : on garde les tables du registre.
    }
    if (!options) options = '<option value="file:' + escapeHtml(CSV_PATH) + '">' + escapeHtml(CSV_PATH) + "</option>";
    els.tableSelect.innerHTML = options;
    showTable(els.tableSelect.value);
  }

  function showTable(value) {
    if (!value) return;
    if (value.indexOf("id:") === 0) {
      var table = Tables.getById(value.slice(3));
      if (!table) return;
      state.table = table;
      if (table.kind === "formulas") renderFormulaTable(table); else renderCsvTable(table);
    } else {
      state.table = null;
      loadReference(value.slice(5));
    }
    els.tableFound.hidden = true;
    els.formulaUse.hidden = true;
    els.tableQuery.value = "";
  }

  var KEY_LABELS = { N: "N — nombre de dents", P: "P — pas diamétral" };

  function renderCsvTable(table) {
    state.headers = table.headers;
    state.rows = table.rows;
    state.labels = table.columnLabels || table.headers;
    state.fieldAt = null;
    state.ref = { fields: [], row: -1 };
    var tooth = state.lastTooth;
    var usedNote = "";
    // La table qui a fourni a et b au dernier train : on marque ses colonnes
    // et la ligne du pas, pour que le choix se voie dans la table elle-même.
    if (tooth && tooth.used && tooth.table && tooth.table.id === table.id) {
      var at = table.index;
      state.fieldAt = [];
      Object.keys(at).forEach(function (field) { state.fieldAt[at[field]] = field; });
      state.ref.fields = [tooth.columnB];
      state.rows.forEach(function (row, i) {
        if (num(row[at[table.lookup]]) === tooth.P) state.ref.row = i;
      });
      usedNote = " Colonnes lues pour le train : " + state.ref.fields.map(function (field) {
        return table.labels[field] || field;
      }).join(" ; ") + " (ligne " + table.lookup + " = " + tooth.P + ").";
    }
    els.formulaList.hidden = true;
    els.formulaList.innerHTML = "";
    els.tableWrap.hidden = false;
    els.tableQueryRow.hidden = false;
    els.tableQueryText.textContent = "Chercher par " + (KEY_LABELS[table.lookup] || table.lookup);
    els.csvStatus.className = "sub";
    els.csvStatus.textContent = table.title + " — " + table.rows.length + " lignes." + usedNote;
    renderReferenceTable();
  }

  // Table de formules : chaque ligne est évaluée avec les valeurs du dernier calcul.
  function renderFormulaTable(table) {
    state.headers = [];
    state.rows = [];
    state.fieldAt = null;
    state.ref = { fields: [], row: -1 };
    var cases = Tables.getCases();
    var count = 0;
    var html = "";
    if (table.id === "table2") html += '<p class="case-legend">Table 2 : uniquement dentures droites à pas grossier, pleine profondeur 20° ou 25°. Les autres formes et les dents prétaillées nécessitent d’autres proportions ; voir les notes p. 2213.</p>';
    if (table.id === "table4-fine") html += '<p class="case-legend">Table 4 : pas fin, pleine profondeur 14½°, 20° ou 25°. Les valeurs droites utilisent le dernier train droit ; les valeurs hélicoïdales utilisent uniquement le dernier calcul hélicoïdal. Les constantes du Handbook sont arrondies ; les minima et la finition doivent être vérifiés sur le plan.</p>';
    if (table.id === "table6-rack145") html += '<p class="case-legend">Table 6 : anciennes formes droites ASA B6.1-1932, 14½° pleine profondeur ou 20° stub. Creux, jeu et profondeur totale sont des minima. Prévoir les tolérances de travail.</p>';
    table.groups.forEach(function (group) {
      if (group.name) html += "<h4>" + escapeHtml(group.name) + "</h4>";
      html += '<table class="grid formula"><thead><tr><th>Élément</th><th>Formule</th>' +
        "<th>Valeur</th></tr></thead><tbody>";
      group.rows.forEach(function (row) {
        var first = true;
        var attrs = ' tabindex="0" role="button" data-label="' +
          escapeHtml(row.label) + '" data-when="' + escapeHtml(row.when || "") + '"';
        row.variants.forEach(function (variant) {
          var value = "—";
          var reason = "calcule d'abord un engrenage";
          try {
            value = fmtTrim(Tables.evaluate(variant.expr), 5);
            reason = "";
          } catch (error) {
            reason = error.message;
          }
          // Variante d'un cas de denture : « retenu » si c'est celui du train,
          // « écarté » sinon, pour qu'on ne lise pas la mauvaise formule.
          var rowClass = "formula-row";
          var badge = "";
          if (variant.case && cases.length > 0) {
            var active = cases.indexOf(variant.case) >= 0;
            rowClass += active ? " is-active" : " is-alt";
            badge = ' <span class="case-badge' + (active ? "" : " off") + '">' +
              (active ? "retenu" : "écarté") + "</span>";
          }
          var tex = variant.tex || "";
          var cell = tex
            ? '<span data-tex="' + escapeHtml(tex) + '">' + escapeHtml(variant.display) + "</span>"
            : escapeHtml(variant.display);
          html += '<tr class="' + rowClass + '"' + attrs + "><th>" + (first ? escapeHtml(row.label) : "") +
            "</th><td>" + cell + badge +
            '</td><td class="value"' + (reason ? ' title="' + escapeHtml(reason) + '"' : "") +
            ">" + value + "</td></tr>";
          first = false;
          count++;
        });
      });
      html += "</tbody></table>";
    });
    els.pitchTable.innerHTML = "";
    els.tableWrap.hidden = true;
    els.tableQueryRow.hidden = true;
    els.formulaList.hidden = false;
    if (cases.length > 0) {
      html += '<p class="case-legend">Lignes surlignées : variantes retenues pour le train calculé ' +
        "(les variantes écartées restent visibles, grisées).</p>";
    }
    els.formulaList.innerHTML = html;
    if (window.renderMath) window.renderMath(els.formulaList);
    els.csvStatus.className = "sub";
    els.csvStatus.textContent = table.title + " — " + count +
      " formules. Les valeurs suivent le dernier calcul (P, N, p, angle).";
  }

  function searchTable() {
    var table = state.table;
    if (!table) return;
    if (table.kind === "formulas") {
      els.tableFound.className = "message";
      els.tableFound.textContent = "Table de formules : les valeurs sont déjà calculées dans le tableau.";
      els.tableFound.hidden = false;
      return;
    }
    var value = num(els.tableQuery.value);
    if (!isFinite(value)) {
      els.tableFound.className = "message error";
      els.tableFound.textContent = "Entre une valeur à chercher (" + table.lookup + ").";
      els.tableFound.hidden = false;
      return;
    }
    var inputs = {};
    inputs[table.lookup] = value;
    var found = Tables.lookup(table.id, inputs);
    if (!found) {
      els.tableFound.className = "message error";
      els.tableFound.textContent = table.title + " : aucune ligne pour " + table.lookup + " = " + value + ".";
      els.tableFound.hidden = false;
      return;
    }
    var parts = [];
    Object.keys(found.values).forEach(function (field) {
      if (field === table.lookup) return;
      parts.push((found.table.labels[field] || field) + " = " + found.values[field]);
    });
    els.tableFound.className = "message";
    els.tableFound.textContent = table.title + " : " + (KEY_LABELS[table.lookup] || table.lookup) +
      " = " + value + " → " + parts.join(" ; ");
    els.tableFound.hidden = false;
  }

  // ---------- calculs ----------

  // Colonne des tables de piges selon l'angle de pression.
  function pinField(angle) {
    if (angle === 14.5) return "M145";
    if (angle === 17.5) return "M175";
    if (angle === 25) return "M25";
    if (angle === 30) return "M30";
    return "M20";
  }

  // ---------- train de deux roues ----------

  var ITEMS = [
    ["Nombre de dents N", "teeth", 0],
    ["Diamètre extérieur D<sub>0</sub>", "outsideDiameter", 5],
    ["Diamètre de pied D<sub>R</sub>", "rootDiameter", 5],
    ["Diamètre de base D<sub>B</sub>", "baseDiameter", 5],
    ["Saillie a (addendum)", "addendum", 5],
    ["Creux b (dedendum)", "dedendum", 5],
    ["Profondeur totale h<sub>t</sub>", "wholeDepth", 5],
    ["Profondeur de travail h<sub>k</sub>", "workingDepth", 5],
    ["Jeu radial c", "clearance", 5],
    ["Rayon de raccordement de crémaillère r<sub>f</sub> (Table 2)", "rackFilletRadius", 5],
    ["Pas circulaire p", "circularPitch", 4],
    ["Épaisseur circulaire théorique t", "toothThickness", 5],
    ["Épaisseur à la corde théorique T", "chordalThickness", 5],
    ["Saillie à la corde théorique H", "chordalAddendum", 5],
    ["T selon la fraise (Handbook p. 2224)", "milledChordalThickness", 4],
    ["H selon la fraise (Handbook p. 2224)", "milledChordalAddendum", 4],
    ["Numéro de fraise", "cutter", 0],
    ["Diamètre de pige W", "pinDiameter", 5],
    ["Mesure théorique sur piges M", "pinMeasurement", 5],
    ["M maxi (exemple du guide)", "pinMaxThinned", 5],
    ["M mini (exemple du guide)", "pinMinThinned", 5],
    ["ΔM interpolé (par 0,001 po)", "deltaM", 6],
    ["Dents enjambées k", "overTeeth", 0],
    ["Mesure entre dents théorique", "overTeethMeasurement", 5]
  ];

  // ---------- table du pas : Table 3 jusqu'à P = 20, Table 5 au-delà ----------

  var TOOTH_TABLES = {
    coarse: { id: "table3", label: "Table 3 (pas grossier)" },
    fine: { id: "table5", label: "Table 5 (pas fin)" }
  };

  /*
   * Saillie et creux du train : on lit la table du bon pas, dans la colonne que
   * la denture impose (minimale à 14½°, standard à 20°, spéciale si arasée).
   * Les formules ne servent que si P n'est pas tabulé ; la denture trapue n'a
   * aucune colonne de table et garde 0,8/P et 1,000/P.
   */
  function resolveTooth(P, angle, options) {
    if (options.stub) {
      return { addendum: 0.8 / P, dedendum: 1 / P, P: P, table: null, used: false };
    }
    var which = options.finePitch ? TOOTH_TABLES.fine : TOOTH_TABLES.coarse;
    var found = options.finePitch ? Tables.lookup(which.id, { P: P }) : null;
    // Au pas fin, le Handbook prévoit aussi la finition à 14½°.
    var shaved = Calculs.toothProportions(angle, options).shaved;
    var columnB = shaved ? "bSpec" : "b";
    var factor = angle === 14.5 ? 1.157 : (shaved ? 1.35 : 1.25);
    var tableB = found ? num(found.values[columnB]) : NaN;
    if (found && isFinite(tableB) && tableB > 0) {
      // Les cotes de la Table 5 sont arrondies à quatre décimales.
      var dedendum = tableB;
      return {
        addendum: 1 / P, dedendum: dedendum, P: P,
        table: which, columnA: "a", columnB: columnB,
        labelA: found.table.columns.a || "a",
        labelB: found.table.columns[columnB] || columnB,
        used: true
      };
    }
    return {
      addendum: 1 / P, dedendum: options.finePitch ? (shaved ? 1.35 : 1.2) / P + 0.002 : factor / P, P: P,
      factorLabel: options.finePitch ? ((shaved ? "1,350" : "1,200") + "/P + 0,002") :
        ((angle === 14.5 ? "1,157" : (shaved ? "1,350" : "1,250")) + "/P"),
      table: which, used: false
    };
  }

  // Cas de denture du train : marque les variantes de formule qui s'appliquent.
  function activeCases(result) {
    var pr = result.proportions;
    if (pr.stub) return ["stub"];
    if (result.finePitch) return state.lastTooth && state.lastTooth.used ? ["standard"] :
      ["standard", pr.shaved ? "fine-shaved-formula" : "fine-formula"];
    if (pr.shaved) return ["standard", "shaved"];
    return ["standard", pr.angle === 14.5 ? "14.5" : "20"];
  }

  function computeTrain(event) {
    event.preventDefault();
    var mG = num(document.getElementById("mg").value);
    var C = num(document.getElementById("centre").value);
    var P = num(document.getElementById("train-dp").value);
    var angle = parseFloat(document.getElementById("angle").value);
    var options = {
      stub: document.getElementById("tooth-form").value === "stub",
      shaved: document.getElementById("tooth-finish").value === "shaved",
      finePitch: P > 20 || (P === 20 && document.getElementById("pitch-system").value === "fine")
    };
    var msg = document.getElementById("train-message");
    var box = document.getElementById("train-results");
    var note = document.getElementById("train-form-note");
    var result;
    var tooth = null;
    if (options.stub && options.shaved) {
      result = { ok: false, error: "La finition arasée ou rectifiée n'est pas définie pour la denture trapue." };
    } else if (options.stub && angle !== 20) {
      result = { ok: false, error: "La denture stub américaine utilisée ici est définie à 20°." };
    } else if (angle === 14.5 && !options.finePitch && options.shaved) {
      result = { ok: false, error: "La finition arasée ou rectifiée à 14,5° n'est pas définie pour le pas grossier." };
    } else if (state.tables.length === 0) {
      result = { ok: false, error: "Les tables ne sont pas chargées ; attends leur chargement avant de calculer." };
    } else if (mG > 0 && C > 0 && P > 0) {
      tooth = resolveTooth(P, angle, options);
      options.addendum = tooth.addendum;
      options.dedendum = tooth.dedendum;
      result = Calculs.calculateTrain(mG, C, P, angle, options);
    } else {
      result = { ok: false, error: "Entre des valeurs positives." };
    }
    if (!result.ok) {
      state.lastTooth = null;
      Tables.setCases([]);
      Tables.clearSpurContext();
      if (note) note.textContent = "";
      document.getElementById("train-sources").textContent = "";
      if (state.table && state.table.kind === "formulas") renderFormulaTable(state.table);
      msg.textContent = result.error;
      msg.hidden = false;
      msg.className = "message error";
      box.hidden = true;
      return;
    }
    result.finePitch = options.finePitch;
    state.lastTooth = tooth;
    msg.hidden = true;
    applyTables(result.pinion, result.pinionTeeth, angle, P, "pinion");
    applyTables(result.gear, result.gearTeeth, angle, P, "gear");
    // La saillie et le creux du contexte suivent la denture choisie (trappe ou arasée).
    var a = result.pinion.addendum;
    var b = result.pinion.dedendum;
    Tables.setContext({
      P: P, p: Math.PI / P, phi: angle, C: C, mG: result.mG,
      NP: result.pinionTeeth, NG: result.gearTeeth,
      DP: result.pinionPitchDiameter, DG: result.gearPitchDiameter,
      N: result.pinionTeeth, D: result.pinionPitchDiameter,
      a: a, b: b, aG: a, aP: a,
      ht: a + b, hk: 2 * a, c: b - a,
      alpha: Calculs.contactAngle(P, result.pinionTeeth, angle),
      Mth: result.pinion.pinMeasurement,
      dM: result.pinion.deltaM,
      k: result.pinion.overTeeth
    });
    Tables.setCases(activeCases(result));
    if (state.table && state.table.kind === "formulas") renderFormulaTable(state.table);
    else if (state.table) renderCsvTable(state.table);
    var html = "<thead><tr><th>Item</th><th>Pignon</th><th>Roue</th></tr></thead><tbody>";
    html += "<tr><td>Diamètre primitif D (pouce)</td><td>" + fmt(result.pinionPitchDiameter) + "</td><td>" + fmt(result.gearPitchDiameter) + "</td></tr>";
    ITEMS.forEach(function (item) {
      html += "<tr><td>" + item[0] + "</td><td>" + fmtItem(result.pinion[item[1]], item[2]) + "</td><td>" + fmtItem(result.gear[item[1]], item[2]) + "</td></tr>";
    });
    html += "</tbody>";
    document.getElementById("train-table").innerHTML = html;
    box.hidden = false;
    if (note) note.textContent = formNote(result, tooth);
    document.getElementById("train-sources").textContent =
      pinSource(result.pinion, "Pignon", result.pinionTeeth) + " · " + pinSource(result.gear, "Roue", result.gearTeeth) +
      " ΔM : interpolation linéaire de la Table 9 (5 à 200 dents, sans extrapolation). T et H géométriques : nombres de dents réels. T et H selon la fraise : Handbook p. 2224, valeurs exactes pour " +
      (result.pinion.milledReferenceTeeth || "—") + " dents de référence (pignon) et " + (result.gear.milledReferenceTeeth || "—") +
      " (roue), approximatives pour les autres dents de la plage ; un tiret indique un pas ou profil non couvert. Pour les mesures entre dents, k suit la Table 11 ; un tiret indique une plage non couverte." +
      (!result.proportions.stub && !result.finePitch && angle === 20 &&
        (result.pinionTeeth < 18 || result.pinionTeeth + result.gearTeeth < 36) ?
        " Attention : Table 3, p. 2215, recommande au moins 18 dents au pignon et 36 au total pour cette denture ; vérifier les proportions et l’interférence." : "") +
      (result.pinion.pinWarning ? " Attention, pignon : " + result.pinion.pinWarning + "." : "") +
      (result.gear.pinWarning ? " Attention, roue : " + result.gear.pinWarning + "." : "");
  }

  // Rappelle la denture retenue et la table qui a fourni a et b.
  function formNote(result, tooth) {
    var pr = result.proportions;
    var a = result.pinion.addendum;
    var b = result.pinion.dedendum;
    var head = "Denture " + (pr.stub ? "trapue (stub)" : "commune, pleine profondeur") +
      (pr.angle === 14.5 ? ", 14\u00bd\u00b0" : ", " + pr.angle + "\u00b0") +
      (pr.shaved ? ", aras\u00e9e ou rectifi\u00e9e" : "");
    var source;
    if (pr.stub) {
      source = "aucune colonne de table : a = 0,8/P et b = 1,000/P";
    } else if (tooth && tooth.used) {
      source = tooth.table.id === "table5" ?
        "a = 1/P ; b lu dans " + tooth.table.label + ", ligne P = " + tooth.P + " (colonne « " + tooth.labelB + " »)" :
        "formules du guide, comparables aux valeurs arrondies de " + tooth.table.label;
    } else {
      source = "formules " + (result.finePitch ? "du Handbook, Table 4 (pas fin non tabulé)" : "du guide (pas grossier)") +
        " : a = 1/P, b = " + tooth.factorLabel;
    }
    return head + " \u2014 " + source + " \u2014 a = " + fmt(a, 5) + " po, b = " + fmt(b, 5) +
      " po, h\u209c = " + fmt(a + b, 5) + " po.";
  }

  function pinSource(item, label, teeth) {
    var parity = teeth % 2 === 0 ? "pair, Table 1" : "impair, Table 2";
    return label + " : " + teeth + " dents (" + parity + "), " +
      (item.pinFromTable ? "M lu dans la table puis divisé par P" : "M calculé par la formule de secours");
  }

  // Numéro de fraise, dents à enjamber et mesure sur piges lus dans les tables du Handbook.
  function applyTables(item, teeth, angle, P, role) {
    var over = angle === 25 ? null : Tables.lookup(angle === 14.5 ? "table11-145" : "table11-20", { N: teeth });
    if (over) item.overTeeth = num(over.values.k);
    var cutter = Tables.lookup("cutters-standard", { N: teeth });
    if (cutter) item.cutter = cutter.values.cutter;
    var milled = !item.toothForm.stub && !item.toothForm.shaved ? Calculs.milledChordalTable(P, Number(item.cutter)) : null;
    item.milledChordalThickness = milled ? milled.thickness : NaN;
    item.milledChordalAddendum = milled ? milled.addendum : NaN;
    item.milledReferenceTeeth = milled ? milled.referenceTeeth : null;
    // Tables 1 et 2 (p. 2303-2306) : pair ou impair, puis /P (guide §6.2).
    var pins = Tables.lookup(teeth % 2 === 0 ? "pins-even" : "pins-odd", { N: teeth });
    var raw = pins ? num(pins.values[pinField(angle)]) : NaN;
    var mth = isFinite(raw) ? raw / P : item.pinMeasurement;
    item.pinFromTable = isFinite(raw);
    item.pinMeasurement = mth;
    if (item.pinMeasurement <= item.outsideDiameter) {
      item.pinWarning = "la mesure calculée ne dépasse pas le diamètre extérieur ; vérifier la pige et le profil";
    }
    if (role === "pinion") {
      item.pinMaxThinned = mth;                 // pignon intact : Mth
      item.pinMinThinned = mth - 2 * item.deltaM;
    } else {
      item.pinMaxThinned = mth - 3 * item.deltaM; // roue amincie
      item.pinMinThinned = mth - 5 * item.deltaM;
    }
  }

  function fmtItem(value, digits) {
    return digits === 0 && isFinite(value) ? String(value) : fmt(value, digits);
  }

  // Table 4 : calcul séparé pour ne pas mélanger pas normal et pas transversal.
  document.getElementById("helical-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var Pn = num(document.getElementById("helical-pn").value);
    var psi = num(document.getElementById("helical-angle").value);
    var NPh = num(document.getElementById("helical-np").value);
    var NGh = num(document.getElementById("helical-ng").value);
    var result = Calculs.helicalFinePitch(
      Pn, psi, NPh, NGh,
      document.getElementById("helical-finish").value === "shaved"
    );
    var message = document.getElementById("helical-message");
    var box = document.getElementById("helical-results");
    if (!result.ok) {
      message.textContent = result.error;
      message.hidden = false;
      box.hidden = true;
      Tables.setContext({ Pn: NaN, psi: NaN, NPh: NaN, NGh: NaN });
      if (state.table && state.table.id === "table4-fine") renderFormulaTable(state.table);
      return;
    }
    Tables.setContext({ Pn: Pn, psi: psi, NPh: NPh, NGh: NGh });
    if (state.table && state.table.id === "table4-fine") renderFormulaTable(state.table);
    message.hidden = true;
    var rows = [
      ["Saillie normale a", result.addendum], ["Creux normal minimal b", result.dedendum],
      ["Profondeur de travail normale hₖ", result.workingDepth], ["Profondeur totale normale minimale hₜ", result.wholeDepth],
      ["Jeu radial minimal c", result.clearance], ["Épaisseur normale de base tₙ", result.normalToothThickness],
      ["Pas circulaire normal pₙ", result.normalCircularPitch], ["Diamètre primitif pignon d", result.pinionPitchDiameter],
      ["Diamètre primitif roue D", result.gearPitchDiameter], ["Diamètre extérieur pignon d₀", result.pinionOutsideDiameter],
      ["Diamètre extérieur roue D₀", result.gearOutsideDiameter], ["Entraxe C", result.centerDistance]
    ];
    box.innerHTML = "<table class=\"grid\"><thead><tr><th>Dimension</th><th>Valeur (po)</th></tr></thead><tbody>" + rows.map(function (row) {
      return "<tr><td>" + escapeHtml(row[0]) + "</td><td>" + fmt(row[1], 5) + "</td></tr>";
    }).join("") + "</tbody></table>";
    box.hidden = false;
  });
  document.getElementById("helical-form").addEventListener("input", function () {
    document.getElementById("helical-results").hidden = true;
    document.getElementById("helical-message").hidden = true;
    Tables.setContext({ Pn: NaN, psi: NaN, NPh: NaN, NGh: NaN });
    if (state.table && state.table.id === "table4-fine") renderFormulaTable(state.table);
  });

  // ---------- démarrage ----------

  var trainForm = document.getElementById("train-form");
  trainForm.addEventListener("submit", computeTrain);
  function invalidateTrain() {
    if (document.getElementById("train-results").hidden) return;
    document.getElementById("train-results").hidden = true;
    document.getElementById("train-form-note").textContent = "";
    document.getElementById("train-sources").textContent = "";
    state.lastTooth = null;
    Tables.clearSpurContext();
    Tables.setCases([]);
    if (state.table && state.table.kind === "formulas") renderFormulaTable(state.table);
    var message = document.getElementById("train-message");
    message.className = "message";
    message.textContent = "Les données ont changé : relance le calcul pour actualiser les résultats.";
    message.hidden = false;
  }
  trainForm.addEventListener("input", invalidateTrain);
  trainForm.addEventListener("change", invalidateTrain);
  els.tableSearch.addEventListener("click", searchTable);
  els.tableQuery.addEventListener("keydown", function (event) {
    if (event.key === "Enter") { event.preventDefault(); searchTable(); }
  });
  els.tableSelect.addEventListener("change", function () { showTable(els.tableSelect.value); });

  // Ligne de formule ou de symbole : un clic (ou Entrée) dit quand l'utiliser.
  function showUse(row, target) {
    var when = row.getAttribute("data-when") || "";
    if (!when) return;
    target.className = "message";
    target.textContent = (row.getAttribute("data-label") || "") + " — " + when;
    target.hidden = false;
  }

  function useHandler(target) {
    return function (event) {
      var row = event.target.closest("tr[data-when]");
      if (!row) return;
      if (event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;
      if (event.type === "keydown") event.preventDefault();
      showUse(row, target);
    };
  }

  els.formulaList.addEventListener("click", useHandler(els.formulaUse));
  els.formulaList.addEventListener("keydown", useHandler(els.formulaUse));
  if (els.symbolTable) {
    els.symbolTable.addEventListener("click", useHandler(els.symbolUse));
    els.symbolTable.addEventListener("keydown", useHandler(els.symbolUse));
  }

  Tables.load().then(function (result) {
    state.tables = result.tables;
    if (window.renderMath) window.renderMath(document);
    if (result.errors.length > 0) {
      els.csvStatus.className = "message error";
      els.csvStatus.textContent = "Tables non chargées : " + result.errors.join(" ; ");
    }
    buildTableMenu();
  });
})();

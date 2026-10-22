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
    tableWrap: document.getElementById("table-wrap"),
    pitchTable: document.getElementById("pitch-table")
  };

  var state = {
    headers: [],
    rows: [],       // cellules dans l'ordre du fichier
    tables: [],     // tables du registre (Tables.load)
    table: null,    // table affichée, si elle vient du registre
    labels: []      // en-tête de chaque colonne affichée (symbole + nom)
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

  function renderReferenceTable() {
    var html = "<thead><tr>";
    state.headers.forEach(function (h, i) {
      html += "<th>" + escapeHtml(state.labels[i] || h) + "</th>";
    });
    html += "</tr></thead><tbody>";
    state.rows.forEach(function (row) {
      html += "<tr>";
      row.forEach(function (cell) { html += "<td>" + escapeHtml(cell) + "</td>"; });
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
    els.tableQuery.value = "";
  }

  var KEY_LABELS = { N: "N — nombre de dents", P: "P — pas diamétral" };

  function renderCsvTable(table) {
    state.headers = table.headers;
    state.rows = table.rows;
    state.labels = table.columnLabels || table.headers;
    els.formulaList.hidden = true;
    els.formulaList.innerHTML = "";
    els.tableWrap.hidden = false;
    els.tableQueryRow.hidden = false;
    els.tableQueryText.textContent = "Chercher par " + (KEY_LABELS[table.lookup] || table.lookup);
    els.csvStatus.className = "sub";
    els.csvStatus.textContent = table.title + " — " + table.rows.length + " lignes.";
    renderReferenceTable();
  }

  // Table de formules : chaque ligne est évaluée avec les valeurs du dernier calcul.
  function renderFormulaTable(table) {
    state.headers = [];
    state.rows = [];
    var count = 0;
    var html = "";
    table.groups.forEach(function (group) {
      if (group.name) html += "<h4>" + escapeHtml(group.name) + "</h4>";
      html += '<table class="grid formula"><thead><tr><th>Élément</th><th>Formule</th>' +
        "<th>Valeur</th></tr></thead><tbody>";
      group.rows.forEach(function (row) {
        var first = true;
        row.variants.forEach(function (variant) {
          var value = "—";
          var reason = "calcule d'abord un engrenage";
          try {
            value = fmt(Tables.evaluate(variant.expr), 4);
            reason = "";
          } catch (error) {
            reason = error.message;
          }
          var tex = variant.tex || "";
          var cell = tex
            ? '<span data-tex="' + escapeHtml(tex) + '">' + escapeHtml(variant.display) + "</span>"
            : escapeHtml(variant.display);
          html += "<tr><th>" + (first ? escapeHtml(row.label) : "") + "</th><td>" + cell +
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
    ["Diamètre extérieur D<sub>0</sub>", "outsideDiameter", 4],
    ["Addendum a", "addendum", 4],
    ["Dedendum b", "dedendum", 4],
    ["Profondeur totale h<sub>t</sub>", "wholeDepth", 4],
    ["Pas circulaire p", "circularPitch", 4],
    ["Épaisseur circulaire t", "toothThickness", 4],
    ["Épaisseur à la corde T", "chordalThickness", 4],
    ["Saillie à la corde H", "chordalAddendum", 4],
    ["Numéro de fraise", "cutter", 0],
    ["Diamètre de pige W", "pinDiameter", 4],
    ["Mesure sur piges M", "pinMeasurement", 4],
    ["M maxi", "pinMaxThinned", 4],
    ["M mini", "pinMinThinned", 4],
    ["ΔM (par 0,001 po)", "deltaM", 5],
    ["Dents enjambées k", "overTeeth", 0],
    ["Mesure entre dents", "overTeethMeasurement", 4]
  ];

  function computeTrain(event) {
    event.preventDefault();
    var mG = num(document.getElementById("mg").value);
    var C = num(document.getElementById("centre").value);
    var P = num(document.getElementById("train-dp").value);
    var angle = parseFloat(document.getElementById("angle").value);
    var msg = document.getElementById("train-message");
    var box = document.getElementById("train-results");
    var result = (mG > 0 && C > 0 && P > 0) ? Calculs.calculateTrain(mG, C, P, angle) : { ok: false, error: "Entre des valeurs positives." };
    if (!result.ok) {
      msg.textContent = result.error;
      msg.hidden = false;
      msg.className = "message error";
      box.hidden = true;
      return;
    }
    msg.hidden = true;
    applyTables(result.pinion, result.pinionTeeth, angle, P, "pinion");
    applyTables(result.gear, result.gearTeeth, angle, P, "gear");
    var dedendum = (angle === 14.5 ? 1.157 : 1.25) / P;
    Tables.setContext({
      P: P, p: Math.PI / P, phi: angle, C: C, mG: result.mG,
      NP: result.pinionTeeth, NG: result.gearTeeth,
      DP: result.pinionPitchDiameter, DG: result.gearPitchDiameter,
      N: result.pinionTeeth, D: result.pinionPitchDiameter,
      a: 1 / P, b: dedendum, aG: 1 / P, aP: 1 / P,
      ht: 1 / P + dedendum, hk: 2 / P, c: dedendum - 1 / P
    });
    if (state.table && state.table.kind === "formulas") renderFormulaTable(state.table);
    var html = "<thead><tr><th>Item</th><th>Pignon</th><th>Roue</th></tr></thead><tbody>";
    html += "<tr><td>Diamètre primitif D (pouce)</td><td>" + fmt(result.pinionPitchDiameter) + "</td><td>" + fmt(result.gearPitchDiameter) + "</td></tr>";
    ITEMS.forEach(function (item) {
      html += "<tr><td>" + item[0] + "</td><td>" + fmtItem(result.pinion[item[1]], item[2]) + "</td><td>" + fmtItem(result.gear[item[1]], item[2]) + "</td></tr>";
    });
    html += "</tbody>";
    document.getElementById("train-table").innerHTML = html;
    box.hidden = false;
  }

  // Numéro de fraise, dents à enjamber et mesure sur piges lus dans les tables du Handbook.
  function applyTables(item, teeth, angle, P, role) {
    var over = Tables.lookup(angle === 14.5 ? "table11-145" : "table11-20", { N: teeth });
    if (over) item.overTeeth = num(over.values.k);
    var cutter = Tables.lookup("cutters-standard", { N: teeth });
    if (cutter) item.cutter = cutter.values.cutter;
    // Tables 1 et 2 (p. 2303-2306) : pair ou impair, puis /P (guide §6.2).
    var pins = Tables.lookup(teeth % 2 === 0 ? "pins-even" : "pins-odd", { N: teeth });
    if (!pins) return;
    var raw = num(pins.values[pinField(angle)]);
    if (!isFinite(raw)) return;
    var mth = raw / P;
    item.pinMeasurement = mth;
    if (role === "pinion") {
      item.pinMaxThinned = mth;                 // pignon intact : Mth
      item.pinMinThinned = mth - 2 * item.deltaM;
    } else {
      item.pinMaxThinned = mth - 3 * item.deltaM; // roue amincie
      item.pinMinThinned = mth - 5 * item.deltaM;
    }
  }

  function fmtItem(value, digits) {
    return digits === 0 ? String(value) : fmt(value, digits);
  }

  // ---------- démarrage ----------

  document.getElementById("train-form").addEventListener("submit", computeTrain);
  els.tableSearch.addEventListener("click", searchTable);
  els.tableQuery.addEventListener("keydown", function (event) {
    if (event.key === "Enter") { event.preventDefault(); searchTable(); }
  });
  els.tableSelect.addEventListener("change", function () { showTable(els.tableSelect.value); });

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

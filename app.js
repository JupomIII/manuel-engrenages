/*
 * Interface : lecture du CSV, affichage des résultats, historique local.
 * Aucune dépendance, aucun build : le fichier est servi tel quel.
 */
(function () {
  "use strict";

  var CSV_PATH = "tables/Table 3. Gear Tooth Parts for American National Standard Coarse Pitch.csv";
  var STORAGE_KEY = "engrenages.historique.v1";

  var els = {
    form: document.getElementById("gear-form"),
    dp: document.getElementById("dp"),
    teeth: document.getElementById("teeth"),
    dpList: document.getElementById("dp-list"),
    message: document.getElementById("message"),
    results: document.getElementById("results"),
    resultsTable: document.getElementById("results-table"),
    match: document.getElementById("table-match"),
    matchTable: document.getElementById("match-table"),
    csvStatus: document.getElementById("csv-status"),
    tableSelect: document.getElementById("table-select"),
    tableQuery: document.getElementById("table-query"),
    tableSearch: document.getElementById("table-search"),
    tableFound: document.getElementById("table-found"),
    formulaList: document.getElementById("formula-list"),
    tableWrap: document.getElementById("table-wrap"),
    exportResultBtn: document.getElementById("export-result"),
    pitchTable: document.getElementById("pitch-table"),
    historyStatus: document.getElementById("history-status"),
    historyTable: document.getElementById("history-table"),
    exportBtn: document.getElementById("export"),
    clearBtn: document.getElementById("clear"),
    resetBtn: document.getElementById("reset"),
    gearAngle: document.getElementById("gear-angle")
  };

  var state = {
    headers: [],
    rows: [],       // cellules dans l'ordre du fichier
    tables: [],     // tables du registre (Tables.load)
    table: null,    // table affichée, si elle vient du registre
    history: [],
    last: null      // dernier résultat affiché, pour l'export
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

  function csvCell(value) {
    var text = value === null || value === undefined ? "" : String(value);
    if (/[",;\r\n]/.test(text)) {
      return '"' + text.replace(/"/g, '""') + '"';
    }
    return text;
  }

  function setMessage(text, kind) {
    els.message.textContent = text || "";
    els.message.hidden = !text;
    els.message.className = "message" + (kind ? " " + kind : "");
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

  // La 1re colonne du fichier contient une coquille sur la 1re ligne
  // (0.1142 au lieu de 0.3142) : on recalcule P depuis le pas circulaire.
  function rowPitch(row) {
    var circularPitch = num(row[1]);
    if (!isFinite(circularPitch) || circularPitch <= 0) return NaN;
    return Calculs.diametralPitchFromCircularPitch(circularPitch);
  }

  function renderReferenceTable() {
    var html = "<thead><tr>";
    state.headers.forEach(function (h) { html += "<th>" + escapeHtml(h) + "</th>"; });
    html += "</tr></thead><tbody>";
    state.rows.forEach(function (row) {
      html += "<tr>";
      row.forEach(function (cell) { html += "<td>" + escapeHtml(cell) + "</td>"; });
      html += "</tr>";
    });
    html += "</tbody>";
    els.pitchTable.innerHTML = html;
  }

  // at = colonne du pas diamétral dans la table affichée (null : on la déduit du pas circulaire).
  function fillPitchOptions(at) {
    var seen = {};
    var options = "";
    state.rows.forEach(function (row) {
      var p = (at === null || at === undefined) ? rowPitch(row) : num(row[at]);
      if (!isFinite(p) || p <= 0) return;
      var key = Math.round(p * 10000);
      if (seen[key]) return;
      seen[key] = true;
      options += '<option value="' + p.toFixed(4) + '"></option>';
    });
    els.dpList.innerHTML = options;
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
      els.csvStatus.className = "";
      els.csvStatus.textContent = parsed.rows.length + " lignes chargées depuis " + path + ".";
      renderReferenceTable();
      fillPitchOptions(null);
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

  function renderCsvTable(table) {
    state.headers = table.headers;
    state.rows = table.rows;
    els.formulaList.hidden = true;
    els.formulaList.innerHTML = "";
    els.tableWrap.hidden = false;
    els.csvStatus.className = "";
    els.csvStatus.textContent = table.title + " — " + table.rows.length + " lignes.";
    renderReferenceTable();
    fillPitchOptions(table.index.P !== undefined ? table.index.P : null);
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
          html += "<tr><th>" + (first ? escapeHtml(row.label) : "") + "</th><td>" +
            escapeHtml(variant.display) + '</td><td class="value"' +
            (reason ? ' title="' + escapeHtml(reason) + '"' : "") + ">" + value + "</td></tr>";
          first = false;
          count++;
        });
      });
      html += "</tbody></table>";
    });
    els.tableWrap.hidden = true;
    els.formulaList.hidden = false;
    els.formulaList.innerHTML = html;
    els.csvStatus.className = "";
    els.csvStatus.textContent = table.title + " — " + count +
      " formules. Les valeurs suivent le dernier calcul (P, N, p, angle).";
  }

  function searchTable() {
    var table = state.table;
    if (!table) return;
    if (table.kind === "formulas") {
      els.tableFound.className = "message";
      els.tableFound.textContent = "Table de formules : les valeurs sont déjà calculées à droite.";
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
      parts.push(found.table.headers[found.table.index[field]] + " = " + found.values[field]);
    });
    var keyLabels = { N: "nombre de dents", P: "pas diamétral" };
    els.tableFound.className = "message";
    els.tableFound.textContent = table.title + " : " + (keyLabels[table.lookup] || table.lookup) +
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

  // Cotes lues dans les tables du registre (protocole du guide, §6 à §8).
  function tableValues(P, N, angle) {
    var rows = [];
    // Table 3 pour les pas grossiers, Table 5 pour les pas fins (les deux vont jusqu'à P = 20).
    var props = P > 20 ?
      (Tables.lookup("table5", { P: P }) || Tables.lookup("table3", { P: P })) :
      (Tables.lookup("table3", { P: P }) || Tables.lookup("table5", { P: P }));
    if (props) {
      // Les présélections de b et de jeu de ces tables sont celles de la denture 20°.
      var shortTitle = props.table.title.split(" — ")[0] + (angle === 14.5 ? " (valeurs 20°)" : "");
      props.table.headers.forEach(function (header, i) {
        rows.push([shortTitle + " — " + header, props.row[i]]);
      });
    }
    var chordal = Tables.lookup(angle === 14.5 ? "table10-145" : "table10-20", { N: N });
    if (chordal) {
      var m1 = num(chordal.values.M);
      rows.push(["Table 10 — M à la corde, 1 D.P. (pouce)", chordal.values.M]);
      if (isFinite(m1)) rows.push(["M à la corde = table / P (pouce, sans jeu)", fmt(m1 / P)]);
    }
    var over = Tables.lookup(angle === 14.5 ? "table11-145" : "table11-20", { N: N });
    if (over) rows.push(["Table 11 — dents à enjamber k", over.values.k]);
    var pins = Tables.lookup(N % 2 === 0 ? "pins-even" : "pins-odd", { N: N });
    if (pins) {
      var raw = num(pins.values[pinField(angle)]);
      if (isFinite(raw)) {
        rows.push(["Piges (table " + (N % 2 === 0 ? "1, pair" : "2, impair") +
          ") — Mth = table / P (pouce)", fmt(raw / P)]);
      }
    }
    var cutter = Tables.lookup("cutters-standard", { N: N });
    if (cutter) rows.push(["Série de fraises (p. 2231) — numéro", cutter.values.cutter]);
    return rows;
  }

  function renderResults(gear, angle) {
    var lines = [
      ["Pas diamétral (P)", fmt(gear.diametralPitch), "1/pouce"],
      ["Nombre de dents (N)", String(gear.teeth), ""],
      ["Pas circulaire (p)", fmt(gear.circularPitch), "pouce"],
      ["Module", fmt(gear.module, 3), "mm"],
      ["Diamètre primitif", fmt(gear.pitchDiameter), "pouce"],
      ["Diamètre extérieur", fmt(gear.outsideDiameter), "pouce"],
      ["Diamètre de pied", fmt(gear.rootDiameter), "pouce"],
      ["Addendum", fmt(gear.addendum), "pouce"],
      ["Dédendum", fmt(gear.dedendum), "pouce"],
      ["Profondeur totale", fmt(gear.wholeDepth), "pouce"],
      ["Jeu (clearance)", fmt(gear.clearance), "pouce"],
      ["Épaisseur de dent (arc primitif)", fmt(gear.toothThickness), "pouce"]
    ];

    els.resultsTable.innerHTML = "<tbody>" + lines.map(function (line) {
      return '<tr><th>' + line[0] + '</th><td class="value">' + line[1] +
        '</td><td class="unit">' + line[2] + "</td></tr>";
    }).join("") + "</tbody>";

    var tableRows = tableValues(gear.diametralPitch, gear.teeth, angle);
    state.last = { lines: lines, tableRows: tableRows };

    if (tableRows.length > 0) {
      var rowsHtml = "";
      tableRows.forEach(function (row) {
        rowsHtml += "<tr><th>" + escapeHtml(row[0]) + '</th><td class="value">' +
          escapeHtml(row[1]) + "</td></tr>";
      });
      els.matchTable.innerHTML = "<tbody>" + rowsHtml + "</tbody>";
      els.match.hidden = false;
    } else {
      els.match.hidden = true;
    }

    els.results.hidden = false;
  }

  function compute(event) {
    if (event) event.preventDefault();

    var P = num(els.dp.value);
    var N = num(els.teeth.value);

    if (!isFinite(P) || P <= 0) {
      setMessage("Le pas diamétral doit être un nombre supérieur à 0.", "error");
      els.results.hidden = true;
      return;
    }
    if (!isFinite(N) || N < 1 || Math.round(N) !== N) {
      setMessage("Le nombre de dents doit être un entier supérieur ou égal à 1.", "error");
      els.results.hidden = true;
      return;
    }

    setMessage("", "");

    var angle = parseFloat(els.gearAngle.value) === 14.5 ? 14.5 : 20;
    var gear = Calculs.gearSpur(P, N, angle);
    Tables.setContext({
      P: P, N: N, D: gear.pitchDiameter, p: gear.circularPitch, phi: angle,
      a: gear.addendum, b: gear.dedendum, aG: gear.addendum, aP: gear.addendum,
      ht: gear.wholeDepth, hk: gear.addendum + gear.addendum, c: gear.clearance
    });
    renderResults(gear, angle);
    if (state.table && state.table.kind === "formulas") renderFormulaTable(state.table);
    if (!Tables.lookup("table3", { P: P }) && !Tables.lookup("table5", { P: P })) {
      setMessage("Pas de valeurs de table pour P = " + fmt(P) + " : les cotes sont calculées, mais les valeurs de table sont absentes.", "");
    }
    addHistory(gear);
  }

  // ---------- historique ----------

  function loadHistory() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var data = raw ? JSON.parse(raw) : [];
      state.history = Array.isArray(data) ? data : [];
    } catch (error) {
      state.history = [];
    }
    renderHistory();
  }

  function saveHistory() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.history));
    } catch (error) {
      setMessage("Historique non enregistré (stockage du navigateur indisponible).", "error");
    }
  }

  function addHistory(gear) {
    state.history.push({
      date: new Date().toISOString().slice(0, 19).replace("T", " "),
      diametralPitch: gear.diametralPitch,
      teeth: gear.teeth,
      pitchDiameter: gear.pitchDiameter,
      outsideDiameter: gear.outsideDiameter,
      rootDiameter: gear.rootDiameter,
      circularPitch: gear.circularPitch
    });
    saveHistory();
    renderHistory();
  }

  function renderHistory() {
    if (state.history.length === 0) {
      els.historyStatus.textContent = "Aucun calcul enregistré.";
      els.historyTable.innerHTML = "";
      return;
    }

    els.historyStatus.textContent = state.history.length +
      " calcul(s) enregistré(s). Les plus récents en premier.";

    var html = "<thead><tr><th>Date</th><th>P</th><th>Dents</th><th>Ø primitif</th>" +
      "<th>Ø extérieur</th><th>Ø pied</th></tr></thead><tbody>";
    state.history.slice().reverse().forEach(function (entry) {
      html += "<tr><td>" + escapeHtml(entry.date) + "</td><td>" + fmt(entry.diametralPitch) +
        "</td><td>" + entry.teeth + "</td><td>" + fmt(entry.pitchDiameter) +
        "</td><td>" + fmt(entry.outsideDiameter) + "</td><td>" + fmt(entry.rootDiameter) + "</td></tr>";
    });
    html += "</tbody>";
    els.historyTable.innerHTML = html;
  }

  function exportHistory() {
    if (state.history.length === 0) {
      setMessage("Rien à exporter : l'historique est vide.", "error");
      return;
    }

    var lines = ["Date,Pas diametral,Dents,Diametre primitif,Diametre exterieur,Diametre de pied,Pas circulaire"];
    state.history.forEach(function (entry) {
      lines.push([
        csvCell(entry.date),
        csvCell(entry.diametralPitch.toFixed(4)),
        csvCell(entry.teeth),
        csvCell(entry.pitchDiameter.toFixed(4)),
        csvCell(entry.outsideDiameter.toFixed(4)),
        csvCell(entry.rootDiameter.toFixed(4)),
        csvCell(entry.circularPitch.toFixed(4))
      ].join(","));
    });

    var blob = new Blob([lines.join("\r\n") + "\r\n"], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "calculs_engrenages.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Exporte le résultat affiché : cotes calculées puis valeurs de la table (si trouvées).
  function exportResult() {
    var last = state.last;
    if (!last) return;
    var rows = [["Paramètre", "Valeur", "Unité"]];
    last.lines.forEach(function (line) { rows.push([line[0], line[1], line[2]]); });
    rows.push([]);
    if (last.tableRows && last.tableRows.length > 0) {
      rows.push(["Valeurs des tables", "", ""]);
      last.tableRows.forEach(function (row) { rows.push([row[0], row[1], ""]); });
    } else {
      rows.push(["Valeurs de la table", "absentes pour ce pas", ""]);
    }
    var text = rows.map(function (row) { return row.map(csvCell).join(","); }).join("\r\n") + "\r\n";
    var blob = new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "resultat_engrenage.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function clearHistory() {
    if (state.history.length === 0) return;
    if (!window.confirm("Vider l'historique des calculs ?")) return;
    state.history = [];
    saveHistory();
    renderHistory();
  }

  // ---------- train de deux roues ----------

  var ITEMS = [
    ["Nombre de dents (N)", "teeth", 0],
    ["Diamètre extérieur D0", "outsideDiameter", 4],
    ["Addendum a", "addendum", 4],
    ["Dédendum b", "dedendum", 4],
    ["Profondeur totale ht", "wholeDepth", 4],
    ["Pas circulaire p", "circularPitch", 4],
    ["Épaisseur d'arc t", "toothThickness", 4],
    ["Épaisseur à la corde T", "chordalThickness", 4],
    ["Saillie à la corde H", "chordalAddendum", 4],
    ["Numéro de fraise", "cutter", 0],
    ["Diamètre de pige", "pinDiameter", 4],
    ["Mesure sur piges M", "pinMeasurement", 4],
    ["M maxi", "pinMaxThinned", 4],
    ["M mini", "pinMinThinned", 4],
    ["Courant ΔM (par 0,001 po)", "deltaM", 5],
    ["Nombre de dents enjambées k", "overTeeth", 0],
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
    Tables.setContext({
      P: P, p: Math.PI / P, phi: angle, C: C, mG: result.mG,
      NP: result.pinionTeeth, NG: result.gearTeeth,
      DP: result.pinionPitchDiameter, DG: result.gearPitchDiameter,
      N: result.pinionTeeth, D: result.pinionPitchDiameter,
      a: 1 / P, b: 1.25 / P, aG: 1 / P, aP: 1 / P, ht: 2.25 / P, hk: 2 / P, c: 0.25 / P
    });
    if (state.table && state.table.kind === "formulas") renderFormulaTable(state.table);
    var html = "<thead><tr><th>Item</th><th>Pignon</th><th>Roue</th></tr></thead><tbody>";
    html += "<tr><td>Diamètre primitif (pouce)</td><td>" + fmt(result.pinionPitchDiameter) + "</td><td>" + fmt(result.gearPitchDiameter) + "</td></tr>";
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
  els.form.addEventListener("submit", compute);

  els.resetBtn.addEventListener("click", function () {
    els.form.reset();
    setMessage("", "");
    els.results.hidden = true;
  });

  els.exportBtn.addEventListener("click", exportHistory);
  els.exportResultBtn.addEventListener("click", exportResult);
  els.clearBtn.addEventListener("click", clearHistory);
  els.tableSearch.addEventListener("click", searchTable);
  els.tableQuery.addEventListener("keydown", function (event) {
    if (event.key === "Enter") { event.preventDefault(); searchTable(); }
  });
  els.tableSelect.addEventListener("change", function () { showTable(els.tableSelect.value); });

  loadHistory();
  Tables.load().then(function (result) {
    state.tables = result.tables;
    if (result.errors.length > 0) {
      els.csvStatus.className = "message error";
      els.csvStatus.textContent = "Tables non chargées : " + result.errors.join(" ; ");
    }
    buildTableMenu();
  });
})();

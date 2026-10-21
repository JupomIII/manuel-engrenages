/*
 * Interface : lecture du CSV, affichage des résultats, historique local.
 * Aucune dépendance, aucun build : le fichier est servi tel quel.
 */
(function () {
  "use strict";

  var CSV_PATH = "table_engrenages.csv";
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
    pitchTable: document.getElementById("pitch-table"),
    historyStatus: document.getElementById("history-status"),
    historyTable: document.getElementById("history-table"),
    exportBtn: document.getElementById("export"),
    clearBtn: document.getElementById("clear"),
    resetBtn: document.getElementById("reset")
  };

  var state = {
    headers: [],
    rows: [],       // cellules dans l'ordre du fichier
    history: []
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

  function fillPitchOptions() {
    var seen = {};
    var options = "";
    state.rows.forEach(function (row) {
      var p = rowPitch(row);
      if (!isFinite(p) || p <= 0) return;
      var key = Math.round(p * 10000);
      if (seen[key]) return;
      seen[key] = true;
      options += '<option value="' + p.toFixed(4) + '"></option>';
    });
    els.dpList.innerHTML = options;
  }

  async function loadReference() {
    try {
      var response = await fetch(CSV_PATH, { cache: "no-cache" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      var parsed = parseCsv(await response.text());
      if (parsed.rows.length === 0) throw new Error("fichier vide");

      state.headers = parsed.headers;
      state.rows = parsed.rows;
      els.csvStatus.className = "";
      els.csvStatus.textContent = parsed.rows.length + " lignes chargées depuis " + CSV_PATH + ".";
      renderReferenceTable();
      fillPitchOptions();
    } catch (error) {
      els.csvStatus.className = "message error";
      els.csvStatus.textContent = "Impossible de charger " + CSV_PATH + " (" + error.message + "). " +
        "Le fichier doit être servi par un serveur local (python -m http.server) ou par GitHub Pages.";
    }
  }

  // ---------- calculs ----------

  function findTableRow(P) {
    var best = null;
    var bestGap = Infinity;
    state.rows.forEach(function (row) {
      var gap = Math.abs(rowPitch(row) - P);
      if (gap < bestGap) {
        bestGap = gap;
        best = row;
      }
    });
    return bestGap <= 0.0005 ? best : null;   // tolérance sur le pas diamétral
  }

  function renderResults(gear, tableRow) {
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

    if (tableRow) {
      var rowsHtml = "";
      for (var i = 2; i < state.headers.length; i++) {
        rowsHtml += "<tr><th>" + escapeHtml(state.headers[i]) + '</th><td class="value">' +
          escapeHtml(tableRow[i]) + "</td></tr>";
      }
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

    var gear = Calculs.gearSpur(P, N);
    var tableRow = findTableRow(P);
    renderResults(gear, tableRow);
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

  function clearHistory() {
    if (state.history.length === 0) return;
    if (!window.confirm("Vider l'historique des calculs ?")) return;
    state.history = [];
    saveHistory();
    renderHistory();
  }

  // ---------- démarrage ----------

  els.form.addEventListener("submit", compute);

  els.resetBtn.addEventListener("click", function () {
    els.form.reset();
    setMessage("", "");
    els.results.hidden = true;
  });

  els.exportBtn.addEventListener("click", exportHistory);
  els.clearBtn.addEventListener("click", clearHistory);

  loadHistory();
  loadReference();
})();

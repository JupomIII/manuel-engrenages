/*
 * Logique pure, sans DOM : transforme les mots reconnus par l'OCR en tableau.
 * Un mot = { text, x0, x1, yc, h, conf } (coordonnées en pixels de l'image).
 * 1. Les mots sont regroupés en lignes par position verticale.
 * 2. Les lignes qui contiennent surtout des chiffres forment le tableau
 *    (ça écarte titre, légendes et texte explicatif autour).
 * 3. Les colonnes sont les zones de l'axe horizontal où les centres des mots
 *    du tableau sont nombreux ; les fragments isolés (schéma, texte) sont ignorés.
 */
(function (global) {
  "use strict";

  function median(values) {
    if (values.length === 0) return 0;
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function mean(values) {
    if (values.length === 0) return 0;
    return values.reduce(function (sum, v) { return sum + v; }, 0) / values.length;
  }

  // Sortie TSV de Tesseract : une ligne par élément, level 5 = mot.
  function parseTsv(tsv) {
    var words = [];
    String(tsv || "").split(/\r?\n/).forEach(function (line, index) {
      if (index === 0 || !line) return;            // ligne d'en-tête
      var cols = line.split("\t");
      if (cols.length < 12 || cols[0] !== "5") return;
      var text = cols.slice(11).join("\t").trim();
      // Les traits du tableau (« | », « ! ») sont reconnus comme des mots : on les ignore.
      if (!/[0-9A-Za-z\u00C0-\u024F]/.test(text)) return;
      var left = parseFloat(cols[6]);
      var top = parseFloat(cols[7]);
      var width = parseFloat(cols[8]);
      var height = parseFloat(cols[9]);
      words.push({
        text: text,
        x0: left,
        x1: left + width,
        y0: top,
        y1: top + height,
        yc: top + height / 2,
        h: height,
        conf: parseFloat(cols[10])
      });
    });
    return words;
  }

  // Confiance moyenne (0 à 100) des mots reconnus ; sert à choisir l'orientation.
  function meanConfidence(words) {
    var valid = words.filter(function (w) { return w.conf >= 0; });
    return mean(valid.map(function (w) { return w.conf; }));
  }

  // Une ligne est « de tableau » si au moins 40 % de ses mots contiennent un chiffre.
  function isTableRow(row) {
    if (row.words.length < 3) return false;
    var withDigit = row.words.filter(function (w) { return /\d/.test(w.text); }).length;
    return withDigit / row.words.length >= 0.4;
  }

  // Colonnes : histogramme des centres horizontaux des mots du tableau.
  // Une colonne est une suite de cases assez peuplées (séparées au plus d'une case vide).
  function findColumns(words, medianHeight) {
    var centres = words
      .map(function (w) { return (w.x0 + w.x1) / 2; })
      .sort(function (a, b) { return a - b; });
    // Groupes : deux centres séparés de moins de la moitié de la largeur typique d'un mot
    // sont dans la même colonne (les colonnes du tableau sont espacées d'environ une largeur de mot).
    var gapLimit = 0.5 * (median(words.map(function (w) { return w.x1 - w.x0; })) || medianHeight);
    var groups = [];
    centres.forEach(function (c) {
      var g = groups[groups.length - 1];
      if (g && c - g.last <= gapLimit) {
        g.last = c;
        g.items.push(c);
      } else {
        groups.push({ last: c, items: [c] });
      }
    });
    // Un vrai colonne contient des mots sur la plupart des lignes ; les petits groupes
    // (fragments du schéma ou du texte) sont écartés.
    var maxN = Math.max.apply(null, groups.map(function (g) { return g.items.length; }));
    return groups
      .filter(function (g) { return g.items.length >= Math.max(2, 0.25 * maxN); })
      .map(function (g) { return { centre: mean(g.items) }; });
  }

  // Nettoyage des cellules numériques : l'OCR confond souvent 0/o, 5/s, et oublie le point.
  // La table ne contient que des valeurs du type 0.5056 ou 1.0294 (4 décimales).
  // Une cellule qui n'a que des chiffres et des caractères confondus est corrigée ;
  // le texte (en-têtes, « Teeth », etc.) est laissé tel quel.
  function cleanCell(text) {
    var t = String(text || "").trim();
    var compact = t.replace(/\s+/g, "");
    // Seuls les caractères qu'un chiffre peut donner à l'OCR sont acceptés.
    if (!/^[\dOoSs.|\[\]!%']+$/.test(compact)) return t;
    var fixed = compact.replace(/[Oo]/g, "0").replace(/[Ss]/g, "5").replace(/[^\d.]/g, "");
    if (fixed.replace(/\./g, "").length < 4) return t;
    if (/^\d{5}$/.test(fixed)) fixed = fixed.charAt(0) + "." + fixed.slice(1);
    return fixed;
  }

  // Colonne d'étiquettes décimales (pas 9.5, 8.5...) : le point est parfois perdu (« 95 »).
  // Si la colonne contient déjà des « d.d », un nombre de deux chiffres finissant par 5 reçoit le point.
  function restoreLostDecimals(table) {
    var width = 0;
    table.forEach(function (row) { width = Math.max(width, row.length); });
    for (var j = 0; j < width; j++) {
      var hasLabels = table.some(function (row) { return /^\d\.\d$/.test(row[j] || ""); });
      if (!hasLabels) continue;
      table.forEach(function (row) {
        var cell = row[j] || "";
        if (/^[1-9]5$/.test(cell)) row[j] = cell.charAt(0) + "." + cell.charAt(1);
      });
    }
    return table;
  }

  // Valeur plausible du tableau : 0.xxxx ou 1.xxxx (4 décimales).
  function isPlausibleValue(text) {
    return /^[01]\.\d{4}$/.test(String(text || "").replace(/\s+/g, ""));
  }

  // Mots dont la lecture doit être refaite en mode « chiffres seuls » : formés de chiffres
  // et des caractères que l'OCR confond avec eux (O, S, l, |...), avec au moins un chiffre
  // ou un O/S. Le texte (en-têtes, « Teeth »...) n'est pas concerné.
  function isNumericCandidate(text) {
    var compact = String(text || "").replace(/\s+/g, "");
    return /^[\dOoSsIl|\[\]!%'.]{2,}$/.test(compact) && /[\dOoSs]/.test(compact);
  }

  // Renvoie un tableau de lignes ; chaque ligne est un tableau de cellules (texte).
  function buildTable(words) {
    if (words.length === 0) return [];
    var medianHeight = median(words.map(function (w) { return w.h; })) || 1;

    // 1. Lignes : deux mots sont sur la même ligne si leurs centres verticaux sont proches.
    var sorted = words.slice().sort(function (a, b) { return a.yc - b.yc; });
    var rows = [];
    sorted.forEach(function (w) {
      var row = rows[rows.length - 1];
      if (!row || Math.abs(w.yc - row.yc) > 0.6 * medianHeight) {
        row = { yc: w.yc, words: [] };
        rows.push(row);
      }
      row.words.push(w);
      row.yc = mean(row.words.map(function (m) { return m.yc; }));
    });

    // 2. Lignes retenues : le tableau, sauf s'il y en a trop peu (tableau de texte seul).
    var tableRows = rows.filter(isTableRow);
    var source = tableRows.length >= 2 ? tableRows : rows;

    // 3. Colonnes détectées à partir des mots du tableau.
    var tableWords = [];
    source.forEach(function (row) { tableWords = tableWords.concat(row.words); });
    var columns = findColumns(tableWords, medianHeight);

    // 4. Chaque mot va dans la colonne dont le centre est le plus proche.
    function columnOf(centre) {
      var best = 0;
      var bestDistance = Infinity;
      columns.forEach(function (col, j) {
        var distance = Math.abs(centre - col.centre);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = j;
        }
      });
      return best;
    }

    var grid = source.map(function (row) {
      var cells = columns.map(function () { return []; });
      row.words.forEach(function (w) {
        cells[columnOf((w.x0 + w.x1) / 2)].push(w);
      });
      return cells.map(function (list) {
        return list.sort(function (a, b) { return a.x0 - b.x0; });
      });
    });

    // 5. Une colonne coupée en deux (ses mots tombent tantôt dans l'une, tantôt dans l'autre)
    //    n'a jamais deux cellules remplies sur une même ligne : on fusionne ces voisines.
    var merged = true;
    while (merged) {
      merged = false;
      for (var j = 0; j + 1 < columns.length; j++) {
        // Lignes où les deux colonnes sont remplies, et lignes où l'une ou l'autre l'est.
        var both = 0;
        var either = 0;
        grid.forEach(function (cells) {
          var a = cells[j].length > 0;
          var b = cells[j + 1].length > 0;
          if (a && b) both++;
          if (a || b) either++;
        });
        // Tolérance : quelques mots parasites (titre, bruit) ne doivent pas séparer une colonne.
        if (both <= Math.max(1, 0.1 * either)) {
          grid.forEach(function (cells) {
            cells[j] = cells[j].concat(cells[j + 1]).sort(function (a, b) { return a.x0 - b.x0; });
            cells.splice(j + 1, 1);
          });
          columns.splice(j + 1, 1);
          merged = true;
          break;
        }
      }
    }

    var table = grid.map(function (cells) {
      return cells.map(function (list) {
        return cleanCell(list.map(function (w) { return w.text; }).join(" "));
      });
    });

    return restoreLostDecimals(table.filter(function (row) {
      return row.some(function (cell) { return cell !== ""; });
    }));
  }

  global.OcrTable = {
    parseTsv: parseTsv,
    meanConfidence: meanConfidence,
    isNumericCandidate: isNumericCandidate,
    isPlausibleValue: isPlausibleValue,
    buildTable: buildTable
  };
})(window);

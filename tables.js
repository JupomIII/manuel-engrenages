/*
 * Tables de référence : chargement des tables déclarées dans tables/registry.json
 * et choix automatique de la table à utiliser pour une recherche.
 *
 * Une table de valeurs déclare :
 *   - lookup   : le champ qui sert de clé de recherche (ex. "P") ;
 *   - range    : au lieu d'une clé exacte, deux colonnes qui donnent un intervalle
 *                ({ min, max }, ex. la plage de dents d'une fraise) ;
 *   - columns  : champ interne -> en-tête exact dans le CSV.
 *
 * Une table de formules déclare kind = "formulas" et des groupes de lignes
 *   { label, variants: [{ display, expr }] }.
 * expr s'évalue avec evaluate() : + - * / ^, cos/sin/tan (degrés), sqrt, abs.
 */
(function (global) {
  "use strict";

  var REGISTRY_PATH = "tables/registry.json";
  var tables = [];
  var byId = {};
  var context = {};

  function parseCsv(text) {
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

  function num(value) {
    var n = parseFloat(String(value).trim().replace(",", "."));
    return isFinite(n) ? n : NaN;
  }

  // Lit un fichier du dossier tables/, avec repli sur la copie intégrée :
  // ouvert en double-clic (file://), le navigateur refuse fetch.
  async function readText(path) {
    try {
      var response = await fetch(path, { cache: "no-cache" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      return await response.text();
    } catch (error) {
      var embedded = global.EMBEDDED_TABLES && global.EMBEDDED_TABLES[path];
      if (embedded === undefined) throw error;
      return embedded;
    }
  }

  // ---------- formules ----------

  var FUNCTIONS = {
    // Les angles sont en degrés, comme dans le Handbook.
    sin: function (x) { return Math.sin(x * Math.PI / 180); },
    cos: function (x) { return Math.cos(x * Math.PI / 180); },
    tan: function (x) { return Math.tan(x * Math.PI / 180); },
    sqrt: Math.sqrt,
    abs: Math.abs,
    round: Math.round
  };

  function tokenize(expr) {
    var tokens = [];
    var re = /\s*([0-9]+(?:[.,][0-9]+)?|[A-Za-z_][A-Za-z_0-9]*|\*\*|[-+*/^(),])/g;
    var match;
    var last = 0;
    while ((match = re.exec(expr)) !== null) {
      if (match.index !== last) break;   // caractère non reconnu : on s'arrête
      tokens.push(match[1].replace(",", "."));
      last = re.lastIndex;
    }
    return tokens;
  }

  // Évalue une formule. Lève une erreur explicite si une valeur manque.
  function evaluate(expr, vars) {
    var tokens = tokenize(expr);
    var at = 0;
    vars = vars || context;

    function peek() { return tokens[at]; }
    function take() { return tokens[at++]; }

    function primary() {
      var t = take();
      if (t === undefined) throw new Error("formule incomplète");
      if (t === "(") {
        var inner = expression();
        if (take() !== ")") throw new Error("parenthèse fermante manquante");
        return inner;
      }
      if (t === "-") return -primary();
      if (t === "+") return primary();
      if (FUNCTIONS[t]) {
        if (take() !== "(") throw new Error("( attendue après " + t);
        var arg = expression();
        if (take() !== ")") throw new Error("parenthèse fermante manquante");
        return FUNCTIONS[t](arg);
      }
      if (/^[0-9]/.test(t)) return parseFloat(t);
      if (t === "pi") return Math.PI;
      if (t in vars && isFinite(vars[t])) return vars[t];
      throw new Error("valeur manquante : " + t);
    }

    function power() {
      var base = primary();
      if (peek() === "^" || peek() === "**") { take(); return Math.pow(base, power()); }
      return base;
    }

    function term() {
      var value = power();
      while (peek() === "*" || peek() === "/") {
        var op = take();
        var right = power();
        value = op === "*" ? value * right : value / right;
      }
      return value;
    }

    function expression() {
      var value = term();
      while (peek() === "+" || peek() === "-") {
        var op = take();
        var right = term();
        value = op === "+" ? value + right : value - right;
      }
      return value;
    }

    var result = expression();
    if (at < tokens.length) throw new Error("formule non comprise près de « " + tokens[at] + " »");
    return result;
  }

  // ---------- construction ----------

  function buildFormulas(entry) {
    return {
      id: entry.id,
      title: entry.title,
      kind: "formulas",
      groups: (entry.groups || []).map(function (group) {
        return {
          name: group.name || "",
          rows: (group.rows || []).map(function (row) {
            return {
              label: row.label,
              when: row.when || "",
              variants: (row.variants || []).map(function (variant) {
                return { display: variant.display, expr: variant.expr || "", tex: variant.tex || "" };
              })
            };
          })
        };
      })
    };
  }

  function buildCsv(entry, parsed) {
    var index = {};
    var labels = {};
    Object.keys(entry.columns).forEach(function (field) {
      var at = parsed.headers.indexOf(entry.columns[field]);
      if (at < 0) throw new Error("colonne introuvable : " + entry.columns[field]);
      index[field] = at;
      // En-tête affiché : libellé du registre (symbole + nom français), sinon l'en-tête du CSV.
      labels[field] = (entry.labels && entry.labels[field]) || parsed.headers[at];
    });
    var columnLabels = parsed.headers.map(function (header, i) {
      var field = Object.keys(index).filter(function (f) { return index[f] === i; })[0];
      return field ? labels[field] : header;
    });
    var range = null;
    if (entry.range) {
      range = {
        min: parsed.headers.indexOf(entry.range.min),
        max: parsed.headers.indexOf(entry.range.max)
      };
      if (range.min < 0 || range.max < 0) throw new Error("colonnes d'intervalle introuvables");
    }
    return {
      id: entry.id,
      title: entry.title,
      kind: "values",
      file: entry.file,
      lookup: entry.lookup,
      index: index,
      labels: labels,
      columnLabels: columnLabels,
      range: range,
      headers: parsed.headers,
      rows: parsed.rows,
      columns: entry.columns
    };
  }

  // Charge le registre puis chaque table. Une table qui échoue est signalée, pas bloquante.
  async function load() {
    tables = [];
    byId = {};
    var errors = [];
    var entries = [];
    try {
      entries = JSON.parse(await readText(REGISTRY_PATH));
    } catch (error) {
      return { tables: tables, errors: ["registre " + REGISTRY_PATH + " : " + error.message] };
    }

    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      try {
        var table;
        if (entry.kind === "formulas") {
          table = buildFormulas(entry);
        } else {
          table = buildCsv(entry, parseCsv(await readText("tables/" + entry.file)));
          if (table.rows.length === 0) throw new Error("fichier vide");
        }
        tables.push(table);
        byId[table.id] = table;
      } catch (error) {
        errors.push(entry.id + " : " + error.message);
      }
    }
    return { tables: tables, errors: errors };
  }

  // Ligne de la table dont la clé est la plus proche de value (tolérance 0.0005),
  // ou dont l'intervalle contient value.
  function findRow(table, value) {
    var best = null;
    var bestGap = Infinity;
    if (table.range) {
      for (var i = 0; i < table.rows.length; i++) {
        var lo = num(table.rows[i][table.range.min]);
        var hi = num(table.rows[i][table.range.max]);
        if (value >= lo && value <= hi) return table.rows[i];
      }
      return null;
    }
    var at = table.index[table.lookup];
    table.rows.forEach(function (row) {
      var gap = Math.abs(num(row[at]) - value);
      if (gap < bestGap) { bestGap = gap; best = row; }
    });
    return bestGap <= 0.0005 ? best : null;
  }

  function valuesOf(table, row) {
    var values = {};
    Object.keys(table.index).forEach(function (field) {
      values[field] = row[table.index[field]];
    });
    return values;
  }

  // Lecture d'une table par son identifiant : { table, row, values } ou null.
  function lookup(id, inputs) {
    var table = byId[id];
    if (!table || table.kind === "formulas") return null;
    var value = num(inputs[table.lookup]);
    if (!isFinite(value)) return null;
    var row = findRow(table, value);
    if (!row) return null;
    return { table: table, row: row, values: valuesOf(table, row) };
  }

  // Cherche dans les tables de valeurs, dans l'ordre du registre, une table qui répond.
  function resolve(fields, inputs) {
    for (var i = 0; i < tables.length; i++) {
      var table = tables[i];
      if (table.kind !== "values" || !(table.lookup in inputs)) continue;
      var wanted = fields || Object.keys(table.index);
      var providesAll = wanted.every(function (f) { return f in table.index; });
      if (!providesAll) continue;
      var result = lookup(table.id, inputs);
      if (!result) return { table: table, row: null, values: null };
      return result;
    }
    return null;
  }

  // Valeurs connues des calculs en cours, utilisées pour évaluer les formules.
  function setContext(values) {
    Object.keys(values || {}).forEach(function (key) {
      if (isFinite(values[key])) context[key] = values[key];
    });
  }

  global.Tables = {
    load: load,
    evaluate: evaluate,
    lookup: lookup,
    resolve: resolve,
    getAll: function () { return tables; },
    getById: function (id) { return byId[id] || null; },
    setContext: setContext,
    getContext: function () { return context; }
  };
})(window);

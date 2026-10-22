/*
 * Panneau « Table depuis une image » : OCR dans le navigateur (Tesseract.js).
 * La logique de reconstruction du tableau est dans ocr_table.js.
 */
(function () {
  "use strict";

  var LANG = "eng";
  var OCR_MAX_SIDE = 2400;       // taille cible pour l'OCR (les petites images sont agrandies)
  var GOOD_CONFIDENCE = 70;      // au-dessus, l'orientation est jugée bonne
  var ORIENTATION_ORDER = [0, 90, 270, 180];

  var els = {
    file: document.getElementById("ocr-file"),
    drop: document.getElementById("ocr-drop"),
    preview: document.getElementById("ocr-preview"),
    rotateLeft: document.getElementById("ocr-rotate-left"),
    rotateRight: document.getElementById("ocr-rotate-right"),
    run: document.getElementById("ocr-run"),
    status: document.getElementById("ocr-status"),
    gridWrap: document.getElementById("ocr-grid-wrap"),
    grid: document.getElementById("ocr-grid"),
    csv: document.getElementById("ocr-csv"),
    saveTables: document.getElementById("ocr-save-tables"),
    clear: document.getElementById("ocr-clear")
  };

  var state = {
    image: null,      // HTMLImageElement chargée
    rotation: null,   // null = orientation automatique pas encore faite ; sinon 0, 90, 180, 270
    table: []         // tableau de texte issu de l'OCR
  };
  var workerPromise = null;

  function setStatus(text, kind) {
    els.status.textContent = text;
    els.status.className = "message" + (kind ? " " + kind : "");
    els.status.hidden = !text;
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Dessine l'image tournée (en degrés, sens horaire) dans un canvas.
  function renderRotated(img, degrees, scale) {
    var w = img.naturalWidth;
    var h = img.naturalHeight;
    var swap = degrees % 180 !== 0;
    var canvas = document.createElement("canvas");
    canvas.width = Math.round((swap ? h : w) * scale);
    canvas.height = Math.round((swap ? w : h) * scale);
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(degrees * Math.PI / 180);
    ctx.drawImage(img, -w * scale / 2, -h * scale / 2, w * scale, h * scale);
    return canvas;
  }

  // Facteur d'agrandissement pour l'OCR : entre 1 et 3, pour une taille de référence stable.
  function ocrScale(img) {
    var maxSide = Math.max(img.naturalWidth, img.naturalHeight);
    return Math.min(3, Math.max(1, OCR_MAX_SIDE / maxSide));
  }

  function showPreview() {
    els.preview.innerHTML = "";
    if (!state.image) {
      els.preview.hidden = true;
      return;
    }
    var canvas = renderRotated(state.image, state.rotation || 0, 1);
    els.preview.appendChild(canvas);
    els.preview.hidden = false;
  }

  function getWorker() {
    if (!workerPromise) {
      if (typeof Tesseract === "undefined") {
        return Promise.reject(new Error("moteur OCR indisponible (vérifie la connexion internet)."));
      }
      workerPromise = Tesseract.createWorker(LANG, 1)
        .then(function (worker) {
          return worker.setParameters({
            tessedit_pageseg_mode: "6",
            preserve_interword_spaces: "1"
          }).then(function () { return worker; });
        })
        .catch(function (err) {
          workerPromise = null;
          throw err;
        });
    }
    return workerPromise;
  }

  // Lance l'OCR sur l'image tournée de `degrees`.
  function readAt(worker, degrees) {
    var canvas = renderRotated(state.image, degrees, ocrScale(state.image));
    return worker.recognize(canvas, {}, { text: true, tsv: true }).then(function (res) {
      var words = window.OcrTable.parseTsv(res.data.tsv);
      return {
        degrees: degrees,
        canvas: canvas,
        words: words,
        confidence: window.OcrTable.meanConfidence(words)
      };
    });
  }

  // Relit chaque mot numérique suspect sur sa propre zone, avec un alphabet limité aux chiffres
  // et au point : c'est beaucoup plus fiable que la lecture de toute la page.
  function refineNumbers(worker, result) {
    var candidates = result.words.filter(function (w) {
      return window.OcrTable.isNumericCandidate(w.text);
    });
    if (candidates.length === 0) return Promise.resolve(result);
    var PAD = 3;
    // Agrandissement de chaque zone : x4 donne les meilleures lectures sur les petits chiffres (mesuré).
    function digitCount(text) { return String(text || "").replace(/\D/g, "").length; }
    setStatus("Relecture des chiffres (" + candidates.length + ")…");
    // Lit une zone du canvas, agrandie (les petits chiffres sont mieux lus ainsi).
    function readCrop(w, psm, ZOOM) {
      ZOOM = ZOOM || 4;
      var left = Math.max(0, Math.floor(w.x0 - PAD));
      var top = Math.max(0, Math.floor(w.y0 - PAD));
      var width = Math.min(result.canvas.width - left, Math.ceil(w.x1 - w.x0 + 2 * PAD));
      var height = Math.min(result.canvas.height - top, Math.ceil(w.y1 - w.y0 + 2 * PAD));
      var zoomed = document.createElement("canvas");
      zoomed.width = width * ZOOM;
      zoomed.height = height * ZOOM;
      var ctx = zoomed.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, zoomed.width, zoomed.height);
      ctx.drawImage(result.canvas, left, top, width, height, 0, 0, zoomed.width, zoomed.height);
      return worker.setParameters({ tessedit_pageseg_mode: psm }).then(function () {
        return worker.recognize(zoomed, {}, { text: true });
      }).then(function (res) {
        return String(res.data.text || "").replace(/\s+/g, "");
      });
    }

    return worker.setParameters({ tessedit_char_whitelist: "0123456789." }).then(function () {
      // Première passe : mot seul (psm 8). On garde la nouvelle lecture seulement si elle ne perd pas de chiffres.
      return candidates.reduce(function (chain, w) {
        return chain.then(function () {
          return readCrop(w, "8").then(function (text) {
            if (/\d/.test(text) && digitCount(text) >= digitCount(w.text)) w.text = text;
          });
        });
      }, Promise.resolve());
    }).then(function () {
      // Seconde passe : les valeurs qui ont 4 chiffres mais ne ressemblent pas à 0.xxxx / 1.xxxx
      // (un chiffre oublié ou mal lu) sont relues en ligne (psm 7). On garde la lecture seulement si elle est plausible.
      var retry = candidates.filter(function (w) {
        return digitCount(w.text) >= 4 && !window.OcrTable.isPlausibleValue(w.text);
      });
      return retry.reduce(function (chain, w) {
        return chain.then(function () {
          return readCrop(w, "7").then(function (text) {
            if (window.OcrTable.isPlausibleValue(text)) w.text = text;
          });
        });
      }, Promise.resolve());
    }).then(function () {
      // Troisième passe : ce qui reste implausible est relu x6, en ligne brute (psm 13).
      var third = candidates.filter(function (w) {
        return digitCount(w.text) >= 4 && !window.OcrTable.isPlausibleValue(w.text);
      });
      return third.reduce(function (chain, w) {
        return chain.then(function () {
          return readCrop(w, "13", 6).then(function (text) {
            if (window.OcrTable.isPlausibleValue(text)) w.text = text;
          });
        });
      }, Promise.resolve());
    }).then(function () {
      return worker.setParameters({
        tessedit_char_whitelist: "",
        tessedit_pageseg_mode: "6"
      });
    }).then(function () { return result; });
  }

  // Sans rotation choisie : essaie les orientations jusqu'à obtenir une lecture fiable.
  function readWithAutoOrientation(worker) {
    var best = null;
    function attempt(i) {
      if (i >= ORIENTATION_ORDER.length) return Promise.resolve(best);
      var degrees = ORIENTATION_ORDER[i];
      setStatus("Lecture de l'image (orientation " + degrees + "°)…");
      return readAt(worker, degrees).then(function (result) {
        if (!best || result.confidence > best.confidence) best = result;
        if (best.confidence >= GOOD_CONFIDENCE) return best;
        return attempt(i + 1);
      });
    }
    return attempt(0);
  }

  function renderGrid() {
    if (state.table.length === 0) {
      els.gridWrap.hidden = true;
      els.grid.innerHTML = "";
      return;
    }
    var html = "<tbody>";
    state.table.forEach(function (row) {
      html += "<tr>" + row.map(function (cell) {
        return '<td contenteditable="true">' + escapeHtml(cell) + "</td>";
      }).join("") + "</tr>";
    });
    html += "</tbody>";
    els.grid.innerHTML = html;
    els.gridWrap.hidden = false;
  }

  // Lit le tableau tel qu'il est affiché (y compris les corrections manuelles).
  function readGrid() {
    return Array.prototype.map.call(els.grid.querySelectorAll("tr"), function (tr) {
      return Array.prototype.map.call(tr.querySelectorAll("td"), function (td) {
        return td.textContent.trim();
      });
    });
  }

  function csvCell(value) {
    var text = String(value);
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function csvText(rows) {
    return rows.map(function (row) {
      return row.map(csvCell).join(",");
    }).join("\r\n") + "\r\n";
  }

  // Dossier tables/ du site : l'utilisateur le choisit une fois (Chrome, Edge), puis chaque tableau
  // y est écrit directement, avec un index.json qui liste les fichiers. Ailleurs : téléchargement du CSV.
  var tablesDir = null;

  async function writeFile(dir, name, text) {
    var handle = await dir.getFileHandle(name, { create: true });
    var writable = await handle.createWritable();
    await writable.write(text);
    await writable.close();
  }

  async function readIndex(dir) {
    try {
      var handle = await dir.getFileHandle("index.json");
      return JSON.parse(await (await handle.getFile()).text());
    } catch (err) {
      if (err.name === "NotFoundError") return [];
      throw err;
    }
  }

  async function saveToTables() {
    var rows = readGrid();
    if (rows.length === 0) return;
    if (!window.showDirectoryPicker) {
      exportCsv();
      setStatus("Ce navigateur ne peut pas écrire dans un dossier : le CSV a été téléchargé.", "error");
      return;
    }
    try {
      if (!tablesDir) tablesDir = await window.showDirectoryPicker({ mode: "readwrite" });
      var stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      var file = "tableau_ocr_" + stamp + ".csv";
      await writeFile(tablesDir, file, "\uFEFF" + csvText(rows));
      var index = await readIndex(tablesDir);
      index.push({ file: file, saved: new Date().toISOString(), rows: rows.length, columns: rows[0].length });
      await writeFile(tablesDir, "index.json", JSON.stringify(index, null, 2) + "\n");
      setStatus("Tableau enregistré dans tables/ : " + file + ".");
    } catch (err) {
      if (err.name === "AbortError") return;
      tablesDir = null;
      setStatus("Enregistrement impossible (" + err.message + ").", "error");
    }
  }

  function exportCsv() {
    var rows = readGrid();
    if (rows.length === 0) return;
    var text = csvText(rows);
    // BOM UTF-8 pour que Excel lise correctement les accents.
    var blob = new Blob(["\uFEFF" + text], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "tableau_ocr.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function runOcr() {
    if (!state.image) return;
    els.run.disabled = true;
    setStatus("Chargement du moteur OCR (la première fois, quelques secondes)…");
    getWorker()
      .then(function (worker) {
        var read;
        if (state.rotation !== null) {
          setStatus("Lecture de l'image…");
          read = readAt(worker, state.rotation);
        } else {
          read = readWithAutoOrientation(worker).then(function (result) {
            state.rotation = result.degrees;
            showPreview();
            return result;
          });
        }
        return read.then(function (result) {
          return refineNumbers(worker, result);
        });
      })
      .then(function (result) {
        state.table = window.OcrTable.buildTable(result.words);
        renderGrid();
        if (state.table.length === 0) {
          setStatus("Aucun texte trouvé. Essaie une image plus nette ou tourne-la avec les boutons.", "error");
        } else {
          var lowConfidence = result.confidence < GOOD_CONFIDENCE;
          setStatus(
            state.table.length + " lignes lues. Vérifie et corrige les cellules avant d'exporter." +
            (lowConfidence ? " Lecture peu fiable : vérifie bien les chiffres." : ""),
            lowConfidence ? "error" : ""
          );
        }
      })
      .catch(function (err) {
        setStatus("Lecture impossible : " + err.message, "error");
      })
      .then(function () {
        els.run.disabled = false;
      });
  }

  function loadFile(file) {
    if (!file || !/^image\//.test(file.type)) {
      setStatus("Ce fichier n'est pas une image.", "error");
      return;
    }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      state.image = img;
      state.rotation = null;
      state.table = [];
      renderGrid();
      showPreview();
      setStatus("Image chargée. Clique sur « Lire le tableau ».");
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      setStatus("Impossible d'ouvrir cette image.", "error");
    };
    img.src = url;
  }

  function rotate(step) {
    if (!state.image) return;
    var current = state.rotation || 0;
    state.rotation = (current + step + 360) % 360;
    showPreview();
  }

  function clearAll() {
    state.image = null;
    state.rotation = null;
    state.table = [];
    els.file.value = "";
    showPreview();
    renderGrid();
    setStatus("");
  }

  // Collage (Ctrl+V) : on ne traite que les images, le texte reste collable normalement.
  document.addEventListener("paste", function (event) {
    var items = event.clipboardData ? event.clipboardData.items : [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === "file" && /^image\//.test(items[i].type)) {
        event.preventDefault();
        loadFile(items[i].getAsFile());
        return;
      }
    }
  });

  els.file.addEventListener("change", function () {
    loadFile(els.file.files[0]);
  });

  els.drop.addEventListener("dragover", function (event) {
    event.preventDefault();
    els.drop.classList.add("over");
  });
  els.drop.addEventListener("dragleave", function () {
    els.drop.classList.remove("over");
  });
  els.drop.addEventListener("drop", function (event) {
    event.preventDefault();
    els.drop.classList.remove("over");
    loadFile(event.dataTransfer.files[0]);
  });

  els.rotateLeft.addEventListener("click", function () { rotate(-90); });
  els.rotateRight.addEventListener("click", function () { rotate(90); });
  els.run.addEventListener("click", runOcr);
  els.csv.addEventListener("click", exportCsv);
  els.saveTables.addEventListener("click", saveToTables);
  els.clear.addEventListener("click", clearAll);
})();

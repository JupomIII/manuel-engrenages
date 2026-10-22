(function () {
  "use strict";

  var NS = "http://www.w3.org/2000/svg";

  // Termes cliqués sur le schéma, avec leur formule (pouces ; P = pas diamétral, N = dents).
  var TERMS = {
    pitch: { name: "Cercle primitif (Dp)", formula: "Dp = N / P" },
    outside: { name: "Diamètre extérieur (Do)", formula: "Do = (N + 2) / P" },
    root: { name: "Diamètre de pied (Dr)", formula: "Dr = (N - 2,5) / P" },
    base: { name: "Diamètre de base (DB)", formula: "DB = Dp × cos(φ)" },
    circular: { name: "Pas circulaire (p)", formula: "p = π / P" },
    thickness: { name: "Épaisseur circulaire", formula: "t = p / 2" },
    addendum: { name: "Addendum (a)", formula: "a = 1 / P ; 0,8 / P en denture trapue (stub)" },
    dedendum: { name: "Dedendum (b)", formula: "b = 1,157 / P (14,5°) ; 1,25 / P (20°) ; 1,35 / P (20°, arasée) ; 1 / P (trapue)" },
    wholeDepth: { name: "Hauteur totale (ht)", formula: "ht = a + b" },
    clearance: { name: "Jeu (clearance)", formula: "jeu = b - a (0,157/P ; 0,250/P ; 0,350/P arasée ; 0,200/P trapue)" },
    workingDepth: { name: "Hauteur de travail (hk)", formula: "hk = 2 / P" },
    centre: { name: "Entraxe (C)", formula: "C = (Dp pignon + Dp roue) / 2" },
    pressure: { name: "Angle de pression (φ)", formula: "φ = 14,5° ou 20°" },
    chordal: { name: "Épaisseur à la corde (T)", formula: "T = Dp × sin(90° / N)" },
    chordalAdd: { name: "Saillie à la corde (H)", formula: "H = a + (Dp / 2) × (1 - cos(90° / N))" }
  };

  var out = document.getElementById("term-formula");

  function el(tag, attrs, text) {
    var node = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (text !== undefined) node.textContent = text;
    return node;
  }

  // Étiquette cliquable : une flèche (ligne) et un texte, qui affiche la formule.
  function label(svg, key, x, y, lx, ly, text) {
    var g = el("g", { "class": "term", tabindex: "0", role: "button" });
    g.appendChild(el("line", { x1: x, y1: y, x2: lx, y2: ly, "class": "leader" }));
    g.appendChild(el("text", { x: lx, y: ly, "class": "term-text" }, text));
    var show = function () {
      out.textContent = TERMS[key].name + " : " + TERMS[key].formula;
    };
    g.addEventListener("click", show);
    g.addEventListener("keydown", function (e) { if (e.key === "Enter") show(); });
    svg.appendChild(g);
  }

  // Le dessin est placé ici ; les coordonnées sont dans un viewBox 480 × 460.
  var svg = el("svg", { viewBox: "0 0 480 460", "class": "nomenclature-svg", role: "img",
    "aria-label": "Nomenclature des dents d'engrenage" });
  var host = document.getElementById("nomenclature-svg");
  if (!host) return;
  host.appendChild(svg);

  // Contour de denture : n dents entre rayon de pied et rayon extérieur.
  function gearOutline(cx, cy, rOut, rRoot, n) {
    var pts = [];
    var step = (2 * Math.PI) / n;
    for (var i = 0; i < n; i++) {
      var a = i * step;
      var pts4 = [[rRoot, a], [rOut, a + step * 0.25], [rOut, a + step * 0.5], [rRoot, a + step * 0.7]];
      pts4.forEach(function (p) {
        pts.push((cx + p[0] * Math.cos(p[1])).toFixed(1) + "," + (cy + p[0] * Math.sin(p[1])).toFixed(1));
      });
    }
    return pts.join(" ");
  }

  function circle(cx, cy, r, cls) {
    return el("circle", { cx: cx, cy: cy, r: r, "class": cls });
  }

  var PIN = { x: 240, y: 110 };
  var GEAR = { x: 240, y: 330 };

  // Formes des deux engrenages.
  svg.appendChild(el("polygon", { points: gearOutline(PIN.x, PIN.y, 92, 78, 12), "class": "gear-body" }));
  svg.appendChild(el("polygon", { points: gearOutline(GEAR.x, GEAR.y, 112, 96, 16), "class": "gear-body" }));

  // Cercles de référence.
  svg.appendChild(circle(PIN.x, PIN.y, 85, "guide"));
  svg.appendChild(circle(GEAR.x, GEAR.y, 104, "guide"));
  svg.appendChild(circle(GEAR.x, GEAR.y, 88, "guide dashed"));
  svg.appendChild(circle(PIN.x, PIN.y, 68, "guide dashed"));

  // Axes et entraxe.
  svg.appendChild(el("line", { x1: PIN.x, y1: 10, x2: PIN.x, y2: 450, "class": "axis" }));
  svg.appendChild(el("line", { x1: 20, y1: 220, x2: 460, y2: 220, "class": "axis" }));

  // Étiquettes cliquables (position de la ligne -> position du texte).
  label(svg, "pitch", 300, 50, 385, 45, "Cercle primitif");
  label(svg, "outside", 240, 18, 60, 30, "Diamètre extérieur");
  label(svg, "root", 318, 110, 385, 170, "Diamètre de pied");
  label(svg, "base", 175, 110, 30, 120, "Diamètre de base");
  label(svg, "circular", 161, 409, 40, 415, "Pas circulaire");
  label(svg, "thickness", 190, 300, 30, 300, "Épaisseur circulaire");
  label(svg, "addendum", 340, 250, 420, 250, "Addendum");
  label(svg, "dedendum", 355, 300, 420, 300, "Dedendum");
  label(svg, "wholeDepth", 350, 320, 420, 340, "Hauteur totale");
  label(svg, "clearance", 240, 220, 40, 235, "Jeu");
  label(svg, "workingDepth", 290, 210, 380, 200, "Hauteur de travail");
  label(svg, "centre", 330, 110, 420, 140, "Entraxe");
  label(svg, "pressure", 120, 140, 30, 170, "Angle de pression");
  label(svg, "chordal", 200, 390, 40, 430, "Épaisseur à la corde");
  label(svg, "chordalAdd", 280, 390, 420, 430, "Saillie à la corde");
})();

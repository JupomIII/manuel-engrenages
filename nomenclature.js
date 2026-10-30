(function () {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var TERMS = {
    pitch: ["Cercle primitif (D)", "D = N / P"],
    outside: ["Cercle de tête (D₀)", "D₀ = D + 2a"],
    root: ["Cercle de pied (Dᵣ)", "Dᵣ = D − 2b"],
    base: ["Cercle de base (Dᵦ)", "Dᵦ = D cos(φ)"],
    circular: ["Pas circulaire (p)", "p = π / P : distance entre deux points homologues de dents voisines, sur le cercle primitif."],
    thickness: ["Épaisseur circulaire (t)", "t = p / 2 : épaisseur théorique mesurée le long de l’arc primitif, sans amincissement."],
    addendum: ["Saillie (a)", "a : distance radiale du cercle primitif au cercle de tête. Pour une denture standard, a = 1 / P."],
    dedendum: ["Creux (b)", "b : distance radiale du cercle primitif au cercle de pied. Sa valeur dépend du système et de la finition."],
    wholeDepth: ["Profondeur totale (hₜ)", "hₜ = a + b : distance radiale entre les cercles de tête et de pied."],
    clearance: ["Jeu radial (c)", "c = b − a pour les deux roues de mêmes proportions à l’entraxe standard. Il dépend des deux pièces."],
    workingDepth: ["Profondeur de travail (hₖ)", "hₖ = a pignon + a roue : hauteur totale des saillies des deux roues."],
    centre: ["Entraxe (C)", "C = (D pignon + D roue) / 2 à l’entraxe standard."],
    pressure: ["Angle de pression (φ)", "Angle entre la ligne d’action et la tangente commune aux cercles primitifs ; 14,5° ou 20° ici."],
    chordal: ["Épaisseur à la corde (T)", "T = D sin(90° / N) : corde entre les deux flancs au cercle primitif, sans amincissement."],
    chordalAdd: ["Saillie à la corde (H)", "H = a + D/2 × (1 − cos(90° / N)) : distance radiale de la tête à la corde T."]
  };
  var host = document.getElementById("nomenclature-svg");
  var out = document.getElementById("term-formula");
  if (!host || !out) return;
  function el(tag, attrs, content) {
    var node = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (key) { node.setAttribute(key, attrs[key]); });
    if (content !== undefined) node.textContent = content;
    return node;
  }
  function svg(viewBox, description) {
    var node = el("svg", { viewBox: viewBox, "class": "nomenclature-svg", role: "group", "aria-label": description });
    host.appendChild(node);
    return node;
  }
  function line(parent, x1, y1, x2, y2, cls) {
    parent.appendChild(el("line", { x1: x1, y1: y1, x2: x2, y2: y2, "class": cls }));
  }
  function circle(parent, x, y, r, cls) {
    parent.appendChild(el("circle", { cx: x, cy: y, r: r, "class": cls }));
  }
  function text(parent, x, y, value, cls) {
    parent.appendChild(el("text", { x: x, y: y, "class": cls }, value));
  }
  function path(parent, d, cls) { parent.appendChild(el("path", { d: d, "class": cls })); }
  function dimension(parent, x, top, bottom) {
    line(parent, x, top, x, bottom, "dimension-line");
    line(parent, x - 5, top, x + 5, top, "dimension-line");
    line(parent, x - 5, bottom, x + 5, bottom, "dimension-line");
  }
  var selected = null;
  function label(parent, key, caption, x, y, targetX, targetY) {
    var group = el("g", { "class": "term", tabindex: "0", role: "button", "aria-label": TERMS[key][0], "aria-pressed": "false" });
    if (targetX !== null) {
      group.appendChild(el("line", { x1: x - 8, y1: y - 4, x2: targetX, y2: targetY, "class": "leader" }));
      group.appendChild(el("circle", { cx: targetX, cy: targetY, r: 2, "class": "leader-dot" }));
    }
    group.appendChild(el("text", { x: x, y: y, "class": "term-text" }, caption));
    function show() {
      if (selected) { selected.setAttribute("class", "term"); selected.setAttribute("aria-pressed", "false"); }
      group.setAttribute("class", "term is-selected");
      group.setAttribute("aria-pressed", "true");
      selected = group;
      out.textContent = TERMS[key][0] + " — " + TERMS[key][1];
    }
    group.addEventListener("click", show);
    group.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); show(); }
    });
    parent.appendChild(group);
  }

  // Cercles concentriques d'une roue : les traits aboutissent exactement aux cercles.
  var wheel = svg("0 0 650 320", "Cercles de référence d'une roue dentée");
  text(wheel, 25, 29, "01 / CERCLES DE RÉFÉRENCE", "diagram-heading");
  var cx = 170, cy = 165;
  circle(wheel, cx, cy, 112, "guide outside-circle");
  circle(wheel, cx, cy, 100, "guide pitch-circle");
  circle(wheel, cx, cy, 94, "guide base-circle");
  circle(wheel, cx, cy, 85, "guide root-circle");
  line(wheel, 45, cy, 295, cy, "axis");
  line(wheel, cx, 40, cx, 290, "axis");
  circle(wheel, cx, cy, 2.5, "center-point");
  label(wheel, "outside", "Cercle de tête · D₀", 365, 75, cx + 112, cy);
  label(wheel, "pitch", "Cercle primitif · D", 365, 110, cx + 100, cy);
  label(wheel, "base", "Cercle de base · Dᵦ", 365, 145, cx + 94, cy);
  label(wheel, "root", "Cercle de pied · Dᵣ", 365, 180, cx + 85, cy);
  label(wheel, "circular", "Pas circulaire · p", 365, 223, null, null);
  label(wheel, "pressure", "Angle de pression · φ", 365, 254, null, null);
  label(wheel, "centre", "Entraxe · C", 365, 285, null, null);

  // Coupe schématique d'une dent. L'arc primitif et sa corde ont les mêmes extrémités ;
  // a et b sont mesurés au milieu de la dent, H jusqu'à la corde et non jusqu'à l'arc.
  var detail = svg("0 0 650 460", "Détail d'une dent : saillie, creux, arc primitif et corde");
  text(detail, 25, 30, "02 / DÉTAIL D’UNE DENT", "diagram-heading");
  text(detail, 25, 52, "Schéma agrandi, courbure exagérée pour la lisibilité", "diagram-note");
  // Le cercle primitif a son centre sous la dent : ses flancs le coupent en (120,220) et (240,220).
  path(detail, "M 91 330 Q 95 278 120 220 Q 133 175 140 105 L 220 105 Q 227 175 240 220 Q 265 278 269 330 Z", "detail-tooth");
  line(detail, 65, 105, 295, 105, "detail-guide");
  line(detail, 65, 330, 295, 330, "detail-guide");
  path(detail, "M 120 220 Q 180 187.47 240 220", "detail-arc");
  line(detail, 120, 220, 240, 220, "detail-chord");
  // Milieu de l'arc quadratique : y = 203,735 ; la corde passe à y = 220.
  var pitchTop = 203.735;
  dimension(detail, 305, 105, pitchTop);
  dimension(detail, 305, pitchTop, 330);
  dimension(detail, 325, 105, 330);
  dimension(detail, 345, 105, 220);
  line(detail, 180, 105, 180, 220, "detail-centerline");
  text(detail, 25, 91, "Tête", "diagram-note");
  text(detail, 25, 350, "Pied", "diagram-note");
  label(detail, "addendum", "a · Saillie", 385, 101, 305, 150);
  label(detail, "dedendum", "b · Creux", 385, 135, 305, 267);
  label(detail, "wholeDepth", "hₜ · Profondeur totale", 385, 169, 325, 275);
  label(detail, "chordalAdd", "H · Saillie à la corde", 385, 203, 345, 180);
  label(detail, "thickness", "t · Arc primitif", 385, 250, 222, 211.14);
  label(detail, "chordal", "T · Corde", 385, 284, 225, 220);
  label(detail, "workingDepth", "hₖ · Profondeur de travail", 370, 329, null, null);
  label(detail, "clearance", "c · Jeu radial", 370, 362, null, null);
  text(detail, 25, 402, "Les points de T sont les intersections des flancs avec l’arc primitif.", "diagram-note");
  text(detail, 25, 423, "hₖ et c concernent les deux roues : sélectionner pour la définition.", "diagram-note");
})();

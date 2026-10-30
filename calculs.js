/*
 * Formules pures, sans DOM : tout ce qui calcule vit ici.
 * Pour ajouter un autre type de calcul plus tard, ajoute une fonction
 * et expose-la dans window.Calculs.
 */
(function (global) {
  "use strict";

  /*
   * Proportions de dent (guide §4.2-4.3) : le guide énumère quatre facteurs
   * qui font varier la denture — l'angle de pression, la finition (arasée ou
   * rectifiée), la forme de denture (trapue/stub) et la finesse du pas.
   *   denture commune : a = 1/P ; b = 1,157/P (14½°), 1,250/P (20°),
   *                     1,350/P si la dent est arasée ou rectifiée (20°) ;
   *   denture trapue   : a = 0,8/P et b = 1,000/P (denture américaine stub).
   * options = { stub: true, shaved: true, addendum: n, dedendum: n }.
   * À pas grossier, shaved ne s'applique qu'à 20° ou 25°. addendum/dedendum, quand ils sont fournis,
   * sont les valeurs lues dans la table du bon pas (Table 3 ou Table 5) :
   * elles priment sur les coefficients, car le pas fin a un creux plus long.
   */
  function toothProportions(pressureAngleDeg, options) {
    var angle = pressureAngleDeg;
    var stub = !!(options && options.stub);
    var shaved = !!(options && options.shaved) && !stub && (angle === 20 || angle === 25 || (options && options.finePitch));
    return {
      angle: angle,
      stub: stub,
      shaved: shaved,
      addendumFactor: stub ? 0.8 : 1,
      dedendumFactor: stub ? 1 : (shaved ? 1.35 : (angle === 14.5 ? 1.157 : 1.25))
    };
  }

  /*
   * Saillie et creux retenus : les valeurs de table quand elles sont fournies
   * (options.addendum / options.dedendum), sinon les coefficients ci-dessus.
   */
  function toothSizes(diametralPitch, pressureAngleDeg, options) {
    options = Object.assign({}, options, { finePitch: options && typeof options.finePitch === "boolean" ? options.finePitch : diametralPitch > 20 });
    var props = toothProportions(pressureAngleDeg, options);
    var fromTable = function (key) {
      return options && typeof options[key] === "number" && isFinite(options[key]);
    };
    return {
      props: props,
      addendum: fromTable("addendum") ? options.addendum : props.addendumFactor / diametralPitch,
      dedendum: fromTable("dedendum") ? options.dedendum :
        (!props.stub && options.finePitch ?
          (props.shaved ? 1.35 : 1.2) / diametralPitch + 0.002 :
          props.dedendumFactor / diametralPitch)
    };
  }

  /*
   * Engrenage droit. Toutes les cotes sont en pouces, le pas diamétral P est en 1/pouce.
   * La saillie et le creux suivent toothSizes (table du pas, ou formule).
   */
  function gearSpur(diametralPitch, teeth, pressureAngleDeg, options) {
    var P = diametralPitch;
    var N = teeth;
    var sizes = toothSizes(P, pressureAngleDeg, options);
    var props = sizes.props;
    var finePitch = options && typeof options.finePitch === "boolean" ? options.finePitch : P > 20;
    var circularPitch = Math.PI / P;
    var addendum = sizes.addendum;
    var dedendum = sizes.dedendum;
    var pitchDiameter = N / P;

    return {
      diametralPitch: P,
      teeth: N,
      pressureAngle: props.angle,
      toothForm: props,
      circularPitch: circularPitch,
      module: 25.4 / P,
      pitchDiameter: pitchDiameter,
      baseDiameter: pitchDiameter * Math.cos(pressureAngleDeg * Math.PI / 180),
      workingDepth: 2 * addendum,
      rackFilletRadius: !props.stub && !finePitch && (pressureAngleDeg === 20 || pressureAngleDeg === 25) && !(pressureAngleDeg === 25 && props.shaved) ? 0.3 / P : NaN,
      outsideDiameter: pitchDiameter + 2 * addendum,
      rootDiameter: pitchDiameter - 2 * dedendum,
      addendum: addendum,
      dedendum: dedendum,
      wholeDepth: addendum + dedendum,
      clearance: dedendum - addendum,
      toothThickness: circularPitch / 2
    };
  }

  /*
   * Cotes selon le guide de calculs (formules 5 à 9) pour un angle de pression donné.
   * La saillie a et le creux b suivent toothProportions (denture commune ou trapue).
   * Épaisseur (T) et saillie à la corde (H) en pouces.
   */
  function gearChordal(diametralPitch, teeth, pressureAngleDeg, options) {
    var P = diametralPitch;
    var N = teeth;
    var sizes = toothSizes(P, pressureAngleDeg, options);
    var props = sizes.props;
    var half = (90 / N) * Math.PI / 180;
    var pitchDiameter = N / P;
    var addendum = sizes.addendum;
    return {
      pressureAngle: props.angle,
      toothForm: props,
      addendum: addendum,
      dedendum: sizes.dedendum,
      chordalThickness: pitchDiameter * Math.sin(half),
      chordalAddendum: addendum + (pitchDiameter / 2) * (1 - Math.cos(half))
    };
  }

  /*
   * Mesure sur piges (formule 13-14 du guide), P en 1/pouce, angle en degrés.
   * Pige 1,728/P. Renvoie M en pouces. Les valeurs de table du M.H. priment.
   */
  function pinMeasurement(diametralPitch, teeth, pressureAngleDeg, thinning) {
    var P = diametralPitch;
    var N = teeth;
    var a = pressureAngleDeg * Math.PI / 180;
    var W = 1.728 / P;
    var D = N / P;
    var ca = Math.cos(a);
    var invA = Math.tan(a) - a;
    var invPhi = invA + W / (D * ca) - Math.PI / (2 * N) - (thinning || 0) * P / N;
    var phi = inverseInvolute(invPhi);
    if (N % 2 === 0) {
      return D * ca / Math.cos(phi) + W;
    }
    return D * ca * Math.cos(Math.PI / (2 * N)) / Math.cos(phi) + W;
  }

  /*
   * Angle de contact de la pige (guide §6.4, formule 12 puis 13), en degrés.
   * inv α = inv φ + W/(D cos φ) − π/(2N). Sert à ΔM et au calcul de secours de M.
   */
  function contactAngle(diametralPitch, teeth, pressureAngleDeg) {
    var a = pressureAngleDeg * Math.PI / 180;
    var D = teeth / diametralPitch;
    var inv = Math.tan(a) - a + (1.728 / diametralPitch) / (D * Math.cos(a)) - Math.PI / (2 * teeth);
    return inverseInvolute(inv) * 180 / Math.PI;
  }

  // Handbook p. 2224 : T et H tabulés pour les fraises ordinaires n° 1 à 8,
  // denture usinée pleine profondeur. Valeurs pour les dents de référence de
  // chaque fraise : approximatives pour le reste de la plage (p. 2228).
  function milledChordalTable(P, cutter) {
    var rows = {
      "1": [[1.5707,1.5706,1.5702,1.5698,1.5694,1.5686,1.5675,1.5663],[1.0047,1.0112,1.0176,1.0237,1.0294,1.0362,1.0440,1.0514]],
      "1.5": [[1.0471,1.0470,1.0468,1.0465,1.0462,1.0457,1.0450,1.0442],[0.6698,0.6741,0.6784,0.6824,0.6862,0.6908,0.6960,0.7009]],
      "2": [[0.7853,0.7853,0.7851,0.7849,0.7847,0.7843,0.7837,0.7831],[0.5023,0.5056,0.5088,0.5118,0.5147,0.5181,0.5220,0.5257]],
      "2.5": [[0.6283,0.6282,0.6281,0.6279,0.6277,0.6274,0.6270,0.6265],[0.4018,0.4044,0.4070,0.4094,0.4117,0.4144,0.4176,0.4205]],
      "3": [[0.5235,0.5235,0.5234,0.5233,0.5231,0.5228,0.5225,0.5221],[0.3349,0.3370,0.3392,0.3412,0.3431,0.3454,0.3480,0.3504]],
      "3.5": [[0.4487,0.4487,0.4486,0.4485,0.4484,0.4481,0.4478,0.4475],[0.2870,0.2889,0.2907,0.2919,0.2943,0.2961,0.2977,0.3004]],
      "4": [[0.3926,0.3926,0.3926,0.3924,0.3923,0.3921,0.3919,0.3915],[0.2511,0.2528,0.2544,0.2559,0.2573,0.2590,0.2610,0.2628]],
      "5": [[0.3141,0.3141,0.3140,0.3139,0.3138,0.3137,0.3135,0.3132],[0.2009,0.2022,0.2035,0.2047,0.2058,0.2072,0.2088,0.2102]],
      "6": [[0.2618,0.2617,0.2617,0.2616,0.2615,0.2614,0.2612,0.2610],[0.1674,0.1685,0.1696,0.1706,0.1715,0.1727,0.1740,0.1752]],
      "7": [[0.2244,0.2243,0.2243,0.2242,0.2242,0.2240,0.2239,0.2237],[0.1435,0.1444,0.1453,0.1462,0.1470,0.1480,0.1491,0.1502]],
      "8": [[0.1963,0.1963,0.1962,0.1962,0.1961,0.1960,0.1959,0.1958],[0.1255,0.1264,0.1272,0.1279,0.1286,0.1295,0.1305,0.1314]],
      "9": [[0.1745,0.1745,0.1744,0.1744,0.1743,0.1743,0.1741,0.1740],[0.1116,0.1123,0.1130,0.1137,0.1143,0.1151,0.1160,0.1168]],
      "10": [[0.1570,0.1570,0.1570,0.1569,0.1569,0.1568,0.1567,0.1566],[0.1004,0.1011,0.1017,0.1023,0.1029,0.1036,0.1044,0.1051]],
      "11": [[0.1428,0.1428,0.1427,0.1427,0.1426,0.1426,0.1425,0.1424],[0.0913,0.0919,0.0925,0.0930,0.0935,0.0942,0.0949,0.0955]],
      "12": [[0.1309,0.1309,0.1308,0.1308,0.1308,0.1307,0.1306,0.1305],[0.0837,0.0842,0.0848,0.0853,0.0857,0.0863,0.0870,0.0876]],
      "14": [[0.1122,0.1122,0.1121,0.1121,0.1121,0.1120,0.1119,0.1118],[0.0717,0.0722,0.0726,0.0731,0.0735,0.0740,0.0745,0.0751]],
      "16": [[0.0981,0.0981,0.0981,0.0981,0.0980,0.0980,0.0979,0.0979],[0.0628,0.0632,0.0636,0.0639,0.0643,0.0647,0.0652,0.0657]],
      "18": [[0.0872,0.0872,0.0872,0.0872,0.0872,0.0871,0.0870,0.0870],[0.0558,0.0561,0.0565,0.0568,0.0571,0.0575,0.0580,0.0584]],
      "20": [[0.0785,0.0785,0.0785,0.0785,0.0784,0.0784,0.0783,0.0783],[0.0502,0.0505,0.0508,0.0511,0.0514,0.0518,0.0522,0.0525]]
    };
    var row = rows[String(P)];
    if (!row || !Number.isInteger(cutter) || cutter < 1 || cutter > 8) return null;
    return { thickness: row[0][cutter - 1], addendum: row[1][cutter - 1], referenceTeeth: [135,55,35,26,21,17,14,12][cutter - 1] };
  }

  // Nombre de dents à enjamber (Table 11 du M.H. / tableau 8 du guide).
  function teethOver(teeth, pressureAngleDeg) {
    var bands = pressureAngleDeg === 20 ?
      [[18, 2], [27, 3], [36, 4], [45, 5], [54, 6], [63, 7], [72, 8], [81, 9]] :
      [[18, 2], [37, 3], [50, 4], [62, 5], [75, 6], [87, 7], [100, 8], [110, 9]];
    if (!Number.isInteger(teeth) || teeth < 12 || (pressureAngleDeg !== 14.5 && pressureAngleDeg !== 20)) return NaN;
    for (var i = 0; i < bands.length; i++) {
      if (teeth <= bands[i][0]) return bands[i][1];
    }
    return NaN;
  }

  // Mesure entre dents (k dents enjambées), formule 16 du guide. Renvoie M en pouces.
  function overTeethMeasurement(diametralPitch, teeth, pressureAngleDeg) {
    var a = pressureAngleDeg * Math.PI / 180;
    var k = teethOver(teeth, pressureAngleDeg);
    var invA = Math.tan(a) - a;
    return Math.cos(a) * ((k - 0.5) * Math.PI + teeth * invA) / diametralPitch;
  }

  /*
   * Sensibilité de la mesure sur piges (guide §7) : variation de M pour 0,001 po
   * d'épaisseur de dent en moins, ΔM = 0,001 cos φ / sin α. Cette formule
   * approchée du guide ne remplace pas une tolérance de fabrication spécifiée.
   */
  function deltaM(diametralPitch, teeth, pressureAngleDeg) {
    var phi = pressureAngleDeg * Math.PI / 180;
    var alpha = contactAngle(diametralPitch, teeth, pressureAngleDeg) * Math.PI / 180;
    return 0.001 * Math.cos(phi) / Math.sin(alpha);
  }

  // Table 9, M.H. p. 2316 / notes de cours p. 46 : réduction de M pour
  // 0,001 po d'épaisseur en moins, denture extérieure. Interpolation linéaire.
  function backlashTableIncrement(teeth, pressureAngleDeg) {
    var data = {
      "14.5": [0.0019, 0.0024, 0.0028, 0.0030, 0.0031, 0.0032, 0.0035, 0.0036],
      "20": [0.0017, 0.0020, 0.0023, 0.0024, 0.0025, 0.0025, 0.0026, 0.0027],
      "25": [0.0015, 0.0017, 0.0019, 0.0020, 0.0020, 0.0020, 0.0021, 0.0021]
    };
    var counts = [5, 10, 20, 30, 40, 50, 100, 200];
    var values = data[String(pressureAngleDeg)];
    if (!values || !Number.isInteger(teeth) || teeth < counts[0] || teeth > counts[counts.length - 1]) return NaN;
    for (var i = 0; i < counts.length; i++) {
      if (teeth === counts[i]) return values[i];
      if (teeth < counts[i]) return values[i - 1] + (values[i] - values[i - 1]) * (teeth - counts[i - 1]) / (counts[i] - counts[i - 1]);
    }
    return NaN;
  }

  // Numéro de fraise (M.H. p. 2231) selon le nombre de dents.
  function cutterNumber(teeth) {
    // [dents max, n° de fraise] ; 135 et plus = crémaillère (n° 1).
    var bands = [[13, 8], [16, 7], [20, 6], [25, 5], [34, 4], [54, 3], [134, 2]];
    if (!Number.isInteger(teeth) || teeth < 12) return NaN;
    for (var i = 0; i < bands.length; i++) {
      if (teeth <= bands[i][0]) return bands[i][1];
    }
    return teeth >= 135 ? 1 : NaN;
  }

  // Inverse de inv(x) = tan x - x, par dichotomie sur [0, 1.5 rad].
  function inverseInvolute(value) {
    var lo = 0;
    var hi = Math.PI / 2 - 1e-12;
    if (!isFinite(value) || value < 0) return NaN;
    for (var i = 0; i < 100; i++) {
      var mid = (lo + hi) / 2;
      if (Math.tan(mid) - mid < value) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // Cotes d'une roue (item 1 à 19 du guide, sauf les lignes du train).
  function gearItems(P, N, angle, options) {
    var chordal = gearChordal(P, N, angle, options);
    var spur = gearSpur(P, N, angle, Object.assign({}, options, { finePitch: options && typeof options.finePitch === "boolean" ? options.finePitch : P > 20 }));
    var p = Math.PI / P;
    var pin = 1.728 / P;
    var mth = pinMeasurement(P, N, angle, 0);
    var dm = backlashTableIncrement(N, angle);
    return {
      teeth: N,
      outsideDiameter: N / P + 2 * chordal.addendum,
      rootDiameter: spur.rootDiameter,
      baseDiameter: spur.baseDiameter,
      clearance: spur.clearance,
      workingDepth: spur.workingDepth,
      rackFilletRadius: spur.rackFilletRadius,
      toothForm: chordal.toothForm,
      addendum: chordal.addendum,
      dedendum: chordal.dedendum,
      wholeDepth: chordal.addendum + chordal.dedendum,
      circularPitch: p,
      toothThickness: p / 2,
      chordalThickness: chordal.chordalThickness,
      chordalAddendum: chordal.chordalAddendum,
      cutter: cutterNumber(N),
      pinDiameter: pin,
      pinMeasurement: mth,
      deltaM: dm,
      // Roue amincie : M maxi = Mth − 3ΔM, M mini = Mth − 5ΔM (guide §7).
      pinMaxThinned: mth - 3 * dm,
      pinMinThinned: mth - 5 * dm,
      // Pignon intact : M maxi = Mth, M mini = Mth − 2ΔM.
      pinIntact: mth,
      pinMinIntact: mth - 2 * dm,
      overTeeth: teethOver(N, angle),
      overTeethMeasurement: overTeethMeasurement(P, N, angle)
    };
  }

  /*
   * Train à deux roues : rapport mG, entraxe C (pouces), pas diamétral P, angle de pression.
   * Renvoie { ok: false, error } si le nombre de dents n'est pas entier.
   */
  function calculateTrain(mG, C, P, angle, options) {
    if (!isFinite(mG) || !isFinite(C) || !isFinite(P) || mG <= 0 || C <= 0 || P <= 0 || (angle !== 14.5 && angle !== 20 && angle !== 25)) {
      return { ok: false, error: "Entre des valeurs positives et un angle de 14,5°, 20° ou 25°." };
    }
    if (mG < 1) return { ok: false, error: "Le rapport roue / pignon doit être supérieur ou égal à 1." };
    if (options && options.stub && angle !== 20) return { ok: false, error: "La denture stub américaine utilisée ici est définie à 20°." };
    if (options && options.shaved && (options.stub || (angle === 14.5 && !(typeof options.finePitch === "boolean" ? options.finePitch : P > 20)))) {
      return { ok: false, error: "Finition arasée ou rectifiée non définie pour cette denture." };
    }
    var NP = 2 * C * P / (mG + 1);
    var NG = mG * NP;
    if (Math.abs(NP - Math.round(NP)) > 1e-6 || Math.abs(NG - Math.round(NG)) > 1e-6) {
      return { ok: false, error: "Nombre de dents non entier (NP = " + NP.toFixed(3) + ", NG = " + NG.toFixed(3) + ")." };
    }
    NP = Math.round(NP);
    NG = Math.round(NG);
    if (NP < 12 || NG < 12 || !Number.isSafeInteger(NP) || !Number.isSafeInteger(NG)) {
      return { ok: false, error: "Chaque roue doit avoir au moins 12 dents ; les très grands nombres de dents ne sont pas pris en charge." };
    }
    return {
      ok: true,
      mG: mG,
      centerDistance: C,
      diametralPitch: P,
      pressureAngle: angle,
      proportions: toothSizes(P, angle, options).props,
      pinionTeeth: NP,
      gearTeeth: NG,
      pinionPitchDiameter: NP / P,
      gearPitchDiameter: NG / P,
      pinion: gearItems(P, NP, angle, options),
      gear: gearItems(P, NG, angle, options)
    };
  }

  // Table 4, p. 2216 : engrenages hélicoïdaux à pas fin, dimensions en pouces.
  // Pn et les proportions de dent sont dans le plan normal ; diamètres et entraxe dans le plan transversal.
  function helicalFinePitch(Pn, helixAngleDeg, pinionTeeth, gearTeeth, shaved) {
    if (!isFinite(Pn) || Pn < 20 || !isFinite(helixAngleDeg) || helixAngleDeg < 0 || helixAngleDeg >= 90 ||
        !Number.isSafeInteger(pinionTeeth) || !Number.isSafeInteger(gearTeeth) || pinionTeeth < 1 || gearTeeth < 1) {
      return { ok: false, error: "Entre un pas normal Pₙ ≥ 20, un angle d’hélice entre 0° et 90° exclus et des nombres de dents entiers positifs." };
    }
    var cosine = Math.cos(helixAngleDeg * Math.PI / 180);
    var addendum = 1 / Pn;
    var clearance = (shaved ? 0.35 : 0.2) / Pn + 0.002;
    var pinionDiameter = pinionTeeth / (Pn * cosine);
    var gearDiameter = gearTeeth / (Pn * cosine);
    return {
      ok: true,
      addendum: addendum,
      dedendum: (shaved ? 1.35 : 1.2) / Pn + 0.002,
      clearance: clearance,
      workingDepth: 2 / Pn,
      wholeDepth: 2 / Pn + clearance,
      normalToothThickness: Math.PI / (2 * Pn),
      normalCircularPitch: Math.PI / Pn,
      pinionPitchDiameter: pinionDiameter,
      gearPitchDiameter: gearDiameter,
      pinionOutsideDiameter: pinionDiameter + 2 * addendum,
      gearOutsideDiameter: gearDiameter + 2 * addendum,
      centerDistance: (pinionDiameter + gearDiameter) / 2
    };
  }

  /*
   * Pas diamétral déduit du pas circulaire d'une ligne du CSV.
   * On ne fait pas confiance à la 1re colonne du fichier : P = π / p.
   */
  function diametralPitchFromCircularPitch(circularPitch) {
    return Math.PI / circularPitch;
  }

  global.Calculs = {
    toothProportions: toothProportions,
    toothSizes: toothSizes,
    gearSpur: gearSpur,
    gearChordal: gearChordal,
    milledChordalTable: milledChordalTable,
    gearItems: gearItems,
    helicalFinePitch: helicalFinePitch,
    calculateTrain: calculateTrain,
    pinMeasurement: pinMeasurement,
    contactAngle: contactAngle,
    deltaM: deltaM,
    backlashTableIncrement: backlashTableIncrement,
    overTeethMeasurement: overTeethMeasurement,
    teethOver: teethOver,
    cutterNumber: cutterNumber,
    diametralPitchFromCircularPitch: diametralPitchFromCircularPitch
  };
})(window);

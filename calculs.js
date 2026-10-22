/*
 * Formules pures, sans DOM : tout ce qui calcule vit ici.
 * Pour ajouter un autre type de calcul plus tard, ajoute une fonction
 * et expose-la dans window.Calculs.
 */
(function (global) {
  "use strict";

  /*
   * Engrenage droit à denture commune, pleine profondeur.
   * Toutes les cotes sont en pouces, le pas diamétral P est en 1/pouce.
   * Le creux dépend de l'angle de pression (guide §4.3) : 1,157/P à 14½°, 1,250/P à 20°.
   */
  function gearSpur(diametralPitch, teeth, pressureAngleDeg) {
    var P = diametralPitch;
    var N = teeth;
    var angle = pressureAngleDeg === 14.5 ? 14.5 : 20;
    var circularPitch = Math.PI / P;
    var addendum = 1 / P;
    var dedendum = (angle === 14.5 ? 1.157 : 1.25) / P;
    var pitchDiameter = N / P;

    return {
      diametralPitch: P,
      teeth: N,
      pressureAngle: angle,
      circularPitch: circularPitch,
      module: 25.4 / P,
      pitchDiameter: pitchDiameter,
      outsideDiameter: (N + 2) / P,
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
   * Angle 14,5° : creux 1,157/P ; angle 20° : creux 1,250/P.
   * Épaisseur (T) et saillie à la corde (H) en pouces.
   */
  function gearChordal(diametralPitch, teeth, pressureAngleDeg) {
    var P = diametralPitch;
    var N = teeth;
    var dedendumFactor = pressureAngleDeg === 14.5 ? 1.157 : 1.25;
    var half = (90 / N) * Math.PI / 180;
    var pitchDiameter = N / P;
    var addendum = 1 / P;
    return {
      pressureAngle: pressureAngleDeg,
      addendum: addendum,
      dedendum: dedendumFactor / P,
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

  // Nombre de dents à enjamber (Table 11 du M.H. / tableau 8 du guide).
  function teethOver(teeth, pressureAngleDeg) {
    var bands = pressureAngleDeg === 20 ?
      [[18, 2], [27, 3], [36, 4], [45, 5], [54, 6], [63, 7], [72, 8], [81, 9], [90, 10]] :
      [[18, 2], [37, 3], [50, 4], [62, 5], [75, 6], [87, 7], [100, 8], [110, 9]];
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
   * d'épaisseur de dent en moins, ΔM = 0,001 cos φ / sin α. On la tire de la
   * formule des piges, ce qui évite une table intermédiaire.
   */
  function deltaM(diametralPitch, teeth, pressureAngleDeg) {
    return pinMeasurement(diametralPitch, teeth, pressureAngleDeg, 0) -
      pinMeasurement(diametralPitch, teeth, pressureAngleDeg, 0.001);
  }

  // Numéro de fraise (M.H. p. 2231) selon le nombre de dents.
  function cutterNumber(teeth) {
    // [dents max, n° de fraise] ; 135 et plus = crémaillère (n° 1).
    var bands = [[13, 8], [16, 7], [20, 6], [25, 5], [34, 4], [54, 3], [134, 2]];
    for (var i = 0; i < bands.length; i++) {
      if (teeth <= bands[i][0]) return bands[i][1];
    }
    return 1;
  }

  // Inverse de inv(x) = tan x - x, par dichotomie sur [0, 1.5 rad].
  function inverseInvolute(value) {
    var lo = 0;
    var hi = 1.5;
    for (var i = 0; i < 200; i++) {
      var mid = (lo + hi) / 2;
      if (Math.tan(mid) - mid < value) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // Cotes d'une roue (item 1 à 19 du guide, sauf les lignes du train).
  function gearItems(P, N, angle) {
    var chordal = gearChordal(P, N, angle);
    var p = Math.PI / P;
    var pin = 1.728 / P;
    var mth = pinMeasurement(P, N, angle, 0);
    var dm = deltaM(P, N, angle);
    return {
      teeth: N,
      outsideDiameter: (N + 2) / P,
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
  function calculateTrain(mG, C, P, angle) {
    var NP = 2 * C * P / (mG + 1);
    var NG = mG * NP;
    if (Math.abs(NP - Math.round(NP)) > 1e-6 || Math.abs(NG - Math.round(NG)) > 1e-6) {
      return { ok: false, error: "Nombre de dents non entier (NP = " + NP.toFixed(3) + ", NG = " + NG.toFixed(3) + ")." };
    }
    NP = Math.round(NP);
    NG = Math.round(NG);
    return {
      ok: true,
      mG: mG,
      centerDistance: C,
      diametralPitch: P,
      pressureAngle: angle,
      pinionTeeth: NP,
      gearTeeth: NG,
      pinionPitchDiameter: NP / P,
      gearPitchDiameter: NG / P,
      pinion: gearItems(P, NP, angle),
      gear: gearItems(P, NG, angle)
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
    gearSpur: gearSpur,
    gearChordal: gearChordal,
    gearItems: gearItems,
    calculateTrain: calculateTrain,
    pinMeasurement: pinMeasurement,
    contactAngle: contactAngle,
    deltaM: deltaM,
    overTeethMeasurement: overTeethMeasurement,
    teethOver: teethOver,
    cutterNumber: cutterNumber,
    diametralPitchFromCircularPitch: diametralPitchFromCircularPitch
  };
})(window);

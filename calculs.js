/*
 * Formules pures, sans DOM : tout ce qui calcule vit ici.
 * Pour ajouter un autre type de calcul plus tard, ajoute une fonction
 * et expose-la dans window.Calculs.
 */
(function (global) {
  "use strict";

  /*
   * Engrenage droit à denture standard (profondeur de travail 2/P).
   * Toutes les cotes sont en pouces, le pas diamétral P est en 1/pouce.
   */
  function gearSpur(diametralPitch, teeth) {
    var P = diametralPitch;
    var N = teeth;
    var circularPitch = Math.PI / P;
    var addendum = 1 / P;
    var dedendum = 1.25 / P;

    return {
      diametralPitch: P,
      teeth: N,
      circularPitch: circularPitch,
      module: 25.4 / P,
      pitchDiameter: N / P,
      outsideDiameter: (N + 2) / P,
      rootDiameter: (N - 2.5) / P,
      addendum: addendum,
      dedendum: dedendum,
      wholeDepth: addendum + dedendum,
      clearance: dedendum - addendum,
      toothThickness: circularPitch / 2
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
    diametralPitchFromCircularPitch: diametralPitchFromCircularPitch
  };
})(window);

/* Vérifications ciblées : node tools/test_calculs.js */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
global.window = global;
require('../calculs.js');
const near = (actual, expected, tolerance = 0.000005) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} ≠ ${expected}`);

// Guide 241-HAL-07, tableau 9, train 1.
const train = Calculs.calculateTrain(3, 4, 12, 14.5);
assert.equal(train.ok, true);
assert.equal(train.pinionTeeth, 24);
assert.equal(train.gearTeeth, 72);
near(train.gear.chordalThickness, 0.13089);
near(train.gear.chordalAddendum, 0.08405);
near(train.pinion.chordalThickness, 0.13081);
near(train.pinion.chordalAddendum, 0.08547);
near(train.gear.dedendum, 0.09642);
near(train.gear.wholeDepth, 0.17975);
near(train.gear.pinMeasurement, 74.4977 / 12);
near(train.pinion.pinMeasurement, 26.4247 / 12);
near(train.gear.overTeethMeasurement, 1.42624);
near(train.pinion.overTeethMeasurement, 0.64439);
near(train.gear.deltaM, 0.003332, 1e-12);
near(train.pinion.deltaM, 0.00288, 1e-12);
near(Calculs.backlashTableIncrement(50, 14.5), 0.0032, 1e-12);
near(Calculs.backlashTableIncrement(72, 14.5), 0.003332, 1e-12);
assert.ok(Number.isNaN(Calculs.backlashTableIncrement(201, 14.5)));
assert.deepEqual(Calculs.milledChordalTable(12, 2), { thickness: 0.1309, addendum: 0.0842, referenceTeeth: 55 });
assert.deepEqual(Calculs.milledChordalTable(12, 5), { thickness: 0.1308, addendum: 0.0857, referenceTeeth: 21 });
assert.equal(Calculs.milledChordalTable(22, 2), null);

// Handbook p. 2216, Table 4, pas fin non tabulé.
near(Calculs.toothSizes(22, 20, {}).dedendum, 1.2 / 22 + 0.002, 1e-12);
near(Calculs.toothSizes(22, 14.5, { shaved: true }).dedendum, 1.35 / 22 + 0.002, 1e-12);
near(Calculs.toothSizes(12, 20, { stub: true }).dedendum, 1 / 12, 1e-12);
assert.equal(Calculs.calculateTrain(1, 0.01, 1, 20).ok, false);
assert.equal(Calculs.calculateTrain(1, Infinity, 12, 20).ok, false);
assert.ok(Number.isNaN(Calculs.teethOver(82, 20)));
assert.ok(Number.isNaN(Calculs.overTeethMeasurement(12, 82, 20)));
assert.equal(Calculs.calculateTrain(0.5, 3, 12, 20).ok, false);
assert.equal(Calculs.calculateTrain(1, 2, 12, 14.5, { stub: true }).ok, false);
near(Calculs.toothSizes(20, 20, { finePitch: true }).dedendum, 0.062, 1e-12);
near(Calculs.toothSizes(20, 20, { finePitch: false }).dedendum, 0.0625, 1e-12);
for (const [angle, n, k] of [[20, 18, 2], [20, 19, 3], [20, 27, 3], [20, 28, 4], [20, 81, 9], [14.5, 37, 3], [14.5, 38, 4], [14.5, 110, 9]]) {
  assert.equal(Calculs.teethOver(n, angle), k);
}
// Guide tableau 12 : 22 dents paires, 55 impaires, P = 22.
near(Calculs.pinMeasurement(22, 22, 20, 0), 24.3952 / 22, 0.00001);
near(Calculs.pinMeasurement(22, 55, 20, 0), 57.4093 / 22, 0.00001);
assert.equal(Calculs.teethOver(22, 20), 3);
assert.equal(Calculs.teethOver(55, 20), 7);
near(Calculs.overTeethMeasurement(22, 55, 20), 0.90723);
// Handbook p. 2319 : 30 dents, P=6, 14½°, mesure sur 3 dents.
near(Calculs.overTeethMeasurement(6, 30, 14.5), 1.2941, 0.00005);
// Guide tableaux 10, 13 et 14 : autres trains, nombres de dents et cotes.
for (const [ratio, center, P, angle, np, ng, tGear, hGear, spanPinion] of [
  [3, 4, 12, 20, 24, 72, 0.13089, 0.08405, 0.64304],
  [2, 2.25, 16, 20, 24, 48, 0.09816, 0.06330, 0.48228],
  [1.5, 2.5, 8, 20, 16, 24, 0.19621, 0.12821, 0.58154]
]) {
  const result = Calculs.calculateTrain(ratio, center, P, angle);
  assert.equal(result.ok, true);
  assert.equal(result.pinionTeeth, np); assert.equal(result.gearTeeth, ng);
  near(result.gear.chordalThickness, tGear);
  near(result.gear.chordalAddendum, hGear);
  near(result.pinion.overTeethMeasurement, spanPinion);
}
const guideThird = Calculs.calculateTrain(4, 5.5, 10, 20);
assert.equal(guideThird.gearTeeth, 88);
assert.ok(Number.isNaN(guideThird.gear.overTeeth)); // pas d'extrapolation de la Table 11
assert.equal(Calculs.calculateTrain(3, 4, 12, 14.5, { shaved: true }).ok, false);
assert.equal(Calculs.calculateTrain(1, 1, 24, 20, { stub: true, shaved: true }).ok, false);
assert.equal(Calculs.toothProportions(14.5, { finePitch: true, shaved: true }).dedendumFactor, 1.35);

// Handbook Tables 1–2 et 6 : dimensions et cas de proportions distincts.
const spur = Calculs.gearSpur(12, 24, 20, { finePitch: false });
near(spur.baseDiameter, 2 * Math.cos(20 * Math.PI / 180), 1e-12);
near(spur.rootDiameter, (24 - 2.5) / 12, 1e-12);
near(spur.clearance, 0.25 / 12, 1e-12);
near(spur.workingDepth, 2 / 12, 1e-12);
near(spur.rackFilletRadius, 0.3 / 12, 1e-12);
const stub = Calculs.gearSpur(12, 24, 20, { stub: true });
near(stub.addendum, 0.8 / 12, 1e-12); near(stub.wholeDepth, 1.8 / 12, 1e-12);
near(stub.workingDepth, 1.6 / 12, 1e-12); near(stub.clearance, 0.2 / 12, 1e-12);
assert.ok(Number.isNaN(stub.rackFilletRadius));
const a25 = Calculs.calculateTrain(3, 4, 12, 25, { shaved: true });
assert.equal(a25.ok, true); near(a25.pinion.dedendum, 1.35 / 12, 1e-12);
assert.ok(Number.isNaN(a25.pinion.overTeeth));
assert.ok(Number.isNaN(a25.pinion.rackFilletRadius));
// Table 4 : hélicoïdal, y compris limites, ψ = 0 et géométrie non nulle.
const helix = Calculs.helicalFinePitch(24, 30, 24, 48, false);
assert.equal(helix.ok, true);
near(helix.addendum, 1 / 24, 1e-12); near(helix.dedendum, 0.052, 1e-12);
near(helix.wholeDepth, 2.2 / 24 + 0.002, 1e-12);
near(helix.clearance, 0.2 / 24 + 0.002, 1e-12);
near(helix.pinionPitchDiameter, 1 / Math.cos(Math.PI / 6), 1e-12);
near(helix.gearOutsideDiameter, (48 / Math.cos(Math.PI / 6) + 2) / 24, 1e-12);
near(helix.centerDistance, 3 / (2 * Math.cos(Math.PI / 6)), 1e-12);
const helixShaved = Calculs.helicalFinePitch(24, 0, 24, 48, true);
near(helixShaved.dedendum, 1.35 / 24 + 0.002, 1e-12);
near(helixShaved.wholeDepth, 2.35 / 24 + 0.002, 1e-12);
near(helixShaved.centerDistance, 1.5, 1e-12);
for (const args of [[19, 30, 24, 48], [24, 90, 24, 48], [24, 30, 24.5, 48]])
  assert.equal(Calculs.helicalFinePitch(...args).ok, false);

// Vérifie le branchement de l'interface et la copie intégrée sans navigateur.
const elements = {};
function element(id) {
  return elements[id] || (elements[id] = {
    value: '', hidden: false, textContent: '', innerHTML: '', className: '',
    addEventListener(type, handler) { this[type] = handler; }
  });
}
global.document = { getElementById: element, querySelector: () => null };
global.fetch = async () => { throw new Error('offline'); };
vm.runInThisContext(fs.readFileSync('tables_embedded.js', 'utf8'));
vm.runInThisContext(fs.readFileSync('tables.js', 'utf8'));
vm.runInThisContext(fs.readFileSync('app.js', 'utf8'));
(async () => {
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(Tables.getById('table4-fine'));
  assert.equal(Tables.getById('table6-rack145').groups.length, 2);
  Object.assign(element('helical-pn'), { value: '24' });
  Object.assign(element('helical-angle'), { value: '30' });
  Object.assign(element('helical-np'), { value: '24' });
  Object.assign(element('helical-ng'), { value: '48' });
  element('helical-finish').value = 'preferred';
  element('helical-form').submit({ preventDefault() {} });
  assert.match(element('helical-results').innerHTML, /1\.15470/);
  near(Tables.evaluate('NPh / (Pn * cos(psi))'), helix.pinionPitchDiameter, 1e-12);
  // Toutes les variantes de la Table 4 doivent pouvoir s'évaluer avec leurs propres données.
  const formulaTable = Tables.getById('table4-fine');
  const spurVars = { P: 24, D: 1, N: 24, DP: 1, NP: 24, NG: 48 };
  const helixVars = { Pn: 24, psi: 30, NPh: 24, NGh: 48 };
  for (const [groupIndex, vars] of [[0, spurVars], [1, helixVars]]) {
    for (const row of formulaTable.groups[groupIndex].rows)
      for (const variant of row.variants)
        assert.ok(Number.isFinite(Tables.evaluate(variant.expr, vars)), variant.display);
  }
  const variants = formulaTable.groups[1].rows;
  near(Tables.evaluate(variants[0].variants[0].expr, helixVars), helix.addendum, 1e-12);
  near(Tables.evaluate(variants[1].variants[0].expr, helixVars), helix.dedendum, 1e-12);
  near(Tables.evaluate(variants[8].variants[0].expr, helixVars), helix.pinionOutsideDiameter, 1e-12);
  near(Tables.evaluate(variants[9].variants[0].expr, helixVars), helix.centerDistance, 1e-12);
  for (const group of Tables.getById('table6-rack145').groups)
    for (const row of group.rows) for (const variant of row.variants)
      assert.ok(Number.isFinite(Tables.evaluate(variant.expr, { P: 12, p: Math.PI / 12 })), variant.display);
  const run = (ratio, center, pitch, angle, form = 'standard', finish = 'preferred') => {
    Object.assign(element('mg'), { value: String(ratio) });
    Object.assign(element('centre'), { value: String(center) });
    Object.assign(element('train-dp'), { value: String(pitch) });
    Object.assign(element('angle'), { value: String(angle) });
    Object.assign(element('tooth-form'), { value: form });
    Object.assign(element('tooth-finish'), { value: finish });
    element('train-form').submit({ preventDefault() {} });
  };
  run(3, 4, 12, 14.5);
  assert.match(element('train-table').innerHTML, /0\.13089/);
  assert.match(element('train-table').innerHTML, /0\.08405/);
  assert.match(element('train-table').innerHTML, /0\.09642/);
  assert.match(element('train-table').innerHTML, /0\.0842/);
  assert.match(element('train-table').innerHTML, /6\.19815/);
  assert.match(element('train-table').innerHTML, /6\.19148/);
  assert.match(element('train-table').innerHTML, /2\.19630/);
  assert.match(element('train-table').innerHTML, /0\.003332/);
  assert.match(element('train-sources').textContent, /55.*roue/);
  run(1, 1, 22, 20);
  assert.match(element('train-form-note').textContent, /0\.05655/);
  run(1, 1, 24, 20);
  assert.match(element('train-form-note').textContent, /0\.05200/);
  run(2.5, 1.75, 22, 20);
  assert.match(element('train-sources').textContent, /22 dents \(pair, Table 1\)/);
  assert.match(element('train-sources').textContent, /55 dents \(impair, Table 2\)/);
  assert.match(element('train-table').innerHTML, /2\.60951/);
  assert.match(element('train-table').innerHTML, /1\.10887/);
  element('pitch-system').value = 'fine';
  run(1, 1, 20, 20);
  assert.match(element('train-form-note').textContent, /0\.06200/);
  element('pitch-system').value = 'coarse';
  run(1, 1, 20, 20);
  assert.match(element('train-form-note').textContent, /0\.06250/);
  element('train-form').input();
  assert.equal(element('train-results').hidden, true);
  run(1, 1, 24, 14.5, 'standard', 'shaved');
  assert.match(element('train-form-note').textContent, /0\.05820/);
  run(1, 1, 0.01, 20);
  assert.equal(element('train-results').hidden, true);
  run(1, 1, 24.0004, 20);
  assert.equal(element('train-results').hidden, true);
  assert.equal(Tables.getContext().Pn, 24);
  assert.equal(Tables.getContext().psi, 30);
  assert.equal(Tables.getContext().P, undefined);
  run(1, 201 / 12, 12, 20);
  assert.match(element('train-table').innerHTML, /M maxi \(exemple du guide\)<\/td><td>16\.95406<\/td><td>—/);
  assert.match(element('train-table').innerHTML, /M mini \(exemple du guide\)<\/td><td>—<\/td><td>—/);
  run(3, 4, 12, 14.5, 'stub', 'shaved');
  assert.equal(element('train-results').hidden, true);
  // N=172 absent des tables de piges : limites pignon intact malgré le secours.
  run(1, 172 / 12, 12, 20);
  const m = Calculs.pinMeasurement(12, 172, 20, 0).toFixed(5);
  assert.ok(element('train-table').innerHTML.includes(`<td>${m}</td><td>${m}</td></tr><tr><td>M maxi (exemple du guide)</td><td>${m}</td>`));
  assert.match(element('train-sources').textContent, /formule de secours/);
  assert.equal(Tables.lookup('table3', { P: 0.3142 }).values.a, '3.1831');
  element('helical-form').input();
  assert.equal(element('helical-results').hidden, true);
  assert.throws(() => Tables.evaluate('NPh / (Pn * cos(psi))'), /valeur manquante/);
  console.log('Vérifications ciblées réussies.');
})().catch(error => { console.error(error); process.exitCode = 1; });

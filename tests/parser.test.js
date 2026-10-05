// Tests für Parser und Kennzahlen. Aufruf: node tests/parser.test.js
// Lädt die Skriptblöcke "konfig" und "kern" direkt aus index.html – keine Abhängigkeiten.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const block = id => {
  const m = new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`).exec(html);
  if (!m) throw new Error(`Skriptblock "${id}" nicht gefunden`);
  return m[1];
};
const ctx = vm.createContext({ Intl });
vm.runInContext(block('konfig') + '\n' + block('kern') + `
  ;Object.assign(globalThis, { KONFIG, VERGLEICHE, parseCSV, zeilenZuDatensaetzen, normalisiereBuecher,
    filterNachJahr, berechneKennzahlen, jahresAuswertung, formatStunden, formatTageStunden,
    waehleVergleiche, rundeVerhaeltnis, zahl });`, ctx);
const K = ctx;

let ok = 0, fail = 0;
function test(name, fn) {
  try { fn(); ok++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); }
}
const eq = (a, b) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), b);

console.log('\nCSV-Parser (RFC 4180)');
test('einfache Felder', () => eq(K.parseCSV('a,b,c\n1,2,3'), [['a', 'b', 'c'], ['1', '2', '3']]));
test('Komma in Anführungszeichen', () => eq(K.parseCSV('"Salz, Stein",x'), [['Salz, Stein', 'x']]));
test('"" als Escape', () => eq(K.parseCSV('"Das ""Große"" Buch",1'), [['Das "Große" Buch', '1']]));
test('Zeilenumbruch im Feld', () => eq(K.parseCSV('"Zeile 1\nZeile 2",b\nc,d'), [['Zeile 1\nZeile 2', 'b'], ['c', 'd']]));
test('CRLF-Zeilenenden', () => eq(K.parseCSV('a,b\r\n1,2\r\n'), [['a', 'b'], ['1', '2']]));
test('BOM am Anfang wird entfernt', () => eq(K.parseCSV('﻿Title,x\n1,2'), [['Title', 'x'], ['1', '2']]));
test('leere Felder und leere Zeilen', () => eq(K.parseCSV('a,,c\n\n,,\n'), [['a', '', 'c'], ['', '', '']]));
test('leeres gequotetes Feld am Zeilenende', () => eq(K.parseCSV('a,""\nb,c'), [['a', ''], ['b', 'c']]));
test('Goodreads-ISBN-Format ="…"', () => eq(K.parseCSV('"=""3000000001""",x'), [['="3000000001"', 'x']]));
test('Anführungszeichen mitten im Feld bleiben wörtlich', () => eq(K.parseCSV('5" Zoll,b'), [['5" Zoll', 'b']]));
test('fehlende Pflichtspalten → verständlicher Fehler', () => {
  assert.throws(() => K.zeilenZuDatensaetzen(K.parseCSV('Name,Seiten\nx,1')), /Fehlende Spalten: Title, Author/);
});

console.log('\nBeispiel-CSV (beispiel/goodreads_beispiel.csv)');
const csv = fs.readFileSync(path.join(__dirname, '..', 'beispiel', 'goodreads_beispiel.csv'), 'utf8');
const zeilen = K.parseCSV(csv);
const daten = K.zeilenZuDatensaetzen(zeilen);
const buecher = K.normalisiereBuecher(daten, {});
const opt = { mehrfach: false, minutenProSeite: 2 };
const byTitle = t => buecher.find(b => b.titel === t);

test('17 Datenzeilen trotz mehrzeiliger Rezension', () => assert.strictEqual(daten.length, 17));
test('alle Zeilen haben 24 Spalten', () => assert.ok(zeilen.every(z => z.length === 24)));
test('nur "read" zählt: 15 Bücher (currently-reading/to-read raus)', () => assert.strictEqual(buecher.length, 15));
test('Titel mit Komma korrekt', () => assert.ok(byTitle('Salz, Stein und Sterne')));
test('Titel mit "" korrekt', () => assert.ok(byTitle('Das "Große" Winterbuch')));
test('mehrzeilige Rezension verschiebt keine Spalten', () => {
  const b = byTitle('Das Archiv der verlorenen Sommer');
  eq([b.seiten, b.datum, b.leseanzahl], [384, '2024-05-30', 1]);
});
test('Seiten leer → null, nicht 0', () => assert.strictEqual(byTitle('Kupfer & Kreide').seiten, null));
test('Seiten 0 → null, nicht 0', () => assert.strictEqual(byTitle('Die Uhrmacherin von Lindau').seiten, null));
test('Datum leer → kein Jahr', () => eq([byTitle('Nachtzug nach Tallinn').jahr, byTitle('Nachtzug nach Tallinn').datum], [null, null]));
test('Datum YYYY/MM/DD → Jahr', () => assert.strictEqual(byTitle('Der leise Kartograf').jahr, 2024));
test('Bewertung 0 = nicht bewertet', () => assert.strictEqual(byTitle('Wolkenatlas für Anfänger').bewertung, 0));

const k = K.berechneKennzahlen(buecher, opt);
test('Kennzahlen gesamt', () => eq(
  [k.anzahl, k.seiten, k.ohneSeiten, k.ohneDatum, k.minuten],
  [15, 4894, 2, 1, 9788]));
test('Ø Seiten nur über Bücher mit Seitenzahl (4.894 / 13)', () => assert.strictEqual(Math.round(k.durchschnittSeiten), 376));
test('dickstes / dünnstes Buch', () => eq([k.dickstes.titel, k.duennstes.titel], ['Der leise Kartograf', 'Kleine Theorie des Regens']));
test('Ø Bewertung ohne 0-Bewertungen (54 / 14)', () => assert.strictEqual(k.durchschnittBewertung.toFixed(2), '3.86'));

const km = K.berechneKennzahlen(buecher, { ...opt, mehrfach: true });
test('Schalter "mehrfach zählen": Read Count 2 zählt doppelt', () => eq([km.anzahl, km.seiten, km.titelAnzahl], [16, 6078, 15]));

test('manuelle Seitenzahl wird übernommen', () => {
  const b2 = K.normalisiereBuecher(daten, { 'gr:900011': 333 });
  const kk = K.berechneKennzahlen(b2, opt);
  eq([kk.seiten, kk.ohneSeiten, b2.find(b => b.titel === 'Kupfer & Kreide').seitenManuell], [5227, 1, true]);
});
test('manuelle Seitenzahl überschreibt keine CSV-Seitenzahl', () => {
  const b2 = K.normalisiereBuecher(daten, { 'gr:900001': 999 });
  assert.strictEqual(b2.find(b => b.id === 'gr:900001').seiten, 312);
});

const jahre = K.jahresAuswertung(buecher, opt);
test('Jahresauswertung ohne Buch ohne Datum', () => eq(
  jahre.map(j => [j.jahr, j.buecher, j.seiten, j.ohneSeiten]),
  [[2022, 1, 188, 0], [2023, 3, 740, 1], [2024, 5, 2225, 0], [2025, 5, 1485, 1]]));
test('Summe Jahre + ohne Datum = gesamt', () => assert.strictEqual(jahre.reduce((a, j) => a + j.buecher, 0) + k.ohneDatum, k.anzahl));
test('Jahresfilter 2024', () => assert.strictEqual(K.berechneKennzahlen(K.filterNachJahr(buecher, 2024), opt).seiten, 2225));
test('Filter "ohne Lesedatum"', () => eq(K.filterNachJahr(buecher, 'ohne').map(b => b.titel), ['Nachtzug nach Tallinn']));
test('Lücken zwischen Jahren werden mit 0 gefüllt', () => {
  const l = K.jahresAuswertung([{ jahr: 2019, seiten: 100, leseanzahl: 1, bewertung: 0 }, { jahr: 2021, seiten: 50, leseanzahl: 1, bewertung: 0 }], opt);
  eq(l.map(j => [j.jahr, j.buecher]), [[2019, 1], [2020, 0], [2021, 1]]);
});

console.log('\nFormatierung');
test('deutsche Tausenderpunkte', () => assert.strictEqual(K.zahl(1234567), '1.234.567'));
test('vierstellig mit Punkt (1.234)', () => assert.strictEqual(K.zahl(1234), '1.234'));
test('Stunden', () => assert.strictEqual(K.formatStunden(9788), '163 Std.'));
test('Tage und Stunden', () => assert.strictEqual(K.formatTageStunden(9788), '6 Tage, 19 Std.'));
test('Beispiel 3 Tage, 4 Std.', () => assert.strictEqual(K.formatTageStunden(76 * 60), '3 Tage, 4 Std.'));
test('genau 1 Tag', () => assert.strictEqual(K.formatTageStunden(24 * 60), '1 Tag'));
test('unter 10 Std. mit Komma', () => assert.strictEqual(K.formatStunden(270), '4,5 Std.'));

console.log('\nVergleiche');
test('nur Ergebnisse zwischen 1 und 100, max. 4', () => {
  const v = K.waehleVergleiche(163, 'Std.');
  assert.ok(v.length >= 3 && v.length <= 4);
  assert.ok(v.every(x => x.verhaeltnis >= 1 && x.verhaeltnis <= 100));
});
test('fast gleich große Vergleiche werden nicht doppelt gezeigt', () => {
  const namen = K.waehleVergleiche(163, 'Std.').map(v => v.wert);
  assert.ok(!(namen.includes(9) && namen.includes(9.3)));
});
test('Wert < 1 bei allen → kleinster Vergleich als Anteil', () => {
  const v = K.waehleVergleiche(0.5, 'Std.');
  eq([v.length, v[0].wert, v[0].zahlText, v[0].bruch], [1, 1.75, '30 %', true]);
});
test('Rundung: <10 auf 0,5; <=100 ganz; >100 zwei Stellen', () => eq(
  [K.rundeVerhaeltnis(8.3).text, K.rundeVerhaeltnis(17.4).text, K.rundeVerhaeltnis(1234).text],
  ['8,5', '17', '1.200']));
test('alle Vergleiche haben Name, Wert, Einheit, Quelle', () => assert.ok(
  K.VERGLEICHE.every(v => v.name && v.wert > 0 && ['Std.', 'Seiten'].includes(v.einheit) && v.quelle)));

console.log('\nErgebnis Beispiel-CSV:');
console.log(`  Bücher: ${k.anzahl} | Seiten: ${K.zahl(k.seiten)} | Lesedauer: ${K.formatStunden(k.minuten)} (${K.formatTageStunden(k.minuten)})`);
console.log(`  ohne Seitenzahl: ${k.ohneSeiten} | ohne Lesedatum: ${k.ohneDatum} | Ø Seiten: ${Math.round(k.durchschnittSeiten)} | Ø Bewertung: ${k.durchschnittBewertung.toFixed(1).replace('.', ',')}`);
console.log('  Zeit-Vergleiche:   ' + K.waehleVergleiche(k.minuten / 60, 'Std.').map(v => `ca. ${v.zahlText} × ${v.name}`).join(' | '));
console.log('  Seiten-Vergleiche: ' + K.waehleVergleiche(k.seiten, 'Seiten').map(v => `ca. ${v.zahlText} × ${v.name}`).join(' | '));

console.log(`\n${ok} bestanden, ${fail} fehlgeschlagen\n`);
process.exit(fail ? 1 : 0);

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
    normalisiereAlle, filterNachJahr, berechneKennzahlen, jahresAuswertung, formatStunden, formatTageStunden,
    waehleVergleiche, rundeVerhaeltnis, zahl, jahreszielStatus, zeitBisZumLesen, monatsMatrix, wochentage,
    streaksUndPausen, tageZwischen, median });`, ctx);
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
const alleEintraege = K.normalisiereAlle(daten, {});
const buecher = K.normalisiereBuecher(daten, {});
const opt = { mehrfach: false, minutenProSeite: 2 };
const byTitle = t => buecher.find(b => b.titel === t);
const byId = id => alleEintraege.find(b => b.id === 'gr:' + id);

test('26 Datenzeilen trotz mehrzeiliger Rezension', () => assert.strictEqual(daten.length, 26));
test('alle Zeilen haben 24 Spalten', () => assert.ok(zeilen.every(z => z.length === 24)));
test('nur "read" zählt: 22 Bücher', () => assert.strictEqual(buecher.length, 22));
test('to-read (3) und currently-reading (1) bleiben getrennt erhalten', () => eq(
  [alleEintraege.filter(b => b.regal === 'to-read').length, alleEintraege.filter(b => b.regal === 'currently-reading').length], [3, 1]));
test('Titel mit Komma und "" korrekt', () => assert.ok(byTitle('Salz, Stein und "Sterne"')));
test('mehrzeilige Rezension verschiebt keine Spalten', () => {
  const b = byTitle('Das Archiv der verlorenen Sommer');
  eq([b.seiten, b.datum, b.verlag, b.leseanzahl], [384, '2024-05-30', 'Kieselverlag', 1]);
});
test('ISBN ="3000000001" → 3000000001, ISBN13 bereinigt', () => eq([byId(900001).isbn, byId(900001).isbn13], ['3000000001', '9783000000011']));
test('leere ISBN ="" → leer', () => assert.strictEqual(byId(900003).isbn, ''));
test('Seiten leer → null, nicht 0', () => assert.strictEqual(byTitle('Kupfer & Kreide').seiten, null));
test('Seiten 0 → null, nicht 0', () => assert.strictEqual(byTitle('Die Uhrmacherin von Lindau').seiten, null));
test('Datum leer → kein Jahr', () => eq([byId(900004).jahr, byId(900004).datum], [null, null]));
test('Date Read und Date Added (YYYY/MM/DD)', () => eq([byId(900005).datum, byId(900005).hinzugefuegt], ['2024-01-20', '2021-11-02']));
test('Bewertung 0 = nicht bewertet; Average Rating als Zahl', () => eq([byId(900008).bewertung, byId(900008).durchschnitt], [0, 3.7]));
test('Erscheinungsjahr: Original Publication Year vor Year Published', () => eq([byId(900022).erscheinungsjahr, byId(900022).erscheinungsjahrQuelle], [1938, 'original']));
test('Erscheinungsjahr fehlt → null', () => assert.strictEqual(byId(900011).erscheinungsjahr, null));
test('Verlag leer → leerer String', () => assert.strictEqual(byId(900011).verlag, ''));
test('Additional Authors als Liste', () => eq(byId(900022).weitereAutoren, ['Ida Sommer']));
test('Bookshelves ohne Standardregale', () => eq([byId(900002).regale, byId(900017).regale], [['roman', 'lieblingsbücher'], []]));

const k = K.berechneKennzahlen(buecher, opt);
test('Kennzahlen gesamt (Python-csv als Gegenprobe)', () => eq(
  [k.anzahl, k.seiten, k.ohneSeiten, k.ohneDatum, k.minuten],
  [22, 8531, 2, 1, 17062]));
test('Ø Seiten nur über Bücher mit Seitenzahl (8.531 / 20)', () => assert.strictEqual(Math.round(k.durchschnittSeiten), 427));
test('dickstes / dünnstes Buch', () => eq([k.dickstes.titel, k.duennstes.titel], ['Der leise Kartograf', 'Ein Faltblatt über Möwen']));
test('Ø Bewertung ohne 0-Bewertungen (75 / 19)', () => eq([k.durchschnittBewertung.toFixed(2), k.bewertungen], ['3.95', 19]));

const km = K.berechneKennzahlen(buecher, { ...opt, mehrfach: true });
test('Schalter "mehrfach zählen": Read Count 2 zählt doppelt', () => eq([km.anzahl, km.seiten, km.titelAnzahl], [23, 9715, 22]));

test('nachgetragene Seitenzahl fließt ein', () => {
  const b2 = K.normalisiereBuecher(daten, { 'gr:900011': 333 });
  const kk = K.berechneKennzahlen(b2, opt);
  eq([kk.seiten, kk.ohneSeiten, b2.find(b => b.titel === 'Kupfer & Kreide').seitenManuell], [8864, 1, true]);
});
test('manuelle Korrektur hat Vorrang vor CSV-Wert (für Ausreißer)', () => {
  const b2 = K.normalisiereBuecher(daten, { 'gr:900021': 120 });
  eq([b2.find(b => b.id === 'gr:900021').seiten, b2.find(b => b.id === 'gr:900021').seitenCSV], [120, 12]);
});

const jahre = K.jahresAuswertung(buecher, opt);
test('Jahresauswertung (ohne Buch ohne Datum)', () => eq(
  jahre.map(j => [j.jahr, j.buecher, j.seiten, j.ohneSeiten]),
  [[2021, 1, 1190, 0], [2022, 1, 188, 0], [2023, 3, 740, 1], [2024, 5, 2225, 0], [2025, 6, 2125, 1], [2026, 5, 1807, 0]]));
test('Summe Jahre + ohne Datum = gesamt', () => assert.strictEqual(jahre.reduce((a, j) => a + j.buecher, 0) + k.ohneDatum, k.anzahl));
test('Jahresfilter 2024', () => assert.strictEqual(K.berechneKennzahlen(K.filterNachJahr(buecher, 2024), opt).seiten, 2225));
test('Filter "ohne Lesedatum"', () => eq(K.filterNachJahr(buecher, 'ohne').map(b => b.titel), ['Nachtzug nach Tallinn']));
test('Lücken zwischen Jahren werden mit 0 gefüllt', () => {
  const l = K.jahresAuswertung([{ jahr: 2019, seiten: 100, leseanzahl: 1, bewertung: 0 }, { jahr: 2021, seiten: 50, leseanzahl: 1, bewertung: 0 }], opt);
  eq(l.map(j => [j.jahr, j.buecher]), [[2019, 1], [2020, 0], [2021, 1]]);
});

console.log('\nLeseverhalten (Stichtag 05.10.2026)');
const HEUTE = '2026-10-05';
const z = K.jahreszielStatus(buecher, 25, HEUTE, opt);
test('Jahresziel: 5 von 25, Tag 278 von 365', () => eq([z.gelesen, z.ziel, z.tageVergangen, z.tageImJahr, z.tageRest], [5, 25, 278, 365, 87]));
test('Hochrechnung seit 1. Januar: 5 / 278 × 365 ≈ 6,6', () => assert.strictEqual(z.hochrechnung.toFixed(2), '6.56'));
test('nicht auf Kurs, ca. 14 Bücher hinter dem Soll (19,0)', () => eq([z.aufKurs, z.sollBisHeute.toFixed(1), z.vorsprung.toFixed(1)], [false, '19.0', '-14.0']));
test('noch nötig: 20 Bücher in 87 Tagen ≈ 7,0 pro Monat', () => eq([z.fehlend, z.proMonatNoetig.toFixed(1)], [20, '7.0']));
test('Jahresziel erreicht → nichts mehr nötig', () => {
  const z2 = K.jahreszielStatus(buecher, 4, HEUTE, opt); eq([z2.erreicht, z2.aufKurs, z2.proMonatNoetig], [true, true, 0]);
});
test('Schaltjahr 2028 hat 366 Tage', () => assert.strictEqual(K.jahreszielStatus([], 10, '2028-03-01', opt).tageImJahr, 366));

const zb = K.zeitBisZumLesen(buecher);
test('Zeit bis zum Lesen: 21 Bücher, Median 26 Tage, Ø ≈ 229,7', () => eq([zb.anzahl, zb.median, zb.durchschnitt.toFixed(1), zb.ohneDaten], [21, 26, '229.7', 1]));
test('längste Zeit im Regal', () => eq(zb.laengste.map(x => [x.buch.titel, x.tage]),
  [['Krieg der Uhren', 2152], ['Der leise Kartograf (Kartograf-Reihe, #1)', 809], ['Fernweh in Moll', 760]]));
test('kürzeste Zeit', () => eq(zb.kuerzeste.map(x => [x.buch.titel, x.tage]),
  [['Ein Faltblatt über Möwen', 1], ['Kleine Theorie des Regens', 10], ['Ein Haus am Rand der Karte', 12]]));
test('erst nach dem Lesen hinzugefügt (negativ) → ausgeschlossen', () => {
  const r = K.zeitBisZumLesen([{ titel: 'A', datum: '2020-01-10', hinzugefuegt: '2024-05-01' }, { titel: 'B', datum: '2020-01-10', hinzugefuegt: '2020-01-01' }]);
  eq([r.anzahl, r.nachtraeglich, r.median], [1, 1, 9]);
});
test('Median bei gerader Anzahl', () => assert.strictEqual(K.median([4, 1, 3, 2]), 2.5));
test('Tagesdifferenz über Sommerzeit-Umstellung exakt', () => assert.strictEqual(K.tageZwischen('2026-03-28', '2026-03-30'), 2));

const mm = K.monatsMatrix(buecher, opt);
test('Heatmap: Jahre 2021–2026, Summe = 21 Bücher mit Datum', () => eq([mm.map(r => r.jahr), mm.flatMap(r => r.monate).reduce((a, b) => a + b, 0)], [[2021, 2022, 2023, 2024, 2025, 2026], 21]));
test('Heatmap: 2026 = Jan, Feb, Mär, Mai, Aug je 1', () => eq(mm[5].monate, [1, 1, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0]));
test('Wochentage Mo–So (Python-Gegenprobe)', () => eq(K.wochentage(buecher, opt), [4, 4, 0, 2, 1, 3, 7]));

const st = K.streaksUndPausen(buecher, HEUTE);
test('längster Streak: 3 Monate, Januar–März 2026', () => eq([st.laengster.monate, st.laengster.von, st.laengster.bis], [3, { jahr: 2026, monat: 1 }, { jahr: 2026, monat: 3 }]));
test('aktueller Streak = 0 (im Oktober noch kein Buch)', () => assert.strictEqual(st.aktuell, 0));
test('aktueller Streak läuft, wenn im laufenden Monat ein Buch beendet wurde', () => {
  const s2 = K.streaksUndPausen(buecher, '2026-03-31'); eq([s2.aktuell, s2.aktuellSeit], [3, { jahr: 2026, monat: 1 }]);
});
test('aktueller Streak über den Jahreswechsel', () => {
  const s3 = K.streaksUndPausen([{ titel: 'a', datum: '2025-11-03' }, { titel: 'b', datum: '2025-12-24' }, { titel: 'c', datum: '2026-01-02' }], '2026-01-20');
  eq([s3.aktuell, s3.aktuellSeit], [3, { jahr: 2025, monat: 11 }]);
});
test('längste Pause: 499 Tage zwischen „Der leise Kartograf“ und „Das große Winterbuch“', () =>
  eq([st.pause.tage, st.pause.vorher.titel, st.pause.nachher.titel], [499, 'Der leise Kartograf', 'Das große Winterbuch']));
test('seit dem letzten Buch: 63 Tage', () => eq([st.seitLetztem.tage, st.seitLetztem.buch.titel], [63, 'Mittsommer in Turku']));

console.log('\nFormatierung');
test('deutsche Tausenderpunkte', () => assert.strictEqual(K.zahl(1234567), '1.234.567'));
test('vierstellig mit Punkt (1.234)', () => assert.strictEqual(K.zahl(1234), '1.234'));
test('Stunden', () => assert.strictEqual(K.formatStunden(17062), '284 Std.'));
test('Tage und Stunden', () => assert.strictEqual(K.formatTageStunden(17062), '11 Tage, 20 Std.'));
test('Beispiel 3 Tage, 4 Std.', () => assert.strictEqual(K.formatTageStunden(76 * 60), '3 Tage, 4 Std.'));
test('genau 1 Tag', () => assert.strictEqual(K.formatTageStunden(24 * 60), '1 Tag'));
test('unter 10 Std. mit Komma', () => assert.strictEqual(K.formatStunden(270), '4,5 Std.'));

console.log('\nVergleiche');
test('nur Ergebnisse zwischen 1 und 100, max. 4', () => {
  const v = K.waehleVergleiche(284, 'Std.');
  assert.ok(v.length >= 3 && v.length <= 4);
  assert.ok(v.every(x => x.verhaeltnis >= 1 && x.verhaeltnis <= 100));
});
test('fast gleich große Vergleiche werden nicht doppelt gezeigt', () => {
  const namen = K.waehleVergleiche(284, 'Std.').map(v => v.wert);
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

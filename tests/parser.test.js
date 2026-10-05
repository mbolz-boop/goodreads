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
  ;Object.assign(globalThis, { KONFIG, VERGLEICHE, GEBAEUDE, normalisiereFuerVergleich, findeDubletten, ausreisserListe, datenqualitaet,
    paarSchluessel, leseReihenfolge, meilensteine, stapelHoehe, gebaeudeVergleich, zufallsKandidaten,
    waehleZufall, rueckblick, rueckblickSVG, umbrechen, parseCSV, zeilenZuDatensaetzen, normalisiereBuecher,
    normalisiereAlle, filterNachJahr, berechneKennzahlen, jahresAuswertung, formatStunden, formatTageStunden,
    waehleVergleiche, rundeVerhaeltnis, zahl, jahreszielStatus, zeitBisZumLesen, monatsMatrix, wochentage,
    streaksUndPausen, tageZwischen, median, topGruppen, seitenKlassen, erscheinungsStatistik, bewertungsVergleich,
    sterneVerteilung, bestenliste, zahlVorzeichen });`, ctx);
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

console.log('\nBücher, Autoren, Bewertungen');
const top = K.topGruppen(buecher, b => b.autor ? [b.autor] : [], opt, 'buecher');
test('Top-Autoren nach Büchern: Bauer 3, dann je 2', () => eq(top.liste.slice(0, 5).map(e => [e.name, e.buecher]),
  [['Henrik Bauer', 3], ['Greta Holm', 2], ['Lena Fuchs', 2], ['Ruth Albers', 2], ['Tom Aalto', 2]]));
test('Top-Autoren nach Seiten (Bücher ohne Seitenzahl zählen 0)', () => {
  const t = K.topGruppen(buecher, b => [b.autor], opt, 'seiten');
  eq(t.liste.slice(0, 3).map(e => [e.name, e.seiten]), [['Henrik Bauer', 3014], ['Ruth Albers', 957], ['Konstantin Vogel', 720]]);
});
test('Top 10 begrenzt, Gesamtzahl der Autoren bleibt bekannt', () => eq([top.liste.length, top.gesamt > 10], [10, true]));
test('Mehrfach-Schalter: Bauer zählt 4 (Read Count 2 beim ersten Titel)', () => assert.strictEqual(
  K.topGruppen(buecher, b => [b.autor], { ...opt, mehrfach: true }).liste[0].buecher, 4));

const sk = K.seitenKlassen(buecher, opt);
test('Seitenlängen: 3 / 9 / 4 / 4 Bücher, 2 ohne Seitenzahl', () => eq([sk.klassen.map(k => k.anzahl), sk.gesamt, sk.ohneSeiten], [[3, 9, 4, 4], 20, 2]));
test('Seitenlängen: Prozentanteile 15 / 45 / 20 / 20', () => eq(sk.klassen.map(k => k.prozent), [15, 45, 20, 20]));
test('Klassengrenzen: 199 | 200, 399 | 400, 600 | 601', () => {
  const t = K.seitenKlassen([199, 200, 399, 400, 600, 601].map(n => ({ seiten: n, leseanzahl: 1, bewertung: 0 })), opt);
  eq(t.klassen.map(k => k.anzahl), [1, 2, 2, 1]);
});
test('Ø Bewertung je Klasse + Hinweis bei < 3 Bewertungen', () => eq(
  sk.klassen.map(k => [k.bewertet, k.durchschnitt && Math.round(k.durchschnitt * 1000) / 1000, k.wenigAussage]),
  [[2, 4.5, true], [8, 3.875, false], [4, 4.25, false], [3, 4.333, false]]));

const es = K.erscheinungsStatistik(buecher, opt, 2026);
test('Erscheinungsjahr: 21 mit Jahr, 1 fehlt', () => eq([es.gesamt, es.fehlend, es.fehlendMitAusgabejahr], [21, 1, 0]));
test('Klassiker (vor 1950): 1; Neuerscheinungen 2022–2026: 12', () => eq([es.klassiker, es.neu, es.neuVon], [1, 12, 2022]));
test('ältestes / neuestes Buch', () => eq([es.aeltestes.titel, es.aeltestes.erscheinungsjahr, es.neuestes.titel], ['Krieg der Uhren', 1938, 'Mittsommer in Turku']));
test('Jahrzehnte 1930er–2020er, Lücken mit 0', () => eq(es.dekaden.map(d => [d.label, d.anzahl]),
  [['1930er', 1], ['1940er', 0], ['1950er', 0], ['1960er', 1], ['1970er', 0], ['1980er', 0], ['1990er', 0], ['2000er', 0], ['2010er', 3], ['2020er', 16]]));
test('Jahr vor 1900 → eigene Klasse; Ausgabejahr allein zählt nicht', () => {
  const t = K.erscheinungsStatistik([
    { erscheinungsjahr: 1605, erscheinungsjahrQuelle: 'original', leseanzahl: 1, titel: 'A' },
    { erscheinungsjahr: 2019, erscheinungsjahrQuelle: 'ausgabe', leseanzahl: 1, titel: 'B' }], opt, 2026);
  eq([t.dekaden.map(d => d.label), t.gesamt, t.fehlend, t.fehlendMitAusgabejahr], [['vor 1900'], 1, 1, 1]);
});

const verl = K.topGruppen(buecher, b => b.verlag ? [b.verlag] : [], opt);
test('Verlage: 4 Verlage mit je 4 Büchern vorn, 1 Buch ohne Verlag ausgewiesen', () => eq(
  [verl.liste.slice(0, 4).map(e => e.buecher), verl.ohne, verl.liste[4].name], [[4, 4, 4, 4], 1, 'Baltica']));
const reg = K.topGruppen(buecher, b => b.regale, opt);
test('Regale: Standardregale herausgefiltert, roman 7', () => eq([reg.liste[0].name, reg.liste[0].buecher, reg.liste.some(e => ['read', 'to-read'].includes(e.name))], ['roman', 7, false]));
test('Regale: 2 Bücher ohne eigenes Regal', () => assert.strictEqual(reg.ohne, 2));

const bv = K.bewertungsVergleich(buecher);
test('Bewertungsvergleich: 19 Bücher, Ø Abweichung +0,03 → „ähnlich“', () => eq([bv.anzahl, bv.mittel.toFixed(3), bv.urteil], [19, '0.028', 'aehnlich']));
test('5 am deutlichsten besser bewertet', () => eq(bv.besser.map(x => x.buch.titel),
  ['Der Kartograf und das Meer (Kartograf-Reihe, #2)', 'Salz, Stein und "Sterne"', 'Der Sturm von 1872', 'Kleine Theorie des Regens', 'Die Bienen von Saarow']));
test('5 am deutlichsten schlechter bewertet', () => eq(bv.schlechter.map(x => x.buch.titel),
  ['Kupfer & Kreide', 'Die Wellen von Usedom', 'Die Uhrmacherin von Lindau', 'Fernweh in Moll', 'Das Archiv der verlorenen Sommer']));
test('streng / mild ab ±0,25', () => {
  const mk = (e, d) => [{ bewertung: e, durchschnitt: d, titel: 'x' }];
  eq([K.bewertungsVergleich(mk(3, 4)).urteil, K.bewertungsVergleich(mk(5, 4)).urteil, K.bewertungsVergleich(mk(4, 4.2)).urteil], ['streng', 'mild', 'aehnlich']);
});
test('Bücher ohne Bewertung oder ohne Goodreads-Schnitt bleiben draußen', () => eq(
  K.bewertungsVergleich([{ bewertung: 0, durchschnitt: 4, titel: 'a' }, { bewertung: 4, durchschnitt: 0, titel: 'b' }, { bewertung: 4, durchschnitt: null, titel: 'c' }]).anzahl, 0));
test('Sterne-Verteilung: 0 / 1 / 4 / 9 / 5, 3 unbewertet', () => eq(
  [K.sterneVerteilung(buecher).zaehler, K.sterneVerteilung(buecher).unbewertet], [[0, 1, 4, 9, 5], 3]));
test('Bestenliste nach Jahr, neuestes zuerst', () => eq(K.bestenliste(buecher).map(g => [g.jahr, g.buecher.length]), [[2026, 1], [2025, 2], [2024, 1], [2023, 1]]));
test('Bestenliste: 5 Sterne ohne Lesedatum landen am Ende', () => eq(
  K.bestenliste([{ bewertung: 5, jahr: null, datum: null, titel: 'a' }, { bewertung: 5, jahr: 2020, datum: '2020-01-01', titel: 'b' }]).map(g => g.jahr), [2020, 'ohne']));
test('Vorzeichen-Format: +0,8 / −1,1 / 0', () => eq([K.zahlVorzeichen(0.8), K.zahlVorzeichen(-1.1), K.zahlVorzeichen(0)], ['+0,8', '−1,1', '0']));

console.log('\nSpielerisches');
const ms = K.meilensteine(buecher, opt);
test('Meilensteine Bücher: 10 erreicht (23.11.2024), 25 offen mit 22 von 25', () => eq(
  [ms.buecher[0].erreicht, ms.buecher[0].datum, ms.buecher[0].buch.titel, ms.buecher[1].erreicht, ms.buecher[1].aktuell, Math.round(ms.buecher[1].prozent)],
  [true, '2024-11-23', 'Die Fähre um Mitternacht', false, 22, 88]));
test('Meilensteine Seiten: 5.000 erreicht (30.06.2025), 10.000 offen', () => eq(
  [ms.seiten[0].erreicht, ms.seiten[0].datum, ms.seiten[1].erreicht, ms.seiten[1].aktuell], [true, '2025-06-30', false, 8531]));
test('offene Meilensteine haben kein Datum', () => assert.ok(ms.buecher.filter(b => !b.erreicht).every(b => b.datum === null)));
test('Mehrfach-Schalter erhöht die Zahlen (23 Bücher)', () => assert.strictEqual(K.meilensteine(buecher, { ...opt, mehrfach: true }).gesamt.buecher, 23));
test('Meilenstein erreicht nur durch Buch ohne Lesedatum → Datum unbekannt', () => {
  const b = Array.from({ length: 10 }, (_, i) => ({ titel: 't' + i, datum: i < 9 ? `2024-01-${String(i + 1).padStart(2, '0')}` : null, seiten: 100, leseanzahl: 1 }));
  const m = K.meilensteine(b, opt); eq([m.buecher[0].erreicht, m.buecher[0].datum], [true, null]);
});

test('Stapelhöhe: 22 Bücher × 2,5 cm = 0,55 m', () => assert.strictEqual(K.stapelHoehe(22, 2.5).toFixed(2), '0.55'));
const gv = K.gebaeudeVergleich(0.55, 2.5);
test('Gebäudevergleich: aufsteigend, Tisch 76 %, Brandenburger Tor 2 %', () => eq(
  [gv[0].name, Math.round(gv[0].prozent), gv[0].erreicht, Math.round(gv.find(x => x.name === 'Brandenburger Tor').prozent)], ['Tisch (Standardhöhe)', 76, false, 2]));
test('Bücher bis zum Brandenburger Tor: (26 − 0,55) / 0,025 = 1.018', () => assert.strictEqual(gv.find(x => x.name === 'Brandenburger Tor').fehlendBuecher, 1018));
test('Stapel überragt Gebäude → Faktor', () => {
  const hoch = K.gebaeudeVergleich(60, 2.5).filter(x => x.erreicht).map(x => x.name);
  eq(hoch, ['Tisch (Standardhöhe)', 'Erwachsener Mensch', 'Doppeldeckerbus', 'Brandenburger Tor']);
});
test('Gebäudeliste: alle Einträge mit Name, Wert, Einheit m, Quelle', () => assert.ok(K.GEBAEUDE.every(g => g.name && g.wert > 0 && g.einheit === 'm' && g.quelle)));
test('Gebäudeliste enthält die geforderten Werte', () => eq(
  ['Brandenburger Tor', 'Kölner Dom', 'Eiffelturm', 'Berliner Fernsehturm', 'Burj Khalifa'].map(n => K.GEBAEUDE.find(g => g.name === n).wert), [26, 157, 330, 368, 828]));

const alleE = K.normalisiereAlle(daten, {});
const zk = K.zufallsKandidaten(alleE, 0);
test('Zufall ohne Limit: 3 to-read-Bücher', () => eq([zk.kandidaten.length, zk.gesamt, zk.ohneSeitenAusgeschlossen], [3, 3, 0]));
test('Zufall nur aus to-read (kein read, kein currently-reading)', () => assert.ok(zk.kandidaten.every(b => b.regal === 'to-read')));
const zl = K.zufallsKandidaten(alleE, 400);
test('Zufall mit Limit 400: nur „Morgenrot über Riga“, 1 ohne Seitenzahl ausgeschlossen', () => eq(
  [zl.kandidaten.map(b => b.titel), zl.ohneSeitenAusgeschlossen], [['Morgenrot über Riga'], 1]));
test('Zufall: Nachtragen einer Seitenzahl macht das Buch wählbar', () => {
  const k2 = K.zufallsKandidaten(K.normalisiereAlle(daten, { 'gr:900026': 200 }), 400);
  eq(k2.kandidaten.map(b => b.titel).sort(), ['Ein Jahr in Bergen', 'Morgenrot über Riga']);
});
test('Zufall: deterministisch mit Testzufall, nie dasselbe Buch zweimal hintereinander', () => {
  const erstes = K.waehleZufall(zk.kandidaten, () => 0);
  const zweites = K.waehleZufall(zk.kandidaten, () => 0, erstes.id);
  eq([erstes.titel === zk.kandidaten[0].titel, zweites.id !== erstes.id], [true, true]);
  assert.strictEqual(K.waehleZufall(zk.kandidaten, () => 0.999999).id, zk.kandidaten[2].id);
});
test('Zufall: leere Liste → null; einziges Buch bleibt wählbar', () => eq(
  [K.waehleZufall([]), K.waehleZufall(zl.kandidaten, Math.random, zl.kandidaten[0].id).titel], [null, 'Morgenrot über Riga']));

const rb = K.rueckblick(buecher, 2025, opt);
test('Rückblick 2025: 6 Bücher, 2.125 Seiten, 71 Std.', () => eq([rb.anzahl, rb.seiten, K.formatStunden(rb.minuten)], [6, 2125, '71 Std.']));
test('Rückblick: Top-Autor bei Gleichstand nach Seiten (Henrik Bauer)', () => eq([rb.topAutor.name, rb.topAutor.buecher], ['Henrik Bauer', 1]));
test('Rückblick: bestbewertet = früheste 5 ★ (Bienen von Saarow), 1 weiteres', () => eq(
  [rb.bestes.buch.titel, rb.bestes.weitere], ['Die Bienen von Saarow', 1]));
test('Rückblick: dickstes Buch 640 Seiten', () => eq([rb.dickstes.seiten, rb.ohneSeiten], [640, 1]));
test('Rückblick für Jahr ohne Bücher', () => eq([K.rueckblick(buecher, 2019, opt).anzahl, K.rueckblick(buecher, 2019, opt).bestes], [0, null]));

const svg = K.rueckblickSVG(rb, { zahlText: '9', name: 'Harry-Potter-Marathon' });
test('Rückblick-SVG: gültiges XML-Grundgerüst, 1080 × 1350, Kernzahlen enthalten', () => {
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') && svg.endsWith('</svg>'));
  assert.ok(svg.includes('viewBox="0 0 1080 1350"') && svg.includes('>2025<') && svg.includes('>2.125<') && svg.includes('>71<'));
  assert.ok(svg.includes('Harry-Potter-Marathon'));
});
test('Rückblick-SVG: keine externen Referenzen', () => assert.ok(!/https?:\/\/(?!www\.w3\.org)|<image|href=/i.test(svg)));
test('Rückblick-SVG: Sonderzeichen werden maskiert („Salz, Stein und "Sterne"“, &)', () => {
  const r2 = { ...rb, dickstes: { titel: 'Kupfer & "Kreide" <1>', seiten: 99 } };
  const x = K.rueckblickSVG(r2, null);
  assert.ok(x.includes('Kupfer &amp; &quot;Kreide&quot; &lt;1&gt;') && !x.includes('<1>'));
});
test('Umbrechen: Zeilenlänge und Auslassungspunkte', () => {
  eq(K.umbrechen('Der Kartograf und das Meer (Kartograf-Reihe, #2)', 30, 2), ['Der Kartograf und das Meer', '(Kartograf-Reihe, #2)']);
  const l = K.umbrechen('a'.repeat(30) + ' ' + 'b'.repeat(30) + ' ' + 'c'.repeat(30), 20, 2);
  eq([l.length, l[1].endsWith('…'), l.every(z => z.length <= 20)], [2, true, true]);
});

console.log('\nDatenqualität');
test('Normalisierung: Kleinschreibung, Satzzeichen und Reihenangabe in Klammern fallen weg', () => eq([
  K.normalisiereFuerVergleich('Der leise Kartograf (Kartograf-Reihe, #1)'),
  K.normalisiereFuerVergleich('Salz, Stein und "Sterne"'),
  K.normalisiereFuerVergleich('  DER   leise Kartograf!  '),
  K.normalisiereFuerVergleich('J.K. Rowling') === K.normalisiereFuerVergleich('J. K. Rowling'),
], ['der leise kartograf', 'salz stein und sterne', 'der leise kartograf', true]));
test('Umlaute bleiben erhalten (Märchen ≠ Marchen)', () => assert.notStrictEqual(K.normalisiereFuerVergleich('Märchen'), K.normalisiereFuerVergleich('Marchen')));

const dub = K.findeDubletten(buecher);
test('Beispiel-CSV: genau 1 mögliche Dublette („Der leise Kartograf“)', () => eq([dub.offen.length, dub.markiert.length], [1, 0]));
test('früher gelesen (2021) zählt, später gelesen (2024, mit Reihenangabe) wird ausgeschlossen', () => eq(
  [dub.offen[0].frueher.titel, dub.offen[0].frueher.datum, dub.offen[0].spaeter.titel, dub.offen[0].spaeter.datum],
  ['Der leise Kartograf', '2021-08-15', 'Der leise Kartograf (Kartograf-Reihe, #1)', '2024-01-20']));
test('Der Folgeband „… und das Meer“ ist keine Dublette', () => assert.ok(!dub.offen.some(p => p.frueher.id === 'gr:900018' || p.spaeter.id === 'gr:900018')));
const pk = dub.offen[0].key;
test('Paarschlüssel unabhängig von der Reihenfolge', () => assert.strictEqual(K.paarSchluessel(dub.offen[0].spaeter, dub.offen[0].frueher), pk));
test('„Ist keine Dublette“ wirkt pro Paar', () => {
  const d2 = K.findeDubletten(buecher, new Set([pk])); eq([d2.offen.length, d2.markiert.length], [0, 1]);
});
test('ausgeschlossenes Exemplar wird am Paar gekennzeichnet', () => {
  const d3 = K.findeDubletten(buecher, new Set(), new Set([dub.offen[0].spaeter.id]));
  eq([d3.offen[0].spaeterAusgeschlossen, d3.offen[0].frueherAusgeschlossen], [true, false]);
});
test('Dubletten: gleicher Titel, anderer Autor → keine Dublette', () => eq(
  K.findeDubletten([{ id: 'a', titel: 'Nebel', autor: 'A Meier', datum: '2020-01-01' }, { id: 'b', titel: 'Nebel', autor: 'B Schulz', datum: '2021-01-01' }]).offen.length, 0));
test('Dubletten: Gruppe aus 3 Büchern ergibt 3 Paare, älteste zuerst', () => {
  const g = ['c', 'a', 'b'].map((id, i) => ({ id, titel: 'Nebel (Band ' + i + ')', autor: 'M', datum: ['2022-05-01', '2020-01-01', '2021-03-03'][i] }));
  const d = K.findeDubletten(g);
  eq([d.offen.length, d.offen.map(p => [p.frueher.id, p.spaeter.id].join('>')).sort()], [3, ['a>b', 'a>c', 'b>c']]);
});
test('Lesereihenfolge: ohne Lesedatum gilt als später; gleiches Datum → früher hinzugefügt', () => {
  assert.strictEqual(K.leseReihenfolge({ id: 'a', datum: null }, { id: 'b', datum: '2024-01-01' }), 1);
  assert.strictEqual(K.leseReihenfolge({ id: 'a', datum: '2024-01-01', hinzugefuegt: '2023-05-01' }, { id: 'b', datum: '2024-01-01', hinzugefuegt: '2023-01-01' }), 1);
});
test('Titel nur aus Satzzeichen wird ignoriert', () => eq(K.findeDubletten([{ id: 'a', titel: '???', autor: 'x' }, { id: 'b', titel: '!!!', autor: 'x' }]).offen.length, 0));

test('Ausreißer mit Standardschwellen 30/1500: nur das 12-Seiten-Faltblatt', () => eq(K.ausreisserListe(buecher, 30, 1500).map(b => [b.titel, b.seitenCSV]), [['Ein Faltblatt über Möwen', 12]]));
test('Ausreißer: Schwelle über 1.000 Seiten findet die beiden Kartograf-Bände', () => eq(
  K.ausreisserListe(buecher, 30, 1000).map(b => b.seitenCSV), [12, 1184, 1190]));
test('Ausreißer: untere Schwelle 200 findet 3 Bücher', () => eq(K.ausreisserListe(buecher, 200, 1500).map(b => b.seitenCSV), [12, 96, 188]));
test('Ausreißer: Bücher ohne Seitenzahl sind kein Ausreißer', () => assert.ok(!K.ausreisserListe(buecher, 30, 1500).some(b => b.seitenCSV == null)));
test('Korrigierter Ausreißer bleibt auffindbar und fließt in die Seitensumme', () => {
  const b2 = K.normalisiereBuecher(daten, { 'gr:900021': 120 });
  eq([K.ausreisserListe(b2, 30, 1500)[0].seitenManuell, K.berechneKennzahlen(b2, opt).seiten], [true, 8531 - 12 + 120]);
});

const dq = K.datenqualitaet(buecher, buecher, { min: 30, max: 1500 });
test('Übersicht: 2 ohne Seitenzahl, 1 ohne Datum, 3 ohne Bewertung, 1 Dublette, 1 Ausreißer', () => eq(
  [dq.ohneSeiten, dq.ohneDatum, dq.ohneBewertung, dq.dubletten, dq.ausreisser, dq.ausgeschlossen], [2, 1, 3, 1, 1, 0]));
const ausgeschl = new Set([dub.offen[0].spaeter.id]);
const gezaehlt2 = buecher.filter(b => !ausgeschl.has(b.id));
const k2 = K.berechneKennzahlen(gezaehlt2, opt);
test('Dublette ausschließen: 21 Bücher, 7.347 Seiten, Bewertungen 71/18', () => eq(
  [k2.anzahl, k2.seiten, k2.bewertungen, k2.durchschnittBewertung.toFixed(3)], [21, 7347, 18, '3.944']));
test('nach dem Ausschließen: dickstes Buch ist das früher gelesene Exemplar', () => eq([k2.dickstes.titel, k2.dickstes.seiten], ['Der leise Kartograf', 1190]));
test('Übersicht nach dem Ausschließen: Dublette erledigt, 1 ausgeschlossen', () => {
  const q = K.datenqualitaet(gezaehlt2, buecher, { min: 30, max: 1500, ausgeschlossen: ausgeschl });
  eq([q.dubletten, q.ausgeschlossen, q.gezaehlt, q.gelesen], [0, 1, 21, 22]);
});
test('Übersicht: korrigierte Ausreißer werden separat gezählt', () => {
  const b2 = K.normalisiereBuecher(daten, { 'gr:900021': 120 });
  const q = K.datenqualitaet(b2, b2, { min: 30, max: 1500 });
  eq([q.ausreisser, q.ausreisserKorrigiert], [0, 1]);
});
test('als „keine Dublette“ markiertes Paar zählt nicht als Problem', () => eq(
  K.datenqualitaet(buecher, buecher, { min: 30, max: 1500, keine: new Set([pk]) }).dubletten, 0));

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

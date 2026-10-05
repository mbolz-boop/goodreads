# Lese-Tracker für Goodreads

Wertet den CSV-Export deiner Goodreads-Bibliothek aus. Alles läuft lokal im Browser: kein Server, keine API-Keys, kein Tracking, keine externen Skripte. Eine Content-Security-Policy in der Datei blockiert zusätzlich jede Netzwerkverbindung.

## 1. CSV bei Goodreads exportieren

1. Auf goodreads.com einloggen und **My Books** öffnen.
2. Links unten unter *Tools* auf **Import and export** klicken.
3. **Export Library** wählen. Nach kurzer Zeit erscheint darunter ein Link zur Datei `goodreads_library_export.csv`. Diese Datei herunterladen.

## 2. App öffnen

- `index.html` per Doppelklick im Browser öffnen (Firefox, Chrome, Edge, Safari). Eine Installation oder ein Build-Schritt ist nicht nötig.
- Die CSV in das Feld ziehen oder über **Datei auswählen** laden.
- Die CSV wird im `localStorage` des Browsers gespeichert und beim nächsten Öffnen automatisch geladen. **Daten zurücksetzen** löscht sie wieder.

Zum Ausprobieren gibt es `beispiel/goodreads_beispiel.csv` mit 15 gelesenen, fiktiven Büchern (plus 2 auf anderen Regalen). Darin sind die Sonderfälle enthalten: ein Buch ohne Seitenzahl, eines mit 0 Seiten, eines ohne Lesedatum, Titel mit Komma und mit Anführungszeichen, eine mehrzeilige Rezension und ein zweimal gelesenes Buch.

## Was gezählt wird

- Nur Bücher auf dem Regal **read** (`Exclusive Shelf`).
- **Ohne Lesedatum:** zählt in der Gesamtstatistik, aber nicht in der Jahresauswertung (wird angezeigt).
- **Ohne Seitenzahl (leer oder 0):** zählt als gelesenes Buch, aber nicht zu den Seiten. Unter „Bücher ohne Seitenzahl“ kannst du die Zahl nachtragen. Das wird im Browser gespeichert, die CSV bleibt unverändert.
- **Mehrfach gelesen (`Read Count` > 1):** zählt einmal, außer der Schalter „Mehrfach gelesene Bücher mehrfach zählen“ ist aktiv. Goodreads exportiert nur das letzte Lesedatum, deshalb landen Wiederholungen im Jahr dieses Datums.
- **Lesedauer:** Seiten × Minuten pro Seite (Standard 2, im Browser änderbar).
- **Ø Bewertung:** nur Bücher, die du bewertet hast (0 Sterne = nicht bewertet).

## Anpassen

Ganz oben in `index.html` stehen `KONFIG` (Standard-Minuten pro Seite, Bereich für Vergleiche) und `VERGLEICHE`. Dort kannst du eigene Vergleiche ergänzen:

```js
{ name: 'Flug Berlin–New York', wert: 9, einheit: 'Std.', quelle: 'Direktflug ca. 8–9 Std.' },
```

`einheit` ist `'Std.'` für Lesedauer oder `'Seiten'` für Seitenzahlen. Angezeigt werden automatisch bis zu 4 Vergleiche, deren Ergebnis zwischen 1 und 100 liegt.

## Tests

Mit installiertem Node.js (ohne npm-Pakete):

```sh
node tests/parser.test.js
```

Die Tests laden Parser und Berechnung direkt aus `index.html` und prüfen die Randfälle an der Beispiel-CSV.

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

Zum Ausprobieren gibt es `beispiel/goodreads_beispiel.csv` mit 26 fiktiven Einträgen: 22 gelesene Bücher aus 2021–2026, 3 auf `to-read`, 1 auf `currently-reading`. Enthalten sind alle Sonderfälle: Bücher ohne Seitenzahl (leer und 0), ohne Lesedatum, ohne Bewertung, ohne Verlag und ohne Erscheinungsjahr, ein Titel mit Komma und Anführungszeichen, eine mehrzeilige Rezension, ein zweimal gelesenes Buch, eine Dublette („Der leise Kartograf“), ein Seiten-Ausreißer (12 Seiten), mehrere Bücher derselben Autoren und ein Klassiker von 1938.

Die App ist in Tabs gegliedert: Übersicht, Jahre, Autoren & Bücher, Bewertungen, Spielerisches, Datenqualität. Der Zeitraum-Filter oben gilt für alle Tabs.

## Was gezählt wird

- Nur Bücher auf dem Regal **read** (`Exclusive Shelf`). Das Regal `to-read` wird nur für den Zufallsgenerator genutzt.
- **ISBN:** Goodreads exportiert sie als `="978…"`; die App bereinigt das.
- **Ohne Lesedatum:** zählt in der Gesamtstatistik, aber nicht in Jahres-, Monats- und Tempo-Auswertungen (wird angezeigt).
- **Ohne Seitenzahl (leer oder 0):** zählt als gelesenes Buch, aber nicht zu den Seiten. Unter „Bücher ohne Seitenzahl“ kannst du die Zahl nachtragen. Das wird im Browser gespeichert, die CSV bleibt unverändert, und der Wert fließt in alle Auswertungen ein.
- **Mehrfach gelesen (`Read Count` > 1):** zählt einmal, außer der Schalter „Mehrfach gelesene Bücher mehrfach zählen“ ist aktiv. Goodreads exportiert nur das letzte Lesedatum, deshalb landen Wiederholungen im Jahr dieses Datums.
- **Lesedauer:** Seiten × Minuten pro Seite (Standard 2, im Browser änderbar).
- **Ø Bewertung:** nur Bücher, die du bewertet hast (0 Sterne = nicht bewertet).
- **Jahresziel:** gilt für das laufende Jahr (Startwert 25, änderbar). Die Hochrechnung nutzt dein Tempo seit dem 1. Januar.
- **Zeit bis zum Lesen:** Tage zwischen *Date Added* und *Date Read*. Das ist kein Lesetempo, sondern die Zeit, die ein Buch im Regal lag. Bücher, die erst nach dem Lesen bei Goodreads erfasst wurden, fallen heraus.
- **Top-Autoren, Verlage:** Top 10; bei Autoren zählt der Hauptautor aus `Author`. Bücher ohne Verlag werden ausgewiesen und nicht mitgezählt.
- **Seitenlängen:** unter 200, 200–399, 400–600, über 600 Seiten. Bücher ohne Seitenzahl bleiben draußen.
- **Erscheinungsjahr:** nur `Original Publication Year`. Klassiker sind vor 1950 erschienen, Neuerscheinungen in den letzten 5 Jahren. Fehlende Werte werden ausgewiesen.
- **Regale:** nur eigene Regale aus `Bookshelves` (keine echten Genres); `read`, `to-read` und `currently-reading` sind herausgefiltert.
- **Bewertungsvergleich:** nur Bücher mit eigener Bewertung. Ab einer mittleren Abweichung von ±0,25 Sternen gilt man als „streng“ bzw. „mild“. Bei weniger als 3 bewerteten Büchern je Längenklasse erscheint ein Hinweis auf geringe Aussagekraft.
- **Meilensteine:** zählen über alle gelesenen Bücher (10, 25, 50, 100 … Bücher; 5.000, 10.000 … Seiten). Das Datum ist das Lesedatum des Buchs, mit dem der Meilenstein erreicht wurde.
- **Bücherstapel:** Anzahl Bücher des gewählten Zeitraums × Dicke pro Buch (Startwert 2,5 cm, im Feld änderbar). Der Vergleich nutzt die Liste `GEBAEUDE` ganz oben in `index.html`.
- **Zufälliges Buch:** zieht aus dem Regal `to-read`. Mit Seitenlimit fallen Bücher ohne Seitenzahl heraus.
- **Rückblick:** zeigt immer das Vorjahr. Der Button „Als Bild speichern“ erzeugt das PNG lokal im Browser.
- **Heatmap, Wochentage, Streaks:** basieren auf dem Datum, an dem du ein Buch bei Goodreads als gelesen markiert hast. Der aktuelle Streak fällt auf 0, solange im laufenden Monat noch kein Buch beendet ist.

## Anpassen

Alle Einstellungen (Jahresziel, Minuten pro Seite, Schalter, Zeitraum, aktiver Tab, nachgetragene Seitenzahlen) speichert die App im `localStorage`.

Ganz oben in `index.html` stehen `KONFIG` (Standard-Minuten pro Seite, Bereich für Vergleiche) und `VERGLEICHE`. Dort kannst du eigene Vergleiche ergänzen (Gebäudehöhen für den Bücherstapel stehen in `GEBAEUDE`, gleiches Format mit `einheit: 'm'`):

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

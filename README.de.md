<div align="center">

[![Language: English][badge-readme-en]][readme-en]
[![Язык: Русский][badge-readme-ru]][readme-ru]
[![Langue : Français][badge-readme-fr]][readme-fr]
[![Sprache: Deutsch][badge-readme-de]][readme-de]

# Modern Clock for GNOME

<img alt="Modern Clock Logo" src="./src/assets/modern-clock-gnome-logo.png" height="100">

**Ein modernes Uhr-Widget für GNOME!**

[![Unterstützte GNOME-Versionen: 46 bis 51][badge-shell]][ego-page]
[![GNOME Extensions Downloads][badge-downloads]][ego-page]
[![Lizenz][badge-license]][license]
</div>

## Funktionen

Ein Desktop-Uhr-Widget für GNOME, inspiriert von [Modern Clock for KDE][modern-clock-kde], mit denselben Schriftarten und demselben Standarddesign.

- **Positionierung** — kann überall auf dem Schreibtisch platziert werden
- **Automatische Skalierung** — die Textgröße passt sich der Größe jedes Bildschirms an (HiDPI-Unterstützung)
- **Mehrbildschirm-Unterstützung** — wird auf jedem Bildschirm angezeigt und unabhängig skaliert
- **Sprache** — folgt den Spracheinstellungen Ihres Systems, wechselt zu Englisch, wenn die Schriftart die Zeichen nicht darstellen kann, oder kann fest auf Englisch eingestellt werden
- **Anzeigen oder Ausblenden** — Wochentag, Datum und Uhrzeit lassen sich unabhängig voneinander anzeigen oder ausblenden
- **Flexible Formate** — vollständiger oder abgekürzter Wochentag, drei Datumsstile, 24-Stunden-Format oder AM/PM-Uhrzeit
- **Anpassbar** — Schriftart, Größe, Zeichenabstand, Farbe sowie benutzerdefinierte Präfixe und Suffixe für jede Zeile
- **Optionale Akzentfarbe** — kann die Akzentfarbe Ihres Systems anstelle einer benutzerdefinierten Farbe verwenden

> [!NOTE]
> Unter GNOME 48 und neuer werden die mitgelieferten Schriftarten direkt aus der Erweiterung geladen und funktionieren sofort. Unter GNOME 46 und 47 werden sie beim ersten Start nach `~/.local/share/fonts/modernclock` kopiert. Sie müssen sich anschließend ab- und wieder anmelden, damit dies wirksam wird.

## Bildschirmfotos

<div align="center">

![Uhr-Widget auf einem hellen Hintergrundbild](./images/screenshot1.png)
![Angepasstes Uhr-Widget auf einem dunklen Hintergrundbild](./images/screenshot2.png)

</div>

## Installation

### Über die GNOME Extensions Webseite (empfohlen)

<a href="https://extensions.gnome.org/extension/9882/modern-clock/"><img alt="GNOME Extensions Seite" src="https://raw.githubusercontent.com/andyholmes/gnome-shell-extensions-badge/master/get-it-on-ego.svg?sanitize=true" height="100"></a>

### Aus dem Quellcode-Archiv

> [!NOTE]
> Bei einer Installation aus dem Repository erhält die Erweiterung keine automatischen Updates von der GNOME Extensions Website.

#### Option 1: Fertiges Paket (ZIP)

Laden Sie `modernclock@gnome.shell-extension.zip` von den [Releases][releases] herunter und installieren Sie es mit:

```bash
gnome-extensions install -f modernclock@gnome.shell-extension.zip
```

#### Option 2: Selbst kompilieren

```bash
git clone https://github.com/Tony-Rain/modern-clock-gnome.git
cd modern-clock-gnome
make install
```

#### Aktivierung

Melden Sie sich nach der Installation des Pakets ab und wieder an (oder starten Sie unter X11 die Shell einfach mit `Alt+F2` > `r` neu). Aktivieren Sie die Erweiterung anschließend über die Anwendung **Erweiterungen** oder führen Sie folgenden Befehl aus:

```bash
gnome-extensions enable modernclock@gnome-port
```

## Konfiguration

Öffnen Sie die Einstellungen über die App **Erweiterungen** oder führen Sie folgenden Befehl aus:

```bash
gnome-extensions prefs modernclock@gnome-port
```

<div align="center">

![Einstellungsfenster: Hauptseite](./images/screenshot_prefs1.png)

![Einstellungsfenster: Uhrzeitseite](./images/screenshot_prefs2.png)

</div>

## Deinstallation

Deinstallieren Sie die Erweiterung über die Anwendung **Erweiterungen** oder führen Sie aus:

```bash
gnome-extensions uninstall modernclock@gnome-port
```

Unter GNOME 46 und 47 werden die kopierten Schriftarten nicht automatisch entfernt. Löschen Sie diese bei Bedarf mit folgendem Befehl:

```bash
rm -rf ~/.local/share/fonts/modernclock
```

## Bekannte Einschränkungen

Die Anzeige wird während der Animation beim Wechsel der Arbeitsflächen (nur unter Wayland), auf dem Sperrbildschirm sowie in der Aktivitäten-Übersicht nicht dargestellt. Dies liegt daran, dass sie sich auf der Hintergrundebene der Shell befindet.

## Übersetzungen

Übersetzungen sind herzlich willkommen! Die Erweiterung verwendet `gettext`, sodass für neue Sprachen lediglich eine entsprechende `.po`-Datei benötigt wird.

Übersetzungen dieser README sind ebenfalls willkommen: Kopieren Sie `README.md` nach `README.<Sprache>.md` (zum Beispiel `README.es.md`), übersetzen Sie diese und fügen Sie sie zum Sprachumschalter oben in jeder README hinzu.

## Lizenz

GNU General Public License v3.0 oder neuer. Weitere Informationen finden Sie in der Datei [LICENSE][license].

Die mitgelieferten Schriftarten unterliegen ihren eigenen Lizenzen und sind nicht Teil des GPL-lizenzierten Codes.

## Danksagungen

- Originalprojekt: [Modern Clock for KDE][modern-clock-kde] von Prayag2
- Schriftarten: [Anurati][anurati], [Poppins][poppins]

[badge-readme-en]: https://img.shields.io/badge/Language-English-3584e4
[badge-readme-fr]: https://img.shields.io/badge/Langue-Fran%C3%A7ais-9141ac
[badge-readme-ru]: https://img.shields.io/badge/%D0%AF%D0%B7%D1%8B%D0%BA-%D0%A0%D1%83%D1%81%D1%81%D0%BA%D0%B8%D0%B9-e01b24
[badge-readme-de]: https://img.shields.io/badge/Sprache-Deutsch-26a269
[readme-en]: ./README.md
[readme-fr]: ./README.fr.md
[readme-ru]: ./README.ru.md
[readme-de]: ./README.de.md
[ego-page]: https://extensions.gnome.org/extension/9882/modern-clock/
[license]: ./LICENSE
[badge-shell]: https://img.shields.io/badge/GNOME_versions-46_--_51-3584e4?logo=gnome
[badge-downloads]: https://img.shields.io/gnome-extensions/dt/modernclock%40gnome-port?logo=gnome&color=3584e4
[badge-license]: https://img.shields.io/github/license/Tony-Rain/modern-clock-gnome
[modern-clock-kde]: https://github.com/Prayag2/kde_modernclock
[releases]: https://github.com/Tony-Rain/modern-clock-gnome/releases
[anurati]: https://www.behance.net/gallery/33704618/ANURATI-Free-font
[poppins]: https://github.com/itfoundry/poppins

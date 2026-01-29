
# Voice Everlast – Desktop Voice Workflow

Voice Everlast ist eine Desktop-App, die gesprochene Gedanken in strukturierte, direkt nutzbare Ergebnisse verwandelt.  
Statt reiner Transkription erzeugt die App – je nach Modus – Aufgabenlisten, Meeting-Notizen, Smart Notes oder E-Mail-Entwürfe.
Die App richtet sich an Wissensarbeiter:innen, Kreative und Menschen,
die Gedanken lieber mündlich formulieren als tippen.

---

## Kurzbeschreibung des Problems

Viele Menschen denken, planen und reflektieren mündlich.  
Klassische Speech-to-Text-Tools liefern jedoch lediglich rohe Transkripte, die anschließend manuell sortiert, gekürzt und in ein nutzbares Format gebracht werden müssen.

Das kostet Zeit, unterbricht den Arbeitsfluss und führt dazu, dass Ideen oder Entscheidungen verloren gehen.

---

## Lösung

Voice Everlast kombiniert Spracheingabe mit KI-gestützter Strukturierung.

Der Workflow:
1. **Sprache aufnehmen**
2. **Automatische Transkription**
3. **KI-gestützte Anreicherung (Enrichment)**

Je nach ausgewähltem Modus erzeugt die App direkt nutzbare Ergebnisse:
- Smart Notes
- Aufgabenlisten
- Meeting-Notizen
- E-Mail-Entwürfe

Die Outputs sind strukturiert, copy-paste-fähig und für den direkten Einsatz im Arbeitsalltag gedacht.

---

## Architektur-Überblick

### Frontend (UI)
- Next.js (React)
- Desktop-orientierte, reduzierte Benutzeroberfläche
- Anzeige von Aufnahme-Status, Transkript und KI-Output
- Modus-Auswahl (Smart Note / Aufgaben / Meeting-Notizen / E-Mail)
- Einstellungen über ein Zahnrad-Menü (API-Key, Hotkey)
- Lokale Speicherung von Konfigurationen (localStorage)

### Desktop Runtime
- Tauri (Rust)
- Native Desktop-App (Windows)
- Fensterverwaltung, Bundling und Installer-Erstellung
- Globaler Hotkey zum Ein- und Ausblenden der App

### KI / Enrichment
- OpenAI API
- Mode-spezifische Systemprompts
- Ausgabe als **strukturiertes JSON**
- Rendering des Outputs als Markdown

### Datenfluss
1. Spracheingabe → Transkript
2. Klick auf „Transkript verarbeiten“
3. Tauri/Rust Command ruft die OpenAI API auf
4. Strukturierter Output wird im UI angezeigt

---

## Setup-Anleitung

### Voraussetzungen
- Node.js (LTS)
- pnpm
- Rust Toolchain
- Windows: Visual Studio Build Tools (C++)

### Installation
```bash
pnpm install
```

### Development (Desktop-App starten)
```bash
pnpm tauri dev
```

### Build (Installer / EXE)
```bash
pnpm tauri build
```

Nach dem Build befinden sich die Artefakte typischerweise unter:
- `src-tauri/target/release/bundle/nsis/` (Setup.exe)
- `src-tauri/target/release/bundle/msi/` (MSI)

---

## Nutzung

1. Öffne ⚙ **Einstellungen**
2. Trage deinen **OpenAI API Key** ein (wird nur lokal gespeichert)
3. Optional: Globalen Hotkey deaktivieren oder anpassen
4. Modus auswählen:
   - Smart Note
   - Aufgaben
   - Meeting-Notizen
   - E-Mail Entwurf
5. Aufnahme starten → sprechen → stoppen
6. „Transkript verarbeiten“
7. Ergebnis kopieren und weiterverwenden

### Tastenkürzel
- **Enter**: Aufnahme starten / stoppen
- **Ctrl + Enter**: Transkript verarbeiten
- **Esc**: Abbrechen oder Einstellungen schließen
- **Globaler Hotkey (anpassbar; Default: Ctrl+Shift+Space)**: App ein-/ausblenden

---

## Design-Entscheidungen

**Warum Tauri + Next.js?**  
Next.js ermöglicht schnelle UI-Iteration und saubere React-Komponenten.  
Tauri liefert eine native Desktop-Hülle, die deutlich ressourcenschonender ist als klassische Electron-Ansätze.

**Warum Enrichment als Tauri Command (Rust)?**  
- Stabiler Release-Build
- Kein zusätzlicher Server nötig
- API-Key verbleibt lokal auf dem Gerät

**Warum strukturierte JSON-Ausgaben?**  
- Reproduzierbare Ergebnisse
- Saubere Weiterverarbeitung im UI
- Weniger Prompt-Drift als bei Freitext-Antworten

**Warum modusspezifische Prompts?**  
Unterschiedliche Aufgaben (Notiz, Taskliste, Meeting, E-Mail) erfordern unterschiedliche Output-Strukturen.  
Der Nutzer erhält dadurch deutlich relevantere Ergebnisse.

**Warum Einstellungen im Zahnrad-Menü?**  
Der Fokus im Hauptscreen liegt auf dem Workflow (Aufnahme → Output).  
Konfigurationen sind wichtig, sollen aber nicht ablenken.

---

## Hinweise

 API Key Hinweis:
Diese Anwendung benötigt einen OpenAI API Key.
Der Key wird **nicht** im Repository gespeichert.

Beim ersten Start kann der API Key direkt in der App eingegeben werden.
Er wird ausschließlich lokal auf dem Rechner gespeichert (localStorage).

- Für eine produktive Version könnte die Speicherung später in eine OS-Keychain verlagert werden.
- Feedback gerne an: max.moench@gmxde 
---

## Ausblick/Roadmap 

- Whisper-basierte Transkription
- Lokaler Verlauf / History
- Tray-Modus
- Integrationen (z. B. Notion, Obsidian, Kalender)
- Export als z.b. PDF 
- Share Funktion
- Branding, Design Polishing 


## Feedback gerne an: max.moench@gmx.de 



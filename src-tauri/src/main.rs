#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::json;
use tauri::{AppHandle, Manager};

use once_cell::sync::Lazy;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutEvent};
use tauri_plugin_global_shortcut::Builder as GlobalShortcutBuilder;

static HOTKEY_STATE: Lazy<Mutex<HotkeyState>> = Lazy::new(|| {
  Mutex::new(HotkeyState {
    enabled: true,
    shortcut: "Ctrl+Shift+Space".to_string(),
  })
});

// Debounce gegen KeyUp/KeyDown Double-Fire
static LAST_TOGGLE: Lazy<Mutex<Instant>> = Lazy::new(|| Mutex::new(Instant::now() - Duration::from_secs(10)));

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
struct HotkeyState {
  enabled: bool,
  shortcut: String,
}

fn toggle_window(app_handle: &AppHandle) {
  let mut last = LAST_TOGGLE.lock().unwrap();
  // 250ms Debounce: verhindert sofortiges "wieder zurück"
  if last.elapsed() < Duration::from_millis(250) {
    return;
  }
  *last = Instant::now();

  if let Some(win) = app_handle.get_webview_window("main") {
    let is_minimized = win.is_minimized().unwrap_or(false);
    let is_visible = win.is_visible().unwrap_or(true);

    if is_minimized || !is_visible {
      let _ = win.show();
      let _ = win.unminimize();
      let _ = win.set_focus();
    } else {
      let _ = win.hide();
    }
  }
}

fn unregister_current(app: &AppHandle) {
  let state = HOTKEY_STATE.lock().unwrap().clone();
  if let Ok(sc) = state.shortcut.parse::<Shortcut>() {
    let _ = app.global_shortcut().unregister(sc);
  }
}

fn apply_hotkey(app: &AppHandle, enabled: bool, shortcut: String) -> Result<(), String> {
  unregister_current(app);

  {
    let mut s = HOTKEY_STATE.lock().unwrap();
    s.enabled = enabled;
    s.shortcut = shortcut.clone();
  }

  if !enabled {
    return Ok(());
  }

  let sc = shortcut
    .parse::<Shortcut>()
    .map_err(|_| format!("Ungültiger Hotkey: {shortcut}. Beispiel: Ctrl+Shift+Space"))?;

  // Handler attachen; wir ignorieren den Event-Typ und nutzen Debounce statt is_pressed
  app.global_shortcut()
    .on_shortcut(sc, move |app_handle: &AppHandle, _s: &Shortcut, _e: ShortcutEvent| {
      toggle_window(app_handle);
    })
    .map_err(|e| format!("Hotkey Fehler: {:?}", e))?;

  Ok(())
}

#[tauri::command]
fn configure_hotkey(app: AppHandle, enabled: bool, shortcut: String) -> Result<(), String> {
  apply_hotkey(&app, enabled, shortcut)
}

#[tauri::command]
async fn enrich(api_key: String, text: String, mode: String) -> Result<serde_json::Value, String> {
  if api_key.trim().is_empty() {
    return Err("API-Key fehlt. Bitte in den Einstellungen eintragen.".into());
  }
  if text.trim().is_empty() {
    return Err("Kein Transkript vorhanden.".into());
  }

  // ---- MODE-SPEZIFISCHE PROMPTS ----
  fn system_prompt(mode: &str) -> String {
    let schema = r#"
Gib NUR gültiges JSON zurück.
Wenn etwas nicht vorkommt: leeres Array.

Schema (immer gleich):
{
  "title": string,
  "summaryBullets": string[],
  "keyPoints": string[],
  "decisions": string[],
  "nextSteps": string[],
  "markdown": string
}
"#;

    let smart_note = r#"
MODUS: SMART NOTE
Ziel: Eine klare Notiz, die man sofort in Notion/Obsidian einfügen kann.

Regeln:
- title: kurzer, treffender Titel
- summaryBullets: 2–5 kurze Kernaussagen
- keyPoints: wichtige Fakten / Details
- decisions: nur wenn im Text wirklich entschieden wurde
- nextSteps: konkrete To-dos (Verb am Anfang), 1 Aufgabe pro Eintrag
- markdown: exakt diese Struktur:

# {title}
## Kurzfassung
- ...
## Kernpunkte
- ...
## Entscheidungen
- ...
## Nächste Schritte
- [ ] ...
"#;

    let tasks = r#"
MODUS: AUFGABEN
Ziel: Aus dem Text NUR eine Taskliste machen (maximal praktisch).

Regeln:
- title: z.B. "Aufgaben"
- nextSteps: extrahiere so viele Aufgaben wie nötig, sehr konkret (1 Satz)
- summaryBullets/keyPoints/decisions: nur wenn wirklich nötig, sonst leer
- markdown: fast nur Checkboxen. Kein Fluff.

Format markdown:

# Aufgaben
- [ ] ...
- [ ] ...
"#;

    let meeting = r#"
MODUS: MEETING-NOTIZEN
Ziel: Protokoll-Style: Agenda/Topics, Decisions, Action Items.

Regeln:
- title: "Meeting: <Thema>"
- summaryBullets: 2–5 Meeting-Outcomes
- keyPoints: Diskussionspunkte/Topics (stichpunktartig)
- decisions: Beschlüsse
- nextSteps: Action Items
- markdown:

# {title}
## Outcomes
- ...
## Themen
- ...
## Entscheidungen
- ...
## Action Items
- [ ] ...
"#;

    let email = r#"
MODUS: E-MAIL ENTWURF
Ziel: Eine versandfertige E-Mail (professionell, kurz, klar).

Regeln:
- title: Betreff (ohne "Betreff:" davor)
- summaryBullets/keyPoints/decisions/nextSteps: wenn passend, sonst leer
- markdown MUSS so aussehen:

# Betreff: {title}

Hallo <optional>,

<E-Mail Body, 6–12 Zeilen, klar strukturiert>

Viele Grüße
"#;

    let mode_block = match mode {
      "smart_note" => smart_note,
      "tasks" => tasks,
      "meeting_minutes" => meeting,
      "email" => email,
      _ => smart_note,
    };

    format!("{}\n{}\n{}", schema, mode_block, "WICHTIG: Antworte ausschließlich mit dem JSON-Objekt. Keine Erklärung.")
  }

  let system = system_prompt(&mode);

  // ---- OpenAI Request ----
  let body = json!({
    "model": "gpt-4o-mini",
    "temperature": 0.2,
    "response_format": { "type": "json_object" },
    "messages": [
      { "role": "system", "content": system },
      { "role": "user", "content": text }
    ]
  });

  let client = reqwest::Client::new();
  let res = client
    .post("https://api.openai.com/v1/chat/completions")
    .bearer_auth(api_key)
    .json(&body)
    .send()
    .await
    .map_err(|e| e.to_string())?;

  let status = res.status();
  let json_resp: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;

  if !status.is_success() {
    return Err(format!("OpenAI Fehler: {}", json_resp));
  }

  let content = json_resp["choices"][0]["message"]["content"]
    .as_str()
    .unwrap_or("{}");

  let parsed: serde_json::Value = serde_json::from_str(content).unwrap_or(json!({}));
  Ok(parsed)
}


fn main() {
  tauri::Builder::default()
    .plugin(GlobalShortcutBuilder::new().build())
    .setup(|app| {
      // Default: Hotkey an
      let state = HOTKEY_STATE.lock().unwrap().clone();
      let _ = apply_hotkey(&app.handle(), state.enabled, state.shortcut);
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![enrich, configure_hotkey])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

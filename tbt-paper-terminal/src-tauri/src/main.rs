#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() -> tauri::Result<()> {
    // Minimal Tauri bootstrap to host the existing Vite app.
    tauri::Builder::default()
        .run(tauri::generate_context!())?;

    Ok(())
}

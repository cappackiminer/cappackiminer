import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const [backupPath, outputPath] = process.argv.slice(2);

if (!backupPath || !outputPath) {
  console.error(
    "Usage: node tools/create-wallet-transfer.mjs <backup.cappacki> <output.exe>",
  );
  process.exit(1);
}

const input = path.resolve(backupPath);
const output = path.resolve(outputPath);

if (!fs.existsSync(input) || path.extname(input).toLowerCase() !== ".cappacki") {
  throw new Error("A valid .cappacki backup file is required.");
}

fs.mkdirSync(path.dirname(output), { recursive: true });

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cappacki-wallet-transfer-"));
const sourceDir = path.join(tempDir, "src");
fs.mkdirSync(sourceDir);

const manifest = `[package]
name = "cappackiminer_wallet_transfer"
version = "0.1.0"
edition = "2021"

[dependencies]
windows-sys = { version = "0.59", features = ["Win32_UI_WindowsAndMessaging"] }
`;

const backupLiteral = JSON.stringify(input);
const source = `#![windows_subsystem = "windows"]

use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_ICONINFORMATION, MB_OK};

static BACKUP: &[u8] = include_bytes!(${backupLiteral});

fn wide(value: &str) -> Vec<u16> {
    OsStr::new(value).encode_wide().chain(std::iter::once(0)).collect()
}

fn show(title: &str, text: &str, flags: u32) {
    let title = wide(title);
    let text = wide(text);
    unsafe { MessageBoxW(std::ptr::null_mut(), text.as_ptr(), title.as_ptr(), flags); }
}

fn candidates() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(current) = std::env::current_exe() {
        if let Some(parent) = current.parent() {
            paths.push(parent.join("CappAckiMiner.exe"));
            paths.push(parent.join("CappAckiMiner DEV.exe"));
            paths.push(parent.join("cappackiminer.exe"));
        }
    }
    for variable in ["LOCALAPPDATA", "PROGRAMFILES", "PROGRAMFILES(X86)"] {
        if let Ok(root) = std::env::var(variable) {
            paths.push(Path::new(&root).join("CappAckiMiner").join("CappAckiMiner.exe"));
            paths.push(Path::new(&root).join("CappAckiMiner DEV").join("CappAckiMiner DEV.exe"));
            paths.push(Path::new(&root).join("CappAckiMiner").join("CappAckiMiner DEV.exe"));
        }
    }
    paths
}

fn main() {
    let public = match std::env::var("PUBLIC") {
        Ok(value) => value,
        Err(_) => {
            show("CappAckiMiner Wallet Transfer", "Windows PUBLIC klasörü bulunamadı.", MB_OK | MB_ICONERROR);
            return;
        }
    };
    let directory = Path::new(&public).join("Documents").join("CappAckiMiner");
    if let Err(error) = std::fs::create_dir_all(&directory) {
        show("CappAckiMiner Wallet Transfer", &format!("Yedek klasörü oluşturulamadı:\\n\\n{error}"), MB_OK | MB_ICONERROR);
        return;
    }
    let timestamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs();
    let target = directory.join(format!("cappackiminer-transfer-{timestamp}.cappacki"));
    if let Err(error) = std::fs::write(&target, BACKUP) {
        show("CappAckiMiner Wallet Transfer", &format!("Yedek aktarılamadı:\\n\\n{error}"), MB_OK | MB_ICONERROR);
        return;
    }

    let mut launched = false;
    for candidate in candidates() {
        if candidate.exists() && Command::new(&candidate).spawn().is_ok() {
            launched = true;
            break;
        }
    }
    let detail = if launched {
        "CappAckiMiner açıldı. Yedek parola sorularak otomatik içe aktarılacak."
    } else {
        "CappAckiMiner bulunamadı. Uygulamayı açtığınızda yedek otomatik algılanacak."
    };
    show("CappAckiMiner Wallet Transfer", &format!("{detail}\\n\\nDosya: {}", target.display()), MB_OK | MB_ICONINFORMATION);
}
`;

fs.writeFileSync(path.join(tempDir, "Cargo.toml"), manifest);
fs.writeFileSync(path.join(sourceDir, "main.rs"), source);

execFileSync("cargo", [
  "build",
  "--release",
  "--manifest-path",
  path.join(tempDir, "Cargo.toml"),
], { stdio: "inherit" });

const built = path.join(tempDir, "target", "release", "cappackiminer_wallet_transfer.exe");
fs.copyFileSync(built, output);
console.log(`Wallet transfer EXE created: ${output}`);

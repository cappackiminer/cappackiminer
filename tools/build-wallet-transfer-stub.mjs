import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cappacki-wallet-transfer-stub-"));
const sourceDir = path.join(tempDir, "src");
const output = path.resolve("src-tauri/resources/CappAckiMiner-WalletTransferStub.exe");
fs.mkdirSync(sourceDir, { recursive: true });
fs.mkdirSync(path.dirname(output), { recursive: true });

fs.writeFileSync(path.join(tempDir, "Cargo.toml"), `[package]
name = "cappackiminer_wallet_transfer_stub"
version = "0.1.0"
edition = "2021"

[dependencies]
windows-sys = { version = "0.59", features = ["Win32_UI_WindowsAndMessaging"] }
`);

fs.writeFileSync(path.join(sourceDir, "main.rs"), String.raw`#![windows_subsystem = "windows"]

use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_ICONINFORMATION, MB_OK};

const MARKER: &[u8] = b"CAPPAWALLETTRANSFERV1";

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
    let executable = match std::env::current_exe() {
        Ok(path) => path,
        Err(error) => { show("CappAckiMiner Wallet Transfer", &error.to_string(), MB_OK | MB_ICONERROR); return; }
    };
    let bytes = match std::fs::read(&executable) {
        Ok(bytes) => bytes,
        Err(error) => { show("CappAckiMiner Wallet Transfer", &error.to_string(), MB_OK | MB_ICONERROR); return; }
    };
    let marker_start = match bytes.windows(MARKER.len()).rposition(|window| window == MARKER) {
        Some(index) => index,
        None => { show("CappAckiMiner Wallet Transfer", "Bu transfer dosyası geçersiz.", MB_OK | MB_ICONERROR); return; }
    };
    let length_start = marker_start + MARKER.len();
    if bytes.len() < length_start + 8 {
        show("CappAckiMiner Wallet Transfer", "Transfer verisi eksik.", MB_OK | MB_ICONERROR);
        return;
    }
    let mut length_bytes = [0u8; 8];
    length_bytes.copy_from_slice(&bytes[length_start..length_start + 8]);
    let length = u64::from_le_bytes(length_bytes) as usize;
    let payload_start = length_start + 8;
    if bytes.len() < payload_start + length {
        show("CappAckiMiner Wallet Transfer", "Transfer verisi bozuk.", MB_OK | MB_ICONERROR);
        return;
    }
    let public = match std::env::var("PUBLIC") {
        Ok(value) => value,
        Err(_) => { show("CappAckiMiner Wallet Transfer", "Windows PUBLIC klasörü bulunamadı.", MB_OK | MB_ICONERROR); return; }
    };
    let directory = Path::new(&public).join("Documents").join("CappAckiMiner");
    if let Err(error) = std::fs::create_dir_all(&directory) {
        show("CappAckiMiner Wallet Transfer", &error.to_string(), MB_OK | MB_ICONERROR);
        return;
    }
    let timestamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_secs();
    let target = directory.join(format!("cappackiminer-transfer-{timestamp}.cappacki"));
    if let Err(error) = std::fs::write(&target, &bytes[payload_start..payload_start + length]) {
        show("CappAckiMiner Wallet Transfer", &error.to_string(), MB_OK | MB_ICONERROR);
        return;
    }
    for candidate in candidates() {
        if candidate.exists() && Command::new(&candidate).spawn().is_ok() {
            show("CappAckiMiner Wallet Transfer", "CappAckiMiner açıldı. Yedek parola sorularak içe aktarılacak.", MB_OK | MB_ICONINFORMATION);
            return;
        }
    }
    show("CappAckiMiner Wallet Transfer", &format!("Yedek hazırlandı. CappAckiMiner'i açın.\n\n{}", target.display()), MB_OK | MB_ICONINFORMATION);
}
`);

execFileSync("cargo", ["build", "--release", "--manifest-path", path.join(tempDir, "Cargo.toml")], { stdio: "inherit" });
fs.copyFileSync(path.join(tempDir, "target", "release", "cappackiminer_wallet_transfer_stub.exe"), output);
console.log(`Wallet transfer stub created: ${output}`);

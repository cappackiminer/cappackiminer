import {
  memo,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import initBeeSdk, {
  ensure_mining_keys_propagated,
  gen_mining_keys,
  get_miner_address_by_wallet_name,
  multisig_balances,
  Miner,
  Wallet,
} from "@teamgosh/bee-sdk";
import { Store } from "@tauri-apps/plugin-store";
import { currentMonitor, getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { invoke } from "@tauri-apps/api/core";
import { message } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import QRCode from "qrcode";
import {
  DEFAULT_TAP_MODE,
  TAP_MODE_CONFIGS,
  type TapMode,
} from "./mining/tapModes";
import {
  createWalletBackup,
  MAX_WALLET_BACKUP_BYTES,
  readWalletBackup,
} from "./walletBackup";
import {
  enableDeveloperUnlimitedLicense,
  activateLicenseKey,
  activatePendingLicense,
  getLicenseSnapshot,
  hydrateLicenseState,
  syncLicenseWithServer,
  setLicenseMiningActive,
  setSelectedLicenseWalletIds,
  type LicenseSnapshot,
} from "./license";
import "./App.css";
import "./Lite.css";

const APP_ID =
  "0x0000000000000000000000000000000000000000000000000000000000000001";

const LOCAL_DEVELOPER_TOOLS_ENABLED = import.meta.env.DEV;

const ENDPOINTS = ["https://mainnet.ackinacki.org"];
const BEESCAN_TPS_ENDPOINT = "https://beescan.live/api/tps?range=1d";

const CLIENT_CONFIG = {
  network: {
    endpoints: ENDPOINTS,
  },
};

const PROFILE_STORE_FILE = "miner-profile.json";
const PROFILES_KEY = "savedMinerProfiles";
const ACTIVE_PROFILE_KEY = "activeMinerProfileId";
const LEGACY_PROFILE_KEY = "savedMinerProfile";

type AppViewMode = "main" | "lite";
type LiteAcceptedNotice = {
  id: number;
  profileId: string;
  walletName: string;
  rewardAmount: string;
  rewardTime: string;
};

const APP_VIEW_MODE_KEY = "cappackiminer-view-mode-v1";
const MAIN_WALLET_LIMIT = 24;
const LITE_WALLET_LIMIT = 100;
const LEGACY_THEME_KEY = "miner-theme";
const MAIN_THEME_KEY = "miner-theme-main";
const LITE_THEME_KEY = "miner-theme-lite";

function loadAppViewMode(): AppViewMode {
  return localStorage.getItem(APP_VIEW_MODE_KEY) === "lite"
    ? "lite"
    : "main";
}

/* CAPPACKI_RECONNECT_VERIFY_TOGGLE */
const RECONNECT_VERIFY_KEY =
  "cappackiminer-reconnect-verify-mining-key";

// Exact timing from the proven installed stable miner.
const SESSION_DURATION_MS = 135_000;
const SESSION_EPOCH_COOLDOWN_MS = 300_000;
const SESSION_TERMINAL_EVENT_GRACE_MS = 15_000;
const SESSION_RESULT_GRACE_MS = 30_000;
const NEXT_SESSION_DELAY_MS = 5_000;
const RETRY_DELAY_MS = 10_000;
const RECOVERY_DELAY_MS = 30_000;
const MAX_TAPS_PER_FIVE_MINUTE_EPOCH = 70;
const FIVE_MINUTE_EPOCHS_PER_DAILY_EPOCH = 294;
const SDK_FIVE_MINUTE_EPOCH_BLOCK_STEP = 1_000n;
const PORTFOLIO_REFRESH_INTERVAL_MS = 60_000;
const BALANCE_REFRESH_INTERVAL_MS = 5 * 60_000;
const NETWORK_REFRESH_INTERVAL_MS = 60_000;
const MINING_INTENSITY_REFRESH_INTERVAL_MS = 60 * 60_000;
const NETWORK_WALLET_REFRESH_INTERVAL_MS = 60 * 60_000;
const REWARD_REFRESH_INTERVAL_MS = 60_000;
const CPU_CONTROLLER_SAMPLE_INTERVAL_MS = 10_000;
const BALANCE_INCOME_LEDGER_KEY =
  "cappackiminer-balance-income-ledger-v1";
const BALANCE_INCOME_LEDGER_STORE_KEY = "balanceIncomeLedgerV1";
const ROLLING_24H_MS = 24 * 60 * 60_000;
const TITLE_FIRE_DISTANCE_PX = Math.round((6 / 2.54) * 96);
const WALLET_LAYOUT_HEADER_HEIGHT = 220;
const WALLET_LAYOUT_SIDE_SPACE = 34;
const WALLET_LAYOUT_CELL_WIDTH = 258;
const WALLET_LAYOUT_CELL_HEIGHT = 200;
const WINDOW_MIN_WIDTH =
  WALLET_LAYOUT_SIDE_SPACE + 4 * WALLET_LAYOUT_CELL_WIDTH;
const WINDOW_MIN_HEIGHT = 600;
const SKIN_KEY = "cappackiminer-skin";
const UI_SHAPE_KEY = "cappackiminer-ui-shape";
// v2 intentionally defaults to the low-power presentation.  The dashboard
// remains fully readable while expensive continuous effects can be enabled
// explicitly from the menu when desired.
const ANIMATION_SETTINGS_KEY = "cappackiminer-animation-settings-v3";
const WALLET_GRID_COMPACT_COLUMNS = 4;
const WALLET_GRID_MEDIUM_COLUMNS = 5;
const WALLET_GRID_WIDE_COLUMNS = 7;
const WALLET_GRID_MEDIUM_BREAKPOINT_PX = 1_350;
const WALLET_GRID_WIDE_BREAKPOINT_PX = 1_600;
const WALLET_GRID_ROWS = 4;
const WALLET_GRID_MIN_COLUMNS = 4;
const WALLET_GRID_MAX_COLUMNS = 6;
const WALLET_SWAY_SESSION_SEED = Math.floor(Math.random() * 1_000_003);

/* CAPPACKI_WATCHDOG_PATCH */
const WATCHDOG_ENABLED_KEY = "cappackiminer-watchdog-enabled";
const WATCHDOG_EXPECTED_KEY = "cappackiminer-watchdog-mining-expected";
const WATCHDOG_RELOAD_PENDING_KEY = "cappackiminer-watchdog-reload-pending";
const WATCHDOG_LAST_RELOAD_KEY = "cappackiminer-watchdog-last-reload";
const WATCHDOG_CHECK_INTERVAL_MS = 60 * 60_000;
const WATCHDOG_INACTIVE_THRESHOLD_MS = 10 * 60_000;
const WATCHDOG_RELOAD_COOLDOWN_MS = 60 * 60_000;
const MAX_ACTIVITY_LOG_ENTRIES = 500;
const TAP_LOG_STEP = 10;

function formatWalletBalanceRaw(rawValue: string): string {
  try {
    return (BigInt(rawValue) / 1_000_000_000n).toString();
  } catch {
    return "—";
  }
}

function parseHistoryTimestampSeconds(
  value: string | number | bigint,
): number | null {
  const text = String(value).trim();

  if (!text) {
    return null;
  }

  const numeric = Number(text);

  if (Number.isFinite(numeric) && numeric > 0) {
    if (numeric >= 100_000_000_000_000_000) {
      return Math.floor(numeric / 1_000_000_000);
    }

    if (numeric >= 100_000_000_000_000) {
      return Math.floor(numeric / 1_000_000);
    }

    return numeric >= 10_000_000_000
      ? Math.floor(numeric / 1000)
      : Math.floor(numeric);
  }

  const parsedMilliseconds = Date.parse(text);

  return Number.isFinite(parsedMilliseconds)
    ? Math.floor(parsedMilliseconds / 1000)
    : null;
}

function isMiningHistoryType(value: string): boolean {
  return value.trim().toLowerCase() === "mining";
}

const TAP_POINTS: Array<[number, number]> = [
  [120, 120],
  [180, 135],
  [230, 160],
  [275, 190],
  [245, 225],
  [195, 245],
  [145, 220],
  [105, 185],
];

const TITLE_SPARK_POINTS = [
  { x: 8, y: 10, dx: -18, dy: -16, size: 3.2, delay: 120 },
  { x: 52, y: -5, dx: 4, dy: -23, size: 2.8, delay: 460 },
  { x: 94, y: 15, dx: 19, dy: -15, size: 3.4, delay: 770 },
  { x: 0, y: 60, dx: -22, dy: -3, size: 2.6, delay: 260 },
  { x: 35, y: 105, dx: -7, dy: 18, size: 3.1, delay: 610 },
  { x: 100, y: 62, dx: 22, dy: 1, size: 2.7, delay: 920 },
  { x: 20, y: -8, dx: -10, dy: -21, size: 2.4, delay: 350 },
  { x: 76, y: -7, dx: 12, dy: -22, size: 3.0, delay: 690 },
  { x: 11, y: 94, dx: -16, dy: 14, size: 2.8, delay: 40 },
  { x: 90, y: 94, dx: 17, dy: 15, size: 3.3, delay: 540 },
  { x: 43, y: 14, dx: -5, dy: -18, size: 2.5, delay: 830 },
  { x: 66, y: 90, dx: 8, dy: 19, size: 2.9, delay: 180 },
  { x: 25, y: 48, dx: -19, dy: -9, size: 2.6, delay: 730 },
  { x: 79, y: 47, dx: 20, dy: -8, size: 3.2, delay: 310 },
  { x: 50, y: 110, dx: 2, dy: 22, size: 2.7, delay: 990 },
] as const;

type LogEntry = {
  time: string;
  message: string;
};

type SystemMetrics = {
  cpu_usage: number | null;
  cpu_temperature_c: number | null;
};

type NetworkHealth = {
  status: "unknown" | "healthy" | "warning" | "critical";
  tps: number | null;
};

type NetworkStress = {
  level: "unknown" | "low" | "medium" | "high";
  recentFailures: number;
};

function networkStressLevel(
  recentFailures: number,
  healthStatus: NetworkHealth["status"],
): NetworkStress["level"] {
  if (recentFailures >= 5) return "high";
  if (recentFailures > 0) return "medium";
  if (healthStatus === "healthy") return "low";
  if (healthStatus === "warning" || healthStatus === "critical") {
    return "medium";
  }
  return "unknown";
}

type NetworkOverview = {
  totalWallets: number | null;
  miningEventsPerHour: number | null;
  miningSampleAt: number | null;
  updatedAt: number | null;
  epochRemaining: string | null;
  epochStartBlock: string | null;
  epoch5mStartBlock: string | null;
  epochEstimatedEndAt: number | null;
  epochUpdatedAt: number | null;
};

function formatSdkEpochRemaining(epochEndAt: number, now = Date.now()): string {
  const remainingSeconds = Math.max(
    0,
    Math.floor((epochEndAt - now) / 1000),
  );
  const hours = Math.floor(remainingSeconds / 3600);
  const minutes = Math.floor((remainingSeconds % 3600) / 60);
  const seconds = remainingSeconds % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

type ThemeName =
  | "ocean-blue"
  | "pearl-white"
  | "pastel-pink"
  | "moonlit-teal"
  | "graphite-gray"
  | "indigo-calm"
  | "aubergine-haze"
  | "obsidian-cyan";

function normalizeTheme(value: string | null): ThemeName {
  const legacyMap: Record<string, ThemeName> = {
    "neon-dark": "ocean-blue",
    "purple-galaxy": "ocean-blue",
    "light-mode": "pastel-pink",
    "silver-dusk": "ocean-blue",
    "graphite-blue": "graphite-gray",
    "deep-slate": "ocean-blue",
    "rosewood-mist": "ocean-blue",
    "arctic-frost": "ocean-blue",
    "forest-green": "ocean-blue",
    "nordic-pine": "ocean-blue",
    "sage-night": "ocean-blue",
    "copper-shadow": "ocean-blue",
    "cappadocia-sunset": "ocean-blue",
    "cappadocia-dust": "ocean-blue",
    "midnight-gold": "ocean-blue",
    "amber-smoke": "ocean-blue",
    "petrol-glass": "ocean-blue",
    "sandstone-night": "ocean-blue",
    "crimson-forge": "ocean-blue",
    "obsidian-black": "obsidian-cyan",
  };

  if (value && legacyMap[value]) {
    return legacyMap[value];
  }

  const supportedThemes: ThemeName[] = [
    "ocean-blue",
    "pearl-white",
    "pastel-pink",
    "moonlit-teal",
    "graphite-gray",
    "indigo-calm",
    "aubergine-haze",
    "obsidian-cyan",
  ];

  return supportedThemes.includes(value as ThemeName)
    ? (value as ThemeName)
    : "ocean-blue";
}

type SkinName = "velvet-soft";

type UiShape = "round" | "technical";

const UI_SHAPE_OPTIONS: Array<{
  value: UiShape;
  label: string;
  icon: string;
}> = [
  { value: "round", label: "Round Soft", icon: "●" },
  { value: "technical", label: "Technical", icon: "⌗" },
];

function normalizeUiShape(value: string | null): UiShape {
  const match = UI_SHAPE_OPTIONS.find((option) => option.value === value);
  return match?.value ?? "round";
}

function loadAnimationsEnabled(): boolean {
  try {
    const stored = JSON.parse(
      localStorage.getItem(ANIMATION_SETTINGS_KEY) ?? "true",
    ) as boolean | { enabled?: boolean };

    if (typeof stored === "boolean") {
      return stored;
    }

    return typeof stored.enabled === "boolean" ? stored.enabled : false;
  } catch {
    return false;
  }
}


type AppLanguage = "en" | "tr" | "ru" | "ar" | "zh" | "id";

function repairMojibake(value: string): string {
  if (!/(Ã|Â|â|Ø|Ù|Ğ|ç[®¤]|ä[½¸]|å)/.test(value)) {
    return value;
  }

  let current = value;

  for (let pass = 0; pass < 3; pass += 1) {
    try {
      const bytes = Uint8Array.from(
        Array.from(current, (character) => character.charCodeAt(0) & 0xff),
      );
      const repaired = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (repaired === current) {
        break;
      }
      current = repaired;
    } catch {
      break;
    }
  }

  return current;
}

function repairTranslation<T extends Record<string, string>>(translation: T): T {
  return Object.fromEntries(
    Object.entries(translation).map(([key, value]) => [key, repairMojibake(value)]),
  ) as T;
}

const LEGACY_LANGUAGE_OPTIONS: Array<{
  value: AppLanguage;
  label: string;
  nativeLabel: string;
  flag: string;
  flagCode: string;
}> = [
  { value: "tr", label: "Turkish", nativeLabel: "Türkçe", flag: "🇹🇷", flagCode: "tr" },
  { value: "en", label: "English", nativeLabel: "English", flag: "🇬🇧", flagCode: "gb" },
  { value: "ru", label: "Russian", nativeLabel: "Русский", flag: "🇷🇺", flagCode: "ru" },
  { value: "ar", label: "Arabic", nativeLabel: "العربية", flag: "🇸🇦", flagCode: "sa" },
  { value: "zh", label: "Chinese", nativeLabel: "简体中文", flag: "🇨🇳", flagCode: "cn" },
  { value: "id", label: "Indonesian", nativeLabel: "Bahasa Indonesia", flag: "🇮🇩", flagCode: "id" },
 ];

void LEGACY_LANGUAGE_OPTIONS;

const LANGUAGE_OPTIONS: Array<{
  value: AppLanguage;
  label: string;
  nativeLabel: string;
  flag: string;
  flagCode: string;
}> = [
  { value: "tr", label: "Turkish", nativeLabel: "Türkçe", flag: "🇹🇷", flagCode: "tr" },
  { value: "en", label: "English", nativeLabel: "English", flag: "🇬🇧", flagCode: "gb" },
  { value: "ru", label: "Russian", nativeLabel: "Русский", flag: "🇷🇺", flagCode: "ru" },
  { value: "ar", label: "Arabic", nativeLabel: "العربية", flag: "🇸🇦", flagCode: "sa" },
  { value: "zh", label: "Chinese", nativeLabel: "简体中文", flag: "🇨🇳", flagCode: "cn" },
  { value: "id", label: "Indonesian", nativeLabel: "Bahasa Indonesia", flag: "🇮🇩", flagCode: "id" },
 ];

const ADMIN_LABELS = {
  en: { admin: "ADMIN ACCESS", developer: "DEVELOPER ACCESS", adminTitle: "Administration controls", developerTitle: "Developer controls", adminDescription: "License and application management controls will be managed here.", developerDescription: "Developer license overrides will be managed here.", status: "LICENSE STATUS", unlimited: "UNLIMITED DEVELOPER", limitReached: "USAGE LIMIT REACHED", inactive: "LICENSE INACTIVE", noExpiration: "NO EXPIRATION", waiting: "WAITING LICENSES", activate: "ACTIVATE LICENSE", copyDevice: "COPY DEVICE CODE / MACHINEGUID", exportBackup: "EXPORT WALLET BACKUP", importBackup: "IMPORT WALLET BACKUP", selectWallets: "SELECT UP TO 2 WALLETS", queued: "WAITING", select: "SELECT" },
  tr: { admin: "YÖNETİCİ ERİŞİMİ", developer: "GELİŞTİRİCİ ERİŞİMİ", adminTitle: "Yönetim kontrolleri", developerTitle: "Geliştirici kontrolleri", adminDescription: "Lisans ve uygulama yönetimi burada yapılır.", developerDescription: "Geliştirici lisans ayarları burada yapılır.", status: "LİSANS DURUMU", unlimited: "SINIRSIZ GELİŞTİRİCİ", limitReached: "KULLANIM LİMİTİ DOLDU", inactive: "LİSANS AKTİF DEĞİL", noExpiration: "SÜRESİZ", waiting: "BEKLEYEN LİSANSLAR", activate: "LİSANSI AKTİFLEŞTİR", copyDevice: "CİHAZ KODU / MACHINEGUID KOPYALA", exportBackup: "CÜZDAN YEDEĞİ DIŞA AKTAR", importBackup: "CÜZDAN YEDEĞİ İÇE AKTAR", selectWallets: "EN FAZLA 2 CÜZDAN SEÇ", queued: "BEKLİYOR", select: "SEÇ" },
  ru: { admin: "ДОСТУП АДМИНИСТРАТОРА", developer: "ДОСТУП РАЗРАБОТЧИКА", adminTitle: "Управление", developerTitle: "Настройки разработчика", adminDescription: "Управление лицензией и приложением.", developerDescription: "Настройки лицензии разработчика.", status: "СТАТУС ЛИЦЕНЗИИ", unlimited: "БЕЗЛИМИТНЫЙ РАЗРАБОТЧИК", limitReached: "ЛИМИТ ИСЧЕРПАН", inactive: "ЛИЦЕНЗИЯ НЕАКТИВНА", noExpiration: "БЕЗ СРОКА", waiting: "ОЖИДАЮЩИЕ ЛИЦЕНЗИИ", activate: "АКТИВИРОВАТЬ ЛИЦЕНЗИЮ", copyDevice: "КОПИРОВАТЬ КОД / MACHINEGUID", exportBackup: "ЭКСПОРТ КОШЕЛЬКА", importBackup: "ИМПОРТ КОШЕЛЬКА", selectWallets: "ВЫБЕРИТЕ ДО 2 КОШЕЛЬКОВ", queued: "ОЖИДАНИЕ", select: "ВЫБРАТЬ" },
  ar: { admin: "وصول المسؤول", developer: "وصول المطور", adminTitle: "إعدادات الإدارة", developerTitle: "إعدادات المطور", adminDescription: "إدارة الترخيص والتطبيق.", developerDescription: "إعدادات ترخيص المطور.", status: "حالة الترخيص", unlimited: "مطور بلا حدود", limitReached: "اكتمل حد الاستخدام", inactive: "الترخيص غير نشط", noExpiration: "بلا انتهاء", waiting: "التراخيص المنتظرة", activate: "تفعيل الترخيص", copyDevice: "نسخ رمز الجهاز / MACHINEGUID", exportBackup: "تصدير نسخة المحفظة", importBackup: "استيراد نسخة المحفظة", selectWallets: "اختر حتى محفظتين", queued: "انتظار", select: "اختيار" },
  zh: { admin: "管理员访问", developer: "开发者访问", adminTitle: "管理控制", developerTitle: "开发者控制", adminDescription: "在此管理许可证和应用程序。", developerDescription: "在此管理开发者许可证。", status: "许可证状态", unlimited: "无限开发者", limitReached: "已达到使用上限", inactive: "许可证未激活", noExpiration: "永久有效", waiting: "等待中的许可证", activate: "激活许可证", copyDevice: "复制设备代码 / MACHINEGUID", exportBackup: "导出钱包备份", importBackup: "导入钱包备份", selectWallets: "最多选择 2 个钱包", queued: "等待中", select: "选择" },
  id: { admin: "AKSES ADMIN", developer: "AKSES PENGEMBANG", adminTitle: "Kontrol administrasi", developerTitle: "Kontrol pengembang", adminDescription: "Kelola lisensi dan aplikasi di sini.", developerDescription: "Kelola lisensi pengembang di sini.", status: "STATUS LISENSI", unlimited: "PENGEMBANG TANPA BATAS", limitReached: "BATAS PENGGUNAAN TERCAPAI", inactive: "LISENSI TIDAK AKTIF", noExpiration: "TANPA KEDALUWARSA", waiting: "LISENSI MENUNGGU", activate: "AKTIFKAN LISENSI", copyDevice: "SALIN KODE PERANGKAT / MACHINEGUID", exportBackup: "EKSPOR CADANGAN DOMPET", importBackup: "IMPOR CADANGAN DOMPET", selectWallets: "PILIH MAKSIMAL 2 DOMPET", queued: "MENUNGGU", select: "PILIH" },
} as const;

const ADMIN_ACTION_LABELS = {
  en: {
    transferBackup: "WALLET BACKUP TRANSFER EXE",
    backupTitle: "WALLET BACKUP",
    workingWallets: "WORKING WALLETS",
    done: "DONE",
    unlimitedActive: "UNLIMITED LICENSE ACTIVE",
    enableUnlimited: "ENABLE UNLIMITED LICENSE",
    signedKeys: "Signed license keys are issued by the offline developer tool.",
    developerPassword: "Developer password:",
    incorrectPassword: "Incorrect password.",
  },
  tr: {
    transferBackup: "CÜZDAN YEDEĞİ TRANSFER EXE",
    backupTitle: "CÜZDAN YEDEĞİ",
    workingWallets: "ÇALIŞAN CÜZDANLAR",
    done: "TAMAMLANDI",
    unlimitedActive: "SINIRSIZ LİSANS AKTİF",
    enableUnlimited: "SINIRSIZ LİSANSI ETKİNLEŞTİR",
    signedKeys: "İmzalı lisans anahtarları çevrimdışı geliştirici aracıyla üretilir.",
    developerPassword: "Geliştirici parolası:",
    incorrectPassword: "Parola hatalı.",
  },
  ru: {
    transferBackup: "EXE ДЛЯ ПЕРЕНОСА РЕЗЕРВНОЙ КОПИИ",
    backupTitle: "РЕЗЕРВНАЯ КОПИЯ КОШЕЛЬКА",
    workingWallets: "РАБОТАЮЩИЕ КОШЕЛЬКИ",
    done: "ГОТОВО",
    unlimitedActive: "БЕЗЛИМИТНАЯ ЛИЦЕНЗИЯ АКТИВНА",
    enableUnlimited: "ВКЛЮЧИТЬ БЕЗЛИМИТНУЮ ЛИЦЕНЗИЮ",
    signedKeys: "Подписанные ключи лицензии выпускаются офлайн-инструментом разработчика.",
    developerPassword: "Пароль разработчика:",
    incorrectPassword: "Неверный пароль.",
  },
  ar: {
    transferBackup: "ملف EXE لنقل نسخة المحفظة الاحتياطية",
    backupTitle: "نسخة المحفظة الاحتياطية",
    workingWallets: "المحافظ قيد التشغيل",
    done: "مكتمل",
    unlimitedActive: "الترخيص غير المحدود نشط",
    enableUnlimited: "تفعيل الترخيص غير المحدود",
    signedKeys: "يتم إصدار مفاتيح الترخيص الموقعة بواسطة أداة المطور غير المتصلة.",
    developerPassword: "كلمة مرور المطور:",
    incorrectPassword: "كلمة المرور غير صحيحة.",
  },
  zh: {
    transferBackup: "钱包备份传输 EXE",
    backupTitle: "钱包备份",
    workingWallets: "运行中的钱包",
    done: "已完成",
    unlimitedActive: "无限许可证已激活",
    enableUnlimited: "启用无限许可证",
    signedKeys: "签名许可证密钥由离线开发者工具生成。",
    developerPassword: "开发者密码：",
    incorrectPassword: "密码不正确。",
  },
  id: {
    transferBackup: "EXE TRANSFER CADANGAN DOMPET",
    backupTitle: "CADANGAN DOMPET",
    workingWallets: "DOMPET YANG BERJALAN",
    done: "SELESAI",
    unlimitedActive: "LISENSI TANPA BATAS AKTIF",
    enableUnlimited: "AKTIFKAN LISENSI TANPA BATAS",
    signedKeys: "Kunci lisensi bertanda tangan diterbitkan oleh alat pengembang offline.",
    developerPassword: "Kata sandi pengembang:",
    incorrectPassword: "Kata sandi salah.",
  },
} as const;

const I18N = {
  en: {
    subtitle: "Concurrent Multi-Wallet Mining Farm",
    savedWallets: "SAVED WALLETS",
    configuredAccounts: "Configured accounts",
    running: "RUNNING",
    activeWorkers: "Active workers",
    accepted: "ACCEPTED",
    rejected: "REJECTED",
    currentSession: "Current app session",
    dailyEpoch: "DAILY EPOCH",
    estimatedEnd: "EST. END",
    remaining: "REMAINING",
    hour1: "1 HOUR",
    hours24: "24 HOURS",
    days30: "30 DAYS",
    startAll: "START ALL",
    stopAll: "STOP ALL",
    addWallet: "ADD WALLET",
    log: "LOG",
    balance: "BALANCE",
    totalBalance: "TOTAL NACKL",
    min5: "5 MIN",
    epoch: "EPOCH",
    session: "SESSION",
    noWallets: "No saved wallets.",
    about: "ABOUT CAPPACKIMINER",
    developer: "Developer",
    telegram: "Telegram",
    wallet: "Acki Nacki Wallet",
    madeIn: "Made in Türkiye",
    language: "LANGUAGE",
    window: "WINDOW",
    minimize: "Minimize",
    maximize: "Maximize / Restore",
    hideTray: "Hide to system tray",
    close: "CLOSE CAPPACKIMINER",
    closeConfirm: "Close CappAckiMiner completely?",
    openingSize: "OPENING WINDOW SIZE",
    width: "Width",
    height: "Height",
    applySize: "Apply and save",
    restoreOpeningSize: "Restore opening size",
    theme: "Theme",
    reconnect: "Reconnect with QR",
    removeWallet: "Remove wallet",
    ready: "READY",
    computing: "COMPUTING",
    recovering: "RECOVERING",
    starting: "STARTING",
    stopped: "STOPPED",
    waiting: "WAITING",
    finished: "FINISHED",
    error: "ERROR",
    recoveryFailed: "RECOVERY FAILED",
    networkRejected: "NETWORK REJECTED",
  },
  tr: {
    subtitle: "Eşzamanlı Çoklu Cüzdan Mining Çiftliği",
    savedWallets: "KAYITLI CÜZDAN",
    configuredAccounts: "Yapılandırılmış hesaplar",
    running: "ÇALIŞAN",
    activeWorkers: "Aktif çalışanlar",
    accepted: "KABUL",
    rejected: "RED",
    currentSession: "Mevcut uygulama oturumu",
    dailyEpoch: "GÜNLÜK EPOCH",
    estimatedEnd: "TAHMİNİ BİTİŞ",
    remaining: "KALAN",
    hour1: "1 SAAT",
    hours24: "24 SAAT",
    days30: "30 GÜN",
    startAll: "TÜMÜNÜ BAŞLAT",
    stopAll: "TÜMÜNÜ DURDUR",
    addWallet: "CÜZDAN EKLE",
    log: "KAYITLAR",
    balance: "BAKİYE",
    totalBalance: "TOPLAM NACKL",
    min5: "5 DK",
    epoch: "EPOCH",
    session: "OTURUM",
    noWallets: "Kayıtlı cüzdan yok.",
    about: "CAPPACKIMINER HAKKINDA",
    developer: "Geliştirici",
    telegram: "Telegram",
    wallet: "Acki Nacki Cüzdanı",
    madeIn: "Türkiye'de üretildi",
    language: "DİL",
    window: "PENCERE",
    minimize: "Küçült",
    maximize: "Büyüt / Geri al",
    hideTray: "Sistem tepsisine gizle",
    close: "CAPPACKIMINER'I KAPAT",
    closeConfirm: "CappAckiMiner tamamen kapatılsın mı?",
    openingSize: "AÇILIŞ PENCERE BOYUTU",
    width: "Genişlik",
    height: "Yükseklik",
    applySize: "Uygula ve kaydet",
    restoreOpeningSize: "Açılış boyutuna dön",
    theme: "Tema",
    reconnect: "QR ile yeniden bağla",
    removeWallet: "Cüzdanı kaldır",
    ready: "HAZIR",
    computing: "HESAPLIYOR",
    recovering: "KURTARILIYOR",
    starting: "BAŞLIYOR",
    stopped: "DURDU",
    waiting: "BEKLİYOR",
    finished: "TAMAMLANDI",
    error: "HATA",
    recoveryFailed: "KURTARMA BAŞARISIZ",
    networkRejected: "AĞ TARAFINDAN RED",
  },
  ru: {
    subtitle: "Ферма одновременного майнинга нескольких кошельков",
    savedWallets: "КОШЕЛЬКИ",
    configuredAccounts: "Настроенные аккаунты",
    running: "РАБОТАЮТ",
    activeWorkers: "Активные процессы",
    accepted: "ПРИНЯТО",
    rejected: "ОТКЛОНЕНО",
    currentSession: "Текущая сессия приложения",
    dailyEpoch: "СУТОЧНАЯ ЭПОХА",
    estimatedEnd: "КОНЕЦ",
    remaining: "ОСТАЛОСЬ",
    hour1: "1 ЧАС",
    hours24: "24 ЧАСА",
    days30: "30 ДНЕЙ",
    startAll: "ЗАПУСТИТЬ ВСЕ",
    stopAll: "ОСТАНОВИТЬ ВСЕ",
    addWallet: "ДОБАВИТЬ",
    log: "ЖУРНАЛ",
    balance: "БАЛАНС",
    totalBalance: "ВСЕГО NACKL",
    min5: "5 МИН",
    epoch: "ЭПОХА",
    session: "СЕССИЯ",
    noWallets: "Нет сохранённых кошельков.",
    about: "О CAPPACKIMINER",
    developer: "Разработчик",
    telegram: "Telegram",
    wallet: "Кошелёк Acki Nacki",
    madeIn: "Сделано в Турции",
    language: "ЯЗЫК",
    window: "ОКНО",
    minimize: "Свернуть",
    maximize: "Развернуть / Восстановить",
    hideTray: "Скрыть в системный трей",
    close: "ЗАКРЫТЬ CAPPACKIMINER",
    closeConfirm: "Полностью закрыть CappAckiMiner?",
    openingSize: "РАЗМЕР ОКНА ПРИ ЗАПУСКЕ",
    width: "Ширина",
    height: "Высота",
    applySize: "Применить и сохранить",
    restoreOpeningSize: "Вернуть размер запуска",
    theme: "Тема",
    reconnect: "Подключить снова по QR",
    removeWallet: "Удалить кошелёк",
    ready: "ГОТОВ",
    computing: "ВЫЧИСЛЕНИЕ",
    recovering: "ВОССТАНОВЛЕНИЕ",
    starting: "ЗАПУСК",
    stopped: "ОСТАНОВЛЕН",
    waiting: "ОЖИДАНИЕ",
    finished: "ЗАВЕРШЕНО",
    error: "ОШИБКА",
    recoveryFailed: "СБОЙ ВОССТАНОВЛЕНИЯ",
    networkRejected: "ОТКЛОНЕНО СЕТЬЮ",
  },
  ar: {
    subtitle: "منصة تعدين متزامن لعدة محافظ",
    savedWallets: "المحافظ",
    configuredAccounts: "الحسابات المُعدّة",
    running: "قيد التشغيل",
    activeWorkers: "العمليات النشطة",
    accepted: "مقبول",
    rejected: "مرفوض",
    currentSession: "جلسة التطبيق الحالية",
    dailyEpoch: "الحقبة اليومية",
    estimatedEnd: "النهاية المتوقعة",
    remaining: "المتبقي",
    hour1: "ساعة",
    hours24: "24 ساعة",
    days30: "30 يوماً",
    startAll: "تشغيل الكل",
    stopAll: "إيقاف الكل",
    addWallet: "إضافة محفظة",
    log: "السجل",
    balance: "الرصيد",
    totalBalance: "إجمالي NACKL",
    min5: "5 دقائق",
    epoch: "الحقبة",
    session: "الجلسة",
    noWallets: "لا توجد محافظ محفوظة.",
    about: "حول CAPPACKIMINER",
    developer: "المطور",
    telegram: "تيليغرام",
    wallet: "محفظة Acki Nacki",
    madeIn: "صُنع في تركيا",
    language: "اللغة",
    window: "النافذة",
    minimize: "تصغير",
    maximize: "تكبير / استعادة",
    hideTray: "إخفاء في شريط النظام",
    close: "إغلاق CAPPACKIMINER",
    closeConfirm: "هل تريد إغلاق CappAckiMiner بالكامل؟",
    openingSize: "حجم نافذة بدء التشغيل",
    width: "العرض",
    height: "الارتفاع",
    applySize: "تطبيق وحفظ",
    restoreOpeningSize: "استعادة حجم بدء التشغيل",
    theme: "السمة",
    reconnect: "إعادة الربط عبر QR",
    removeWallet: "إزالة المحفظة",
    ready: "جاهز",
    computing: "قيد الحساب",
    recovering: "قيد الاستعادة",
    starting: "بدء",
    stopped: "متوقف",
    waiting: "انتظار",
    finished: "مكتمل",
    error: "خطأ",
    recoveryFailed: "فشل الاستعادة",
    networkRejected: "رفضته الشبكة",
  },
  zh: {
    subtitle: "并发多钱包挖矿平台",
    savedWallets: "已保存钱包",
    configuredAccounts: "已配置账户",
    running: "运行中",
    activeWorkers: "活动进程",
    accepted: "已接受",
    rejected: "已拒绝",
    currentSession: "当前应用会话",
    dailyEpoch: "每日周期",
    estimatedEnd: "预计结束",
    remaining: "剩余",
    hour1: "1 小时",
    hours24: "24 小时",
    days30: "30 天",
    startAll: "全部启动",
    stopAll: "全部停止",
    addWallet: "添加钱包",
    log: "日志",
    balance: "余额",
    totalBalance: "NACKL 总额",
    min5: "5 分钟",
    epoch: "周期",
    session: "会话",
    noWallets: "没有已保存的钱包。",
    about: "关于 CAPPACKIMINER",
    developer: "开发者",
    telegram: "Telegram",
    wallet: "Acki Nacki 钱包",
    madeIn: "土耳其制造",
    language: "语言",
    window: "窗口",
    minimize: "最小化",
    maximize: "最大化 / 还原",
    hideTray: "隐藏到系统托盘",
    close: "关闭 CAPPACKIMINER",
    closeConfirm: "完全关闭 CappAckiMiner？",
    openingSize: "启动窗口尺寸",
    width: "宽度",
    height: "高度",
    applySize: "应用并保存",
    restoreOpeningSize: "恢复启动尺寸",
    theme: "主题",
    reconnect: "使用二维码重新连接",
    removeWallet: "移除钱包",
    ready: "就绪",
    computing: "计算中",
    recovering: "恢复中",
    starting: "启动中",
    stopped: "已停止",
    waiting: "等待中",
    finished: "已完成",
    error: "错误",
    recoveryFailed: "恢复失败",
    networkRejected: "网络拒绝",
  },
  id: {
    subtitle: "Farm Mining Multi-Dompet Serentak",
    savedWallets: "DOMPET TERSIMPAN",
    configuredAccounts: "Akun terkonfigurasi",
    running: "BERJALAN",
    activeWorkers: "Proses aktif",
    accepted: "DITERIMA",
    rejected: "DITOLAK",
    currentSession: "Sesi aplikasi saat ini",
    dailyEpoch: "EPOCH HARIAN",
    estimatedEnd: "PERKIRAAN SELESAI",
    remaining: "TERSISA",
    hour1: "1 JAM",
    hours24: "24 JAM",
    days30: "30 HARI",
    startAll: "MULAI SEMUA",
    stopAll: "HENTIKAN SEMUA",
    addWallet: "TAMBAH DOMPET",
    log: "LOG",
    balance: "SALDO",
    totalBalance: "TOTAL NACKL",
    min5: "5 MENIT",
    epoch: "EPOCH",
    session: "SESI",
    noWallets: "Belum ada dompet tersimpan.",
    about: "TENTANG CAPPACKIMINER",
    developer: "Pengembang",
    telegram: "Telegram",
    wallet: "Dompet Acki Nacki",
    madeIn: "Dibuat di Türkiye",
    language: "BAHASA",
    window: "JENDELA",
    minimize: "Minimalkan",
    maximize: "Maksimalkan / Pulihkan",
    hideTray: "Sembunyikan ke tray sistem",
    close: "TUTUP CAPPACKIMINER",
    closeConfirm: "Tutup CappAckiMiner sepenuhnya?",
    openingSize: "UKURAN JENDELA SAAT MULAI",
    width: "Lebar",
    height: "Tinggi",
    applySize: "Terapkan dan simpan",
    restoreOpeningSize: "Kembali ke ukuran awal",
    theme: "Tema",
    reconnect: "Hubungkan ulang dengan QR",
    removeWallet: "Hapus dompet",
    ready: "SIAP",
    computing: "MENGHITUNG",
    recovering: "MEMULIHKAN",
    starting: "MEMULAI",
    stopped: "BERHENTI",
    waiting: "MENUNGGU",
    finished: "SELESAI",
    error: "ERROR",
    recoveryFailed: "PEMULIHAN GAGAL",
    networkRejected: "DITOLAK JARINGAN",
  },
} as const;

const UI_I18N = {
  en: {
    licensePackages: "LICENSE PACKAGES",
    adminShort: "ADMIN",
    developerShort: "DEVELOPER",
    licenseRuntimeNote: "Licenses provide up to 720 hours of mining runtime.",
    walletUnit: "WALLET",
    walletsUnit: "WALLETS",
    freeDonation: "FREE / DONATION",
    custom: "CUSTOM",
    networkTitle: "ACKI NACKI NETWORK",
    sdkEpochRemaining: "SDK EPOCH REMAINING",
    syncing: "SYNCING",
    mainMode: "MAIN MODE",
    liteMode: "LITE MODE",
    switching: "SWITCHING…",
    switchToMain: "Switch to Main mode",
    switchToLite: "Switch to Lite mode",
    systemMonitor: "System monitor",
    help: "HELP",
    shapeRound: "Round Soft",
    shapeTechnical: "Technical",
    cpu: "CPU",
    temp: "TEMP",
    tps: "TPS",
    stress: "STRESS",
    stressLow: "LOW",
    stressMedium: "MEDIUM",
    stressHigh: "HIGH",
    stressUnknown: "UNKNOWN",
    uiShape: "UI SHAPE",
    uiShapeNote: "Changes geometry; your Theme and Skin remain active.",
    disableAnimations: "DISABLE ALL ANIMATIONS",
    enableAnimations: "ENABLE ALL ANIMATIONS",
    autoRecovery: "AUTO RECOVERY",
    enabled: "ENABLED",
    disabled: "DISABLED",
    lastCheck: "Last check",
    checking: "checking",
    dailyNackl: "DAILY NACKL",
    total24h: "24H TOTAL",
    refreshing: "refreshing",
    search: "SEARCH",
    walletSearchPlaceholder: "Wallet name or address",
    status: "STATUS",
    all: "All",
    errorUnknown: "Error / Unknown",
    walletStatus: "WALLET / STATUS",
    balanceReward: "BALANCE / REWARD",
    results: "RESULTS",
    actions: "ACTIONS",
    total: "TOTAL",
    balanceSort: "BALANCE ↓",
    balanceSortEnable: "Sort by balance, highest first",
    balanceSortDisable: "Disable balance sorting",
    latestReward: "Latest reward",
    noRewardYet: "No reward received for this wallet yet",
    noReward: "NO REWARD",
    noFilterMatches: "No wallets match the current search or status filter.",
    rewardChecking: "REWARD CHECKING…",
    themeSelection: "THEME SELECTION",
    mainThemeSelection: "MAIN THEME SELECTION",
    liteThemeSelection: "LITE THEME SELECTION",
    reconnectWallet: "RECONNECT WALLET",
    addWalletIntro: "Enter the AN Wallet account name, then scan the authorization QR and approve it.",
    verifyMiningKey: "VERIFY MINING KEY",
    verifyOn: "On — secure connection check",
    verifyOff: "Off — verification skipped",
    walletAccountName: "Wallet account name",
    waitingApproval: "WAITING FOR APPROVAL…",
    addWalletQr: "ADD WALLET QR",
    scanWith: "SCAN WITH",
    waitingQrApproval: "WAITING FOR QR SCAN AND WALLET APPROVAL",
    walletIdentified: "WALLET IDENTIFIED",
    verifyingMiningKey: "VERIFYING MINING KEY",
    approveMiningKey: "SCAN QR AND APPROVE THE MINING KEY IN AN WALLET",
    copyLink: "COPY LINK",
    entries: "entries",
    saveLog: "SAVE LOG",
    openLogFolder: "OPEN LOG FOLDER",
    clearLog: "CLEAR LOG",
    adminPanel: "ADMIN PANEL",
    developerPanel: "DEVELOPER PANEL",
    startWallet: "Start wallet",
    stopWallet: "Stop wallet",
    setActiveView: "Set as active view",
    removeConfirm: "Are you sure you want to remove this wallet?",
    removeConfirmDetail: "This removes only the saved wallet profile from the application.",
    openBackupLocation: "Open backup location",
  },
  tr: {
    licensePackages: "LİSANS PAKETLERİ",
    adminShort: "YÖNETİCİ",
    developerShort: "GELİŞTİRİCİ",
    licenseRuntimeNote: "Lisanslar en fazla 720 saat mining çalışma süresi sağlar.",
    walletUnit: "CÜZDAN",
    walletsUnit: "CÜZDAN",
    freeDonation: "ÜCRETSİZ / BAĞIŞ",
    custom: "ÖZEL",
    networkTitle: "ACKI NACKI AĞI",
    sdkEpochRemaining: "SDK EPOCH KALAN",
    syncing: "SENKRONİZE EDİLİYOR",
    mainMode: "MAIN MOD",
    liteMode: "LITE MOD",
    switching: "GEÇİŞ YAPILIYOR…",
    switchToMain: "Main moda geç",
    switchToLite: "Lite moda geç",
    systemMonitor: "Sistem göstergeleri",
    help: "YARDIM",
    shapeRound: "Yuvarlak Yumuşak",
    shapeTechnical: "Teknik",
    cpu: "CPU",
    temp: "SICAKLIK",
    tps: "TPS",
    stress: "STRES",
    stressLow: "DÜŞÜK",
    stressMedium: "ORTA",
    stressHigh: "YÜKSEK",
    stressUnknown: "BİLİNMİYOR",
    uiShape: "ARAYÜZ ŞEKLİ",
    uiShapeNote: "Geometriyi değiştirir; Tema ve Skin seçimin korunur.",
    disableAnimations: "TÜM ANİMASYONLARI KAPAT",
    enableAnimations: "TÜM ANİMASYONLARI AÇ",
    autoRecovery: "OTOMATİK KURTARMA",
    enabled: "AÇIK",
    disabled: "KAPALI",
    lastCheck: "Son kontrol",
    checking: "kontrol ediliyor",
    dailyNackl: "GÜNLÜK NACKL",
    total24h: "24S TOPLAM",
    refreshing: "yenileniyor",
    search: "ARA",
    walletSearchPlaceholder: "Cüzdan adı veya adresi",
    status: "DURUM",
    all: "Tümü",
    errorUnknown: "Hata / Bilinmiyor",
    walletStatus: "CÜZDAN / DURUM",
    balanceReward: "BAKİYE / ÖDÜL",
    results: "SONUÇLAR",
    actions: "İŞLEMLER",
    total: "TOPLAM",
    balanceSort: "BAKİYE ↓",
    balanceSortEnable: "Bakiyeye göre büyükten küçüğe sırala",
    balanceSortDisable: "Bakiye sıralamasını kapat",
    latestReward: "Son gelen ödül",
    noRewardYet: "Bu cüzdana henüz ödül gelmedi",
    noReward: "ÖDÜL YOK",
    noFilterMatches: "Arama veya durum filtresine uyan cüzdan yok.",
    rewardChecking: "ÖDÜL KONTROL EDİLİYOR…",
    themeSelection: "TEMA SEÇİMİ",
    mainThemeSelection: "MAIN TEMA SEÇİMİ",
    liteThemeSelection: "LITE TEMA SEÇİMİ",
    reconnectWallet: "CÜZDANI YENİDEN BAĞLA",
    addWalletIntro: "AN Wallet hesap adını girin, yetkilendirme QR kodunu okutun ve onaylayın.",
    verifyMiningKey: "MINING ANAHTARINI DOĞRULA",
    verifyOn: "Açık — güvenli bağlantı kontrolü",
    verifyOff: "Kapalı — doğrulama atlanır",
    walletAccountName: "Cüzdan hesap adı",
    waitingApproval: "ONAY BEKLENİYOR…",
    addWalletQr: "CÜZDAN QR'I EKLE",
    scanWith: "ŞUNUNLA TARA",
    waitingQrApproval: "QR TARAMASI VE CÜZDAN ONAYI BEKLENİYOR",
    walletIdentified: "CÜZDAN TANINDI",
    verifyingMiningKey: "MINING ANAHTARI DOĞRULANIYOR",
    approveMiningKey: "QR'I TARAYIN VE AN WALLET'TA MINING ANAHTARINI ONAYLAYIN",
    copyLink: "BAĞLANTIYI KOPYALA",
    entries: "kayıt",
    saveLog: "LOGU KAYDET",
    openLogFolder: "LOG KLASÖRÜNÜ AÇ",
    clearLog: "LOGU TEMİZLE",
    adminPanel: "YÖNETİCİ PANELİ",
    developerPanel: "GELİŞTİRİCİ PANELİ",
    startWallet: "Cüzdanı başlat",
    stopWallet: "Cüzdanı durdur",
    setActiveView: "Etkin görünüm yap",
    removeConfirm: "Bu cüzdanı kaldırmak istediğinize emin misiniz?",
    removeConfirmDetail: "Yalnızca uygulamadaki kayıtlı cüzdan profili kaldırılır.",
    openBackupLocation: "Yedek konumunu aç",
  },
  ru: {
    licensePackages: "ПАКЕТЫ ЛИЦЕНЗИЙ",
    adminShort: "АДМИН",
    developerShort: "РАЗРАБОТЧИК",
    licenseRuntimeNote: "Лицензии предоставляют до 720 часов работы майнинга.",
    walletUnit: "КОШЕЛЁК",
    walletsUnit: "КОШЕЛЬКОВ",
    freeDonation: "БЕСПЛАТНО / ПОЖЕРТВОВАНИЕ",
    custom: "ИНДИВИДУАЛЬНО",
    networkTitle: "СЕТЬ ACKI NACKI",
    sdkEpochRemaining: "ДО КОНЦА ЭПОХИ SDK",
    syncing: "СИНХРОНИЗАЦИЯ",
    mainMode: "РЕЖИМ MAIN",
    liteMode: "РЕЖИМ LITE",
    switching: "ПЕРЕКЛЮЧЕНИЕ…",
    switchToMain: "Перейти в режим Main",
    switchToLite: "Перейти в режим Lite",
    systemMonitor: "Системные показатели",
    help: "ПОМОЩЬ",
    shapeRound: "Мягкая округлая",
    shapeTechnical: "Техническая",
    cpu: "ЦП",
    temp: "ТЕМП.",
    tps: "TPS",
    stress: "НАГРУЗКА",
    stressLow: "НИЗКАЯ",
    stressMedium: "СРЕДНЯЯ",
    stressHigh: "ВЫСОКАЯ",
    stressUnknown: "НЕИЗВЕСТНО",
    uiShape: "ФОРМА ИНТЕРФЕЙСА",
    uiShapeNote: "Меняет геометрию; выбранные тема и оформление сохраняются.",
    disableAnimations: "ОТКЛЮЧИТЬ ВСЕ АНИМАЦИИ",
    enableAnimations: "ВКЛЮЧИТЬ ВСЕ АНИМАЦИИ",
    autoRecovery: "АВТОВОССТАНОВЛЕНИЕ",
    enabled: "ВКЛЮЧЕНО",
    disabled: "ВЫКЛЮЧЕНО",
    lastCheck: "Последняя проверка",
    checking: "проверка",
    dailyNackl: "NACKL ЗА СУТКИ",
    total24h: "ИТОГО ЗА 24 Ч",
    refreshing: "обновление",
    search: "ПОИСК",
    walletSearchPlaceholder: "Имя или адрес кошелька",
    status: "СТАТУС",
    all: "Все",
    errorUnknown: "Ошибка / Неизвестно",
    walletStatus: "КОШЕЛЁК / СТАТУС",
    balanceReward: "БАЛАНС / НАГРАДА",
    results: "РЕЗУЛЬТАТЫ",
    actions: "ДЕЙСТВИЯ",
    total: "ВСЕГО",
    balanceSort: "БАЛАНС ↓",
    balanceSortEnable: "Сортировать по убыванию баланса",
    balanceSortDisable: "Отключить сортировку по балансу",
    latestReward: "Последняя награда",
    noRewardYet: "На этот кошелёк ещё не поступала награда",
    noReward: "НЕТ НАГРАДЫ",
    noFilterMatches: "Нет кошельков, соответствующих поиску или фильтру.",
    rewardChecking: "ПРОВЕРКА НАГРАДЫ…",
    themeSelection: "ВЫБОР ТЕМЫ",
    mainThemeSelection: "ВЫБОР ТЕМЫ MAIN",
    liteThemeSelection: "ВЫБОР ТЕМЫ LITE",
    reconnectWallet: "ПЕРЕПОДКЛЮЧИТЬ КОШЕЛЁК",
    addWalletIntro: "Введите имя аккаунта AN Wallet, отсканируйте QR-код авторизации и подтвердите его.",
    verifyMiningKey: "ПРОВЕРИТЬ КЛЮЧ МАЙНИНГА",
    verifyOn: "Вкл. — безопасная проверка соединения",
    verifyOff: "Выкл. — проверка пропущена",
    walletAccountName: "Имя аккаунта кошелька",
    waitingApproval: "ОЖИДАНИЕ ПОДТВЕРЖДЕНИЯ…",
    addWalletQr: "ДОБАВИТЬ КОШЕЛЁК ПО QR",
    scanWith: "СКАНИРОВАТЬ ЧЕРЕЗ",
    waitingQrApproval: "ОЖИДАНИЕ СКАНИРОВАНИЯ QR И ПОДТВЕРЖДЕНИЯ",
    walletIdentified: "КОШЕЛЁК РАСПОЗНАН",
    verifyingMiningKey: "ПРОВЕРКА КЛЮЧА МАЙНИНГА",
    approveMiningKey: "ОТСКАНИРУЙТЕ QR И ПОДТВЕРДИТЕ КЛЮЧ В AN WALLET",
    copyLink: "КОПИРОВАТЬ ССЫЛКУ",
    entries: "записей",
    saveLog: "СОХРАНИТЬ ЖУРНАЛ",
    openLogFolder: "ОТКРЫТЬ ПАПКУ ЖУРНАЛА",
    clearLog: "ОЧИСТИТЬ ЖУРНАЛ",
    adminPanel: "ПАНЕЛЬ АДМИНИСТРАТОРА",
    developerPanel: "ПАНЕЛЬ РАЗРАБОТЧИКА",
    startWallet: "Запустить кошелёк",
    stopWallet: "Остановить кошелёк",
    setActiveView: "Сделать активным",
    removeConfirm: "Удалить этот кошелёк?",
    removeConfirmDetail: "Будет удалён только сохранённый профиль кошелька в приложении.",
    openBackupLocation: "Открыть расположение резервной копии",
  },
  ar: {
    licensePackages: "حزم التراخيص",
    adminShort: "المسؤول",
    developerShort: "المطور",
    licenseRuntimeNote: "توفر التراخيص ما يصل إلى 720 ساعة من وقت تشغيل التعدين.",
    walletUnit: "محفظة",
    walletsUnit: "محافظ",
    freeDonation: "مجاني / تبرع",
    custom: "مخصص",
    networkTitle: "شبكة ACKI NACKI",
    sdkEpochRemaining: "المتبقي من حقبة SDK",
    syncing: "جارٍ التزامن",
    mainMode: "الوضع الرئيسي",
    liteMode: "الوضع الخفيف",
    switching: "جارٍ التبديل…",
    switchToMain: "التبديل إلى الوضع الرئيسي",
    switchToLite: "التبديل إلى الوضع الخفيف",
    systemMonitor: "مؤشرات النظام",
    help: "مساعدة",
    shapeRound: "دائري ناعم",
    shapeTechnical: "تقني",
    cpu: "المعالج",
    temp: "الحرارة",
    tps: "TPS",
    stress: "ضغط الشبكة",
    stressLow: "منخفض",
    stressMedium: "متوسط",
    stressHigh: "مرتفع",
    stressUnknown: "غير معروف",
    uiShape: "شكل الواجهة",
    uiShapeNote: "يغير الشكل الهندسي مع الاحتفاظ بالسمة والمظهر المحددين.",
    disableAnimations: "إيقاف جميع الرسوم المتحركة",
    enableAnimations: "تشغيل جميع الرسوم المتحركة",
    autoRecovery: "الاسترداد التلقائي",
    enabled: "مفعّل",
    disabled: "معطّل",
    lastCheck: "آخر فحص",
    checking: "جارٍ الفحص",
    dailyNackl: "NACKL اليومي",
    total24h: "إجمالي 24 ساعة",
    refreshing: "جارٍ التحديث",
    search: "بحث",
    walletSearchPlaceholder: "اسم المحفظة أو عنوانها",
    status: "الحالة",
    all: "الكل",
    errorUnknown: "خطأ / غير معروف",
    walletStatus: "المحفظة / الحالة",
    balanceReward: "الرصيد / المكافأة",
    results: "النتائج",
    actions: "الإجراءات",
    total: "الإجمالي",
    balanceSort: "الرصيد ↓",
    balanceSortEnable: "ترتيب حسب الرصيد من الأعلى",
    balanceSortDisable: "إيقاف ترتيب الرصيد",
    latestReward: "أحدث مكافأة",
    noRewardYet: "لم تصل مكافأة إلى هذه المحفظة بعد",
    noReward: "لا توجد مكافأة",
    noFilterMatches: "لا توجد محافظ تطابق البحث أو مرشح الحالة.",
    rewardChecking: "جارٍ فحص المكافأة…",
    themeSelection: "اختيار السمة",
    mainThemeSelection: "اختيار سمة MAIN",
    liteThemeSelection: "اختيار سمة LITE",
    reconnectWallet: "إعادة ربط المحفظة",
    addWalletIntro: "أدخل اسم حساب AN Wallet، ثم امسح رمز QR للتفويض ووافق عليه.",
    verifyMiningKey: "التحقق من مفتاح التعدين",
    verifyOn: "تشغيل — فحص اتصال آمن",
    verifyOff: "إيقاف — تم تخطي التحقق",
    walletAccountName: "اسم حساب المحفظة",
    waitingApproval: "بانتظار الموافقة…",
    addWalletQr: "إضافة المحفظة عبر QR",
    scanWith: "امسح باستخدام",
    waitingQrApproval: "بانتظار مسح QR وموافقة المحفظة",
    walletIdentified: "تم التعرف على المحفظة",
    verifyingMiningKey: "جارٍ التحقق من مفتاح التعدين",
    approveMiningKey: "امسح QR ووافق على المفتاح في AN WALLET",
    copyLink: "نسخ الرابط",
    entries: "إدخالات",
    saveLog: "حفظ السجل",
    openLogFolder: "فتح مجلد السجل",
    clearLog: "مسح السجل",
    adminPanel: "لوحة المسؤول",
    developerPanel: "لوحة المطور",
    startWallet: "تشغيل المحفظة",
    stopWallet: "إيقاف المحفظة",
    setActiveView: "تعيين كعرض نشط",
    removeConfirm: "هل تريد إزالة هذه المحفظة؟",
    removeConfirmDetail: "تتم إزالة ملف المحفظة المحفوظ من التطبيق فقط.",
    openBackupLocation: "فتح موقع النسخة الاحتياطية",
  },
  zh: {
    licensePackages: "许可证套餐",
    adminShort: "管理",
    developerShort: "开发",
    licenseRuntimeNote: "许可证最多提供 720 小时的挖矿运行时间。",
    walletUnit: "个钱包",
    walletsUnit: "个钱包",
    freeDonation: "免费 / 捐赠",
    custom: "自定义",
    networkTitle: "ACKI NACKI 网络",
    sdkEpochRemaining: "SDK 周期剩余时间",
    syncing: "同步中",
    mainMode: "MAIN 模式",
    liteMode: "LITE 模式",
    switching: "正在切换…",
    switchToMain: "切换到 Main 模式",
    switchToLite: "切换到 Lite 模式",
    systemMonitor: "系统监控",
    help: "帮助",
    shapeRound: "柔和圆角",
    shapeTechnical: "技术风格",
    cpu: "CPU",
    temp: "温度",
    tps: "TPS",
    stress: "网络压力",
    stressLow: "低",
    stressMedium: "中",
    stressHigh: "高",
    stressUnknown: "未知",
    uiShape: "界面形状",
    uiShapeNote: "更改界面几何形状；保留当前主题和皮肤。",
    disableAnimations: "关闭所有动画",
    enableAnimations: "开启所有动画",
    autoRecovery: "自动恢复",
    enabled: "已启用",
    disabled: "已禁用",
    lastCheck: "上次检查",
    checking: "检查中",
    dailyNackl: "每日 NACKL",
    total24h: "24 小时总计",
    refreshing: "刷新中",
    search: "搜索",
    walletSearchPlaceholder: "钱包名称或地址",
    status: "状态",
    all: "全部",
    errorUnknown: "错误 / 未知",
    walletStatus: "钱包 / 状态",
    balanceReward: "余额 / 奖励",
    results: "结果",
    actions: "操作",
    total: "总计",
    balanceSort: "余额 ↓",
    balanceSortEnable: "按余额从高到低排序",
    balanceSortDisable: "关闭余额排序",
    latestReward: "最新奖励",
    noRewardYet: "此钱包尚未收到奖励",
    noReward: "暂无奖励",
    noFilterMatches: "没有符合当前搜索或状态筛选的钱包。",
    rewardChecking: "正在检查奖励…",
    themeSelection: "主题选择",
    mainThemeSelection: "MAIN 主题选择",
    liteThemeSelection: "LITE 主题选择",
    reconnectWallet: "重新连接钱包",
    addWalletIntro: "输入 AN Wallet 账户名，然后扫描授权二维码并确认。",
    verifyMiningKey: "验证挖矿密钥",
    verifyOn: "开启 — 安全连接检查",
    verifyOff: "关闭 — 跳过验证",
    walletAccountName: "钱包账户名",
    waitingApproval: "等待确认…",
    addWalletQr: "通过 QR 添加钱包",
    scanWith: "扫描方式",
    waitingQrApproval: "等待扫描 QR 并确认钱包",
    walletIdentified: "已识别钱包",
    verifyingMiningKey: "正在验证挖矿密钥",
    approveMiningKey: "扫描 QR 并在 AN WALLET 中确认密钥",
    copyLink: "复制链接",
    entries: "条记录",
    saveLog: "保存日志",
    openLogFolder: "打开日志文件夹",
    clearLog: "清除日志",
    adminPanel: "管理员面板",
    developerPanel: "开发者面板",
    startWallet: "启动钱包",
    stopWallet: "停止钱包",
    setActiveView: "设为当前视图",
    removeConfirm: "确定要移除此钱包吗？",
    removeConfirmDetail: "只会移除应用中保存的钱包配置。",
    openBackupLocation: "打开备份位置",
  },
  id: {
    licensePackages: "PAKET LISENSI",
    adminShort: "ADMIN",
    developerShort: "PENGEMBANG",
    licenseRuntimeNote: "Lisensi menyediakan hingga 720 jam waktu operasi mining.",
    walletUnit: "DOMPET",
    walletsUnit: "DOMPET",
    freeDonation: "GRATIS / DONASI",
    custom: "KHUSUS",
    networkTitle: "JARINGAN ACKI NACKI",
    sdkEpochRemaining: "SISA EPOCH SDK",
    syncing: "MENYINKRONKAN",
    mainMode: "MODE MAIN",
    liteMode: "MODE LITE",
    switching: "BERALIH…",
    switchToMain: "Beralih ke mode Main",
    switchToLite: "Beralih ke mode Lite",
    systemMonitor: "Monitor sistem",
    help: "BANTUAN",
    shapeRound: "Bulat Lembut",
    shapeTechnical: "Teknis",
    cpu: "CPU",
    temp: "SUHU",
    tps: "TPS",
    stress: "TEKANAN",
    stressLow: "RENDAH",
    stressMedium: "SEDANG",
    stressHigh: "TINGGI",
    stressUnknown: "TIDAK DIKETAHUI",
    uiShape: "BENTUK ANTARMUKA",
    uiShapeNote: "Mengubah geometri; Tema dan Skin yang dipilih tetap aktif.",
    disableAnimations: "NONAKTIFKAN SEMUA ANIMASI",
    enableAnimations: "AKTIFKAN SEMUA ANIMASI",
    autoRecovery: "PEMULIHAN OTOMATIS",
    enabled: "AKTIF",
    disabled: "NONAKTIF",
    lastCheck: "Pemeriksaan terakhir",
    checking: "memeriksa",
    dailyNackl: "NACKL HARIAN",
    total24h: "TOTAL 24 JAM",
    refreshing: "memperbarui",
    search: "CARI",
    walletSearchPlaceholder: "Nama atau alamat dompet",
    status: "STATUS",
    all: "Semua",
    errorUnknown: "Error / Tidak diketahui",
    walletStatus: "DOMPET / STATUS",
    balanceReward: "SALDO / HADIAH",
    results: "HASIL",
    actions: "TINDAKAN",
    total: "TOTAL",
    balanceSort: "SALDO ↓",
    balanceSortEnable: "Urutkan berdasarkan saldo tertinggi",
    balanceSortDisable: "Nonaktifkan pengurutan saldo",
    latestReward: "Hadiah terbaru",
    noRewardYet: "Belum ada hadiah yang diterima dompet ini",
    noReward: "BELUM ADA HADIAH",
    noFilterMatches: "Tidak ada dompet yang cocok dengan pencarian atau filter.",
    rewardChecking: "MEMERIKSA HADIAH…",
    themeSelection: "PILIH TEMA",
    mainThemeSelection: "PILIH TEMA MAIN",
    liteThemeSelection: "PILIH TEMA LITE",
    reconnectWallet: "HUBUNGKAN ULANG DOMPET",
    addWalletIntro: "Masukkan nama akun AN Wallet, lalu pindai QR otorisasi dan setujui.",
    verifyMiningKey: "VERIFIKASI KUNCI MINING",
    verifyOn: "Aktif — pemeriksaan koneksi aman",
    verifyOff: "Nonaktif — verifikasi dilewati",
    walletAccountName: "Nama akun dompet",
    waitingApproval: "MENUNGGU PERSETUJUAN…",
    addWalletQr: "TAMBAH DOMPET VIA QR",
    scanWith: "PINDAI DENGAN",
    waitingQrApproval: "MENUNGGU PEMINDAIAN QR DAN PERSETUJUAN DOMPET",
    walletIdentified: "DOMPET DIKENALI",
    verifyingMiningKey: "MEMVERIFIKASI KUNCI MINING",
    approveMiningKey: "PINDAI QR DAN SETUJUI KUNCI DI AN WALLET",
    copyLink: "SALIN TAUTAN",
    entries: "entri",
    saveLog: "SIMPAN LOG",
    openLogFolder: "BUKA FOLDER LOG",
    clearLog: "HAPUS LOG",
    adminPanel: "PANEL ADMIN",
    developerPanel: "PANEL PENGEMBANG",
    startWallet: "Mulai dompet",
    stopWallet: "Hentikan dompet",
    setActiveView: "Jadikan tampilan aktif",
    removeConfirm: "Yakin ingin menghapus dompet ini?",
    removeConfirmDetail: "Hanya profil dompet yang tersimpan di aplikasi yang dihapus.",
    openBackupLocation: "Buka lokasi cadangan",
  },
} as const;

type WalletProfile = {
  id: string;
  walletName: string;
  minerAddress: string;
  publicKey: string;
  secretKey: string;
  createdAt: number;
  gridSlot?: number;
  gridSpan?: 1 | 2;
};

type StoredWalletProfile = Omit<WalletProfile, "secretKey"> & {
  protectedSecretKey?: string;
  secretKey?: string;
};

function walletProfileSpan(_profile: WalletProfile): 1 | 2 {
  return 1;
}

function walletProfileSlots(
  profile: WalletProfile,
  slot = profile.gridSlot ?? 0,
): number[] {
  return Array.from(
    { length: walletProfileSpan(profile) },
    (_, index) => slot + index,
  );
}

function profileOccupyingGridSlot(
  profiles: WalletProfile[],
  slot: number,
  ignoredIds = new Set<string>(),
): WalletProfile | undefined {
  return profiles.find(
    (profile) =>
      !ignoredIds.has(profile.id) &&
      walletProfileSlots(profile).includes(slot),
  );
}

function canPlaceWalletProfile(
  profiles: WalletProfile[],
  profileId: string,
  slot: number,
  span: 1 | 2,
  additionallyIgnoredIds = new Set<string>(),
): boolean {
  const row = slot % WALLET_GRID_ROWS;

  if (row + span > WALLET_GRID_ROWS) {
    return false;
  }

  const ignoredIds = new Set(additionallyIgnoredIds);
  ignoredIds.add(profileId);

  return Array.from({ length: span }, (_, index) => slot + index).every(
    (occupiedSlot) =>
      !profileOccupyingGridSlot(profiles, occupiedSlot, ignoredIds),
  );
}

function normalizeWalletGridSlots(
  profiles: WalletProfile[],
): WalletProfile[] {
  const usedSlots = new Set<number>();

  return profiles.map((profile) => {
    const gridSpan = walletProfileSpan(profile);
    let gridSlot =
      typeof profile.gridSlot === "number" &&
      Number.isInteger(profile.gridSlot) &&
      profile.gridSlot >= 0 &&
      profile.gridSlot % WALLET_GRID_ROWS + gridSpan <= WALLET_GRID_ROWS &&
      Array.from(
        { length: gridSpan },
        (_, index) => profile.gridSlot! + index,
      ).every((slot) => !usedSlots.has(slot))
        ? profile.gridSlot
        : 0;

    while (
      gridSlot % WALLET_GRID_ROWS + gridSpan > WALLET_GRID_ROWS ||
      Array.from({ length: gridSpan }, (_, index) => gridSlot + index).some(
        (slot) => usedSlots.has(slot),
      )
    ) {
      gridSlot += 1;
    }

    Array.from({ length: gridSpan }, (_, index) => gridSlot + index).forEach(
      (slot) => usedSlots.add(slot),
    );
    return profile.gridSlot === gridSlot && profile.gridSpan === gridSpan
      ? profile
      : { ...profile, gridSlot, gridSpan };
  });
}

function firstAvailableWalletGridSlot(profiles: WalletProfile[]): number {
  const usedSlots = new Set(
    profiles.flatMap((profile) => walletProfileSlots(profile)),
  );
  let gridSlot = 0;

  while (usedSlots.has(gridSlot)) {
    gridSlot += 1;
  }

  return gridSlot;
}

function walletColumnsForCount(count: number): number {
  const safeCount = Math.max(0, count);

  return Math.max(
    WALLET_GRID_MIN_COLUMNS,
    Math.min(
      WALLET_GRID_MAX_COLUMNS,
      Math.ceil(Math.max(1, safeCount) / WALLET_GRID_ROWS),
    ),
  );
}

function walletWindowSizeForCount(count: number): {
  width: number;
  height: number;
  columns: number;
  rows: number;
} {
  const columns = walletColumnsForCount(count);
  const rows = Math.max(
    1,
    Math.min(WALLET_GRID_ROWS, Math.ceil(Math.max(1, count) / columns)),
  );

  return {
    width:
      Math.max(
        WINDOW_MIN_WIDTH,
        WALLET_LAYOUT_SIDE_SPACE + columns * WALLET_LAYOUT_CELL_WIDTH,
      ),
    height:
      Math.max(
        WINDOW_MIN_HEIGHT,
        WALLET_LAYOUT_HEADER_HEIGHT + rows * WALLET_LAYOUT_CELL_HEIGHT,
      ),
    columns,
    rows,
  };
}

async function fitWindowToWalletLayout(count: number): Promise<void> {
  const appWindow = getCurrentWindow();
  const desired = walletWindowSizeForCount(count);

  try {
    const monitor = await currentMonitor();
    const workArea = monitor?.workArea.size.toLogical(monitor.scaleFactor);
    const availableWidth = Math.max(
      840,
      (workArea?.width ?? desired.width) - 16,
    );
    const availableHeight = Math.max(
      560,
      (workArea?.height ?? desired.height) - 16,
    );
    const width = Math.min(desired.width, availableWidth);
    const height = Math.min(desired.height, availableHeight);

    await appWindow.setResizable(true);
    await appWindow.setSize(new LogicalSize(width, height));
    await appWindow.center();
  } catch (error) {
    console.warn("Window auto-fit failed:", error);
  }
}


function walletSwayRandom(gridSlot: number, salt: number): number {
  const value = Math.sin(
    (gridSlot + 1) * 91.731 +
      (salt + 1) * 47.293 +
      WALLET_SWAY_SESSION_SEED * 0.017,
  ) * 43_758.5453;

  return value - Math.floor(value);
}

function currentWalletGridColumns(): number {
  if (window.innerWidth >= WALLET_GRID_WIDE_BREAKPOINT_PX) {
    return WALLET_GRID_WIDE_COLUMNS;
  }

  if (window.innerWidth >= WALLET_GRID_MEDIUM_BREAKPOINT_PX) {
    return WALLET_GRID_MEDIUM_COLUMNS;
  }

  return WALLET_GRID_COMPACT_COLUMNS;
}

function walletGridPosition(
  gridSlot: number,
  gridColumns = currentWalletGridColumns(),
  gridSpan: 1 | 2 = 1,
): CSSProperties {
  const column = Math.floor(gridSlot / WALLET_GRID_ROWS);
  const row = gridSlot % WALLET_GRID_ROWS;
  const seedA = walletSwayRandom(gridSlot, 0);
  const seedB = walletSwayRandom(gridSlot, 1);
  const seedC = walletSwayRandom(gridSlot, 2);
  const seedD = walletSwayRandom(gridSlot, 3);
  const seedE = walletSwayRandom(gridSlot, 4);
  const seedF = walletSwayRandom(gridSlot, 5);
  const leftReach =
    (column === 0 ? 7 + seedA * 4 : 19 + seedA * 6) * 0.72;
  const rightReach =
    (column === gridColumns - 1
      ? 7 + seedB * 4
      : 19 + seedB * 6) * 0.72;
  const upwardReach =
    (row === 0 ? 4 + seedC * 4 : 8 + seedC * 6) * 0.72;
  const downwardReach =
    (row === WALLET_GRID_ROWS - 1
      ? 4 + seedD * 4
      : 8 + seedD * 6) * 0.72;
  const raftPoint = (salt: number) => {
    const angle = walletSwayRandom(gridSlot, salt) * Math.PI * 2;
    const distance =
      (4 + walletSwayRandom(gridSlot, salt + 20) * 3.5) * 0.72;
    let x = Math.cos(angle) * distance;
    let y = Math.sin(angle) * distance * 0.78;

    // Boundary cards still roam in every direction, but spend more of their
    // travel inside the field where neighbouring raft contacts are visible.
    if ((column === 0 && x < 0) ||
        (column === gridColumns - 1 && x > 0)) {
      x *= 0.46;
    }
    if ((row === 0 && y < 0) ||
        (row === WALLET_GRID_ROWS - 1 && y > 0)) {
      y *= 0.50;
    }

    return {
      x: `${x.toFixed(2)}px`,
      y: `${y.toFixed(2)}px`,
      rotation: `${((-0.72 + walletSwayRandom(gridSlot, salt + 40) * 1.44) * 0.72).toFixed(3)}deg`,
    };
  };
  const raftPoints = Array.from({ length: 6 }, (_, index) =>
    raftPoint(6 + index),
  );

  return {
    gridColumn: Math.floor(gridSlot / WALLET_GRID_ROWS) + 1,
    gridRow: (gridSlot % WALLET_GRID_ROWS) + 1,
    gridRowEnd: `span ${gridSpan}`,
    "--wallet-sway-left": `${-leftReach.toFixed(2)}px`,
    "--wallet-sway-right": `${rightReach.toFixed(2)}px`,
    "--wallet-sway-y-a": `${-upwardReach.toFixed(2)}px`,
    "--wallet-sway-y-b": `${downwardReach.toFixed(2)}px`,
    "--wallet-sway-rot-a": `${(-(1.08 + seedE * 0.78) * 0.72).toFixed(3)}deg`,
    "--wallet-sway-rot-b": `${((0.96 + seedF * 0.88) * 0.72).toFixed(3)}deg`,
    "--wallet-sway-duration": `${((7.40 + seedC * 2.70) / 0.72).toFixed(2)}s`,
    "--wallet-sway-delay": `${-(seedD * 5.7 + gridSlot * 0.23).toFixed(2)}s`,
    "--wallet-sway-origin": `${(30 + seedA * 40).toFixed(1)}% ${(32 + seedB * 42).toFixed(1)}%`,
    "--wallet-impact-brightness": `${(1.10 + seedE * 0.10).toFixed(3)}`,
    "--wallet-water-glint-duration": `${(11.5 + seedF * 6.5).toFixed(2)}s`,
    "--wallet-water-glint-delay": `${-(seedA * 6.2 + gridSlot * 0.31).toFixed(2)}s`,
    "--wallet-water-glint-tilt": `${(-9 + seedD * 18).toFixed(2)}deg`,
    "--wallet-raft-x1": raftPoints[0].x,
    "--wallet-raft-y1": raftPoints[0].y,
    "--wallet-raft-r1": raftPoints[0].rotation,
    "--wallet-raft-x2": raftPoints[1].x,
    "--wallet-raft-y2": raftPoints[1].y,
    "--wallet-raft-r2": raftPoints[1].rotation,
    "--wallet-raft-x3": raftPoints[2].x,
    "--wallet-raft-y3": raftPoints[2].y,
    "--wallet-raft-r3": raftPoints[2].rotation,
    "--wallet-raft-x4": raftPoints[3].x,
    "--wallet-raft-y4": raftPoints[3].y,
    "--wallet-raft-r4": raftPoints[3].rotation,
    "--wallet-raft-x5": raftPoints[4].x,
    "--wallet-raft-y5": raftPoints[4].y,
    "--wallet-raft-r5": raftPoints[4].rotation,
    "--wallet-raft-x6": raftPoints[5].x,
    "--wallet-raft-y6": raftPoints[5].y,
    "--wallet-raft-r6": raftPoints[5].rotation,
  } as CSSProperties;
}

type PortfolioIncomeState = {
  hourly: string;
  daily: string;
  weekly: string;
  monthly: string;
  loading: boolean;
  updatedAt: string;
};

type BalanceIncomeEvent = {
  at: number;
  raw: string;
};

type BalanceIncomeWallet = {
  lastRaw: string;
  lastCheckedAt: number;
  events: BalanceIncomeEvent[];
};

type BalanceIncomeLedger = Record<string, BalanceIncomeWallet>;

function normalizeBalanceIncomeLedger(value: unknown): BalanceIncomeLedger {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const cutoff = Date.now() - ROLLING_24H_MS;
  const normalized: BalanceIncomeLedger = {};

  for (const [profileId, rawEntry] of Object.entries(value)) {
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
      continue;
    }

    const entry = rawEntry as Partial<BalanceIncomeWallet>;
    const events: BalanceIncomeEvent[] = [];

    for (const event of Array.isArray(entry.events) ? entry.events : []) {
      if (
        !event ||
        typeof event.at !== "number" ||
        !Number.isFinite(event.at) ||
        event.at < cutoff
      ) {
        continue;
      }

      try {
        const raw = BigInt(String(event.raw));

        if (raw > 0n) {
          events.push({ at: event.at, raw: raw.toString() });
        }
      } catch {
        // Ignore malformed persisted income events.
      }
    }

    normalized[profileId] = {
      lastRaw: typeof entry.lastRaw === "string" ? entry.lastRaw : "",
      lastCheckedAt:
        typeof entry.lastCheckedAt === "number" &&
        Number.isFinite(entry.lastCheckedAt)
          ? entry.lastCheckedAt
          : 0,
      events: events.sort((left, right) => left.at - right.at),
    };
  }

  return normalized;
}

function mergeBalanceIncomeLedgers(
  firstValue: unknown,
  secondValue: unknown,
): BalanceIncomeLedger {
  const first = normalizeBalanceIncomeLedger(firstValue);
  const second = normalizeBalanceIncomeLedger(secondValue);
  const profileIds = new Set([
    ...Object.keys(first),
    ...Object.keys(second),
  ]);
  const merged: BalanceIncomeLedger = {};

  for (const profileId of profileIds) {
    const firstEntry = first[profileId];
    const secondEntry = second[profileId];
    const newestBaseline =
      (secondEntry?.lastCheckedAt ?? 0) > (firstEntry?.lastCheckedAt ?? 0)
        ? secondEntry
        : firstEntry;
    const uniqueEvents = new Map<string, BalanceIncomeEvent>();

    for (const event of [
      ...(firstEntry?.events ?? []),
      ...(secondEntry?.events ?? []),
    ]) {
      uniqueEvents.set(`${event.at}:${event.raw}`, event);
    }

    merged[profileId] = {
      lastRaw: newestBaseline?.lastRaw ?? "",
      lastCheckedAt: newestBaseline?.lastCheckedAt ?? 0,
      events: [...uniqueEvents.values()].sort(
        (left, right) => left.at - right.at,
      ),
    };
  }

  return merged;
}

type WalletRuntimeState = {
  initialized: boolean;
  autoMine: boolean;
  mining: boolean;
  tapCount: number;
  sessionNumber: number;
  confirmedSessions: number;
  acceptedSessions: number;
  rejectedSessions: number;
  nacklBalance: string;
  income24h: string;
  recent5mRewards: Array<{ amount: string; time: string }>;
  networkTap5m: number;
  networkTapEpoch: number;
  epoch5mStart: string;
  epochStart: string;
  networkUpdatedAt: string;
  acceptedEpoch5mStart: string;
  acceptedProgressHeld: boolean;
  estimatedDailyEpochEndAt: number;
  status: string;
  lastError: string;
};

type MinerEvent = {
  action?: string;
  data?: {
    worker_id?: number | string;
    status?: string;
    taps?: number;
    seed?: string | null;
    miner_state_corrupted?: boolean;
    result?: string;
    message?: string;
  };
  error?: unknown;
};

type RuntimeControl = {
  miner: Miner | null;
  autoMine: boolean;
  recovering: boolean;
  manualStop: boolean;
  tapCount: number;
  hiddenTapCount: number;
  sessionNumber: number;
  sessionGeneration: number;
  retryNotBefore: number;
  sessionFinalized: boolean;
  sessionOutcome: "none" | "accepted" | "rejected" | "unknown";
  tapTimer: number | null;
  nextSessionTimer: number | null;
  sessionWatchdogTimer: number | null;
  safetyTimer: number | null;
  recoveryTimer: number | null;
};

type RuntimeTimerKey =
  | "tapTimer"
  | "nextSessionTimer"
  | "sessionWatchdogTimer"
  | "safetyTimer"
  | "recoveryTimer";

const sleep = (ms: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, ms));

async function withNetworkRetry<T>(
  operation: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await sleep([1_000, 2_500, 5_000][attempt] ?? 5_000);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? "Network request failed"));
}

function parseMinerEvent(event: unknown): MinerEvent {
  if (typeof event === "string") {
    try {
      return JSON.parse(event) as MinerEvent;
    } catch {
      return { action: "raw", data: { status: event } };
    }
  }

  if (event && typeof event === "object") {
    return event as MinerEvent;
  }

  return {};
}

function normalizeWalletName(value: string): string {
  return value.trim().toLowerCase();
}

function stringifyForLog(value: unknown): string {
  try {
    return JSON.stringify(value, (_key, current) =>
      typeof current === "bigint" ? current.toString() : current,
    );
  } catch {
    return String(value);
  }
}

function loadBalanceIncomeLedger(): BalanceIncomeLedger {
  try {
    const raw = localStorage.getItem(BALANCE_INCOME_LEDGER_KEY);

    if (!raw) {
      return {};
    }

    return normalizeBalanceIncomeLedger(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

function formatRawNackl(rawValue: bigint): string {
  const negative = rawValue < 0n;
  const absolute = negative ? -rawValue : rawValue;
  const roundedHundredths =
    (absolute + 5_000_000n) / 10_000_000n;
  const whole = roundedHundredths / 100n;
  const fraction = (roundedHundredths % 100n)
    .toString()
    .padStart(2, "0");

  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function createEmptyRuntime(): WalletRuntimeState {
  return {
    initialized: false,
    autoMine: false,
    mining: false,
    tapCount: 0,
    sessionNumber: 0,
    confirmedSessions: 0,
    acceptedSessions: 0,
    rejectedSessions: 0,
    nacklBalance: "—",
    income24h: "0",
    recent5mRewards: [],
    networkTap5m: 0,
    networkTapEpoch: 0,
    epoch5mStart: "",
    epochStart: "",
    networkUpdatedAt: "",
    acceptedEpoch5mStart: "",
    acceptedProgressHeld: false,
    estimatedDailyEpochEndAt: 0,
    status: "IDLE",
    lastError: "",
  };
}

function parseWalletBalanceForSort(value: string): number {
  const normalized = value.replace(/[^0-9.,-]/g, "").replace(/,/g, "");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function createRuntimeControl(): RuntimeControl {
  return {
    miner: null,
    autoMine: false,
    recovering: false,
    manualStop: false,
    tapCount: 0,
    hiddenTapCount: 0,
    sessionNumber: 0,
    sessionGeneration: 0,
    retryNotBefore: 0,
    sessionFinalized: false,
    sessionOutcome: "none",
    tapTimer: null,
    nextSessionTimer: null,
    sessionWatchdogTimer: null,
    safetyTimer: null,
    recoveryTimer: null,
  };
}


type WalletCardLabels = {
  balance: string;
  min5: string;
  epoch: string;
  session: string;
  accepted: string;
  rejected: string;
  reconnect: string;
  removeWallet: string;
  startWallet: string;
  stopWallet: string;
  setActiveView: string;
  removeConfirm: string;
  removeConfirmDetail: string;
};

type WalletCardProps = {
  profile: WalletProfile;
  index: number;
  state: WalletRuntimeState;
  active: boolean;
  animationsEnabled: boolean;
  celebrationId: number;
  celebrationEffect: string;
  rejectedAnimationId: number;
  rejectedAftermathId: number;
  tapRejectPulseId: number;
  dragged: boolean;
  dragOver: boolean;
  walletGridColumns: number;
  tapMode: TapMode;
  walletMenuOpen: boolean;
  authorizing: boolean;
  statusLabel: string;
  labels: WalletCardLabels;
  onMouseDown: (event: ReactMouseEvent<HTMLElement>, profileId: string) => void;
  onSelect: (profileId: string) => void;
  onStart: (profileId: string) => void;
  onStop: (profileId: string) => void;
  onToggleMenu: (profileId: string) => void;
  onReconnect: (profileId: string) => void;
  onRemove: (profileId: string) => void;
};

function walletCardStatusClass(status: string): string {
  const normalized = status.toLowerCase();

  if (normalized.includes("comput")) return "status-computing";
  if (normalized.includes("accept")) return "status-accepted";
  if (normalized.includes("recover")) return "status-recovering";
  if (normalized.includes("error") || normalized.includes("reject"))
    return "status-error";
  if (normalized.includes("ready")) return "status-ready";
  if (normalized.includes("wait")) return "status-waiting";
  return "status-stopped";
}

function activityLogClass(message: string): string {
  const normalized = message.toLowerCase();
  if (/(error|failed|reject|denied|exception)/.test(normalized)) {
    return "log-error";
  }
  if (/(accepted|confirmed|ready|success)/.test(normalized)) {
    return "log-success";
  }
  if (/(recover|reconnect|retry|waiting)/.test(normalized)) {
    return "log-warning";
  }
  if (/(auto|tap|mining|started|stopped)/.test(normalized)) {
    return "log-mining";
  }
  return "log-system";
}

function equalRewards(
  left: WalletRuntimeState["recent5mRewards"],
  right: WalletRuntimeState["recent5mRewards"],
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;

  return left.every(
    (reward, index) =>
      reward.amount === right[index]?.amount &&
      reward.time === right[index]?.time,
  );
}

function equalWalletRuntime(
  left: WalletRuntimeState,
  right: WalletRuntimeState,
): boolean {
  return (
    left === right ||
    (left.initialized === right.initialized &&
      left.autoMine === right.autoMine &&
      left.mining === right.mining &&
      left.tapCount === right.tapCount &&
      left.sessionNumber === right.sessionNumber &&
      left.confirmedSessions === right.confirmedSessions &&
      left.acceptedSessions === right.acceptedSessions &&
      left.rejectedSessions === right.rejectedSessions &&
      left.nacklBalance === right.nacklBalance &&
      left.income24h === right.income24h &&
      left.networkTap5m === right.networkTap5m &&
      left.networkTapEpoch === right.networkTapEpoch &&
      left.epoch5mStart === right.epoch5mStart &&
      left.epochStart === right.epochStart &&
      left.networkUpdatedAt === right.networkUpdatedAt &&
      left.acceptedEpoch5mStart === right.acceptedEpoch5mStart &&
      left.acceptedProgressHeld === right.acceptedProgressHeld &&
      left.estimatedDailyEpochEndAt === right.estimatedDailyEpochEndAt &&
      left.status === right.status &&
      left.lastError === right.lastError &&
      equalRewards(left.recent5mRewards, right.recent5mRewards))
  );
}

const WalletCard = memo(
  function WalletCard({
    profile,
    index,
    state,
    active,
    animationsEnabled,
    celebrationId,
    celebrationEffect,
    rejectedAnimationId,
    rejectedAftermathId,
    tapRejectPulseId,
    dragged,
    dragOver,
    walletGridColumns,
    tapMode,
    authorizing,
    statusLabel,
    labels,
    onMouseDown,
    onSelect,
    onStart,
    onStop,
    onReconnect,
    onRemove,
  }: WalletCardProps) {
    const tapConfig = TAP_MODE_CONFIGS[tapMode];
    const displayed5mTaps = state.acceptedProgressHeld
      ? tapConfig.tapsPerSession
      : Math.min(tapConfig.tapsPerSession, state.tapCount);
    const progress = state.acceptedProgressHeld
      ? 100
      : Math.min(
          100,
          Math.round((displayed5mTaps / tapConfig.tapsPerSession) * 100),
        );
    const span = walletProfileSpan(profile);
    const currentStatusClass = walletCardStatusClass(state.status);

    return (
      <article
        className={`wallet-card ${active ? "is-active" : ""} ${
          state.autoMine ? "mining-active" : ""
        } ${
          animationsEnabled && celebrationId ? "is-celebrating" : ""
        } ${
          animationsEnabled && rejectedAnimationId
            ? "is-rejected-animation"
            : ""
        } ${
          animationsEnabled && rejectedAftermathId
            ? "is-rejected-aftermath"
            : ""
        }`}
        data-wallet-profile-id={profile.id}
        data-animation-batch="wallet-motion"
        data-dragging={dragged ? "true" : "false"}
        data-drag-over={dragOver ? "true" : "false"}
        data-wallet-grid-slot={profile.gridSlot ?? index}
        data-wallet-grid-span={span}
        style={walletGridPosition(
          profile.gridSlot ?? index,
          walletGridColumns,
          span,
        )}
        onMouseDown={(event) => onMouseDown(event, profile.id)}
      >
        {animationsEnabled && celebrationId > 0 && (
          <div
            className={`wallet-confetti effect-${celebrationEffect || "energy"}`}
            aria-hidden="true"
            key={celebrationId}
          >
            <div className="celebration-burst">
              <span>🎉</span>
              <strong>{labels.accepted}!</strong>
              <span>🎉</span>
            </div>
            {Array.from({ length: 32 }, (_, particleIndex) => {
              const direction = particleIndex % 2 === 0 ? -1 : 1;
              const spread = 24 + (particleIndex % 8) * 11;
              const particleStyle = {
                "--x": `${direction * spread}px`,
                "--y": `${-26 - (particleIndex % 6) * 10}px`,
                "--r": `${direction * (240 + particleIndex * 31)}deg`,
                "--particle-delay": `${(particleIndex % 9) * 55}ms`,
              } as CSSProperties;

              return (
                <i
                  className={`confetti-particle confetti-${particleIndex + 1}`}
                  key={particleIndex}
                  style={particleStyle}
                />
              );
            })}
          </div>
        )}

        {animationsEnabled && rejectedAnimationId > 0 && (
          <div
            className="wallet-rejected-fx"
            aria-hidden="true"
            key={rejectedAnimationId}
          >
            <div className="rejected-bomb">
              <i />
            </div>
            <div className="rejected-blast-core" />
            <div className="rejected-fire-ring" />
            <strong>{labels.rejected}!</strong>
            <div className="rejected-debris">
              {Array.from({ length: 16 }, (_, debrisIndex) => (
                <i
                  key={debrisIndex}
                  style={
                    {
                      "--debris-angle": `${debrisIndex * 22.5}deg`,
                      "--debris-distance": `${42 + (debrisIndex % 5) * 13}px`,
                      "--debris-delay": `${(debrisIndex % 4) * 45}ms`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
            <div className="rejected-smoke">
              {Array.from({ length: 7 }, (_, smokeIndex) => (
                <i
                  key={smokeIndex}
                  style={
                    {
                      "--smoke-x": `${(smokeIndex - 3) * 20}px`,
                      "--smoke-delay": `${smokeIndex * 170}ms`,
                      "--smoke-size": `${30 + (smokeIndex % 3) * 12}px`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
          </div>
        )}

        {animationsEnabled && rejectedAftermathId > 0 && (
          <div
            className="wallet-rejected-aftermath"
            aria-hidden="true"
            key={rejectedAftermathId}
          >
            <div className="aftermath-embers">
              {Array.from({ length: 36 }, (_, emberIndex) => (
                <i
                  key={emberIndex}
                  style={
                    {
                      "--ember-x": `${5 + ((emberIndex * 17) % 92)}%`,
                      "--ember-delay": `${(emberIndex % 12) * 105}ms`,
                      "--ember-drift": `${-16 + (emberIndex % 5) * 8}px`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
            <div className="aftermath-smoke">
              {Array.from({ length: 16 }, (_, smokeIndex) => (
                <i
                  key={smokeIndex}
                  style={
                    {
                      "--ash-x": `${2 + ((smokeIndex * 19) % 96)}%`,
                      "--ash-delay": `${(smokeIndex % 8) * 220}ms`,
                      "--ash-size": `${46 + (smokeIndex % 4) * 20}px`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
          </div>
        )}

        <div className="wallet-card-header">
          <div className="wallet-title-row">
            <button
              className="wallet-name-button"
              onClick={() => onSelect(profile.id)}
              title={labels.setActiveView}
            >
              {profile.walletName}
            </button>
          </div>
          <span className={`status-pill ${currentStatusClass}`}>
            {statusLabel}
          </span>
        </div>

        <div className="wallet-balance-banner">
          <div className="wallet-balance-main">
            <span>{labels.balance}</span>
            <strong>{state.nacklBalance}</strong>
          </div>

          {state.recent5mRewards.length > 0 && (
            <div className="wallet-reward-main">
              <div className="wallet-reward-list">
                {state.recent5mRewards.map((reward, rewardIndex) => (
                  <div
                    className="wallet-reward-item"
                    key={`${reward.time}-${rewardIndex}`}
                  >
                    <strong>+{reward.amount}</strong>
                    <time>{reward.time}</time>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="wallet-metrics">
          <div title={`Epoch start block: ${state.epochStart || "-"}`}>
            <span>{labels.epoch}</span>
            <strong
              className={
                state.networkTapEpoch >= 12_000
                  ? "metric-epoch-taps metric-epoch-limit"
                  : "metric-epoch-taps"
              }
            >
              {state.networkTapEpoch}
            </strong>
          </div>
          <div>
            <span>{labels.accepted}</span>
            <strong className="metric-good">{state.acceptedSessions}</strong>
          </div>
          <div>
            <span>{labels.rejected}</span>
            <strong className="metric-bad">{state.rejectedSessions}</strong>
          </div>
        </div>

        <div className="progress-row">
          <div className="progress-track">
            <span
              className={
                state.acceptedProgressHeld
                  ? "progress-accepted"
                  : tapRejectPulseId
                    ? "progress-reject-pulse"
                    : ""
              }
              style={{ width: `${progress}%` }}
            />
          </div>
          <b className={displayed5mTaps >= tapConfig.tapsPerSession ? "metric-good" : ""}>
            {displayed5mTaps}/{tapConfig.sessionsPerEpoch === null ? "∞" : tapConfig.tapsPerSession}
          </b>
        </div>

        <div className="wallet-actions">
          <button
            className="mini-button mini-start has-tooltip"
            data-tooltip={labels.startWallet}
            aria-label={`${labels.startWallet}: ${profile.walletName}`}
            title={labels.startWallet}
            onClick={() => onStart(profile.id)}
            disabled={!state.initialized || state.autoMine}
          >
            ▶
          </button>

          <button
            className="mini-button mini-stop has-tooltip"
            data-tooltip={labels.stopWallet}
            aria-label={`${labels.stopWallet}: ${profile.walletName}`}
            title={labels.stopWallet}
            onClick={() => onStop(profile.id)}
            disabled={!state.autoMine && !state.mining}
          >
            ■
          </button>

          <div className="wallet-direct-actions">
            <button
              type="button"
              className="wallet-direct-button wallet-reconnect-button"
              aria-label={`${labels.reconnect}: ${profile.walletName}`}
              title={labels.reconnect}
              disabled={state.autoMine || authorizing}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onReconnect(profile.id);
              }}
            >
              ↻
            </button>

            <button
              type="button"
              className="wallet-direct-button wallet-delete-button"
              aria-label={`${labels.removeWallet}: ${profile.walletName}`}
              title={labels.removeWallet}
              disabled={state.autoMine || authorizing}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();

                const approved = window.confirm(
                  `${profile.walletName}\n\n${labels.removeConfirm}\n${labels.removeConfirmDetail}`,
                );

                if (approved) {
                  onRemove(profile.id);
                }
              }}
            >
              ×
            </button>
          </div>



        </div>
      </article>
    );
  },
  (previous, next) =>
    previous.profile === next.profile &&
    previous.index === next.index &&
    equalWalletRuntime(previous.state, next.state) &&
    previous.active === next.active &&
    previous.animationsEnabled === next.animationsEnabled &&
    previous.celebrationId === next.celebrationId &&
    previous.celebrationEffect === next.celebrationEffect &&
    previous.rejectedAnimationId === next.rejectedAnimationId &&
    previous.rejectedAftermathId === next.rejectedAftermathId &&
    previous.tapRejectPulseId === next.tapRejectPulseId &&
    previous.dragged === next.dragged &&
    previous.dragOver === next.dragOver &&
    previous.walletGridColumns === next.walletGridColumns &&
    previous.walletMenuOpen === next.walletMenuOpen &&
    previous.authorizing === next.authorizing &&
    previous.statusLabel === next.statusLabel &&
    previous.labels === next.labels &&
    previous.onMouseDown === next.onMouseDown &&
    previous.onSelect === next.onSelect &&
    previous.onStart === next.onStart &&
    previous.onStop === next.onStop &&
    previous.onToggleMenu === next.onToggleMenu &&
    previous.onReconnect === next.onReconnect &&
    previous.onRemove === next.onRemove,
);

function App() {
  // CAPPACKI_FIXED_WALLET_CARD_MEASURE
  useEffect(() => {
    let cancelled = false;
    let attempt = 0;

    const applySavedSize = () => {
      const savedWidth = Number(
        localStorage.getItem("cappacki-fixed-wallet-card-width"),
      );
      const savedHeight = Number(
        localStorage.getItem("cappacki-fixed-wallet-card-height"),
      );

      if (savedWidth > 0 && savedHeight > 0) {
        document.documentElement.style.setProperty(
          "--fixed-wallet-card-width",
          `${savedWidth}px`,
        );
        document.documentElement.style.setProperty(
          "--fixed-wallet-card-height",
          `${savedHeight}px`,
        );
        document.documentElement.dataset.walletCardSizeLocked = "true";
        return true;
      }

      return false;
    };

    if (applySavedSize()) {
      return;
    }

    const measureMasterCard = () => {
      if (cancelled) return;

      const card = document.querySelector<HTMLElement>(".wallet-card");

      if (!card) {
        attempt += 1;

        if (attempt < 120) {
          window.setTimeout(measureMasterCard, 100);
        }

        return;
      }

      const rect = card.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);

      if (width <= 0 || height <= 0) {
        attempt += 1;

        if (attempt < 120) {
          window.setTimeout(measureMasterCard, 100);
        }

        return;
      }

      localStorage.setItem(
        "cappacki-fixed-wallet-card-width",
        String(width),
      );
      localStorage.setItem(
        "cappacki-fixed-wallet-card-height",
        String(height),
      );

      document.documentElement.style.setProperty(
        "--fixed-wallet-card-width",
        `${width}px`,
      );
      document.documentElement.style.setProperty(
        "--fixed-wallet-card-height",
        `${height}px`,
      );

      document.documentElement.dataset.walletCardSizeLocked = "true";

      console.info(
        `[CappAckiMiner] Wallet card master size locked: ${width} × ${height}px`,
      );
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(measureMasterCard);
    });

    return () => {
      cancelled = true;
    };
  }, []);
  const cancelledRef = useRef(false);
  const authorizationInFlightRef = useRef(false);
  const profileStoreRef = useRef<Store | null>(null);
  const profileSaveQueueRef = useRef<Promise<void>>(
    Promise.resolve(),
  );
  const miningStartPreflightQueueRef = useRef<Promise<void>>(
    Promise.resolve(),
  );
  const miningEpochBlockCacheRef = useRef<{
    epochStart: bigint;
    fetchedAt: number;
  } | null>(null);
  const walletSdkRef = useRef<Wallet | null>(null);
  const controlsRef = useRef<Map<string, RuntimeControl>>(new Map());
  const engineGenerationRef = useRef(0);
  const profilesRef = useRef<WalletProfile[]>([]);
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const draggedProfileIdRef = useRef<string | null>(null);
  const runtimeStatesRef = useRef<Record<string, WalletRuntimeState>>({});
  const balanceIncomeLedgerRef = useRef<BalanceIncomeLedger>(
    loadBalanceIncomeLedger(),
  );
  const balanceIncomeSaveQueueRef = useRef<Promise<void>>(
    Promise.resolve(),
  );
  const watchdogActivityRef = useRef<Map<string, number>>(new Map());
  const watchdogUnhealthySinceRef = useRef<Map<string, number>>(new Map());
  const watchdogReloadingRef = useRef(false);
  const watchdogStartedAtRef = useRef(Date.now());
  const pendingTransferCheckedRef = useRef(false);
  const pendingTransferImportInFlightRef = useRef(false);
  const lastSeenPendingTransferPathRef = useRef<string | null>(null);
  const pendingTransferReloadScheduledRef = useRef(false);
  const epochTimingRef = useRef<
    Map<
      string,
      {
        lastEpoch5mStart: string;
        lastEpochChangedAt: number;
        blockStep: bigint | null;
        averageFiveMinuteMs: number;
        samples: number;
        hasSeenTransition: boolean;
      }
    >
  >(new Map());

  const [sdkReady, setSdkReady] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [authorizing, setAuthorizing] = useState(false);
  const [portfolioIncome, setPortfolioIncome] =
    useState<PortfolioIncomeState>({
      hourly: "0.00",
      daily: "0.00",
      weekly: "0.00",
      monthly: "0.00",
      loading: false,
      updatedAt: "",
    });

  const [profiles, setProfiles] = useState<WalletProfile[]>([]);
  const [appViewMode, setAppViewMode] = useState<AppViewMode>(
    loadAppViewMode,
  );
  const [engineSwitching, setEngineSwitching] = useState(false);
  const appViewModeRef = useRef<AppViewMode>(appViewMode);
  const liteKnownLatestRewardRef = useRef<Map<string, string>>(new Map());
  const litePendingAcceptedAtRef = useRef<Map<string, number>>(new Map());
  const liteAcceptedNoticeTimerRef = useRef<number | null>(null);
  const [liteSearch, setLiteSearch] = useState("");
  const [liteStatusFilter, setLiteStatusFilter] = useState<
    "all" | "running" | "waiting" | "error" | "stopped"
  >("all");
  const [balanceSortEnabled, setBalanceSortEnabled] = useState(true);
  const [activeProfileId, setActiveProfileId] = useState("");
  const [newWalletName, setNewWalletName] = useState("");
  const [connectedWalletName, setConnectedWalletName] = useState("");
  const [authorizationStage, setAuthorizationStage] = useState<
    "idle" | "preparing" | "waiting-identity" | "requesting-key" | "waiting-mining"
  >("idle");
  const [runtimeStates, setRuntimeStates] = useState<
    Record<string, WalletRuntimeState>
  >({});

  const [deepLink, setDeepLink] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [walletMenuId, setWalletMenuId] = useState<string | null>(null);
  const [draggedProfileId, setDraggedProfileId] = useState<string | null>(null);
  const [dragOverProfileId, setDragOverProfileId] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [dragPreview, setDragPreview] = useState<{
    profileId: string;
    x: number;
    y: number;
  } | null>(null);
  const [celebratingWallets, setCelebratingWallets] = useState<
    Record<string, number>
  >({});
  const [celebrationEffects, setCelebrationEffects] = useState<
    Record<string, string>
  >({});
  const [tapRejectPulses, setTapRejectPulses] = useState<
    Record<string, number>
  >({});
  const [rejectedAnimations, setRejectedAnimations] = useState<
    Record<string, number>
  >({});
  const [rejectedAftermaths, setRejectedAftermaths] = useState<
    Record<string, number>
  >({});
  const [liteAcceptedPulses, setLiteAcceptedPulses] = useState<
    Record<string, number>
  >({});
  const [liteAcceptedNotice, setLiteAcceptedNotice] =
    useState<LiteAcceptedNotice | null>(null);

  const [reconnectingProfileId, setReconnectingProfileId] = useState<
    string | null
  >(null);
  const [mainTheme, setMainTheme] = useState<ThemeName>(() =>
    normalizeTheme(
      localStorage.getItem(MAIN_THEME_KEY) ??
        localStorage.getItem(LEGACY_THEME_KEY),
    ),
  );
  const [liteTheme, setLiteTheme] = useState<ThemeName>(() =>
    normalizeTheme(
      localStorage.getItem(LITE_THEME_KEY) ??
        localStorage.getItem(LEGACY_THEME_KEY),
    ),
  );
  const theme = appViewMode === "lite" ? liteTheme : mainTheme;
  const setTheme =
    appViewMode === "lite" ? setLiteTheme : setMainTheme;
  const skin: SkinName = "velvet-soft";
  const [uiShape, setUiShape] = useState<UiShape>(() =>
    normalizeUiShape(localStorage.getItem(UI_SHAPE_KEY)),
  );
  const [animationsEnabled, setAnimationsEnabled] =
    useState(loadAnimationsEnabled);
  const tapMode: TapMode = DEFAULT_TAP_MODE;

  const [language, setLanguage] = useState<AppLanguage>(() =>
    (localStorage.getItem("miner-language") as AppLanguage) || "en",
  );
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [titleSparkLevel, setTitleSparkLevel] = useState(0);

  const [verifyReconnectKey, setVerifyReconnectKey] = useState(
    () => localStorage.getItem(RECONNECT_VERIFY_KEY) !== "0",
  );
  const [watchdogEnabled, setWatchdogEnabled] = useState(
    () => localStorage.getItem(WATCHDOG_ENABLED_KEY) === "1",
  );
  const [watchdogLastCheck, setWatchdogLastCheck] = useState("");
  const [walletGridColumns, setWalletGridColumns] = useState(
    WALLET_GRID_MIN_COLUMNS,
  );
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics>({
    cpu_usage: null,
    cpu_temperature_c: null,
  });
  const [networkHealth, setNetworkHealth] = useState<NetworkHealth>({
    status: "unknown",
    tps: null,
  });
  const networkFailureTimesRef = useRef<number[]>([]);
  const [networkStress, setNetworkStress] = useState<NetworkStress>({
    level: "unknown",
    recentFailures: 0,
  });
  const [networkOverview, setNetworkOverview] = useState<NetworkOverview>({
    totalWallets: null,
    miningEventsPerHour: null,
    miningSampleAt: null,
    updatedAt: null,
    epochRemaining: null,
    epochStartBlock: null,
    epoch5mStartBlock: null,
    epochEstimatedEndAt: null,
    epochUpdatedAt: null,
  });
  const previousMiningSampleRef = useRef<{
    events: number;
    sampledAt: number;
  } | null>(null);
  const [licenseSnapshot, setLicenseSnapshot] = useState<LicenseSnapshot>(
    () => getLicenseSnapshot(),
  );
  const [licenseHydrated, setLicenseHydrated] = useState(false);
  const [licenseKeyInput, setLicenseKeyInput] = useState("");
  const [backupPathNotice, setBackupPathNotice] = useState("");
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const startAllTimersRef = useRef<Set<number>>(new Set());
  const tapModeConfig = TAP_MODE_CONFIGS[tapMode];

  useEffect(() => {
    appViewModeRef.current = appViewMode;
  }, [appViewMode]);

  useEffect(() => {
    return () => {
      if (liteAcceptedNoticeTimerRef.current !== null) {
        window.clearTimeout(liteAcceptedNoticeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (appViewMode !== "main") {
      return;
    }

    const updateEpochSnapshot = () => {
      const now = Date.now();

      setNetworkOverview((current) => {
        const sdkSampleIsFresh =
          current.epochUpdatedAt !== null &&
          now - current.epochUpdatedAt <= NETWORK_REFRESH_INTERVAL_MS * 3;
        const epochRemaining =
          sdkSampleIsFresh && current.epochEstimatedEndAt !== null
            ? formatSdkEpochRemaining(current.epochEstimatedEndAt, now)
            : null;

        return current.epochRemaining === epochRemaining
          ? current
          : { ...current, epochRemaining };
      });
    };

    updateEpochSnapshot();
    const timer = window.setInterval(updateEpochSnapshot, 1000);
    return () => window.clearInterval(timer);
  }, [appViewMode]);

  useEffect(() => {
    let active = true;
    void hydrateLicenseState().then((snapshot) => {
      if (!active) {
        return;
      }
      setLicenseSnapshot(snapshot);
      setLicenseHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    // AUTO-LICENSE-WALLET-SELECTION-V2
    if (!licenseHydrated || licenseSnapshot.developerUnlimited) {
      return;
    }

    const walletLimit = Math.max(1, Math.floor(licenseSnapshot.walletLimit));

    if (profiles.length === 0) {
      if (licenseSnapshot.selectedWalletIds.length > 0) {
        setLicenseSnapshot(
          setSelectedLicenseWalletIds([], walletLimit),
        );
      }
      return;
    }

    const targetSelectedCount = Math.min(profiles.length, walletLimit);
    const availableProfileIds = new Set(
      profiles.map((profile) => profile.id),
    );
    const nextSelectedIds = licenseSnapshot.selectedWalletIds
      .filter((profileId) => availableProfileIds.has(profileId))
      .slice(0, targetSelectedCount);
    const selectedIdSet = new Set(nextSelectedIds);

    for (const profile of profiles) {
      if (nextSelectedIds.length >= targetSelectedCount) {
        break;
      }

      if (!selectedIdSet.has(profile.id)) {
        nextSelectedIds.push(profile.id);
        selectedIdSet.add(profile.id);
      }
    }

    if (
      nextSelectedIds.length !== licenseSnapshot.selectedWalletIds.length ||
      nextSelectedIds.some(
        (profileId, index) =>
          profileId !== licenseSnapshot.selectedWalletIds[index],
      )
    ) {
      setLicenseSnapshot(
        setSelectedLicenseWalletIds(nextSelectedIds, walletLimit),
      );
    }
  }, [
    licenseHydrated,
    licenseSnapshot.developerUnlimited,
    licenseSnapshot.expiresAt,
    licenseSnapshot.licenseTier,
    licenseSnapshot.walletLimit,
    profiles,
  ]);

  useEffect(() => {
    if (appViewMode !== "main") {
      return;
    }

    let mounted = true;

    const refreshMiningIntensity = async () => {
      try {
        const response = await fetch("https://beescan.live/api/bee/summary", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error(`BeeScan returned ${response.status}`);
        const payload = (await response.json()) as { mine_events_24h?: number };
        if (
          typeof payload.mine_events_24h !== "number" ||
          !Number.isFinite(payload.mine_events_24h)
        ) {
          throw new Error("BeeScan returned no mining event count.");
        }

        const sampledAt = Date.now();
        const previous = previousMiningSampleRef.current;
        const miningEventsPerHour = previous
          ? Math.max(
              0,
              ((payload.mine_events_24h - previous.events) /
                Math.max(1, sampledAt - previous.sampledAt)) *
                60 * 60_000,
            )
          : null;
        previousMiningSampleRef.current = {
          events: payload.mine_events_24h,
          sampledAt,
        };

        if (mounted) {
          setNetworkOverview((current) => ({
            ...current,
            miningEventsPerHour:
              miningEventsPerHour === null
                ? null
                : Number(miningEventsPerHour.toFixed(2)),
            miningSampleAt: sampledAt,
          }));
        }
      } catch {
        if (mounted) {
          setNetworkOverview((current) => ({
            ...current,
            miningEventsPerHour: null,
          }));
        }
      }
    };

    void refreshMiningIntensity();
    const timer = window.setInterval(
      refreshMiningIntensity,
      MINING_INTENSITY_REFRESH_INTERVAL_MS,
    );
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [appViewMode]);

  useEffect(() => {
    if (appViewMode !== "main") {
      return;
    }

    let mounted = true;

    const refreshNetworkWallets = async () => {
      try {
        const statsResponse = await fetch("https://beescan.live/api/wallets/stats", {
          cache: "no-store",
        });
        if (!statsResponse.ok) {
          throw new Error("BeeScan wallet stats request failed.");
        }
        const stats = (await statsResponse.json()) as { total_wallets?: number };
        if (typeof stats.total_wallets !== "number") {
          throw new Error("BeeScan wallet data is invalid.");
        }
        const totalWallets = stats.total_wallets;
        if (mounted) {
          setNetworkOverview((current) => ({
            ...current,
            totalWallets,
            updatedAt: Date.now(),
          }));
        }
      } catch {
        if (mounted) {
          setNetworkOverview((current) => ({
            ...current,
            totalWallets: null,
          }));
        }
      }
    };

    void refreshNetworkWallets();
    const timer = window.setInterval(
      refreshNetworkWallets,
      NETWORK_WALLET_REFRESH_INTERVAL_MS,
    );
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [appViewMode]);

  useEffect(() => {
    void syncLicenseWithServer().then(setLicenseSnapshot);
    const timer = window.setInterval(() => {
      void syncLicenseWithServer().then(setLicenseSnapshot);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;
    let consecutiveFailures = 0;
    let sampleTimer: number | null = null;

    const sampleNetworkHealth = async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 8_000);

      try {
        const response = await fetch(BEESCAN_TPS_ENDPOINT, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`BeeScan returned ${response.status}`);
        }
        const payload = (await response.json()) as {
          current?: number;
        };
        if (typeof payload.current !== "number" || !Number.isFinite(payload.current)) {
          throw new Error("BeeScan returned no current TPS.");
        }
        const tps = Number(payload.current.toFixed(2));
        consecutiveFailures = 0;
        const status = tps > 200 ? "healthy" : tps >= 100 ? "warning" : "critical";
        if (mounted) setNetworkHealth({ status, tps });
      } catch {
        consecutiveFailures += 1;
        if (mounted) {
          setNetworkHealth({
            status: consecutiveFailures >= 2 ? "critical" : "warning",
            tps: null,
          });
        }
      } finally {
        window.clearTimeout(timeout);
      }
    };

    void sampleNetworkHealth();
    sampleTimer = window.setInterval(sampleNetworkHealth, NETWORK_REFRESH_INTERVAL_MS);
    return () => {
      mounted = false;
      if (sampleTimer !== null) window.clearInterval(sampleTimer);
    };
  }, []);

  useEffect(() => {
    const refreshStress = () => {
      const cutoff = Date.now() - 120_000;
      const recentFailures =
        networkFailureTimesRef.current.filter(
          (timestamp) => timestamp >= cutoff,
        );
      networkFailureTimesRef.current = recentFailures;
      setNetworkStress({
        level: networkStressLevel(
          recentFailures.length,
          networkHealth.status,
        ),
        recentFailures: recentFailures.length,
      });
    };

    refreshStress();
    const timer = window.setInterval(refreshStress, 10_000);
    return () => window.clearInterval(timer);
  }, [networkHealth.status]);

  const t = repairTranslation({
    ...I18N[language],
    ...UI_I18N[language],
  });
  const stressLabel = {
    low: t.stressLow,
    medium: t.stressMedium,
    high: t.stressHigh,
    unknown: t.stressUnknown,
  }[networkStress.level];

  useEffect(() => {
    let mounted = true;

    const refreshSystemMetrics = async () => {
      try {
        const metrics = await invoke<SystemMetrics>("get_system_metrics");

        if (mounted) {
          setSystemMetrics(metrics);
        }
      } catch {
        if (mounted) {
          setSystemMetrics({
            cpu_usage: null,
            cpu_temperature_c: null,
          });
        }
      }
    };

    void refreshSystemMetrics();
    const refreshTimer = window.setInterval(
      refreshSystemMetrics,
      CPU_CONTROLLER_SAMPLE_INTERVAL_MS,
    );

    return () => {
      mounted = false;
      window.clearInterval(refreshTimer);
    };
  }, []);

  useEffect(() => {
    setWalletGridColumns(
      walletColumnsForCount(
        Math.min(profiles.length, MAIN_WALLET_LIMIT),
      ),
    );
  }, [profiles.length]);

  const lastFittedMainProfileCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (restoring || appViewMode !== "main") {
      return;
    }

    const mainProfileCount = Math.min(
      profiles.length,
      MAIN_WALLET_LIMIT,
    );

    if (lastFittedMainProfileCountRef.current === mainProfileCount) {
      return;
    }

    lastFittedMainProfileCountRef.current = mainProfileCount;

    const fitTimer = window.setTimeout(() => {
      void fitWindowToWalletLayout(mainProfileCount);
    }, 180);

    return () => window.clearTimeout(fitTimer);
  }, [appViewMode, profiles.length, restoring]);

  useEffect(() => {
    if (appViewMode !== "main") {
      setTitleSparkLevel(0);
      return;
    }

    let animationFrameId: number | null = null;
    let latestPointerEvent: PointerEvent | null = null;

    const calculateTitleSparks = () => {
      animationFrameId = null;

      const event = latestPointerEvent;
      const title = titleRef.current;

      if (!event || !title) {
        return;
      }

      const rect = title.getBoundingClientRect();

      const deltaX =
        event.clientX < rect.left
          ? rect.left - event.clientX
          : event.clientX > rect.right
            ? event.clientX - rect.right
            : 0;

      const deltaY =
        event.clientY < rect.top
          ? rect.top - event.clientY
          : event.clientY > rect.bottom
            ? event.clientY - rect.bottom
            : 0;

      const distance = Math.hypot(deltaX, deltaY);
      const proximity = Math.max(
        0,
        1 - distance / TITLE_FIRE_DISTANCE_PX,
      );

      const nextLevel =
        distance > TITLE_FIRE_DISTANCE_PX
          ? 0
          : Math.max(1, Math.min(5, Math.ceil(proximity * 5)));

      setTitleSparkLevel((current) =>
        current === nextLevel ? current : nextLevel,
      );
    };

    const updateTitleSparks = (event: PointerEvent) => {
      latestPointerEvent = event;

      if (animationFrameId === null) {
        animationFrameId = window.requestAnimationFrame(
          calculateTitleSparks,
        );
      }
    };

    const extinguishTitle = () => {
      latestPointerEvent = null;

      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }

      setTitleSparkLevel((current) =>
        current === 0 ? current : 0,
      );
    };

    // Listen only while the pointer is over the title.  A window-wide
    // pointermove handler made every mouse movement invalidate the React
    // tree even when the user was working in the wallet grid.
    const title = titleRef.current;
    title?.addEventListener("pointermove", updateTitleSparks, {
      passive: true,
    });
    title?.addEventListener("pointerleave", extinguishTitle);
    window.addEventListener("blur", extinguishTitle);

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }

      title?.removeEventListener("pointermove", updateTitleSparks);
      title?.removeEventListener("pointerleave", extinguishTitle);
      window.removeEventListener("blur", extinguishTitle);
    };
  }, [appViewMode]);

  const displayStatus = (status: string) => {
    const normalized = status.toUpperCase();

    if (normalized.includes("RECOVERY FAILED")) return t.recoveryFailed;
    if (normalized.includes("NETWORK REJECTED")) return t.networkRejected;
    if (normalized.includes("RECOVER")) return t.recovering;
    if (normalized.includes("COMPUT")) return t.computing;
    if (normalized.includes("START")) return t.starting;
    if (normalized.includes("WAIT")) return t.waiting;
    if (normalized.includes("FINISH")) return t.finished;
    if (normalized.includes("STOP")) return t.stopped;
    if (normalized.includes("READY")) return t.ready;
    if (normalized.includes("ERROR")) return t.error;

    return status;
  };

  const [utilityPanel, setUtilityPanel] = useState<
    "none" | "add" | "log" | "themes" | "admin" | "developer"
  >("none");

  const [logs, setLogs] = useState<LogEntry[]>([
    {
      time: new Date().toLocaleTimeString(),
      message: "[SYSTEM] Acki Nacki Miner Farm initialized.",
    },
    {
      time: new Date().toLocaleTimeString(),
      message: "[SYSTEM] Network: Mainnet",
    },
  ]);

  const addLog = (message: string) => {
    if (
      /Failed to fetch|code:\s*205|error_code:\s*Some\("205"\)|Network data read failed|BALANCE UNAVAILABLE/i.test(
        message,
      )
    ) {
      const cutoff = Date.now() - 120_000;
      const recentFailures = [
        ...networkFailureTimesRef.current.filter(
          (timestamp) => timestamp >= cutoff,
        ),
        Date.now(),
      ];
      networkFailureTimesRef.current = recentFailures;
      setNetworkStress({
        level: networkStressLevel(
          recentFailures.length,
          networkHealth.status,
        ),
        recentFailures: recentFailures.length,
      });
    }

    const activityMatch = message.match(
      /\[(AUTO|READY|RECOVERY):([^\]]+)\]/,
    );

    if (
      activityMatch &&
      /(initialized|reinitialized|resuming|started|tap \d+\/|confirmed|accepted)/i.test(
        message,
      )
    ) {
      const walletName = activityMatch[2];
      const profile = profilesRef.current.find(
        (item) => item.walletName === walletName,
      );

      if (profile) {
        watchdogActivityRef.current.set(profile.id, Date.now());
        watchdogUnhealthySinceRef.current.delete(profile.id);
      }
    }

    // Per-tap messages are extremely frequent with multiple wallets. Keep
    // watchdog activity above, but only render useful milestones in the UI log.
    const tapProgressMatch = message.match(/tap (\d+)\/(\d+)/i);

    if (tapProgressMatch) {
      const tap = Number(tapProgressMatch[1]);
      const total = Number(tapProgressMatch[2]);
      const shouldKeepTapLog =
        tap === 1 || tap === total || tap % TAP_LOG_STEP === 0;

      if (!shouldKeepTapLog) {
        return;
      }
    }

    setLogs((current) => {
      const nextEntry: LogEntry = {
        time: new Date().toLocaleTimeString(),
        message,
      };

      if (current.length < MAX_ACTIVITY_LOG_ENTRIES) {
        return [...current, nextEntry];
      }

      return [
        ...current.slice(-(MAX_ACTIVITY_LOG_ENTRIES - 1)),
        nextEntry,
      ];
    });
  };

  const openProtectedPanel = async (
    panel: "admin" | "developer",
  ) => {
    if (panel === "admin") {
      setUtilityPanel("admin");
      addLog("[SECURITY] ADMIN panel opened.");
      return;
    }

    if (!LOCAL_DEVELOPER_TOOLS_ENABLED) {
      addLog(
        "[SECURITY] Developer tools are disabled in production builds.",
      );
      return;
    }

    // The verifier is loaded only by a local development build.
    const { verifyAdminPassword } = await import("./adminAuth");
    const protectedLabels = repairTranslation(ADMIN_ACTION_LABELS[language]);
    const password = window.prompt(protectedLabels.developerPassword);

    if (password === null) {
      return;
    }

    if (!(await verifyAdminPassword(password))) {
      addLog(`[SECURITY] ${panel.toUpperCase()} password rejected.`);
      window.alert(protectedLabels.incorrectPassword);
      return;
    }

    setUtilityPanel(panel);
    addLog(`[SECURITY] ${panel.toUpperCase()} panel unlocked.`);
  };

  const updateRuntimeState = (
    profileId: string,
    patch: Partial<WalletRuntimeState>,
  ) => {
    setRuntimeStates((current) => {
      const previous = current[profileId] ?? createEmptyRuntime();
      const patchEntries = Object.entries(patch) as Array<
        [keyof WalletRuntimeState, WalletRuntimeState[keyof WalletRuntimeState]]
      >;
      const hasMeaningfulChange = patchEntries.some(
        ([key, value]) => !Object.is(previous[key], value),
      );

      // Returning the same object prevents a full React render when network
      // polling reports values that are already visible on screen.
      if (!hasMeaningfulChange) {
        return current;
      }

      return {
        ...current,
        [profileId]: {
          ...previous,
          ...patch,
        },
      };
    });
  };

  const getControl = (profileId: string): RuntimeControl => {
    const existing = controlsRef.current.get(profileId);

    if (existing) {
      return existing;
    }

    const created = createRuntimeControl();
    controlsRef.current.set(profileId, created);
    return created;
  };

  const queueMiningStartPreflight = async <T,>(
    operation: () => Promise<T>,
  ): Promise<T> => {
    const previous =
      miningStartPreflightQueueRef.current.catch(() => undefined);
    let releaseSlot = () => {};
    const slot = new Promise<void>((resolve) => {
      releaseSlot = resolve;
    });

    miningStartPreflightQueueRef.current =
      previous.then(() => slot);
    await previous;

    try {
      return await operation();
    } finally {
      // Keep account reads from all wallets from bursting against the same
      // mainnet endpoint when START ALL is pressed.
      await sleep(350);
      releaseSlot();
    }
  };

  const clearRuntimeTimer = (
    profileId: string,
    timerKey: RuntimeTimerKey,
  ) => {
    const control = getControl(profileId);
    const timer = control[timerKey];

    if (timer !== null) {
      window.clearTimeout(timer);
      control[timerKey] = null;
    }
  };

  const scheduleRuntimeTimer = (
    profileId: string,
    timerKey: RuntimeTimerKey,
    callback: () => void,
    delayMs: number,
  ) => {
    const control = getControl(profileId);

    clearRuntimeTimer(profileId, timerKey);

    control[timerKey] = window.setTimeout(() => {
      control[timerKey] = null;
      callback();
    }, delayMs);
  };

  const clearAllRuntimeTimers = (profileId: string) => {
    clearRuntimeTimer(profileId, "tapTimer");
    clearRuntimeTimer(profileId, "nextSessionTimer");
    clearRuntimeTimer(profileId, "sessionWatchdogTimer");
    clearRuntimeTimer(profileId, "safetyTimer");
    clearRuntimeTimer(profileId, "recoveryTimer");
  };

  const clearTapTimer = (profileId: string) =>
    clearRuntimeTimer(profileId, "tapTimer");

  const clearNextSessionTimer = (profileId: string) =>
    clearRuntimeTimer(profileId, "nextSessionTimer");

  const clearSessionWatchdogTimer = (profileId: string) =>
    clearRuntimeTimer(profileId, "sessionWatchdogTimer");

  const clearSafetyTimer = (profileId: string) =>
    clearRuntimeTimer(profileId, "safetyTimer");

  const clearRecoveryTimer = (profileId: string) =>
    clearRuntimeTimer(profileId, "recoveryTimer");

  const stopAndFreeWallet = (profileId: string) => {
    const control = getControl(profileId);

    clearAllRuntimeTimers(profileId);
    control.autoMine = false;
    control.recovering = false;
    control.manualStop = true;
    control.sessionGeneration += 1;

    try {
      control.miner?.stop();
    } catch {
      // Ignore stop errors during cleanup.
    }

    try {
      control.miner?.free();
    } catch {
      // Ignore cleanup errors.
    }

    control.miner = null;

    updateRuntimeState(profileId, {
      initialized: false,
      autoMine: false,
      mining: false,
      status: "STOPPED",
    });
  };

  const getProfileStore = async (): Promise<Store> => {
    if (profileStoreRef.current) {
      return profileStoreRef.current;
    }

    const store = await Store.load(PROFILE_STORE_FILE, {
      defaults: {},
      autoSave: false,
    });

    profileStoreRef.current = store;
    return store;
  };

  const persistBalanceIncomeLedger = (ledger: BalanceIncomeLedger) => {
    const snapshot = normalizeBalanceIncomeLedger(ledger);

    balanceIncomeSaveQueueRef.current = balanceIncomeSaveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const store = await getProfileStore();
        await store.set(BALANCE_INCOME_LEDGER_STORE_KEY, snapshot);
        await store.save();
      });
  };

  const persistProfiles = async (
    nextProfiles: WalletProfile[],
    nextActiveProfileId: string,
  ) => {
    // Capture an immutable snapshot now. React state or callers may mutate
    // their arrays while this write is waiting behind an earlier save.
    const profileSnapshot = nextProfiles.map((profile) => ({
      ...profile,
    }));
    const activeProfileSnapshot = nextActiveProfileId;

    const saveOperation = profileSaveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        const store = await getProfileStore();
        const protectedProfiles = await Promise.all(
          profileSnapshot.map(async ({ secretKey, ...profile }) => ({
            ...profile,
            protectedSecretKey: await invoke<string>(
              "protect_wallet_secret",
              {
                secret: secretKey,
              },
            ),
          })),
        );

        await store.set(PROFILES_KEY, protectedProfiles);
        await store.set(
          ACTIVE_PROFILE_KEY,
          activeProfileSnapshot,
        );
        await store.save();
      });

    profileSaveQueueRef.current = saveOperation;
    await saveOperation;
  };

  const restoreStoredProfile = async (
    storedProfile: StoredWalletProfile,
  ): Promise<WalletProfile> => {
    const secretKey = storedProfile.protectedSecretKey
      ? await invoke<string>("unprotect_wallet_secret", {
          protectedSecret: storedProfile.protectedSecretKey,
        })
      : storedProfile.secretKey;

    if (!secretKey) {
      throw new Error(`Wallet secret is unavailable for ${storedProfile.walletName}.`);
    }

    const { protectedSecretKey: _protectedSecretKey, secretKey: _secretKey, ...profile } =
      storedProfile;
    return { ...profile, secretKey };
  };

  const createWalletTransferExe = async () => {
    const password = window.prompt("Enter a backup password (minimum 8 characters):") ?? "";
    if (!password) return;

    try {
      const backup = await createWalletBackup(profiles, password);
      const fileName = `CappAckiMiner-Cuzdan-Yedegi-Transfer-${new Date().toISOString().slice(0, 10)}.exe`;
      const data = Array.from(new Uint8Array(await backup.arrayBuffer()));
      const savedPath = await invoke<string>("create_wallet_transfer_exe", {
        fileName,
        data,
      });
      addLog(`[BACKUP] Wallet transfer EXE created: ${savedPath}`);
      setBackupPathNotice(savedPath);
      try {
        await message(`Wallet transfer EXE created successfully:\n\n${savedPath}`, {
          title: "CappAckiMiner wallet transfer",
          kind: "info",
        });
      } catch {
        window.alert(`Wallet transfer EXE created successfully:\n\n${savedPath}`);
      }
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      setBackupPathNotice(`TRANSFER EXE FAILED: ${messageText}`);
      addLog(`[BACKUP] Transfer EXE creation failed: ${messageText}`);
    }
  };

  const importWalletBackup = async (file: Blob, transferPath?: string) => {
    if (file.size > MAX_WALLET_BACKUP_BYTES) {
      addLog(
        `[BACKUP] Import rejected: backup is larger than ${MAX_WALLET_BACKUP_BYTES} bytes.`,
      );
      return;
    }

    const password = window.prompt("Enter the backup password:") ?? "";
    if (!password) return;

    try {
      const importedProfiles = await readWalletBackup(file, password);
      const nextProfiles: WalletProfile[] = [...profiles];
      const publicKeyToIndex = new Map<string, number>();
      const minerAddressToIndex = new Map<string, number>();
      const usedIds = new Set(nextProfiles.map((profile) => profile.id));
      const usedNames = new Set(
        nextProfiles.map((profile) =>
          normalizeWalletName(profile.walletName),
        ),
      );

      const normalizedIdentity = (value: string) =>
        value.trim().toLowerCase();

      const indexProfile = (profile: WalletProfile, index: number) => {
        const publicKey = normalizedIdentity(profile.publicKey);
        const minerAddress = normalizedIdentity(profile.minerAddress);

        if (publicKey) {
          publicKeyToIndex.set(publicKey, index);
        }

        if (minerAddress) {
          minerAddressToIndex.set(minerAddress, index);
        }
      };

      nextProfiles.forEach(indexProfile);

      const allocateUniqueId = (preferredId: string) => {
        const baseId =
          normalizeWalletName(preferredId) || `wallet-${Date.now()}`;
        let candidate = baseId;
        let suffix = 2;

        while (usedIds.has(candidate)) {
          candidate = `${baseId}-${suffix}`;
          suffix += 1;
        }

        usedIds.add(candidate);
        return candidate;
      };

      const allocateUniqueName = (preferredName: string) => {
        const baseName = preferredName.trim() || "wallet";
        let candidate = baseName;
        let suffix = 2;

        while (usedNames.has(normalizeWalletName(candidate))) {
          candidate = `${baseName} (${suffix})`;
          suffix += 1;
        }

        usedNames.add(normalizeWalletName(candidate));
        return candidate;
      };

      let addedCount = 0;
      let updatedCount = 0;
      let renamedCount = 0;

      for (const importedProfile of importedProfiles) {
        const importedPublicKey = normalizedIdentity(
          importedProfile.publicKey,
        );
        const importedMinerAddress = normalizedIdentity(
          importedProfile.minerAddress,
        );
        const existingIndex =
          (importedPublicKey
            ? publicKeyToIndex.get(importedPublicKey)
            : undefined) ??
          (importedMinerAddress
            ? minerAddressToIndex.get(importedMinerAddress)
            : undefined);

        if (existingIndex !== undefined) {
          const existingProfile = nextProfiles[existingIndex];
          const updatedProfile: WalletProfile = {
            ...importedProfile,
            id: existingProfile.id,
            walletName: existingProfile.walletName,
            gridSlot: existingProfile.gridSlot,
            gridSpan: existingProfile.gridSpan,
          };

          nextProfiles[existingIndex] = updatedProfile;
          indexProfile(updatedProfile, existingIndex);
          updatedCount += 1;
          continue;
        }

        const requestedName = importedProfile.walletName.trim() || "wallet";
        const nameAlreadyExists = usedNames.has(
          normalizeWalletName(requestedName),
        );
        const uniqueName = allocateUniqueName(requestedName);

        if (nameAlreadyExists) {
          renamedCount += 1;
          addLog(
            `[BACKUP] Wallet name conflict: "${requestedName}" was imported as "${uniqueName}".`,
          );
        }

        const importedId =
          typeof importedProfile.id === "string"
            ? importedProfile.id
            : uniqueName;
        const uniqueId = allocateUniqueId(importedId || uniqueName);
        const addedProfile: WalletProfile = {
          ...importedProfile,
          id: uniqueId,
          walletName: uniqueName,
          gridSlot: firstAvailableWalletGridSlot(nextProfiles),
        };

        const addedIndex = nextProfiles.length;
        nextProfiles.push(addedProfile);
        indexProfile(addedProfile, addedIndex);
        addedCount += 1;
      }

      const normalizedProfiles = normalizeWalletGridSlots(nextProfiles);

      stopAll();

      const nextActiveProfileId =
        normalizedProfiles.find(
          (profile) => profile.id === activeProfileId,
        )?.id ??
        normalizedProfiles[0]?.id ??
        "";

      await persistProfiles(
        normalizedProfiles,
        nextActiveProfileId,
      );

      profilesRef.current = normalizedProfiles;
      setProfiles(normalizedProfiles);
      setActiveProfileId(nextActiveProfileId);
      await initializeAllProfiles(normalizedProfiles);

      addLog(
        `[BACKUP] Encrypted wallet backup imported: ${addedCount} added, ${updatedCount} updated, ${renamedCount} name conflict(s).`,
      );

      if (transferPath) {
        await invoke("remove_wallet_transfer", { path: transferPath });
      }

      await message(
        `${importedProfiles.length} wallet(s) processed: ${addedCount} added, ${updatedCount} updated.`,
        {
          title: "CappAckiMiner wallet backup",
          kind: "info",
        },
      );
    } catch (error) {
      addLog(
        `[BACKUP] Import failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  };


  const createMinerInstance = async (profile: WalletProfile) => {
    const control = getControl(profile.id);
    const engineGeneration = engineGenerationRef.current;

    try {
      control.miner?.free();
    } catch {
      // Ignore stale instance cleanup errors.
    }

    const miner = await Miner.new(
      ENDPOINTS,
      APP_ID,
      profile.minerAddress,
      profile.publicKey,
      profile.secretKey,
    );

    if (engineGeneration !== engineGenerationRef.current) {
      try {
        miner.free();
      } catch {
        // The obsolete mode engine is already being discarded.
      }
      throw new Error("Mining engine mode changed during initialization.");
    }

    control.miner = miner;

    updateRuntimeState(profile.id, {
      initialized: true,
      status: "READY",
      lastError: "",
    });

    addLog(`[READY:${profile.walletName}] Miner initialized.`);
  };

  const initializeAllProfiles = async (
    storedProfiles: WalletProfile[],
    replaceRuntimeStates = true,
  ) => {
    const initialStates: Record<string, WalletRuntimeState> = {};

    for (const profile of storedProfiles) {
      const cachedRaw = balanceIncomeLedgerRef.current[profile.id]?.lastRaw;

      initialStates[profile.id] = {
        ...createEmptyRuntime(),
        nacklBalance: cachedRaw
          ? formatWalletBalanceRaw(cachedRaw)
          : "—",
        status: "RESTORING",
      };
    }

    setRuntimeStates((current) => {
      if (replaceRuntimeStates) {
        return initialStates;
      }

      const next = { ...current };
      for (const profile of storedProfiles) {
        next[profile.id] = {
          ...(current[profile.id] ?? initialStates[profile.id]),
          initialized: false,
          autoMine: false,
          mining: false,
          status: "RESTORING",
          lastError: "",
        };
      }
      return next;
    });

    for (const profile of storedProfiles) {
      const maxRestoreAttempts = 3;

      for (let attempt = 1; attempt <= maxRestoreAttempts; attempt += 1) {
        try {
          addLog(
            `[PROFILE] Restoring wallet: ${profile.walletName} ` +
              `(attempt ${attempt}/${maxRestoreAttempts})...`,
          );
          await createMinerInstance(profile);
          addLog(`[PROFILE] Wallet restored: ${profile.walletName}.`);
          break;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);

          if (attempt < maxRestoreAttempts) {
            const retryDelayMs = attempt * 2_500;

            updateRuntimeState(profile.id, {
              initialized: false,
              status: "RESTORE RETRY",
              lastError: message,
            });
            addLog(
              `[RECOVERY:${profile.walletName}] Restore attempt ${attempt} failed; ` +
                `retrying in ${retryDelayMs / 1000} seconds: ${message}`,
            );
            await sleep(retryDelayMs);
            continue;
          }

          updateRuntimeState(profile.id, {
            initialized: false,
            status: "RESTORE FAILED",
            lastError: message,
          });

          addLog(
            `[ERROR:${profile.walletName}] Wallet restore failed after ` +
              `${maxRestoreAttempts} attempts: ${message}`,
          );
        }
      }
    }
  };

  const loadProfiles = async () => {
    const store = await getProfileStore();

    const storedLedger = await store.get<unknown>(
      BALANCE_INCOME_LEDGER_STORE_KEY,
    );
    const mergedLedger = mergeBalanceIncomeLedgers(
      balanceIncomeLedgerRef.current,
      storedLedger,
    );

    balanceIncomeLedgerRef.current = mergedLedger;

    try {
      localStorage.setItem(
        BALANCE_INCOME_LEDGER_KEY,
        JSON.stringify(mergedLedger),
      );
    } catch {
      // The Tauri store remains the durable source if localStorage is unavailable.
    }

    await store.set(BALANCE_INCOME_LEDGER_STORE_KEY, mergedLedger);
    await store.save();

    const storedProfileRecords =
      (await store.get<StoredWalletProfile[]>(PROFILES_KEY)) ?? [];
    let profilesNeedSecurePersist = storedProfileRecords.some(
      (profile) => typeof profile.secretKey === "string",
    );
    let storedProfiles = await Promise.all(
      storedProfileRecords.map(restoreStoredProfile),
    );

    if (storedProfiles.length === 0) {
      const legacyProfile =
        await store.get<Omit<StoredWalletProfile, "id" | "createdAt">>(
          LEGACY_PROFILE_KEY,
        );

      if (legacyProfile) {
        const secretKey = legacyProfile.protectedSecretKey
          ? await invoke<string>("unprotect_wallet_secret", {
              protectedSecret: legacyProfile.protectedSecretKey,
            })
          : legacyProfile.secretKey;
        if (!secretKey) {
          throw new Error(`Wallet secret is unavailable for ${legacyProfile.walletName}.`);
        }
        const migrated: WalletProfile = {
          walletName: legacyProfile.walletName,
          minerAddress: legacyProfile.minerAddress,
          publicKey: legacyProfile.publicKey,
          secretKey,
          id: normalizeWalletName(legacyProfile.walletName),
          createdAt: Date.now(),
        };

        storedProfiles = [migrated];
        profilesNeedSecurePersist = true;

        addLog(
          `[PROFILE] Existing wallet migrated: ${migrated.walletName}.`,
        );
      }
    }

    const normalizedProfiles = normalizeWalletGridSlots(storedProfiles);

    if (JSON.stringify(normalizedProfiles) !== JSON.stringify(storedProfiles)) {
      storedProfiles = normalizedProfiles;
      profilesNeedSecurePersist = true;
    }

    profilesRef.current = storedProfiles;
    setProfiles(storedProfiles);
    refreshBalanceIncomeDisplay();

    if (storedProfiles.length === 0) {
      addLog("[PROFILE] No saved wallets found.");
      return;
    }

    const savedActiveId =
      (await store.get<string>(ACTIVE_PROFILE_KEY)) ??
      storedProfiles[0].id;

    if (profilesNeedSecurePersist) {
      await persistProfiles(storedProfiles, savedActiveId);
      await store.delete(LEGACY_PROFILE_KEY);
      await store.save();
      addLog("[SECURITY] Wallet secrets migrated to Windows DPAPI protection.");
    }

    const selected =
      storedProfiles.find((profile) => profile.id === savedActiveId) ??
      storedProfiles[0];

    setActiveProfileId(selected.id);
    await initializeAllProfiles(storedProfiles);
  };

  useEffect(() => {
    // Fast Refresh reruns this effect while preserving refs. Re-enable async
    // initialization after the previous effect cleanup marked it cancelled.
    cancelledRef.current = false;

    const initializeApp = async () => {
      try {
        await initBeeSdk({
  module_or_path: "/bee_sdk_bg.wasm",
});

walletSdkRef.current = new Wallet(
  ENDPOINTS,
  null,
  "https://app-backend.ackinacki.org/api",
  APP_ID,
);

setSdkReady(true);
        addLog("[SDK] Bee Engine SDK loaded.");

        await loadProfiles();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);

        addLog(`[ERROR] Application initialization failed: ${message}`);
      } finally {
        setRestoring(false);
      }
    };

    void initializeApp();

    return () => {
      cancelledRef.current = true;
      document.documentElement.dataset.miningPerformance = "off";
      for (const timer of startAllTimersRef.current) {
        window.clearTimeout(timer);
      }
      startAllTimersRef.current.clear();

      for (const profileId of controlsRef.current.keys()) {
        stopAndFreeWallet(profileId);
      }

      try {
        walletSdkRef.current?.free();
      } catch {
        // Ignore Wallet SDK cleanup errors.
      }

      walletSdkRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (restoring || pendingTransferCheckedRef.current) {
      return;
    }

    pendingTransferCheckedRef.current = true;

    const importPendingTransfer = async () => {
      try {
        const transferPath = await invoke<string | null>(
          "get_pending_wallet_transfer",
        );

        if (!transferPath) {
          return;
        }

        lastSeenPendingTransferPathRef.current = transferPath;
        pendingTransferImportInFlightRef.current = true;
        const bytes = await invoke<number[]>("read_wallet_backup_file", {
          path: transferPath,
        });
        await importWalletBackup(
          new Blob([new Uint8Array(bytes)]),
          transferPath,
        );
      } catch (error) {
        addLog(
          `[BACKUP] Pending transfer could not be imported: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        pendingTransferImportInFlightRef.current = false;
      }
    };

    void importPendingTransfer();
  }, [restoring]);

  useEffect(() => {
    if (restoring) {
      return;
    }

    let cancelled = false;

    const checkForNewTransfer = async () => {
      if (
        cancelled ||
        pendingTransferImportInFlightRef.current ||
        pendingTransferReloadScheduledRef.current
      ) {
        return;
      }

      try {
        const transferPath = await invoke<string | null>(
          "get_pending_wallet_transfer",
        );

        if (
          !transferPath ||
          transferPath === lastSeenPendingTransferPathRef.current
        ) {
          return;
        }

        lastSeenPendingTransferPathRef.current = transferPath;
        pendingTransferReloadScheduledRef.current = true;
        addLog(
          "[BACKUP] New wallet transfer detected; the app will refresh in 5 seconds.",
        );

        window.setTimeout(() => {
          if (!cancelled) {
            window.location.reload();
          }
        }, 5_000);
      } catch (error) {
        addLog(
          `[BACKUP] Transfer check failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };

    const timer = window.setInterval(() => {
      void checkForNewTransfer();
    }, 1_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [restoring]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;

    const activeThemeKey =
      appViewMode === "lite" ? LITE_THEME_KEY : MAIN_THEME_KEY;

    localStorage.setItem(activeThemeKey, theme);
  }, [appViewMode, theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.skin = skin;
    localStorage.setItem(SKIN_KEY, skin);
  }, [skin]);

  useEffect(() => {
    document.documentElement.dataset.uiShape = uiShape;
    localStorage.setItem(UI_SHAPE_KEY, uiShape);
  }, [uiShape]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.animations = animationsEnabled ? "on" : "off";
    localStorage.setItem(ANIMATION_SETTINGS_KEY, JSON.stringify(animationsEnabled));
  }, [animationsEnabled]);

  useEffect(() => {
    localStorage.setItem(
      WATCHDOG_ENABLED_KEY,
      watchdogEnabled ? "1" : "0",
    );
  }, [watchdogEnabled]);

  useEffect(() => {
    localStorage.setItem(
      RECONNECT_VERIFY_KEY,
      verifyReconnectKey ? "1" : "0",
    );
  }, [verifyReconnectKey]);

  useEffect(() => {
    localStorage.setItem("miner-language", language);
    document.documentElement.lang = language === "zh" ? "zh-CN" : language;
    document.documentElement.dir = "ltr";
  }, [language]);



  useEffect(() => {
    runtimeStatesRef.current = runtimeStates;
  }, [runtimeStates]);

  useEffect(() => {
    profilesRef.current = profiles;
  }, [profiles]);

  useEffect(() => {
    if (utilityPanel === "none") return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setUtilityPanel("none");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [utilityPanel]);
useEffect(() => {
  if (walletMenuId === null) {
    return;
  }

  const handleOutsideClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement;

    if (target.closest(".wallet-menu-wrap")) {
      return;
    }

    setWalletMenuId(null);
  };

  document.addEventListener("mousedown", handleOutsideClick);

  return () => {
    document.removeEventListener("mousedown", handleOutsideClick);
  };
}, [walletMenuId]);

  useEffect(() => {
    if (!appMenuOpen) {
      return;
    }

    const closeAppMenuOutside = (event: PointerEvent) => {
      const target = event.target;

      if (!(target instanceof Element)) {
        setAppMenuOpen(false);
        return;
      }

      /*
        Menü içerisindeki seçimler açık kalır.
        Menü ve logo dışındaki uygulama alanına yapılan her tıklama kapatır.
        Logo kendi onClick işlemiyle açıp kapatmaya devam eder.
      */
      if (
        target.closest(".app-menu") ||
        target.closest(".brand-menu-button")
      ) {
        return;
      }

      setAppMenuOpen(false);
    };

    document.addEventListener(
      "pointerdown",
      closeAppMenuOutside,
      true,
    );

    return () => {
      document.removeEventListener(
        "pointerdown",
        closeAppMenuOutside,
        true,
      );
    };
  }, [appMenuOpen]);

  const waitForMinerAddress = async (
    walletName: string,
  ): Promise<string> => {
    let lastError = "";

    for (let attempt = 1; attempt <= 180; attempt += 1) {
      if (cancelledRef.current) {
        throw new Error("Authorization was cancelled.");
      }

      try {
        const address = await get_miner_address_by_wallet_name({
          client_config: CLIENT_CONFIG,
          wallet_name: walletName,
        });

        if (address) {
          return address;
        }
      } catch (error) {
        lastError =
          error instanceof Error ? error.message : String(error);
      }

      if (attempt === 1) {
        addLog(
          `[WAITING] Waiting for ${walletName} Miner activation...`,
        );
      }

      if (attempt % 15 === 0) {
        addLog(
          `[WAITING] ${walletName} Miner is not active yet (${attempt}/180).`,
        );
      }

      await sleep(1000);
    }

    throw new Error(
      lastError ||
        "Miner account did not become active within 3 minutes.",
    );
  };

  const addWallet = async () => {
    if (!sdkReady || authorizing || restoring || authorizationInFlightRef.current) {
      return;
    }

    authorizationInFlightRef.current = true;
    cancelledRef.current = false;
    setAuthorizing(true);
    setQrCode("");
    setDeepLink("");
    setConnectedWalletName("");

    try {
      const walletName = normalizeWalletName(newWalletName);
      if (!walletName) {
        throw new Error("Enter the AN Wallet account name first.");
      }
      if (profiles.some((profile) => profile.id === walletName)) {
        throw new Error(`${walletName} is already saved.`);
      }

      addLog(`[AUTH] Generating mining keys for ${walletName}...`);
      const generated = await gen_mining_keys(APP_ID);
      const publicKey = String(generated.public);
      const secretKey = String(generated.secret);
      const link = String(generated.deep_link);

      setDeepLink(link);
      setAuthorizationStage("waiting-mining");

      const generatedQr = await QRCode.toDataURL(link, {
        width: 260,
        margin: 2,
        errorCorrectionLevel: "M",
      });
      setQrCode(generatedQr);

      addLog(`[AUTH] Authorization QR created for ${walletName}.`);
      addLog(`[WAITING] Scan the mining QR with ${walletName} AN Wallet and approve.`);

      generated.free();

      const address = await waitForMinerAddress(walletName);
      setConnectedWalletName(walletName);
      setAuthorizationStage("requesting-key");
      addLog(`[AUTH] ${walletName} Miner address: ${address}`);
      addLog(`[AUTH:${walletName}] Verifying mining key on-chain...`);

      await ensure_mining_keys_propagated({
        client_config: CLIENT_CONFIG,
        miner_address: address,
        app_id: APP_ID,
        expected_owner_public: publicKey,
        max_attempts: 180,
        interval_ms: 1000,
      });

      const profile: WalletProfile = {
        id: walletName,
        walletName,
        minerAddress: address,
        publicKey,
        secretKey,
        createdAt: Date.now(),
        gridSlot: firstAvailableWalletGridSlot(profiles),
      };

      const nextProfiles = [...profiles, profile];
      await persistProfiles(nextProfiles, profile.id);
      setProfiles(nextProfiles);
      setActiveProfileId(profile.id);
      setNewWalletName("");
      setConnectedWalletName("");
      setQrCode("");
      setDeepLink("");
      setRuntimeStates((current) => ({
        ...current,
        [profile.id]: {
          ...createEmptyRuntime(),
          status: "RESTORING",
        },
      }));
      await createMinerInstance(profile);
      addLog(`[PROFILE] Wallet saved: ${walletName}.`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      addLog(`[ERROR] Wallet authorization failed: ${message}`);
    } finally {
      authorizationInFlightRef.current = false;
      setAuthorizationStage("idle");
      setAuthorizing(false);
    }
  };

  const moveProfileToGridSlot = (
    current: WalletProfile[],
    draggedId: string,
    targetSlot: number,
  ) => {
    const normalized = normalizeWalletGridSlots(current);
    const draggedProfile = normalized.find(
      (profile) => profile.id === draggedId,
    );
    const targetProfile = profileOccupyingGridSlot(
      normalized,
      targetSlot,
      new Set([draggedId]),
    );

    if (!draggedProfile || draggedProfile.gridSlot === targetSlot) {
      return current;
    }

    const previousSlot = draggedProfile.gridSlot ?? 0;
    const draggedSpan = walletProfileSpan(draggedProfile);

    if (!targetProfile) {
      if (
        !canPlaceWalletProfile(
          normalized,
          draggedId,
          targetSlot,
          draggedSpan,
        )
      ) {
        return current;
      }

      return normalized.map((profile) =>
        profile.id === draggedId
          ? { ...profile, gridSlot: targetSlot }
          : profile,
      );
    }

    const targetStartSlot = targetProfile.gridSlot ?? targetSlot;
    const targetSpan = walletProfileSpan(targetProfile);
    const swappingIds = new Set([draggedId, targetProfile.id]);

    if (
      !canPlaceWalletProfile(
        normalized,
        draggedId,
        targetStartSlot,
        draggedSpan,
        swappingIds,
      ) ||
      !canPlaceWalletProfile(
        normalized,
        targetProfile.id,
        previousSlot,
        targetSpan,
        swappingIds,
      )
    ) {
      return current;
    }

    return normalized.map((profile) => {
      if (profile.id === draggedId) {
        return { ...profile, gridSlot: targetStartSlot };
      }

      if (targetProfile && profile.id === targetProfile.id) {
        return { ...profile, gridSlot: previousSlot };
      }

      return profile;
    });
  };

  const toggleWalletGridSpan = async (profileId: string) => {
    const normalized = normalizeWalletGridSlots(profilesRef.current);
    const profile = normalized.find((item) => item.id === profileId);

    if (!profile) return;

    const currentSpan = walletProfileSpan(profile);
    const nextSpan: 1 | 2 = currentSpan === 2 ? 1 : 2;
    const slot = profile.gridSlot ?? 0;

    if (nextSpan === 2) {
      const column = Math.floor(slot / WALLET_GRID_ROWS);
      const profilesInColumn = normalized.filter(
        (item) =>
          Math.floor((item.gridSlot ?? 0) / WALLET_GRID_ROWS) === column,
      );

      const candidateSlots = [slot, slot - 1].filter(
        (candidate, index, values) =>
          candidate >= column * WALLET_GRID_ROWS &&
          values.indexOf(candidate) === index,
      );
      const expandableSlot = candidateSlots.find((candidate) =>
        canPlaceWalletProfile(normalized, profileId, candidate, 2),
      );

      if (profilesInColumn.length > 2 || expandableSlot === undefined) {
        addLog(
          `[PROFILE] ${profile.walletName}: 1x2 size needs an adjacent empty cell and at most two cards in its column.`,
        );
        return;
      }

      const nextProfiles = normalized.map((item) =>
        item.id === profileId
          ? { ...item, gridSlot: expandableSlot, gridSpan: nextSpan }
          : item,
      );

      profilesRef.current = nextProfiles;
      setProfiles(nextProfiles);
      setWalletMenuId(null);
      await persistProfiles(nextProfiles, activeProfileId);
      addLog(`[PROFILE] ${profile.walletName}: card size changed to 1x2.`);
      return;
    }

    const nextProfiles = normalized.map((item) =>
      item.id === profileId
        ? { ...item, gridSpan: nextSpan }
        : item,
    );

    profilesRef.current = nextProfiles;
    setProfiles(nextProfiles);
    setWalletMenuId(null);
    await persistProfiles(nextProfiles, activeProfileId);
    addLog(
      `[PROFILE] ${profile.walletName}: card size changed to 1x${nextSpan}.`,
    );
  };

  const handleWalletMouseDown = (
    event: React.MouseEvent<HTMLElement>,
    profileId: string,
  ) => {
    if (event.button !== 0) {
      return;
    }

    const eventTarget = event.target as HTMLElement;
    if (
      eventTarget.closest(
        "button:not(.wallet-name-button), input, textarea, select, a",
      )
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    draggedProfileIdRef.current = profileId;
    setDraggedProfileId(profileId);
    setDragOverProfileId(profileId);
    setDragPreview({
      profileId,
      x: event.clientX,
      y: event.clientY,
    });

    const startingSlot =
      normalizeWalletGridSlots(profilesRef.current).find(
        (profile) => profile.id === profileId,
      )?.gridSlot ?? 0;
    let currentTargetSlot: number | null = startingSlot;
    setDragOverSlot(startingSlot);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();

      setDragPreview((current) =>
        current
          ? {
              ...current,
              x: moveEvent.clientX,
              y: moveEvent.clientY,
            }
          : current,
      );

      const grid = document.querySelector<HTMLElement>(
        "[data-wallet-grid]",
      );

      if (!grid) {
        return;
      }

      const rect = grid.getBoundingClientRect();
      const isInsideGrid =
        moveEvent.clientX >= rect.left &&
        moveEvent.clientX <= rect.right &&
        moveEvent.clientY >= rect.top &&
        moveEvent.clientY <= rect.bottom;

      if (!isInsideGrid) {
        currentTargetSlot = null;
        setDragOverSlot(null);
        setDragOverProfileId(null);
        return;
      }

      const visibleGridColumns = walletGridColumns;
      const column = Math.min(
        visibleGridColumns - 1,
        Math.max(
          0,
          Math.floor(
            ((moveEvent.clientX - rect.left) / rect.width) *
              visibleGridColumns,
          ),
        ),
      );
      const row = Math.min(
        WALLET_GRID_ROWS - 1,
        Math.max(
          0,
          Math.floor(
            ((moveEvent.clientY - rect.top) / rect.height) *
              WALLET_GRID_ROWS,
          ),
        ),
      );
      let targetSlot = column * WALLET_GRID_ROWS + row;
      const draggedProfile = profilesRef.current.find(
        (profile) => profile.id === profileId,
      );

      if (
        draggedProfile &&
        walletProfileSlots(draggedProfile).includes(targetSlot)
      ) {
        targetSlot = draggedProfile.gridSlot ?? targetSlot;
      }
      const targetProfile = profileOccupyingGridSlot(
        profilesRef.current,
        targetSlot,
        new Set([profileId]),
      );

      currentTargetSlot = targetSlot;
      setDragOverSlot(targetSlot);
      setDragOverProfileId(targetProfile?.id ?? null);
    };

    const handleMouseUp = async () => {
      document.removeEventListener(
        "mousemove",
        handleMouseMove,
      );
      document.removeEventListener(
        "mouseup",
        handleMouseUp,
      );

      const draggedId = draggedProfileIdRef.current;
      let nextProfiles = profilesRef.current;

      if (
        draggedId &&
        currentTargetSlot !== null
      ) {
        nextProfiles = moveProfileToGridSlot(
          profilesRef.current,
          draggedId,
          currentTargetSlot,
        );

        profilesRef.current = nextProfiles;
        setProfiles(nextProfiles);
      }

      draggedProfileIdRef.current = null;
      setDraggedProfileId(null);
      setDragOverProfileId(null);
      setDragOverSlot(null);
      setDragPreview(null);

      try {
        await persistProfiles(
          nextProfiles,
          activeProfileId,
        );

        addLog("[PROFILE] Wallet order saved.");
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : String(error);

        addLog(
          `[ERROR] Wallet order could not be saved: ${message}`,
        );
      }
    };

    document.addEventListener(
      "mousemove",
      handleMouseMove,
    );
    document.addEventListener(
      "mouseup",
      handleMouseUp,
      { once: true },
    );
  };

  const selectProfile = async (profileId: string) => {
    setActiveProfileId(profileId);

    try {
      await persistProfiles(profiles, profileId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      addLog(`[ERROR] Active profile could not be saved: ${message}`);
    }
  };

  const removeProfile = async (profileId: string) => {
  const profile =
    profiles.find((item) => item.id === profileId) ?? null;

  if (!profile) {
    return;
  }

  stopAndFreeWallet(profileId);
  controlsRef.current.delete(profileId);

  const nextProfiles = normalizeWalletGridSlots(
    profiles
      .filter((item) => item.id !== profileId)
      .map((item) => ({ ...item, gridSlot: undefined })),
  );

  const nextActiveId =
    profileId === activeProfileId
      ? nextProfiles[0]?.id ?? ""
      : activeProfileId;

  await persistProfiles(nextProfiles, nextActiveId);

  setProfiles(nextProfiles);
  setActiveProfileId(nextActiveId);
  setWalletMenuId(null);

  setRuntimeStates((current) => {
    const next = { ...current };
    delete next[profileId];
    return next;
  });

    addLog(`[PROFILE] Wallet removed: ${profile.walletName}.`);
  };

  const reconnectWallet = async (profileId: string) => {
    if (!sdkReady || authorizing || restoring) {
      return;
    }

    const profile =
      profilesRef.current.find((item) => item.id === profileId) ?? null;

    if (!profile) {
      return;
    }


    cancelledRef.current = false;
    setWalletMenuId(null);
    setReconnectingProfileId(profileId);
    setAuthorizing(true);
    setQrCode("");
    setDeepLink("");
    setUtilityPanel("add");

    try {
      addLog(
        `[AUTH:${profile.walletName}] Generating new QR connection...`,
      );

      stopAndFreeWallet(profile.id);

      const generated = await gen_mining_keys(APP_ID);
      const publicKey = String(generated.public);
      const secretKey = String(generated.secret);
      const link = String(generated.deep_link);

      setDeepLink(link);

      const generatedQr = await QRCode.toDataURL(link, {
        width: 260,
        margin: 2,
        errorCorrectionLevel: "M",
      });

      setQrCode(generatedQr);

      addLog(
        `[AUTH:${profile.walletName}] Reconnection QR created.`,
      );
      addLog(
        `[WAITING:${profile.walletName}] Scan the QR with the same AN Wallet account and approve.`,
      );

      generated.free();

      const address = await waitForMinerAddress(profile.walletName);

      addLog(
        `[AUTH:${profile.walletName}] Miner address: ${address}`,
      );
      if (verifyReconnectKey) {
        updateRuntimeState(profile.id, {
          initialized: false,
          autoMine: false,
          mining: false,
          status: "VERIFYING KEY",
          lastError: "",
        });

        addLog(
          `[AUTH:${profile.walletName}] Verifying new mining key on-chain...`,
        );

        await ensure_mining_keys_propagated({
          client_config: CLIENT_CONFIG,
          miner_address: address,
          app_id: APP_ID,
          expected_owner_public: publicKey,
          max_attempts: 180,
          interval_ms: 1000,
        });

        addLog(
          `[AUTH:${profile.walletName}] Mining key verified on-chain.`,
        );
      } else {
        addLog(
          `[AUTH:${profile.walletName}] Mining key verification skipped by user setting.`,
        );
      }

      const updatedProfile: WalletProfile = {
        ...profile,
        minerAddress: address,
        publicKey,
        secretKey,
      };

      const nextProfiles = profiles.map((item) =>
        item.id === profile.id ? updatedProfile : item,
      );

      await persistProfiles(nextProfiles, activeProfileId);

      profilesRef.current = nextProfiles;
      setProfiles(nextProfiles);

      updateRuntimeState(profile.id, {
        initialized: false,
        autoMine: false,
        mining: false,
        status: "RESTORING",
        lastError: "",
      });

      await createMinerInstance(updatedProfile);

      addLog(
        `[PROFILE:${profile.walletName}] QR reconnection completed successfully.`,
      );

      setQrCode("");
      setDeepLink("");
      setUtilityPanel("none");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      updateRuntimeState(profile.id, {
        initialized: false,
        autoMine: false,
        mining: false,
        status: "RECONNECT FAILED",
        lastError: message,
      });

      addLog(
        `[ERROR:${profile.walletName}] QR reconnection failed: ${message}`,
      );
    } finally {
      setAuthorizing(false);
      setReconnectingProfileId(null);
    }
  };

  const recoverWallet = async (
    profile: WalletProfile,
    resumeAuto: boolean,
  ) => {
    const control = getControl(profile.id);

    if (control.recovering) {
      return;
    }

    control.recovering = true;
    // Invalidate the current SDK callback immediately. Waiting thirty seconds
    // before doing this lets a terminal event from the broken session start or
    // reject another session while recovery is pending.
    control.sessionGeneration += 1;
    clearRecoveryTimer(profile.id);
    clearTapTimer(profile.id);
    clearNextSessionTimer(profile.id);
    clearSessionWatchdogTimer(profile.id);
    clearSafetyTimer(profile.id);

    updateRuntimeState(profile.id, {
      autoMine: resumeAuto,
      mining: false,
      status: "RECOVERING",
      lastError: "",
    });

    addLog(
      `[RECOVERY:${profile.walletName}] Reinitializing miner in ${RECOVERY_DELAY_MS / 1000} seconds...`,
    );

    await sleep(RECOVERY_DELAY_MS);

    if (cancelledRef.current || control.manualStop) {
      control.recovering = false;
      return;
    }

    try {
      try {
        control.miner?.stop();
      } catch {}

      try {
        control.miner?.free();
      } catch {}

      control.miner = null;

      await createMinerInstance(profile);

      // Miner.new cannot be aborted. If STOP was pressed while it was
      // awaiting the SDK/network, discard the late instance immediately.
      if (cancelledRef.current || control.manualStop) {
        // Read the miner again after createMinerInstance(). TypeScript cannot
        // infer that the helper assigned control.miner as a side effect.
        const recoveredMiner =
          getControl(profile.id).miner as Miner | null;

        try {
          recoveredMiner?.stop();
        } catch {}

        try {
          recoveredMiner?.free();
        } catch {}

        getControl(profile.id).miner = null;
        control.recovering = false;
        control.autoMine = false;

        if (control.manualStop) {
          updateRuntimeState(profile.id, {
            initialized: false,
            autoMine: false,
            mining: false,
            status: "STOPPED",
            lastError: "",
          });
        }

        return;
      }

      control.recovering = false;
      control.autoMine = resumeAuto;

      updateRuntimeState(profile.id, {
        initialized: true,
        autoMine: resumeAuto,
        mining: false,
        status: resumeAuto ? "RECOVERED" : "READY",
        lastError: "",
      });

      addLog(
        `[RECOVERY:${profile.walletName}] Miner reinitialized successfully.`,
      );

      if (resumeAuto && !control.manualStop) {
        addLog(
          `[RECOVERY:${profile.walletName}] AUTO MINE resuming.`,
        );

        scheduleNextSession(profile, NEXT_SESSION_DELAY_MS);
      }
    } catch (error) {
      control.recovering = false;

      const message =
        error instanceof Error ? error.message : String(error);

      const temporaryNetworkError =
        message.includes("Failed to fetch") ||
        message.includes('error_code: Some("205")') ||
        message.includes("GetAccount");

      if (temporaryNetworkError && resumeAuto && !control.manualStop) {
        control.autoMine = true;

        updateRuntimeState(profile.id, {
          initialized: false,
          autoMine: true,
          mining: false,
          status: "NETWORK WAIT",
          lastError: message,
        });

        addLog(
          `[NETWORK WAIT:${profile.walletName}] Temporary network error. Recovery will retry in 60 seconds.`,
        );

        scheduleRuntimeTimer(
          profile.id,
          "recoveryTimer",
          () => {
            if (
              !cancelledRef.current &&
              control.autoMine &&
              !control.manualStop
            ) {
              void recoverWallet(profile, true);
            }
          },
          60_000,
        );

        return;
      }

      if (resumeAuto && !control.manualStop) {
        control.autoMine = true;

        updateRuntimeState(profile.id, {
          initialized: false,
          autoMine: true,
          mining: false,
          status: "RECOVERY RETRY",
          lastError: message,
        });

        addLog(
          `[RECOVERY:${profile.walletName}] Miner restore failed; automatic recovery will retry in 60 seconds: ${message}`,
        );

        scheduleRuntimeTimer(
          profile.id,
          "recoveryTimer",
          () => {
            if (
              !cancelledRef.current &&
              control.autoMine &&
              !control.manualStop
            ) {
              void recoverWallet(profile, true);
            }
          },
          60_000,
        );
        return;
      }

      control.autoMine = false;

      updateRuntimeState(profile.id, {
        initialized: false,
        autoMine: false,
        mining: false,
        status: "RECOVERY FAILED",
        lastError: message,
      });

      addLog(
        `[ERROR:${profile.walletName}] Automatic recovery failed: ${message}`,
      );
    }
  };
  const startTapLoop = (profile: WalletProfile) => {
    const control = getControl(profile.id);
    const tapConfig = TAP_MODE_CONFIGS[tapMode];
    const tapLimitEnabled = tapConfig.sessionsPerEpoch !== null;

    if (
      !control.miner ||
      control.tapTimer !== null ||
      (tapLimitEnabled && control.tapCount >= tapConfig.tapsPerSession)
    ) {
      return;
    }

    addLog(
      `[AUTO:${profile.walletName}] Tap mode ${tapConfig.label} started.`,
    );

    const sendNextTap = () => {
      if (!control.autoMine || !control.miner) {
        return;
      }

      if (tapLimitEnabled && control.tapCount >= tapConfig.tapsPerSession) {
        return;
      }

      const point =
        TAP_POINTS[control.tapCount % TAP_POINTS.length];

      try {
        control.miner.add_tap(point[0], point[1]);
        control.tapCount += 1;

        updateRuntimeState(profile.id, {
          tapCount: control.tapCount,
          // At the configured tap target the bar turns green and stays green while the SDK
          // returns the real accepted/rejected result for this session.
          acceptedProgressHeld: tapLimitEnabled && control.tapCount >= tapConfig.tapsPerSession,
        });

        if (control.tapCount === tapConfig.tapsPerSession && tapLimitEnabled) {
          addLog(
            `[AUTO:${profile.walletName}] Session ${control.sessionNumber} reached ${tapConfig.tapsPerSession} taps.`,
          );
        }

        if (tapLimitEnabled && control.tapCount >= tapConfig.tapsPerSession) {
          updateRuntimeState(profile.id, {
            status: "WAITING FOR CONFIRMATION",
            acceptedProgressHeld: true,
          });

          addLog(
            `[AUTO:${profile.walletName}] ${tapConfig.tapsPerSession} taps completed; waiting for SDK confirmation.`,
          );

          return;
        }

        scheduleRuntimeTimer(
          profile.id,
          "tapTimer",
          sendNextTap,
          tapConfig.intervalMs,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);

        clearTapTimer(profile.id);
        updateRuntimeState(profile.id, {
          mining: false,
          status: "TAP ERROR",
          lastError: message,
        });

        addLog(
          `[ERROR:${profile.walletName}] add_tap failed; automatic miner recovery started: ${message}`,
        );

        if (control.autoMine && !control.manualStop) {
          void recoverWallet(profile, true);
        }
      }
    };

    scheduleRuntimeTimer(
      profile.id,
      "tapTimer",
      sendNextTap,
      tapConfig.intervalMs,
    );
  };

  const scheduleNextSession = (
    profile: WalletProfile,
    delayMs = NEXT_SESSION_DELAY_MS,
    preserveStatus = false,
  ) => {
    const control = getControl(profile.id);

    if (!control.autoMine) {
      return;
    }

    // finished ve removed arka arkaya gelirse ikinci timer kurma.
    if (control.nextSessionTimer !== null) {
      return;
    }


    if (!preserveStatus) {
      updateRuntimeState(profile.id, {
        status: "READY FOR NEXT",
      });
    }

    addLog(
      `[AUTO:${profile.walletName}] Next session check in ${delayMs / 1000} seconds.`,
    );

    scheduleRuntimeTimer(
      profile.id,
      "nextSessionTimer",
      () => {
        void startWalletSession(profile);
      },
      delayMs,
    );
  };

  const scheduleAfterFailedAttempt = (
    profile: WalletProfile,
    reason: string,
  ) => {
    const control = getControl(profile.id);

    if (!control.autoMine || control.manualStop) {
      return;
    }

    if (control.nextSessionTimer !== null) {
      return;
    }

    updateRuntimeState(profile.id, {
      status: "WAITING NEXT CYCLE",
    });
    addLog(
      `[AUTO:${profile.walletName}] Session ${reason}; waiting for the next ` +
        `SDK cycle. No second 70-tap attempt will run in this session.`,
    );
    scheduleNextSession(profile, NEXT_SESSION_DELAY_MS, true);
  };

  const startSafetyCheck = (profile: WalletProfile) => {
    const control = getControl(profile.id);

    clearNextSessionTimer(profile.id);

    if (
      control.safetyTimer !== null ||
      control.sessionOutcome !== "none" ||
      !control.autoMine ||
      control.manualStop
    ) {
      return;
    }

    updateRuntimeState(profile.id, {
      mining: false,
      status: "SAFETY CHECK",
    });

    addLog(
      `[SAFETY:${profile.walletName}] No definitive result after the SDK session closed; checking for ` +
        `${SESSION_RESULT_GRACE_MS / 1000} more seconds.`,
    );

    scheduleRuntimeTimer(
      profile.id,
      "safetyTimer",
      () => {
      if (
        control.sessionOutcome !== "none" ||
        control.manualStop
      ) {
        return;
      }

      updateRuntimeState(profile.id, {
        mining: false,
        status: "RESULT UNKNOWN - RETRY",
      });

      addLog(
        `[SAFETY:${profile.walletName}] Result is still unknown after the grace period.`,
      );

      // No definitive SDK result arrived within the grace period.
      // Restore the original behavior: count this attempt as rejected.
      control.sessionOutcome = "rejected";

      setRuntimeStates((current) => ({
        ...current,
        [profile.id]: {
          ...(current[profile.id] ?? createEmptyRuntime()),
          status: "REJECTED",
          acceptedProgressHeld: false,
          rejectedSessions:
            (current[profile.id]?.rejectedSessions ?? 0) + 1,
        },
      }));

      addLog(
        `[WARNING:${profile.walletName}] Session ${control.sessionNumber} counted as rejected after the safety timeout.`,
      );

      triggerTapRejectPulse(profile.id);
      scheduleAfterFailedAttempt(profile, "returned no definitive result");
      },
      SESSION_RESULT_GRACE_MS,
    );
  };

  const triggerLiteAcceptedFeedback = (
    profileId: string,
    reward: { amount: string; time: string } | null = null,
  ) => {
    const profile =
      profilesRef.current.find((item) => item.id === profileId) ?? null;

    if (!profile) {
      return;
    }

    const pulseId = Date.now() + Math.floor(Math.random() * 1_000);

    if (reward) {
      litePendingAcceptedAtRef.current.delete(profileId);
    } else {
      litePendingAcceptedAtRef.current.set(profileId, Date.now());
    }

    setLiteAcceptedPulses((current) => ({
      ...current,
      [profileId]: pulseId,
    }));

    window.setTimeout(() => {
      setLiteAcceptedPulses((current) => {
        if (current[profileId] !== pulseId) {
          return current;
        }

        const next = { ...current };
        delete next[profileId];
        return next;
      });
    }, 3_600);

    setLiteAcceptedNotice({
      id: pulseId,
      profileId,
      walletName: profile.walletName,
      rewardAmount: reward?.amount ?? "",
      rewardTime: reward?.time ?? "",
    });

    if (liteAcceptedNoticeTimerRef.current !== null) {
      window.clearTimeout(liteAcceptedNoticeTimerRef.current);
    }

    liteAcceptedNoticeTimerRef.current = window.setTimeout(() => {
      setLiteAcceptedNotice((current) =>
        current?.id === pulseId ? null : current,
      );
      liteAcceptedNoticeTimerRef.current = null;
    }, 5_200);
  };

  const triggerWalletCelebration = (profileId: string) => {
    if (appViewModeRef.current === "lite") {
      triggerLiteAcceptedFeedback(profileId, null);
      return;
    }
    const celebrationId = Date.now();

    const effects = [
      "confetti",
      "water",
      "fire",
      "energy",
      "gold",
      "crystal",
      "cosmic",
      "party",
      "spooky",
      "rainbow",
      "jackpot",
      "hearts",
      "ducks",
      "cats",
      "pizza",
      "lightning",
      "flowers",
      "bubbles",
      "snow",
      "disco",
      "meteor",
      "coins",
      "fireworks",
      "matrix",
      "candy",
      "stars",
      "ocean",
      "arcade",
      "dragon",
      "ufo",
    ];

    const randomEffect =
      effects[Math.floor(Math.random() * effects.length)];

    setCelebrationEffects((current) => ({
      ...current,
      [profileId]: randomEffect,
    }));

    setCelebratingWallets((current) => ({
      ...current,
      [profileId]: celebrationId,
    }));

    window.setTimeout(() => {
      setCelebratingWallets((current) => {
        if (current[profileId] !== celebrationId) {
          return current;
        }

        const next = { ...current };
        delete next[profileId];
        return next;
      });

      setCelebrationEffects((current) => {
        const next = { ...current };
        delete next[profileId];
        return next;
      });
    }, 6_000);
  };

  const triggerTapRejectPulse = (profileId: string) => {
    const control = getControl(profileId);
    const requiredTaps =
      TAP_MODE_CONFIGS[tapMode].tapsPerSession;

    // A delayed or early SDK rejection must not play the full failure scene
    // over a new session that has only just started. The bomb belongs only to
    // a completed 70-tap attempt.
    if (control.tapCount < requiredTaps) {
      return;
    }

    const pulseId = Date.now();

    /* Every failed 70-tap outcome uses the same single red failure scene.
       This covers both a definitive session_rejected event and the safety
       timeout path where no acceptance arrives. */
    if (appViewModeRef.current === "main") {
      triggerRejectedAnimation(profileId);
    }

    setTapRejectPulses((current) => ({
      ...current,
      [profileId]: pulseId,
    }));

    window.setTimeout(() => {
      setTapRejectPulses((current) => {
        if (current[profileId] !== pulseId) {
          return current;
        }

        const next = { ...current };
        delete next[profileId];
        return next;
      });
    }, 6_000);
  };

  const triggerRejectedAnimation = (profileId: string) => {
    const animationId = Date.now();

    setRejectedAftermaths((current) => {
      if (!(profileId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[profileId];
      return next;
    });

    setRejectedAnimations((current) => ({
      ...current,
      [profileId]: animationId,
    }));

    window.setTimeout(() => {
      setRejectedAnimations((current) => {
        if (current[profileId] !== animationId) {
          return current;
        }

        const next = { ...current };
        delete next[profileId];
        return next;
      });

      const aftermathId = Date.now();
      setRejectedAftermaths((current) => ({
        ...current,
        [profileId]: aftermathId,
      }));

      window.setTimeout(() => {
        setRejectedAftermaths((current) => {
          if (current[profileId] !== aftermathId) {
            return current;
          }
          const next = { ...current };
          delete next[profileId];
          return next;
        });
      }, 15_000);
    }, 9_000);
  };

  const handleMinerEvent = (
    profile: WalletProfile,
    event: unknown,
  ) => {
    const control = getControl(profile.id);
    const parsed = parseMinerEvent(event);

    try {
      
    } catch {
      addLog(`[MINER EVENT:${profile.walletName}] Event received.`);
    }

    if (parsed.error) {
      const message = String(parsed.error);

      updateRuntimeState(profile.id, {
        lastError: message,
      });

      addLog(`[ERROR:${profile.walletName}] ${message}`);
    }

    if (
      parsed.action === "status_updated" &&
      parsed.data?.status === "computing"
    ) {
      setRuntimeStates((current) => {
        const currentState =
          current[profile.id] ?? createEmptyRuntime();

        return {
          ...current,
          [profile.id]: {
            ...currentState,
            acceptedEpoch5mStart: "",
            status: "COMPUTING",
            mining: true,
          },
        };
      });

      startTapLoop(profile);
      return;
    }
    if (
      parsed.action === "submit_session_root" &&
      parsed.error
    ) {
      const submitError = String(parsed.error);

      // A submit error is not necessarily a definitive network rejection.
      // Keep the outcome unresolved until session_accepted or
      // session_rejected arrives.
      updateRuntimeState(profile.id, {
        status:
          control.sessionOutcome === "accepted"
            ? "ACCEPTED"
            : control.sessionOutcome === "rejected"
              ? "REJECTED"
              : "RESULT UNCERTAIN",
        lastError: submitError,
      });

      addLog(
        `[SAFETY:${profile.walletName}] Session ${control.sessionNumber} submit result is uncertain; waiting for a definitive SDK result.`,
      );

      return;
    }

    if (parsed.action === "computation_completed") {
      clearTapTimer(profile.id);
      const tapConfig = TAP_MODE_CONFIGS[tapMode];

      const confirmedTaps = Number(parsed.data?.taps ?? 0);
      const displayedConfirmedTaps = Math.min(
        tapConfig.tapsPerSession,
        confirmedTaps,
      );
      control.tapCount = displayedConfirmedTaps;

      updateRuntimeState(profile.id, {
        tapCount: displayedConfirmedTaps,
        status: "COMPUTATION COMPLETED",
      });

      if (
        confirmedTaps >= tapConfig.tapsPerSession &&
        !control.sessionFinalized
      ) {
        control.sessionFinalized = true;

        setRuntimeStates((current) => ({
          ...current,
          [profile.id]: {
            ...(current[profile.id] ?? createEmptyRuntime()),
            tapCount: displayedConfirmedTaps,
            status: "COMPUTATION COMPLETED",
            confirmedSessions:
              (current[profile.id]?.confirmedSessions ?? 0) + 1,
          },
        }));

        addLog(
          `[AUTO:${profile.walletName}] Session ${control.sessionNumber} confirmed with ${displayedConfirmedTaps} visible taps.`,
        );
      }

      return;
    }

    if (parsed.action === "session_accepted") {
      clearSessionWatchdogTimer(profile.id);
      clearSafetyTimer(profile.id);
      clearNextSessionTimer(profile.id);
      const acceptanceWasLate = control.sessionOutcome === "unknown";
      const acceptanceIsNew =
        control.sessionOutcome === "none" || acceptanceWasLate;

      if (acceptanceIsNew) {
        control.sessionOutcome = "accepted";
        setRuntimeStates((current) => ({
          ...current,
          [profile.id]: {
            ...(current[profile.id] ?? createEmptyRuntime()),
            status: "ACCEPTED",
            acceptedEpoch5mStart:
              current[profile.id]?.epoch5mStart ?? "",
            acceptedProgressHeld: true,
            acceptedSessions:
              (current[profile.id]?.acceptedSessions ?? 0) + 1,
          },
        }));

        addLog(
          acceptanceWasLate
            ? `[AUTO:${profile.walletName}] Late SDK result resolved session ${control.sessionNumber} as accepted.`
            : `[AUTO:${profile.walletName}] Session ${control.sessionNumber} accepted.`,
        );

        triggerWalletCelebration(profile.id);

        window.setTimeout(() => {
          void checkWalletHistory(profile.id, false);
          void checkWalletBalances(profile.id, false);
        }, 5_000);

        window.setTimeout(() => {
          void checkWalletHistory(profile.id, false);
          void checkWalletBalances(profile.id, false);
        }, 20_000);

        window.setTimeout(() => {
          void checkWalletHistory(profile.id, false);
          void checkWalletBalances(profile.id, false);
          void refreshPortfolioIncome();
        }, 45_000);

        scheduleNextSession(profile, NEXT_SESSION_DELAY_MS, true);
      }

      return;
    }

    if (parsed.action === "session_rejected") {
      clearSessionWatchdogTimer(profile.id);
      clearSafetyTimer(profile.id);
      const rejectionWasLate = control.sessionOutcome === "unknown";
      const rejectionIsNew =
        control.sessionOutcome === "none" || rejectionWasLate;

      if (rejectionIsNew) {
        clearNextSessionTimer(profile.id);
        control.sessionOutcome = "rejected";
        triggerTapRejectPulse(profile.id);

        setRuntimeStates((current) => ({
          ...current,
          [profile.id]: {
            ...(current[profile.id] ?? createEmptyRuntime()),
            status: "REJECTED",
            acceptedProgressHeld: false,
            rejectedSessions:
              (current[profile.id]?.rejectedSessions ?? 0) + 1,
          },
        }));

        addLog(
          rejectionWasLate
            ? `[WARNING:${profile.walletName}] Late SDK result resolved session ${control.sessionNumber} as rejected.`
            : `[WARNING:${profile.walletName}] Session ${control.sessionNumber} rejected; waiting for the next SDK cycle.`,
        );
      }

      if (
        rejectionIsNew &&
        control.autoMine &&
        !control.manualStop
      ) {
        scheduleAfterFailedAttempt(profile, "was rejected");
      }

      return;
    }

    if (
      parsed.action === "status_updated" &&
      parsed.data?.status === "finished"
    ) {
      clearTapTimer(profile.id);
      clearSessionWatchdogTimer(profile.id);

      updateRuntimeState(profile.id, {
        mining: false,
        status:
          control.sessionOutcome === "accepted"
            ? "ACCEPTED"
            : control.sessionOutcome === "rejected"
              ? "REJECTED"
              : control.sessionOutcome === "unknown"
                ? "RESULT UNKNOWN"
                : "SAFETY CHECK",
      });

      if (control.sessionOutcome === "accepted") {
        clearSafetyTimer(profile.id);
        scheduleNextSession(profile, NEXT_SESSION_DELAY_MS, true);
        return;
      }

      if (control.sessionOutcome === "rejected") {
        clearSafetyTimer(profile.id);

        if (control.autoMine && !control.manualStop) {
          scheduleAfterFailedAttempt(profile, "was rejected");
        }

        return;
      }

      if (control.sessionOutcome === "unknown") {
        clearSafetyTimer(profile.id);

        if (control.autoMine && !control.manualStop) {
          scheduleAfterFailedAttempt(profile, "returned no definitive result");
        }

        return;
      }

      startSafetyCheck(profile);
      return;
    }

    if (
  parsed.action === "status_updated" &&
  parsed.data?.status === "removed"
) {
  clearTapTimer(profile.id);
  clearSessionWatchdogTimer(profile.id);

  updateRuntimeState(profile.id, {
    mining: false,
  });

  // User intentionally pressed STOP.
  // The SDK may report "removed + miner_state_corrupted" while stopping.
  // In that case, do NOT trigger automatic recovery.
  if (control.manualStop) {
    clearNextSessionTimer(profile.id);
    clearSafetyTimer(profile.id);
    clearRecoveryTimer(profile.id);

    control.autoMine = false;
    control.recovering = false;

    updateRuntimeState(profile.id, {
      autoMine: false,
      mining: false,
      status: "STOPPED",
      lastError: "",
    });

    addLog(
      `[AUTO:${profile.walletName}] Manual stop completed; recovery skipped.`,
    );

    return;
  }

  if (parsed.data?.miner_state_corrupted) {
        clearNextSessionTimer(profile.id);

        if (control.sessionOutcome === "none") {
          control.sessionOutcome = "rejected";
          triggerTapRejectPulse(profile.id);

          setRuntimeStates((current) => ({
            ...current,
            [profile.id]: {
              ...(current[profile.id] ?? createEmptyRuntime()),
              status: "REJECTED",
              acceptedProgressHeld: false,
              rejectedSessions:
                (current[profile.id]?.rejectedSessions ?? 0) + 1,
            },
          }));

          addLog(
            `[WARNING:${profile.walletName}] Corrupted result-free session ${control.sessionNumber} counted as rejected.`,
          );
        }

        const corruptedSeed = parsed.data.seed;

        if (corruptedSeed && control.miner) {
          try {
            control.miner.remove_seed(corruptedSeed);
            addLog(
              `[RECOVERY:${profile.walletName}] Corrupted seed removed: ${corruptedSeed}`,
            );
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);

            addLog(
              `[ERROR:${profile.walletName}] Seed cleanup failed: ${message}`,
            );
          }
        }

        const resumeAuto = control.autoMine;

        updateRuntimeState(profile.id, {
          autoMine: resumeAuto,
          mining: false,
          status: "RECOVERY REQUIRED",
        });

        void recoverWallet(profile, resumeAuto);
        return;
      }

      if (control.sessionOutcome === "accepted") {
        clearSafetyTimer(profile.id);
        scheduleNextSession(profile, NEXT_SESSION_DELAY_MS, true);
        return;
      }

      if (control.sessionOutcome === "rejected") {
        clearSafetyTimer(profile.id);

        if (control.autoMine && !control.manualStop) {
          scheduleAfterFailedAttempt(profile, "was rejected");
        }

        return;
      }

      if (control.sessionOutcome === "unknown") {
        clearSafetyTimer(profile.id);

        if (control.autoMine && !control.manualStop) {
          scheduleAfterFailedAttempt(profile, "returned no definitive result");
        }

        return;
      }

      startSafetyCheck(profile);
    }
  };

  const startWalletSession = async (profile: WalletProfile) => {
    const control = getControl(profile.id);

    const currentLicense = getLicenseSnapshot();
    if (
      !licenseHydrated ||
      !currentLicense.developerUnlimited &&
      (!currentLicense.selectedWalletIds.includes(profile.id) ||
        currentLicense.usageLimitReached ||
        currentLicense.offlineGraceExpired ||
        currentLicense.serverAccessDenied)
    ) {
      control.autoMine = false;
      control.manualStop = true;
      setLicenseMiningActive(profile.id, false);
      updateRuntimeState(profile.id, {
        autoMine: false,
        mining: false,
        status: "LICENSE LOCKED",
      });
      return;
    }

    if (!control.miner || !control.autoMine || control.recovering) {
      return;
    }

    const cooldownRemainingMs = control.retryNotBefore - Date.now();
    if (cooldownRemainingMs > 0) {
      updateRuntimeState(profile.id, {
        mining: false,
        status: "WAITING FOR NEXT EPOCH",
      });
      scheduleNextSession(
        profile,
        Math.min(RETRY_DELAY_MS, Math.max(1_000, cooldownRemainingMs)),
        true,
      );
      return;
    }

    clearTapTimer(profile.id);
    clearSessionWatchdogTimer(profile.id);
    clearSafetyTimer(profile.id);
    control.sessionFinalized = false;
    control.sessionOutcome = "none";
    control.tapCount = 0;
    control.hiddenTapCount = 0;

    updateRuntimeState(profile.id, {
      tapCount: 0,
      lastError: "",
    });

    try {
      // Miner.new() may report can_start=true after an app restart even when
      // this wallet has already consumed its on-chain tap allowance for the
      // current five-minute epoch. Starting in that state produces a complete
      // local 70-tap session whose root is rejected at submission time. Always
      // use the live SDK account data as the authoritative start gate.
      const { liveMinerData, currentEpoch5mStart } =
        await queueMiningStartPreflight(async () => {
          if (
            !control.miner ||
            !control.autoMine ||
            control.manualStop
          ) {
            throw new Error("Mining start was cancelled.");
          }

          const minerData = await withNetworkRetry(
            () => control.miner!.get_miner_data(),
            2,
          );
          const cachedEpoch =
            miningEpochBlockCacheRef.current;
          let epochStart: bigint;

          if (
            cachedEpoch &&
            Date.now() - cachedEpoch.fetchedAt < 15_000
          ) {
            epochStart = cachedEpoch.epochStart;
          } else {
            const blockData = await withNetworkRetry(
              () => control.miner!.get_current_block(),
              2,
            );
            epochStart =
              blockData.seq_no -
              blockData.seq_no %
                SDK_FIVE_MINUTE_EPOCH_BLOCK_STEP;
            miningEpochBlockCacheRef.current = {
              epochStart,
              fetchedAt: Date.now(),
            };
          }

          return {
            liveMinerData: minerData,
            currentEpoch5mStart: epochStart,
          };
        });
      const storedTap5m = Number(liveMinerData.tap_sum_5m);
      const liveTapEpoch = Number(liveMinerData.tap_sum);
      const storedEpoch5mStart =
        liveMinerData.epoch_5m_start.toString();
      const liveEpoch5mStart = currentEpoch5mStart.toString();
      const storedTapsBelongToCurrentEpoch =
        storedEpoch5mStart === liveEpoch5mStart;
      const liveTap5m = storedTapsBelongToCurrentEpoch
        ? storedTap5m
        : 0;
      const liveEpochStart = liveMinerData.epoch_start.toString();
      const previousRuntime =
        runtimeStatesRef.current[profile.id] ?? createEmptyRuntime();
      const liveEpochChanged =
        previousRuntime.epoch5mStart !== "" &&
        previousRuntime.epoch5mStart !== liveEpoch5mStart;
      const liveNetworkState = {
        networkTap5m: liveTap5m,
        networkTapEpoch: liveTapEpoch,
        epoch5mStart: liveEpoch5mStart,
        epochStart: liveEpochStart,
        networkUpdatedAt: new Date().toLocaleTimeString(),
        ...(liveEpochChanged
          ? {
              acceptedEpoch5mStart: "",
              acceptedProgressHeld: false,
            }
          : {}),
      };

      runtimeStatesRef.current = {
        ...runtimeStatesRef.current,
        [profile.id]: {
          ...previousRuntime,
          ...liveNetworkState,
        },
      };
      updateRuntimeState(profile.id, liveNetworkState);

      if (liveEpochChanged) {
        control.retryNotBefore = 0;
      }

      if (liveTap5m >= MAX_TAPS_PER_FIVE_MINUTE_EPOCH) {
        control.retryNotBefore =
          Date.now() + NETWORK_REFRESH_INTERVAL_MS;
        updateRuntimeState(profile.id, {
          mining: false,
          status: "WAITING FOR NEXT EPOCH",
        });
        addLog(
          `[WAITING:${profile.walletName}] Current 5-minute epoch already has ${liveTap5m}/${MAX_TAPS_PER_FIVE_MINUTE_EPOCH} taps; waiting for block ${currentEpoch5mStart + SDK_FIVE_MINUTE_EPOCH_BLOCK_STEP}.`,
        );
        scheduleNextSession(
          profile,
          NETWORK_REFRESH_INTERVAL_MS,
          true,
        );
        return;
      }

      if (!control.miner.can_start()) {
        updateRuntimeState(profile.id, {
          status: "WAITING",
        });

        addLog(
          `[WAITING:${profile.walletName}] Miner cannot start yet; retrying in ${RETRY_DELAY_MS / 1000} seconds.`,
        );

        scheduleNextSession(profile, RETRY_DELAY_MS);
        return;
      }

      // A rebuilt SDK instance can report can_start=true again even though the
      // wallet already attempted this network window. Keep the stable engine
      // to one session per five-minute window; an observed epoch transition
      // below releases this guard early.
      control.retryNotBefore = Date.now() + SESSION_EPOCH_COOLDOWN_MS;
      control.sessionNumber += 1;
      control.sessionGeneration += 1;

      setRuntimeStates((current) => {
        const currentState =
          current[profile.id] ?? createEmptyRuntime();

        const acceptedInCurrentEpoch =
          currentState.acceptedEpoch5mStart !== "" &&
          currentState.acceptedEpoch5mStart ===
            currentState.epoch5mStart;

        return {
          ...current,
          [profile.id]: {
            ...currentState,
            sessionNumber: control.sessionNumber,
            mining: true,
            status: acceptedInCurrentEpoch
              ? "ACCEPTED"
              : "STARTING",
          },
        };
      });

      addLog(
        `[AUTO:${profile.walletName}] Session ${control.sessionNumber} started ` +
          `for ${SESSION_DURATION_MS / 1000} seconds; ${tapModeConfig.label}.`,
      );

      // Some SDK/network failure paths never emit finished or removed. Keep an
      // independent deadline so WAITING FOR CONFIRMATION cannot last forever.
      scheduleRuntimeTimer(
        profile.id,
        "sessionWatchdogTimer",
        () => {
          if (
            control.sessionOutcome === "none" &&
            control.autoMine &&
            !control.manualStop
          ) {
            addLog(
              `[SAFETY:${profile.walletName}] Session deadline reached without a terminal SDK event.`,
            );
            startSafetyCheck(profile);
          }
        },
        SESSION_DURATION_MS + SESSION_TERMINAL_EVENT_GRACE_MS,
      );

      const sessionEngineGeneration = engineGenerationRef.current;
      const sessionGeneration = control.sessionGeneration;
      control.miner.start(
        SESSION_DURATION_MS,
        (event: unknown) => {
          if (
            sessionEngineGeneration !== engineGenerationRef.current ||
            sessionGeneration !== control.sessionGeneration
          ) {
            return;
          }
          handleMinerEvent(profile, event);
        },
      );
    } catch (error) {
      clearSessionWatchdogTimer(profile.id);
      const message =
        error instanceof Error ? error.message : String(error);

      if (
        message === "Mining start was cancelled." ||
        !control.autoMine ||
        control.manualStop
      ) {
        return;
      }

      const temporaryNetworkError =
        message.includes("Failed to fetch") ||
        message.includes('error_code: Some("205")') ||
        message.includes("GetAccount") ||
        message.includes("Get account");

      if (temporaryNetworkError) {
        updateRuntimeState(profile.id, {
          mining: false,
          status: "NETWORK WAIT",
          lastError: message,
        });
        addLog(
          `[NETWORK WAIT:${profile.walletName}] Start check could not reach the SDK endpoint; retrying in 30 seconds without rebuilding the miner.`,
        );
        scheduleNextSession(profile, 30_000, true);
        return;
      }

      updateRuntimeState(profile.id, {
        mining: false,
        status: "ERROR",
        lastError: message,
      });

      addLog(
        `[ERROR:${profile.walletName}] Session could not start; automatic miner recovery started: ${message}`,
      );

      if (control.autoMine && !control.manualStop) {
        void recoverWallet(profile, true);
      }
    }
  };

  const startWalletAuto = (profileId: string) => {
    const profile =
      profiles.find((item) => item.id === profileId) ?? null;

    if (!profile) {
      return;
    }

    const currentLicense = getLicenseSnapshot();
    if (
      !licenseHydrated ||
      !currentLicense.developerUnlimited &&
      (!currentLicense.selectedWalletIds.includes(profile.id) ||
        currentLicense.usageLimitReached ||
        currentLicense.offlineGraceExpired ||
        currentLicense.serverAccessDenied)
    ) {
      updateRuntimeState(profile.id, {
        autoMine: false,
        mining: false,
        status: "LICENSE LOCKED",
      });
      addLog(
        `[LICENSE:${profile.walletName}] License inactive; select this wallet in ADMIN or activate a license.`,
      );
      return;
    }

    const control = getControl(profile.id);
    clearRecoveryTimer(profile.id);
    clearSessionWatchdogTimer(profile.id);
    clearSafetyTimer(profile.id);
    control.manualStop = false;

    const state = runtimeStates[profile.id];

    if (!control.miner || !state?.initialized) {
      control.autoMine = true;
      setLicenseMiningActive(profile.id, true);

      updateRuntimeState(profile.id, {
        initialized: false,
        autoMine: true,
        mining: false,
        status: "RECOVERY QUEUED",
      });

      addLog(
        `[RECOVERY:${profile.walletName}] Miner is not initialized; automatic restore queued.`,
      );
      void recoverWallet(profile, true);
      return;
    }

    if (control.autoMine) {
      return;
    }

    control.autoMine = true;
    setLicenseMiningActive(profile.id, true);
    control.sessionNumber = 0;

    updateRuntimeState(profile.id, {
      autoMine: true,
      sessionNumber: 0,
      confirmedSessions: 0,
      acceptedSessions: 0,
      rejectedSessions: 0,
      status: "STARTING",
    });

    addLog(`[AUTO:${profile.walletName}] AUTO MINE enabled.`);
    void startWalletSession(profile);
  };

  const stopWalletAuto = (profileId: string) => {
    const profile =
      profiles.find((item) => item.id === profileId) ?? null;

    if (!profile) {
      return;
    }

    const control = getControl(profile.id);
    
    control.manualStop = true;
    control.autoMine = false;
    control.sessionGeneration += 1;
    setLicenseMiningActive(profile.id, false);
    clearTapTimer(profile.id);
    clearNextSessionTimer(profile.id);
    clearSessionWatchdogTimer(profile.id);
    clearSafetyTimer(profile.id);
    clearRecoveryTimer(profile.id);
    control.recovering = false;

    try {
      control.miner?.stop();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      addLog(
        `[ERROR:${profile.walletName}] Miner could not stop: ${message}`,
      );
    }

    updateRuntimeState(profile.id, {
      autoMine: false,
      mining: false,
      status: "STOPPED",
    });

    addLog(`[AUTO:${profile.walletName}] AUTO MINE stopped.`);
  };

  const startAll = () => {
    const currentLicense = getLicenseSnapshot();
    if (
      !licenseHydrated ||
      (!currentLicense.developerUnlimited &&
        (currentLicense.usageLimitReached ||
          currentLicense.offlineGraceExpired ||
          currentLicense.serverAccessDenied))
    ) {
      addLog("[LICENSE] START ALL blocked because the license is inactive.");
      return;
    }

    localStorage.setItem(WATCHDOG_EXPECTED_KEY, "1");
    watchdogStartedAtRef.current = Date.now();
    document.documentElement.dataset.miningPerformance = "on";

    const modeWalletLimit =
      appViewModeRef.current === "lite"
        ? LITE_WALLET_LIMIT
        : MAIN_WALLET_LIMIT;
    const modeProfiles = profiles.slice(0, modeWalletLimit);
    const skippedByMode = profiles.length - modeProfiles.length;

    if (skippedByMode > 0) {
      addLog(
        `[LIMIT] ${appViewModeRef.current.toUpperCase()} MODE starts the first ${modeWalletLimit} wallets; ${skippedByMode} wallet(s) remain unchanged.`,
      );
    }

    const allowedProfileIds = licenseSnapshot.developerUnlimited
      ? null
      : new Set(
          licenseSnapshot.selectedWalletIds.slice(
            0,
            licenseWalletLimit,
          ),
        );
    const permittedProfiles = modeProfiles.filter(
      (profile) =>
        allowedProfileIds === null ||
        allowedProfileIds.has(profile.id),
    );
    const skippedByLicense = modeProfiles.filter(
      (profile) =>
        allowedProfileIds !== null &&
        !allowedProfileIds.has(profile.id),
    );
    skippedByLicense.forEach((profile) => {
      addLog(
        `[SKIP:${profile.walletName}] START ALL skipped because this wallet is not selected in the active license.`,
      );
    });

    const waitingProfiles = permittedProfiles.filter(
      (profile) => !runtimeStates[profile.id]?.initialized,
    );

    if (waitingProfiles.length > 0) {
      addLog(
        `[RECOVERY] START ALL queued automatic restore for ${waitingProfiles.length} uninitialized wallet(s).`,
      );
    }

    for (const timer of startAllTimersRef.current) {
      window.clearTimeout(timer);
    }
    startAllTimersRef.current.clear();

    permittedProfiles.forEach((profile, index) => {
      const timer = window.setTimeout(() => {
        startAllTimersRef.current.delete(timer);

        if (localStorage.getItem(WATCHDOG_EXPECTED_KEY) !== "1") {
          return;
        }

        watchdogActivityRef.current.set(profile.id, Date.now());
        watchdogUnhealthySinceRef.current.delete(profile.id);
        startWalletAuto(profile.id);
      }, index * 350);

      startAllTimersRef.current.add(timer);
    });
  };

  const stopAll = () => {
    localStorage.setItem(WATCHDOG_EXPECTED_KEY, "0");
    sessionStorage.removeItem(WATCHDOG_RELOAD_PENDING_KEY);
    watchdogUnhealthySinceRef.current.clear();
    document.documentElement.dataset.miningPerformance = "off";
    for (const timer of startAllTimersRef.current) {
      window.clearTimeout(timer);
    }
    startAllTimersRef.current.clear();

    for (const profile of profiles) {
      stopWalletAuto(profile.id);
    }
  };

  useEffect(() => {
    if (!watchdogEnabled || !sdkReady || restoring || profiles.length === 0) {
      return;
    }

    const runWatchdogCheck = () => {
      const checkedAt = Date.now();
      setWatchdogLastCheck(
        new Date(checkedAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );

      if (
        localStorage.getItem(WATCHDOG_EXPECTED_KEY) !== "1" ||
        watchdogReloadingRef.current
      ) {
        return;
      }

      const unhealthyProfiles = profiles.filter((profile) => {
        const state = runtimeStatesRef.current[profile.id] ?? createEmptyRuntime();
        const normalizedStatus = state.status.toUpperCase();

        const hasFailureStatus =
          normalizedStatus.includes("ERROR") ||
          normalizedStatus.includes("FAILED") ||
          normalizedStatus.includes("REJECTED") ||
          normalizedStatus.includes("RESTORE FAILED") ||
          normalizedStatus.includes("RECOVERY FAILED");

        const isNotRunning =
          !state.initialized ||
          !state.autoMine ||
          (!state.mining &&
            !normalizedStatus.includes("WAIT") &&
            !normalizedStatus.includes("ACCEPT") &&
            !normalizedStatus.includes("READY FOR NEXT") &&
            !normalizedStatus.includes("RECOVER") &&
            !normalizedStatus.includes("QUEUED"));

        const unhealthy = hasFailureStatus || isNotRunning;

        if (!unhealthy) {
          watchdogUnhealthySinceRef.current.delete(profile.id);
          return false;
        }

        const lastActivity =
          watchdogActivityRef.current.get(profile.id) ??
          watchdogStartedAtRef.current;
        const unhealthySince =
          watchdogUnhealthySinceRef.current.get(profile.id) ??
          Math.min(lastActivity, checkedAt);

        watchdogUnhealthySinceRef.current.set(profile.id, unhealthySince);

        return checkedAt - unhealthySince >= WATCHDOG_INACTIVE_THRESHOLD_MS;
      });

      if (unhealthyProfiles.length === 0) {
        addLog("[WATCHDOG] Hourly check completed: all wallets healthy.");
        return;
      }

      const lastReload = Number(
        localStorage.getItem(WATCHDOG_LAST_RELOAD_KEY) ?? "0",
      );

      if (
        Number.isFinite(lastReload) &&
        checkedAt - lastReload < WATCHDOG_RELOAD_COOLDOWN_MS
      ) {
        addLog(
          `[WATCHDOG] ${unhealthyProfiles.length} unhealthy wallet(s) found, but reload cooldown is active.`,
        );
        return;
      }

      watchdogReloadingRef.current = true;
      localStorage.setItem(WATCHDOG_LAST_RELOAD_KEY, String(checkedAt));
      sessionStorage.setItem(WATCHDOG_RELOAD_PENDING_KEY, "1");

      addLog(
        `[WATCHDOG] ${unhealthyProfiles.length} wallet(s) inactive or failed for at least 10 minutes: ${unhealthyProfiles
          .map((profile) => profile.walletName)
          .join(", ")}.`,
      );
      addLog("[WATCHDOG] Reloading app; START ALL will run after restore.");

      window.setTimeout(() => {
        window.location.reload();
      }, 1_500);
    };

    const firstCheckTimer = window.setTimeout(
      runWatchdogCheck,
      WATCHDOG_CHECK_INTERVAL_MS,
    );
    const intervalTimer = window.setInterval(
      runWatchdogCheck,
      WATCHDOG_CHECK_INTERVAL_MS,
    );

    return () => {
      window.clearTimeout(firstCheckTimer);
      window.clearInterval(intervalTimer);
    };
  }, [watchdogEnabled, sdkReady, restoring, profiles]);

  useEffect(() => {
    if (
      !watchdogEnabled ||
      !sdkReady ||
      !licenseHydrated ||
      restoring ||
      profiles.length === 0 ||
      sessionStorage.getItem(WATCHDOG_RELOAD_PENDING_KEY) !== "1"
    ) {
      return;
    }

    const autoStartTimer = window.setTimeout(() => {
      sessionStorage.removeItem(WATCHDOG_RELOAD_PENDING_KEY);
      addLog("[WATCHDOG] Restore completed; START ALL triggered.");
      startAll();
    }, 10_000);

    return () => window.clearTimeout(autoStartTimer);
  }, [watchdogEnabled, sdkReady, licenseHydrated, restoring, profiles]);

  const refreshBalanceIncomeDisplay = () => {
    const now = Date.now();
    const dayCutoff = now - ROLLING_24H_MS;
    const hourCutoff = now - 60 * 60_000;
    const activeProfiles = profilesRef.current;
    const activeProfileIds = new Set(
      activeProfiles.map((profile) => profile.id),
    );
    const walletDailyTotals = new Map<string, bigint>();
    let hourlyRaw = 0n;
    let dailyRaw = 0n;
    const nextLedger: BalanceIncomeLedger = {};

    for (const [profileId, walletEntry] of Object.entries(
      balanceIncomeLedgerRef.current,
    )) {
      const validEvents: BalanceIncomeEvent[] = [];
      let walletDailyRaw = 0n;

      for (const event of Array.isArray(walletEntry?.events)
        ? walletEntry.events
        : []) {
        if (
          typeof event?.at !== "number" ||
          !Number.isFinite(event.at) ||
          event.at < dayCutoff
        ) {
          continue;
        }

        try {
          const eventRaw = BigInt(event.raw);

          if (eventRaw <= 0n) {
            continue;
          }

          validEvents.push({ at: event.at, raw: eventRaw.toString() });
          walletDailyRaw += eventRaw;

          if (event.at >= hourCutoff) {
            hourlyRaw += eventRaw;
          }
        } catch {
          // Ignore corrupt local ledger entries without losing the baseline.
        }
      }

      nextLedger[profileId] = {
        lastRaw:
          typeof walletEntry?.lastRaw === "string"
            ? walletEntry.lastRaw
            : "",
        lastCheckedAt:
          typeof walletEntry?.lastCheckedAt === "number"
            ? walletEntry.lastCheckedAt
            : 0,
        events: validEvents,
      };

      if (activeProfileIds.has(profileId)) {
        walletDailyTotals.set(profileId, walletDailyRaw);
        dailyRaw += walletDailyRaw;
      }
    }

    balanceIncomeLedgerRef.current = nextLedger;

    try {
      localStorage.setItem(
        BALANCE_INCOME_LEDGER_KEY,
        JSON.stringify(nextLedger),
      );
    } catch {
      // The live values still work if local persistence is unavailable.
    }

    persistBalanceIncomeLedger(nextLedger);

    setRuntimeStates((current) => {
      const next = { ...current };

      for (const profile of activeProfiles) {
        next[profile.id] = {
          ...(next[profile.id] ?? createEmptyRuntime()),
          income24h: formatRawNackl(
            walletDailyTotals.get(profile.id) ?? 0n,
          ),
        };
      }

      return next;
    });

    setPortfolioIncome({
      hourly: formatRawNackl(hourlyRaw),
      daily: formatRawNackl(dailyRaw),
      weekly: formatRawNackl(dailyRaw),
      monthly: formatRawNackl(dailyRaw),
      loading: false,
      updatedAt: new Date(now).toLocaleTimeString(),
    });
  };

  const recordBalanceObservation = (
    profileId: string,
    rawBalanceValue: string | number | bigint,
  ) => {
    let currentRaw: bigint;

    try {
      currentRaw = BigInt(String(rawBalanceValue));
    } catch {
      return;
    }

    const now = Date.now();
    const dayCutoff = now - ROLLING_24H_MS;
    const previous = balanceIncomeLedgerRef.current[profileId];
    const events = (Array.isArray(previous?.events)
      ? previous.events
      : []
    ).filter(
      (event) =>
        typeof event?.at === "number" &&
        Number.isFinite(event.at) &&
        event.at >= dayCutoff,
    );

    if (
      previous?.lastRaw &&
      previous.lastCheckedAt > 0 &&
      now - previous.lastCheckedAt <= ROLLING_24H_MS
    ) {
      try {
        const previousRaw = BigInt(previous.lastRaw);
        const increase = currentRaw - previousRaw;

        if (increase > 0n) {
          events.push({ at: now, raw: increase.toString() });
        }
      } catch {
        // A malformed old baseline is replaced by this observation.
      }
    }

    balanceIncomeLedgerRef.current = {
      ...balanceIncomeLedgerRef.current,
      [profileId]: {
        lastRaw: currentRaw.toString(),
        lastCheckedAt: now,
        events,
      },
    };

    refreshBalanceIncomeDisplay();
  };

const checkWalletBalances = async (
  profileId: string,
  writeLog = false,
) => {
  if (authorizationInFlightRef.current) {
    return false;
  }

  const profile =
    profilesRef.current.find((item) => item.id === profileId) ?? null;

  if (!profile) {
    return false;
  }

  const walletSdk = walletSdkRef.current;

  if (!walletSdk) {
    if (writeLog) {
      addLog(
        `[BALANCE ERROR:${profile.walletName}] Wallet SDK is not initialized.`,
      );
    }
    return false;
  }

  let details: Awaited<
    ReturnType<Wallet["get_multifactor_data_by_name"]>
  > | undefined;
  let balances: Awaited<
    ReturnType<Wallet["get_multifactor_balances"]>
  > | undefined;

  try {
    details = await withNetworkRetry(() =>
      walletSdk.get_multifactor_data_by_name(profile.walletName),
    );

    if (!details) {
      throw new Error("Multifactor wallet was not found.");
    }

    try {
      balances = await withNetworkRetry(() =>
        walletSdk.get_multifactor_balances({
          multifactor_address: details!.address,
        }),
      );

      const rawNackl = balances.popitgame["1"];

      if (rawNackl !== undefined) {
        recordBalanceObservation(profile.id, rawNackl);
        const nacklBalance = (
          Number(rawNackl) / 1_000_000_000
        ).toFixed(0);

        updateRuntimeState(profile.id, {
          nacklBalance,
        });

        if (writeLog) {
          addLog(
            `[BALANCE:${profile.walletName}] ${nacklBalance} NACKL`,
          );
        }

        return true;
      }
    } catch {
      // Native balance lookup can fail on the current Mainnet backend.
      // Fall back to direct multisig balances below.
    }

    const fallbackBalances = await withNetworkRetry(() =>
      multisig_balances({
        endpoints: ENDPOINTS,
        address: details!.address,
      }),
    );

    const rawFallback =
      fallbackBalances[1] ??
      fallbackBalances["1"];

    if (rawFallback === undefined) {
      throw new Error("NACKL currency 1 balance was not returned.");
    }

    recordBalanceObservation(profile.id, rawFallback);
    const nacklBalance = (
      Number(rawFallback) / 1_000_000_000
    ).toFixed(0);

    updateRuntimeState(profile.id, {
      nacklBalance,
    });

    if (writeLog) {
      addLog(
        `[BALANCE:${profile.walletName}] ${nacklBalance} NACKL`,
      );
    }

    return true;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    if (writeLog) {
      addLog(
        `[BALANCE UNAVAILABLE:${profile.walletName}] ${message}`,
      );
    }
  } finally {
    try {
      balances?.free();
    } catch {
      // Ignore SDK cleanup errors.
    }

    try {
      details?.free();
    } catch {
      // Ignore SDK cleanup errors.
    }
  }

  return false;
};

  const checkWalletHistory = async (
    profileId: string,
    writeLog = true,
  ) => {
    if (authorizationInFlightRef.current) {
      return;
    }

    const profile =
      profiles.find((item) => item.id === profileId) ?? null;

    if (!profile) {
      return;
    }

    const walletSdk = walletSdkRef.current;

    if (!walletSdk) {
      if (writeLog) {
        addLog(
          `[HISTORY ERROR:${profile.walletName}] Wallet SDK is not initialized.`,
        );
      }
      return;
    }

    let details: Awaited<
      ReturnType<Wallet["get_multifactor_data_by_name"]>
    > | undefined;
    let history: Awaited<
      ReturnType<Wallet["get_history"]>
    > | undefined;

    try {
      details = await walletSdk.get_multifactor_data_by_name(
        profile.walletName,
      );

      if (!details) {
        throw new Error("Multifactor wallet was not found.");
      }

      history = await withNetworkRetry(() =>
        walletSdk.get_history({
          multifactor_address: details!.address,
          token_id: "1",
          page_size: 20,
        }),
      );

      const historyItems = history.data.map((item) => ({
        id: item.id,
        createdAt: parseHistoryTimestampSeconds(item.created_at),
        source: item.src_name ?? "",
        type: item.tx_type,
        value: item.value,
      }));

      const miningItems = historyItems
        .filter(
          (item): item is typeof item & { createdAt: number } =>
            item.createdAt !== null &&
            isMiningHistoryType(item.type),
        )
        .sort(
          (left, right) =>
            right.createdAt - left.createdAt,
        );

      if (miningItems.length > 0) {
        const groupedRewards = new Map<number, bigint>();

        for (const item of miningItems) {
          groupedRewards.set(
            item.createdAt,
            (groupedRewards.get(item.createdAt) ?? 0n) +
              BigInt(item.value),
          );
        }

        const recentRewardEntries = [...groupedRewards.entries()]
          .sort(
            ([leftCreatedAt], [rightCreatedAt]) =>
              rightCreatedAt - leftCreatedAt,
          )
          .slice(0, 3);

        const recent5mRewards = recentRewardEntries.map(
          ([createdAt, rawValue]) => ({
            amount: (
              Number(rawValue) / 1_000_000_000
            ).toFixed(2),
            time: new Date(
              createdAt * 1000,
            ).toLocaleTimeString("en-GB", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }),
          }),
        );

        const latestRewardEntry = recentRewardEntries[0] ?? null;
        const latestRewardKey = latestRewardEntry
          ? `${latestRewardEntry[0]}:${latestRewardEntry[1].toString()}`
          : "";
        const previousRewardKey =
          liteKnownLatestRewardRef.current.get(profile.id);

        liteKnownLatestRewardRef.current.set(
          profile.id,
          latestRewardKey,
        );

        updateRuntimeState(profile.id, {
          recent5mRewards,
        });

        const pendingAcceptedAt =
          litePendingAcceptedAtRef.current.get(profile.id) ?? 0;
        const latestRewardCreatedAt = latestRewardEntry
          ? latestRewardEntry[0] * 1000
          : 0;
        const rewardChanged =
          Boolean(previousRewardKey) &&
          Boolean(latestRewardKey) &&
          previousRewardKey !== latestRewardKey;
        const matchesPendingAcceptance =
          pendingAcceptedAt > 0 &&
          latestRewardCreatedAt >= pendingAcceptedAt - 15_000;

        if (
          appViewModeRef.current === "lite" &&
          (rewardChanged || matchesPendingAcceptance)
        ) {
          triggerLiteAcceptedFeedback(
            profile.id,
            recent5mRewards[0] ?? null,
          );
        }
      }

      if (writeLog) {
        addLog(
          `[HISTORY:${profile.walletName}] ${stringifyForLog(
            historyItems,
          )}`,
        );
      }

      for (const item of history.data) {
        try {
          item.free();
        } catch {
          // Ignore individual history item cleanup errors.
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      if (writeLog) {
        addLog(
          `[HISTORY ERROR:${profile.walletName}] ${message}`,
        );
      }
    } finally {
      try {
        history?.free();
      } catch {
        // Ignore SDK cleanup errors.
      }

      try {
        details?.free();
      } catch {
        // Ignore SDK cleanup errors.
      }
    }
  };


  const refreshPortfolioIncome = async () => {
    // The rolling income is derived only from consecutive wallet balance
    // observations. Mining history events must not inflate this figure.
    refreshBalanceIncomeDisplay();
  };

  const checkWalletNetworkData = async (
    profileId: string,
    writeLog = false,
  ) => {
    if (authorizationInFlightRef.current) {
      return;
    }

    const profile =
      profiles.find((item) => item.id === profileId) ?? null;

    if (!profile) {
      return;
    }

    const control = getControl(profile.id);

    if (!control.miner) {
      if (writeLog) {
        addLog(
          `[ERROR:${profile.walletName}] Miner is not initialized.`,
        );
      }
      return;
    }

    try {
      const data = await withNetworkRetry(() =>
        control.miner!.get_miner_data(),
      );

      const networkTap5m = Number(data.tap_sum_5m);
      const networkTapEpoch = Number(data.tap_sum);
      const epoch5mStart = data.epoch_5m_start.toString();
      const epochStart = data.epoch_start.toString();
      const networkUpdatedAt = new Date().toLocaleTimeString();
      const observedAt = Date.now();

      const timing =
        epochTimingRef.current.get(profile.id) ?? {
          lastEpoch5mStart: "",
          lastEpochChangedAt: observedAt,
          blockStep: SDK_FIVE_MINUTE_EPOCH_BLOCK_STEP,
          averageFiveMinuteMs: 300_000,
          samples: 0,
          hasSeenTransition: false,
        };

      if (
        timing.lastEpoch5mStart !== "" &&
        timing.lastEpoch5mStart !== epoch5mStart
      ) {
        const previous5mBlock = BigInt(
          timing.lastEpoch5mStart,
        );
        const current5mBlock = BigInt(epoch5mStart);
        const blockDelta =
          current5mBlock - previous5mBlock;
        const timeDelta =
          observedAt - timing.lastEpochChangedAt;

        if (
          timing.hasSeenTransition &&
          blockDelta > 0n &&
          timeDelta >= 180_000 &&
          timeDelta <= 420_000
        ) {
          timing.blockStep = blockDelta;
          timing.samples += 1;
          timing.averageFiveMinuteMs =
            timing.samples === 1
              ? timeDelta
              : Math.round(
                  timing.averageFiveMinuteMs * 0.7 +
                    timeDelta * 0.3,
                );
        }

        // The first change after app startup can represent only a partial
        // five-minute window. Keep the protocol default for that sample and
        // start adaptive timing from the following complete transition.
        timing.hasSeenTransition = true;
        timing.lastEpochChangedAt = observedAt;
      }

      timing.lastEpoch5mStart = epoch5mStart;
      epochTimingRef.current.set(profile.id, timing);

      let estimatedDailyEpochEndAt = 0;

      if (timing.blockStep && timing.blockStep > 0n) {
        const elapsedBlocks =
          BigInt(epoch5mStart) - BigInt(epochStart);
        const elapsedFiveMinuteEpochs = Math.max(
          0,
          Number(elapsedBlocks / timing.blockStep),
        );
        const remainingFiveMinuteEpochs = Math.max(
          0,
          FIVE_MINUTE_EPOCHS_PER_DAILY_EPOCH -
            elapsedFiveMinuteEpochs,
        );

        estimatedDailyEpochEndAt =
          observedAt +
          remainingFiveMinuteEpochs *
            timing.averageFiveMinuteMs;
      }

      // Feed the main-menu epoch panel from the newest SDK sample. Multiple
      // wallets report the same network epoch, so a temporarily unavailable
      // wallet cannot blank a valid sample received from another wallet.
      setNetworkOverview((current) => {
        try {
          if (
            current.epochStartBlock !== null &&
            BigInt(epochStart) < BigInt(current.epochStartBlock)
          ) {
            return current;
          }
        } catch {
          // SDK values are bigint strings; if a malformed cached value ever
          // appears, prefer the fresh SDK response below.
        }

        const sameDailyEpoch = current.epochStartBlock === epochStart;
        const epochEstimatedEndAt =
          estimatedDailyEpochEndAt > 0
            ? estimatedDailyEpochEndAt
            : sameDailyEpoch
              ? current.epochEstimatedEndAt
              : null;

        return {
          ...current,
          epochRemaining:
            epochEstimatedEndAt === null
              ? null
              : formatSdkEpochRemaining(epochEstimatedEndAt, observedAt),
          epochStartBlock: epochStart,
          epoch5mStartBlock: epoch5mStart,
          epochEstimatedEndAt,
          epochUpdatedAt: observedAt,
        };
      });

      const previousRuntime =
        runtimeStatesRef.current[profile.id] ?? createEmptyRuntime();
      const previousEpoch5mStart =
        previousRuntime.epoch5mStart;

      const epochChanged =
        previousEpoch5mStart !== "" &&
        previousEpoch5mStart !== epoch5mStart;

      const nextRuntime = {
        ...previousRuntime,
        networkTap5m,
        networkTapEpoch,
        epoch5mStart,
        epochStart,
        networkUpdatedAt,
        estimatedDailyEpochEndAt,
        ...(epochChanged
          ? {
              acceptedEpoch5mStart: "",
              status: control.autoMine
                ? control.tapCount > 0
                  ? "COMPUTING"
                  : "STARTING"
                : previousRuntime.status,
            }
          : {}),
      };

      runtimeStatesRef.current = {
        ...runtimeStatesRef.current,
        [profile.id]: nextRuntime,
      };

      updateRuntimeState(profile.id, {
        networkTap5m,
        networkTapEpoch,
        epoch5mStart,
        epochStart,
        networkUpdatedAt,
        estimatedDailyEpochEndAt,
        ...(epochChanged
          ? {
              acceptedEpoch5mStart: "",
              status: control.autoMine
                ? control.tapCount > 0
                  ? "COMPUTING"
                  : "STARTING"
                : previousRuntime.status,
            }
          : {}),
      });

      if (epochChanged) {
        control.retryNotBefore = 0;
        const previousResultWasUnknown =
          control.sessionOutcome === "unknown";

        if (previousResultWasUnknown) {
          control.sessionOutcome = "none";
          addLog(
            `[EPOCH:${profile.walletName}] Previous session stayed unknown; its result window was closed without changing accepted or rejected counters.`,
          );
        }

        addLog(
          `[EPOCH:${profile.walletName}] New 5-minute epoch detected; progress reset.`,
        );

        addLog(
          `[EPOCH:${profile.walletName}] Refreshing rewards.`,
        );

        window.setTimeout(() => {
          void checkWalletHistory(profile.id, false);
        }, 3_000);

        window.setTimeout(() => {
          void checkWalletHistory(profile.id, false);
        }, 15_000);

        if (control.autoMine && !control.manualStop) {
          clearNextSessionTimer(profile.id);
          scheduleNextSession(profile, 1_000, true);
        }
      }

      if (writeLog) {
        addLog(
          `[NETWORK:${profile.walletName}] 5m=${networkTap5m}, epoch=${networkTapEpoch}, epoch5m_start=${epoch5mStart}, epoch_start=${epochStart}`,
        );
      }

      data.free();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      if (writeLog) {
        addLog(
          `[ERROR:${profile.walletName}] Network data read failed: ${message}`,
        );
      }
    }
  };

  useEffect(() => {
    if (!sdkReady || restoring || authorizing || profiles.length === 0) {
      return;
    }

    const refreshAllNetworkData = () => {
      profiles.forEach((profile, index) => {
        window.setTimeout(() => {
          void checkWalletNetworkData(profile.id, index === 0);
        }, index * 350);
      });
    };

    const refreshEpochImmediately = () => {
      const readyProfile = profiles.find(
        (profile) => controlsRef.current.get(profile.id)?.miner,
      );

      if (readyProfile) {
        void checkWalletNetworkData(readyProfile.id, true);
      }
    };

    const epochInitialTimer = window.setTimeout(
      refreshEpochImmediately,
      500,
    );
    /* Let the opening balance queue finish before secondary network data. */
    const initialTimer = window.setTimeout(refreshAllNetworkData, 14_000);
    const intervalTimer = window.setInterval(
      refreshAllNetworkData,
      NETWORK_REFRESH_INTERVAL_MS,
    );

    return () => {
      window.clearTimeout(epochInitialTimer);
      window.clearTimeout(initialTimer);
      window.clearInterval(intervalTimer);
    };
  }, [sdkReady, restoring, authorizing, profiles]);

  useEffect(() => {
    if (!sdkReady || restoring || authorizing || profiles.length === 0) {
      return;
    }

    let cancelled = false;
    let refreshRunning = false;

    const refreshAllBalancesSequentially = async (
      writeLog = false,
      retryFailures = false,
    ) => {
      if (refreshRunning) {
        return;
      }

      refreshRunning = true;

      try {
        let pendingProfileIds = profiles.map((profile) => profile.id);
        const rounds = retryFailures ? 3 : 1;

        for (let round = 0; round < rounds && pendingProfileIds.length > 0; round += 1) {
          const failedProfileIds: string[] = [];

          for (const profileId of pendingProfileIds) {
            if (cancelled) {
              return;
            }

            const succeeded = await checkWalletBalances(
              profileId,
              writeLog && round === rounds - 1,
            );

            if (!succeeded) {
              failedProfileIds.push(profileId);
            }

            await sleep(250);
          }

          pendingProfileIds = failedProfileIds;

          if (pendingProfileIds.length > 0 && round < rounds - 1) {
            await sleep(900 + round * 700);
          }
        }
      } finally {
        refreshRunning = false;
      }
    };

    const initialBalanceTimer = window.setTimeout(() => {
      void refreshAllBalancesSequentially(true, true);
    }, 250);

    const balanceIntervalTimer = window.setInterval(() => {
      void refreshAllBalancesSequentially(false);
    }, BALANCE_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(initialBalanceTimer);
      window.clearInterval(balanceIntervalTimer);
    };
  }, [sdkReady, restoring, authorizing, profiles]);

  useEffect(() => {
    if (!sdkReady || restoring || authorizing || profiles.length === 0) {
      return;
    }

    let cancelled = false;
    let refreshRunning = false;

    const refreshAllRewards = async () => {
      if (refreshRunning) {
        return;
      }

      refreshRunning = true;

      for (const profile of profiles) {
        if (cancelled || authorizationInFlightRef.current) {
          break;
        }

        await checkWalletHistory(profile.id, false);
        await sleep(350);
      }

      refreshRunning = false;
    };

    const initialRewardTimer = window.setTimeout(() => {
      void refreshAllRewards();
    }, 20_000);

    const rewardIntervalTimer = window.setInterval(() => {
      void refreshAllRewards();
    }, REWARD_REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(initialRewardTimer);
      window.clearInterval(rewardIntervalTimer);
    };
  }, [sdkReady, restoring, authorizing, profiles]);

  useEffect(() => {
    if (!sdkReady || restoring || profiles.length === 0) {
      return;
    }

    const initialIncomeTimer = window.setTimeout(() => {
      void refreshPortfolioIncome();
    }, 4_000);

    const incomeIntervalTimer = window.setInterval(() => {
      void refreshPortfolioIncome();
    }, PORTFOLIO_REFRESH_INTERVAL_MS);

    return () => {
      window.clearTimeout(initialIncomeTimer);
      window.clearInterval(incomeIntervalTimer);
    };
  }, [sdkReady, restoring, profiles]);


  const copyDeepLink = async () => {
    if (!deepLink) {
      return;
    }

    try {
      await navigator.clipboard.writeText(deepLink);
      addLog("[AUTH] Wallet link copied.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      addLog(`[ERROR] Link could not be copied: ${message}`);
    }
  };


  const walletCardActionRefs = useRef({
    mouseDown: handleWalletMouseDown,
    select: selectProfile,
    start: startWalletAuto,
    stop: stopWalletAuto,
    toggleSpan: toggleWalletGridSpan,
    reconnect: reconnectWallet,
    remove: removeProfile,
  });

  walletCardActionRefs.current = {
    mouseDown: handleWalletMouseDown,
    select: selectProfile,
    start: startWalletAuto,
    stop: stopWalletAuto,
    toggleSpan: toggleWalletGridSpan,
    reconnect: reconnectWallet,
    remove: removeProfile,
  };

  const walletCardMouseDown = useCallback(
    (event: ReactMouseEvent<HTMLElement>, profileId: string) => {
      walletCardActionRefs.current.mouseDown(event, profileId);
    },
    [],
  );

  const walletCardSelect = useCallback((profileId: string) => {
    void walletCardActionRefs.current.select(profileId);
  }, []);

  const walletCardStart = useCallback((profileId: string) => {
    walletCardActionRefs.current.start(profileId);
  }, []);

  const walletCardStop = useCallback((profileId: string) => {
    walletCardActionRefs.current.stop(profileId);
  }, []);


  const walletCardToggleMenu = useCallback((profileId: string) => {
    setWalletMenuId((current) =>
      current === profileId ? null : profileId,
    );
  }, []);

  const walletCardReconnect = useCallback((profileId: string) => {
    void walletCardActionRefs.current.reconnect(profileId);
  }, []);

  const walletCardRemove = useCallback((profileId: string) => {
    void walletCardActionRefs.current.remove(profileId);
  }, []);

  const mainProfiles = profiles.slice(0, MAIN_WALLET_LIMIT);
  const liteProfiles = profiles.slice(0, LITE_WALLET_LIMIT);
  const sortProfilesByBalance = (items: WalletProfile[]) =>
    [...items].sort((left, right) => {
      const leftBalance = parseWalletBalanceForSort(
        runtimeStates[left.id]?.nacklBalance ?? "",
      );
      const rightBalance = parseWalletBalanceForSort(
        runtimeStates[right.id]?.nacklBalance ?? "",
      );

      if (leftBalance !== rightBalance) {
        return rightBalance > leftBalance ? 1 : -1;
      }

      return left.walletName.localeCompare(right.walletName);
    });
  const mainDisplayProfiles = balanceSortEnabled
    ? sortProfilesByBalance(mainProfiles).map((profile, index) => ({
        ...profile,
        gridSlot: index,
      }))
    : mainProfiles;
  const activeModeProfiles =
    appViewMode === "lite" ? liteProfiles : mainProfiles;
  const activeModeProfileIds = new Set(
    activeModeProfiles.map((profile) => profile.id),
  );
  const runningWalletCount = Object.entries(runtimeStates).filter(
    ([profileId, state]) =>
      activeModeProfileIds.has(profileId) && state.autoMine,
  ).length;

  const totalWalletBalance = Object.values(runtimeStates).reduce(
    (sum, state) => {
      const value = Number(state.nacklBalance);
      return Number.isFinite(value) ? sum + value : sum;
    },
    0,
  );

  const totalWalletBalanceText = totalWalletBalance.toLocaleString(
    language === "tr" ? "tr-TR" : "en-US",
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    },
  );

  const saveLogs = () => {
    const content = logs
      .map((entry) => `[${entry.time}] ${entry.message}`)
      .join("\r\n");

    const now = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");

    const fileName =
      `CappAckiMiner-Log-` +
      `${now.getFullYear()}-` +
      `${pad(now.getMonth() + 1)}-` +
      `${pad(now.getDate())}_` +
      `${pad(now.getHours())}-` +
      `${pad(now.getMinutes())}-` +
      `${pad(now.getSeconds())}.txt`;

    const blob = new Blob([content], {
      type: "text/plain;charset=utf-8",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;

    document.body.appendChild(link);
    link.click();
    link.remove();

    window.setTimeout(() => {
      URL.revokeObjectURL(url);
    }, 0);

    addLog(`[SYSTEM] Activity log saved as ${fileName}`);
  };

  const openHelpFile = async () => {
    try {
      await invoke("open_help_file");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      addLog(`[ERROR] Help file could not be opened: ${message}`);
    }
  };

  const openLogFolder = async () => {
    try {
      await invoke("open_downloads_folder");
      addLog("[SYSTEM] Downloads folder opened.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);

      addLog(`[ERROR] Log folder could not be opened: ${message}`);
    }
  };

  const clearLogs = () => {
    setLogs([
      {
        time: new Date().toLocaleTimeString(),
        message: "[SYSTEM] Activity log cleared.",
      },
    ]);
  };
  const appWindow = getCurrentWindow();

  useEffect(() => {
    localStorage.setItem(APP_VIEW_MODE_KEY, appViewMode);
    appViewModeRef.current = appViewMode;

    void (async () => {
      const minimumSize =
        appViewMode === "lite"
          ? new LogicalSize(760, 600)
          : new LogicalSize(1066, 600);

      /*
        MAIN and LITE share the current physical window size.
        MAIN's separate wallet-layout fitter still runs only when the number
        of MAIN-visible wallets changes.
      */
      await appWindow.setMinSize(minimumSize);
    })().catch((error) => {
      console.warn("View mode minimum-size update failed:", error);
    });
  }, [appViewMode]);

  useEffect(() => {
    const handleFullscreenShortcut = (event: KeyboardEvent) => {
      if (event.key !== "F11") {
        return;
      }

      event.preventDefault();
      void (async () => {
        const fullscreen = await appWindow.isFullscreen();
        await appWindow.setFullscreen(!fullscreen);
      })().catch((error) => {
        console.warn("Fullscreen toggle failed:", error);
      });
    };

    window.addEventListener("keydown", handleFullscreenShortcut);
    return () => window.removeEventListener("keydown", handleFullscreenShortcut);
  }, []);

  useEffect(() => {
    const unlistenPromise = appWindow.onCloseRequested(async (event) => {
      event.preventDefault();
      await appWindow.hide();
    });

    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const minimizeWindow = async () => {
    await appWindow.minimize();
  };

  const toggleMaximizeWindow = async () => {
    await appWindow.toggleMaximize();
  };

  const hideToTray = async () => {
    await appWindow.hide();
  };



  const closeApplication = async () => {
    await Promise.all([
      profileSaveQueueRef.current.catch(() => undefined),
      balanceIncomeSaveQueueRef.current.catch(() => undefined),
    ]);
    await invoke("quit_app");
  };

  const temperatureClass =
    systemMetrics.cpu_temperature_c === null
      ? "unknown"
      : systemMetrics.cpu_temperature_c >= 91
        ? "hot"
        : systemMetrics.cpu_temperature_c >= 76
          ? "warm"
          : "cool";
  const temperatureLabel =
    systemMetrics.cpu_temperature_c === null
      ? "N/A"
      : `${systemMetrics.cpu_temperature_c.toFixed(0)}°C`;
  const cpuLabel =
    systemMetrics.cpu_usage === null
      ? "N/A"
      : `${systemMetrics.cpu_usage.toFixed(0)}%`;
  const cpuUsageClass =
    systemMetrics.cpu_usage === null
      ? "unknown"
      : systemMetrics.cpu_usage >= 80
        ? "high"
        : systemMetrics.cpu_usage >= 50
          ? "medium"
        : "low";
  const licenseUsagePercent =
    licenseSnapshot.maxMiningHours > 0
      ? (licenseSnapshot.miningUsageHours / licenseSnapshot.maxMiningHours) * 100
      : 0;
  const licenseUsageClass =
    licenseSnapshot.developerUnlimited
      ? "unlimited"
      : licenseUsagePercent > 90
        ? "critical"
        : licenseUsagePercent >= 70
          ? "warning"
          : "healthy";
  const adminLabels = repairTranslation(ADMIN_LABELS[language]);
  const adminActionLabels = repairTranslation(ADMIN_ACTION_LABELS[language]);
  const licenseWalletLimit = licenseSnapshot.licenseTier
    ? Number(licenseSnapshot.licenseTier)
    : 2;
  const sortedPendingLicenses = licenseSnapshot.pendingLicenses
    .map((license, originalIndex) => ({ ...license, originalIndex }))
    .sort(
      (left, right) => Number(left.usageLimitReached) - Number(right.usageLimitReached),
    );

  const resetLiteWalletScrollToTop = useCallback(() => {
    const scrollArea = document.querySelector<HTMLElement>(
      ".lite-app .wallet-section",
    );

    if (scrollArea) {
      scrollArea.scrollTop = 0;
      scrollArea.scrollLeft = 0;
    }
  }, []);

  useEffect(() => {
    if (appViewMode !== "lite") {
      return;
    }

    resetLiteWalletScrollToTop();
    const animationFrame = window.requestAnimationFrame(
      resetLiteWalletScrollToTop,
    );
    const shortTimer = window.setTimeout(resetLiteWalletScrollToTop, 120);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(shortTimer);
    };
  }, [
    appViewMode,
    liteSearch,
    liteStatusFilter,
    profiles.length,
    resetLiteWalletScrollToTop,
  ]);

  const normalizedLiteSearch = liteSearch.trim().toLowerCase();
  const liteVisibleProfiles = liteProfiles.filter((profile) => {
    const state = runtimeStates[profile.id] ?? createEmptyRuntime();
    const normalizedStatus = state.status.toLowerCase();
    const running = state.autoMine || state.mining;
    const matchesSearch =
      normalizedLiteSearch.length === 0 ||
      profile.walletName.toLowerCase().includes(normalizedLiteSearch) ||
      profile.minerAddress.toLowerCase().includes(normalizedLiteSearch) ||
      profile.publicKey.toLowerCase().includes(normalizedLiteSearch);

    if (!matchesSearch) {
      return false;
    }

    switch (liteStatusFilter) {
      case "running":
        return running;
      case "waiting":
        return (
          normalizedStatus.includes("wait") ||
          normalizedStatus.includes("start") ||
          normalizedStatus.includes("recover")
        );
      case "error":
        return (
          normalizedStatus.includes("error") ||
          normalizedStatus.includes("reject") ||
          normalizedStatus.includes("unknown") ||
          normalizedStatus.includes("lock")
        );
      case "stopped":
        return !running;
      default:
        return true;
    }
  });

  const liteRunningProfilesCount = liteProfiles.reduce((count, profile) => {
    const state = runtimeStates[profile.id] ?? createEmptyRuntime();
    return state.autoMine || state.mining ? count + 1 : count;
  }, 0);

  const liteDefaultSortedProfiles = [...liteVisibleProfiles].sort((a, b) => {
    const aState = runtimeStates[a.id] ?? createEmptyRuntime();
    const bState = runtimeStates[b.id] ?? createEmptyRuntime();
    const runningDiff =
      Number(bState.autoMine || bState.mining) -
      Number(aState.autoMine || aState.mining);

    if (runningDiff !== 0) {
      return runningDiff;
    }

    const balanceDiff =
      parseWalletBalanceForSort(bState.nacklBalance) -
      parseWalletBalanceForSort(aState.nacklBalance);

    if (balanceDiff !== 0) {
      return balanceDiff;
    }

    return a.walletName.localeCompare(b.walletName);
  });
  const liteSortedProfiles = balanceSortEnabled
    ? sortProfilesByBalance(liteVisibleProfiles)
    : liteDefaultSortedProfiles;

  const switchMiningMode = async () => {
    if (engineSwitching || restoring) {
      return;
    }

    const previousMode = appViewModeRef.current;
    const nextMode: AppViewMode = previousMode === "lite" ? "main" : "lite";

    setEngineSwitching(true);
    setRestoring(true);
    localStorage.setItem(WATCHDOG_EXPECTED_KEY, "0");
    sessionStorage.removeItem(WATCHDOG_RELOAD_PENDING_KEY);
    document.documentElement.dataset.miningPerformance = "off";

    addLog(
      `[ENGINE] Stopping ${previousMode.toUpperCase()} motor before switching to ${nextMode.toUpperCase()}.`,
    );

    for (const timer of startAllTimersRef.current) {
      window.clearTimeout(timer);
    }
    startAllTimersRef.current.clear();

    // Invalidates Miner.new calls and SDK callbacks still returning from the
    // previous mode. Those instances are freed instead of entering the new map.
    engineGenerationRef.current += 1;

    for (const profileId of Array.from(controlsRef.current.keys())) {
      setLicenseMiningActive(profileId, false);
      stopAndFreeWallet(profileId);
    }
    controlsRef.current.clear();

    appViewModeRef.current = nextMode;
    setAppViewMode(nextMode);

    const targetLimit =
      nextMode === "lite" ? LITE_WALLET_LIMIT : MAIN_WALLET_LIMIT;
    const targetProfiles = profilesRef.current.slice(0, targetLimit);

    try {
      addLog(
        `[ENGINE] Initializing isolated ${nextMode.toUpperCase()} motor for ${targetProfiles.length} wallet(s).`,
      );
      await initializeAllProfiles(targetProfiles, false);
      addLog(
        `[ENGINE] ${nextMode.toUpperCase()} motor is ready. Press START ALL to begin mining.`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`[ERROR] ${nextMode.toUpperCase()} motor switch failed: ${message}`);
    } finally {
      setRestoring(false);
      setEngineSwitching(false);
    }
  };

  return (
    <main className={`miner-app${appViewMode === "lite" ? " lite-app" : ""}`}>
      <header className="app-header" data-tauri-drag-region>
        <div className="brand-block">
          <div className="app-menu-wrap">
            <button
              className="brand-mark brand-menu-button"
              type="button"
              aria-label={t.about}
              title={t.about}
              onClick={() => setAppMenuOpen((current) => !current)}
            >
              <img src="/cappacki-logo.png" alt="CappAckiMiner logo" />
            </button>

            {appMenuOpen && (
              <div className="app-menu" role="menu">
                <div className="app-menu-header">
                  <strong>{t.about}</strong>
                  <small>v0.2.1</small>
                </div>

                <div className="app-menu-section developer-card">
                  <div className="developer-copy">
                    <span>{t.developer}</span>

                    <a
                      className="developer-row developer-telegram"
                      href="https://t.me/cappadocia77"
                      target="_blank"
                      rel="noreferrer"
                    >
                      <i>✈</i>
                      <span>
                        <small>{t.telegram}</small>
                        <strong>@cappadocia77</strong>
                      </span>
                    </a>

                    <div className="developer-row developer-wallet">
                      <i>◆</i>
                      <span>
                        <small>{t.wallet}</small>
                        <strong>isaasi</strong>
                      </span>
                    </div>
                  </div>

                  <div className="developer-menu-art" aria-hidden="true">
                    <img src="/menu-turkiye-logo.png" alt="" />
                  </div>
                </div>

                <div className="app-menu-section license-pricing-card">
                  <details className="license-pricing-details">
                    <summary>{t.licensePackages}</summary>
                  <span>{t.licensePackages}</span>
                  <small className="license-pricing-note">{t.licenseRuntimeNote}</small>
                  <div className="license-price-list">
                    <div className="license-price-row license-price-donation">
                      <strong>2 {t.walletUnit}</strong>
                      <span>{t.freeDonation}</span>
                    </div>
                    <div className="license-price-row">
                      <strong>5 {t.walletUnit}</strong>
                      <span>700 NACKL</span>
                    </div>
                    <div className="license-price-row">
                      <strong>12 {t.walletUnit}</strong>
                      <span>1,400 NACKL</span>
                    </div>
                    <div className="license-price-row">
                      <strong>24 {t.walletUnit}</strong>
                      <span>2,100 NACKL</span>
                    </div>
                    <div className="license-price-row">
                      <strong>3–100 {t.walletsUnit}</strong>
                      <span>{t.custom}</span>
                    </div>
                  </div>
                  </details>
                </div>

                <div className="app-menu-section network-overview-menu-section">
                  <span>{t.networkTitle}</span>
                  <div className="network-overview-metrics">
                    <strong>
                      {networkOverview.totalWallets === null
                        ? "—"
                        : networkOverview.totalWallets.toLocaleString()} {t.walletsUnit}
                    </strong>
                  </div>
                  <div className="network-overview-epoch">
                    <strong>
                      {t.sdkEpochRemaining}: {networkOverview.epochRemaining ?? t.syncing}
                    </strong>
                  </div>
                  {/* TOP 100 removed: wallet names are not reliable enough for ranking. */}
                  {/*
                  <details className="network-top-wallets">
                    <summary>TOP 100 TOTAL NACKL</summary>
                    <button
                      type="button"
                      className="network-top-wallet-copy"
                      aria-label="Copy top 100 wallet list"
                      title="Copy top 100 wallet list"
                      onClick={() => void copyTopWallets()}
                      disabled={networkOverview.topWallets.length === 0}
                    >
                      📋
                    </button>
                    <div className="network-top-wallet-list">
                      {networkOverview.topWallets.length === 0 ? (
                        <small>Waiting for BeeScan data...</small>
                      ) : (
                        networkOverview.topWallets.map((wallet) => (
                          <div className="network-top-wallet-row" key={wallet.address}>
                            <span>
                              #{wallet.rank} {wallet.username || wallet.address.slice(0, 12) + "…"}
                            </span>
                            <strong>{wallet.total_nackl.toLocaleString()} NACKL</strong>
                          </div>
                        ))
                      )}
                    </div>
                  </details> */}
                </div>

                <div className="app-menu-section compact-language-section">
                  <span>{t.language}</span>
                  <label className="language-select-shell">
                    <img
                      className="language-select-flag"
                      src={`/flags/${
                        LANGUAGE_OPTIONS.find(
                          (option) => option.value === language,
                        )?.flagCode ?? "gb"
                      }.svg`}
                      alt=""
                      aria-hidden="true"
                    />
                    <span className="language-select-copy">
                      <strong>
                        {LANGUAGE_OPTIONS.find(
                          (option) => option.value === language,
                        )?.nativeLabel ?? "English"}
                      </strong>
                    </span>
                    <select
                      value={language}
                      aria-label={t.language}
                      onChange={(event) =>
                        setLanguage(event.target.value as AppLanguage)
                      }
                    >
                      {LANGUAGE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.flag} {option.nativeLabel}
                        </option>
                      ))}
                    </select>
                    <i className="language-select-chevron" aria-hidden="true">
                      ▾
                    </i>
                  </label>
                </div>

                <div className="app-menu-section shape-preset-menu-section">
                  <span>{t.uiShape}</span>
                  <div className="shape-preset-grid">
                    {UI_SHAPE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`shape-preset-option shape-${option.value}${
                          uiShape === option.value ? " selected" : ""
                        }`}
                        aria-pressed={uiShape === option.value}
                        onClick={() => setUiShape(option.value)}
                      >
                        <i aria-hidden="true">{option.icon}</i>
                        <span>
                          {option.value === "round"
                            ? t.shapeRound
                            : t.shapeTechnical}
                        </span>
                      </button>
                    ))}
                  </div>
                  <small className="shape-preset-note">{t.uiShapeNote}</small>
                </div>

                <div className="app-menu-section animation-settings-menu-section">
                  <button
                    type="button"
                    className={`animation-master-toggle animation-master-only${
                      animationsEnabled ? " selected" : ""
                    }`}
                    aria-pressed={animationsEnabled}
                    onClick={() => setAnimationsEnabled((current) => !current)}
                  >
                    <i aria-hidden="true" />
                    <strong>
                      {animationsEnabled
                        ? t.disableAnimations
                        : t.enableAnimations}
                    </strong>
                  </button>
                </div>

                <div className="app-menu-section recovery-menu-section">
                  <span>{t.autoRecovery}</span>
                  <div className="recovery-help-row">
                    <label
                      className={`watchdog-toggle watchdog-menu ${watchdogEnabled ? "is-enabled" : ""}`}
                      title={t.autoRecovery}
                    >
                      <input
                        type="checkbox"
                        checked={watchdogEnabled}
                        onChange={(event) => {
                          const enabled = event.target.checked;
                          setWatchdogEnabled(enabled);

                          if (!enabled) {
                            sessionStorage.removeItem(WATCHDOG_RELOAD_PENDING_KEY);
                            watchdogUnhealthySinceRef.current.clear();
                          }
                        }}
                      />
                      <span className="watchdog-switch" aria-hidden="true" />
                      <span className="watchdog-copy">
                        <strong>
                          {watchdogEnabled ? t.enabled : t.disabled}
                        </strong>
                        <small>
                          {watchdogLastCheck
                            ? `${t.lastCheck}: ${watchdogLastCheck}`
                            : t.checking}
                        </small>
                      </span>
                    </label>

                    <button
                      className="standalone-help-button"
                      type="button"
                      aria-label={t.help}
                      onClick={() => void openHelpFile()}
                    >
                      ? {t.help}
                    </button>
                  </div>
                </div>


                
                <button
                  className="app-menu-close"
                  type="button"
                  onClick={() => void closeApplication()}
                >
                  × {t.close}
                </button>
              </div>
            )}
          </div>

          <div
            className="title-drag-region"
            data-tauri-drag-region
            onMouseDown={(event) => {
              if (event.button === 0) {
                void appWindow.startDragging();
              }
            }}
          >
            <h1
              ref={titleRef}
              className={titleSparkLevel > 0 ? "title-sparking" : ""}
            >
              {appViewMode === "lite" ? "CappAckiMiner Lite" : "CappAckiMiner"}
              {appViewMode === "main" && titleSparkLevel > 0 && (
                <span className="title-sparks" aria-hidden="true">
                  {TITLE_SPARK_POINTS.slice(0, titleSparkLevel * 3).map(
                    (spark, index) => (
                      <i
                        className="title-spark"
                        key={index}
                        style={
                          {
                            "--spark-x": `${spark.x}%`,
                            "--spark-y": `${spark.y}%`,
                            "--spark-dx": `${spark.dx}px`,
                            "--spark-dy": `${spark.dy}px`,
                            "--spark-size": `${spark.size}px`,
                            "--spark-delay": `${-spark.delay}ms`,
                          } as CSSProperties
                        }
                      />
                    ),
                  )}
                </span>
              )}
            </h1>
          </div>
        </div>

        <div className="header-upper-actions">
          <button
            className={`button button-secondary view-mode-toggle ${
              appViewMode === "lite" ? "is-lite" : "is-main"
            }`}
            type="button"
            disabled={engineSwitching || restoring}
            aria-label={
              appViewMode === "lite"
                ? t.switchToMain
                : t.switchToLite
            }
            title={
              appViewMode === "lite"
                ? t.switchToMain
                : t.switchToLite
            }
            onClick={() => {
              setAppMenuOpen(false);
              setUtilityPanel("none");
              void switchMiningMode();
            }}
          >
            {engineSwitching
              ? t.switching
              : appViewMode === "lite"
                ? t.mainMode
                : t.liteMode}
          </button>
          <div className="total-wallet-balance-card">
            <span>{t.totalBalance}</span>
            <div>
              <strong className="total-nackl-value">{totalWalletBalanceText}</strong>
            </div>
            {/* LITE-DAILY-INCOME-UNDER-TOTAL-V1 */}
            {appViewMode === "lite" && (
              <div
                className="lite-daily-income-under-total"
                title={`${t.total24h} · ${portfolioIncome.updatedAt || "—"}`}
              >
                <span>{t.dailyNackl}</span>
                <strong>
                  +{Number.isFinite(Number(portfolioIncome.daily))
                    ? Math.round(
                        Number(portfolioIncome.daily),
                      ).toLocaleString("en-US")
                    : portfolioIncome.daily}
                </strong>
                <small>NACKL</small>
              </div>
            )}
          </div>
          <button className="button button-secondary log-access-button" onClick={() => setUtilityPanel((current) => current === "log" ? "none" : "log")}>{t.log}</button>
          <button className="button button-secondary admin-access-button" type="button" onClick={() => void openProtectedPanel("admin")}>{t.adminShort}</button>
          {LOCAL_DEVELOPER_TOOLS_ENABLED && (
            <button
              className="button button-secondary developer-access-button"
              type="button"
              onClick={() => void openProtectedPanel("developer")}
            >
              {t.developerShort}
            </button>
          )}
        </div>

        <div className="window-controls">
          <button
                      className="icon-button window-theme-button has-tooltip"
                      data-tooltip={t.theme}
                      aria-label={t.theme}
                      onClick={() =>
                        setUtilityPanel((current) =>
                          current === "themes" ? "none" : "themes",
                        )
                      }
                      title={t.theme}
                    >
                      ◈
                    </button>


          <button
            className="window-control-button"
            type="button"
            title={t.minimize}
            aria-label={t.minimize}
            onClick={() => void minimizeWindow()}
          >
            —
          </button>
          <button
            className="window-control-button"
            type="button"
            title={t.maximize}
            aria-label={t.maximize}
            onClick={() => void toggleMaximizeWindow()}
          >
            □
          </button>
          <button
            className="window-control-button window-control-tray"
            type="button"
            title={t.hideTray}
            aria-label={t.hideTray}
            onClick={() => void hideToTray()}
          >
            ▾
          </button>
        </div>
      </header>

      <section className="farm-toolbar">
        <div
          className="system-monitor"
          aria-label={t.systemMonitor}
          title={t.systemMonitor}
        >
          <div className={`system-monitor-item cpu-usage-${cpuUsageClass}`}>
            <span className="system-monitor-label">{t.cpu}</span>
            <strong>{cpuLabel}</strong>
          </div>
          {systemMetrics.cpu_temperature_c !== null && (
            <div className={`system-monitor-item temperature-${temperatureClass}`}>
              <span className="system-monitor-label">{t.temp}</span>
              <strong>{temperatureLabel}</strong>
            </div>
          )}
          <div
            className={`system-monitor-item network-tps network-${networkHealth.status}`}
            title="BeeScan live Acki Nacki network TPS"
          >
            <span className="system-monitor-label">{t.tps}</span>
            <strong>{networkHealth.tps === null ? "—" : Math.round(networkHealth.tps)}</strong>
          </div>
          <div
            className={`system-monitor-item network-stress stress-${networkStress.level}`}
            title={`${t.stress}: ${stressLabel}`}
          >
            <span className="system-monitor-label">{t.stress}</span>
            <strong>{stressLabel}</strong>
          </div>
        </div>

        {appViewMode === "main" && (
          <div className="portfolio-toolbar portfolio-toolbar-compact">
            <div className="portfolio-income-grid portfolio-income-single">
              <div
                className="total-income-24h-card"
                title={t.total24h}
              >
                <span>{t.total24h}</span>
                <strong>
                  +{Number.isFinite(Number(portfolioIncome.daily))
                    ? Math.round(Number(portfolioIncome.daily)).toLocaleString("en-US")
                    : portfolioIncome.daily}
                </strong>
                <small>NACKL</small>
                <time>
                  {portfolioIncome.loading
                    ? t.refreshing
                    : portfolioIncome.updatedAt || "—"}
                </time>
              </div>
            </div>
          </div>
        )}

        

        {appViewMode === "main" && (
          <label
            className={`watchdog-toggle watchdog-toolbar-hidden ${watchdogEnabled ? "is-enabled" : ""}`}
            title={t.autoRecovery}
          >
            <input
              type="checkbox"
              checked={watchdogEnabled}
              onChange={(event) => {
                const enabled = event.target.checked;
                setWatchdogEnabled(enabled);

                if (!enabled) {
                  sessionStorage.removeItem(WATCHDOG_RELOAD_PENDING_KEY);
                  watchdogUnhealthySinceRef.current.clear();
                }
              }}
            />
            <span className="watchdog-switch" aria-hidden="true" />
            <span className="watchdog-copy">
              <strong>
                {t.autoRecovery}
              </strong>
              <small>
                {watchdogEnabled
                  ? watchdogLastCheck
                    ? `${t.lastCheck}: ${watchdogLastCheck}`
                    : t.enabled
                  : t.disabled}
              </small>
            </span>
          </label>
        )}

        <div className="toolbar-actions">

          <div className="running-status-stack">
            <div
              className={`running-inline-status ${
                runningWalletCount > 0 ? "is-running" : ""
              }`}
              title={`${t.running}: ${runningWalletCount}/${activeModeProfiles.length}`}
              aria-label={`${t.running}: ${runningWalletCount}/${activeModeProfiles.length}`}
            >
              <span>{t.running}</span>
              <strong>{runningWalletCount}/{activeModeProfiles.length}</strong>
            </div>
            <button
              type="button"
              className={`balance-sort-button ${balanceSortEnabled ? "is-active" : ""}`}
              onClick={() => setBalanceSortEnabled((enabled) => !enabled)}
              title={balanceSortEnabled ? t.balanceSortDisable : t.balanceSortEnable}
              aria-pressed={balanceSortEnabled}
            >
              {t.balanceSort}
            </button>
          </div>

          <button
            className={`button button-start-all orb-green-start ${runningWalletCount > 0 ? "mining-active" : ""}`}
            onClick={startAll}
            disabled={activeModeProfiles.length === 0 || restoring}
            aria-label={t.startAll}
            title={t.startAll}
          >
            <span className="start-mining-halo" aria-hidden="true" />
          </button>
          <button
            className={`button button-stop-all ${runningWalletCount > 0 ? "stop-calm-during-mining" : ""}`}
            onClick={stopAll}
            disabled={profiles.length === 0}
            aria-label={t.stopAll}
            title={t.stopAll}
          />
          <button
            className="button button-secondary button-add-wallet"
            aria-label={t.addWallet}
            title={t.addWallet}
            onClick={() =>
              setUtilityPanel((current) =>
                current === "add" ? "none" : "add",
              )
            }
          >
            <span className="add-wallet-plus" aria-hidden="true">+</span>
            <span className="add-wallet-icon" aria-hidden="true" />
          </button>
          <button
            className="button button-secondary log-access-button"
            onClick={() =>
              setUtilityPanel((current) =>
                current === "log" ? "none" : "log",
              )
            }
          >
            ☰ {t.log}
          </button>
          <button
            className="button button-secondary admin-access-button"
            type="button"
            onClick={() => void openProtectedPanel("admin")}
          >
            ADMIN
          </button>
          {LOCAL_DEVELOPER_TOOLS_ENABLED && (
            <button
              className="button button-secondary developer-access-button"
              type="button"
              onClick={() => void openProtectedPanel("developer")}
            >
              DEVELOPER
            </button>
          )}
        </div>
      </section>

      {appViewMode === "lite" ? (
        <>
          <section className="wallet-section">
            <div className="lite-wallet-toolbar">
              <label className="lite-search-box">
                <span>{t.search}</span>
                <input
                  type="search"
                  value={liteSearch}
                  onChange={(event) => setLiteSearch(event.target.value)}
                  placeholder={t.walletSearchPlaceholder}
                  autoComplete="off"
                />
              </label>
          
              <label className="lite-status-filter">
                <span>{t.status}</span>
                <select
                  value={liteStatusFilter}
                  onChange={(event) =>
                    setLiteStatusFilter(
                      event.target.value as typeof liteStatusFilter,
                    )
                  }
                >
                  <option value="all">{t.all}</option>
                  <option value="running">{t.running}</option>
                  <option value="waiting">{t.waiting}</option>
                  <option value="error">{t.errorUnknown}</option>
                  <option value="stopped">{t.stopped}</option>
                </select>
              </label>
          
              <div
                className="lite-wallet-count"
                title={`${liteRunningProfilesCount} running / ${liteProfiles.length} Lite wallets`}
              >
                <span className="lite-running-indicator" aria-hidden="true" />
                <strong>{liteRunningProfilesCount}</strong>
                <span className="lite-running-copy">
                  <b>{t.running}</b>
                  <small>{liteProfiles.length} / {LITE_WALLET_LIMIT} {t.total}</small>
                  <button
                    type="button"
                    className={`balance-sort-button lite-balance-sort-button ${balanceSortEnabled ? "is-active" : ""}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setBalanceSortEnabled((enabled) => !enabled);
                    }}
                    title={balanceSortEnabled ? t.balanceSortDisable : t.balanceSortEnable}
                    aria-pressed={balanceSortEnabled}
                  >
                    {t.balanceSort}
                  </button>
                </span>
              </div>
            </div>
          
            <div className="lite-dual-table-head" aria-hidden="true">
              <div className="lite-table-head">
                <span>{t.walletStatus}</span>
                <span>{t.balanceReward}</span>
                <span>{t.results}</span>
                <span>TAP</span>
                <span>{t.actions}</span>
              </div>
              <div className="lite-table-head lite-table-head-copy">
                <span>{t.walletStatus}</span>
                <span>{t.balanceReward}</span>
                <span>{t.results}</span>
                <span>TAP</span>
                <span>{t.actions}</span>
              </div>
            </div>
          
            {liteProfiles.length === 0 ? (
              <div className="lite-no-results">{t.noWallets}</div>
            ) : (
              <div className="lite-wallet-list">
                {liteSortedProfiles.map((profile) => {
                  const state =
                    runtimeStates[profile.id] ?? createEmptyRuntime();
                  const tapLimit = TAP_MODE_CONFIGS[tapMode].tapsPerSession;
                  const displayedTaps = state.acceptedProgressHeld
                    ? tapLimit
                    : Math.min(tapLimit, state.tapCount);
                  const tapProgress = Math.min(
                    100,
                    Math.round((displayedTaps / tapLimit) * 100),
                  );
                  const isRunning = state.autoMine || state.mining;
                  const latestReward = state.recent5mRewards[0] ?? null;
                  const liteAcceptedPulse =
                    liteAcceptedPulses[profile.id] ?? 0;
                  const liteRejectedPulse =
                    tapRejectPulses[profile.id] ?? 0;

                  return (
                    <article
                      className={`lite-wallet-row ${
                        isRunning ? "is-running" : ""
                      } ${
                        profile.id === activeProfileId ? "is-active" : ""
                      } ${
                        liteAcceptedPulse ? "is-lite-accepted" : ""
                      } ${
                        liteRejectedPulse ? "is-lite-rejected" : ""
                      }`}
                      data-wallet-profile-id={profile.id}
                      key={profile.id}
                      onClick={() => walletCardSelect(profile.id)}
                    >
                      <div className="lite-wallet-identity">
                        <div className="lite-wallet-name-line">
                          <strong title={profile.walletName}>
                            {profile.walletName}
                          </strong>
                          <span
                            className={`status-pill ${walletCardStatusClass(
                              state.status,
                            )}`}
                          >
                            {displayStatus(state.status)}
                          </span>
                        </div>
                      </div>
          
                      <div className="lite-wallet-balance">
                        <span className="lite-wallet-balance-value">
                          <strong>{state.nacklBalance}</strong>
                          <span>NACKL</span>
                        </span>
                        <div
                          className="lite-wallet-reward-line"
                          title={
                            latestReward
                              ? `${t.latestReward}: +${latestReward.amount} NACKL · ${latestReward.time}`
                              : t.noRewardYet
                          }
                        >
                          {latestReward ? (
                            <span className="lite-wallet-reward-value">
                              <strong>+{latestReward.amount}</strong>
                              <time>{latestReward.time}</time>
                            </span>
                          ) : (
                            <span className="lite-wallet-no-reward">
                              {t.noReward}
                            </span>
                          )}
                        </div>
                      </div>
          
                      <div className="lite-wallet-results">
                        <span>
                          <small>{t.accepted}</small>
                          <strong className="metric-good">
                            {state.acceptedSessions}
                          </strong>
                        </span>
                        <span>
                          <small>{t.rejected}</small>
                          <strong className="metric-bad">
                            {state.rejectedSessions}
                          </strong>
                        </span>
                      </div>
          
                      <div className="lite-wallet-tap">
                        <div className={`lite-tap-track ${displayedTaps >= tapLimit ? "is-complete" : ""}`.trim()}>
                          <i style={{ width: `${tapProgress}%` }} />
                        </div>
                        <strong>
                          {displayedTaps}/{tapLimit}
                        </strong>
                      </div>
          
                      <div
                        className="lite-wallet-actions"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="lite-action-button lite-action-start"
                          title={`${t.startWallet}: ${profile.walletName}`}
                          aria-label={`${t.startWallet}: ${profile.walletName}`}
                          disabled={!state.initialized || state.autoMine}
                          onClick={() => walletCardStart(profile.id)}
                        >
                          ▶
                        </button>
          
                        <button
                          type="button"
                          className="lite-action-button lite-action-stop"
                          title={`${t.stopWallet}: ${profile.walletName}`}
                          aria-label={`${t.stopWallet}: ${profile.walletName}`}
                          disabled={!state.autoMine && !state.mining}
                          onClick={() => walletCardStop(profile.id)}
                        >
                          ■
                        </button>
          
                        <button
                          type="button"
                          className="lite-action-button lite-action-reconnect"
                          title={`${t.reconnect}: ${profile.walletName}`}
                          aria-label={`${t.reconnect}: ${profile.walletName}`}
                          disabled={state.autoMine || authorizing}
                          onClick={() => walletCardReconnect(profile.id)}
                        >
                          ↻
                        </button>
          
                        <button
                          type="button"
                          className="lite-action-button lite-action-delete"
                          title={`${t.removeWallet}: ${profile.walletName}`}
                          aria-label={`${t.removeWallet}: ${profile.walletName}`}
                          disabled={state.autoMine || authorizing}
                          onClick={() => {
                            const approved = window.confirm(
                              `${profile.walletName}\n\n${t.removeConfirm}\n${t.removeConfirmDetail}`,
                            );
          
                            if (approved) {
                              walletCardRemove(profile.id);
                            }
                          }}
                        >
                          ×
                        </button>
                      </div>
                    </article>
                  );
                })}
          
                {liteVisibleProfiles.length === 0 && (
                  <div className="lite-no-results">
                    {t.noFilterMatches}
                  </div>
                )}
              </div>
            )}
          </section>

          {liteAcceptedNotice && (
            <div
              className={`lite-accepted-toast ${
                liteAcceptedNotice.rewardAmount ? "has-reward" : ""
              }`}
              role="status"
              aria-live="polite"
              key={liteAcceptedNotice.id}
            >
              <span className="lite-accepted-toast-icon" aria-hidden="true">
                ✓
              </span>
              <div>
                <small>{t.accepted}</small>
                <strong>{liteAcceptedNotice.walletName}</strong>
                <b>
                  {liteAcceptedNotice.rewardAmount
                    ? `+${liteAcceptedNotice.rewardAmount} NACKL`
                    : t.rewardChecking}
                </b>
                {liteAcceptedNotice.rewardTime && (
                  <time>{liteAcceptedNotice.rewardTime}</time>
                )}
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <section className="wallet-section">
          
            <div className="wallet-water-surface" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
          
            {mainProfiles.length === 0 ? (
              <div className="empty-state">{t.noWallets}</div>
            ) : (
              <div
                className={`wallet-grid wallet-grid-columns-${walletGridColumns}${mainProfiles.length >= 20 ? " wallet-grid-compact" : ""}`}
                data-wallet-grid
                style={
                  {
                    "--wallet-grid-columns": walletGridColumns,
                    "--wallet-grid-rows": walletWindowSizeForCount(mainProfiles.length).rows,
                  } as CSSProperties
                }
              >
                {mainDisplayProfiles.map((profile, index) => (
                  <WalletCard
                    key={profile.id}
                    profile={profile}
                    index={index}
                    state={runtimeStates[profile.id] ?? createEmptyRuntime()}
                    active={profile.id === activeProfileId}
                    animationsEnabled={animationsEnabled}
                    celebrationId={celebratingWallets[profile.id] ?? 0}
                    celebrationEffect={
                      celebrationEffects[profile.id] ?? "energy"
                    }
                    rejectedAnimationId={
                      rejectedAnimations[profile.id] ?? 0
                    }
                    rejectedAftermathId={
                      rejectedAftermaths[profile.id] ?? 0
                    }
                    tapRejectPulseId={tapRejectPulses[profile.id] ?? 0}
                    dragged={profile.id === draggedProfileId}
                    dragOver={profile.id === dragOverProfileId}
                    walletGridColumns={walletGridColumns}
                    tapMode={tapMode}
                    walletMenuOpen={walletMenuId === profile.id}
                    authorizing={authorizing}
                    statusLabel={displayStatus(
                      (runtimeStates[profile.id] ?? createEmptyRuntime()).status,
                    )}
                    labels={t}
                    onMouseDown={walletCardMouseDown}
                    onSelect={walletCardSelect}
                    onStart={walletCardStart}
                    onStop={walletCardStop}
                    onToggleMenu={walletCardToggleMenu}
                    onReconnect={walletCardReconnect}
                    onRemove={walletCardRemove}
                  />
                ))}
                {draggedProfileId &&
                  Array.from(
                    { length: walletGridColumns * WALLET_GRID_ROWS },
                    (_, slot) => slot,
                  )
                    .filter(
                      (slot) => {
                        const draggedProfile = profiles.find(
                          (profile) => profile.id === draggedProfileId,
                        );
          
                        return (
                          !profileOccupyingGridSlot(profiles, slot) &&
                          (!draggedProfile ||
                            canPlaceWalletProfile(
                              profiles,
                              draggedProfile.id,
                              slot,
                              walletProfileSpan(draggedProfile),
                            ))
                        );
                      },
                    )
                    .map((slot) => (
                      <div
                        className={`wallet-drop-slot wallet-empty-drop-slot${
                          dragOverSlot === slot ? " is-target" : ""
                        }`}
                        style={walletGridPosition(slot, walletGridColumns)}
                        aria-hidden="true"
                        key={`empty-wallet-slot-${slot}`}
                      />
                    ))}
                {draggedProfileId &&
                  dragOverSlot !== null &&
                  profileOccupyingGridSlot(profiles, dragOverSlot) && (
                    <div
                      className="wallet-drop-slot is-target is-swap-target"
                      style={walletGridPosition(dragOverSlot, walletGridColumns)}
                      aria-hidden="true"
                    />
                  )}
          </div>
          )}

          {profiles.length > MAIN_WALLET_LIMIT && (
            <div className="main-wallet-limit-note">
              {t.mainMode}: {MAIN_WALLET_LIMIT} / {profiles.length} {t.walletsUnit} ·
              {t.liteMode}: {LITE_WALLET_LIMIT} {t.walletsUnit}
            </div>
          )}
          </section>
        </>
      )}

      {dragPreview && (() => {
        const draggedProfile = profiles.find(
          (profile) => profile.id === dragPreview.profileId,
        );

        const draggedIndex = profiles.findIndex(
          (profile) => profile.id === dragPreview.profileId,
        );

        if (!draggedProfile) {
          return null;
        }

        return (
          <div
            className="wallet-drag-preview"
            style={{
              left: dragPreview.x,
              top: dragPreview.y,
            }}
            aria-hidden="true"
          >
            <span>
              {String(draggedIndex + 1).padStart(2, "0")}
            </span>
            <strong>{draggedProfile.walletName}</strong>
          </div>
        );
      })()}

      {utilityPanel !== "none" && (
        <div
          className={`drawer-backdrop${
            utilityPanel === "themes"
              ? " drawer-backdrop-themes"
              : ""
          }`}
          role="presentation"
          onMouseDown={() => setUtilityPanel("none")}
        >
        <aside
          className={`utility-drawer ${utilityPanel === "themes" ? "utility-drawer-themes" : ""} ${utilityPanel === "add" ? "utility-drawer-add" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label={
            utilityPanel === "add"
              ? t.addWallet
              : utilityPanel === "log"
                ? t.log
                : utilityPanel === "admin"
                  ? "Admin panel"
                  : utilityPanel === "developer"
                    ? "Developer panel"
                    : t.themeSelection
          }
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="drawer-header">
            <h3>
              {utilityPanel === "add" &&
                (reconnectingProfileId
                  ? t.reconnectWallet
                  : t.addWallet)}
              {utilityPanel === "log" && t.log}
              {utilityPanel === "admin" && t.adminPanel}
              {utilityPanel === "developer" && t.developerPanel}
              {utilityPanel === "themes" &&
                (appViewMode === "lite"
                  ? t.liteThemeSelection
                  : t.mainThemeSelection)}
            </h3>
            <button
              className="drawer-close"
              onClick={() => {
                setUtilityPanel("none");
                setWalletMenuId(null);
              }}
            >
              ×
            </button>
          </div>

          {utilityPanel === "add" && (
            <div className="drawer-content">
              <p>
                {reconnectingProfileId
                  ? `${t.reconnectWallet}: ${
                      profiles.find(
                        (profile) => profile.id === reconnectingProfileId,
                      )?.walletName ?? ""
                    }`
                  : t.addWalletIntro}
              </p>

              {reconnectingProfileId && (
                <label
                  className={`reconnect-verify-toggle ${
                    verifyReconnectKey ? "is-enabled" : ""
                  }`}
                  title={
                    verifyReconnectKey
                      ? t.verifyOn
                      : t.verifyOff
                  }
                >
                  <input
                    type="checkbox"
                    checked={verifyReconnectKey}
                    onChange={(event) =>
                      setVerifyReconnectKey(event.target.checked)
                    }
                  />
                  <span className="reconnect-verify-switch" aria-hidden="true" />
                  <span>
                    <strong>
                      {t.verifyMiningKey}
                    </strong>
                    <small>
                      {verifyReconnectKey ? t.verifyOn : t.verifyOff}
                    </small>
                  </span>
                </label>
              )}
              {!reconnectingProfileId && (
                <div className="add-wallet-row">
                  <input
                    className="wallet-name-input"
                    value={newWalletName}
                    onChange={(event) => setNewWalletName(event.target.value)}
                    placeholder={t.walletAccountName}
                    disabled={authorizing || restoring}
                  />
                  <button
                    className={`button button-primary${authorizing ? " is-authorizing" : ""}`}
                    type="button"
                    onClick={() => void addWallet()}
                    disabled={!sdkReady || restoring || authorizing}
                  >
                    {authorizing ? t.waitingApproval : t.addWalletQr}
                  </button>
                </div>
              )}

              {qrCode && (
                <div
                  className={`qr-section ${
                    authorizationStage === "waiting-identity"
                      ? "qr-section-awaiting-identity"
                      : connectedWalletName
                        ? "qr-section-wallet-identified"
                        : ""
                  }`}
                >
                  <p className="qr-title">
                    {t.scanWith}{" "}
                    {reconnectingProfileId
                      ? profiles
                          .find(
                            (profile) =>
                              profile.id === reconnectingProfileId,
                          )
                          ?.walletName.toUpperCase() ?? "AN WALLET"
                    : normalizeWalletName(newWalletName).toUpperCase() ||
                      connectedWalletName.toUpperCase() ||
                        "AN WALLET"}
                  </p>
                  {!reconnectingProfileId && (
                    <small className="qr-connection-status">
                      {authorizationStage === "waiting-identity"
                        ? t.waitingQrApproval
                        : authorizationStage === "requesting-key"
                          ? `${t.walletIdentified}: ${connectedWalletName.toUpperCase()} — ${t.verifyingMiningKey}`
                          : authorizationStage === "waiting-mining"
                            ? t.approveMiningKey
                            : ""}
                    </small>
                  )}
                  <div className="qr-box">
                    <img
                      src={qrCode}
                      alt="AN Wallet mining authorization QR code"
                    />
                  </div>
                  <button
                    className="button button-secondary"
                    onClick={() => void copyDeepLink()}
                  >
                    {t.copyLink}
                  </button>
                </div>
              )}
            </div>
          )}

          {utilityPanel === "log" && (
            <div className="drawer-content log-drawer-content">
              <div className="log-toolbar">
                <span>{logs.length} {t.entries}</span>

                <div className="log-toolbar-actions">
                  <button
                    className="button button-secondary"
                    onClick={saveLogs}
                  >
                    {t.saveLog}
                  </button>

                  <button
                    className="button button-secondary"
                    onClick={() => void openLogFolder()}
                  >
                    {t.openLogFolder}
                  </button>

                  <button
                    className="button button-secondary"
                    onClick={clearLogs}
                  >
                    {t.clearLog}
                  </button>
                </div>
              </div>
              <div className="activity-log">
                {logs.map((entry, index) => (
                  <p
                    className={`activity-log-entry ${activityLogClass(entry.message)}`}
                    key={`${entry.time}-${index}`}
                  >
                    <time>{entry.time}</time>
                    <span>{entry.message}</span>
                  </p>
                ))}
              </div>
            </div>
          )}

          {(utilityPanel === "admin" ||
            (LOCAL_DEVELOPER_TOOLS_ENABLED &&
              utilityPanel === "developer")) && (
            <div className="drawer-content protected-panel-content">
              <div className="protected-panel-badge">
                {utilityPanel === "developer" ? adminLabels.developer : adminLabels.admin}
              </div>
              {utilityPanel === "developer" && (
                <>
                  <h4>{adminLabels.developerTitle}</h4>
                  <p>{adminLabels.developerDescription}</p>
                </>
              )}
              <div className={`license-status-card license-usage-${licenseUsageClass}`}>
                <span>{adminLabels.status}</span>
                <strong>
                  {licenseSnapshot.developerUnlimited
                    ? adminLabels.unlimited
                    : licenseSnapshot.usageLimitReached
                      ? adminLabels.limitReached
                    : licenseSnapshot.licenseTier
                      ? `${licenseSnapshot.licenseTier}-WALLET LICENSE`
                    : "2-WALLET FREE"}
                </strong>
                <small>
                  {licenseSnapshot.developerUnlimited
                    ? adminLabels.noExpiration
                    : licenseSnapshot.licenseTier === null
                      ? `FREE / DONATION - ${adminLabels.noExpiration}`
                    : `${licenseSnapshot.miningUsageHours.toFixed(1)} / ${licenseSnapshot.maxMiningHours.toFixed(0)} HOURS USED${licenseSnapshot.deviceIdBound ? " · DEVICE BOUND" : ""}`}
                </small>
              </div>
              {utilityPanel === "admin" && sortedPendingLicenses.length > 0 && (
                <div className="license-queue-card">
                  <span>{adminLabels.waiting}</span>
                  {sortedPendingLicenses.map((pending, index) => (
                    <button
                      key={`${pending.tier}-${pending.maxUsageHours}-${index}`}
                      type="button"
                      disabled={pending.usageLimitReached}
                      onClick={() => {
                        const nextLicense = activatePendingLicense(pending.originalIndex);
                        setLicenseSnapshot(nextLicense);
                        addLog(`[LICENSE] ${pending.tier}-wallet license selected.`);
                      }}
                    >
                      {pending.tier}-WALLET · {pending.maxUsageHours} HOURS
                      {pending.usageLimitReached ? ` · ${adminActionLabels.done}` : ""}
                      {` · ${adminLabels.select}`}
                    </button>
                  ))}
                </div>
              )}
              {utilityPanel === "admin" && (
                <div className="license-key-tools">
                  <button
                    type="button"
                    className="license-activate-button"
                    onClick={async () => {
                      const nextLicense = await activateLicenseKey(licenseKeyInput);
                      if (!nextLicense) {
                        addLog("[LICENSE] Invalid license key format.");
                        return;
                      }
                      setLicenseSnapshot(nextLicense);
                      setLicenseKeyInput("");
                      addLog(`[LICENSE] ${nextLicense.licenseTier}-wallet license activated.`);
                    }}
                  >
                    {adminLabels.activate}
                  </button>
                  <input
                    value={licenseKeyInput}
                    onChange={(event) => setLicenseKeyInput(event.target.value)}
                    placeholder="CAP-5-XXXXXXXX"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const deviceId = await invoke<string>("get_device_id");
                        await navigator.clipboard.writeText(deviceId);
                        addLog("[LICENSE] Device license code copied.");
                      } catch (error) {
                        addLog(`[LICENSE] Device code unavailable: ${String(error)}`);
                      }
                    }}
                  >
                    {adminLabels.copyDevice}
                  </button>
                  <button type="button" onClick={() => void createWalletTransferExe()}>
                    {adminActionLabels.transferBackup}
                  </button>
                </div>
              )}
              {utilityPanel === "admin" && backupPathNotice && (
                <div className="backup-path-notice">
                  <strong>{adminActionLabels.backupTitle}</strong>
                  {backupPathNotice.startsWith("C:\\") ? (
                    <button
                      type="button"
                      className="backup-path-link"
                      title={t.openBackupLocation}
                      onClick={() => void revealItemInDir(backupPathNotice)}
                    >
                      {backupPathNotice}
                    </button>
                  ) : (
                    <code>{backupPathNotice}</code>
                  )}
                </div>
              )}
              {utilityPanel === "admin" && !licenseSnapshot.developerUnlimited && (
                <div className="license-wallet-picker">
                  <button
                    type="button"
                    className="working-wallets-button"
                    onClick={() => setWalletSelectorOpen((current) => !current)}
                  >
                    {adminActionLabels.workingWallets} ({licenseSnapshot.selectedWalletIds.length}/{licenseWalletLimit})
                  </button>
                  {walletSelectorOpen && <div className="license-wallet-options">
                      {profiles.map((profile) => {
                        const selected = licenseSnapshot.selectedWalletIds.includes(
                          profile.id,
                        );
                        return (
                          <button
                            key={profile.id}
                            className={selected ? "selected" : ""}
                            type="button"
                            onClick={() => {
                              const nextIds = selected
                                ? licenseSnapshot.selectedWalletIds.filter(
                                    (id) => id !== profile.id,
                                  )
                                : [
                                    ...licenseSnapshot.selectedWalletIds,
                                    profile.id,
                                  ];
                              setLicenseSnapshot(
                                setSelectedLicenseWalletIds(nextIds, licenseWalletLimit),
                              );
                            }}
                          >
                            {profile.walletName}
                          </button>
                        );
                      })}
                  </div>}
                </div>
              )}
              {utilityPanel === "developer" && (
                <button
                  className="button button-primary"
                  type="button"
                  onClick={() => {
                    const nextLicense = enableDeveloperUnlimitedLicense();
                    setLicenseSnapshot(nextLicense);
                    addLog("[DEVELOPER] Unlimited license enabled.");
                  }}
                >
                  {licenseSnapshot.developerUnlimited
                    ? adminActionLabels.unlimitedActive
                    : adminActionLabels.enableUnlimited}
                </button>
              )}
              {utilityPanel === "developer" && (
                <div className="license-key-tools">
                  <p>{adminActionLabels.signedKeys}</p>
                </div>
              )}
            </div>
          )}

          {utilityPanel === "themes" && (
            <div className="drawer-content">
              <div className="theme-grid">
                {(
                  [
                    ["ocean-blue", "Ocean Blue"],
                    ["pearl-white", "Pearl White"],
                    ["pastel-pink", "Pastel Pink"],
                    ["moonlit-teal", "Moonlit Teal"],
                    ["graphite-gray", "Graphite Gray"],
                    ["indigo-calm", "Indigo Calm"],
                    ["aubergine-haze", "Aubergine Haze"],
                    ["obsidian-cyan", "Obsidian Cyan"],
                  ] as Array<[ThemeName, string]>
                ).map(([value, label]) => (
                  <button
                    key={value}
                    className={`theme-option theme-${value} ${
                      theme === value ? "selected" : ""
                    }`}
                    onClick={() => setTheme(value)}
                  >
                    <span></span>
                    <strong>{label}</strong>
                  </button>
                ))}
              </div>
            </div>
          )}

        </aside>
        </div>
      )}
    </main>
  );
}

export default App;

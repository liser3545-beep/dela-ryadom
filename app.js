const STORAGE_KEY = "dela-ryadom-state-v6";
const DRAFT_KEY = "dela-ryadom-create-draft-v1";
const DEVICE_ACCOUNT_KEY = "dela-ryadom-device-account-v1";
const LEGACY_STORAGE_KEYS = ["dela-ryadom-state-v2", "dela-ryadom-state-v3", "dela-ryadom-state-v4", "dela-ryadom-state-v5"];
const APP_CONFIG = globalThis.DELA_RYADOM_CONFIG || {};
const API_BASE_URL = trimTrailingSlash(APP_CONFIG.API_BASE_URL || "");
const API_ENDPOINTS = {
  me: apiUrl("/api/auth/me"),
  register: apiUrl("/api/auth/register"),
  login: apiUrl("/api/auth/login"),
  logout: apiUrl("/api/auth/logout"),
  account: apiUrl("/api/account"),
  esiaStart: apiUrl("/api/auth/esia/start"),
  esiaStatus: apiUrl("/api/auth/esia/status"),
  phoneStart: apiUrl("/api/auth/phone/start"),
  phoneVerify: apiUrl("/api/auth/phone/verify"),
  events: apiUrl("/api/events"),
  tasks: apiUrl("/api/tasks"),
  taskMessages: apiUrl("/api/tasks/{taskId}/messages"),
  taskAction: apiUrl("/api/tasks/{taskId}/actions/{action}"),
  supportTickets: apiUrl("/api/support/tickets"),
  supportTicket: apiUrl("/api/support/tickets/{ticketId}"),
  supportTicketMessages: apiUrl("/api/support/tickets/{ticketId}/messages"),
  payments: apiUrl("/api/payments"),
  payouts: apiUrl("/api/payouts"),
  transactions: apiUrl("/api/transactions"),
  filePrepare: apiUrl("/api/files/prepare"),
  fileComplete: apiUrl("/api/files/{fileId}/complete"),
  adminTaskModeration: apiUrl("/api/admin/tasks/moderation"),
  adminTaskModerate: apiUrl("/api/admin/tasks/{taskId}/moderate"),
  pushSubscribe: apiUrl("/api/push/subscribe"),
};
const SUPPORT_USERNAME = "Поддержка_ДелаРядом358935-345324";
const WORKER_DEPOSIT = 100;
const CATEGORY_HINTS = [
  { category: "Ремонт и мастер", price: 2200, words: ["почин", "ремонт", "кран", "собрат", "полом", "мастер"] },
  { category: "Фотозадание", price: 150, words: ["фото", "сфот", "сним", "проверить витрин", "адрес"] },
  { category: "Онлайн-проверка", price: 900, words: ["сайт", "ошибк", "скрин", "онлайн", "провер", "тест"] },
  { category: "Шопинг-помощник", price: 800, words: ["куп", "магазин", "товар", "продукт", "лекар"] },
  { category: "Уборка и помощь дома", price: 1200, words: ["убор", "помы", "дом", "квартир", "разобрать", "помощ"] },
  { category: "IT и настройка", price: 1000, words: ["компьют", "телефон", "роутер", "настро", "принтер", "вайфай", "wi-fi"] },
  { category: "Питомцы", price: 700, words: ["кот", "собак", "питом", "выгул", "корм", "вет"] },
  { category: "Документы и ТЗ", price: 1500, words: ["документ", "тз", "техническ", "таблиц", "договор"] },
];
const ADDRESS_PRESETS = [
  "Москва, Тверская улица, 7",
  "Москва, Тверская улица, 9",
  "Москва, Ленинградский проспект, 37",
  "Санкт-Петербург, Невский проспект, 28",
  "Санкт-Петербург, Литейный проспект, 46",
];
const HOUSE_NUMBER_MIN_ZOOM = 16;
const HOUSE_NUMBER_LIMIT = 180;
const RISKY_CHAT_PATTERN = /(скинь|кинь|переведи|перевод|оплат[аи]|заплачу|доплачу)\s+(мне\s+)?(на\s+)?(карт|сбер|тинькофф|tinkoff|номер|телефон|сч[её]т)|предоплат|аванс\s+(на\s+)?(карт|сбер|тинькофф|номер|телефон|сч[её]т)|телеграм|telegram|whatsapp|ватсап|viber|вайбер|номер\s+карт|\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/i;

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function apiUrl(path) {
  return `${API_BASE_URL}${path}`;
}

const labels = {
  open: "Открыто",
  accepted: "Принято",
  progress: "Выполняется",
  review: "Проверка",
  revision: "Доработка",
  rejected: "Отклонено",
  done: "Готово",
};

const step = { accepted: 0, progress: 1, revision: 1, review: 2, done: 3 };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const money = (value) => `${Number(value || 0).toLocaleString("ru-RU")} ₽`;
const rubles = (value) => Math.max(0, Math.round(Number(value || 0)));
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);
const escapeAttribute = (value) => escapeHtml(value).replace(/'/g, "&#39;");
const iconSvg = {
  user: '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12.2a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>',
  lock: '<svg class="icon-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2" /><path d="M6.5 10h11A1.5 1.5 0 0 1 19 11.5v7A1.5 1.5 0 0 1 17.5 20h-11A1.5 1.5 0 0 1 5 18.5v-7A1.5 1.5 0 0 1 6.5 10Z" /></svg>',
  attachment: '<svg class="meta-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m20 12.5-7.5 7.5a5 5 0 0 1-7.1-7.1l8.4-8.4a3.4 3.4 0 0 1 4.8 4.8l-8.4 8.4a1.8 1.8 0 1 1-2.5-2.5l7.5-7.5" /></svg>',
};
const DEFAULT_MAP_CENTER = [55.751244, 37.618423];
const STORE_FETCH_LIMIT = 160;
const COMMUNITY_AGREEMENT_VERSION = "ru-2026-07-03-geo-personal-data";
const STORE_BRANDS = [
  { key: "pyaterochka", className: "store-marker-pyaterochka", short: "5", names: ["пятёрочка", "пятерочка", "pyaterochka", "5ka"] },
  { key: "magnit", className: "store-marker-magnit", short: "М", names: ["магнит", "magnit"] },
  { key: "vkusvill", className: "store-marker-vkusvill", short: "ВВ", names: ["вкусвилл", "vkusvill"] },
  { key: "lenta", className: "store-marker-lenta", short: "Л", names: ["лента", "lenta"] },
  { key: "perekrestok", className: "store-marker-perekrestok", short: "П", names: ["перекрёсток", "перекресток", "perekrestok"] },
  { key: "dixy", className: "store-marker-dixy", short: "Д", names: ["дикси", "dixy"] },
  { key: "auchan", className: "store-marker-auchan", short: "A", names: ["ашан", "auchan"] },
  { key: "metro", className: "store-marker-metro", short: "M", names: ["metro", "метро"] },
];

let deferredInstallPrompt = null;
let timerId = null;
let taskMap = null;
let taskLayer = null;
let storeLayer = null;
let houseLayer = null;
let houseNumbersLoadedKey = "";
let houseNumbersTimer = null;
let houseNumbersLoading = false;
let stores = [];
let storesLoadedKey = "";
let storesLoading = false;
let mapAutoFitDone = false;
let userMarker = null;
let userAccuracyCircle = null;
let userLocation = null;
let geoPermissionStatus = "pending";
let geoPermissionMessageShown = false;
let geoWatchId = null;
let taskSyncInProgress = false;
let taskSyncTimerId = null;
let taskSyncAgain = false;
let taskEvents = null;
let taskEventsReconnectTimer = null;
let taskEventsConnected = false;
let draftLocation = null;
let draftMarker = null;
let pickingLocation = false;
let pendingPhoneVerificationId = "";
let pendingPhoneVerificationPhone = "";
let accountFormMode = "register";
let pendingCommunityAgreementResolve = null;
let csrfToken = "";

clearLegacyState();
const state = loadState() || createInitialState();

function createInitialState() {
  return {
    role: "customer",
    screen: "home",
    filter: "all",
    categoryFilter: "all",
    minPrice: "",
    maxDistance: "",
    myFilter: "active",
    search: "",
    activeTaskId: null,
    account: {
      id: globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random()),
      registered: false,
      signedIn: false,
      name: "Пользователь",
      username: "",
      password: "",
      supportOperator: false,
      moderator: false,
      admin: false,
      phone: "",
      phoneVerified: false,
      city: "",
      balance: 0,
      verified: false,
      authProvider: "local",
      externalId: "",
      communityAgreementVersion: "",
      communityAgreementAcceptedAt: "",
    },
    ratings: {
      customer: { total: 0, count: 0 },
      worker: { total: 0, count: 0 },
    },
    notifications: 3,
    notificationItems: [
      notificationItem("Система", "Приложение готово", "Офлайн-режим включён", "system"),
      notificationItem("Безопасность", "Жалобы и арбитраж", "Споры рассматривает поддержка", "system"),
      notificationItem("Финансы", "Эскроу", "Оплата удерживается до приёмки", "system"),
    ],
    supportTickets: [],
    activeSupportTicketId: null,
    supportTaskLookup: "",
    soundEvents: [],
    users: [],
    moderationTasks: [],
    transactions: [],
    auditLog: [],
    errorLog: [],
    pushEnabled: false,
    activity: [
      activity("Система", "Приложение готово к работе офлайн"),
      activity("Безопасность", "Жалобы и арбитраж доступны через поддержку"),
      activity("Финансы", "Эскроу удерживает оплату до приемки"),
    ],
    tasks: [],
  };
}

function createUserSnapshot(account = state.account, extras = {}) {
  const now = new Date().toISOString();
  return {
    id: account.id || globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random()),
    name: account.name || "Пользователь",
    username: account.username || "",
    phone: account.phone || "",
    city: account.city || "",
    registeredAt: extras.registeredAt || now,
    lastSeenAt: now,
    verified: Boolean(account.verified),
    phoneVerified: Boolean(account.phoneVerified),
    supportOperator: Boolean(account.supportOperator),
    moderator: Boolean(account.moderator),
    admin: Boolean(account.admin),
    blocked: Boolean(extras.blocked ?? account.blocked),
    warning: extras.warning ?? account.warning ?? "",
    authProvider: account.authProvider || "local",
  };
}

function normalizeUser(user = {}) {
  return {
    id: user.id || globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random()),
    name: user.name || "Пользователь",
    username: user.username || "",
    phone: user.phone || "",
    city: user.city || "",
    registeredAt: user.registeredAt || new Date().toISOString(),
    lastSeenAt: user.lastSeenAt || user.registeredAt || new Date().toISOString(),
    verified: Boolean(user.verified),
    phoneVerified: Boolean(user.phoneVerified),
    supportOperator: Boolean(user.supportOperator),
    moderator: Boolean(user.moderator),
    admin: Boolean(user.admin),
    blocked: Boolean(user.blocked),
    warning: user.warning || "",
    authProvider: user.authProvider || "local",
  };
}

function normalizeTransaction(transaction = {}) {
  return {
    id: transaction.id || globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random()),
    type: transaction.type || "system",
    title: transaction.title || "Операция",
    amount: Math.round(Number(transaction.amount || 0)),
    status: transaction.status || "demo",
    taskPublicId: transaction.taskPublicId || "",
    referenceType: transaction.referenceType || "",
    referenceId: transaction.referenceId || "",
    createdAt: transaction.createdAt || new Date().toISOString(),
  };
}

function normalizeAuditEntry(entry = {}) {
  return {
    id: entry.id || globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random()),
    actor: entry.actor || "Система",
    action: entry.action || "Событие",
    details: entry.details || "",
    time: entry.time || new Date().toISOString(),
  };
}

function createTask(title, description, category, price, distance, online, customer, hot = false) {
  const amount = rubles(price);
  return {
    id: globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random()),
    publicId: "",
    title,
    description,
    category,
    price: amount,
    escrowAmount: amount,
    purchaseBudget: 0,
    attachments: [],
    deadlineType: "urgent",
    deadlineAt: null,
    hidePhone: true,
    workerDeposit: 0,
    dispute: false,
    advancePaid: false,
    paidOut: false,
    distance,
    online,
    customer,
    hot,
    location: null,
    address: online ? "Онлайн" : "Рядом с вами",
    minutes: amount >= 3000 ? 180 : 30,
    status: "open",
    worker: null,
    ratings: {},
    hasPhoto: false,
    acceptedAt: null,
    startedAt: null,
    dueAt: null,
    checklist: { location: false, photo: false, comment: false },
    messages: [{ author: customer, text: "Напишите, если нужны уточнения.", role: "customer" }],
  };
}

function activity(title, text) {
  return { id: globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random()), title, text, time: new Date().toISOString() };
}

function notificationItem(title, text, reason = "Обновление", type = "system", refId = "") {
  return {
    id: globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random()),
    title,
    text,
    reason,
    type,
    refId,
    read: false,
    time: new Date().toISOString(),
  };
}

function clearLegacyState() {
  try {
    LEGACY_STORAGE_KEYS.filter((key) => !["dela-ryadom-state-v3", "dela-ryadom-state-v4"].includes(key)).forEach((key) => localStorage.removeItem(key));
  } catch {}
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("dela-ryadom-state-v4") || localStorage.getItem("dela-ryadom-state-v3");
    if (!raw) {
      const deviceAccount = loadDeviceAccount();
      if (!deviceAccount) return null;
      const initial = createInitialState();
      initial.account = normalizeAccount({ account: { ...initial.account, ...deviceAccount, signedIn: true } });
      return initial;
    }
    const parsed = JSON.parse(raw);
    parsed.activity = parsed.activity || [];
    parsed.notifications = parsed.notifications ?? 0;
    parsed.notificationItems = (parsed.notificationItems || [])
      .map((item) => ({ read: false, reason: "Обновление", type: "system", refId: "", ...item }))
      .filter((item) => item.type !== "support");
    if (!parsed.notificationItems.length && parsed.notifications) {
      parsed.notificationItems = [notificationItem("Система", "Есть новые события", "Старые уведомления", "system")];
    }
    parsed.supportTaskLookup = parsed.supportTaskLookup || "";
    parsed.soundEvents = (parsed.soundEvents || []).map((event) => ({ id: event.id || String(Date.now() + Math.random()), taskId: event.taskId || "", taskPublicId: event.taskPublicId || "", customerAccountId: event.customerAccountId || "", customerKey: event.customerKey || "", title: event.title || "Задание принято", text: event.text || "Исполнитель принял задание", played: Boolean(event.played), createdAt: event.createdAt || new Date().toISOString() }));
    parsed.search = parsed.search || "";
    parsed.categoryFilter = parsed.categoryFilter || "all";
    parsed.minPrice = parsed.minPrice || "";
    parsed.maxDistance = parsed.maxDistance || "";
    parsed.myFilter = parsed.myFilter || "active";
    parsed.pushEnabled = Boolean(parsed.pushEnabled);
    parsed.account = normalizeAccount(parsed);
    restoreDeviceAccount(parsed);
    parsed.supportTickets = (parsed.supportTickets || []).map((ticket) => normalizeSupportTicket(ticket, parsed.account));
    parsed.activeSupportTicketId = parsed.activeSupportTicketId || visibleSupportTickets(parsed).find(Boolean)?.id || null;
    parsed.tasks = parsed.tasks?.map((task) => normalizeTask(task, parsed.account)) || [];
    parsed.users = (parsed.users || []).map(normalizeUser);
    parsed.moderationTasks = (parsed.moderationTasks || []).map((task) => normalizeTask(task, parsed.account));
    parsed.transactions = (parsed.transactions || []).map(normalizeTransaction);
    parsed.auditLog = (parsed.auditLog || []).map(normalizeAuditEntry);
    parsed.errorLog = (parsed.errorLog || []).map(normalizeAuditEntry);
    if (parsed.account.registered && !parsed.users.some((user) => user.id === parsed.account.id)) {
      parsed.users.unshift(createUserSnapshot(parsed.account));
    }
    parsed.ratings = {
      customer: { total: 0, count: 0, ...parsed.ratings?.customer },
      worker: { total: 0, count: 0, ...parsed.ratings?.worker },
    };
    return parsed;
  } catch {
    return null;
  }
}

function normalizeSupportTicket(ticket = {}, account = null) {
  return {
    id: ticket.id || globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random()),
    publicId: ticket.publicId || `SUP-${String(Date.now()).slice(-6)}`,
    status: ticket.status || "bot",
    reason: ticket.reason || "Вопрос пользователя",
    taskPublicId: ticket.taskPublicId || "",
    createdByAccountId: ticket.createdByAccountId || account?.id || "",
    createdByKey: ticket.createdByKey || accountOwnerKey(account),
    createdBy: ticket.createdBy || "Пользователь",
    unreadForUser: Number(ticket.unreadForUser || 0),
    unreadForSupport: Number(ticket.unreadForSupport || 0),
    createdAt: ticket.createdAt || new Date().toISOString(),
    updatedAt: ticket.updatedAt || ticket.createdAt || new Date().toISOString(),
    messages: (ticket.messages || []).map((message) => ({
      author: message.author || "Поддержка",
      role: message.role || "bot",
      text: message.text || "",
      time: message.time || new Date().toISOString(),
    })),
  };
}

function saveState() {
  persistDeviceAccount();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadDeviceAccount() {
  try {
    const account = JSON.parse(localStorage.getItem(DEVICE_ACCOUNT_KEY) || "null");
    return account?.registered ? account : null;
  } catch {
    return null;
  }
}

function persistDeviceAccount(account = state?.account) {
  if (!account?.registered) return;
  if (account.signedIn === false) {
    try {
      localStorage.removeItem(DEVICE_ACCOUNT_KEY);
    } catch {}
    return;
  }
  try {
      localStorage.setItem(DEVICE_ACCOUNT_KEY, JSON.stringify({
      id: account.id,
      registered: true,
      signedIn: true,
      name: account.name,
      username: account.username,
      supportOperator: Boolean(account.supportOperator),
      phone: account.phone,
      phoneVerified: Boolean(account.phoneVerified),
      city: account.city,
      balance: rubles(account.balance),
      blocked: Boolean(account.blocked),
      warning: account.warning || "",
      verified: Boolean(account.verified),
      authProvider: account.authProvider || "local",
      externalId: account.externalId || "",
      communityAgreementVersion: account.communityAgreementVersion || COMMUNITY_AGREEMENT_VERSION,
      communityAgreementAcceptedAt: account.communityAgreementAcceptedAt || "",
    }));
  } catch {}
}

function restoreDeviceAccount(parsed) {
  const deviceAccount = loadDeviceAccount();
  if (!deviceAccount) return;
  if (!parsed.account?.registered || parsed.account.id === deviceAccount.id || parsed.account.username === deviceAccount.username || parsed.account.phone === deviceAccount.phone) {
    parsed.account = normalizeAccount({ account: { ...parsed.account, ...deviceAccount, signedIn: true } });
  }
}

function normalizeTask(task, account = null) {
  const accountId = account?.id || null;
  const customerAccountId = task.customerAccountId || (accountId && task.customer ? accountId : null);
  const workerAccountId = task.workerAccountId || (accountId && task.worker ? accountId : null);

  return {
    acceptedAt: null,
    startedAt: null,
    dueAt: null,
    checklist: { location: false, photo: false, comment: false },
    location: null,
    attachments: [],
    deadlineType: "urgent",
    deadlineAt: null,
    hidePhone: true,
    workerDeposit: 0,
    dispute: false,
    moderationStatus: "pending",
    moderationNote: "Ждёт проверки модератором",
    priority: "normal",
    proofPhotos: [],
    disputeStatus: "none",
    disputeResolution: "",
    disputeOpenedAt: "",
    customerAcceptedSoundPlayed: false,
    ...task,
    customerAccountId,
    workerAccountId,
    ratings: task.ratings || {},
    escrowAmount: Number(task.escrowAmount ?? task.price ?? 0),
    purchaseBudget: 0,
    advancePaid: Boolean(task.advancePaid),
    paidOut: Boolean(task.paidOut),
    proofPhotos: task.proofPhotos || [],
    moderationStatus: task.moderationStatus || "approved",
    moderationNote: task.moderationNote || "Автоматически одобрено",
    disputeStatus: task.disputeStatus || (task.dispute ? "open" : "none"),
    disputeResolution: task.disputeResolution || "",
    disputeOpenedAt: task.disputeOpenedAt || "",
    customerAcceptedSoundPlayed: Boolean(task.customerAcceptedSoundPlayed),
  };
}

function taskUpdatedTime(task) {
  return Date.parse(task.updatedAt || task.createdAt || task.acceptedAt || 0) || 0;
}

function touchTask(task) {
  task.updatedAt = new Date().toISOString();
  return task.updatedAt;
}

function mergeTasks(tasks = []) {
  let changed = false;
  tasks.map((task) => normalizeTask(task)).forEach((incoming) => {
    const index = state.tasks.findIndex((item) => item.id === incoming.id || (incoming.publicId && item.publicId === incoming.publicId));
    if (index < 0) {
      state.tasks.unshift(incoming);
      changed = true;
      return;
    }
    const current = state.tasks[index];
    if (taskUpdatedTime(incoming) > taskUpdatedTime(current)) {
      const keepPrivate = incoming.hasPrivateDetails && !current.hasPrivateDetails;
      state.tasks[index] = {
        ...current,
        ...incoming,
        ...(keepPrivate ? {
          messages: current.messages,
          proofPhotos: current.proofPhotos,
          customerAccountId: current.customerAccountId,
          workerAccountId: current.workerAccountId,
        } : {}),
      };
      changed = true;
    }
  });
  if (changed) {
    updateTaskDistances();
    saveState();
  }
  return changed;
}

function normalizeAccount(parsed = {}) {
  const account = parsed.account || {};
  const legacyBalance = Math.max(rubles(parsed.customerBalance), rubles(parsed.workerBalance));
  const name = (account.name || "Пользователь").trim() || "Пользователь";

  return {
    id: account.id || globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random()),
    registered: Boolean(account.registered),
    signedIn: Boolean(account.registered) && account.signedIn !== false,
    name,
    username: account.username || "",
    password: "",
    supportOperator: Boolean(account.supportOperator || account.admin || account.username === SUPPORT_USERNAME || name === SUPPORT_USERNAME),
    moderator: Boolean(account.moderator || account.admin || account.supportOperator),
    admin: Boolean(account.admin),
    blocked: Boolean(account.blocked),
    warning: account.warning || "",
    phone: account.phone || "",
    phoneVerified: Boolean(account.phoneVerified),
    city: account.city || "",
    balance: rubles(account.balance ?? legacyBalance),
    verified: Boolean(account.verified),
    authProvider: account.authProvider || "local",
    externalId: account.externalId || "",
    communityAgreementVersion: account.communityAgreementVersion || "",
    communityAgreementAcceptedAt: account.communityAgreementAcceptedAt || "",
  };
}

function accountName() {
  return state.account?.name || "Пользователь";
}

function accountShortName() {
  return accountName().trim().split(/\s+/)[0] || "Пользователь";
}

function isSupportOperator() {
  return Boolean(isSignedIn() && state.account.supportOperator);
}

function isModerator() {
  return Boolean(isSignedIn() && (state.account.moderator || state.account.supportOperator || state.account.admin));
}

function currentUserRecord() {
  return state.users.find((user) => user.id === state.account.id || (state.account.username && user.username === state.account.username) || (state.account.phone && user.phone === state.account.phone));
}

function syncAccountBlockStatus() {
  const user = currentUserRecord();
  if (!user) return;
  state.account.blocked = Boolean(user.blocked);
  state.account.warning = user.warning || "";
}

function isBlockedAccount() {
  syncAccountBlockStatus();
  return Boolean(state.account.blocked);
}

function blockMessage() {
  return state.account.warning || "Вы заблокированы";
}

function forceBlockedLogout(message = blockMessage()) {
  csrfToken = "";
  if (state.account.registered) state.account.signedIn = false;
  setAccountFormMode("login");
  render();
  setScreen("register");
  toast(message);
}

function ensureCanInteract() {
  if (!ensureRegistered()) return false;
  if (!isBlockedAccount()) return true;
  forceBlockedLogout();
  return false;
}

function nextTaskPublicId() {
  const used = new Set(state.tasks.map((task) => task.publicId).filter(Boolean));
  let number = state.tasks.length + 1;
  let id = "";
  do {
    id = `DR-${String(number).padStart(6, "0")}`;
    number += 1;
  } while (used.has(id));
  return id;
}

function taskByPublicId(publicId) {
  const normalized = String(publicId || "").trim().toUpperCase();
  return state.tasks.find((task) => String(task.publicId || "").toUpperCase() === normalized);
}

function visibleSupportTickets(sourceState = state) {
  const account = sourceState.account || {};
  const supportMode = Boolean(account.supportOperator && account.signedIn !== false);
  if (supportMode) return sourceState.supportTickets || [];
  return (sourceState.supportTickets || []).filter((ticket) => isOwnSupportTicket(ticket, account));
}

function accountOwnerKey(account = state.account) {
  return `${String(account.username || "").trim().toLowerCase()}|${digitsOnly(account.phone)}`;
}

function isOwnSupportTicket(ticket, account = state.account) {
  const ownerKey = accountOwnerKey(account);
  if (ticket.createdByKey) return ticket.createdByKey === ownerKey;
  return ticket.createdByAccountId === account.id && ticket.createdBy === account.name;
}

function activeSupportTicket() {
  const tickets = visibleSupportTickets();
  return tickets.find((ticket) => ticket.id === state.activeSupportTicketId) || tickets[0] || null;
}

function accountInitials() {
  return accountName()
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("") || "П";
}

function isOwnCustomerTask(task) {
  return Boolean(task && (task.customerAccountId === state.account.id || (!task.customerAccountId && task.customer === accountShortName())));
}

function isOwnWorkerTask(task) {
  return Boolean(task && (task.workerAccountId === state.account.id || (!task.workerAccountId && task.worker === accountShortName())));
}

function canOpenTask(task) {
  return Boolean(task && (isSupportOperator() || isOwnCustomerTask(task) || isOwnWorkerTask(task)));
}

function canWorkerManageTask(task) {
  return state.role === "worker" && isOwnWorkerTask(task);
}

function canCustomerManageTask(task) {
  return state.role === "customer" && isOwnCustomerTask(task);
}

function canChatInTask(task) {
  return canCustomerManageTask(task) || canWorkerManageTask(task);
}

function canRateTask(task, role = state.role) {
  if (!task || task.status !== "done" || task.ratings?.[role]) return false;
  return role === "customer" ? isOwnCustomerTask(task) : role === "worker" && isOwnWorkerTask(task);
}

function migrateLocalOwnership(previousAccount, nextAccount) {
  const previousId = previousAccount?.id || "";
  const previousName = previousAccount?.name || "";
  const nextKey = accountOwnerKey(nextAccount);

  state.tasks.forEach((task) => {
    if (task.customerAccountId === previousId || (!task.customerAccountId && task.customer === previousName)) {
      task.customerAccountId = nextAccount.id;
      if (!task.customer || task.customer === previousName || task.customer === "Пользователь") task.customer = nextAccount.name;
    }
    if (task.worker && (task.workerAccountId === previousId || (!task.workerAccountId && task.worker === previousName))) {
      task.workerAccountId = nextAccount.id;
      if (task.worker === previousName || task.worker === "Пользователь") task.worker = nextAccount.name;
    }
  });

  state.supportTickets.forEach((ticket) => {
    if (ticket.createdByAccountId === previousId || (!ticket.createdByAccountId && ticket.createdBy === previousName)) {
      ticket.createdByAccountId = nextAccount.id;
      ticket.createdByKey = nextKey;
      ticket.createdBy = nextAccount.name;
    }
  });

  state.soundEvents.forEach((event) => {
    if (!event.customerAccountId || event.customerAccountId === previousId) event.customerAccountId = nextAccount.id;
  });
}

function applyServerAccount(serverAccount, extras = {}) {
  if (!serverAccount?.id) return null;
  const previousAccount = { ...state.account };
  state.account = {
    ...state.account,
    ...extras,
    id: serverAccount.id,
    registered: true,
    signedIn: true,
    name: serverAccount.name || state.account.name || "Пользователь",
    username: serverAccount.username || state.account.username || "",
    password: "",
    supportOperator: Boolean(serverAccount.supportOperator || serverAccount.admin || serverAccount.roles?.includes("admin") || serverAccount.roles?.includes("support") || serverAccount.username === SUPPORT_USERNAME || serverAccount.name === SUPPORT_USERNAME),
    moderator: Boolean(serverAccount.moderator || serverAccount.admin || serverAccount.supportOperator || serverAccount.roles?.includes("admin") || serverAccount.roles?.includes("moderator") || serverAccount.roles?.includes("support")),
    admin: Boolean(serverAccount.admin || serverAccount.roles?.includes("admin")),
    phone: serverAccount.phone || state.account.phone || "",
    phoneVerified: Boolean(serverAccount.phoneVerified),
    city: serverAccount.city || state.account.city || "",
    balance: rubles(serverAccount.balance ?? extras.balance ?? state.account.balance),
    verified: Boolean(serverAccount.verified),
    authProvider: serverAccount.authProvider || state.account.authProvider || "local",
    externalId: serverAccount.externalId || state.account.externalId || "",
    communityAgreementVersion: serverAccount.communityAgreementVersion || extras.communityAgreementVersion || state.account.communityAgreementVersion || "",
    communityAgreementAcceptedAt: serverAccount.communityAgreementAcceptedAt || extras.communityAgreementAcceptedAt || state.account.communityAgreementAcceptedAt || "",
  };
  migrateLocalOwnership(previousAccount, state.account);
  upsertCurrentUser();
  return state.account;
}

async function loadServerSession() {
  try {
    const data = await apiRequest(API_ENDPOINTS.me);
    if (data.account) {
      applyServerAccount(data.account);
      return true;
    }
  } catch (error) {
    if (error.status && error.status !== 401) logError("Проверка серверной сессии", error.message);
  }
  return false;
}

async function updateServerAccount(updates) {
  const data = await apiRequest(API_ENDPOINTS.account, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  return applyServerAccount(data.account, updates);
}

function isSignedIn() {
  return Boolean(state.account.registered && state.account.signedIn !== false);
}

function isEditingAccountForm() {
  if (!$("#screen-register")?.classList.contains("active")) return false;
  return Boolean(document.activeElement?.closest?.("#register-form"));
}

function setAccountFormMode(mode = "register") {
  accountFormMode = ["login", "recover"].includes(mode) ? mode : "register";
  const recoveryMode = accountFormMode === "recover";
  const loginMode = accountFormMode === "login";
  const hasAccount = Boolean(state.account.registered);
  $("#screen-register").dataset.title = recoveryMode ? "Восстановление" : loginMode ? "Вход" : "Регистрация";
  $("#register-hero-icon").innerHTML = loginMode || recoveryMode ? iconSvg.lock : iconSvg.user;
  $("#register-hero-title").textContent = recoveryMode ? "Восстановление аккаунта" : loginMode ? "Вход в аккаунт" : "Единый аккаунт";
  $("#register-hero-text").textContent = recoveryMode
    ? "Введите номер зарегистрированного аккаунта, получите SMS/push-код и задайте новый пароль."
    : loginMode
    ? "Введите юзернейм, телефон и пароль от уже зарегистрированного аккаунта. Новая регистрация при входе не создаётся."
    : "Заполните данные один раз: в режиме заказчика и исполнителя будет использоваться один и тот же профиль.";
  $("#register-name-label").classList.toggle("hidden", loginMode || recoveryMode);
  $("#register-name").required = !loginMode && !recoveryMode;
  $("#register-name").disabled = loginMode || recoveryMode;
  $("#register-username").closest("label").classList.toggle("hidden", recoveryMode);
  $("#register-username").disabled = false;
  $("#register-username").required = !recoveryMode;
  $("#register-password").required = loginMode || recoveryMode || !hasAccount;
  $("#register-password").autocomplete = loginMode ? "current-password" : "new-password";
  $("#register-password").placeholder = recoveryMode ? "Новый пароль, минимум 4 символа" : hasAccount && !loginMode ? "Новый пароль, если хотите сменить" : "Минимум 4 символа";
  $("#send-sms-code").hidden = loginMode;
  $("#send-sms-code").textContent = recoveryMode ? "Получить код восстановления" : "Получить SMS/push-код";
  $("#register-sms-code").closest("label").classList.toggle("hidden", loginMode);
  $("#register-city-label").classList.toggle("hidden", loginMode || recoveryMode);
  $("#register-city").required = !loginMode && !recoveryMode;
  $("#register-city").disabled = loginMode || recoveryMode;
  $("#forgot-password").hidden = !loginMode;
  $("#back-to-login").classList.toggle("hidden", !recoveryMode);
  $("#register-submit").textContent = recoveryMode ? "Восстановить доступ" : loginMode ? "Войти" : hasAccount ? "Сохранить аккаунт" : "Зарегистрироваться";
  if ((loginMode || recoveryMode) && hasAccount && !isEditingAccountForm()) $("#register-phone").value = state.account.phone;
  if ($("#screen-register").classList.contains("active")) $("#screen-title").textContent = $("#screen-register").dataset.title;
}

function showCommunityAgreement() {
  const modal = $("#community-agreement");
  modal.classList.remove("hidden");
  $("#agreement-accept").focus();
  return new Promise((resolve) => {
    pendingCommunityAgreementResolve = resolve;
  });
}

function closeCommunityAgreement(accepted) {
  const modal = $("#community-agreement");
  modal.classList.add("hidden");
  if (pendingCommunityAgreementResolve) {
    pendingCommunityAgreementResolve(Boolean(accepted));
    pendingCommunityAgreementResolve = null;
  }
}

function ensureRegistered() {
  if (isSignedIn()) {
    syncAccountBlockStatus();
    if (isBlockedAccount()) {
      forceBlockedLogout();
      return false;
    }
    return true;
  }
  if (state.account.registered) {
    toast("Войдите в аккаунт, чтобы продолжить");
    setAccountFormMode("login");
    setScreen("register");
    return false;
  }
  toast("Сначала зарегистрируйте единый аккаунт");
  setAccountFormMode("register");
  setScreen("register");
  return false;
}

async function logoutAccount() {
  if (!state.account.registered) return;
  try {
    await apiRequest(API_ENDPOINTS.logout, { method: "POST", body: JSON.stringify({}) });
  } catch (error) {
    logError("Серверный выход", error.message);
  }
  state.account.signedIn = false;
  csrfToken = "";
  try {
    localStorage.removeItem(DEVICE_ACCOUNT_KEY);
  } catch {}
  addActivity("Аккаунт", "Вы вышли из аккаунта. Серверная сессия завершена.");
  setAccountFormMode("login");
  render();
  setScreen("register");
  toast("Вы вышли. Чтобы вернуться, нажмите «Войти»");
}

function ratingValue(role) {
  const rating = state.ratings?.[role] || { total: 0, count: 0 };
  return rating.count ? (rating.total / rating.count).toFixed(1) : "0";
}

function ratingCount(role) {
  return state.ratings?.[role]?.count || 0;
}

function taskAmount(task) {
  return rubles(task?.escrowAmount ?? task?.price ?? 0);
}

function totalEscrow(task) {
  return taskAmount(task);
}

function normalizeCity(value) {
  return String(value || "").trim().toLowerCase().replace(/^г\.?\s*/i, "");
}

function cityFromAddress(address) {
  const text = String(address || "").trim();
  if (!text || text.toLowerCase() === "онлайн") return "";
  const first = text.split(",")[0].trim();
  if (["москва", "санкт-петербург", "казань", "самара", "екатеринбург", "новосибирск"].includes(first.toLowerCase())) return first;
  return state.account.city || "";
}

function taskCity(task) {
  return normalizeCity(task.city || cityFromAddress(task.address));
}

function accountCity() {
  return normalizeCity(state.account.city);
}

function supportBotReply(text) {
  const lower = text.toLowerCase();
  if (/оплат|деньг|баланс|вывод|сбп|карт/.test(lower)) {
    return "Проверьте баланс в профиле, статус задания и сумму эскроу. Если деньги не появились после приёмки — передайте чат живой поддержке, указав ID задания.";
  }
  if (/задан|исполн|заказ|чат|номер|id|идентифик/.test(lower)) {
    return "Откройте карточку задания и посмотрите ID вида DR-000001. По нему поддержка быстро найдёт чат и историю сообщений.";
  }
  if (/госуслуг|есиа|подтвержд|личност/.test(lower)) {
    return "Нажмите «Подтвердить личность» в профиле. Если backend ЕСИА настроен, откроется Госуслуги; после возврата нажмите «Проверить статус ЕСИА».";
  }
  if (/жалоб|спор|обман|наруш|арбитраж/.test(lower)) {
    return "Не переводите деньги вне приложения. Откройте задание, нажмите «Жалоба» или передайте этот чат живой поддержке — оператор увидит ID задания и переписку.";
  }
  return "Попробуйте: 1) проверить статус задания; 2) обновить приложение; 3) указать ID задания; 4) описать, что именно не работает. Если не помогло — нажмите «Связаться с живой поддержкой».";
}

function addNotification(title, text, reason = "Обновление", type = "system", refId = "") {
  if (type === "support") return;
  state.notificationItems.unshift(notificationItem(title, text, reason, type, refId));
  state.notificationItems = state.notificationItems.slice(0, 30);
  state.notifications = state.notificationItems.filter((item) => !item.read).length;
}

function upsertCurrentUser() {
  if (!state.account.registered) return;
  const snapshot = createUserSnapshot(state.account);
  const existing = state.users.find((user) => user.id === snapshot.id || (snapshot.username && user.username === snapshot.username) || (snapshot.phone && user.phone === snapshot.phone));
  if (existing) {
    Object.assign(existing, snapshot, {
      registeredAt: existing.registeredAt || snapshot.registeredAt,
      blocked: existing.blocked,
      warning: existing.warning,
    });
    state.account.blocked = Boolean(existing.blocked);
    state.account.warning = existing.warning || "";
  } else {
    state.users.unshift(snapshot);
  }
}

function applyServerTransactions(transactions = []) {
  state.transactions = transactions.map(normalizeTransaction).slice(0, 40);
  saveState();
  return state.transactions;
}

function addAudit(action, details = "", actor = accountShortName()) {
  state.auditLog.unshift(normalizeAuditEntry({ actor, action, details }));
  state.auditLog = state.auditLog.slice(0, 80);
}

function logError(action, details = "") {
  state.errorLog.unshift(normalizeAuditEntry({ actor: "Клиент", action, details }));
  state.errorLog = state.errorLog.slice(0, 30);
}

function moderatorTasks() {
  const source = state.moderationTasks?.length ? state.moderationTasks : state.tasks.filter((task) => task.moderationStatus && task.moderationStatus !== "approved");
  return [...source].sort((a, b) => {
    const priority = { pending: 0, rejected: 1, approved: 2 };
    return (priority[a.moderationStatus] ?? 2) - (priority[b.moderationStatus] ?? 2) || taskUpdatedTime(b) - taskUpdatedTime(a);
  });
}

function disputeTasks() {
  return state.tasks.filter((task) => task.dispute || task.disputeStatus === "open");
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

async function apiRequest(url, options = {}) {
  let response;
  const method = String(options.method || "GET").toUpperCase();
  const headers = { "Content-Type": "application/json", Accept: "application/json", ...options.headers };
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && csrfToken && !headers["X-CSRF-Token"]) headers["X-CSRF-Token"] = csrfToken;
  try {
    response = await fetch(url, {
      credentials: "include",
      ...options,
      headers,
    });
  } catch {
    throw new Error("Сервер подтверждения недоступен. Подключите backend и провайдеров ЕСИА/SMS/push.");
  }

  let data = null;
  try {
    data = await response.json();
  } catch {}

  if (!response.ok) {
    const error = new Error(data?.message || "Сервер отклонил запрос подтверждения.");
    error.status = response.status;
    throw error;
  }

  if (data?.csrfToken) csrfToken = data.csrfToken;
  return data || {};
}

async function loadRuntimeConfig() {
  try {
    const data = await apiRequest(API_ENDPOINTS.config);
    APP_CONFIG.RUNTIME = data;
    return data;
  } catch (error) {
    logError("Push config", error.message || "Не удалось получить публичную конфигурацию backend");
    return {};
  }
}

async function enableWebPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    throw new Error("Этот браузер не поддерживает Web Push уведомления.");
  }
  const runtime = APP_CONFIG.RUNTIME || await loadRuntimeConfig();
  const publicKey = runtime?.push?.vapidPublicKey || APP_CONFIG.VAPID_PUBLIC_KEY || "";
  if (!publicKey) throw new Error("Push ещё не настроен на backend: нужен VAPID public key.");
  const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Разрешите уведомления в браузере, чтобы включить push.");
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  const data = await apiRequest(API_ENDPOINTS.pushSubscribe, {
    method: "POST",
    body: JSON.stringify({ subscription, accountId: state.account.id || "" }),
  });
  if (!data.configured) throw new Error(data.message || "Push-подписка сохранена, но backend ещё не готов отправлять уведомления.");
  state.pushEnabled = true;
  addNotification("Push-уведомления", "Уведомления включены для этого устройства.", "Push", "system");
  addAudit("Push", "Пользователь включил Web Push уведомления");
  saveState();
  return data;
}

async function createSbpPayment(amount, purpose = "wallet_topup", taskPublicId = "") {
  return apiRequest(API_ENDPOINTS.payments, {
    method: "POST",
    body: JSON.stringify({ amount, purpose, taskPublicId, bank: "tbank" }),
  });
}

async function createPayout(amount, destination) {
  return apiRequest(API_ENDPOINTS.payouts, {
    method: "POST",
    body: JSON.stringify({ amount, destination, bank: "tbank" }),
  });
}

async function syncTransactionsFromBackend({ renderAfter = true } = {}) {
  if (!isSignedIn()) return false;
  try {
    const data = await apiRequest(API_ENDPOINTS.transactions);
    applyServerTransactions(data.transactions || []);
    if (renderAfter) renderFinanceAndTrust();
    return true;
  } catch (error) {
    logError("Синхронизация операций", error.message);
    return false;
  }
}

function applyServerSupportTickets(tickets = []) {
  state.supportTickets = tickets.map((ticket) => normalizeSupportTicket(ticket, state.account));
  if (!state.supportTickets.some((ticket) => ticket.id === state.activeSupportTicketId)) {
    state.activeSupportTicketId = visibleSupportTickets().find(Boolean)?.id || null;
  }
  saveState();
  return state.supportTickets;
}

async function syncSupportTicketsFromBackend({ renderAfter = true } = {}) {
  if (!isSignedIn()) return false;
  try {
    const data = await apiRequest(API_ENDPOINTS.supportTickets);
    applyServerSupportTickets(data.tickets || []);
    if (renderAfter) renderSupport();
    return true;
  } catch (error) {
    logError("Синхронизация поддержки", error.message);
    return false;
  }
}

async function createSupportTicketOnBackend(reason = "Вопрос пользователя", taskPublicId = "", status = "bot") {
  const data = await apiRequest(API_ENDPOINTS.supportTickets, {
    method: "POST",
    body: JSON.stringify({ reason, taskPublicId, status, createdByKey: accountOwnerKey() }),
  });
  if (data.tickets) applyServerSupportTickets(data.tickets);
  else if (data.ticket) applyServerSupportTickets([data.ticket, ...state.supportTickets.filter((ticket) => ticket.id !== data.ticket.id)]);
  if (data.ticket) state.activeSupportTicketId = data.ticket.id;
  saveState();
  return data.ticket ? normalizeSupportTicket(data.ticket, state.account) : activeSupportTicket();
}

async function updateSupportTicketOnBackend(ticket, updates) {
  const ticketId = encodeURIComponent(ticket.id || ticket.publicId || "");
  const endpoint = API_ENDPOINTS.supportTicket.replace("{ticketId}", ticketId);
  const data = await apiRequest(endpoint, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  if (data.tickets) applyServerSupportTickets(data.tickets);
  else if (data.ticket) applyServerSupportTickets([data.ticket, ...state.supportTickets.filter((item) => item.id !== data.ticket.id)]);
  return data.ticket ? normalizeSupportTicket(data.ticket, state.account) : ticket;
}

async function sendSupportMessageToBackend(ticket, text) {
  const ticketId = encodeURIComponent(ticket.id || ticket.publicId || "");
  const endpoint = API_ENDPOINTS.supportTicketMessages.replace("{ticketId}", ticketId);
  const data = await apiRequest(endpoint, {
    method: "POST",
    body: JSON.stringify({ text, botReply: isSupportOperator() ? "" : supportBotReply(text) }),
  });
  if (data.tickets) applyServerSupportTickets(data.tickets);
  else if (data.ticket) applyServerSupportTickets([data.ticket, ...state.supportTickets.filter((item) => item.id !== data.ticket.id)]);
  return data.ticket ? normalizeSupportTicket(data.ticket, state.account) : ticket;
}

async function syncTasksFromBackend({ renderAfter = true } = {}) {
  if (taskSyncInProgress) {
    taskSyncAgain = true;
    return false;
  }
  taskSyncInProgress = true;
  taskSyncAgain = false;
  try {
    const data = await apiRequest(API_ENDPOINTS.tasks);
    const changed = mergeTasks(data.tasks || []);
    if (changed && renderAfter) render();
    return changed;
  } catch (error) {
    logError("Синхронизация заданий", error.message);
    return false;
  } finally {
    taskSyncInProgress = false;
    if (taskSyncAgain) {
      taskSyncAgain = false;
      setTimeout(() => syncTasksFromBackend({ renderAfter }), 0);
    }
  }
}

async function syncModerationTasksFromBackend({ renderAfter = true } = {}) {
  if (!isModerator()) return false;
  try {
    const data = await apiRequest(API_ENDPOINTS.adminTaskModeration);
    state.moderationTasks = (data.tasks || []).map((task) => normalizeTask(task, state.account));
    mergeTasks(state.moderationTasks);
    saveState();
    if (renderAfter) render();
    return true;
  } catch (error) {
    logError("Очередь модерации", error.message);
    return false;
  }
}

async function moderateTaskOnBackend(task, status, note = "") {
  const taskId = encodeURIComponent(task.id || task.publicId || "");
  const endpoint = API_ENDPOINTS.adminTaskModerate.replace("{taskId}", taskId);
  const data = await apiRequest(endpoint, {
    method: "POST",
    body: JSON.stringify({ status, note }),
  });
  if (data.task) applyBackendTask(task, data.task);
  await syncModerationTasksFromBackend({ renderAfter: false });
  return data.task ? normalizeTask(data.task, state.account) : task;
}

function resetTaskPolling(intervalMs = 15000) {
  clearInterval(taskSyncTimerId);
  taskSyncTimerId = setInterval(() => syncTasksFromBackend({ renderAfter: true }), intervalMs);
}

function handleBackendEvent(event) {
  const type = event?.type || "";
  const payload = event?.payload || {};
  if (type === "task.updated" && payload.task) {
    const changed = mergeTasks([normalizeTask(payload.task)]);
    if (changed) render();
    if (isModerator()) syncModerationTasksFromBackend({ renderAfter: true });
    return;
  }
  if (type === "task.message") {
    const active = activeTask();
    const isActiveTask = active && (active.id === payload.taskId || active.publicId === payload.publicId);
    if (payload.publicId && !isActiveTask) {
      addNotification("Новое сообщение", `${payload.publicId}: чат задания обновлён`, "Чат задания", "task", payload.publicId);
    }
    syncTasksFromBackend({ renderAfter: true });
    return;
  }
  if (type === "payment.updated" || type === "payout.updated") {
    addActivity("Финансы", "Статус платежа или выплаты обновлён", false);
    syncTransactionsFromBackend({ renderAfter: true });
    return;
  }
  if (type === "transaction.created") {
    syncTransactionsFromBackend({ renderAfter: true });
    return;
  }
  if (type === "support.updated") {
    syncSupportTicketsFromBackend({ renderAfter: true });
    return;
  }
}

function scheduleBackendEventsReconnect() {
  clearTimeout(taskEventsReconnectTimer);
  taskEventsReconnectTimer = setTimeout(() => {
    taskEvents = null;
    startBackendEvents();
  }, 3000);
}

function startBackendEvents() {
  if (!("EventSource" in window) || taskEvents) {
    if (!("EventSource" in window)) resetTaskPolling(3000);
    return;
  }
  try {
    taskEvents = new EventSource(API_ENDPOINTS.events, { withCredentials: true });
    taskEvents.addEventListener("connected", () => {
      taskEventsConnected = true;
      resetTaskPolling(15000);
      syncTasksFromBackend({ renderAfter: true });
      syncSupportTicketsFromBackend({ renderAfter: true });
      syncModerationTasksFromBackend({ renderAfter: true });
    });
    ["task.updated", "task.message", "payment.updated", "payout.updated", "transaction.created", "support.updated"].forEach((type) => {
      taskEvents.addEventListener(type, (event) => {
        try {
          handleBackendEvent(JSON.parse(event.data || "{}"));
        } catch (error) {
          logError("SSE событие", error.message);
        }
      });
    });
    taskEvents.onerror = () => {
      taskEventsConnected = false;
      resetTaskPolling(3000);
      taskEvents?.close();
      scheduleBackendEventsReconnect();
    };
  } catch (error) {
    taskEventsConnected = false;
    logError("SSE подключение", error.message);
    resetTaskPolling(3000);
    scheduleBackendEventsReconnect();
  }
}

async function publishTaskToBackend(task) {
  try {
    const data = await apiRequest(API_ENDPOINTS.tasks, {
      method: "POST",
      body: JSON.stringify({ task }),
    });
    if (data.task) {
      const wasActive = state.activeTaskId === task.id;
      const published = normalizeTask(data.task);
      const index = state.tasks.findIndex((item) => item.id === task.id || item.id === published.id || (published.publicId && item.publicId === published.publicId));
      if (index >= 0) state.tasks[index] = { ...state.tasks[index], ...published };
      else mergeTasks([published]);
      if (wasActive) state.activeTaskId = published.id;
    }
    if (data.account) applyServerAccount(data.account);
    if (data.transactions) applyServerTransactions(data.transactions);
    return data.task || task;
  } catch (error) {
    logError("Публикация задания", error.message);
    toast("Задание сохранено локально. Общая синхронизация недоступна.");
    return task;
  }
}

async function syncTaskNow(task, { renderAfter = false } = {}) {
  touchTask(task);
  const published = await publishTaskToBackend(task);
  await syncTasksFromBackend({ renderAfter });
  return published;
}

async function sendTaskMessageToBackend(task, message) {
  const taskId = encodeURIComponent(task.id || task.publicId || "");
  const endpoint = API_ENDPOINTS.taskMessages.replace("{taskId}", taskId);
  const data = await apiRequest(endpoint, {
    method: "POST",
    body: JSON.stringify({ message }),
  });
  if (data.task) {
    const updated = normalizeTask(data.task);
    const index = state.tasks.findIndex((item) => item.id === updated.id || item.id === task.id || item.publicId === updated.publicId);
    if (index >= 0) state.tasks[index] = { ...state.tasks[index], ...updated };
    else mergeTasks([updated]);
    state.activeTaskId = updated.id;
  }
  return data.message || message;
}

function applyBackendTask(task, backendTask) {
  if (!backendTask) return task;
  const updated = normalizeTask(backendTask);
  const index = state.tasks.findIndex((item) => item.id === updated.id || item.id === task.id || (updated.publicId && item.publicId === updated.publicId));
  if (index >= 0) state.tasks[index] = { ...state.tasks[index], ...updated };
  else mergeTasks([updated]);
  state.activeTaskId = updated.id;
  saveState();
  return updated;
}

async function sendTaskActionToBackend(task, action, payload = {}) {
  const taskId = encodeURIComponent(task.id || task.publicId || "");
  const endpoint = API_ENDPOINTS.taskAction.replace("{taskId}", taskId).replace("{action}", encodeURIComponent(action));
  const data = await apiRequest(endpoint, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (data.account) applyServerAccount(data.account);
  if (data.transactions) applyServerTransactions(data.transactions);
  return applyBackendTask(task, data.task);
}

function canFallbackTaskAction(error) {
  return !error?.status || error.status === 401;
}

function saveLocalTaskFallback(task, { renderAfter = true } = {}) {
  touchTask(task);
  saveState();
  if (renderAfter) render();
  return task;
}

async function saveAndSyncTask(task, { renderAfter = true } = {}) {
  touchTask(task);
  saveState();
  const published = await publishTaskToBackend(task);
  await syncTasksFromBackend({ renderAfter });
  return published;
}

async function publishLocalTasksToBackend() {
  for (const task of state.tasks.slice(0, 50)) {
    await publishTaskToBackend(task);
  }
}

function startTaskSync() {
  publishLocalTasksToBackend().then(() => syncTasksFromBackend({ renderAfter: true }));
  resetTaskPolling("EventSource" in window ? 15000 : 3000);
  startBackendEvents();
}

function verificationReturnUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set("esia", "return");
  return url.toString();
}

function authReturnUrl(provider) {
  const url = new URL(window.location.href);
  url.searchParams.set("auth", provider);
  url.searchParams.set("return", "1");
  return url.toString();
}

async function startProviderLogin(provider) {
  const providerName = "Госуслуги";
  const endpoint = API_ENDPOINTS.esiaStart;
  const note = $("#social-login-note");
  if (note) note.textContent = `Открываю ${providerName} через backend...`;
  try {
    const data = await apiRequest(endpoint, {
      method: "POST",
      body: JSON.stringify({ returnUrl: authReturnUrl(provider), mode: accountFormMode, accountId: state.account.id }),
    });
    const redirectUrl = data.redirectUrl || data.url;
    if (!redirectUrl) throw new Error(`Backend не вернул ссылку для входа через ${providerName}.`);
    window.location.href = redirectUrl;
  } catch (error) {
    if (note) note.textContent = `${providerName}: ${error.message}`;
    toast(`${providerName}: подключите backend авторизации`);
  }
}

async function completeProviderLogin() {
  const params = new URLSearchParams(window.location.search);
  const provider = params.get("auth");
  if (provider !== "esia" || params.get("return") !== "1") return false;

  const providerName = "Госуслуги";
  const endpoint = API_ENDPOINTS.esiaStatus;
  try {
    const data = await apiRequest(endpoint);
    if (!data.account) throw new Error(`Backend не вернул профиль ${providerName}.`);
    state.account = normalizeAccount({
      account: {
        ...state.account,
        ...data.account,
        registered: true,
        signedIn: true,
        verified: provider === "esia" ? true : Boolean(data.account.verified || state.account.verified),
        authProvider: provider,
        externalId: data.account.externalId || data.account.id || state.account.externalId,
        communityAgreementVersion: state.account.communityAgreementVersion || COMMUNITY_AGREEMENT_VERSION,
        communityAgreementAcceptedAt: state.account.communityAgreementAcceptedAt || new Date().toISOString(),
      },
    });
    addActivity("Аккаунт", `Вход выполнен через ${providerName}`);
    render();
    setScreen("profile");
    toast(`Вход через ${providerName} выполнен`);
    window.history.replaceState({}, "", window.location.pathname);
    return true;
  } catch (error) {
    toast(`${providerName}: ${error.message}`);
    setScreen("register");
    return false;
  }
}

async function refreshEsiaStatus(force = false) {
  const params = new URLSearchParams(window.location.search);
  if (!force && params.get("esia") !== "return") return false;

  try {
    const data = await apiRequest(API_ENDPOINTS.esiaStatus);
    if (!data.verified) throw new Error(data.message || "Госуслуги не вернули подтверждённый статус.");
    state.account.verified = true;
    addActivity("Госуслуги", "Личность подтверждена через ЕСИА");
    render();
    toast("Личность подтверждена через Госуслуги");
    window.history.replaceState({}, "", window.location.pathname);
    return true;
  } catch (error) {
    toast(error.message);
    return false;
  }
}

function formatCardNumber(value) {
  return digitsOnly(value).slice(0, 19).replace(/(.{4})/g, "$1 ").trim();
}

function taskDeadlineText(task) {
  if (task.deadlineAt) return new Date(task.deadlineAt).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  if (task.deadlineType === "weekend") return "в выходные";
  if (task.deadlineType === "today") return "сегодня";
  return "срочно";
}

function findCategoryHint() {
  const text = `${$("#title")?.value || ""} ${$("#description")?.value || ""}`.toLowerCase();
  return CATEGORY_HINTS.find((hint) => hint.words.some((word) => text.includes(word)));
}

function priceHintFor(category) {
  return CATEGORY_HINTS.find((hint) => hint.category === category)?.price || 1000;
}

function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
  } catch {
    return null;
  }
}

function collectDraft() {
  return {
    complexity: $("#complexity").value,
    title: $("#title").value,
    description: $("#description").value,
    category: $("#category").value,
    address: $("#address").value,
    price: $("#price").value,
    deadline: $("#deadline").value,
    exactTime: $("#exact-time").value,
    online: $("#online").checked,
    hidePhone: $("#hide-phone").checked,
    attachments: [...$("#reference-files").files].map((file) => ({ name: file.name, size: file.size, type: file.type })),
    location: draftLocation,
  };
}

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(collectDraft()));
    $("#draft-status").textContent = "Черновик сохранён автоматически.";
  } catch {
    $("#draft-status").textContent = "Черновик не удалось сохранить на этом устройстве.";
  }
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
  $("#draft-status").textContent = "Черновик очищен после публикации.";
}

function applyDraft() {
  const draft = loadDraft();
  if (!draft) return;
  $("#complexity").value = draft.complexity || "30";
  $("#title").value = draft.title || "";
  $("#description").value = draft.description || "";
  $("#category").value = draft.category || "Фотозадание";
  $("#address").value = draft.address || "";
  $("#price").value = draft.price || "0";
  $("#deadline").value = draft.deadline || "urgent";
  $("#exact-time").value = draft.exactTime || "";
  $("#online").checked = Boolean(draft.online);
  $("#hide-phone").checked = draft.hidePhone !== false;
  draftLocation = draft.location || null;
  $("#picked-location").textContent = formatLocation(draftLocation);
  $("#draft-status").textContent = "Черновик восстановлен с этого устройства.";
}

function renderCreateHelpers() {
  const hint = findCategoryHint();
  const suggestion = $("#category-suggestion");
  if (hint && $("#category").value !== hint.category) {
    suggestion.hidden = false;
    suggestion.innerHTML = `Похоже на категорию «${hint.category}». <button type="button" id="apply-category-hint">Применить</button>`;
  } else {
    suggestion.hidden = true;
    suggestion.innerHTML = "";
  }

  const category = $("#category").value;
  const recommended = hint?.price || priceHintFor(category);
  const price = rubles($("#price").value);
  $("#price-hint").textContent = price
    ? `Обычно похожие задания в категории «${category}» стоят около ${money(recommended)}. Вы указали ${money(price)}.`
    : `Обычно похожие задания в категории «${category}» стоят около ${money(recommended)}.`;
  $("#exact-time-label").classList.toggle("hidden", $("#deadline").value !== "exact");
  renderAttachments();
}

function renderAttachments() {
  const files = [...$("#reference-files").files];
  $("#attachment-list").textContent = files.length
    ? files.map((file) => file.name).join(", ")
    : "Файлы не прикреплены";
}

function updateAddressSuggestions() {
  const query = $("#address").value.trim().toLowerCase();
  const city = state.account.city.trim();
  const cityPrefix = city ? `${city}, ` : "";
  const typedHouse = query.match(/\b\d+[а-яa-z]?$/i)?.[0] || "";
  const customSuggestions = [];
  if (city && query && !query.includes(city.toLowerCase())) customSuggestions.push(`${cityPrefix}${$("#address").value.trim()}`);
  if (city && typedHouse) customSuggestions.push(`${cityPrefix}Березовая Аллея, ${typedHouse}`, `${cityPrefix}Центральная улица, ${typedHouse}`);
  const options = [...customSuggestions, ...ADDRESS_PRESETS]
    .filter((address) => !query || address.toLowerCase().includes(query) || `${cityPrefix}${address}`.toLowerCase().includes(query))
    .slice(0, 5);
  $("#address-suggestions").innerHTML = options.map((address) => `<option value="${escapeHtml(address.includes(",") && address.toLowerCase().startsWith(city.toLowerCase()) ? address : cityPrefix + address)}"></option>`).join("");
}

function isRiskyChat(text) {
  return RISKY_CHAT_PATTERN.test(text);
}

function activeTask() {
  return state.tasks.find((task) => task.id === state.activeTaskId);
}

function distanceLabel(task) {
  if (task.online) return "Онлайн";
  if (typeof task.distance !== "number") return "на карте";
  return `${task.distance.toFixed(1)} км`;
}

function distanceKm(from, to) {
  if (!from || !to) return null;
  const earthRadius = 6371;
  const lat1 = from.lat * Math.PI / 180;
  const lat2 = to.lat * Math.PI / 180;
  const deltaLat = (to.lat - from.lat) * Math.PI / 180;
  const deltaLng = (to.lng - from.lng) * Math.PI / 180;
  const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function updateTaskDistances() {
  if (!userLocation) return;
  state.tasks.forEach((task) => {
    if (!task.online && task.location) task.distance = Number(distanceKm(userLocation, task.location).toFixed(1));
  });
}

function updateUserLocation(position) {
  geoPermissionStatus = "granted";
  geoPermissionMessageShown = false;
  userLocation = {
    lat: position.coords.latitude,
    lng: position.coords.longitude,
    accuracy: Math.round(position.coords.accuracy || 0),
    updatedAt: new Date().toISOString(),
  };
  updateTaskDistances();
  renderLists();
  renderMap();
  saveState();
}

function geolocationBlockedMessage(error) {
  if (!globalThis.isSecureContext) {
    return "Геолокация заблокирована: откройте сайт через HTTPS или localhost. По Wi‑Fi HTTP браузер может не показывать запрос.";
  }
  if (error?.code === 1) return "Геолокация отключена в браузере. Разрешите доступ к местоположению в настройках сайта.";
  if (error?.code === 3) return "Не удалось быстро определить геопозицию. Проверьте GPS/Wi‑Fi и обновите страницу.";
  return "Не удалось получить геопозицию. Проверьте разрешение браузера.";
}

function handleGeolocationError(error) {
  geoPermissionStatus = "blocked";
  const message = geolocationBlockedMessage(error);
  if ($("#map-status")) $("#map-status").textContent = message;
  renderMap();
  if (!geoPermissionMessageShown) {
    geoPermissionMessageShown = true;
    toast(message);
  }
}

function requestGeolocationPermissionOnStart() {
  if (!navigator.geolocation) {
    geoPermissionStatus = "unsupported";
    addActivity("Геолокация", "Браузер не поддерживает геоданные");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    updateUserLocation,
    handleGeolocationError,
    {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 60000,
    },
  );
}

function startGeolocationWatch() {
  if (!navigator.geolocation || geoWatchId !== null) {
    renderMap();
    return;
  }

  geoWatchId = navigator.geolocation.watchPosition(
    updateUserLocation,
    handleGeolocationError,
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    },
  );
}

function mapUrlFor(location) {
  if (!location) return "https://www.openstreetmap.org";
  if (!userLocation) return `https://www.openstreetmap.org/?mlat=${location.lat}&mlon=${location.lng}#map=17/${location.lat}/${location.lng}`;
  return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${userLocation.lat}%2C${userLocation.lng}%3B${location.lat}%2C${location.lng}`;
}

function formatLocation(location) {
  if (!location) return "Точка не выбрана";
  return `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;
}

function setDraftLocation(location, label = "Точка на карте") {
  draftLocation = location ? { lat: Number(location.lat), lng: Number(location.lng), label } : null;
  $("#picked-location").textContent = formatLocation(draftLocation);
  if (draftLocation && label !== "Точка выбрана на карте") $("#address").value = label;
  saveDraft();
  renderMap();
}

function setPickingLocation(enabled) {
  pickingLocation = enabled;
  $("#pick-location").classList.toggle("active", enabled);
  $("#pick-location").textContent = enabled ? "Нажмите на карту" : "📍 Выбрать точку на карте";
  if (enabled) {
    setScreen("home");
    toast("Нажмите на карте место выполнения задания");
  }
}

async function geocodeAddress(address) {
  const query = address.trim();
  if (!query || query.toLowerCase() === "онлайн") return null;

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("q", query);

    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) return null;
    const [place] = await response.json();
    if (!place) return null;
    return { lat: Number(place.lat), lng: Number(place.lon), label: place.display_name || query };
  } catch {
    return null;
  }
}

function timeAgo(iso) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  return `${Math.floor(minutes / 60)} ч назад`;
}

function addActivity(title, text, notify = true) {
  state.activity.unshift(activity(title, text));
  state.activity = state.activity.slice(0, 8);
  if (notify) addNotification(title, text, title, "activity");
  saveState();
}

function openTasks() {
  const query = state.search.trim().toLowerCase();
  let list = state.tasks.filter((task) => task.status === "open" && task.moderationStatus === "approved");
  const city = accountCity();

  if (state.role === "worker" && city) {
    list = list.filter((task) => taskCity(task) === city);
  }

  if (query) {
    list = list.filter((task) => [task.title, task.description, task.category, task.address].join(" ").toLowerCase().includes(query));
  }
  if (state.categoryFilter && state.categoryFilter !== "all") list = list.filter((task) => task.category === state.categoryFilter);
  if (rubles(state.minPrice)) list = list.filter((task) => taskAmount(task) >= rubles(state.minPrice));
  if (Number(state.maxDistance) > 0) list = list.filter((task) => task.online || (typeof task.distance === "number" && task.distance <= Number(state.maxDistance)));
  if (state.filter === "near") list = list.filter((task) => !task.online && typeof task.distance === "number" && task.distance <= 1);
  if (state.filter === "online") list = list.filter((task) => task.online);
  if (state.filter === "price") list = [...list].sort((a, b) => b.price - a.price);

  return list;
}

function ownTasks() {
  return state.role === "customer"
    ? state.tasks.filter(isOwnCustomerTask)
    : state.tasks.filter(isOwnWorkerTask);
}

function badgeClass(task) {
  if (task.status === "done") return "done";
  if (task.status === "review" || task.status === "revision") return "warn";
  if (task.status === "rejected") return "danger";
  if (task.hot) return "hot";
  return "";
}

function taskCard(task) {
  const canAccept = state.role === "worker" && task.status === "open" && !isOwnCustomerTask(task) && !isBlockedAccount();
  const canOpen = canOpenTask(task);
  const mod = task.moderationStatus || "approved";
  const eta = task.online ? "из дома" : typeof task.distance === "number" ? `~${Math.max(4, Math.round(task.distance * 12))} мин пешком` : "точка на карте";
  const attachments = task.attachments?.length || 0;
  const ownerName = state.role === "worker" ? task.customer : task.worker || "Исполнитель не выбран";
  const ownerRole = state.role === "worker" ? "Заказчик" : "Исполнитель";
  const ownerRating = ratingValue(state.role === "worker" ? "customer" : "worker");
  const address = task.online ? "Онлайн" : addressShortLabel(task.address);
  const statusText = task.hot && task.status === "open" ? "🔥 Срочно" : labels[task.status] || task.status;
  const safetyBadges = [
    mod === "rejected" ? "Отклонено" : "Опубликовано",
    task.hidePhone ? "Телефон скрыт" : "Телефон доступен",
    task.workerDeposit ? `Залог ${money(task.workerDeposit)}` : "Без залога",
  ];

  return `
    <article class="task-card">
      <header class="task-card-top">
        <div class="task-heading">
          <div class="task-badges">
            <span class="badge ${badgeClass(task)}">${escapeHtml(statusText)}</span>
            ${task.dispute || task.disputeStatus === "open" ? `<span class="badge danger">Спор</span>` : ""}
          </div>
          <h2>${escapeHtml(task.title)}</h2>
          <small class="task-id">ID: ${escapeHtml(task.publicId || "—")}</small>
        </div>
        <div class="price-box">
          <span>Оплата</span>
          <strong class="price">${money(taskAmount(task))}</strong>
        </div>
      </header>
      <p class="task-description">${escapeHtml(task.description)}</p>
      <div class="task-market-row">
        <span><b>${escapeHtml(task.category)}</b><small>Категория</small></span>
        <span><b>${distanceLabel(task)}</b><small>${escapeHtml(address)}</small></span>
        <span><b>${taskDeadlineText(task)}</b><small>${escapeHtml(eta)}</small></span>
      </div>
      <div class="task-customer">
        <span class="avatar-mini">${escapeHtml(String(ownerName || "?").trim().charAt(0).toUpperCase() || "?")}</span>
        <div>
          <strong>${escapeHtml(ownerName)}</strong>
          <small>${ownerRole} · ★ ${ownerRating}${task.city ? ` · ${escapeHtml(task.city)}` : ""}</small>
        </div>
      </div>
      <div class="meta task-safety">
        ${safetyBadges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("")}
        ${attachments ? `<span>${iconSvg.attachment} ${attachments}</span>` : ""}
      </div>
      <div class="actions two">
        ${canAccept ? `<button class="primary" data-action="accept" data-id="${task.id}">Принять</button>` : ""}
        ${canOpen ? `<button class="secondary" data-action="open" data-id="${task.id}">Открыть</button>` : ""}
      </div>
    </article>`;
}

function renderLists() {
  const home = state.role === "worker" ? openTasks().slice(0, 2) : ownTasks().slice(0, 2);
  const feed = openTasks();
  $("#home-tasks").innerHTML = home.length ? home.map(taskCard).join("") : emptyHtml("Пока пусто", "Создайте или примите первое задание.");
  $("#feed-tasks").innerHTML = feed.length ? feed.map(taskCard).join("") : emptyHtml("Нет заданий", "Попробуйте другой фильтр или поиск.");
  $("#feed-summary").textContent = `${feed.length} доступно · лучший заказ ${money(Math.max(0, ...feed.map(taskAmount)))}`;
  renderMyTasks();
  if ($("#category-filter")) $("#category-filter").value = state.categoryFilter || "all";
  if ($("#min-price-filter")) $("#min-price-filter").value = state.minPrice || "";
  if ($("#distance-filter")) $("#distance-filter").value = state.maxDistance || "";
}

function draftCard() {
  const draft = loadDraft();
  if (!draft || ![draft.title, draft.description, draft.address].some((value) => String(value || "").trim())) return "";
  const title = draft.title || "Черновик задания";
  const price = money(rubles(draft.price));
  return `
    <article class="task-card draft-card">
      <header class="task-card-top">
        <div class="task-heading">
          <span class="badge warn">Черновик</span>
          <h2>${escapeHtml(title)}</h2>
          <small class="task-id">Сохранён на этом устройстве</small>
        </div>
        <div class="price-box"><span>Бюджет</span><strong class="price">${price}</strong></div>
      </header>
      <p class="task-description">${escapeHtml(draft.description || "Описание ещё не заполнено.")}</p>
      <div class="meta task-safety">
        <span>${escapeHtml(draft.category || "Категория не выбрана")}</span>
        <span>${escapeHtml(draft.online ? "Онлайн" : draft.address || "Адрес не указан")}</span>
        <span>${escapeHtml(draft.deadline === "exact" ? "Точное время" : taskDeadlineText({ deadlineType: draft.deadline }))}</span>
      </div>
      <div class="actions two">
        <button class="primary" data-action="open-draft">Продолжить</button>
        <button class="secondary" data-action="clear-draft">Удалить</button>
      </div>
    </article>`;
}

function renderMyTasks() {
  const container = $("#my-tasks");
  if (!container) return;
  const tasks = ownTasks();
  const groups = {
    active: tasks.filter((task) => ["open", "accepted", "progress", "revision"].includes(task.status) && task.disputeStatus !== "open"),
    review: tasks.filter((task) => ["review", "rejected"].includes(task.status)),
    completed: tasks.filter((task) => task.status === "done"),
    disputes: tasks.filter((task) => task.dispute || task.disputeStatus === "open"),
    drafts: [],
  };
  const selected = groups[state.myFilter] ? state.myFilter : "active";
  state.myFilter = selected;
  $$("[data-my-filter]").forEach((button) => {
    button.classList.toggle("active", button.dataset.myFilter === selected);
    const count = button.dataset.myFilter === "drafts" ? (draftCard() ? 1 : 0) : groups[button.dataset.myFilter]?.length || 0;
    button.textContent = `${button.textContent.replace(/\s+\d+$/, "")} ${count}`;
  });
  $("#my-tasks-summary").textContent = `${tasks.length} всего · активных ${groups.active.length} · проверка ${groups.review.length} · споры ${groups.disputes.length}`;
  if (selected === "drafts") {
    const draft = draftCard();
    container.innerHTML = draft || emptyHtml("Черновиков нет", "Начните создавать задание — черновик сохранится автоматически.");
    return;
  }
  container.innerHTML = groups[selected].length ? groups[selected].map(taskCard).join("") : emptyHtml("Здесь пока пусто", "Когда задания появятся в этом статусе, они будут показаны здесь.");
}

function renderAdmin() {
  if (!$("#admin-panel")) return;
  const moderatorMode = isModerator();
  $("#admin-panel").classList.toggle("hidden", !moderatorMode);
  if (!moderatorMode) return;

  const users = [...state.users].sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt));
  const disputes = disputeTasks();
  const moderation = moderatorTasks();
  $("#admin-stats").innerHTML = [
    ["Пользователи", users.length],
    ["Задания", state.tasks.length],
    ["На модерации", moderation.filter((task) => task.moderationStatus === "pending").length],
    ["Споры", disputes.length],
  ].map(([label, value]) => `<article><span>${label}</span><b>${value}</b></article>`).join("");

  if ($("#admin-moderation")) {
    $("#admin-moderation").innerHTML = moderation.length
      ? moderation.map((task) => `<article class="admin-row ${task.moderationStatus === "rejected" ? "danger-row" : ""}"><div><strong>${escapeHtml(task.publicId || "—")} · ${escapeHtml(task.title)}</strong><span>${escapeHtml(task.category || "Категория не указана")} · ${money(totalEscrow(task))} · ${escapeHtml(task.moderationStatus || "pending")}</span><small>${escapeHtml(task.moderationNote || "Ждёт проверки модератором")} · ${timeAgo(task.updatedAt || task.createdAt)}</small></div><div class="mini-actions"><button class="secondary compact-button" data-action="admin-open-task" data-id="${escapeAttribute(task.id)}">Открыть</button><button class="primary compact-button" data-action="moderate-task" data-id="${escapeAttribute(task.id)}" data-status="approved">Одобрить</button><button class="secondary compact-button" data-action="moderate-task" data-id="${escapeAttribute(task.id)}" data-status="rejected">Отклонить</button></div></article>`).join("")
      : emptyHtml("Очередь пуста", "Новые задания пользователей появятся здесь до публикации в ленте.");
  }

  $("#admin-users").innerHTML = users.length
    ? users.map((user) => `<article class="admin-row ${user.blocked ? "danger-row" : ""}"><div><strong>${escapeHtml(user.name)}</strong><span>@${escapeHtml(user.username || "без юзернейма")} · ${escapeHtml(user.phone || "телефон не указан")} · ${escapeHtml(user.city || "город не указан")}</span><small>${user.verified ? "ЕСИА" : user.phoneVerified ? "Телефон" : "Не подтверждён"} · ${user.admin ? "администратор" : user.moderator || user.supportOperator ? "модератор" : "пользователь"} · ${timeAgo(user.registeredAt)}</small>${user.warning ? `<em>${escapeHtml(user.warning)}</em>` : ""}</div><button class="secondary compact-button" data-action="toggle-user-block" data-id="${escapeAttribute(user.id)}">${user.blocked ? "Разблокировать" : "Блок"}</button></article>`).join("")
    : emptyHtml("Пользователей нет", "После регистрации аккаунты появятся здесь.");

  $("#admin-disputes").innerHTML = disputes.length
    ? disputes.map((task) => `<article class="admin-row danger-row"><div><strong>${escapeHtml(task.publicId || "—")} · ${escapeHtml(task.title)}</strong><span>Спор: ${escapeHtml(task.disputeStatus || "open")} · ${money(totalEscrow(task))} заблокированы</span><small>${escapeHtml(task.disputeResolution || "Решение ещё не принято")}</small></div><div class="mini-actions"><button class="secondary compact-button" data-action="resolve-dispute" data-id="${escapeAttribute(task.id)}" data-result="customer">Заказчику</button><button class="secondary compact-button" data-action="resolve-dispute" data-id="${escapeAttribute(task.id)}" data-result="worker">Исполнителю</button></div></article>`).join("")
    : emptyHtml("Открытых споров нет", "Жалобы по заданиям появятся в этом списке.");

  $("#admin-audit").innerHTML = state.auditLog.length
    ? state.auditLog.slice(0, 12).map((entry) => `<article class="activity-item"><strong>${escapeHtml(entry.action)}</strong><span>${escapeHtml(entry.actor)} · ${escapeHtml(entry.details)} · ${timeAgo(entry.time)}</span></article>`).join("")
    : emptyHtml("Журнал пуст", "Действия модераторов появятся здесь.");

  $("#admin-errors").innerHTML = state.errorLog.length
    ? state.errorLog.slice(0, 8).map((entry) => `<article class="activity-item"><strong>${escapeHtml(entry.action)}</strong><span>${escapeHtml(entry.details)} · ${timeAgo(entry.time)}</span></article>`).join("")
    : emptyHtml("Ошибок нет", "Клиентский журнал ошибок пока пуст.");
}

function renderFinanceAndTrust() {
  if ($("#transaction-list")) {
    $("#transaction-list").innerHTML = state.transactions.length
      ? state.transactions.slice(0, 8).map((item) => `<article class="transaction-item"><strong>${escapeHtml(item.title)}</strong><span>${money(item.amount)} · ${escapeHtml(item.status)}${item.taskPublicId ? ` · ${escapeHtml(item.taskPublicId)}` : ""}</span><small>${timeAgo(item.createdAt)}</small></article>`).join("")
      : emptyHtml("Операций пока нет", "Пополнения, эскроу, выплаты и выводы появятся здесь.");
  }
  if ($("#trust-list")) {
    $("#trust-list").innerHTML = [
      state.account.verified ? "Личность подтверждена через ЕСИА" : "Личность можно подтвердить через Госуслуги",
      state.account.phoneVerified ? "Телефон подтверждён SMS/push-кодом" : "Телефон ещё не подтверждён",
      ratingCount("worker") || ratingCount("customer") ? `Есть отзывы: ${ratingCount("worker") + ratingCount("customer")}` : "Отзывы появятся после первых заданий",
      state.pushEnabled ? "Push-уведомления включены" : "Push-уведомления можно включить в профиле",
    ].map((text) => `<li>${escapeHtml(text)}</li>`).join("");
  }
}

function initMap() {
  if (taskMap || !$("#task-map")) return;
  if (!globalThis.L) {
    $("#map-status").textContent = "Карта недоступна: нет подключения к OpenStreetMap.";
    return;
  }

  taskMap = L.map("task-map", { zoomControl: true }).setView(DEFAULT_MAP_CENTER, 12);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap &copy; CARTO",
  }).addTo(taskMap);
  taskLayer = L.layerGroup().addTo(taskMap);

  taskMap.on("click", (event) => {
    if (!pickingLocation || state.role !== "customer") return;
    setDraftLocation({ lat: event.latlng.lat, lng: event.latlng.lng }, "Точка выбрана на карте");
    setPickingLocation(false);
    setScreen("create");
    toast("Точка для задания выбрана");
  });

  startGeolocationWatch();

  renderMap();
}

function markerIcon(className, html) {
  const labeled = className.includes("label-marker");
  return L.divIcon({ className: "", html: `<span class="${className}">${html}</span>`, iconSize: labeled ? [156, 44] : [34, 34], iconAnchor: labeled ? [78, 22] : [17, 17], popupAnchor: [0, -22] });
}

function addressShortLabel(address) {
  const parts = String(address || "").split(",").map((part) => part.trim()).filter(Boolean);
  const house = parts.find((part) => /^\d+[а-яa-z]?([/-]\d+)?$/i.test(part)) || parts.at(-1);
  const street = parts.find((part) => /(ул|улиц|просп|пр-т|переул|пер\.|алле|шоссе|бульвар|наб\.|площад)/i.test(part)) || parts.at(-2);
  if (street && house && street !== house) return `${street}, ${house}`;
  if (parts.length >= 2) return `${parts.at(-2)}, ${parts.at(-1)}`;
  return parts[0] || "Дом";
}

function addressDetailLabel(address) {
  const parts = String(address || "").split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 3) return parts.slice(-3).join(", ");
  return parts.join(", ") || "Адрес не указан";
}

function renderMap() {
  if (!taskMap || !taskLayer || !globalThis.L) return;
  const tasks = state.role === "worker" ? openTasks() : ownTasks();
  const mappedTasks = tasks.filter((task) => !task.online && task.location);
  const bounds = [];

  taskLayer.clearLayers();

  if (userLocation) {
    userMarker = L.marker([userLocation.lat, userLocation.lng], { icon: markerIcon("user-marker", "") })
      .bindPopup(`<strong>Вы здесь</strong><span>Точность: ${userLocation.accuracy || "—"} м</span>`)
      .addTo(taskLayer);
    if (userLocation.accuracy) {
      userAccuracyCircle = L.circle([userLocation.lat, userLocation.lng], {
        radius: userLocation.accuracy,
        color: "#7c3aed",
        weight: 1,
        fillColor: "#7c3aed",
        fillOpacity: 0.08,
      }).addTo(taskLayer);
    }
    bounds.push([userLocation.lat, userLocation.lng]);
  }

  if (draftLocation) {
    const draftLabel = addressShortLabel($("#address").value || draftLocation.label);
    draftMarker = L.marker([draftLocation.lat, draftLocation.lng], { icon: markerIcon("task-marker draft label-marker", `<b>${escapeHtml(draftLabel)}</b>`) })
      .bindPopup(`<strong>Новая точка задания</strong><span>${escapeHtml($("#address").value || draftLocation.label || "Место выполнения")}</span>`)
      .addTo(taskLayer);
    bounds.push([draftLocation.lat, draftLocation.lng]);
  }

  mappedTasks.forEach((task) => {
    const markerClass = task.hot && task.status === "open" ? "task-marker hot" : task.status !== "open" ? "task-marker done" : "task-marker";
    const popup = `
      <strong>${escapeHtml(task.title)}</strong>
      <span>ID ${escapeHtml(task.publicId || "—")}</span>
      <span>${escapeHtml(addressDetailLabel(task.address))}</span>
      <span>${money(taskAmount(task))} · ${distanceLabel(task)} · ${labels[task.status]}</span>
      <a href="${mapUrlFor(task.location)}" target="_blank" rel="noopener">${userLocation ? "Открыть маршрут" : "Открыть точку"}</a>
    `;

    L.marker([task.location.lat, task.location.lng], { icon: markerIcon(`${markerClass} label-marker`, `<b>${escapeHtml(addressShortLabel(task.address))}</b>`) })
      .bindPopup(popup)
      .addTo(taskLayer);
    bounds.push([task.location.lat, task.location.lng]);
  });

  if (!mapAutoFitDone && bounds.length > 1) {
    taskMap.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });
    mapAutoFitDone = true;
  } else if (!mapAutoFitDone && bounds.length === 1) {
    taskMap.setView(bounds[0], userLocation && mappedTasks.length === 0 ? 14 : 15);
    mapAutoFitDone = true;
  }

  if (geoPermissionStatus === "blocked" && !userLocation) {
    $("#map-status").textContent = geolocationBlockedMessage();
  } else {
    $("#map-status").textContent = mappedTasks.length
      ? `${mappedTasks.length} заданий${userLocation ? ` · точность ${userLocation.accuracy || "—"} м` : ""}`
      : userLocation ? `Заданий пока нет · точность ${userLocation.accuracy || "—"} м` : "Заданий пока нет · разрешите точную геолокацию";
  }
}

function renderRole() {
  const customer = state.role === "customer";
  const taskCount = ownTasks().length;
  const signedIn = isSignedIn();
  const blocked = isBlockedAccount();
  $$(".role-tabs button").forEach((button) => button.classList.toggle("active", button.dataset.role === state.role));
  $("#role-caption").textContent = customer ? "Заказчик" : "Исполнитель";
  $("#map-subtitle").textContent = blocked ? "Аккаунт заблокирован: контакты и задания недоступны" : customer ? "Ваши активные поручения" : "Горячие задания рядом";
  $("#home-list-title").textContent = blocked ? "Доступ ограничен" : customer ? "Мои задания" : "Лента рядом";
  $("#rating").textContent = ratingValue(state.role);
  $("#balance").textContent = money(state.account.balance);
  $("#active-count").textContent = String(ownTasks().filter((task) => task.status !== "done").length);
  $("#profile-name").textContent = accountName();
  $("#profile-subtitle").textContent = `Единый аккаунт · сейчас ${customer ? "заказчик" : "исполнитель"} · ${taskCount} заданий`;
  $("#profile-rating").textContent = ratingValue(state.role);
  $("#avatar").textContent = accountInitials();
  $("#wallet").textContent = money(state.account.balance);
  $("#login-button").hidden = signedIn;
  $("#account-button").textContent = signedIn ? "Выйти" : "Регистрация";
  $("#profile-account-status").textContent = state.account.registered
    ? blocked
      ? `${accountName()} · аккаунт заблокирован модератором · контакты, задания и чаты недоступны`
      : `${accountName()} · ${state.account.city || "город не указан"} · ${state.account.phoneVerified ? "телефон подтверждён" : "телефон не подтверждён"} · ${signedIn ? "вход выполнен" : "вы вышли"}`
    : "Зарегистрируйтесь, чтобы создать профиль";
  $("#edit-account").textContent = state.account.registered ? "Редактировать аккаунт" : "Регистрация";
  $("#logout-account").hidden = !signedIn;
  if (!isEditingAccountForm()) {
    $("#register-name").value = state.account.name === "Пользователь" && !state.account.registered ? "" : state.account.name;
    $("#register-username").value = state.account.username || "";
    $("#register-phone").value = state.account.phone;
    $("#register-city").value = state.account.city;
  }
  $("#register-status").textContent = state.account.registered
    ? accountFormMode === "recover"
      ? "Для восстановления получите код на подтверждённый номер и задайте новый пароль."
      : accountFormMode === "login"
      ? "Для входа введите юзернейм, телефон и пароль зарегистрированного аккаунта."
      : `${signedIn ? "Аккаунт активен" : "Вы вышли из аккаунта"}. Общий баланс: ${money(state.account.balance)}. ${state.account.phoneVerified ? "Телефон подтверждён." : "Подтвердите телефон SMS/push-кодом."}`
    : accountFormMode === "recover"
      ? "Введите телефон аккаунта, получите SMS/push-код и задайте новый пароль через backend."
    : accountFormMode === "login"
      ? "Введите данные зарегистрированного аккаунта. Вход выполняется через backend."
      : "Введите телефон, получите SMS/push-код и подтвердите номер перед сохранением аккаунта.";
  setAccountFormMode(accountFormMode);
  if (!pendingPhoneVerificationId && !state.account.phoneVerified) $("#sms-demo-code").textContent = "";
  $("#verify-account").textContent = state.account.verified ? "Личность подтверждена" : "Подтвердить через Госуслуги";
  $("#verify-account").disabled = state.account.verified;
  $("#nav-create").style.display = customer ? "grid" : "none";
  $("#nav-feed").style.display = customer ? "none" : "grid";
  $("#nav-admin").classList.toggle("hidden", !isSupportOperator());
  if ($("#enable-push")) $("#enable-push").textContent = state.pushEnabled ? "Push включены" : "Включить push";

  $("#smart-title").textContent = customer ? "Создайте задание за минуту" : "Рядом есть быстрые задания";
  $("#smart-text").textContent = customer
    ? "Добавьте адрес, цену и описание — исполнитель увидит заказ в ленте."
    : "Отфильтруйте задания рядом, примите подходящее и отправьте фотоотчет.";
  $("#smart-action").textContent = customer ? "Создать" : "В ленту";

  if (!isSupportOperator()) {
    if (customer && state.screen === "feed") setScreen("create", false);
    if (!customer && state.screen === "create") setScreen("feed", false);
    if (state.screen === "admin") setScreen("profile", false);
  }
}

function renderActivity() {
  $("#activity-list").innerHTML = state.activity.length
    ? state.activity.map((item) => `<article class="activity-item"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.text)} · ${timeAgo(item.time)}</span></article>`).join("")
    : emptyHtml("Активность пуста", "События по заданиям появятся здесь.");
}

function renderNotifications() {
  const badge = $("#notification-badge");
  state.notifications = state.notificationItems.filter((item) => !item.read).length;
  badge.textContent = String(state.notifications);
  badge.hidden = state.notifications === 0;
  const list = $("#notification-list");
  if (!list) return;
  list.innerHTML = state.notificationItems.length
    ? state.notificationItems.map((item) => `<button class="notification-item ${item.read ? "" : "unread"}" type="button" data-action="open-notification" data-id="${item.id}"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.text)}</span><small>${escapeHtml(item.reason)} · ${timeAgo(item.time)}</small></button>`).join("")
    : emptyHtml("Уведомлений нет", "Здесь появятся сообщения из чатов, поддержки и заданий.");
}

function renderSupport() {
  const ticket = activeSupportTicket();
  const tickets = visibleSupportTickets();
  const supportMode = isSupportOperator();
  const supportTask = ticket?.taskPublicId ? taskByPublicId(ticket.taskPublicId) : null;
  $("#support-console").classList.toggle("hidden", !supportMode);
  $("#support-intro").textContent = supportMode
    ? "Вы вошли как поддержка. Можно открыть заявку, найти задание по ID и посмотреть переписку."
    : "Напишите вопрос: сначала ответит бот, а если советы не помогут — можно передать диалог живой поддержке.";
  $("#support-chat-title").textContent = supportMode && ticket ? `Заявка ${ticket.publicId}` : "Чат с поддержкой";
  $("#support-chat-subtitle").textContent = ticket ? `${ticket.reason}${ticket.taskPublicId ? ` · задание ${ticket.taskPublicId}` : ""}${supportTask ? ` · ${supportTask.title}` : ""}` : "Напишите первый вопрос — бот ответит сразу";
  $("#support-open-count").textContent = `${tickets.filter((item) => item.status === "operator").length} заявок`;
  $("#support-task-select").innerHTML = `<option value="">Без привязки к заданию</option>${state.tasks.map((task) => `<option value="${escapeHtml(task.publicId)}" ${ticket?.taskPublicId === task.publicId ? "selected" : ""}>${escapeHtml(task.publicId)} · ${escapeHtml(task.title)}</option>`).join("")}`;
  $("#support-suggestions").innerHTML = ["Проблема с оплатой", "Не могу открыть задание", "Вопрос по Госуслугам", "Хочу пожаловаться"].map((text) => `<button type="button" data-action="support-suggestion" data-text="${escapeHtml(text)}">${escapeHtml(text)}</button>`).join("");
  $("#support-messages").innerHTML = ticket ? ticket.messages.map((message) => `<div class="msg ${message.role === (supportMode ? "support" : "user") ? "me" : ""}">${escapeHtml(message.text)}<small>${escapeHtml(message.author)} · ${timeAgo(message.time)}</small></div>`).join("") : emptyHtml("Чат ещё не начат", "Напишите вопрос или выберите быстрый вариант выше.");
  $("#support-messages").scrollTop = $("#support-messages").scrollHeight;
  $("#support-ticket-list").innerHTML = tickets.length
    ? tickets.map((item) => `<button class="support-ticket ${item.id === ticket?.id ? "active" : ""}" type="button" data-action="open-support-ticket" data-id="${item.id}"><strong>${escapeHtml(item.publicId)}${item.taskPublicId ? ` · ${escapeHtml(item.taskPublicId)}` : ""}</strong><span>${escapeHtml(item.reason)}</span><small>${item.status === "operator" ? "Живая поддержка" : "Бот"} · ${timeAgo(item.updatedAt)}</small></button>`).join("")
    : emptyHtml("Заявок нет", "Пока никто не обращался в поддержку.");
}

function remainingTime(task) {
  if (!task.dueAt || task.status === "done") return "—";
  const diff = new Date(task.dueAt).getTime() - Date.now();
  if (diff <= 0) return "00:00";
  const totalMinutes = Math.floor(diff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const seconds = Math.floor((diff % 60000) / 1000);
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function renderTaskMessage(message) {
  const photoSrc = message.photoUrl || message.photo;
  const photoHtml = photoSrc
    ? `<img class="msg-photo" src="${escapeAttribute(photoSrc)}" alt="Фотоотчет по заданию" loading="lazy" />`
    : "";
  return `<div class="msg ${message.role === state.role ? "me" : ""}">${escapeHtml(message.text)}${photoHtml}<small>${escapeHtml(message.author)}</small></div>`;
}

async function uploadTaskPhoto(file, task) {
  const prepared = await apiRequest(API_ENDPOINTS.filePrepare, {
    method: "POST",
    body: JSON.stringify({ filename: file.name || "photo.jpg", contentType: file.type || "image/jpeg", size: file.size || 0, taskId: task.id || task.publicId || "" }),
  });
  const upload = prepared.upload;
  if (!prepared.file?.id || !upload?.url) throw new Error("Сервер не подготовил загрузку фото.");

  const uploadResponse = await fetch(upload.url, {
    method: upload.method || "PUT",
    headers: upload.headers || { "Content-Type": file.type || "image/jpeg" },
    body: file,
  });
  if (!uploadResponse.ok) throw new Error("S3 отклонил загрузку фото.");

  const completeEndpoint = API_ENDPOINTS.fileComplete.replace("{fileId}", encodeURIComponent(prepared.file.id));
  const completed = await apiRequest(completeEndpoint, { method: "POST", body: JSON.stringify({}) });
  return completed.file || prepared.file;
}

function renderWork() {
  const task = activeTask();
  const visible = Boolean(task && canOpenTask(task) && (task.status !== "open" || isSupportOperator()));
  $("#work-empty").classList.toggle("hidden", visible);
  $("#work-card").classList.toggle("hidden", !visible);
  if (!visible) return;
  const canWorkerAct = canWorkerManageTask(task) && !["review", "done"].includes(task.status);
  const canCustomerAct = canCustomerManageTask(task) && !task.dispute && ["review", "revision"].includes(task.status);
  const canChat = canChatInTask(task);
  const canEditChecklist = canWorkerManageTask(task) && !["review", "done"].includes(task.status);

  $("#work-status").textContent = labels[task.status];
  $("#work-status").className = `badge ${badgeClass(task)}`;
  $("#work-title").textContent = task.title;
  $("#work-description").textContent = task.description;
  $("#work-meta").innerHTML = `<span>ID ${escapeHtml(task.publicId || "—")}</span><span>Оплата ${money(taskAmount(task))}</span><span>${distanceLabel(task)}</span><span>${taskDeadlineText(task)}</span><span>${escapeHtml(task.address)}</span>${task.city ? `<span>${escapeHtml(task.city)}</span>` : ""}<span>${task.moderationStatus === "rejected" ? "Отклонено" : "Опубликовано"}</span>${task.dispute || task.disputeStatus === "open" ? `<span>Спор открыт</span>` : ""}${task.workerDeposit ? `<span>Залог исполнителя ${money(task.workerDeposit)}</span>` : ""}${task.hidePhone ? `<span>Телефон скрыт</span>` : ""}${task.attachments?.length ? `<span>Файлы: ${task.attachments.map((file) => escapeHtml(file.name)).join(", ")}</span>` : ""}`;
  $("#countdown").textContent = remainingTime(task);

  $$("#steps li").forEach((item, index) => item.classList.toggle("active", index <= (step[task.status] ?? 0)));
  $("#worker-actions").classList.toggle("hidden", !canWorkerAct);
  $("#customer-actions").classList.toggle("hidden", !canCustomerAct);
  const targetRole = state.role === "customer" ? "worker" : "customer";
  const canRate = canRateTask(task);
  $("#rating-card").classList.toggle("hidden", !canRate);
  $("#rating-title").textContent = state.role === "customer" ? "Оцените исполнителя" : "Оцените заказчика";
  $("#rating-text").textContent = `Текущий рейтинг: ${ratingValue(targetRole)} · выберите 1–5 звёзд.`;
  $$("#rating-stars button").forEach((button) => button.classList.remove("active"));
  $("#photo-preview").classList.toggle("done", task.hasPhoto);
  const latestPhoto = task.proofPhotos?.at(-1);
  $("#photo-preview").innerHTML = latestPhoto
    ? `${latestPhoto.url ? `<img class="msg-photo large" src="${escapeAttribute(latestPhoto.url)}" alt="Фото подтверждения" loading="lazy" />` : ""}<span>${escapeHtml(latestPhoto.label)}</span>`
    : task.hasPhoto ? "Фото с геотегом: 55.7558, 37.6173" : "Фотоотчет появится здесь";

  $("#check-location").checked = task.checklist.location;
  $("#check-photo").checked = task.checklist.photo;
  $("#check-comment").checked = task.checklist.comment;
  $("#check-location").disabled = !canEditChecklist;
  $("#check-photo").disabled = !canEditChecklist;
  $("#check-comment").disabled = !canEditChecklist;
  $("#message").disabled = !canChat;
  $("#message").placeholder = canChat ? "Сообщение..." : "Чат доступен только заказчику и исполнителю";
  $("#message-form button").disabled = !canChat;

  $("#messages").innerHTML = task.messages
    .map(renderTaskMessage)
    .join("");
  $("#messages").scrollTop = $("#messages").scrollHeight;
  $("#chat-warning").classList.toggle("hidden", !task.messages.some((message) => isRiskyChat(message.text)));
}

function render() {
  upsertCurrentUser();
  renderRole();
  renderLists();
  renderMap();
  renderActivity();
  renderNotifications();
  renderSupport();
  renderAdmin();
  renderFinanceAndTrust();
  renderWork();
  setTimeout(playPendingCustomerSounds, 0);
  $("#search").value = state.search;
  const formPrice = rubles($("#price").value);
  $("#escrow-text").textContent = `${money(formPrice)} будут заморожены в эскроу за работу`;
  renderCreateHelpers();
  updateAddressSuggestions();
  saveState();
}

function setScreen(name, shouldSave = true) {
  if (name === "admin" && !isModerator()) {
    toast("Админ-панель доступна только модератору");
    name = "profile";
  }
  state.screen = name;
  $$(".screen").forEach((screen) => screen.classList.toggle("active", screen.id === `screen-${name}`));
  $$(".bottom-nav button").forEach((button) => button.classList.toggle("active", button.dataset.screen === name));
  $("#screen-title").textContent = $(`#screen-${name}`)?.dataset.title || "Дела рядом";
  renderWork();
  if (name === "home" && taskMap) setTimeout(() => taskMap.invalidateSize(), 0);
  if (name === "support") renderSupport();
  if (name === "my") renderMyTasks();
  if (name === "admin") {
    renderAdmin();
    syncModerationTasksFromBackend({ renderAfter: true });
  }
  if (shouldSave) saveState();
}

function emptyHtml(title, text) {
  return `<div class="empty"><h2>${title}</h2><p>${text}</p></div>`;
}

function toast(text) {
  const element = document.createElement("div");
  element.className = "toast";
  element.textContent = text;
  $("#toast-stack").append(element);
  setTimeout(() => element.remove(), 3000);
}

function enqueueCustomerAcceptSound(task) {
  if (!task) return;
  state.soundEvents = state.soundEvents || [];
  state.soundEvents.unshift({
    id: globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random()),
    taskId: task.id,
    taskPublicId: task.publicId || "",
    customerAccountId: task.customerAccountId || "",
    customerKey: `${String(task.customer || "").trim().toLowerCase()}|${task.publicId || task.id}`,
    title: "Задание принято",
    text: `${task.publicId || task.title}: исполнитель ${task.worker || "выбран"} принял заказ`,
    played: false,
    createdAt: new Date().toISOString(),
  });
  state.soundEvents = state.soundEvents.slice(0, 20);
}

function isCustomerSoundEventForMe(event) {
  if (!event || event.played || state.role !== "customer" || !isSignedIn()) return false;
  if (event.customerAccountId && event.customerAccountId === state.account.id) return true;
  const task = state.tasks.find((item) => item.id === event.taskId || item.publicId === event.taskPublicId);
  return Boolean(task && isOwnCustomerTask(task));
}

function playAcceptMelody() {
  try {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) return false;
    const context = new AudioContext();
    const master = context.createGain();
    master.gain.setValueAtTime(0.001, context.currentTime);
    master.gain.exponentialRampToValueAtTime(0.22, context.currentTime + 0.03);
    master.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 1.35);
    master.connect(context.destination);
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
      const start = context.currentTime + index * 0.18;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.5, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.24);
      oscillator.connect(gain).connect(master);
      oscillator.start(start);
      oscillator.stop(start + 0.28);
    });
    setTimeout(() => context.close?.(), 1600);
    return true;
  } catch {
    return false;
  }
}

function playPendingCustomerSounds() {
  const event = (state.soundEvents || []).find(isCustomerSoundEventForMe);
  if (!event) return;
  event.played = true;
  const task = state.tasks.find((item) => item.id === event.taskId || item.publicId === event.taskPublicId);
  if (task) task.customerAcceptedSoundPlayed = true;
  playAcceptMelody();
  toast(event.text || "Исполнитель принял ваше задание");
  saveState();
}

function addRating(fromRole, stars) {
  const task = activeTask();
  if (task && !task.ratings) task.ratings = {};
  if (!canRateTask(task, fromRole)) return false;
  const targetRole = fromRole === "customer" ? "worker" : "customer";
  state.ratings[targetRole].total += stars;
  state.ratings[targetRole].count += 1;
  task.ratings[fromRole] = stars;
  task.messages.push({
    author: accountShortName(),
    text: `Поставлена оценка ${stars}★`,
    role: fromRole,
  });
  addActivity("Оценка", `${stars}★ · новый рейтинг ${ratingValue(targetRole)}`);
  return true;
}

async function acceptTask(id) {
  if (!ensureCanInteract()) return;
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  if (state.role !== "worker") return toast("Принять задание может только исполнитель");
  if (isOwnCustomerTask(task)) return toast("Нельзя принять своё задание");
  if (state.account.balance < WORKER_DEPOSIT) return toast(`Для отклика нужен страховой залог ${money(WORKER_DEPOSIT)} на балансе`);
  if (task.status !== "open") return openTask(task.id);
  let backendTask = null;
  try {
    backendTask = await sendTaskActionToBackend(task, "accept");
  } catch (error) {
    logError("Серверное принятие задания", error.message);
    return toast(error.message || "Backend не подтвердил отклик");
  }
  if (backendTask) {
    enqueueCustomerAcceptSound(backendTask);
    addActivity("Задание принято", `${backendTask.title} · сервер подтвердил исполнителя`);
    setScreen("work");
    render();
    toast(`Задание принято, ${money(WORKER_DEPOSIT)} заморожены как залог`);
    return;
  }
}

function openTask(id) {
  const task = state.tasks.find((item) => item.id === id);
  if (!task) return;
  if (!canOpenTask(task)) return toast("Это задание доступно только заказчику и назначенному исполнителю");
  state.activeTaskId = task.id;
  if (task.status === "open") toast("Задание еще не взято исполнителем");
  else setScreen("work");
  render();
}

async function updateChecklist(key, checked) {
  const task = activeTask();
  if (!canWorkerManageTask(task)) return toast("Чек-лист может менять только назначенный исполнитель");
  task.checklist[key] = checked;
  await saveAndSyncTask(task, { renderAfter: true });
  renderWork();
}

function bindEvents() {
  $$(".bottom-nav button").forEach((button) => button.addEventListener("click", () => setScreen(button.dataset.screen)));
  $("#login-button").addEventListener("click", () => {
    setAccountFormMode("login");
    setScreen("register");
  });
  $("#account-button").addEventListener("click", () => {
    if (isSignedIn()) return logoutAccount();
    setAccountFormMode("register");
    setScreen("register");
  });
  $("#edit-account").addEventListener("click", () => {
    setAccountFormMode("register");
    setScreen("register");
  });
  $("#logout-account").addEventListener("click", () => {
    logoutAccount();
  });
  $("#forgot-password").addEventListener("click", () => {
    pendingPhoneVerificationId = "";
    pendingPhoneVerificationPhone = "";
    $("#register-password").value = "";
    $("#register-sms-code").value = "";
    $("#sms-demo-code").textContent = "";
    setAccountFormMode("recover");
  });
  $("#back-to-login").addEventListener("click", () => {
    pendingPhoneVerificationId = "";
    pendingPhoneVerificationPhone = "";
    $("#register-password").value = "";
    $("#register-sms-code").value = "";
    $("#sms-demo-code").textContent = "";
    setAccountFormMode("login");
  });
  $("#send-sms-code").addEventListener("click", async () => {
    const phone = $("#register-phone").value.trim();
    if (phone.length < 6) return toast("Введите номер телефона для SMS");
    if (accountFormMode === "recover" && state.account.registered && state.account.phone !== phone) return toast("Введите телефон зарегистрированного аккаунта");
    try {
      const data = await apiRequest(API_ENDPOINTS.phoneStart, {
        method: "POST",
        body: JSON.stringify({ phone }),
      });
      pendingPhoneVerificationId = data.verificationId || data.codeId || "";
      pendingPhoneVerificationPhone = phone;
      $("#sms-demo-code").textContent = data.devCode ? `Dev-код: ${data.devCode}` : "Код отправлен";
      toast(data.devCode ? "Dev-код создан backend-ом" : "Код отправлен");
    } catch (error) {
      pendingPhoneVerificationId = "";
      pendingPhoneVerificationPhone = "";
      $("#sms-demo-code").textContent = "";
      toast(error.message || "Не удалось запросить SMS/push-код");
    }
  });
  $("#login-esia").addEventListener("click", () => startProviderLogin("esia"));
  $("#agreement-accept").addEventListener("click", () => closeCommunityAgreement(true));
  $("#agreement-decline").addEventListener("click", () => closeCommunityAgreement(false));
  $("#open-privacy-policy").addEventListener("click", async () => {
    await showCommunityAgreement();
  });
  $("#withdraw-consent").addEventListener("click", async () => {
    if (!state.account.registered) return toast("Согласие можно отозвать после регистрации аккаунта");
    if (!isSignedIn()) return toast("Войдите в аккаунт, чтобы отозвать согласие");
    if (!confirm("Отозвать согласие на обработку данных? Часть функций аккаунта станет недоступна до повторного принятия правил.")) return;
    try {
      await updateServerAccount({ communityAgreementVersion: "", communityAgreementAcceptedAt: "" });
    } catch (error) {
      return toast(error.message || "Backend не сохранил отзыв согласия");
    }
    addActivity("Документы", "Согласие на обработку данных отозвано. Для продолжения работы примите правила заново.");
    render();
    toast("Согласие отозвано");
  });
  $("#support-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!ensureCanInteract()) return;
    const text = $("#support-message").value.trim();
    if (!text) return;
    try {
      let ticket = activeSupportTicket() || await createSupportTicketOnBackend();
      const selectedTask = $("#support-task-select").value || ticket.taskPublicId;
      if (selectedTask && selectedTask !== ticket.taskPublicId) ticket = await updateSupportTicketOnBackend(ticket, { taskPublicId: selectedTask, reason: `Вопрос по заданию ${selectedTask}` });
      const updated = await sendSupportMessageToBackend(ticket, text);
      addNotification(isSupportOperator() ? "Поддержка ответила" : "Сообщение в поддержку", `${updated.publicId}: ${text}`, updated.reason, "support", updated.id);
      $("#support-message").value = "";
      render();
    } catch (error) {
      toast(error.message || "Backend не сохранил сообщение поддержки");
    }
  });
  $("#support-task-select").addEventListener("change", async (event) => {
    if (!ensureCanInteract()) return;
    const ticket = activeSupportTicket();
    if (!ticket) return;
    try {
      await updateSupportTicketOnBackend(ticket, {
        taskPublicId: event.target.value,
        reason: event.target.value ? `Вопрос по заданию ${event.target.value}` : ticket.reason,
      });
      renderSupport();
    } catch (error) {
      toast(error.message || "Backend не обновил заявку");
    }
  });
  $("#support-escalate").addEventListener("click", async () => {
    if (!ensureCanInteract()) return;
    try {
      const ticket = activeSupportTicket() || await createSupportTicketOnBackend();
      const updated = await updateSupportTicketOnBackend(ticket, { status: "operator" });
      addNotification("Новая заявка поддержке", `${updated.publicId}${updated.taskPublicId ? ` · ${updated.taskPublicId}` : ""}`, updated.reason, "support", updated.id);
      render();
      toast("Заявка передана живой поддержке");
    } catch (error) {
      toast(error.message || "Backend не передал заявку поддержке");
    }
  });
  $("#support-find-task").addEventListener("click", () => {
    const value = $("#support-task-lookup").value.trim();
    if (!value) return toast("Введите ID задания или заявки");
    const ticket = visibleSupportTickets().find((item) => item.publicId.toLowerCase() === value.toLowerCase() || item.taskPublicId.toLowerCase() === value.toLowerCase());
    const task = taskByPublicId(value);
    if (ticket) {
      state.activeSupportTicketId = ticket.id;
      updateSupportTicketOnBackend(ticket, isSupportOperator() ? { unreadForSupport: 0 } : { unreadForUser: 0 }).catch((error) => logError("Прочтение заявки", error.message));
      renderSupport();
      return toast(`Открыта заявка ${ticket.publicId}`);
    }
    if (task) {
      state.activeTaskId = task.id;
      setScreen("work");
      return toast(`Открыто задание ${task.publicId}`);
    }
    toast("Не найдено. Проверьте ID вида DR-000001 или SUP-000001");
  });
  $("#register-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = $("#register-name").value.trim();
    const username = $("#register-username").value.trim();
    const phone = $("#register-phone").value.trim();
    const password = $("#register-password").value;
    const smsCode = $("#register-sms-code").value.trim();
    const city = $("#register-city").value.trim();
    const loginMode = accountFormMode === "login";
    const recoveryMode = accountFormMode === "recover";
    const editMode = !loginMode && !recoveryMode && state.account.registered;
    const phoneAlreadyVerified = !loginMode && !recoveryMode && state.account.phoneVerified && state.account.phone === phone;
    if (!recoveryMode && !username) return toast(loginMode ? "Введите юзернейм для входа" : "Введите юзернейм");
    if ((loginMode || recoveryMode || !editMode) && (!password || password.length < 4)) return toast(recoveryMode ? "Придумайте новый пароль минимум из 4 символов" : loginMode ? "Введите пароль от аккаунта" : "Придумайте пароль минимум из 4 символов");
    if (editMode && password && password.length < 4) return toast("Новый пароль должен быть минимум из 4 символов");
    if (!loginMode && !recoveryMode && name.length < 2) return toast("Введите имя аккаунта");
    if (phone.length < 6) return toast(recoveryMode ? "Введите телефон для восстановления" : loginMode ? "Введите телефон для входа" : "Введите телефон для регистрации");
    if (loginMode) {
      try {
        const data = await apiRequest(API_ENDPOINTS.login, {
          method: "POST",
          body: JSON.stringify({ username, phone, password }),
        });
        applyServerAccount(data.account);
        await syncTransactionsFromBackend({ renderAfter: false });
        await syncSupportTicketsFromBackend({ renderAfter: false });
      } catch (error) {
        return toast(error.message || "Не удалось войти через backend");
      }
      $("#register-password").value = "";
      syncAccountBlockStatus();
      if (isBlockedAccount()) return toast(blockMessage());
      addAudit("Вход", state.account.username || accountName());
      addActivity("Аккаунт", `Выполнен серверный вход в профиль ${accountName()}`);
      render();
      setScreen("profile");
      return toast("Вход выполнен");
    }
    if (editMode) {
      if (!isSignedIn()) return toast("Войдите в аккаунт, чтобы сохранить профиль");
      if (phone !== state.account.phone) return toast("Смена телефона пока выполняется через отдельное SMS-подтверждение. Оставьте текущий номер.");
      try {
        await updateServerAccount({
          name,
          username,
          city,
          ...(password ? { password } : {}),
        });
      } catch (error) {
        return toast(error.message || "Backend не сохранил профиль");
      }
      $("#register-password").value = "";
      addAudit("Профиль", `${state.account.username || state.account.name} · профиль обновлён`);
      addActivity("Аккаунт", `Профиль ${accountName()} обновлён на backend`);
      render();
      setScreen("profile");
      return toast("Профиль сохранён");
    }
    if (recoveryMode) {
      if (state.account.registered && state.account.phone !== phone) return toast("Телефон не совпадает с зарегистрированным аккаунтом");
      if (!pendingPhoneVerificationId) return toast("Сначала получите код восстановления");
      if (pendingPhoneVerificationPhone && pendingPhoneVerificationPhone !== phone) return toast("Код был запрошен на другой номер. Получите новый код.");
      if (!smsCode) return toast("Введите код из SMS или push-уведомления");
      try {
        const recovery = await apiRequest(API_ENDPOINTS.phoneVerify, {
          method: "POST",
          body: JSON.stringify({
            verificationId: pendingPhoneVerificationId,
            code: smsCode,
            ...(state.account.registered ? {
              accountId: state.account.id,
              name: state.account.name,
              username: state.account.username,
              city: state.account.city,
            } : {}),
            password,
          }),
        });
        applyServerAccount(recovery.account);
        await syncTransactionsFromBackend({ renderAfter: false });
        await syncSupportTicketsFromBackend({ renderAfter: false });
      } catch (error) {
        return toast(error.message || "Код восстановления не подтверждён");
      }
      state.account.phoneVerified = true;
      state.account.signedIn = true;
      pendingPhoneVerificationId = "";
      pendingPhoneVerificationPhone = "";
      $("#register-password").value = "";
      $("#register-sms-code").value = "";
      $("#sms-demo-code").textContent = "";
      upsertCurrentUser();
      addAudit("Восстановление", state.account.username || accountName());
      addActivity("Аккаунт", `Восстановлен доступ к профилю ${accountName()}`);
      setAccountFormMode("login");
      render();
      setScreen("profile");
      return toast("Доступ восстановлен, новый пароль сохранён");
    }
    if (!phoneAlreadyVerified && !pendingPhoneVerificationId) return toast("Сначала получите SMS/push-код");
    if (!phoneAlreadyVerified && pendingPhoneVerificationPhone && pendingPhoneVerificationPhone !== phone) return toast("Код был запрошен на другой номер. Получите новый код.");
    if (!phoneAlreadyVerified && !smsCode) return toast("Введите код из SMS или push-уведомления");
    if (!loginMode && city.length < 2) return toast("Укажите город, чтобы видеть задания рядом");

    const needsAgreement = !loginMode && state.account.communityAgreementVersion !== COMMUNITY_AGREEMENT_VERSION;
    let communityAgreementAcceptedAt = state.account.communityAgreementAcceptedAt || "";
    if (needsAgreement) {
      const accepted = await showCommunityAgreement();
      if (!accepted) return toast("Регистрация отменена: необходимо принять правила сообщества");
      communityAgreementAcceptedAt = new Date().toISOString();
    }

    let phoneVerified = phoneAlreadyVerified;
    if (!phoneAlreadyVerified) {
      try {
        const verification = await apiRequest(API_ENDPOINTS.phoneVerify, {
          method: "POST",
          body: JSON.stringify({
            verificationId: pendingPhoneVerificationId,
            code: smsCode,
            name,
            username,
            city,
          }),
        });
        phoneVerified = Boolean(verification.verified);
      } catch (error) {
        return toast(error.message || "Телефон не подтверждён");
      }
    }

    let registeredAccount = null;
    try {
      const registration = await apiRequest(API_ENDPOINTS.register, {
        method: "POST",
        body: JSON.stringify({
          name,
          username,
          phone,
          password,
          city,
          phoneVerified,
          communityAgreementVersion: COMMUNITY_AGREEMENT_VERSION,
          communityAgreementAcceptedAt,
        }),
      });
      registeredAccount = applyServerAccount(registration.account, {
        balance: rubles(state.account.balance),
        communityAgreementVersion: COMMUNITY_AGREEMENT_VERSION,
        communityAgreementAcceptedAt,
      });
      await syncTransactionsFromBackend({ renderAfter: false });
      await syncSupportTicketsFromBackend({ renderAfter: false });
    } catch (error) {
      return toast(error.message || "Backend не зарегистрировал аккаунт");
    }
    pendingPhoneVerificationId = "";
    pendingPhoneVerificationPhone = "";
    $("#register-password").value = "";
    $("#register-sms-code").value = "";
    publishLocalTasksToBackend();
    addAudit("Регистрация", `${registeredAccount?.username || state.account.name} · ${state.account.city}`);
    addActivity("Аккаунт", `Профиль ${accountName()} сохранён, телефон подтверждён`);
    render();
    setScreen("profile");
    toast("Аккаунт зарегистрирован");
  });
  $$(".role-tabs button").forEach((button) => {
    button.addEventListener("click", () => {
      state.role = button.dataset.role;
      $$(".role-tabs button").forEach((item) => item.classList.toggle("active", item === button));
      render();
      toast(`Режим: ${button.textContent}`);
    });
  });
  $$("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.filter = button.dataset.filter;
      $$("[data-filter]").forEach((item) => item.classList.toggle("active", item === button));
      renderLists();
      saveState();
    });
  });
  $$("[data-my-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.myFilter = button.dataset.myFilter;
      renderMyTasks();
      saveState();
    });
  });

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    const categoryHintButton = event.target.closest("#apply-category-hint");
    if (categoryHintButton) {
      const hint = findCategoryHint();
      if (hint) {
        $("#category").value = hint.category;
        if (!rubles($("#price").value)) $("#price").value = String(hint.price);
        render();
        saveDraft();
      }
      return;
    }
    if (!button) return;
    if (button.dataset.action === "accept") acceptTask(button.dataset.id);
    if (button.dataset.action === "open") openTask(button.dataset.id);
    if (button.dataset.action === "open-draft") {
      if (!ensureCanInteract()) return;
      applyDraft();
      setScreen("create");
      toast("Черновик открыт");
    }
    if (button.dataset.action === "clear-draft") {
      clearDraft();
      renderMyTasks();
      toast("Черновик удалён");
    }
    if (button.dataset.action === "open-support-ticket") {
      const ticket = visibleSupportTickets().find((item) => item.id === button.dataset.id);
      if (!ticket) return toast("Эта заявка доступна только автору и поддержке");
      state.activeSupportTicketId = ticket.id;
      updateSupportTicketOnBackend(ticket, isSupportOperator() ? { unreadForSupport: 0 } : { unreadForUser: 0 }).catch((error) => logError("Прочтение заявки", error.message));
      renderSupport();
      saveState();
    }
    if (button.dataset.action === "support-suggestion") {
      if (!ensureCanInteract()) return;
      $("#support-message").value = button.dataset.text || "";
      $("#support-form").requestSubmit();
    }
    if (button.dataset.action === "open-notification") {
      const item = state.notificationItems.find((notification) => notification.id === button.dataset.id);
      if (!item) return;
      item.read = true;
      if (item.type === "support" && item.refId) {
        const ticket = visibleSupportTickets().find((supportTicket) => supportTicket.id === item.refId);
        if (!ticket) return toast("Эта заявка доступна только автору и поддержке");
        state.activeSupportTicketId = ticket.id;
        setScreen("support");
      } else if (item.type === "task" && item.refId) {
        const task = taskByPublicId(item.refId);
        if (task) openTask(task.id);
      }
      renderNotifications();
      saveState();
    }
    if (button.dataset.action === "admin-open-task") {
      const task = state.tasks.find((item) => item.id === button.dataset.id) || state.moderationTasks.find((item) => item.id === button.dataset.id);
      if (!task) return toast("Задание не найдено");
      mergeTasks([task]);
      state.activeTaskId = task.id;
      setScreen("work");
    }
    if (button.dataset.action === "moderate-task") {
      if (!isModerator()) return toast("Нужны права модератора");
      const task = state.moderationTasks.find((item) => item.id === button.dataset.id) || state.tasks.find((item) => item.id === button.dataset.id);
      if (!task) return toast("Задание не найдено");
      const status = button.dataset.status;
      try {
        const note = status === "approved" ? "Одобрено модератором" : "Отклонено модератором";
        const updated = await moderateTaskOnBackend(task, status, note);
        addAudit(status === "approved" ? "Задание одобрено" : "Задание отклонено", `${updated.publicId || task.publicId || task.id} · ${updated.title || task.title}`);
        render();
        toast(status === "approved" ? "Задание опубликовано" : "Задание отклонено");
      } catch (error) {
        logError("Модерация задания", error.message);
        toast(error.message || "Не удалось обновить модерацию");
      }
    }
    if (button.dataset.action === "toggle-user-block") {
      const user = state.users.find((item) => item.id === button.dataset.id);
      if (!user) return toast("Пользователь не найден");
      user.blocked = !user.blocked;
      user.warning = user.blocked ? "Аккаунт заблокирован модератором" : "";
      if (user.id === state.account.id || (state.account.username && user.username === state.account.username) || (state.account.phone && user.phone === state.account.phone)) {
        state.account.blocked = user.blocked;
        state.account.warning = user.warning;
        if (user.blocked) {
          addAudit("Блокировка пользователя", `${user.username || user.name} · выполнен принудительный выход`);
          forceBlockedLogout("Вы заблокированы");
          return;
        }
      }
      addAudit(user.blocked ? "Блокировка пользователя" : "Разблокировка пользователя", `${user.username || user.name}`);
      render();
      toast(user.blocked ? "Пользователь заблокирован" : "Пользователь разблокирован");
    }
    if (button.dataset.action === "resolve-dispute") {
      const task = state.tasks.find((item) => item.id === button.dataset.id);
      if (!task) return toast("Спор не найден");
      let backendTask = null;
      try {
        backendTask = await sendTaskActionToBackend(task, "resolve", { result: button.dataset.result });
      } catch (error) {
        logError("Серверное решение спора", error.message);
        if (!canFallbackTaskAction(error)) return toast(error.message);
      }
      if (backendTask) {
        render();
        return toast(backendTask.disputeResolution || "Спор решён");
      }
      task.dispute = false;
      task.disputeStatus = "resolved";
      task.disputeResolution = button.dataset.result === "worker" ? "Решено в пользу исполнителя" : "Решено в пользу заказчика";
      task.messages.push({ author: "Арбитраж", text: task.disputeResolution, role: "support" });
      addAudit("Решение спора", `${task.publicId}: ${task.disputeResolution}`);
      saveLocalTaskFallback(task, { renderAfter: true });
      render();
      toast(task.disputeResolution);
    }
  });

  $("#show-list").addEventListener("click", () => setScreen(state.role === "worker" ? "feed" : "work"));
  $("#smart-action").addEventListener("click", () => setScreen(state.role === "worker" ? "feed" : "create"));
  $("#price").addEventListener("input", render);
  $("#search").addEventListener("input", (event) => {
    state.search = event.target.value;
    renderLists();
    saveState();
  });
  ["#category-filter", "#min-price-filter", "#distance-filter"].forEach((selector) => {
    const element = $(selector);
    if (!element) return;
    element.addEventListener("input", () => {
      state.categoryFilter = $("#category-filter").value;
      state.minPrice = $("#min-price-filter").value;
      state.maxDistance = $("#distance-filter").value;
      renderLists();
      saveState();
    });
    element.addEventListener("change", () => {
      state.categoryFilter = $("#category-filter").value;
      state.minPrice = $("#min-price-filter").value;
      state.maxDistance = $("#distance-filter").value;
      renderLists();
      saveState();
    });
  });
  $("#online").addEventListener("change", (event) => {
    $("#address").value = event.target.checked ? "Онлайн" : "";
    if (event.target.checked) setDraftLocation(null);
  });
  $("#pick-location").addEventListener("click", () => {
    if ($("#online").checked) return toast("Для онлайн-задания точка на карте не нужна");
    setPickingLocation(!pickingLocation);
  });
  $("#attach-reference").addEventListener("click", () => $("#reference-files").click());
  $("#reference-files").addEventListener("change", () => {
    renderAttachments();
    saveDraft();
    toast("Файлы прикреплены к черновику");
  });
  ["#complexity", "#title", "#description", "#category", "#address", "#price", "#deadline", "#exact-time", "#online", "#hide-phone"].forEach((selector) => {
    $(selector).addEventListener("input", () => {
      renderCreateHelpers();
      updateAddressSuggestions();
      saveDraft();
    });
    $(selector).addEventListener("change", () => {
      renderCreateHelpers();
      updateAddressSuggestions();
      saveDraft();
    });
  });
  $("#geocode-address").addEventListener("click", async () => {
    const address = $("#address").value.trim();
    if (!address || address === "Онлайн") return toast("Введите адрес для поиска");
    toast("Ищу адрес на карте…");
    const location = await geocodeAddress(address.includes(",") ? address : `${state.account.city}, ${address}`);
    if (!location) return toast("Не удалось найти адрес. Уточните город, улицу и дом.");
    setDraftLocation(location, location.label);
    toast("Адрес найден, точка добавлена на карту");
  });
  $("#register-city").addEventListener("input", updateAddressSuggestions);
  $("#payout-card").addEventListener("input", (event) => {
    event.target.value = formatCardNumber(event.target.value);
  });
  $("#verify-account").addEventListener("click", async () => {
    if (!ensureRegistered()) return;
    $("#esia-status-note").textContent = "Открываю backend ЕСИА. После возврата статус нужно проверить на сервере.";
    $("#verify-account").disabled = true;
    try {
      const data = await apiRequest(API_ENDPOINTS.esiaStart, {
        method: "POST",
        body: JSON.stringify({ returnUrl: verificationReturnUrl(), accountId: state.account.id }),
      });
      const redirectUrl = data.redirectUrl || data.url;
      if (!redirectUrl) throw new Error("Backend не вернул ссылку для перехода в Госуслуги.");
      window.location.href = redirectUrl;
    } catch (error) {
      $("#verify-account").disabled = state.account.verified;
      $("#esia-status-note").textContent = error.message;
      toast(error.message);
    }
  });
  $("#check-esia-status").addEventListener("click", async () => {
    if (!ensureRegistered()) return;
    $("#esia-status-note").textContent = "Проверяю статус ЕСИА на backend...";
    const ok = await refreshEsiaStatus(true);
    $("#esia-status-note").textContent = ok ? "Личность подтверждена через ЕСИА." : "Backend пока не подтвердил личность. Проверьте настройку ЕСИА на сервере.";
  });
  $("#ticket").addEventListener("click", async () => {
    if (!ensureCanInteract()) return;
    try {
      await createSupportTicketOnBackend("Новая заявка пользователя", $("#support-task-select").value);
      addActivity("Поддержка", "Создан чат с ботом поддержки");
      render();
      toast("Новая заявка создана");
    } catch (error) {
      toast(error.message || "Backend не создал заявку");
    }
  });
  $("#report").addEventListener("click", async () => {
    if (!ensureCanInteract()) return;
    const task = activeTask();
    if (task) {
      let backendTask = null;
      try {
        backendTask = await sendTaskActionToBackend(task, "dispute");
      } catch (error) {
        logError("Серверное открытие спора", error.message);
        if (!canFallbackTaskAction(error)) return toast(error.message);
      }
      if (backendTask) {
        const ticket = await createSupportTicketOnBackend(`Жалоба по заданию ${backendTask.publicId || backendTask.title}`, backendTask.publicId, "operator");
        await sendSupportMessageToBackend(ticket, `Открыт спор по заданию ${backendTask.publicId}. Поддержка может посмотреть чат задания в разделе «Задание».`);
        addNotification("Жалоба по заданию", `${backendTask.publicId}: спор передан поддержке`, "Арбитраж", "support", ticket.id);
        addAudit("Открыт спор", backendTask.publicId || "Без ID");
        addActivity("Арбитраж", "Модератор получил переписку, фотоотчёт и геометку по заданию");
        render();
        return toast("Спор открыт. Выплата заблокирована до решения поддержки");
      }
      task.dispute = true;
      task.disputeStatus = "open";
      task.disputeOpenedAt = new Date().toISOString();
      task.messages.push({ author: "Арбитраж", text: "Спор открыт. Автоматическая выплата заблокирована до решения поддержки.", role: "support" });
      let ticket = null;
      try {
        ticket = await createSupportTicketOnBackend(`Жалоба по заданию ${task.publicId || task.title}`, task.publicId, "operator");
        await sendSupportMessageToBackend(ticket, `Открыт спор по заданию ${task.publicId}. Поддержка может посмотреть чат задания в разделе «Задание».`);
        addNotification("Жалоба по заданию", `${task.publicId}: спор передан поддержке`, "Арбитраж", "support", ticket.id);
      } catch (error) {
        logError("Серверная заявка арбитража", error.message);
      }
      saveLocalTaskFallback(task, { renderAfter: true });
    }
    addAudit("Открыт спор", task?.publicId || "Без ID");
    addActivity("Арбитраж", "Модератор получил переписку, фотоотчёт и геометку по заданию");
    render();
    toast("Спор открыт. Выплата заблокирована до решения поддержки");
  });
  $("#route").addEventListener("click", () => {
    const task = activeTask();
    if (!task) return;
    if (task.online) return toast("Это онлайн-задание, маршрут не нужен");
    if (!task.location) return toast("У задания пока нет точки на карте");

    window.open(mapUrlFor(task.location), "_blank", "noopener");
  });
  $("#notification-button").addEventListener("click", () => setScreen("profile"));
  $("#clear-notifications").addEventListener("click", () => {
    state.notificationItems.forEach((item) => { item.read = true; });
    state.notifications = 0;
    renderNotifications();
    saveState();
    toast("Уведомления прочитаны");
  });
  $("#clear-activity").addEventListener("click", () => {
    state.activity = [];
    renderActivity();
    saveState();
  });
  $("#reset-demo").addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem("dela-ryadom-state-v4");
    localStorage.removeItem("dela-ryadom-state-v3");
    localStorage.removeItem(DRAFT_KEY);
    window.location.reload();
  });
  $("#delete-account").addEventListener("click", async () => {
    if (!state.account.registered) return toast("Аккаунт ещё не создан");
    if (!confirm("Удалить аккаунт? Серверная учётная запись будет удалена, а локальный профиль и черновики на этом устройстве очищены.")) return;
    try {
      await apiRequest(API_ENDPOINTS.account, { method: "DELETE" });
    } catch (error) {
      return toast(error.message || "Backend не удалил аккаунт");
    }
    csrfToken = "";
    [STORAGE_KEY, DEVICE_ACCOUNT_KEY, "dela-ryadom-state-v4", "dela-ryadom-state-v3", DRAFT_KEY].forEach((key) => localStorage.removeItem(key));
    window.location.reload();
  });
  $("#sbp-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!ensureRegistered()) return;
    const amount = rubles($("#sbp-amount").value);
    if (!amount || amount <= 0) return toast("Введите сумму пополнения");
    try {
      const data = await createSbpPayment(amount);
      const payment = data.payment || {};
      if (payment.status !== "paid") {
        if (payment.paymentUrl) {
          addActivity("СБП", `${payment.id || "Платёж"}: открыт экран оплаты банка`);
          window.location.assign(payment.paymentUrl);
          return;
        }
        throw new Error("Платёж создан и ожидает подтверждения банка.");
      }
      if (data.account) applyServerAccount(data.account);
      if (data.transactions) applyServerTransactions(data.transactions);
      $("#sbp-amount").value = "";
      addActivity("СБП", `${payment.id || "Платёж"}: баланс пополнен на ${money(amount)}`);
      render();
      toast(`СБП: ${money(amount)} зачислены`);
    } catch (error) {
      toast(error.message || "Backend не создал платёж");
    }
  });
  $("#payout-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!ensureRegistered()) return;
    const amount = rubles($("#payout-amount").value);
    const destinationDigits = digitsOnly($("#payout-card").value);
    if (!amount) return toast("Введите сумму вывода");
    if (amount > state.account.balance) return toast("На балансе недостаточно средств");
    if (destinationDigits.length < 10) return toast("Введите телефон СБП или номер карты");
    try {
      const data = await createPayout(amount, destinationDigits);
      const payout = data.payout || {};
      if (data.account) applyServerAccount(data.account);
      if (data.transactions) applyServerTransactions(data.transactions);
      $("#payout-amount").value = "";
      $("#payout-card").value = "";
      addActivity("Вывод", `${money(amount)}: заявка ${payout.id || "на выплату"} создана`);
      render();
      toast(`Заявка на вывод ${money(amount)} создана`);
    } catch (error) {
      toast(error.message || "Backend не создал заявку на вывод");
    }
  });
  $$("#rating-stars button").forEach((button) => {
    button.addEventListener("click", async () => {
      const task = activeTask();
      if (!canRateTask(task)) return toast("Оценка доступна только участникам задания");
      const stars = Number(button.dataset.rating);
      if (!addRating(state.role, stars)) return toast("Оценка уже поставлена");
      await saveAndSyncTask(task, { renderAfter: true });
      render();
      toast(`Спасибо! Оценка ${stars}★ сохранена`);
    });
  });

  $("#check-location").addEventListener("change", (event) => updateChecklist("location", event.target.checked));
  $("#check-photo").addEventListener("change", (event) => updateChecklist("photo", event.target.checked));
  $("#check-comment").addEventListener("change", (event) => updateChecklist("comment", event.target.checked));
  $("#enable-push")?.addEventListener("click", async () => {
    try {
      await enableWebPush();
      render();
      toast("Push-уведомления включены");
    } catch (error) {
      toast(error.message || "Не удалось включить push-уведомления");
    }
  });

  $("#create-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!ensureCanInteract()) return;
    const online = $("#online").checked;
    const price = rubles($("#price").value);
    const total = price;
    const address = $("#address").value.trim();
    const exactTime = $("#deadline").value === "exact" ? $("#exact-time").value : "";
    let location = null;

    if (!price) return toast("Укажите оплату исполнителю");
    if ($("#deadline").value === "exact" && !exactTime) return toast("Укажите точное время выполнения");

    if (state.account.balance < total) return toast(`Пополните баланс через СБП: нужно ${money(total)}`);

    if (!online) {
      location = draftLocation;
      if (!location) {
        toast("Ищу адрес на карте…");
        location = await geocodeAddress(address.includes(",") ? address : `${state.account.city}, ${address}`);
      }
      if (!location) return toast("Выберите точку на карте или уточните город, улицу и номер дома.");
    }

    const task = createTask(
      $("#title").value.trim(),
      $("#description").value.trim(),
      $("#category").value,
      price,
      location && userLocation ? Number(distanceKm(userLocation, location).toFixed(1)) : null,
      online,
      accountShortName(),
      price >= 3000,
    );
    task.publicId = nextTaskPublicId();
    task.customerAccountId = state.account.id;
    task.minutes = Number($("#complexity").value);
    task.address = address;
    task.city = online ? state.account.city : cityFromAddress(address);
    task.location = location;
    task.escrowAmount = price;
    task.purchaseBudget = 0;
    task.attachments = [...$("#reference-files").files].map((file) => ({ name: file.name, size: file.size, type: file.type }));
    task.deadlineType = $("#deadline").value;
    task.deadlineAt = exactTime ? new Date(exactTime).toISOString() : null;
    task.hidePhone = $("#hide-phone").checked;
    task.moderationStatus = isModerator() ? "approved" : "pending";
    task.moderationNote = isModerator() ? "Опубликовано модератором" : "Ждёт проверки модератором";
    state.tasks.unshift(task);
    state.activeTaskId = task.id;
    addAudit("Создание задания", `${task.publicId} · ${task.title} · ${task.moderationNote}`);
    Object.assign(task, await syncTaskNow(task));
    if (!task.escrowHeldAt) {
      state.tasks = state.tasks.filter((item) => item.id !== task.id);
      state.activeTaskId = null;
      render();
      return toast("Backend не подтвердил эскроу. Задание не опубликовано.");
    }
    addActivity(task.moderationStatus === "approved" ? "Задание опубликовано" : "Задание отправлено на модерацию", `${task.publicId} · ${task.title} · ${money(totalEscrow(task))} списаны у заказчика в эскроу`);
    setDraftLocation(null);
    $("#create-form").reset();
    $("#price").value = "0";
    $("#hide-phone").checked = true;
    clearDraft();
    render();
    setScreen("home");
    toast(task.moderationStatus === "approved" ? `${task.publicId}: ${money(totalEscrow(task))} списаны в эскроу` : `${task.publicId}: задание ждёт проверки модератором`);
  });

  $("#start").addEventListener("click", async () => {
    if (!ensureCanInteract()) return;
    const task = activeTask();
    if (!canWorkerManageTask(task)) return toast("Начать может только назначенный исполнитель");
    try {
      const backendTask = await sendTaskActionToBackend(task, "start");
      addActivity("Выполнение начато", backendTask.title);
      render();
      return toast("Статус: выполняется");
    } catch (error) {
      logError("Серверный старт задания", error.message);
      if (!canFallbackTaskAction(error)) return toast(error.message);
    }
    task.status = "progress";
    task.startedAt = new Date().toISOString();
    task.dueAt = task.dueAt || new Date(Date.now() + task.minutes * 60000).toISOString();
    task.messages.push({ author: accountShortName(), text: "Начал выполнение задания.", role: "worker" });
    addActivity("Выполнение начато", task.title);
    saveLocalTaskFallback(task, { renderAfter: true });
    render();
    toast("Статус: выполняется");
  });

  $("#photo").addEventListener("click", () => {
    if (!ensureCanInteract()) return;
    const task = activeTask();
    if (!canWorkerManageTask(task)) return toast("Фото может добавить только назначенный исполнитель");
    $("#photo-input").click();
  });

  $("#photo-input").addEventListener("change", async (event) => {
    if (!ensureCanInteract()) {
      event.target.value = "";
      return;
    }
    const task = activeTask();
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!canWorkerManageTask(task)) return toast("Фото может добавить только назначенный исполнитель");
    if (!file.type.startsWith("image/")) return toast("Выберите фото");
    try {
      const uploadedFile = await uploadTaskPhoto(file, task);
      const photoUrl = apiUrl(`/api/files/${encodeURIComponent(uploadedFile.id)}/download`);
      task.hasPhoto = true;
      task.proofPhotos = task.proofPhotos || [];
      task.proofPhotos.push({
        id: uploadedFile.id,
        fileId: uploadedFile.id,
        url: photoUrl,
        label: userLocation ? `Фото с геотегом: ${userLocation.lat.toFixed(5)}, ${userLocation.lng.toFixed(5)}` : "Фото без точной геолокации",
        createdAt: new Date().toISOString(),
      });
      task.checklist.photo = true;
      task.checklist.location = true;
      task.messages.push({ author: accountShortName(), text: "Прикрепил фотоотчет с геотегом.", role: "worker", photoFileId: uploadedFile.id, photoUrl });
      addActivity("Фотоотчет", "Фото сделано в приложении, геотег добавлен");
      await syncTaskNow(task, { renderAfter: true });
      render();
      toast("Фото сделано и отправлено в чат");
    } catch (error) {
      logError("Загрузка фотоотчёта", error.message);
      toast(error.message || "Не удалось добавить фото. Попробуйте ещё раз");
    }
  });

  $("#review").addEventListener("click", async () => {
    if (!ensureCanInteract()) return;
    const task = activeTask();
    if (!canWorkerManageTask(task)) return toast("На проверку может отправить только назначенный исполнитель");
    if (task.category === "Фотозадание" && !task.hasPhoto) return toast("Сначала сделайте фото");
    try {
      await sendTaskActionToBackend(task, "review");
      addActivity("Проверка", "Заказчик получил результат и push-уведомление");
      render();
      return toast("Заказчик получил уведомление");
    } catch (error) {
      logError("Серверная отправка на проверку", error.message);
      if (!canFallbackTaskAction(error)) return toast(error.message);
    }
    task.status = "review";
    task.checklist.comment = true;
    task.messages.push({ author: accountShortName(), text: "Отправил результат на проверку.", role: "worker" });
    addActivity("Проверка", "Заказчик получил результат и push-уведомление");
    saveLocalTaskFallback(task, { renderAfter: true });
    render();
    toast("Заказчик получил уведомление");
  });

  $("#revise").addEventListener("click", async () => {
    if (!ensureCanInteract()) return;
    const task = activeTask();
    if (!canCustomerManageTask(task)) return toast("Доработку может запросить только заказчик этого задания");
    const comment = $("#revision").value || "нужно улучшить результат";
    try {
      await sendTaskActionToBackend(task, "revision", { comment });
      addActivity("Доработка", "Исполнителю отправлен комментарий");
      render();
      return toast("Комментарий отправлен исполнителю");
    } catch (error) {
      logError("Серверный запрос доработки", error.message);
      if (!canFallbackTaskAction(error)) return toast(error.message);
    }
    task.status = "revision";
    task.messages.push({ author: accountShortName(), text: `На доработку: ${comment}`, role: "customer" });
    addActivity("Доработка", "Исполнителю отправлен комментарий");
    saveLocalTaskFallback(task, { renderAfter: true });
    render();
    toast("Комментарий отправлен исполнителю");
  });

  $("#accept").addEventListener("click", async () => {
    if (!ensureCanInteract()) return;
    const task = activeTask();
    if (!canCustomerManageTask(task)) return toast("Принять работу может только заказчик этого задания");
    if (task.dispute) return toast("Выплата заблокирована арбитражем до решения поддержки");
    if (task.status === "done") return toast("Задание уже принято");
    if (task.paidOut) return toast("Оплата уже начислена исполнителю");
    const payout = rubles((task.escrowAmount ?? task.price) + (task.workerDeposit || 0));
    try {
      await sendTaskActionToBackend(task, "done");
      addAudit("Приёмка задания", `${task.publicId} · выплата ${money(payout)}`);
      addActivity("Оплата выпущена", `${money(payout)} отправлены исполнителю за работу`);
      render();
      return toast(`${money(payout)} выпущены из эскроу за работу`);
    } catch (error) {
      logError("Серверная приёмка задания", error.message);
      return toast(error.message || "Backend не подтвердил приёмку задания");
    }
  });

  $("#message-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!ensureCanInteract()) return;
    const text = $("#message").value.trim();
    const task = activeTask();
    if (!text || !task) return;
    if (!canChatInTask(task)) return toast("Чат доступен только заказчику и назначенному исполнителю");
    if (isRiskyChat(text)) {
      $("#chat-warning").classList.remove("hidden");
      toast("Сообщение заблокировано: не переводите деньги и контакты вне платформы");
      return;
    }
    const message = {
      id: globalThis.crypto?.randomUUID?.() || String(Date.now() + Math.random()),
      author: accountShortName(),
      text,
      role: state.role,
      time: new Date().toISOString(),
    };
    task.messages.push(message);
    $("#message").value = "";
    addNotification("Новое сообщение в чате", `${task.publicId || task.title}: ${accountShortName()} написал(а): ${text}`, "Чат задания", "task", task.publicId);
    addActivity("Чат", `${task.publicId || task.title}: новое сообщение`, false);
    renderWork();
    try {
      await sendTaskMessageToBackend(task, message);
      await syncTasksFromBackend({ renderAfter: true });
    } catch (error) {
      logError("Сообщение в чат", error.message);
      if (error.status === 400 || error.status === 403) {
        task.messages = task.messages.filter((item) => item.id !== message.id);
        renderWork();
        return toast(error.message || "Сервер отклонил сообщение");
      }
      toast("Сообщение сохранено локально. Серверный чат временно недоступен.");
      await saveAndSyncTask(task, { renderAfter: true });
    }
    renderWork();
  });
}

function startTimer() {
  clearInterval(timerId);
  timerId = setInterval(() => {
    const task = activeTask();
    if (!task || !task.dueAt || task.status === "done") return;
    $("#countdown").textContent = remainingTime(task);
  }, 1000);
}

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  $("#install-button").hidden = false;
});

$("#install-button").addEventListener("click", async () => {
  if (!deferredInstallPrompt) return toast("Откройте приложение через HTTPS или localhost, чтобы установить его");
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  $("#install-button").hidden = true;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js").catch(() => {}));
}

async function bootstrapApp() {
  bindEvents();
  requestGeolocationPermissionOnStart();
  initMap();
  applyDraft();
  await loadRuntimeConfig();
  await loadServerSession();
  await syncTransactionsFromBackend({ renderAfter: false });
  await syncSupportTicketsFromBackend({ renderAfter: false });
  render();
  setScreen(state.screen || "home");
  completeProviderLogin();
  refreshEsiaStatus();
  startTaskSync();
  startTimer();
}

bootstrapApp();

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const ENV_PATH = path.join(ROOT_DIR, ".env");
const MIGRATIONS_DIR = path.join(__dirname, "migrations");
const stateStore = new Map();
const rateLimitStore = new Map();
const eventClients = new Set();
const STATE_TTL_MS = 10 * 60 * 1000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_JSON_BODY_BYTES = 32 * 1024;
const MAX_FILE_UPLOAD_BYTES = 8 * 1024 * 1024;
const S3_UPLOAD_URL_TTL_SECONDS = 15 * 60;
const S3_DOWNLOAD_URL_TTL_SECONDS = 5 * 60;
const AUTH_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const AUTH_RATE_LIMIT_MAX = 20;
const TASK_WORKER_DEPOSIT = 100;
const ALLOWED_UPLOAD_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PUBLIC_FILES = new Set([
  "index.html",
  "config.js",
  "styles.css",
  "app.js",
  "manifest.webmanifest",
  "service-worker.js",
  "app-icon.svg",
  "robots.txt",
]);

loadEnvFile(ENV_PATH);

const config = {
  port: Number(process.env.PORT || 3000),
  publicBaseUrl: trimTrailingSlash(process.env.PUBLIC_BASE_URL || "http://localhost:3000"),
  allowedOrigins: parseAllowedOrigins(process.env.FRONTEND_ALLOWED_ORIGIN || ""),
  cookieSecret: process.env.COOKIE_SECRET || "dev-cookie-secret-change-me",
  cookieDomain: process.env.COOKIE_DOMAIN || "",
  cookieSameSite: process.env.COOKIE_SAME_SITE || (process.env.NODE_ENV === "production" ? "None" : "Lax"),
  forceSecureCookies: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
  esia: {
    clientId: process.env.ESIA_CLIENT_ID || "",
    clientSecret: process.env.ESIA_CLIENT_SECRET || "",
    redirectUri: process.env.ESIA_REDIRECT_URI || "",
    scope: process.env.ESIA_SCOPE || "openid fullname mobile email",
    authUrl: process.env.ESIA_AUTH_URL || "https://esia.gosuslugi.ru/aas/oauth2/ac",
    tokenUrl: process.env.ESIA_TOKEN_URL || "https://esia.gosuslugi.ru/aas/oauth2/te",
    userInfoUrl: process.env.ESIA_USERINFO_URL || "",
  },
  payments: {
    provider: (process.env.PAYMENT_PROVIDER || "mock").toLowerCase(),
    primaryBank: process.env.PAYMENT_PRIMARY_BANK || "tbank",
    merchantId: process.env.PAYMENT_MERCHANT_ID || "",
    terminalKey: process.env.TBANK_TERMINAL_KEY || "",
    password: process.env.TBANK_PASSWORD || "",
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || "",
    yookassaShopId: process.env.YOOKASSA_SHOP_ID || process.env.PAYMENT_MERCHANT_ID || "",
    yookassaSecretKey: process.env.YOOKASSA_SECRET_KEY || "",
    yookassaApiUrl: trimTrailingSlash(process.env.YOOKASSA_API_URL || "https://api.yookassa.ru/v3"),
    mockAutoConfirm: process.env.PAYMENT_MOCK_AUTO_CONFIRM !== "false",
  },
  data: {
    dir: path.resolve(ROOT_DIR, process.env.DATA_DIR || "backend/data"),
  },
  database: {
    url: process.env.DATABASE_URL || "",
    ssl: process.env.DATABASE_SSL ? process.env.DATABASE_SSL === "true" : process.env.NODE_ENV === "production",
  },
  admin: {
    accountIds: parseList(process.env.ADMIN_ACCOUNT_IDS || ""),
    supportAccountIds: parseList(process.env.SUPPORT_ACCOUNT_IDS || ""),
    moderatorAccountIds: parseList(process.env.MODERATOR_ACCOUNT_IDS || ""),
  },
  sms: {
    provider: (process.env.SMS_PROVIDER || "disabled").toLowerCase(),
    apiKey: process.env.SMS_API_KEY || "",
    sender: process.env.SMS_SENDER || "",
  },
  push: {
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || "",
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || "",
    vapidSubject: process.env.VAPID_SUBJECT || "",
  },
  storage: {
    provider: (process.env.FILE_STORAGE_PROVIDER || "local-disabled").toLowerCase(),
    bucket: process.env.S3_BUCKET || "",
    region: process.env.S3_REGION || "ru-1",
    endpoint: trimTrailingSlash(process.env.S3_ENDPOINT || ""),
    accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
    publicBaseUrl: trimTrailingSlash(process.env.S3_PUBLIC_BASE_URL || ""),
    pathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
  },
};

const DATA_FILE = path.join(config.data.dir, "store.json");
const database = createEmptyDatabase();
let persistenceDriver = null;
let persistenceInfo = {
  provider: "not-initialized",
  ready: false,
  dataDir: path.relative(ROOT_DIR, config.data.dir) || ".",
};
let persistQueue = Promise.resolve();

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex < 0) continue;
    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    if (!key || process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function parseList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmacSha256(key, value, encoding) {
  return crypto.createHmac("sha256", key).update(value).digest(encoding);
}

function encodeS3PathSegment(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeS3Path(value) {
  return String(value || "").split("/").map(encodeS3PathSegment).join("/");
}

function s3AmzDate(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function s3DateStamp(date = new Date()) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function normalizeS3HeaderValue(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function parseAllowedOrigins(value) {
  const origins = String(value || "")
    .split(",")
    .map((item) => trimTrailingSlash(item.trim()))
    .filter(Boolean);
  try {
    origins.push(new URL(process.env.PUBLIC_BASE_URL || "http://localhost:3000").origin);
  } catch {}
  return [...new Set(origins)];
}

function createEmptyDatabase() {
  const now = new Date().toISOString();
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    counters: { taskNumber: 0 },
    users: {},
    sessions: {},
    tasks: {},
    payments: {},
    payouts: {},
    transactions: {},
    supportTickets: {},
    files: {},
    pushSubscriptions: {},
    smsCodes: {},
    auditLog: [],
  };
}

function objectStore(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function loadDatabase() {
  fs.mkdirSync(config.data.dir, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    const initial = createEmptyDatabase();
    writeDatabaseFile(initial);
    return initial;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    const migrated = {
      ...createEmptyDatabase(),
      ...parsed,
      counters: { taskNumber: 0, ...objectStore(parsed.counters) },
      users: objectStore(parsed.users),
      sessions: objectStore(parsed.sessions),
      tasks: objectStore(parsed.tasks),
      payments: objectStore(parsed.payments),
      payouts: objectStore(parsed.payouts),
      transactions: objectStore(parsed.transactions),
      supportTickets: objectStore(parsed.supportTickets),
      files: objectStore(parsed.files),
      pushSubscriptions: objectStore(parsed.pushSubscriptions),
      smsCodes: objectStore(parsed.smsCodes),
      auditLog: Array.isArray(parsed.auditLog) ? parsed.auditLog : [],
    };
    migrated.counters.taskNumber = Math.max(
      Number(migrated.counters.taskNumber || 0),
      ...Object.values(migrated.tasks).map((task) => taskPublicNumber(task.publicId)).filter(Boolean),
    );
    return migrated;
  } catch (error) {
    const brokenPath = `${DATA_FILE}.broken-${Date.now()}`;
    fs.renameSync(DATA_FILE, brokenPath);
    const initial = createEmptyDatabase();
    initial.auditLog.push({
      id: `audit_${randomToken(10)}`,
      action: "database_recovered",
      details: `Повреждённый файл данных перемещён в ${path.basename(brokenPath)}: ${error.message}`,
      createdAt: new Date().toISOString(),
      actorAccountId: "system",
      ip: "local",
    });
    writeDatabaseFile(initial);
    return initial;
  }
}

function replaceDatabase(next) {
  const empty = createEmptyDatabase();
  for (const key of Object.keys(database)) delete database[key];
  Object.assign(database, {
    ...empty,
    ...next,
    counters: { ...empty.counters, ...objectStore(next.counters) },
    users: objectStore(next.users),
    sessions: objectStore(next.sessions),
    tasks: objectStore(next.tasks),
    payments: objectStore(next.payments),
    payouts: objectStore(next.payouts),
    transactions: objectStore(next.transactions),
    supportTickets: objectStore(next.supportTickets),
    files: objectStore(next.files),
    pushSubscriptions: objectStore(next.pushSubscriptions),
    smsCodes: objectStore(next.smsCodes),
    auditLog: Array.isArray(next.auditLog) ? next.auditLog : [],
  });
}

function writeDatabaseFile(data) {
  data.updatedAt = new Date().toISOString();
  const tempFile = `${DATA_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.renameSync(tempFile, DATA_FILE);
}

function persistDatabase() {
  persistQueue = persistQueue
    .catch(() => {})
    .then(() => persistenceDriver.persist(database))
    .catch((error) => console.error("Persistence write failed:", error.message || error));
  return persistQueue;
}

function createJsonPersistenceDriver() {
  return {
    provider: "atomic-json",
    async init() {
      replaceDatabase(loadDatabase());
      persistenceInfo = {
        provider: "atomic-json",
        ready: true,
        dataDir: path.relative(ROOT_DIR, config.data.dir) || ".",
      };
    },
    async persist(data) {
      writeDatabaseFile(data);
    },
    async close() {},
  };
}

function createPostgresPersistenceDriver() {
  let pg;
  try {
    pg = require("pg");
  } catch {
    console.warn("DATABASE_URL is set, but package 'pg' is not installed. Falling back to local JSON persistence. Run: npm install");
    return createJsonPersistenceDriver();
  }

  const pool = new pg.Pool({
    connectionString: config.database.url,
    ssl: config.database.ssl ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === "true" } : false,
  });

  return {
    provider: "postgresql",
    async init() {
      await runPostgresMigrations(pool);
      const loaded = await loadPostgresSnapshot(pool);
      replaceDatabase(loaded || loadDatabase());
      await persistPostgresDatabase(pool, database);
      persistenceInfo = {
        provider: "postgresql",
        ready: true,
        dataDir: path.relative(ROOT_DIR, config.data.dir) || ".",
      };
    },
    async persist(data) {
      await persistPostgresDatabase(pool, data);
    },
    async close() {
      await pool.end();
    },
  };
}

async function runPostgresMigrations(pool) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    const applied = new Set((await client.query("SELECT version FROM schema_migrations")).rows.map((row) => row.version));
    const migrations = fs.existsSync(MIGRATIONS_DIR)
      ? fs.readdirSync(MIGRATIONS_DIR).filter((name) => /^\d+_.+\.sql$/.test(name)).sort()
      : [];
    for (const filename of migrations) {
      const version = filename.replace(/\.sql$/, "");
      if (applied.has(version)) continue;
      await client.query(fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8"));
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING", [version]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function loadPostgresSnapshot(pool) {
  const result = await pool.query("SELECT data FROM app_state WHERE id = 'main'");
  return result.rows[0]?.data || null;
}

async function persistPostgresDatabase(pool, data) {
  data.updatedAt = new Date().toISOString();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "INSERT INTO app_state (id, data, updated_at) VALUES ('main', $1::jsonb, NOW()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()",
      [JSON.stringify(data)],
    );
    await syncPostgresTables(client, data);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function syncPostgresTables(client, data) {
  for (const user of Object.values(data.users)) {
    await client.query(
      `INSERT INTO users (id, auth_provider, external_id, name, username, phone, phone_verified, city, verified, roles, profile, created_at, updated_at, last_login_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO UPDATE SET auth_provider=EXCLUDED.auth_provider, external_id=EXCLUDED.external_id, name=EXCLUDED.name, username=EXCLUDED.username, phone=EXCLUDED.phone, phone_verified=EXCLUDED.phone_verified, city=EXCLUDED.city, verified=EXCLUDED.verified, roles=EXCLUDED.roles, profile=EXCLUDED.profile, updated_at=EXCLUDED.updated_at, last_login_at=EXCLUDED.last_login_at`,
      [user.id, user.authProvider || "", user.externalId || "", user.name || "", user.username || "", user.phone || "", Boolean(user.phoneVerified), user.city || "", Boolean(user.verified), user.roles || ["user"], JSON.stringify(user), user.createdAt || new Date().toISOString(), user.updatedAt || new Date().toISOString(), user.lastLoginAt || null],
    );
  }
  for (const [id, session] of Object.entries(data.sessions)) {
    if (!data.users[session.accountId]) continue;
    await client.query(
      `INSERT INTO sessions (id, account_id, provider, created_at, expires_at)
       VALUES ($1,$2,$3,$4,to_timestamp($5 / 1000.0))
       ON CONFLICT (id) DO UPDATE SET account_id=EXCLUDED.account_id, provider=EXCLUDED.provider, expires_at=EXCLUDED.expires_at`,
      [id, session.accountId, session.provider || "", session.createdAt || new Date().toISOString(), Number(session.expiresAt || Date.now())],
    );
  }
  for (const task of Object.values(data.tasks)) {
    await client.query(
      `INSERT INTO tasks (id, public_id, status, title, customer_account_id, worker_account_id, task, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET public_id=EXCLUDED.public_id, status=EXCLUDED.status, title=EXCLUDED.title, customer_account_id=EXCLUDED.customer_account_id, worker_account_id=EXCLUDED.worker_account_id, task=EXCLUDED.task, updated_at=EXCLUDED.updated_at`,
      [task.id, task.publicId, task.status || "open", task.title || "", task.customerAccountId || task.customer?.id || "", task.workerAccountId || task.worker?.id || "", JSON.stringify(task), task.createdAt || new Date().toISOString(), task.updatedAt || new Date().toISOString()],
    );
  }
  for (const payment of Object.values(data.payments)) {
    await client.query(
      `INSERT INTO payments (id, provider, bank, amount, status, purpose, task_public_id, account_id, payment, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, payment=EXCLUDED.payment, updated_at=EXCLUDED.updated_at`,
      [payment.id, payment.provider || "", payment.bank || "", Number(payment.amount || 0), payment.status || "", payment.purpose || "", payment.taskPublicId || "", payment.accountId || "", JSON.stringify(payment), payment.createdAt || new Date().toISOString(), payment.updatedAt || new Date().toISOString()],
    );
  }
  for (const payout of Object.values(data.payouts)) {
    await client.query(
      `INSERT INTO payouts (id, provider, bank, amount, status, account_id, payout, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, payout=EXCLUDED.payout, updated_at=EXCLUDED.updated_at`,
      [payout.id, payout.provider || "", payout.bank || "", Number(payout.amount || 0), payout.status || "", payout.accountId || "", JSON.stringify(payout), payout.createdAt || new Date().toISOString(), payout.updatedAt || new Date().toISOString()],
    );
  }
  for (const transaction of Object.values(data.transactions)) {
    await client.query(
      `INSERT INTO transactions (id, account_id, type, title, amount, status, task_public_id, reference_type, reference_id, transaction, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, transaction=EXCLUDED.transaction`,
      [transaction.id, transaction.accountId || "", transaction.type || "", transaction.title || "", Number(transaction.amount || 0), transaction.status || "", transaction.taskPublicId || "", transaction.referenceType || "", transaction.referenceId || "", JSON.stringify(transaction), transaction.createdAt || new Date().toISOString()],
    );
  }
  for (const ticket of Object.values(data.supportTickets)) {
    await client.query(
      `INSERT INTO support_tickets (id, public_id, status, reason, task_public_id, created_by_account_id, ticket, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, reason=EXCLUDED.reason, task_public_id=EXCLUDED.task_public_id, ticket=EXCLUDED.ticket, updated_at=EXCLUDED.updated_at`,
      [ticket.id, ticket.publicId || "", ticket.status || "", ticket.reason || "", ticket.taskPublicId || "", ticket.createdByAccountId || "", JSON.stringify(ticket), ticket.createdAt || new Date().toISOString(), ticket.updatedAt || new Date().toISOString()],
    );
  }
  for (const file of Object.values(data.files)) {
    await client.query(
      `INSERT INTO files (id, provider, bucket, object_key, filename, content_type, account_id, status, file, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, file=EXCLUDED.file, updated_at=EXCLUDED.updated_at`,
      [file.id, file.provider || "", file.bucket || "", file.objectKey || "", file.filename || "", file.contentType || "", file.accountId || "", file.status || "", JSON.stringify(file), file.createdAt || new Date().toISOString(), file.updatedAt || file.createdAt || new Date().toISOString()],
    );
  }
  for (const entry of data.auditLog.slice(0, 5000)) {
    await client.query(
      `INSERT INTO audit_log (id, action, details, actor_account_id, target_type, target_id, ip, entry, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO NOTHING`,
      [entry.id, entry.action || "", entry.details || "", entry.actorAccountId || "", entry.targetType || "", entry.targetId || "", entry.ip || "", JSON.stringify(entry), entry.createdAt || new Date().toISOString()],
    );
  }
}

async function initPersistence() {
  persistenceDriver = config.database.url ? createPostgresPersistenceDriver() : createJsonPersistenceDriver();
  await persistenceDriver.init();
}

function defaultRedirectUri(provider) {
  return `${config.publicBaseUrl}/api/auth/${provider}/callback`;
}

function providerConfig(provider) {
  return config.esia;
}

function isProviderConfigured(provider) {
  const providerSettings = providerConfig(provider);
  return Boolean(providerSettings.clientId && providerSettings.clientSecret);
}

function json(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...securityHeaders(),
    ...extraHeaders,
  });
  res.end(JSON.stringify(payload));
}

function redirect(res, location, extraHeaders = {}) {
  res.writeHead(302, { Location: location, "Cache-Control": "no-store", ...securityHeaders(), ...extraHeaders });
  res.end();
}

function securityHeaders() {
  const csp = [
    "default-src 'self'",
    "script-src 'self' https://unpkg.com",
    "style-src 'self' 'unsafe-inline' https://unpkg.com",
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com",
    "connect-src 'self' https://nominatim.openstreetmap.org https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com",
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];
  if (config.publicBaseUrl.startsWith("https://")) csp.push("upgrade-insecure-requests");
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(self), camera=(self), microphone=()",
    "Content-Security-Policy": csp.join("; "),
  };
}

function corsHeaders(req) {
  const origin = req.headers.origin || "";
  if (!origin || !config.allowedOrigins.includes(origin)) return { Vary: "Origin" };
  return {
    Vary: "Origin",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
  };
}

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const index = item.indexOf("=");
        if (index < 0) return [item, ""];
        try {
          return [decodeURIComponent(item.slice(0, index)), decodeURIComponent(item.slice(index + 1))];
        } catch {
          return [item.slice(0, index), ""];
        }
      }),
  );
}

function cookie(name, value, maxAgeSeconds) {
  const secure = config.forceSecureCookies ? "; Secure" : "";
  const domain = config.cookieDomain ? `; Domain=${config.cookieDomain}` : "";
  return `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=${config.cookieSameSite}; Max-Age=${maxAgeSeconds}${domain}${secure}`;
}

function signedSessionId(sessionId) {
  const signature = crypto.createHmac("sha256", config.cookieSecret).update(sessionId).digest("base64url");
  return `${sessionId}.${signature}`;
}

function verifySignedSessionId(value) {
  const [sessionId, signature] = String(value || "").split(".");
  if (!sessionId || !signature) return "";
  const expected = crypto.createHmac("sha256", config.cookieSecret).update(sessionId).digest("base64url");
  if (Buffer.byteLength(signature) !== Buffer.byteLength(expected)) return "";
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return "";
  return sessionId;
}

function sessionCsrfToken(session) {
  if (!session) return "";
  if (!session.csrfToken) session.csrfToken = randomToken(24);
  return session.csrfToken;
}

function safeEqual(value, expected) {
  const left = Buffer.from(String(value || ""));
  const right = Buffer.from(String(expected || ""));
  if (!left.length || left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_JSON_BODY_BYTES) {
      const error = new Error("JSON body is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

function logAudit(action, details = "", req = null, extras = {}) {
  const entry = {
    id: `audit_${randomToken(10)}`,
    action,
    details: String(details || "").slice(0, 1000),
    actorAccountId: extras.actorAccountId || currentAccount(req)?.id || "system",
    targetType: extras.targetType || "",
    targetId: extras.targetId || "",
    ip: req ? clientIp(req) : "local",
    createdAt: new Date().toISOString(),
  };
  database.auditLog.unshift(entry);
  database.auditLog = database.auditLog.slice(0, 5000);
  persistDatabase();
  return entry;
}

function broadcastEvent(type, payload = {}) {
  const event = { type, payload, createdAt: new Date().toISOString() };
  const data = `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
  for (const client of [...eventClients]) {
    try {
      client.write(data);
    } catch {
      eventClients.delete(client);
    }
  }
}

function currentSession(req) {
  cleanupStores();
  const sessionId = verifySignedSessionId(parseCookies(req).dr_auth_session);
  if (!sessionId) return null;
  return database.sessions[sessionId] || null;
}

function currentSessionWithId(req) {
  cleanupStores();
  const sessionId = verifySignedSessionId(parseCookies(req).dr_auth_session);
  if (!sessionId) return { sessionId: "", session: null };
  return { sessionId, session: database.sessions[sessionId] || null };
}

function currentAccount(req) {
  const session = req ? currentSession(req) : null;
  if (!session?.accountId) return null;
  return database.users[session.accountId] || null;
}

function requireAdmin(req, res) {
  const account = currentAccount(req);
  if (!account || !isAdminAccount(account)) {
    json(res, 403, { message: "Нужны права администратора." });
    return null;
  }
  return account;
}

function requireModerator(req, res) {
  const account = currentAccount(req);
  if (!account || !isModeratorAccount(account)) {
    json(res, 403, { message: "Нужны права модератора." });
    return null;
  }
  return account;
}

function isAdminAccount(account) {
  return Boolean(account?.roles?.includes("admin") || config.admin.accountIds.includes(account?.id));
}

function isSupportAccount(account) {
  const username = String(account?.username || "").trim();
  return Boolean(account && (isAdminAccount(account) || account.roles?.includes("support") || config.admin.supportAccountIds.includes(account.id) || username === "Поддержка_ДелаРядом358935-345324"));
}

function isModeratorAccount(account) {
  return Boolean(account && (isAdminAccount(account) || isSupportAccount(account) || account.roles?.includes("moderator") || config.admin.moderatorAccountIds.includes(account.id)));
}

function providerStatus() {
  return {
    esia: isProviderConfigured("esia"),
    payments: paymentProviderStatus(),
    sms: smsProviderStatus(),
    push: pushProviderStatus(),
    storage: storageProviderStatus(),
  };
}

function smsProviderStatus() {
  const configured = config.sms.provider !== "disabled" && Boolean(config.sms.apiKey && config.sms.sender);
  const devMode = !configured && process.env.NODE_ENV !== "production";
  return { provider: config.sms.provider, configured, devMode, mode: configured ? "production-ready" : devMode ? "dev-code" : "disabled" };
}

function pushProviderStatus() {
  const configured = Boolean(config.push.vapidPublicKey && config.push.vapidPrivateKey && config.push.vapidSubject);
  return { provider: "web-push", configured, mode: configured ? "production-ready" : "disabled" };
}

function storageProviderStatus() {
  const configured = config.storage.provider === "s3" && Boolean(config.storage.bucket && config.storage.endpoint && config.storage.accessKeyId && config.storage.secretAccessKey);
  return { provider: config.storage.provider, bucket: configured ? config.storage.bucket : "", configured, mode: configured ? "production-ready" : "disabled" };
}

function s3ObjectUrl(objectKey) {
  if (!config.storage.endpoint || !config.storage.bucket) return "";
  const endpoint = new URL(config.storage.endpoint);
  const encodedKey = encodeS3Path(objectKey);
  if (config.storage.pathStyle) {
    endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, "")}/${encodeS3PathSegment(config.storage.bucket)}/${encodedKey}`;
    return endpoint.toString();
  }
  endpoint.hostname = `${config.storage.bucket}.${endpoint.hostname}`;
  endpoint.pathname = `${endpoint.pathname.replace(/\/+$/, "")}/${encodedKey}`;
  return endpoint.toString();
}

function presignS3Url({ method, objectKey, contentType = "", expiresIn = S3_DOWNLOAD_URL_TTL_SECONDS }) {
  const now = new Date();
  const amzDate = s3AmzDate(now);
  const dateStamp = s3DateStamp(now);
  const url = new URL(s3ObjectUrl(objectKey));
  const credentialScope = `${dateStamp}/${config.storage.region}/s3/aws4_request`;
  const headers = { host: url.host };
  if (contentType) headers["content-type"] = contentType;
  const signedHeaders = Object.keys(headers).sort().join(";");
  const credential = `${config.storage.accessKeyId}/${credentialScope}`;

  url.searchParams.set("X-Amz-Algorithm", "AWS4-HMAC-SHA256");
  url.searchParams.set("X-Amz-Credential", credential);
  url.searchParams.set("X-Amz-Date", amzDate);
  url.searchParams.set("X-Amz-Expires", String(Math.max(1, Math.min(604800, Number(expiresIn || 1)))));
  url.searchParams.set("X-Amz-SignedHeaders", signedHeaders);

  const canonicalQuery = [...url.searchParams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((key) => `${key}:${normalizeS3HeaderValue(headers[key])}\n`)
    .join("");
  const canonicalRequest = [method, url.pathname, canonicalQuery, canonicalHeaders, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, sha256Hex(canonicalRequest)].join("\n");
  const signingKey = hmacSha256(hmacSha256(hmacSha256(hmacSha256(`AWS4${config.storage.secretAccessKey}`, dateStamp), config.storage.region), "s3"), "aws4_request");
  url.searchParams.set("X-Amz-Signature", hmacSha256(signingKey, stringToSign, "hex"));

  return url.toString();
}

function taskCanBeReadByAccount(task, account) {
  if (!task || !account) return false;
  if (isAdminAccount(account) || isSupportAccount(account)) return true;
  return taskParticipantIds(task).includes(String(account.id));
}

function fileCanBeReadByAccount(file, account) {
  if (!file || !account) return false;
  if (isAdminAccount(account) || isSupportAccount(account)) return true;
  if (file.accountId && String(file.accountId) === String(account.id)) return true;
  if (file.taskId) return taskCanBeReadByAccount(findTask(file.taskId), account);
  return false;
}

function classifyMessageRisk(text) {
  const value = String(text || "").toLowerCase();
  const rules = [
    { code: "external_payment", pattern: /(переведи|перевод|скинь|кинь|оплат[аи]|заплачу|доплачу)\s+(мне\s+)?(на\s+)?(карт|сбер|тинькофф|tinkoff|номер|телефон|сч[её]т)/i },
    { code: "prepayment", pattern: /(предоплат|аванс|задаток)\s+(на\s+)?(карт|сбер|тинькофф|номер|телефон|сч[её]т)/i },
    { code: "external_messenger", pattern: /(telegram|телеграм|whatsapp|ватсап|viber|вайбер|vk\.com|вконтакте|инстаграм|instagram)/i },
    { code: "card_number", pattern: /(номер\s+карт|карта\s*\d{4}|\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b)/i },
  ];
  const matches = rules.filter((rule) => rule.pattern.test(value)).map((rule) => rule.code);
  return {
    risky: matches.length > 0,
    codes: matches,
    message: "Сообщение заблокировано: оплату, предоплату и обмен контактами вне платформы нельзя обсуждать в чате.",
  };
}

function rejectRiskyMessage(res, risk) {
  return json(res, 400, { message: risk.message, risk: { blocked: true, codes: risk.codes } });
}

function cleanupStores() {
  const now = Date.now();
  for (const [key, item] of stateStore.entries()) {
    if (!item || item.expiresAt <= now) stateStore.delete(key);
  }
  let changed = false;
  for (const [key, item] of Object.entries(database.sessions)) {
    if (!item || item.expiresAt <= now) {
      delete database.sessions[key];
      changed = true;
    }
  }
  for (const [key, item] of Object.entries(database.smsCodes)) {
    if (!item || item.expiresAt <= now) {
      delete database.smsCodes[key];
      changed = true;
    }
  }
  for (const [key, item] of rateLimitStore.entries()) {
    if (!item || item.resetAt <= now) rateLimitStore.delete(key);
  }
  if (changed) persistDatabase();
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown").split(",")[0].trim();
}

function checkRateLimit(req, key = "auth") {
  const profiles = {
    auth: { windowMs: 60 * 1000, max: 20 },
    sms: { windowMs: 10 * 60 * 1000, max: 5 },
    "sms-verify": { windowMs: 10 * 60 * 1000, max: 10 },
    payments: { windowMs: 60 * 1000, max: 6 },
    payouts: { windowMs: 5 * 60 * 1000, max: 3 },
    files: { windowMs: 60 * 1000, max: 20 },
    "task-actions": { windowMs: 60 * 1000, max: 60 },
    support: { windowMs: 60 * 1000, max: 30 },
  };
  const profile = profiles[key] || { windowMs: AUTH_RATE_LIMIT_WINDOW_MS, max: AUTH_RATE_LIMIT_MAX };
  const id = `${key}:${clientIp(req)}`;
  const now = Date.now();
  const current = rateLimitStore.get(id);
  if (!current || current.resetAt <= now) {
    rateLimitStore.set(id, { count: 1, resetAt: now + profile.windowMs });
    return true;
  }
  current.count += 1;
  return current.count <= profile.max;
}

function isUnsafeMethod(method) {
  return !["GET", "HEAD", "OPTIONS"].includes(String(method || "GET").toUpperCase());
}

function csrfExemptPath(pathname) {
  return [
    "/api/auth/register",
    "/api/auth/login",
    "/api/auth/phone/start",
    "/api/auth/phone/verify",
    "/api/auth/esia/start",
    "/api/payments/webhook",
  ].includes(pathname);
}

function requireCsrf(req, res, url) {
  if (!url.pathname.startsWith("/api/") || !isUnsafeMethod(req.method) || csrfExemptPath(url.pathname)) return true;
  const { session } = currentSessionWithId(req);
  if (!session) return true;
  const expected = sessionCsrfToken(session);
  const provided = req.headers["x-csrf-token"] || req.headers["x-xsrf-token"];
  if (safeEqual(provided, expected)) return true;
  json(res, 403, { message: "Запрос отклонён CSRF-защитой. Обновите страницу и повторите действие." });
  return false;
}

function normalizePhone(value) {
  const phone = String(value || "").replace(/[^0-9+]/g, "");
  if (phone.startsWith("+")) return `+${phone.slice(1).replace(/\D/g, "")}`;
  return phone.replace(/\D/g, "");
}

function phoneMask(phone) {
  return phone.length > 6 ? `${phone.slice(0, 3)}••••${phone.slice(-2)}` : "телефон";
}

function phoneUserId(phone) {
  return `phone:${crypto.createHash("sha256").update(phone).digest("hex").slice(0, 24)}`;
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function passwordHash(password) {
  const salt = randomToken(16);
  const hash = crypto.scryptSync(String(password), salt, 64).toString("base64url");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [method, salt, expected] = String(storedHash || "").split(":");
  if (method !== "scrypt" || !salt || !expected) return false;
  const actual = crypto.scryptSync(String(password), salt, 64).toString("base64url");
  if (Buffer.byteLength(actual) !== Buffer.byteLength(expected)) return false;
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function findUserByLogin(username, phone = "") {
  const normalizedUsername = normalizeUsername(username);
  const normalizedPhone = normalizePhone(phone);
  return Object.values(database.users).find((user) => {
    const userUsername = normalizeUsername(user.username);
    const userPhone = normalizePhone(user.phone || user.externalId || "");
    return Boolean(userUsername && userUsername === normalizedUsername && (!normalizedPhone || userPhone === normalizedPhone));
  }) || null;
}

function hashSmsCode(code, codeId, phone) {
  return crypto.createHmac("sha256", config.cookieSecret).update(`${codeId}:${phone}:${code}`).digest("hex");
}

function secureCodeEqual(inputCode, item) {
  const expected = item.codeHash || "";
  const actual = hashSmsCode(inputCode, item.id, item.phone);
  if (!expected || Buffer.byteLength(expected) !== Buffer.byteLength(actual)) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}

function publicAccount(account) {
  return {
    id: account.id,
    name: account.name || "Пользователь",
    username: account.username || "",
    phone: account.phone || "",
    phoneVerified: Boolean(account.phoneVerified),
    city: account.city || "",
    balance: rubles(account.balance),
    verified: Boolean(account.verified),
    authProvider: account.authProvider,
    externalId: account.externalId,
    roles: Array.isArray(account.roles) ? account.roles : ["user"],
    supportOperator: isSupportAccount(account),
    moderator: isModeratorAccount(account),
    admin: isAdminAccount(account),
    communityAgreementVersion: account.communityAgreementVersion || "",
    communityAgreementAcceptedAt: account.communityAgreementAcceptedAt || "",
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

function adjustAccountBalance(account, delta) {
  if (!account?.id) return null;
  account.balance = rubles(account.balance) + Math.round(Number(delta || 0));
  if (account.balance < 0) account.balance = 0;
  account.updatedAt = new Date().toISOString();
  database.users[account.id] = account;
  return account;
}

function upsertUser(account) {
  const now = new Date().toISOString();
  const id = String(account.id || `${account.authProvider || "user"}:${account.externalId || randomToken(8)}`);
  const existing = database.users[id] || {};
  const roles = new Set([...(existing.roles || []), ...(account.roles || []), "user"]);
  if (config.admin.accountIds.includes(id)) roles.add("admin");
  const merged = {
    ...existing,
    ...account,
    id,
    roles: [...roles],
    createdAt: existing.createdAt || account.createdAt || now,
    updatedAt: now,
    lastLoginAt: account.lastLoginAt || existing.lastLoginAt || now,
  };
  database.users[id] = merged;
  persistDatabase();
  return merged;
}

function saveSession(sessionId, account, provider) {
  const now = Date.now();
  database.sessions[sessionId] = {
    accountId: account.id,
    provider,
    createdAt: new Date(now).toISOString(),
    expiresAt: now + SESSION_TTL_MS,
  };
  persistDatabase();
}

async function handleStart(req, res, provider) {
  cleanupStores();
  if (!isProviderConfigured(provider)) {
    const providerName = "Госуслуги/ЕСИА";
    return json(res, 503, {
      message: `${providerName} не настроен: заполните client ID, client secret и redirect URL в .env.`,
      configured: false,
    });
  }

  const body = await readJson(req);
  const state = randomToken();
  const redirectUri = providerConfig(provider).redirectUri || defaultRedirectUri(provider);
  const returnUrl = safeReturnUrl(body.returnUrl || `${config.publicBaseUrl}/?auth=${provider}&return=1`);

  stateStore.set(state, {
    provider,
    returnUrl,
    mode: body.mode || "register",
    accountId: body.accountId || "",
    expiresAt: Date.now() + STATE_TTL_MS,
  });

  const authorizationUrl = esiaAuthorizationUrl(state, redirectUri);

  return json(res, 200, { redirectUrl: authorizationUrl.toString(), configured: true });
}

function safeReturnUrl(value) {
  try {
    const url = new URL(value, config.publicBaseUrl);
    if (config.allowedOrigins.length && !config.allowedOrigins.includes(url.origin)) return `${config.publicBaseUrl}/?auth=return`;
    return url.toString();
  } catch {
    return `${config.publicBaseUrl}/?auth=return`;
  }
}

function esiaAuthorizationUrl(state, redirectUri) {
  const url = new URL(config.esia.authUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.esia.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", config.esia.scope);
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("timestamp", new Date().toISOString());
  return url;
}

async function handleCallback(req, res, provider, url) {
  cleanupStores();
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const stateData = stateStore.get(state || "");

  if (error) return redirect(res, callbackReturnUrl(stateData, provider, `Провайдер вернул ошибку: ${error}`));
  if (!code || !state || !stateData || stateData.provider !== provider) {
    return redirect(res, callbackReturnUrl(stateData, provider, "Некорректный или устаревший OAuth state."));
  }

  stateStore.delete(state);

  try {
    const redirectUri = providerConfig(provider).redirectUri || defaultRedirectUri(provider);
    const tokenData = await exchangeEsiaCode(code, redirectUri);
    const account = upsertUser({ ...(await fetchEsiaAccount(tokenData)), lastLoginAt: new Date().toISOString() });
    const sessionId = randomToken(32);
    saveSession(sessionId, account, provider);
    logAudit("auth_login", `Вход через ${provider}`, req, { actorAccountId: account.id, targetType: "user", targetId: account.id });
    const returnUrl = callbackReturnUrl(stateData, provider);
    return redirect(res, returnUrl, {
      "Set-Cookie": cookie("dr_auth_session", signedSessionId(sessionId), Math.floor(SESSION_TTL_MS / 1000)),
    });
  } catch (errorMessage) {
    return redirect(res, callbackReturnUrl(stateData, provider, String(errorMessage.message || errorMessage)));
  }
}

function callbackReturnUrl(stateData, provider, message = "") {
  const url = new URL(stateData?.returnUrl || `${config.publicBaseUrl}/`);
  url.searchParams.set("auth", provider);
  url.searchParams.set("return", "1");
  if (message) url.searchParams.set("auth_error", message.slice(0, 240));
  return url.toString();
}

async function exchangeEsiaCode(code, redirectUri) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: config.esia.clientId,
    client_secret: config.esia.clientSecret,
    redirect_uri: redirectUri,
  });
  return postForm(config.esia.tokenUrl, body, "ESIA token exchange failed");
}

async function fetchEsiaAccount(tokenData) {
  if (!config.esia.userInfoUrl) {
    throw new Error("Для ЕСИА нужно настроить ESIA_USERINFO_URL или полноценную серверную проверку подписи токена/JWKS. Непроверенный JWT не принимается.");
  }
  const payload = decodeJwtPayload(tokenData.id_token || tokenData.access_token || "") || {};
  let profile = payload;
  if (tokenData.access_token) {
    const response = await fetch(config.esia.userInfoUrl, {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, Accept: "application/json" },
    });
    if (!response.ok) throw new Error("ЕСИА не подтвердила профиль через userinfo endpoint.");
    profile = await response.json();
  }
  const externalId = String(profile.oid || profile.sub || profile.id || tokenData.oid || "");
  if (!externalId) throw new Error("ЕСИА не вернула идентификатор пользователя.");
  const name = [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(" ")
    || [profile.given_name, profile.family_name].filter(Boolean).join(" ")
    || "Пользователь Госуслуг";
  return publicAccount({
    id: `esia:${externalId}`,
    externalId,
    authProvider: "esia",
    name,
    username: profile.email || `esia_${externalId}`,
    phone: profile.mobile || profile.phone_number || "",
    phoneVerified: Boolean(profile.mobile || profile.phone_number),
    city: profile.address?.region || "",
    verified: true,
  });
}

async function postForm(url, body, errorPrefix) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok || data.error) {
    throw new Error(`${errorPrefix}: ${data.error_description || data.error || data.message || text || response.status}`);
  }
  return data;
}

function decodeJwtPayload(token) {
  const part = String(token || "").split(".")[1];
  if (!part) return null;
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function handleStatus(req, res, provider) {
  cleanupStores();
  const session = currentSession(req);
  const account = session?.accountId ? database.users[session.accountId] : null;
  if (!session || !account || account.authProvider !== provider) {
    return json(res, 401, { verified: false, message: "Активная OAuth-сессия не найдена." });
  }
  return json(res, 200, { verified: Boolean(account.verified), account: publicAccount(account) });
}

function handleCurrentUser(req, res) {
  const { session } = currentSessionWithId(req);
  const account = session?.accountId ? database.users[session.accountId] : null;
  if (!account) return json(res, 401, { authenticated: false, message: "Серверная сессия не найдена." });
  return json(res, 200, { authenticated: true, account: publicAccount(account), csrfToken: sessionCsrfToken(session) });
}

async function handleRegister(req, res) {
  const body = await readJson(req);
  const name = String(body.name || "").trim();
  const username = String(body.username || "").trim();
  const phone = normalizePhone(body.phone);
  const password = String(body.password || "");
  const city = String(body.city || "").trim();
  if (name.length < 2) return json(res, 400, { message: "Введите имя аккаунта." });
  if (normalizeUsername(username).length < 2) return json(res, 400, { message: "Введите юзернейм." });
  if (phone.length < 6) return json(res, 400, { message: "Введите телефон." });
  if (password.length < 4) return json(res, 400, { message: "Придумайте пароль минимум из 4 символов." });
  if (city.length < 2) return json(res, 400, { message: "Укажите город." });

  const targetId = phoneUserId(phone);
  const existingByUsername = Object.values(database.users).find((user) => normalizeUsername(user.username) === normalizeUsername(username) && user.id !== targetId);
  if (existingByUsername) return json(res, 409, { message: "Такой юзернейм уже зарегистрирован." });
  const existingByPhone = Object.values(database.users).find((user) => normalizePhone(user.phone || user.externalId || "") === phone);
  if (existingByPhone?.passwordHash && existingByPhone.id !== targetId) return json(res, 409, { message: "Этот телефон уже привязан к аккаунту. Войдите в аккаунт." });
  if (existingByPhone?.passwordHash && existingByPhone.id === targetId) return json(res, 409, { message: "Этот телефон уже зарегистрирован. Войдите в аккаунт." });

  const now = new Date().toISOString();
  const account = upsertUser({
    id: targetId,
    authProvider: "local",
    externalId: phone,
    name,
    username,
    phone,
    phoneVerified: Boolean(body.phoneVerified),
    verified: false,
    city,
    passwordHash: passwordHash(password),
    communityAgreementVersion: String(body.communityAgreementVersion || ""),
    communityAgreementAcceptedAt: String(body.communityAgreementAcceptedAt || ""),
    lastLoginAt: now,
  });
  const sessionId = randomToken(32);
  saveSession(sessionId, account, "local");
  logAudit("account_registered", `${username} · ${phoneMask(phone)}`, req, { actorAccountId: account.id, targetType: "user", targetId: account.id });
  return json(res, 201, { authenticated: true, account: publicAccount(account), csrfToken: sessionCsrfToken(database.sessions[sessionId]) }, {
    "Set-Cookie": cookie("dr_auth_session", signedSessionId(sessionId), Math.floor(SESSION_TTL_MS / 1000)),
  });
}

async function handleLogin(req, res) {
  const body = await readJson(req);
  const username = String(body.username || "").trim();
  const phone = normalizePhone(body.phone);
  const password = String(body.password || "");
  if (!username || !phone || !password) return json(res, 400, { message: "Введите юзернейм, телефон и пароль." });
  const account = findUserByLogin(username, phone);
  if (!account || !verifyPassword(password, account.passwordHash)) {
    logAudit("login_failed", `${username || "unknown"} · ${phoneMask(phone)}`, req, { targetType: "user" });
    return json(res, 401, { message: "Неверный юзернейм, телефон или пароль." });
  }
  account.lastLoginAt = new Date().toISOString();
  account.updatedAt = account.updatedAt || account.lastLoginAt;
  const sessionId = randomToken(32);
  saveSession(sessionId, account, "local");
  persistDatabase();
  logAudit("account_login", account.username || account.name, req, { actorAccountId: account.id, targetType: "user", targetId: account.id });
  return json(res, 200, { authenticated: true, account: publicAccount(account), csrfToken: sessionCsrfToken(database.sessions[sessionId]) }, {
    "Set-Cookie": cookie("dr_auth_session", signedSessionId(sessionId), Math.floor(SESSION_TTL_MS / 1000)),
  });
}

function handleLogout(req, res) {
  const sessionId = verifySignedSessionId(parseCookies(req).dr_auth_session);
  const accountId = database.sessions[sessionId]?.accountId || "";
  if (sessionId) delete database.sessions[sessionId];
  persistDatabase();
  logAudit("account_logout", accountId || "anonymous", req, { actorAccountId: accountId || "system", targetType: "user", targetId: accountId });
  return json(res, 200, { authenticated: false }, {
    "Set-Cookie": cookie("dr_auth_session", "", 0),
  });
}

async function handleUpdateAccount(req, res) {
  const session = currentSession(req);
  const account = session?.accountId ? database.users[session.accountId] : null;
  if (!session || !account) return json(res, 401, { message: "Войдите в аккаунт, чтобы обновить профиль." });

  const body = await readJson(req);
  const updates = {};
  if (Object.prototype.hasOwnProperty.call(body, "name")) {
    const name = String(body.name || "").trim();
    if (name.length < 2) return json(res, 400, { message: "Введите имя аккаунта." });
    updates.name = name;
  }
  if (Object.prototype.hasOwnProperty.call(body, "city")) {
    const city = String(body.city || "").trim();
    if (city.length < 2) return json(res, 400, { message: "Укажите город." });
    updates.city = city;
  }
  if (Object.prototype.hasOwnProperty.call(body, "username")) {
    const username = String(body.username || "").trim();
    if (normalizeUsername(username).length < 2) return json(res, 400, { message: "Введите юзернейм." });
    const taken = Object.values(database.users).find((user) => user.id !== account.id && normalizeUsername(user.username) === normalizeUsername(username));
    if (taken) return json(res, 409, { message: "Такой юзернейм уже зарегистрирован." });
    updates.username = username;
  }
  if (Object.prototype.hasOwnProperty.call(body, "password") && String(body.password || "")) {
    const password = String(body.password || "");
    if (password.length < 4) return json(res, 400, { message: "Придумайте пароль минимум из 4 символов." });
    updates.passwordHash = passwordHash(password);
  }
  if (Object.prototype.hasOwnProperty.call(body, "communityAgreementVersion")) updates.communityAgreementVersion = String(body.communityAgreementVersion || "");
  if (Object.prototype.hasOwnProperty.call(body, "communityAgreementAcceptedAt")) updates.communityAgreementAcceptedAt = String(body.communityAgreementAcceptedAt || "");

  Object.assign(account, updates, { updatedAt: new Date().toISOString() });
  persistDatabase();
  logAudit("account_updated", account.username || account.name, req, { actorAccountId: account.id, targetType: "user", targetId: account.id });
  return json(res, 200, { authenticated: true, account: publicAccount(account), csrfToken: sessionCsrfToken(session) });
}

function handleDeleteAccount(req, res) {
  const session = currentSession(req);
  const account = session?.accountId ? database.users[session.accountId] : null;
  if (!session || !account) return json(res, 401, { message: "Войдите в аккаунт, чтобы удалить его." });
  for (const [id, item] of Object.entries(database.sessions)) {
    if (item.accountId === account.id) delete database.sessions[id];
  }
  delete database.users[account.id];
  logAudit("account_deleted", account.username || account.name, req, { actorAccountId: account.id, targetType: "user", targetId: account.id });
  persistDatabase();
  return json(res, 200, { deleted: true }, {
    "Set-Cookie": cookie("dr_auth_session", "", 0),
  });
}

function rubles(value) {
  return Math.max(0, Math.round(Number(value || 0)));
}

function paymentProviderStatus() {
  const configured = config.payments.provider === "mock"
    ? true
    : config.payments.provider === "yookassa"
      ? Boolean(config.payments.yookassaShopId && config.payments.yookassaSecretKey)
      : Boolean(config.payments.merchantId && (config.payments.terminalKey || config.payments.password));
  return {
    provider: config.payments.provider,
    primaryBank: config.payments.primaryBank,
    configured,
    mode: config.payments.provider === "mock" ? "mock" : configured ? "production-ready" : "not-configured",
  };
}

function normalizePaymentStatus(provider, status, paid = false) {
  const value = String(status || "").toLowerCase();
  if (provider === "yookassa") {
    if (paid || value === "succeeded") return "paid";
    if (value === "canceled") return "canceled";
    if (value === "waiting_for_capture") return "pending";
    return value || "pending";
  }
  return value || "pending";
}

function paymentReturnUrl(paymentId) {
  return `${config.publicBaseUrl}/?payment=${encodeURIComponent(paymentId)}&provider=${encodeURIComponent(config.payments.provider)}`;
}

async function createYooKassaSbpPayment(payment) {
  const response = await fetch(`${config.payments.yookassaApiUrl}/payments`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.payments.yookassaShopId}:${config.payments.yookassaSecretKey}`).toString("base64")}`,
      "Content-Type": "application/json",
      "Idempotence-Key": payment.id,
    },
    body: JSON.stringify({
      amount: { value: `${payment.amount}.00`, currency: "RUB" },
      payment_method_data: { type: "sbp" },
      confirmation: { type: "redirect", return_url: paymentReturnUrl(payment.id) },
      capture: true,
      description: `Пополнение баланса Дела рядом ${payment.id}`.slice(0, 128),
      metadata: {
        localPaymentId: payment.id,
        accountId: payment.accountId,
        purpose: payment.purpose,
        taskPublicId: payment.taskPublicId || "",
      },
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.description || data?.message || `YooKassa error ${response.status}`;
    const error = new Error(message);
    error.statusCode = response.status >= 500 ? 502 : 400;
    error.providerResponse = data;
    throw error;
  }
  return data;
}

function publicPayment(payment) {
  return {
    id: payment.id,
    provider: payment.provider,
    bank: payment.bank,
    amount: payment.amount,
    status: payment.status,
    purpose: payment.purpose,
    taskPublicId: payment.taskPublicId,
    paymentUrl: payment.paymentUrl,
    qrPayload: payment.qrPayload,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
    demo: payment.demo,
  };
}

function publicPayout(payout) {
  return {
    id: payout.id,
    provider: payout.provider,
    bank: payout.bank,
    amount: payout.amount,
    status: payout.status,
    destination: payout.destination,
    createdAt: payout.createdAt,
    updatedAt: payout.updatedAt,
    demo: payout.demo,
  };
}

function transactionAmount(value) {
  return Math.round(Number(value || 0));
}

function publicTransaction(transaction) {
  return {
    id: transaction.id,
    type: transaction.type || "system",
    title: transaction.title || "Операция",
    amount: transactionAmount(transaction.amount),
    status: transaction.status || "confirmed",
    taskPublicId: transaction.taskPublicId || "",
    referenceType: transaction.referenceType || "",
    referenceId: transaction.referenceId || "",
    createdAt: transaction.createdAt,
  };
}

function accountTransactions(accountId, limit = 100) {
  return Object.values(database.transactions)
    .filter((transaction) => String(transaction.accountId || "") === String(accountId || ""))
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, limit)
    .map(publicTransaction);
}

function createTransaction({ accountId, type, title, amount, taskPublicId = "", status = "confirmed", referenceType = "", referenceId = "", createdAt = "" }) {
  if (!accountId) return null;
  const referenceKeyExists = referenceType && referenceId;
  const existing = referenceKeyExists
    ? Object.values(database.transactions).find((transaction) => (
      String(transaction.accountId || "") === String(accountId)
      && String(transaction.referenceType || "") === String(referenceType)
      && String(transaction.referenceId || "") === String(referenceId)
    ))
    : null;
  const now = createdAt || new Date().toISOString();
  const transaction = existing || { id: `tx_${randomToken(12)}`, accountId, createdAt: now };
  Object.assign(transaction, {
    accountId,
    type: type || "system",
    title: title || "Операция",
    amount: transactionAmount(amount),
    status: status || "confirmed",
    taskPublicId: taskPublicId || "",
    referenceType: referenceType || "",
    referenceId: referenceId || "",
  });
  database.transactions[transaction.id] = transaction;
  if (!existing) broadcastEvent("transaction.created", { updated: true });
  return transaction;
}

function publicTask(task) {
  return JSON.parse(JSON.stringify(task));
}

function canAccountReadFullTask(task, account) {
  if (!task || !account) return false;
  if (isModeratorAccount(account)) return true;
  return taskParticipantIds(task).includes(String(account.id));
}

function canAccountSeeTaskInList(task, account) {
  if (String(task?.moderationStatus || "approved") === "approved") return true;
  return canAccountReadFullTask(task, account);
}

function publicFeedTask(task) {
  const full = publicTask(task);
  delete full.messages;
  delete full.proofPhotos;
  delete full.customerAccountId;
  delete full.workerAccountId;
  delete full.escrowHeldAt;
  delete full.workerPaidAt;
  delete full.paidOut;
  delete full.customerAcceptedSoundPlayed;
  full.hasPrivateDetails = true;
  full.messages = [];
  full.proofPhotos = [];
  return full;
}

function visibleTaskForAccount(task, account) {
  return canAccountReadFullTask(task, account) ? publicTask(task) : publicFeedTask(task);
}

function findTask(taskId) {
  const id = String(taskId || "");
  return database.tasks[id] || Object.values(database.tasks).find((task) => task.publicId === id) || null;
}

function taskParticipantIds(task) {
  return [task.customerAccountId, task.workerAccountId, task.customer?.id, task.worker?.id].filter(Boolean).map(String);
}

function isTaskCustomer(task, account) {
  return Boolean(task && account?.id && String(task.customerAccountId || task.customer?.id || "") === String(account.id));
}

function isTaskWorker(task, account) {
  return Boolean(task && account?.id && String(task.workerAccountId || task.worker?.id || "") === String(account.id));
}

function requireAccount(req, res) {
  const account = currentAccount(req);
  if (!account) {
    json(res, 401, { message: "Нужна серверная сессия. Подтвердите телефон или войдите через ЕСИА." });
    return null;
  }
  return account;
}

function handleTransactions(req, res, url) {
  if (req.method !== "GET") return notFound(res);
  const account = requireAccount(req, res);
  if (!account) return;
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 40)));
  return json(res, 200, { transactions: accountTransactions(account.id, limit) });
}

function publicSupportMessage(message) {
  return {
    id: message.id || randomToken(10),
    author: String(message.author || "Поддержка").slice(0, 120),
    role: String(message.role || "bot").slice(0, 40),
    text: String(message.text || "").slice(0, 2000),
    time: message.time || message.createdAt || new Date().toISOString(),
  };
}

function publicSupportTicket(ticket) {
  return {
    id: ticket.id,
    publicId: ticket.publicId,
    status: ticket.status || "bot",
    reason: ticket.reason || "Вопрос пользователя",
    taskPublicId: ticket.taskPublicId || "",
    createdByAccountId: ticket.createdByAccountId || "",
    createdByKey: ticket.createdByKey || "",
    createdBy: ticket.createdBy || "Пользователь",
    unreadForUser: Number(ticket.unreadForUser || 0),
    unreadForSupport: Number(ticket.unreadForSupport || 0),
    riskFlagsCount: Array.isArray(ticket.riskFlags) ? ticket.riskFlags.length : 0,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt || ticket.createdAt,
    messages: Array.isArray(ticket.messages) ? ticket.messages.map(publicSupportMessage) : [],
  };
}

function nextSupportPublicId() {
  const used = new Set(Object.values(database.supportTickets).map((ticket) => ticket.publicId).filter(Boolean));
  let number = Object.keys(database.supportTickets).length + 1;
  let id = "";
  do {
    id = `SUP-${String(number).padStart(6, "0")}`;
    number += 1;
  } while (used.has(id));
  return id;
}

function canAccountAccessSupportTicket(ticket, account) {
  if (!ticket || !account) return false;
  if (isSupportAccount(account)) return true;
  return String(ticket.createdByAccountId || "") === String(account.id || "");
}

function visibleSupportTicketsFor(account) {
  return Object.values(database.supportTickets)
    .filter((ticket) => canAccountAccessSupportTicket(ticket, account))
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
    .map(publicSupportTicket);
}

function findSupportTicket(ticketId) {
  const id = String(ticketId || "");
  return database.supportTickets[id] || Object.values(database.supportTickets).find((ticket) => ticket.publicId === id) || null;
}

function createSupportTicket(account, input = {}) {
  const now = new Date().toISOString();
  const ticket = {
    id: String(input.id || `sup_${randomToken(12)}`),
    publicId: input.publicId || nextSupportPublicId(),
    status: input.status || "bot",
    reason: String(input.reason || "Вопрос пользователя").slice(0, 240),
    taskPublicId: String(input.taskPublicId || "").slice(0, 80),
    createdByAccountId: account.id,
    createdByKey: String(input.createdByKey || ""),
    createdBy: String(account.name || account.username || "Пользователь").slice(0, 120),
    unreadForUser: 0,
    unreadForSupport: 0,
    createdAt: now,
    updatedAt: now,
    messages: [publicSupportMessage({
      author: "Бот поддержки",
      role: "bot",
      text: "Здравствуйте! Опишите вопрос, а я предложу быстрые варианты решения. Если не поможет — передам оператору.",
      time: now,
    })],
  };
  database.supportTickets[ticket.id] = ticket;
  return ticket;
}

function handleSupportTickets(req, res) {
  const account = requireAccount(req, res);
  if (!account) return;
  if (req.method === "GET") return json(res, 200, { tickets: visibleSupportTicketsFor(account) });
  if (req.method !== "POST") return notFound(res);
  if (!checkRateLimit(req, "support")) return json(res, 429, { message: "Слишком много обращений в поддержку. Попробуйте позже." }, { "Retry-After": "60" });
  return readJson(req).then((body) => {
    const ticket = createSupportTicket(account, body.ticket || body);
    persistDatabase();
    logAudit("support_ticket_created", ticket.publicId, req, { targetType: "support_ticket", targetId: ticket.id });
    broadcastEvent("support.updated", { updated: true });
    return json(res, 201, { ticket: publicSupportTicket(ticket), tickets: visibleSupportTicketsFor(account) });
  });
}

async function handleSupportTicket(req, res, ticketId) {
  const account = requireAccount(req, res);
  if (!account) return;
  const ticket = findSupportTicket(ticketId);
  if (!ticket) return json(res, 404, { message: "Заявка поддержки не найдена." });
  if (!canAccountAccessSupportTicket(ticket, account)) return json(res, 403, { message: "Эта заявка доступна только автору и поддержке." });

  if (req.method === "GET") return json(res, 200, { ticket: publicSupportTicket(ticket) });
  if (req.method !== "PATCH") return notFound(res);
  if (!checkRateLimit(req, "support")) return json(res, 429, { message: "Слишком много обновлений заявки. Попробуйте позже." }, { "Retry-After": "60" });

  const body = await readJson(req);
  const now = new Date().toISOString();
  if (Object.prototype.hasOwnProperty.call(body, "taskPublicId")) ticket.taskPublicId = String(body.taskPublicId || "").slice(0, 80);
  if (Object.prototype.hasOwnProperty.call(body, "reason")) ticket.reason = String(body.reason || ticket.reason || "Вопрос пользователя").slice(0, 240);
  if (Object.prototype.hasOwnProperty.call(body, "status")) {
    const nextStatus = String(body.status || ticket.status || "bot");
    const previousStatus = ticket.status || "bot";
    if (nextStatus === "operator" || isSupportAccount(account)) ticket.status = nextStatus.slice(0, 40);
    if (previousStatus !== "operator" && ticket.status === "operator") {
      ticket.messages = Array.isArray(ticket.messages) ? ticket.messages : [];
      ticket.messages.push(publicSupportMessage({
        author: "Бот поддержки",
        role: "bot",
        text: "Я передал обращение живой поддержке. Оператор увидит заявку, ID задания и переписку.",
        time: now,
      }));
      ticket.unreadForSupport = Number(ticket.unreadForSupport || 0) + 1;
    }
  }
  if (Object.prototype.hasOwnProperty.call(body, "unreadForUser") && isSupportAccount(account)) ticket.unreadForUser = Math.max(0, Number(body.unreadForUser || 0));
  if (Object.prototype.hasOwnProperty.call(body, "unreadForSupport")) ticket.unreadForSupport = Math.max(0, Number(body.unreadForSupport || 0));
  ticket.updatedAt = now;
  database.supportTickets[ticket.id] = ticket;
  persistDatabase();
  logAudit("support_ticket_updated", ticket.publicId, req, { targetType: "support_ticket", targetId: ticket.id });
  broadcastEvent("support.updated", { updated: true });
  return json(res, 200, { ticket: publicSupportTicket(ticket), tickets: visibleSupportTicketsFor(account) });
}

async function handleSupportTicketMessages(req, res, ticketId) {
  if (req.method !== "POST") return notFound(res);
  if (!checkRateLimit(req, "support")) return json(res, 429, { message: "Слишком много сообщений в поддержку. Попробуйте позже." }, { "Retry-After": "60" });
  const account = requireAccount(req, res);
  if (!account) return;
  const ticket = findSupportTicket(ticketId);
  if (!ticket) return json(res, 404, { message: "Заявка поддержки не найдена." });
  if (!canAccountAccessSupportTicket(ticket, account)) return json(res, 403, { message: "Эта заявка доступна только автору и поддержке." });

  const body = await readJson(req);
  const incoming = body.message || body;
  const text = String(incoming.text || "").trim().slice(0, 2000);
  if (!text) return json(res, 400, { message: "Введите сообщение." });
  const risk = classifyMessageRisk(text);
  const supportMode = isSupportAccount(account);
  const now = new Date().toISOString();
  const message = publicSupportMessage({
    id: incoming.id || randomToken(10),
    author: supportMode ? "Поддержка Дела Рядом" : String(account.name || account.username || "Пользователь").split(/\s+/)[0],
    role: supportMode ? "support" : "user",
    text,
    time: now,
  });
  ticket.messages = Array.isArray(ticket.messages) ? ticket.messages : [];
  ticket.messages.push(message);
  if (risk.risky) {
    ticket.riskFlags = Array.isArray(ticket.riskFlags) ? ticket.riskFlags : [];
    ticket.riskFlags.push({ codes: risk.codes, messageId: message.id, createdAt: now, accountId: account.id });
    ticket.status = "operator";
  }
  if (supportMode) ticket.unreadForUser = Number(ticket.unreadForUser || 0) + 1;
  else ticket.unreadForSupport = Number(ticket.unreadForSupport || 0) + 1;
  if (body.escalate || ticket.status === "operator") ticket.status = "operator";
  if (!supportMode && ticket.status !== "operator" && body.botReply) {
    ticket.messages.push(publicSupportMessage({ author: "Бот поддержки", role: "bot", text: String(body.botReply).slice(0, 2000), time: now }));
  }
  ticket.updatedAt = now;
  database.supportTickets[ticket.id] = ticket;
  persistDatabase();
  logAudit("support_message", ticket.publicId, req, { targetType: "support_ticket", targetId: ticket.id });
  if (risk.risky) logAudit("support_message_risk_flag", `${ticket.publicId} · ${risk.codes.join(",")}`, req, { targetType: "support_ticket", targetId: ticket.id });
  broadcastEvent("support.updated", { updated: true });
  return json(res, 201, { message, ticket: publicSupportTicket(ticket), tickets: visibleSupportTicketsFor(account) });
}

function canAccountMessageTask(task, account, role) {
  if (!task) return false;
  if (account && isAdminAccount(account)) return true;
  if (role === "support") return false;
  const accountId = account?.id || "";
  if (!accountId) return false;
  return taskParticipantIds(task).includes(accountId);
}

function publicTaskMessage(message) {
  return {
    id: message.id,
    author: message.author || "Пользователь",
    role: message.role || "user",
    text: message.text || "",
    photo: message.photo || "",
    photoFileId: message.photoFileId || "",
    photoUrl: message.photoFileId ? `${config.publicBaseUrl}/api/files/${encodeURIComponent(message.photoFileId)}/download` : (message.photoUrl || ""),
    time: message.time || message.createdAt,
    createdAt: message.createdAt || message.time,
  };
}

function stripInlineTaskFiles(task) {
  const next = { ...task };
  next.messages = Array.isArray(next.messages)
    ? next.messages.map((message) => {
      const copy = { ...message };
      if (String(copy.photo || "").startsWith("data:")) copy.photo = "";
      return copy;
    })
    : [];
  next.proofPhotos = Array.isArray(next.proofPhotos)
    ? next.proofPhotos.map((photo) => {
      const copy = { ...photo };
      delete copy.data;
      if (String(copy.url || "").startsWith("data:")) copy.url = "";
      return copy;
    })
    : [];
  return next;
}

function taskPublicNumber(publicId) {
  const match = String(publicId || "").match(/^DR-(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function nextTaskPublicId() {
  const used = new Set(Object.values(database.tasks).map((task) => task.publicId).filter(Boolean));
  let number = Number(database.counters.taskNumber || 0) + 1;
  let id = "";
  do {
    id = `DR-${String(number).padStart(6, "0")}`;
    number += 1;
  } while (used.has(id));
  database.counters.taskNumber = number - 1;
  return id;
}

function taskAmount(task) {
  return rubles(task?.escrowAmount ?? task?.price ?? 0);
}

function taskEscrowTotal(task) {
  return taskAmount(task) + rubles(task?.purchaseBudget);
}

function appendTaskMessage(task, message) {
  task.messages = Array.isArray(task.messages) ? task.messages : [];
  task.messages.push(publicTaskMessage({
    id: message.id || randomToken(10),
    author: message.author || "Система",
    role: message.role || "system",
    text: message.text || "",
    photo: message.photo || "",
    photoFileId: message.photoFileId || "",
    photoUrl: message.photoUrl || "",
    time: message.time || new Date().toISOString(),
    createdAt: message.createdAt || new Date().toISOString(),
  }));
}

function taskTimestamp(task) {
  return Date.parse(task.updatedAt || task.createdAt || task.acceptedAt || 0) || 0;
}

function taskStatusRank(status) {
  return {
    open: 0,
    accepted: 1,
    progress: 2,
    revision: 3,
    review: 4,
    done: 5,
    rejected: 5,
  }[status] ?? 0;
}

function upsertTask(task) {
  const now = new Date().toISOString();
  task = stripInlineTaskFiles(task);
  const id = String(task.id || randomToken(12));
  const existing = database.tasks[id];
  if (existing && taskTimestamp(task) < taskTimestamp(existing)) {
    if (taskStatusRank(task.status) <= taskStatusRank(existing.status)) return existing;
    task = {
      ...existing,
      status: task.status,
      worker: task.worker ?? existing.worker,
      workerAccountId: task.workerAccountId ?? existing.workerAccountId,
      workerDeposit: task.workerDeposit ?? existing.workerDeposit,
      acceptedAt: task.acceptedAt || existing.acceptedAt,
      startedAt: task.startedAt || existing.startedAt,
      dueAt: task.dueAt || existing.dueAt,
      updatedAt: task.updatedAt || existing.updatedAt,
    };
  }
  const publicIdTaken = task.publicId && Object.values(database.tasks).some((item) => item.id !== id && item.publicId === task.publicId);
  const merged = {
    ...(existing || {}),
    ...task,
    id,
    publicId: publicIdTaken ? nextTaskPublicId() : task.publicId || existing?.publicId || nextTaskPublicId(),
    createdAt: task.createdAt || existing?.createdAt || now,
    updatedAt: now,
  };
  database.tasks[id] = merged;
  persistDatabase();
  return merged;
}

async function handleTasks(req, res) {
  if (req.method === "GET") {
    const account = currentAccount(req);
    const tasks = Object.values(database.tasks).filter((task) => canAccountSeeTaskInList(task, account)).sort((a, b) => taskTimestamp(b) - taskTimestamp(a)).map((task) => visibleTaskForAccount(task, account));
    return json(res, 200, { tasks, updatedAt: new Date().toISOString() });
  }

  if (req.method === "POST") {
    if (!checkRateLimit(req, "task-actions")) return json(res, 429, { message: "Слишком много действий с заданиями. Попробуйте позже." }, { "Retry-After": "60" });
    const account = requireAccount(req, res);
    if (!account) return;
    const body = await readJson(req);
    const incoming = body.task || body;
    if (!incoming || typeof incoming !== "object") return json(res, 400, { message: "Передайте данные задания." });
    if (!String(incoming.title || "").trim()) return json(res, 400, { message: "У задания должно быть название." });
    const existing = incoming.id || incoming.publicId ? findTask(incoming.id || incoming.publicId) : null;
    if (existing) {
      if (!isTaskCustomer(existing, account) && !isAdminAccount(account)) return json(res, 403, { message: "Редактировать задание может только заказчик или администратор." });
      const protectedFieldsChanged = ["status", "workerAccountId", "paidOut", "dispute", "disputeStatus"].some((field) => {
        if (incoming[field] === undefined) return false;
        return JSON.stringify(incoming[field] ?? null) !== JSON.stringify(existing[field] ?? null);
      });
      if (protectedFieldsChanged) {
        return json(res, 409, { message: "Статус, исполнитель, выплаты и споры меняются только через серверные action endpoints." });
      }
    }
    if (!existing) {
      incoming.customerAccountId = account.id;
      incoming.customer = incoming.customer || account.name || account.username || "Пользователь";
      incoming.moderationStatus = isModeratorAccount(account) ? (incoming.moderationStatus || "approved") : "pending";
      incoming.moderationNote = incoming.moderationStatus === "approved" ? "Опубликовано модератором" : "Ждёт проверки модератором";
      const escrowTotal = taskEscrowTotal(incoming);
      if (rubles(account.balance) < escrowTotal) return json(res, 409, { message: `На балансе недостаточно средств для эскроу ${escrowTotal} ₽.` });
      adjustAccountBalance(account, -escrowTotal);
      incoming.escrowHeldAt = new Date().toISOString();
    }
    const task = upsertTask(incoming);
    if (!existing && task.escrowHeldAt) {
      createTransaction({
        accountId: account.id,
        type: "escrow",
        title: "Эскроу по заданию",
        amount: -taskEscrowTotal(task),
        taskPublicId: task.publicId,
        status: "held",
        referenceType: "task_escrow",
        referenceId: task.id,
        createdAt: task.escrowHeldAt,
      });
    }
    logAudit("task_upsert", `Сохранено задание ${task.publicId || task.id}`, req, { targetType: "task", targetId: task.id });
    broadcastEvent("task.updated", { task: publicFeedTask(task) });
    return json(res, 201, { task: visibleTaskForAccount(task, account), tasks: Object.values(database.tasks).map((item) => visibleTaskForAccount(item, account)), account: publicAccount(account), transactions: accountTransactions(account.id, 40) });
  }

  return notFound(res);
}

async function handleTaskAction(req, res, taskId, action) {
  if (req.method !== "POST") return notFound(res);
  if (!checkRateLimit(req, "task-actions")) return json(res, 429, { message: "Слишком много действий с заданиями. Попробуйте позже." }, { "Retry-After": "60" });
  const task = findTask(taskId);
  if (!task) return json(res, 404, { message: "Задание не найдено." });

  const account = requireAccount(req, res);
  if (!account) return;

  const body = await readJson(req);
  const now = new Date().toISOString();
  const isAdmin = isAdminAccount(account);
  const isCustomer = isTaskCustomer(task, account);
  const isWorker = isTaskWorker(task, account);
  const actor = String(account.name || account.username || "Пользователь").slice(0, 120);
  const title = task.publicId || task.id;
  let auditAction = `task_${action}`;
  let auditDetails = `${title}`;

  if (action === "accept") {
    if (task.status !== "open") return json(res, 409, { message: "Задание уже не открыто." });
    if (isCustomer) return json(res, 403, { message: "Нельзя принять своё задание." });
    const workerDeposit = rubles(task.workerDeposit || TASK_WORKER_DEPOSIT);
    if (rubles(account.balance) < workerDeposit) return json(res, 409, { message: `Для отклика нужен страховой залог ${workerDeposit} ₽ на балансе.` });
    task.status = "accepted";
    task.worker = actor;
    task.workerAccountId = account.id;
    task.workerDeposit = workerDeposit;
    adjustAccountBalance(account, -workerDeposit);
    task.acceptedAt = now;
    createTransaction({
      accountId: account.id,
      type: "deposit",
      title: "Страховой залог исполнителя",
      amount: -workerDeposit,
      taskPublicId: task.publicId,
      status: "held",
      referenceType: "task_deposit",
      referenceId: task.id,
      createdAt: now,
    });
    task.dueAt = task.dueAt || new Date(Date.now() + Number(task.minutes || 30) * 60000).toISOString();
    task.customerAcceptedSoundPlayed = false;
    appendTaskMessage(task, {
      author: actor,
      role: "worker",
      text: `Здравствуйте! Беру задание в работу. Залог ${task.workerDeposit} ₽ заморожен.`,
      createdAt: now,
    });
    auditAction = "task_accept";
    auditDetails = `${title} · исполнитель ${actor}`;
  } else if (action === "start") {
    if (!isWorker) return json(res, 403, { message: "Начать может только назначенный исполнитель." });
    if (!["accepted", "revision"].includes(task.status)) return json(res, 409, { message: "Задание нельзя начать из текущего статуса." });
    task.status = "progress";
    task.startedAt = task.startedAt || now;
    task.dueAt = task.dueAt || new Date(Date.now() + Number(task.minutes || 30) * 60000).toISOString();
    appendTaskMessage(task, { author: actor, role: "worker", text: "Начал выполнение задания.", createdAt: now });
    auditAction = "task_start";
  } else if (action === "review") {
    if (!isWorker) return json(res, 403, { message: "На проверку может отправить только назначенный исполнитель." });
    if (!["progress", "revision", "accepted"].includes(task.status)) return json(res, 409, { message: "Сейчас нельзя отправить задание на проверку." });
    if (task.category === "Фотозадание" && !task.hasPhoto) return json(res, 400, { message: "Сначала добавьте фотоотчёт." });
    task.status = "review";
    task.checklist = { location: false, photo: false, comment: false, ...(task.checklist || {}), comment: true };
    appendTaskMessage(task, { author: actor, role: "worker", text: "Отправил результат на проверку.", createdAt: now });
    auditAction = "task_review";
  } else if (action === "revision") {
    if (!isCustomer) return json(res, 403, { message: "Доработку может запросить только заказчик задания." });
    if (task.status !== "review") return json(res, 409, { message: "Доработку можно запросить только на этапе проверки." });
    const comment = String(body.comment || body.text || "нужно улучшить результат").trim().slice(0, 1000);
    task.status = "revision";
    appendTaskMessage(task, { author: actor, role: "customer", text: `На доработку: ${comment || "нужно улучшить результат"}`, createdAt: now });
    auditAction = "task_revision";
    auditDetails = `${title} · ${comment || "без комментария"}`;
  } else if (action === "done") {
    if (!isCustomer) return json(res, 403, { message: "Принять работу может только заказчик задания." });
    if (task.dispute || task.disputeStatus === "open") return json(res, 409, { message: "Выплата заблокирована арбитражем до решения поддержки." });
    if (task.status === "done") return json(res, 409, { message: "Задание уже принято." });
    if (!task.paidOut) task.paidOut = true;
    task.status = "done";
    task.completedAt = now;
    const workerAccount = database.users[task.workerAccountId || ""];
    if (workerAccount && !task.workerPaidAt) {
      adjustAccountBalance(workerAccount, taskAmount(task) + rubles(task.workerDeposit));
      task.workerPaidAt = now;
      createTransaction({
        accountId: workerAccount.id,
        type: "payout",
        title: "Выплата по заданию",
        amount: taskAmount(task) + rubles(task.workerDeposit),
        taskPublicId: task.publicId,
        status: "released",
        referenceType: "task_payout",
        referenceId: task.id,
        createdAt: now,
      });
    }
    appendTaskMessage(task, { author: actor, role: "customer", text: "Работа принята. Можно поставить оценку 1–5★", createdAt: now });
    auditAction = "task_done";
    auditDetails = `${title} · выплата ${taskAmount(task) + rubles(task.workerDeposit)} ₽`;
  } else if (action === "dispute") {
    if (!isCustomer && !isWorker && !isAdmin) return json(res, 403, { message: "Открыть спор могут только участники задания." });
    if (task.dispute || task.disputeStatus === "open") return json(res, 409, { message: "Спор уже открыт." });
    task.dispute = true;
    task.disputeStatus = "open";
    task.disputeOpenedAt = now;
    const reason = String(body.reason || body.comment || "").trim().slice(0, 1000);
    appendTaskMessage(task, { author: "Арбитраж", role: "support", text: reason ? `Спор открыт: ${reason}` : "Спор открыт. Автоматическая выплата заблокирована до решения поддержки.", createdAt: now });
    auditAction = "task_dispute";
    auditDetails = `${title} · ${reason || actor}`;
  } else if (action === "resolve") {
    if (!isAdmin) return json(res, 403, { message: "Решить спор может только администратор." });
    if (!task.dispute && task.disputeStatus !== "open") return json(res, 409, { message: "Открытого спора нет." });
    const result = String(body.result || body.resolution || "").toLowerCase();
    if (!["customer", "worker"].includes(result)) return json(res, 400, { message: "Передайте result: customer или worker." });
    task.dispute = false;
    task.disputeStatus = "resolved";
    task.disputeResolution = result === "worker" ? "Решено в пользу исполнителя" : "Решено в пользу заказчика";
    task.disputeResolvedAt = now;
    appendTaskMessage(task, { author: "Арбитраж", role: "support", text: task.disputeResolution, createdAt: now });
    auditAction = "task_resolve";
    auditDetails = `${title} · ${task.disputeResolution}`;
  } else {
    return json(res, 404, { message: "Действие задания не найдено." });
  }

  task.updatedAt = now;
  database.tasks[task.id] = task;
  persistDatabase();
  logAudit(auditAction, auditDetails, req, { targetType: "task", targetId: task.id });
  broadcastEvent("task.updated", { task: publicFeedTask(task), action });
  return json(res, 200, { task: visibleTaskForAccount(task, account), action, account: publicAccount(account), transactions: accountTransactions(account.id, 40) });
}

async function handleTaskMessages(req, res, taskId) {
  const task = findTask(taskId);
  if (!task) return json(res, 404, { message: "Задание не найдено." });
  const account = currentAccount(req);

  if (req.method === "GET") {
    if (!canAccountReadFullTask(task, account)) return json(res, 403, { message: "Чат задания доступен только участникам и поддержке." });
    return json(res, 200, { messages: (task.messages || []).map(publicTaskMessage), task: visibleTaskForAccount(task, account) });
  }

  if (req.method !== "POST") return notFound(res);
  if (!checkRateLimit(req, "task-actions")) return json(res, 429, { message: "Слишком много сообщений в задании. Попробуйте позже." }, { "Retry-After": "60" });

  const body = await readJson(req);
  const incoming = body.message || body;
  const text = String(incoming.text || "").trim();
  const role = String(incoming.role || body.role || "user").slice(0, 40);
  if (!canAccountMessageTask(task, account, role)) return json(res, 403, { message: "Писать в чат могут только участники задания." });
  const risk = classifyMessageRisk(text);
  if (risk.risky && !isSupportAccount(account)) {
    logAudit("task_message_blocked", `${task.publicId || task.id} · ${risk.codes.join(",")}`, req, { actorAccountId: account?.id || "system", targetType: "task", targetId: task.id });
    return rejectRiskyMessage(res, risk);
  }
  const photoFileId = String(incoming.photoFileId || incoming.fileId || "").trim();
  const inlinePhoto = String(incoming.photo || "").startsWith("data:") ? "" : String(incoming.photo || "");
  if (!text && !inlinePhoto && !photoFileId) return json(res, 400, { message: "Введите сообщение." });
  if (text.length > 2000) return json(res, 400, { message: "Сообщение слишком длинное." });
  if (photoFileId) {
    const file = database.files[photoFileId];
    if (!file) return json(res, 404, { message: "Файл не найден." });
    if (!fileCanBeReadByAccount(file, account)) return json(res, 403, { message: "Нет доступа к файлу." });
    if (file.status !== "uploaded") return json(res, 409, { message: "Файл ещё не загружен." });
    if (file.taskId && ![task.id, task.publicId].includes(file.taskId)) return json(res, 409, { message: "Файл привязан к другому заданию." });
    file.taskId = task.id;
    file.updatedAt = new Date().toISOString();
  }

  const now = new Date().toISOString();
  const message = publicTaskMessage({
    id: String(incoming.id || randomToken(10)),
    author: String(incoming.author || account?.name || "Пользователь").slice(0, 120),
    role,
    text,
    photo: inlinePhoto,
    photoFileId,
    time: incoming.time || now,
    createdAt: now,
  });
  task.messages = Array.isArray(task.messages) ? task.messages : [];
  if (!task.messages.some((item) => item.id && item.id === message.id)) task.messages.push(message);
  task.updatedAt = now;
  database.tasks[task.id] = task;
  persistDatabase();
  logAudit("task_message", `Сообщение в задании ${task.publicId || task.id}`, req, { targetType: "task", targetId: task.id });
  broadcastEvent("task.message", { taskId: task.id, publicId: task.publicId, updated: true });
  broadcastEvent("task.updated", { task: publicFeedTask(task) });
  return json(res, 201, { message, task: visibleTaskForAccount(task, account) });
}

async function handleCreatePayment(req, res) {
  if (!checkRateLimit(req, "payments")) {
    return json(res, 429, { message: "Слишком много платёжных запросов. Попробуйте позже." }, { "Retry-After": "60" });
  }
  const body = await readJson(req);
  const account = requireAccount(req, res);
  if (!account) return;
  const amount = rubles(body.amount);
  if (!amount) return json(res, 400, { message: "Введите сумму платежа." });
  if (amount < 10) return json(res, 400, { message: "Минимальный платёж — 10 ₽." });
  if (amount > 300000) return json(res, 400, { message: "Для MVP максимальный платёж — 300 000 ₽." });

  const now = new Date().toISOString();
  const id = `pay_${randomToken(12)}`;
  const providerStatus = paymentProviderStatus();
  const payment = {
    id,
    provider: providerStatus.provider,
    bank: body.bank || config.payments.primaryBank,
    amount,
    status: providerStatus.provider === "mock" && config.payments.mockAutoConfirm ? "paid" : "pending",
    purpose: body.purpose || "wallet_topup",
    taskPublicId: body.taskPublicId || "",
    accountId: account.id,
    createdAt: now,
    updatedAt: now,
    demo: providerStatus.provider === "mock",
  };

  if (payment.demo) {
    payment.paymentUrl = `${config.publicBaseUrl}/?payment=${encodeURIComponent(id)}&status=${payment.status}`;
    payment.qrPayload = `ST00012|Name=Дела рядом|PersonalAcc=${id}|Sum=${amount * 100}|Purpose=${encodeURIComponent(payment.purpose)}`;
  } else if (providerStatus.provider === "yookassa") {
    if (!providerStatus.configured) {
      return json(res, 503, { message: "ЮKassa не настроена: заполните YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY на backend.", provider: providerStatus });
    }
    try {
      const yookassaPayment = await createYooKassaSbpPayment(payment);
      payment.providerPaymentId = yookassaPayment.id;
      payment.status = normalizePaymentStatus("yookassa", yookassaPayment.status, yookassaPayment.paid);
      payment.paymentUrl = yookassaPayment.confirmation?.confirmation_url || "";
      payment.qrPayload = payment.paymentUrl;
      payment.providerPayload = {
        id: yookassaPayment.id,
        status: yookassaPayment.status,
        paid: Boolean(yookassaPayment.paid),
        test: Boolean(yookassaPayment.test),
        confirmationType: yookassaPayment.confirmation?.type || "",
      };
    } catch (error) {
      logAudit("payment_create_failed", `YooKassa: ${error.message}`, req, { targetType: "payment", targetId: id });
      return json(res, error.statusCode || 502, { message: "ЮKassa отклонила создание СБП-платежа.", details: error.message, provider: providerStatus });
    }
  } else {
    return json(res, 503, {
      message: "Платёжный провайдер выбран, но production-интеграция банка ещё не подключена в коде. Заполните договор и API-ключи, затем добавьте адаптер провайдера.",
      provider: providerStatus,
    });
  }

  database.payments[id] = payment;
  if (payment.status === "paid" && !payment.creditedAt) {
    adjustAccountBalance(account, amount);
    payment.creditedAt = new Date().toISOString();
    createTransaction({
      accountId: account.id,
      type: "topup",
      title: `СБП через ${payment.bank || "банк"}`,
      amount,
      status: payment.demo ? "mock-paid" : "paid",
      referenceType: "payment",
      referenceId: payment.id,
      createdAt: payment.creditedAt,
    });
  }
  persistDatabase();
  logAudit("payment_created", `Создан платёж ${id} на ${amount} ₽`, req, { targetType: "payment", targetId: id });
  broadcastEvent("payment.updated", { payment: publicPayment(payment) });
  return json(res, 201, { payment: publicPayment(payment), provider: providerStatus, account: publicAccount(account), transactions: accountTransactions(account.id, 40) });
}

function handleGetPayment(req, res, paymentId) {
  const payment = database.payments[paymentId || ""];
  if (!payment) return json(res, 404, { message: "Платёж не найден." });
  return json(res, 200, { payment: publicPayment(payment), provider: paymentProviderStatus() });
}

async function handlePaymentWebhook(req, res) {
  const body = await readJson(req);
  const providerObject = body.object && typeof body.object === "object" ? body.object : null;
  const providerPaymentId = providerObject?.id || body.providerPaymentId || "";
  const paymentId = providerObject?.metadata?.localPaymentId || body.id || body.paymentId || body.PaymentId;
  const payment = database.payments[paymentId || ""] || Object.values(database.payments).find((item) => item.providerPaymentId && item.providerPaymentId === providerPaymentId);
  if (!payment) return json(res, 404, { message: "Платёж не найден." });
  if (body.event && payment.provider === "yookassa" && !String(body.event).startsWith("payment.")) return json(res, 400, { message: "Неверный тип webhook ЮKassa." });
  const previousStatus = payment.status;
  payment.status = normalizePaymentStatus(payment.provider, providerObject?.status || body.status || body.Status || payment.status, providerObject?.paid);
  payment.updatedAt = new Date().toISOString();
  if (providerPaymentId) payment.providerPaymentId = providerPaymentId;
  if (payment.provider === "yookassa") {
    payment.providerPayload = {
      ...(payment.providerPayload || {}),
      id: providerPaymentId || payment.providerPayload?.id || "",
      event: body.event || payment.providerPayload?.event || "",
      status: providerObject?.status || payment.providerPayload?.status || "",
      paid: Boolean(providerObject?.paid),
      test: Boolean(providerObject?.test),
    };
  }
  if (payment.status === "paid" && previousStatus !== "paid" && !payment.creditedAt) {
    const account = database.users[payment.accountId || ""];
    if (account) {
      adjustAccountBalance(account, payment.amount);
      payment.creditedAt = payment.updatedAt;
      createTransaction({
        accountId: account.id,
        type: "topup",
        title: `СБП через ${payment.bank || "банк"}`,
        amount: payment.amount,
        status: payment.demo ? "mock-paid" : "paid",
        referenceType: "payment",
        referenceId: payment.id,
        createdAt: payment.creditedAt,
      });
    }
  }
  persistDatabase();
  logAudit("payment_webhook", `Платёж ${payment.id} обновлён до ${payment.status}`, req, { targetType: "payment", targetId: payment.id });
  broadcastEvent("payment.updated", { payment: publicPayment(payment) });
  return json(res, 200, { ok: true });
}

async function handleCreatePayout(req, res) {
  if (!checkRateLimit(req, "payouts")) {
    return json(res, 429, { message: "Слишком много запросов на выплату. Попробуйте позже." }, { "Retry-After": "60" });
  }
  const body = await readJson(req);
  const account = requireAccount(req, res);
  if (!account) return;
  const amount = rubles(body.amount);
  const destination = String(body.destination || "").replace(/[^0-9+]/g, "");
  if (!amount) return json(res, 400, { message: "Введите сумму выплаты." });
  if (amount < 10) return json(res, 400, { message: "Минимальная выплата — 10 ₽." });
  if (rubles(account.balance) < amount) return json(res, 409, { message: "На балансе недостаточно средств." });
  if (!destination || destination.length < 10) return json(res, 400, { message: "Укажите телефон СБП или маску карты получателя." });

  const now = new Date().toISOString();
  const providerStatus = paymentProviderStatus();
  const payout = {
    id: `po_${randomToken(12)}`,
    provider: providerStatus.provider,
    bank: body.bank || config.payments.primaryBank,
    amount,
    status: providerStatus.mode === "mock" ? "created" : "pending",
    destination: destination.length > 12 ? `•••• ${destination.slice(-4)}` : `${destination.slice(0, 2)}••••${destination.slice(-2)}`,
    accountId: account.id,
    createdAt: now,
    updatedAt: now,
    demo: providerStatus.mode === "mock",
  };

  if (!payout.demo) {
    return json(res, 503, {
      message: "Production-выплаты требуют договора с банком/провайдером, KYC/AML и отдельного адаптера выплат.",
      provider: providerStatus,
    });
  }

  database.payouts[payout.id] = payout;
  adjustAccountBalance(account, -amount);
  createTransaction({
    accountId: account.id,
    type: "payout",
    title: `Выплата ${payout.destination}`,
    amount: -amount,
    status: payout.demo ? "mock-created" : payout.status || "created",
    referenceType: "payout",
    referenceId: payout.id,
    createdAt: payout.createdAt,
  });
  persistDatabase();
  logAudit("payout_created", `Создана заявка на выплату ${payout.id} на ${amount} ₽`, req, { targetType: "payout", targetId: payout.id });
  broadcastEvent("payout.updated", { payout: publicPayout(payout) });
  return json(res, 201, { payout: publicPayout(payout), provider: providerStatus, account: publicAccount(account), transactions: accountTransactions(account.id, 40) });
}

function handleEvents(req, res) {
  res.writeHead(200, {
    ...corsHeaders(req),
    ...securityHeaders(),
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true, time: new Date().toISOString() })}\n\n`);
  eventClients.add(res);
  req.on("close", () => eventClients.delete(res));
}

async function handlePushSubscribe(req, res) {
  const status = pushProviderStatus();
  const body = await readJson(req);
  const subscription = body.subscription || body;
  if (!subscription || typeof subscription !== "object" || !subscription.endpoint) {
    return json(res, 400, { message: "Передайте Web Push subscription с endpoint." });
  }
  const id = crypto.createHash("sha256").update(String(subscription.endpoint)).digest("hex");
  database.pushSubscriptions[id] = {
    id,
    accountId: body.accountId || currentAccount(req)?.id || "",
    subscription,
    enabled: status.configured,
    createdAt: database.pushSubscriptions[id]?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  persistDatabase();
  logAudit("push_subscribe", status.configured ? "Сохранена push-подписка" : "Push-подписка сохранена, но VAPID не настроен", req, { targetType: "push", targetId: id });
  return json(res, status.configured ? 201 : 202, {
    ok: true,
    configured: status.configured,
    message: status.configured ? "Push-подписка сохранена." : "Push-подписка сохранена, но отправка включится только после настройки VAPID ключей.",
  });
}

async function handleSmsStart(req, res) {
  if (!checkRateLimit(req, "sms")) {
    return json(res, 429, { message: "Слишком много SMS-запросов. Попробуйте позже." }, { "Retry-After": "60" });
  }
  const status = smsProviderStatus();
  const body = await readJson(req);
  const phone = normalizePhone(body.phone);
  if (!phone || phone.length < 10) return json(res, 400, { message: "Укажите телефон для SMS." });
  if (!status.configured && !status.devMode) {
    return json(res, 503, { message: "SMS-провайдер не настроен. Добавьте SMS_PROVIDER, SMS_API_KEY и SMS_SENDER на backend.", provider: status });
  }
  const codeId = crypto.createHash("sha256").update(`${phone}:${Date.now()}:${randomToken(6)}`).digest("hex");
  const code = String(crypto.randomInt(100000, 1000000));
  database.smsCodes[codeId] = {
    id: codeId,
    phone,
    status: status.configured ? "pending-provider" : "dev-sent",
    codeHash: hashSmsCode(code, codeId, phone),
    attempts: 0,
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + 5 * 60 * 1000,
  };
  persistDatabase();
  logAudit("sms_requested", `Запрошен SMS-код для ${phoneMask(phone)}`, req, { targetType: "sms", targetId: codeId });
  if (status.configured) {
    return json(res, 501, { message: "SMS-провайдер сконфигурирован, но adapter отправки ещё нужно подключить под выбранный API.", verificationId: codeId, provider: status });
  }
  return json(res, 202, {
    verificationId: codeId,
    devCode: code,
    expiresInSeconds: 300,
    provider: status,
    message: "Локальный dev-код создан backend-ом. В production он не возвращается клиенту.",
  });
}

async function handleSmsVerify(req, res) {
  if (!checkRateLimit(req, "sms-verify")) {
    return json(res, 429, { message: "Слишком много попыток подтверждения. Попробуйте позже." }, { "Retry-After": "60" });
  }
  cleanupStores();
  const body = await readJson(req);
  const verificationId = String(body.verificationId || body.codeId || "");
  const code = String(body.code || "").replace(/\D/g, "");
  const item = database.smsCodes[verificationId];
  if (!item) return json(res, 404, { message: "Код не найден или устарел. Запросите новый код." });
  if (!code || code.length < 4) return json(res, 400, { message: "Введите код из SMS/push." });
  if (item.expiresAt <= Date.now()) {
    delete database.smsCodes[verificationId];
    persistDatabase();
    return json(res, 410, { message: "Код истёк. Запросите новый код." });
  }
  item.attempts = Number(item.attempts || 0) + 1;
  if (item.attempts > 5) {
    delete database.smsCodes[verificationId];
    persistDatabase();
    logAudit("sms_blocked", `Превышен лимит попыток для ${phoneMask(item.phone)}`, req, { targetType: "sms", targetId: verificationId });
    return json(res, 429, { message: "Слишком много неверных попыток. Запросите новый код." });
  }
  if (!secureCodeEqual(code, item)) {
    persistDatabase();
    return json(res, 401, { message: "Неверный код." });
  }

  const accountId = body.accountId || phoneUserId(item.phone);
  const existingAccount = database.users[accountId] || {};
  const now = new Date().toISOString();
  const account = upsertUser({
    id: accountId,
    authProvider: "phone",
    externalId: item.phone,
    name: String(body.name || "").trim() || existingAccount.name || `Пользователь ${item.phone.slice(-4)}`,
    username: String(body.username || "").trim() || existingAccount.username || item.phone,
    phone: item.phone,
    phoneVerified: true,
    verified: false,
    city: String(body.city || "").trim() || existingAccount.city || "",
    ...(String(body.password || "").length >= 4 ? { passwordHash: passwordHash(String(body.password)) } : {}),
    lastLoginAt: now,
  });
  delete database.smsCodes[verificationId];
  const sessionId = randomToken(32);
  saveSession(sessionId, account, "phone");
  persistDatabase();
  logAudit("phone_verified", `Телефон ${phoneMask(item.phone)} подтверждён`, req, { actorAccountId: account.id, targetType: "user", targetId: account.id });
  return json(res, 200, { verified: true, account: publicAccount(account), csrfToken: sessionCsrfToken(database.sessions[sessionId]) }, {
    "Set-Cookie": cookie("dr_auth_session", signedSessionId(sessionId), Math.floor(SESSION_TTL_MS / 1000)),
  });
}

async function handleFilePrepare(req, res) {
  if (!checkRateLimit(req, "files")) return json(res, 429, { message: "Слишком много файловых операций. Попробуйте позже." }, { "Retry-After": "60" });
  const account = requireAccount(req, res);
  if (!account) return;
  const status = storageProviderStatus();
  const body = await readJson(req);
  const filename = path.basename(String(body.filename || "upload.bin")).slice(0, 120) || "upload.bin";
  const contentType = String(body.contentType || "application/octet-stream").slice(0, 120);
  const size = Number(body.size || 0);
  const taskId = String(body.taskId || "").trim();
  if (!ALLOWED_UPLOAD_CONTENT_TYPES.has(contentType)) return json(res, 400, { message: "Разрешены только JPEG, PNG или WebP." });
  if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_UPLOAD_BYTES) return json(res, 400, { message: `Файл должен быть до ${Math.round(MAX_FILE_UPLOAD_BYTES / 1024 / 1024)} МБ.` });
  if (taskId) {
    const task = findTask(taskId);
    if (!task) return json(res, 404, { message: "Задание не найдено." });
    if (!isTaskWorker(task, account) && !isAdminAccount(account)) return json(res, 403, { message: "Фотоотчёт может загрузить только исполнитель задания." });
  }
  const fileId = `file_${randomToken(12)}`;
  if (!status.configured) {
    return json(res, 503, {
      message: "Файловое хранилище не настроено. Для продакшена включите FILE_STORAGE_PROVIDER=s3 и S3_* переменные; base64 в задачах больше не считается безопасным хранилищем.",
      storage: status,
    });
  }
  const objectKey = `uploads/${new Date().toISOString().slice(0, 10)}/${fileId}-${filename}`;
  database.files[fileId] = {
    id: fileId,
    provider: "s3",
    bucket: config.storage.bucket,
    objectKey,
    filename,
    contentType,
    size,
    accountId: account.id,
    taskId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "pending-upload",
  };
  persistDatabase();
  logAudit("file_prepare", `Подготовлена загрузка ${filename}`, req, { targetType: "file", targetId: fileId });
  return json(res, 201, {
    file: database.files[fileId],
    upload: {
      method: "PUT",
      url: presignS3Url({ method: "PUT", objectKey, contentType, expiresIn: S3_UPLOAD_URL_TTL_SECONDS }),
      headers: { "Content-Type": contentType },
      expiresIn: S3_UPLOAD_URL_TTL_SECONDS,
    },
    storage: status,
  });
}

async function handleFileComplete(req, res, fileId) {
  if (req.method !== "POST") return notFound(res);
  const account = requireAccount(req, res);
  if (!account) return;
  const file = database.files[fileId];
  if (!file) return json(res, 404, { message: "Файл не найден." });
  if (!fileCanBeReadByAccount(file, account)) return json(res, 403, { message: "Нет доступа к файлу." });
  if (file.status !== "pending-upload" && file.status !== "uploaded") return json(res, 409, { message: "Файл в неверном статусе." });
  file.status = "uploaded";
  file.uploadedAt = new Date().toISOString();
  file.updatedAt = file.uploadedAt;
  persistDatabase();
  logAudit("file_complete", file.filename || file.id, req, { targetType: "file", targetId: file.id });
  return json(res, 200, { file, downloadUrl: `${config.publicBaseUrl}/api/files/${encodeURIComponent(file.id)}/download` });
}

function handleFileDownload(req, res, fileId) {
  if (req.method !== "GET") return notFound(res);
  const account = requireAccount(req, res);
  if (!account) return;
  const file = database.files[fileId];
  if (!file) return json(res, 404, { message: "Файл не найден." });
  if (!fileCanBeReadByAccount(file, account)) return json(res, 403, { message: "Нет доступа к файлу." });
  if (file.status !== "uploaded") return json(res, 409, { message: "Файл ещё не загружен." });
  if (!storageProviderStatus().configured) return json(res, 503, { message: "Файловое хранилище не настроено.", storage: storageProviderStatus() });
  const url = presignS3Url({ method: "GET", objectKey: file.objectKey, expiresIn: S3_DOWNLOAD_URL_TTL_SECONDS });
  res.writeHead(302, { Location: url, "Cache-Control": "no-store", ...securityHeaders() });
  res.end();
}

function handleAdminUsers(req, res) {
  if (!requireAdmin(req, res)) return;
  const users = Object.values(database.users).map(publicAccount).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return json(res, 200, { users });
}

function handleAdminAudit(req, res, url) {
  if (!requireAdmin(req, res)) return;
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 100)));
  return json(res, 200, { auditLog: database.auditLog.slice(0, limit) });
}

function handleAdminTaskModeration(req, res, url) {
  if (req.method !== "GET") return notFound(res);
  const account = requireModerator(req, res);
  if (!account) return;
  const statusParam = String(url.searchParams.get("status") || "pending,rejected").trim();
  const statuses = statusParam === "all"
    ? null
    : new Set(statusParam.split(",").map((status) => status.trim()).filter(Boolean));
  const tasks = Object.values(database.tasks)
    .filter((task) => !statuses || statuses.has(String(task.moderationStatus || "approved")))
    .sort((a, b) => taskTimestamp(b) - taskTimestamp(a))
    .map(publicTask);
  return json(res, 200, { tasks, updatedAt: new Date().toISOString() });
}

async function handleAdminTaskModerate(req, res, taskId) {
  if (req.method !== "POST") return notFound(res);
  const account = requireModerator(req, res);
  if (!account) return;
  const task = findTask(taskId);
  if (!task) return json(res, 404, { message: "Задание не найдено." });
  const body = await readJson(req);
  const status = String(body.status || body.moderationStatus || "").trim();
  if (!["approved", "rejected", "pending"].includes(status)) {
    return json(res, 400, { message: "Статус модерации должен быть approved, rejected или pending." });
  }
  const now = new Date().toISOString();
  task.moderationStatus = status;
  task.moderationNote = String(body.note || body.moderationNote || defaultModerationNote(status)).slice(0, 1000);
  task.moderatedAt = now;
  task.moderatedByAccountId = account.id;
  task.updatedAt = now;
  database.tasks[task.id] = task;
  persistDatabase();
  logAudit("task_moderated", `${task.publicId || task.id} · ${status}`, req, { targetType: "task", targetId: task.id });
  broadcastEvent("task.updated", { task: publicFeedTask(task), action: "moderate" });
  return json(res, 200, { task: publicTask(task) });
}

function defaultModerationNote(status) {
  return {
    approved: "Одобрено модератором",
    rejected: "Отклонено модератором",
    pending: "Ждёт проверки модератором",
  }[status] || "";
}

function serveStatic(req, res, url) {
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const relativeName = pathname.replace(/^\/+/, "");
  if (!PUBLIC_FILES.has(relativeName)) return notFound(res);
  const filePath = path.normalize(path.join(ROOT_DIR, pathname));
  if (!filePath.startsWith(ROOT_DIR)) return notFound(res);
  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) return notFound(res);
    res.writeHead(200, { "Content-Type": mimeType(filePath), "Cache-Control": cacheControl(filePath), ...securityHeaders() });
    fs.createReadStream(filePath).pipe(res);
  });
}

function notFound(res) {
  json(res, 404, { message: "Not found" });
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".webmanifest": "application/manifest+json; charset=utf-8",
    ".svg": "image/svg+xml; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".md": "text/markdown; charset=utf-8",
  }[ext] || "application/octet-stream";
}

function cacheControl(filePath) {
  const name = path.basename(filePath);
  if (["index.html", "service-worker.js", "manifest.webmanifest"].includes(name)) return "no-cache";
  return "public, max-age=3600";
}

async function handleRequest(req, res) {
  const url = new URL(req.url, config.publicBaseUrl);
  try {
    if (url.pathname.startsWith("/api/")) {
      const headers = corsHeaders(req);
      if (req.method === "OPTIONS") {
        res.writeHead(204, { ...headers, ...securityHeaders(), "Cache-Control": "no-store" });
        return res.end();
      }
      const contentLength = Number(req.headers["content-length"] || 0);
      if (contentLength > MAX_JSON_BODY_BYTES) {
        return json(res, 413, { message: "JSON body is too large." });
      }
      const originalWriteHead = res.writeHead.bind(res);
      res.writeHead = (statusCode, responseHeaders = {}) => originalWriteHead(statusCode, { ...headers, ...responseHeaders });
    }

    if (url.pathname.startsWith("/api/auth/") && !checkRateLimit(req, "auth")) {
      return json(res, 429, { message: "Слишком много запросов авторизации. Попробуйте позже." }, { "Retry-After": "60" });
    }

    if (!requireCsrf(req, res, url)) return;

    if (req.method === "GET" && url.pathname === "/api/health") {
      return json(res, 200, {
        ok: true,
        service: "dela-ryadom-backend",
        time: new Date().toISOString(),
        persistence: {
          ...persistenceInfo,
          tasks: Object.keys(database.tasks).length,
          users: Object.keys(database.users).length,
        },
        events: { provider: "sse", clients: eventClients.size },
        providers: providerStatus(),
      });
    }

    if (req.method === "GET" && url.pathname === "/api/events") return handleEvents(req, res);

    if (req.method === "GET" && url.pathname === "/api/auth/me") return handleCurrentUser(req, res);
    if (req.method === "POST" && url.pathname === "/api/auth/register") return handleRegister(req, res);
    if (req.method === "POST" && url.pathname === "/api/auth/login") return handleLogin(req, res);
    if (req.method === "POST" && url.pathname === "/api/auth/logout") return handleLogout(req, res);
    if (req.method === "POST" && url.pathname === "/api/auth/esia/start") return handleStart(req, res, "esia");
    if (req.method === "GET" && url.pathname === "/api/auth/esia/callback") return handleCallback(req, res, "esia", url);
    if (req.method === "GET" && url.pathname === "/api/auth/esia/status") return handleStatus(req, res, "esia");
    if (req.method === "POST" && url.pathname === "/api/auth/phone/start") return handleSmsStart(req, res);
    if (req.method === "POST" && url.pathname === "/api/auth/phone/verify") return handleSmsVerify(req, res);
    if (req.method === "PATCH" && url.pathname === "/api/account") return handleUpdateAccount(req, res);
    if (req.method === "DELETE" && url.pathname === "/api/account") return handleDeleteAccount(req, res);

    const taskActionMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/actions\/([^/]+)$/);
    if (taskActionMatch) return handleTaskAction(req, res, decodeURIComponent(taskActionMatch[1]), decodeURIComponent(taskActionMatch[2]));
    const taskMessageMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/messages$/);
    if (taskMessageMatch && (req.method === "GET" || req.method === "POST")) return handleTaskMessages(req, res, decodeURIComponent(taskMessageMatch[1]));
    if ((req.method === "GET" || req.method === "POST") && url.pathname === "/api/tasks") return handleTasks(req, res);

    if (req.method === "POST" && url.pathname === "/api/payments") return handleCreatePayment(req, res);
    if (req.method === "GET" && url.pathname.startsWith("/api/payments/")) return handleGetPayment(req, res, decodeURIComponent(url.pathname.split("/").pop() || ""));
    if (req.method === "POST" && url.pathname === "/api/payments/webhook") return handlePaymentWebhook(req, res);
    if (req.method === "POST" && url.pathname === "/api/payouts") return handleCreatePayout(req, res);
    if (url.pathname === "/api/transactions") return handleTransactions(req, res, url);
    if (url.pathname === "/api/support/tickets" && (req.method === "GET" || req.method === "POST")) return handleSupportTickets(req, res);
    const supportMessageMatch = url.pathname.match(/^\/api\/support\/tickets\/([^/]+)\/messages$/);
    if (supportMessageMatch) return handleSupportTicketMessages(req, res, decodeURIComponent(supportMessageMatch[1]));
    const supportTicketMatch = url.pathname.match(/^\/api\/support\/tickets\/([^/]+)$/);
    if (supportTicketMatch) return handleSupportTicket(req, res, decodeURIComponent(supportTicketMatch[1]));
    if (req.method === "POST" && url.pathname === "/api/push/subscribe") return handlePushSubscribe(req, res);
    if (req.method === "POST" && url.pathname === "/api/files/prepare") return handleFilePrepare(req, res);
    const fileCompleteMatch = url.pathname.match(/^\/api\/files\/([^/]+)\/complete$/);
    if (fileCompleteMatch) return handleFileComplete(req, res, decodeURIComponent(fileCompleteMatch[1]));
    const fileDownloadMatch = url.pathname.match(/^\/api\/files\/([^/]+)\/download$/);
    if (fileDownloadMatch) return handleFileDownload(req, res, decodeURIComponent(fileDownloadMatch[1]));
    if (req.method === "GET" && url.pathname === "/api/admin/tasks/moderation") return handleAdminTaskModeration(req, res, url);
    const adminTaskModerateMatch = url.pathname.match(/^\/api\/admin\/tasks\/([^/]+)\/moderate$/);
    if (adminTaskModerateMatch) return handleAdminTaskModerate(req, res, decodeURIComponent(adminTaskModerateMatch[1]));
    if (req.method === "GET" && url.pathname === "/api/admin/users") return handleAdminUsers(req, res);
    if (req.method === "GET" && url.pathname === "/api/admin/audit-log") return handleAdminAudit(req, res, url);

    if (url.pathname.startsWith("/api/")) return notFound(res);
    if (req.method !== "GET" && req.method !== "HEAD") return notFound(res);
    return serveStatic(req, res, url);
  } catch (error) {
    const statusCode = Number(error.statusCode || 500);
    return json(res, statusCode, { message: error.message || "Internal server error" });
  }
}

const server = http.createServer(handleRequest);

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Порт ${config.port} уже занят. Освободите порт или задайте другой PORT в .env.`);
    process.exit(1);
  }
  console.error(error);
  process.exit(1);
});

async function shutdown() {
  try {
    await persistQueue;
    if (persistenceDriver?.close) await persistenceDriver.close();
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

initPersistence()
  .then(() => {
    server.listen(config.port, () => {
      console.log(`Дела рядом backend: ${config.publicBaseUrl}`);
      console.log(`Persistence: ${persistenceInfo.provider}`);
      console.log(`ESIA configured: ${isProviderConfigured("esia") ? "yes" : "no"}`);
    });
  })
  .catch((error) => {
    console.error("Backend startup failed:", error.message || error);
    process.exit(1);
  });

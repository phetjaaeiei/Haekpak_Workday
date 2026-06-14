const http = require("http");
const fs = require("fs");
const path = require("path");

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "schedules.json");
const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const SUPABASE_TABLE = process.env.SUPABASE_TABLE || "workday_selections";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Password123";

const ROLES = {
  server: { label: "พนักงานเสิร์ฟ", capacity: 4 },
  dishwasher: { label: "พนักงานล้างจาน", capacity: 2 },
  slicer: { label: "พนักงานสไลด์หมู", capacity: 1 },
  prep: { label: "พนักงานเตรียมของ", capacity: 3 },
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ selections: [] }, null, 2));
  }
}

function readData() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const data = JSON.parse(raw);
    return { selections: Array.isArray(data.selections) ? data.selections : [] };
  } catch (error) {
    return { selections: [] };
  }
}

function writeData(data) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function hasSupabaseConfig() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function toClientSelection(row) {
  return {
    id: row.id,
    nickname: row.nickname,
    role: row.role,
    weekStart: row.week_start,
    days: Array.isArray(row.days) ? row.days : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function supabaseRequest(params, options = {}) {
  if (typeof fetch !== "function") {
    throw new Error("Node.js version must support fetch to use Supabase");
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?${params.toString()}`, {
    method: options.method || "GET",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "content-type": "application/json",
      ...(options.prefer ? { prefer: options.prefer } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || "Supabase request failed");
  }

  return payload;
}

async function readScheduleData(weekStart) {
  if (!hasSupabaseConfig()) {
    const data = readData();
    const selections = isIsoDate(weekStart)
      ? data.selections.filter((item) => item.weekStart === weekStart)
      : data.selections;
    return { selections };
  }

  const params = new URLSearchParams({ select: "*", order: "created_at.asc" });
  if (isIsoDate(weekStart)) {
    params.set("week_start", `eq.${weekStart}`);
  }

  const rows = await supabaseRequest(params);
  return { selections: rows.map(toClientSelection) };
}

async function saveScheduleSelection(validSelection, existingSelections) {
  const now = new Date().toISOString();

  if (!hasSupabaseConfig()) {
    const data = readData();
    const existingIndex = data.selections.findIndex((item) => item.id === validSelection.id);

    if (existingIndex >= 0) {
      data.selections[existingIndex] = {
        ...data.selections[existingIndex],
        ...validSelection,
        updatedAt: now,
      };
    } else {
      data.selections.push({
        ...validSelection,
        createdAt: now,
        updatedAt: now,
      });
    }

    writeData(data);
    return;
  }

  const existingSelection = existingSelections.find((item) => item.id === validSelection.id);
  const params = new URLSearchParams({ on_conflict: "id" });
  await supabaseRequest(params, {
    method: "POST",
    prefer: "resolution=merge-duplicates,return=minimal",
    body: {
      id: validSelection.id,
      nickname: validSelection.nickname,
      role: validSelection.role,
      week_start: validSelection.weekStart,
      days: validSelection.days,
      created_at: existingSelection?.createdAt || now,
      updated_at: now,
    },
  });
}

async function deleteScheduleWeek(weekStart) {
  if (!hasSupabaseConfig()) {
    const data = readData();
    data.selections = data.selections.filter((item) => item.weekStart !== weekStart);
    writeData(data);
    return;
  }

  const params = new URLSearchParams({ week_start: `eq.${weekStart}` });
  await supabaseRequest(params, {
    method: "DELETE",
    prefer: "return=minimal",
  });
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(body);
}

function sendText(res, status, text) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(text);
}

function isAdminAuthorized(req) {
  return req.headers["x-admin-password"] === ADMIN_PASSWORD;
}

function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("ข้อมูลที่ส่งมาใหญ่เกินไป"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function normalizeName(name) {
  return String(name || "").trim().replace(/\s+/g, " ");
}

function normalizeDate(date) {
  return String(date || "").trim();
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function addDays(dateValue, offset) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function getWeekDates(weekStart) {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

function buildSelectionId(role, nickname, weekStart) {
  return `${weekStart}|${role}|${nickname.toLocaleLowerCase("th-TH")}`;
}

function validateSelectionPayload(payload, existingSelections) {
  const nickname = normalizeName(payload.nickname);
  const role = String(payload.role || "");
  const weekStart = normalizeDate(payload.weekStart);
  const days = Array.isArray(payload.days) ? payload.days.map(normalizeDate) : [];

  if (nickname.length < 1 || nickname.length > 40) {
    throw new Error("กรุณากรอกชื่อเล่น 1-40 ตัวอักษร");
  }

  if (!Object.prototype.hasOwnProperty.call(ROLES, role)) {
    throw new Error("ตำแหน่งไม่ถูกต้อง");
  }

  if (!isIsoDate(weekStart)) {
    throw new Error("สัปดาห์ไม่ถูกต้อง");
  }

  const uniqueDays = [...new Set(days)];
  if (uniqueDays.length !== days.length) {
    throw new Error("เลือกวันซ้ำไม่ได้");
  }

  if (uniqueDays.length !== 3) {
    throw new Error("ต้องเลือกวันทำงานให้ครบ 3 วันต่อสัปดาห์");
  }

  const weekDates = new Set(getWeekDates(weekStart));
  const invalidDay = uniqueDays.find((day) => !isIsoDate(day) || !weekDates.has(day));
  if (invalidDay) {
    throw new Error("เลือกได้เฉพาะวันในสัปดาห์ที่กำลังเปิดอยู่");
  }

  const id = buildSelectionId(role, nickname, weekStart);
  const counts = {};
  for (const item of existingSelections) {
    if (item.id === id || item.role !== role || item.weekStart !== weekStart) {
      continue;
    }
    for (const day of item.days || []) {
      counts[day] = (counts[day] || 0) + 1;
    }
  }

  const capacity = ROLES[role].capacity;
  const fullDay = uniqueDays.find((day) => (counts[day] || 0) + 1 > capacity);
  if (fullDay) {
    throw new Error(`วันที่ ${fullDay} ของตำแหน่ง ${ROLES[role].label} เต็มแล้ว`);
  }

  return { id, nickname, role, weekStart, days: uniqueDays.sort() };
}

async function getScheduleForWeek(weekStart) {
  const data = await readScheduleData(weekStart);
  return {
    roles: ROLES,
    selections: data.selections,
  };
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.resolve(PUBLIC_DIR, `.${requestedPath}`);

  if (filePath !== PUBLIC_DIR && !filePath.startsWith(`${PUBLIC_DIR}${path.sep}`)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendText(res, 404, "Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "content-type": MIME_TYPES[ext] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(content);
  });
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (url.pathname === "/api/admin/login") {
    if (req.method !== "POST") {
      res.writeHead(405, { allow: "POST" });
      res.end();
      return;
    }

    try {
      const body = await getRequestBody(req);
      const payload = JSON.parse(body || "{}");
      sendJson(res, 200, { ok: payload.password === ADMIN_PASSWORD });
    } catch (error) {
      sendJson(res, 400, { ok: false });
    }
    return;
  }

  if (url.pathname !== "/api/schedule") {
    sendJson(res, 404, { error: "ไม่พบ API นี้" });
    return;
  }

  if (req.method === "GET") {
    const weekStart = normalizeDate(url.searchParams.get("weekStart"));
    sendJson(res, 200, await getScheduleForWeek(weekStart));
    return;
  }

  if (req.method === "POST") {
    try {
      const body = await getRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const requestedWeekStart = normalizeDate(payload.weekStart);
      const data = await readScheduleData(requestedWeekStart);
      const validSelection = validateSelectionPayload(payload, data.selections);
      await saveScheduleSelection(validSelection, data.selections);
      sendJson(res, 200, {
        message: "บันทึกวันทำงานเรียบร้อย",
        schedule: await getScheduleForWeek(validSelection.weekStart),
      });
    } catch (error) {
      sendJson(res, 400, { error: error.message || "บันทึกไม่สำเร็จ" });
    }
    return;
  }

  if (req.method === "DELETE") {
    if (!isAdminAuthorized(req)) {
      sendJson(res, 401, { error: "รหัส Admin ไม่ถูกต้อง" });
      return;
    }

    const weekStart = normalizeDate(url.searchParams.get("weekStart"));
    if (!isIsoDate(weekStart)) {
      sendJson(res, 400, { error: "สัปดาห์ไม่ถูกต้อง" });
      return;
    }

    await deleteScheduleWeek(weekStart);
    sendJson(res, 200, {
      message: "ล้างข้อมูลสัปดาห์นี้แล้ว",
      schedule: await getScheduleForWeek(weekStart),
    });
    return;
  }

  res.writeHead(405, { allow: "GET, POST, DELETE" });
  res.end();
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    handleApi(req, res);
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  const storage = hasSupabaseConfig() ? "Supabase" : "local JSON";
  console.log(`Shabu workday form is running at http://localhost:${PORT} (${storage})`);
});

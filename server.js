const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "schedules.json");

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

function getScheduleForWeek(weekStart) {
  const data = readData();
  const filtered = isIsoDate(weekStart)
    ? data.selections.filter((item) => item.weekStart === weekStart)
    : data.selections;

  return {
    roles: ROLES,
    selections: filtered,
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

  if (url.pathname !== "/api/schedule") {
    sendJson(res, 404, { error: "ไม่พบ API นี้" });
    return;
  }

  if (req.method === "GET") {
    const weekStart = normalizeDate(url.searchParams.get("weekStart"));
    sendJson(res, 200, getScheduleForWeek(weekStart));
    return;
  }

  if (req.method === "POST") {
    try {
      const body = await getRequestBody(req);
      const payload = JSON.parse(body || "{}");
      const data = readData();
      const validSelection = validateSelectionPayload(payload, data.selections);
      const now = new Date().toISOString();
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
      sendJson(res, 200, {
        message: "บันทึกวันทำงานเรียบร้อย",
        schedule: getScheduleForWeek(validSelection.weekStart),
      });
    } catch (error) {
      sendJson(res, 400, { error: error.message || "บันทึกไม่สำเร็จ" });
    }
    return;
  }

  if (req.method === "DELETE") {
    const weekStart = normalizeDate(url.searchParams.get("weekStart"));
    if (!isIsoDate(weekStart)) {
      sendJson(res, 400, { error: "สัปดาห์ไม่ถูกต้อง" });
      return;
    }

    const data = readData();
    data.selections = data.selections.filter((item) => item.weekStart !== weekStart);
    writeData(data);
    sendJson(res, 200, {
      message: "ล้างข้อมูลสัปดาห์นี้แล้ว",
      schedule: getScheduleForWeek(weekStart),
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
  console.log(`Shabu workday form is running at http://localhost:${PORT}`);
});

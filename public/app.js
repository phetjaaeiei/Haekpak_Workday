const ROLES = {
  server: { label: "พนักงานเสิร์ฟ", capacity: 4 },
  dishwasher: { label: "พนักงานล้างจาน", capacity: 2 },
  slicer: { label: "พนักงานสไลด์หมู", capacity: 1 },
  prep: { label: "พนักงานเตรียมของ", capacity: 3 },
};

const DAY_NAMES = ["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์", "อาทิตย์"];
const MONTH_NAMES = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];
const REQUIRED_DAYS = 3;

const state = {
  profile: null,
  weekStart: getMonday(new Date()),
  adminWeekStart: getMonday(new Date()),
  schedule: { selections: [] },
  selectedDays: new Set(),
  adminAuthenticated: false,
  adminPassword: "",
};

const views = {
  profile: document.querySelector("#profileView"),
  schedule: document.querySelector("#scheduleView"),
  adminLogin: document.querySelector("#adminLoginView"),
  admin: document.querySelector("#adminView"),
};

const elements = {
  profileForm: document.querySelector("#profileForm"),
  nicknameInput: document.querySelector("#nicknameInput"),
  roleGrid: document.querySelector("#roleGrid"),
  quotaList: document.querySelector("#quotaList"),
  calendarGrid: document.querySelector("#calendarGrid"),
  currentRoleLabel: document.querySelector("#currentRoleLabel"),
  scheduleTitle: document.querySelector("#scheduleTitle"),
  selectionHint: document.querySelector("#selectionHint"),
  selectedCount: document.querySelector("#selectedCount"),
  selectedDaysText: document.querySelector("#selectedDaysText"),
  saveSelectionButton: document.querySelector("#saveSelectionButton"),
  statusMessage: document.querySelector("#statusMessage"),
  weekInput: document.querySelector("#weekInput"),
  prevWeekButton: document.querySelector("#prevWeekButton"),
  nextWeekButton: document.querySelector("#nextWeekButton"),
  adminWeekInput: document.querySelector("#adminWeekInput"),
  adminLoginForm: document.querySelector("#adminLoginForm"),
  adminPasswordInput: document.querySelector("#adminPasswordInput"),
  adminLoginMessage: document.querySelector("#adminLoginMessage"),
  adminPrevWeekButton: document.querySelector("#adminPrevWeekButton"),
  adminNextWeekButton: document.querySelector("#adminNextWeekButton"),
  adminNavButton: document.querySelector("#adminNavButton"),
  newProfileButton: document.querySelector("#newProfileButton"),
  homeLink: document.querySelector("#homeLink"),
  topbarSubtitle: document.querySelector("#topbarSubtitle"),
  adminSummary: document.querySelector("#adminSummary"),
  adminBoard: document.querySelector("#adminBoard"),
  adminWeekCaption: document.querySelector("#adminWeekCaption"),
  refreshAdminButton: document.querySelector("#refreshAdminButton"),
  clearWeekButton: document.querySelector("#clearWeekButton"),
};

function pad(value) {
  return String(value).padStart(2, "0");
}

function toDateInputValue(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return `${copy.getFullYear()}-${pad(copy.getMonth() + 1)}-${pad(copy.getDate())}`;
}

function fromDateInputValue(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getMonday(date) {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  return toDateInputValue(copy);
}

function addDays(dateValue, amount) {
  const date = fromDateInputValue(dateValue);
  date.setDate(date.getDate() + amount);
  return toDateInputValue(date);
}

function getWeekDates(weekStart) {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

function formatDate(dateValue) {
  const date = fromDateInputValue(dateValue);
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear() + 543}`;
}

function formatWeekRange(weekStart) {
  const end = addDays(weekStart, 6);
  return `${formatDate(weekStart)} - ${formatDate(end)}`;
}

function normalizeName(name) {
  return name.trim().replace(/\s+/g, " ");
}

function buildSelectionId(role, nickname, weekStart) {
  return `${weekStart}|${role}|${nickname.toLocaleLowerCase("th-TH")}`;
}

function showView(name) {
  Object.entries(views).forEach(([key, view]) => {
    view.classList.toggle("is-active", key === name);
  });
  elements.newProfileButton.classList.toggle("is-hidden", name === "profile");
}

function showStatus(message, type = "success") {
  if (!message) {
    elements.statusMessage.className = "status-message";
    elements.statusMessage.textContent = "";
    return;
  }

  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `status-message is-visible${type === "error" ? " is-error" : ""}`;
}

function showAdminLoginMessage(message) {
  if (!message) {
    elements.adminLoginMessage.className = "status-message";
    elements.adminLoginMessage.textContent = "";
    return;
  }

  elements.adminLoginMessage.textContent = message;
  elements.adminLoginMessage.className = "status-message is-visible is-error";
}

function showAdminGate() {
  if (state.adminAuthenticated) {
    loadAdminView();
    return;
  }

  showView("adminLogin");
  elements.topbarSubtitle.textContent = "Admin";
  showAdminLoginMessage("");
  elements.adminPasswordInput.value = "";
  window.requestAnimationFrame(() => elements.adminPasswordInput.focus());
}

function renderRoleOptions() {
  const template = document.querySelector("#roleOptionTemplate");
  elements.roleGrid.innerHTML = "";
  elements.quotaList.innerHTML = "";

  Object.entries(ROLES).forEach(([role, meta], index) => {
    const fragment = template.content.cloneNode(true);
    const label = fragment.querySelector("label");
    const input = fragment.querySelector("input");
    const strong = fragment.querySelector("strong");
    const small = fragment.querySelector("small");

    input.value = role;
    input.id = `role-${role}`;
    input.required = true;
    input.checked = index === 0;
    label.setAttribute("for", input.id);
    strong.textContent = meta.label;
    small.textContent = `รับได้ ${meta.capacity} คนต่อวัน`;
    elements.roleGrid.appendChild(fragment);

    const quota = document.createElement("div");
    quota.className = "quota-item";
    quota.innerHTML = `<strong>${meta.label}</strong><span>${meta.capacity} คนต่อวัน</span>`;
    elements.quotaList.appendChild(quota);
  });
}

async function fetchSchedule(weekStart) {
  const response = await fetch(`/api/schedule?weekStart=${encodeURIComponent(weekStart)}`);
  if (!response.ok) {
    throw new Error("โหลดตารางไม่สำเร็จ");
  }
  return response.json();
}

function getExistingCurrentSelection() {
  if (!state.profile) {
    return null;
  }

  const id = buildSelectionId(state.profile.role, state.profile.nickname, state.weekStart);
  return state.schedule.selections.find((selection) => selection.id === id) || null;
}

function getNamesForDay(role, day) {
  const currentId = state.profile
    ? buildSelectionId(state.profile.role, state.profile.nickname, state.weekStart)
    : "";

  const names = [];
  state.schedule.selections.forEach((selection) => {
    if (selection.role !== role || selection.weekStart !== state.weekStart) {
      return;
    }
    if ((selection.days || []).includes(day) && selection.id !== currentId) {
      names.push({ name: selection.nickname, current: false });
    }
  });

  if (state.profile && state.profile.role === role && state.selectedDays.has(day)) {
    names.push({ name: state.profile.nickname, current: true });
  }

  return names;
}

function renderCalendar() {
  const role = state.profile.role;
  const roleMeta = ROLES[role];
  const weekDates = getWeekDates(state.weekStart);

  elements.currentRoleLabel.textContent = roleMeta.label;
  elements.scheduleTitle.textContent = `เลือกวันทำงานของ ${state.profile.nickname}`;
  elements.selectionHint.textContent = `สัปดาห์ ${formatWeekRange(state.weekStart)} เลือกให้ครบ ${REQUIRED_DAYS} วัน`;
  elements.weekInput.value = state.weekStart;
  elements.topbarSubtitle.textContent = `กำลังเลือก: ${roleMeta.label}`;
  elements.calendarGrid.innerHTML = "";

  weekDates.forEach((day, index) => {
    const names = getNamesForDay(role, day);
    const isSelected = state.selectedDays.has(day);
    const isFull = names.length >= roleMeta.capacity;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "day-card";
    card.disabled = isFull && !isSelected;
    card.classList.toggle("is-selected", isSelected);
    card.classList.toggle("is-full", isFull);
    card.dataset.day = day;

    const listHtml = names.length
      ? names
          .map((item) => `<span class="name-chip${item.current ? " current" : ""}">${escapeHtml(item.name)}</span>`)
          .join("")
      : `<span class="empty-text">ยังไม่มีคนเลือก</span>`;
    const fillPercent = Math.min(100, Math.round((names.length / roleMeta.capacity) * 100));

    card.innerHTML = `
      <header>
        <div>
          <div class="day-name">${DAY_NAMES[index]}</div>
          <div class="date-text">${formatDate(day)}</div>
        </div>
        <span class="capacity-pill">${names.length}/${roleMeta.capacity}</span>
      </header>
      <div class="slot-meter" aria-hidden="true"><span style="width: ${fillPercent}%"></span></div>
      <div class="day-status">${isFull ? "เต็มแล้ว" : "ยังเลือกได้"}</div>
      <div class="name-list">${listHtml}</div>
      <span class="day-action">${isSelected ? "เลือกแล้ว" : isFull ? "เต็ม" : "เลือกวันนี้"}</span>
    `;

    card.addEventListener("click", () => toggleDay(day));
    elements.calendarGrid.appendChild(card);
  });

  renderSelectionToolbar();
}

function renderSelectionToolbar() {
  const selected = [...state.selectedDays].sort();
  elements.selectedCount.textContent = `เลือกแล้ว ${selected.length}/${REQUIRED_DAYS} วัน`;
  elements.selectedDaysText.textContent = selected.length
    ? selected.map(formatDate).join(", ")
    : "ยังไม่ได้เลือกวัน";
  elements.saveSelectionButton.disabled = selected.length !== REQUIRED_DAYS;
}

function toggleDay(day) {
  showStatus("");
  if (state.selectedDays.has(day)) {
    state.selectedDays.delete(day);
    renderCalendar();
    return;
  }

  if (state.selectedDays.size >= REQUIRED_DAYS) {
    showStatus(`เลือกได้สูงสุด ${REQUIRED_DAYS} วันต่อสัปดาห์`, "error");
    return;
  }

  state.selectedDays.add(day);
  renderCalendar();
}

async function enterSchedule(profile) {
  state.profile = profile;
  localStorage.setItem("shabu.lastProfile", JSON.stringify(profile));
  showView("schedule");
  showStatus("");
  await loadScheduleView();
}

async function loadScheduleView() {
  try {
    state.schedule = await fetchSchedule(state.weekStart);
    const existing = getExistingCurrentSelection();
    state.selectedDays = new Set(existing?.days || []);
    renderCalendar();
  } catch (error) {
    showStatus(error.message, "error");
  }
}

async function saveSelection() {
  if (!state.profile || state.selectedDays.size !== REQUIRED_DAYS) {
    showStatus(`กรุณาเลือกให้ครบ ${REQUIRED_DAYS} วัน`, "error");
    return;
  }

  elements.saveSelectionButton.disabled = true;
  showStatus("กำลังบันทึก...");

  try {
    const response = await fetch("/api/schedule", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        nickname: state.profile.nickname,
        role: state.profile.role,
        weekStart: state.weekStart,
        days: [...state.selectedDays],
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "บันทึกไม่สำเร็จ");
    }
    state.schedule = result.schedule;
    showStatus(result.message);
    renderCalendar();
  } catch (error) {
    showStatus(error.message, "error");
    renderSelectionToolbar();
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setWeek(offset, mode = "schedule") {
  if (mode === "admin") {
    state.adminWeekStart = addDays(state.adminWeekStart, offset * 7);
    loadAdminView();
    return;
  }

  state.weekStart = addDays(state.weekStart, offset * 7);
  loadScheduleView();
}

async function loadAdminView() {
  if (!state.adminAuthenticated) {
    showAdminGate();
    return;
  }

  showView("admin");
  elements.adminWeekInput.value = state.adminWeekStart;
  elements.topbarSubtitle.textContent = "Admin";
  elements.adminWeekCaption.textContent = `สัปดาห์ ${formatWeekRange(state.adminWeekStart)}`;

  try {
    const schedule = await fetchSchedule(state.adminWeekStart);
    renderAdmin(schedule);
  } catch (error) {
    elements.adminBoard.innerHTML = `<div class="status-message is-visible is-error">${escapeHtml(error.message)}</div>`;
  }
}

function renderAdmin(schedule) {
  const weekDates = getWeekDates(state.adminWeekStart);
  const selections = schedule.selections || [];
  elements.adminSummary.innerHTML = "";
  elements.adminBoard.innerHTML = "";

  Object.entries(ROLES).forEach(([role, meta]) => {
    const people = selections.filter((selection) => selection.role === role).length;
    const filledSlots = selections
      .filter((selection) => selection.role === role)
      .reduce((total, selection) => total + (selection.days || []).length, 0);
    const totalSlots = meta.capacity * 7;

    const summary = document.createElement("div");
    summary.className = "summary-card";
    summary.innerHTML = `<strong>${meta.label}</strong><span>${people} คน / ${filledSlots} จาก ${totalSlots} ช่อง</span>`;
    elements.adminSummary.appendChild(summary);
  });

  Object.entries(ROLES).forEach(([role, meta]) => {
    const section = document.createElement("section");
    section.className = "role-table";
    section.innerHTML = `
      <h2>
        ${meta.label}
        <span>รับได้ ${meta.capacity} คนต่อวัน</span>
      </h2>
      <div class="admin-grid"></div>
    `;

    const grid = section.querySelector(".admin-grid");
    weekDates.forEach((day, index) => {
      const names = selections
        .filter((selection) => selection.role === role && (selection.days || []).includes(day))
        .map((selection) => selection.nickname)
        .sort((a, b) => a.localeCompare(b, "th"));
      const dayCell = document.createElement("div");
      dayCell.className = "admin-day";
      dayCell.innerHTML = `
        <strong>${DAY_NAMES[index]}</strong>
        <small>${formatDate(day)} (${names.length}/${meta.capacity})</small>
        <div class="name-list">
          ${
            names.length
              ? names.map((name) => `<span class="name-chip">${escapeHtml(name)}</span>`).join("")
              : `<span class="empty-text">ยังไม่มีรายชื่อ</span>`
          }
        </div>
      `;
      grid.appendChild(dayCell);
    });

    elements.adminBoard.appendChild(section);
  });
}

async function clearAdminWeek() {
  const confirmed = window.confirm("ล้างข้อมูลการเลือกวันของสัปดาห์นี้ทั้งหมด?");
  if (!confirmed) {
    return;
  }

  const response = await fetch(`/api/schedule?weekStart=${encodeURIComponent(state.adminWeekStart)}`, {
    method: "DELETE",
    headers: {
      "x-admin-password": state.adminPassword,
    },
  });
  const result = await response.json();
  if (!response.ok) {
    window.alert(result.error || "ล้างข้อมูลไม่สำเร็จ");
    return;
  }
  renderAdmin(result.schedule);
}

function bindEvents() {
  elements.profileForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(elements.profileForm);
    const nickname = normalizeName(formData.get("nickname") || "");
    const role = formData.get("role");

    if (!nickname || !ROLES[role]) {
      return;
    }

    enterSchedule({ nickname, role });
  });

  elements.saveSelectionButton.addEventListener("click", saveSelection);
  elements.prevWeekButton.addEventListener("click", () => setWeek(-1));
  elements.nextWeekButton.addEventListener("click", () => setWeek(1));
  elements.weekInput.addEventListener("change", () => {
    state.weekStart = getMonday(fromDateInputValue(elements.weekInput.value));
    loadScheduleView();
  });

  elements.adminNavButton.addEventListener("click", () => showAdminGate());
  elements.adminLoginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = elements.adminPasswordInput.value;

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error("รหัสผ่านไม่ถูกต้อง");
      }

      state.adminAuthenticated = true;
      state.adminPassword = password;
      showAdminLoginMessage("");
      loadAdminView();
      return;
    } catch (error) {
      showAdminLoginMessage(error.message || "รหัสผ่านไม่ถูกต้อง");
      elements.adminPasswordInput.select();
    }
  });
  elements.refreshAdminButton.addEventListener("click", () => loadAdminView());
  elements.adminPrevWeekButton.addEventListener("click", () => setWeek(-1, "admin"));
  elements.adminNextWeekButton.addEventListener("click", () => setWeek(1, "admin"));
  elements.adminWeekInput.addEventListener("change", () => {
    state.adminWeekStart = getMonday(fromDateInputValue(elements.adminWeekInput.value));
    loadAdminView();
  });
  elements.clearWeekButton.addEventListener("click", clearAdminWeek);

  elements.newProfileButton.addEventListener("click", () => {
    showView("profile");
    elements.topbarSubtitle.textContent = "เลือกวันทำงานประจำสัปดาห์";
  });
  elements.homeLink.addEventListener("click", (event) => {
    event.preventDefault();
    showView("profile");
    elements.topbarSubtitle.textContent = "เลือกวันทำงานประจำสัปดาห์";
  });
}

function restoreLastProfile() {
  const rawProfile = localStorage.getItem("shabu.lastProfile");
  if (!rawProfile) {
    return;
  }

  try {
    const profile = JSON.parse(rawProfile);
    if (profile.nickname) {
      elements.nicknameInput.value = profile.nickname;
    }
    const roleInput = document.querySelector(`input[name="role"][value="${profile.role}"]`);
    if (roleInput) {
      roleInput.checked = true;
    }
  } catch (error) {
    localStorage.removeItem("shabu.lastProfile");
  }
}

function init() {
  renderRoleOptions();
  restoreLastProfile();
  bindEvents();
  elements.weekInput.value = state.weekStart;
  elements.adminWeekInput.value = state.adminWeekStart;
}

init();

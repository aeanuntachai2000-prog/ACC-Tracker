/* =========================================================
   ACC TRACKER
   Supabase Authentication + Database
   ========================================================= */


/* 1. SUPABASE CONFIGURATION */

const SUPABASE_URL = "https://qdbilhxwwreiirlteqfw.supabase.co";

const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_eTUJI_8P2gvA6xEoIACFrQ_GdVzbccy";

if (!window.supabase) {
  throw new Error("Supabase SDK not loaded");
}

const sbClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);


/* 2. GLOBAL STATE */

const pageMeta = {
  dashboard: ["Dashboard", "ภาพรวมการจัดการงานบัญชีของทุกบริษัท", "▦"],
  companies: ["Companies", "จัดการข้อมูลและภาพรวมของบริษัททั้งหมด", "▤"],
  tasks: ["Tasks", "ติดตามและจัดการงานบัญชีทุกบริษัท", "☷"],
  calendar: ["Calendar", "ปฏิทินกำหนดส่งและตารางงาน", "▦"],
  reports: ["Reports", "รายงานและวิเคราะห์ผลการดำเนินงาน", "▥"],
  documents: ["Documents", "จัดเก็บและค้นหาเอกสารประกอบงาน", "▧"],
  notifications: ["Notifications", "การแจ้งเตือนและกิจกรรมล่าสุด", "♧"],
  settings: ["Settings", "ตั้งค่าแอปและการเชื่อมต่อระบบ", "⚙"]
};

const pageContent = document.getElementById("pageContent");
const sidebar = document.getElementById("sidebar");
const scrim = document.getElementById("scrim");
const toast = document.getElementById("toast");

let toastTimer;
let currentPage = "dashboard";
let companies = [];
let tasks = [];
let currentUser = null;
let isLoading = false;

let currentMonthIndex = new Date().getMonth();
let currentBuddhistYear = new Date().getFullYear() + 543;

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
];

const TASK_STATUSES = [
  "ยังไม่เริ่ม",
  "กำลังดำเนินการ",
  "เสร็จแล้ว",
  "ไม่เกี่ยวข้อง"
];


/* 3. UTILITIES */

function showToast(message) {
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("th-TH");
}

function getCompanyName(company) {
  return company.company_name ||
    company.name ||
    company.company ||
    company.company_code ||
    company.company_id ||
    "ไม่ระบุชื่อบริษัท";
}

function getCompanyCode(company) {
  return company.company_code ||
    company.code ||
    company.company_id ||
    company.id ||
    "-";
}

function getTaskCompanyName(task) {
  const company = companies.find(c =>
    String(c.company_id) === String(task.company_id)
  );

  return task.company_name ||
    (company ? getCompanyName(company) : task.company_id) ||
    "ไม่ระบุบริษัท";
}

function getTaskPeriod(task) {
  const month = task.month ?? "";
  const year = task.buddhist_year ?? "";

  return [month, year].filter(Boolean).join(" / ") || "-";
}


/* 4. CONNECTION STATUS */

function setConnectionStatus(title, description, connected = false) {
  const titleEl = document.getElementById("connectionTitle");
  const descEl = document.getElementById("connectionDescription");
  const statusEl = document.getElementById("connectionStatus");
  const dbStatus = document.getElementById("databaseStatus");

  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = description;
  if (dbStatus) dbStatus.textContent = connected ? "ONLINE" : "OFFLINE";

  if (statusEl) {
    statusEl.classList.toggle("connected", connected);
  }
}

function fadeOutLoadingScreen() {
  const loading = document.getElementById("accLoadingScreen");

  if (!loading) {
    return Promise.resolve();
  }

  loading.classList.add("fade-out");

  return new Promise(resolve => {
    let finished = false;

    const onEnd = () => {
      if (finished) return;
      finished = true;

      clearTimeout(fallbackTimer);
      loading.removeEventListener("transitionend", onEnd);
      loading.remove();
      resolve();
    };

    // Fallback: on some phones transitionend never fires
    // (reduced motion / low power mode), which left the loading
    // screen stuck and the app locked.
    const fallbackTimer = setTimeout(onEnd, 800);

    loading.addEventListener("transitionend", onEnd, { once: true });
  });
}

async function unlockApp() {
  const shell = document.querySelector(".app-shell");

  if (shell) {
    shell.classList.add("auth-ready");
  }

  await fadeOutLoadingScreen();
}


/* 5. LOGIN SCREEN */

function createLoginScreen() {
  if (document.getElementById("accLoginOverlay")) return;

  const overlay = document.createElement("div");

  overlay.id = "accLoginOverlay";

  overlay.innerHTML = `
    <style>
      #accLoginOverlay {
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        background: #111416;
        color: #fff;
        font-family: inherit;
      }

      #accLoginOverlay .login-card {
        width: 100%;
        max-width: 390px;
        padding: 34px;
        border: 1px solid rgba(255,255,255,.1);
        border-radius: 18px;
        background: #1b2021;
        box-shadow: 0 20px 70px rgba(0,0,0,.4);
      }

      #accLoginOverlay .login-brand {
        text-align: center;
        margin-bottom: 30px;
      }

      #accLoginOverlay .login-logo {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 58px;
        height: 58px;
        border-radius: 16px;
        background: #b99a60;
        color: #171717;
        font-size: 22px;
        font-weight: 800;
        margin-bottom: 14px;
      }

      #accLoginOverlay h2 {
        margin: 0;
        font-size: 23px;
      }

      #accLoginOverlay .login-subtitle {
        color: #a0a7a5;
        font-size: 13px;
        margin-top: 8px;
      }

      #accLoginOverlay label {
        display: block;
        margin: 16px 0 7px;
        color: #c5c9c6;
        font-size: 13px;
      }

      #accLoginOverlay input {
        box-sizing: border-box;
        width: 100%;
        padding: 13px 14px;
        border: 1px solid #3a4140;
        border-radius: 9px;
        outline: none;
        background: #131718;
        color: #fff;
        font-size: 15px;
      }

      #accLoginOverlay input:focus {
        border-color: #b99a60;
      }

      #accLoginOverlay button {
        width: 100%;
        margin-top: 23px;
        padding: 14px;
        border: 0;
        border-radius: 9px;
        background: #b99a60;
        color: #171717;
        font-size: 15px;
        font-weight: 700;
        cursor: pointer;
      }

      #accLoginOverlay button:disabled {
        opacity: .6;
        cursor: wait;
      }

      #accLoginError {
        display: none;
        margin-top: 14px;
        padding: 10px;
        border-radius: 8px;
        background: rgba(220,70,70,.12);
        color: #ff9292;
        font-size: 13px;
      }
    </style>

    <div class="login-card">
      <div class="login-brand">
        <div class="login-logo">AT</div>
        <h2>ACC Tracker</h2>
        <div class="login-subtitle">
          Accounting Work Management
        </div>
      </div>

      <form id="accLoginForm">
        <label for="accLoginEmail">อีเมล</label>
        <input
          type="email"
          id="accLoginEmail"
          placeholder="Enter your email"
          autocomplete="username"
          required
        >

        <label for="accLoginPassword">รหัสผ่าน</label>
        <input
          type="password"
          id="accLoginPassword"
          placeholder="Enter your password"
          autocomplete="current-password"
          required
        >

        <button type="submit" id="accLoginButton">
          เข้าสู่ระบบ
        </button>

        <div id="accLoginError"></div>
      </form>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById("accLoginForm")
    .addEventListener("submit", handleLogin);
}

function showLoginError(message) {
  const error = document.getElementById("accLoginError");

  if (!error) return;

  error.textContent = message;
  error.style.display = "block";
}

async function handleLogin(event) {
  event.preventDefault();

  const email = document.getElementById("accLoginEmail").value.trim();
  const password = document.getElementById("accLoginPassword").value;
  const button = document.getElementById("accLoginButton");
  const error = document.getElementById("accLoginError");

  error.style.display = "none";
  button.disabled = true;
  button.textContent = "กำลังเข้าสู่ระบบ...";

  try {
    const { data, error: loginError } =
      await sbClient.auth.signInWithPassword({
        email,
        password
      });

    if (loginError) throw loginError;

    currentUser = data.user;

    document.getElementById("accLoginOverlay")?.remove();

    await unlockApp();

    await startApplication();

  } catch (err) {
    showLoginError(err.message || "ไม่สามารถเข้าสู่ระบบได้");

  } finally {
    button.disabled = false;
    button.textContent = "เข้าสู่ระบบ";
  }
}


/* 6. AUTHENTICATION */

async function checkAuthentication() {
  setConnectionStatus("Connecting...", "Checking authentication");

  try {
    const { data, error } = await sbClient.auth.getSession();

    if (error) throw error;

    if (!data.session) {
      await fadeOutLoadingScreen();
      createLoginScreen();
      return false;
    }

    currentUser = data.session.user;

    await unlockApp();

    return true;

  } catch (err) {
    console.error("Authentication error:", err);

    setConnectionStatus(
      "Connection error",
      "ตรวจสอบการเชื่อมต่อ"
    );

    await fadeOutLoadingScreen();
    createLoginScreen();
    showLoginError(err.message);

    return false;
  }
}

async function logout() {
  const confirmed = confirm("ต้องการออกจากระบบหรือไม่?");

  if (!confirmed) return;

  const { error } = await sbClient.auth.signOut();

  if (error) {
    showToast("ออกจากระบบไม่สำเร็จ");
    return;
  }

  companies = [];
  tasks = [];
  currentUser = null;

  location.reload();
}


/* 7. LOAD COMPANIES */

async function loadCompanies() {
  const { data, error } = await sbClient
    .from("companies")
    .select("*")
    .order("company_id", { ascending: true });

  if (error) throw error;

  companies = data || [];

  return companies;
}


/* 8. LOAD ALL TASKS WITH PAGINATION */

async function loadTasks() {
  const pageSize = 1000;
  let from = 0;
  let allTasks = [];

  while (true) {
    const { data, error } = await sbClient
      .from("work_tasks")
      .select("*")
      .order("task_id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = data || [];

    allTasks = allTasks.concat(batch);

    if (batch.length < pageSize) break;

    from += pageSize;
  }

  tasks = allTasks;

  return tasks;
}


/* 9. UPDATE NAVIGATION COUNTS */

function updateNavigationCounts() {
  const companyCount = document.getElementById("companyNavCount");
  const taskCount = document.getElementById("taskNavCount");

  if (companyCount) {
    companyCount.textContent = formatNumber(companies.length);
  }

  if (taskCount) {
    taskCount.textContent = formatNumber(tasks.length);
  }
}


/* 10. DASHBOARD */

function getTaxMonth() {
  let taxMonthIndex = currentMonthIndex - 1;
  let taxYear = currentBuddhistYear;

  if (taxMonthIndex < 0) {
    taxMonthIndex = 11;
    taxYear -= 1;
  }

  return { year: taxYear, month: taxMonthIndex + 1 };
}

function getDueDateText(taskType, year, month) {
  const tt = String(taskType || "");

  if (tt.includes("ภ.พ.30") || tt === "VAT") {
    return "กำหนดส่ง: 23 " + THAI_MONTHS[month - 1] + " " + year;
  }

  if (tt.includes("ภ.ง.ด.")) {
    if (tt === "ภ.ง.ด.50" || tt === "ภ.ง.ด.51") {
      return "กำหนดส่ง: ระบุตามกฎหมาย";
    }
    return "กำหนดส่ง: 15 " + THAI_MONTHS[month - 1] + " " + year;
  }

  if (tt === "ภ.พ.36") {
    return "กำหนดส่ง: ระบุตามกฎหมาย";
  }

  return "-";
}

function renderDashboardData() {
  const tax = getTaxMonth();
  const taxYear = tax.year;
  const taxMonth = tax.month;

  const filteredTasks = tasks.filter(t =>
    String(t.buddhist_year) === String(taxYear) &&
    String(t.month) === String(taxMonth)
  );

  const totalCompanies = companies.length;
  const totalTasks = filteredTasks.length;
  const completed = filteredTasks.filter(t => t.status === "เสร็จแล้ว").length;
  const pending = filteredTasks.filter(t =>
    t.status === "ยังไม่เริ่ม" || t.status === "กำลังดำเนินการ"
  ).length;
  const percent = totalTasks ? (completed / totalTasks * 100) : 0;

  setText("statCompanies", formatNumber(totalCompanies));
  setText("statTasks", formatNumber(totalTasks));
  setText("statCompleted", formatNumber(completed));
  setText("statPending", formatNumber(pending));
  setText("completedPercent", percent.toFixed(1) + "%");
  setText("progressPercent", percent.toFixed(1) + "%");
  setText("progressDone", formatNumber(completed));
  setText("progressPending", formatNumber(totalTasks - completed));

  const progressFill = document.getElementById("progressFill");
  if (progressFill) {
    progressFill.style.width = percent + "%";
  }

  const taskGroups = {
    "ภาษีหัก ณ ที่จ่าย": [],
    "VAT": [],
    "งานบัญชีประจำเดือน": []
  };

  filteredTasks.forEach(t => {
    if (Object.prototype.hasOwnProperty.call(taskGroups, t.task_type)) {
      taskGroups[t.task_type].push(t);
    }
  });

  const list = document.getElementById("dashboardTaskList");
  if (list) {
    let html = "";

    Object.entries(taskGroups).forEach(([taskType, typeTasks]) => {
      html += `
        <div class="task-group">
          <div class="task-group-header">
            <span class="task-group-type">${escapeHTML(taskType)}</span>
            <span class="task-group-count">${typeTasks.length}</span>
          </div>
          <div class="task-group-items">
            ${typeTasks.map(task => `
              <div class="task-row">
                <div class="task-symbol doc">☷</div>
                <div class="task-info">
                  <strong>${escapeHTML(getTaskCompanyName(task))}</strong>
                  <div class="muted small">${escapeHTML(task.company_code || "")}</div>
                </div>
                <div class="task-meta">
                  <span class="status-pill">${escapeHTML(task.status)}</span>
                  <span class="due-date">${getDueDateText(taskType, taxYear, taxMonth)}</span>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    });

    if (totalTasks === 0) {
      html = `
        <div class="task-row">
          <div class="task-info">
            <strong>ไม่พบงานในเดือนนี้</strong>
            <span>เดือนภาษี ${THAI_MONTHS[tax.month - 1]} ${taxYear}</span>
          </div>
        </div>
      `;
    }

    list.innerHTML = html;
  }

  // รายงานบริษัทที่มีงานในเดือนภาษีนี้
  const companyMap = {};
  filteredTasks.forEach(t => {
    const cid = String(t.company_id);
    if (!companyMap[cid]) {
      companyMap[cid] = {
        name: getTaskCompanyName(t),
        code: t.company_code || "",
        total: 0,
        completed: 0,
        pending: 0,
        tasks: []
      };
    }
    companyMap[cid].total++;
    if (t.status === "เสร็จแล้ว") companyMap[cid].completed++;
    if (t.status === "ยังไม่เริ่ม" || t.status === "กำลังดำเนินการ") companyMap[cid].pending++;
    companyMap[cid].tasks.push(t);
  });

  const companyList = document.getElementById("dashboardCompanyList");
  if (companyList) {
    const companiesSorted = Object.entries(companyMap)
      .sort((a, b) => b[1].pending - a[1].pending);

    let companyHtml = `
      <div class="section-heading" style="margin-top:20px">
        <div>
          <span class="section-kicker">COMPANIES</span>
          <h2>สรุปตามบริษัท</h2>
        </div>
      </div>
      <div class="company-list">
        ${companiesSorted.map(([cid, comp]) => {
          const pct = comp.total ? (comp.completed / comp.total * 100) : 0;
          return `
            <div class="task-company-card" onclick="renderCompanyDashboard('${escapeHTML(cid)}')">
              <div class="task-company-header">
                <span class="task-company-name">${escapeHTML(comp.name)}</span>
                <span class="task-company-code">${escapeHTML(comp.code)}</span>
                <span class="task-company-progress">${pct.toFixed(0)}%</span>
              </div>
              <div class="task-company-stats">
                <span>${comp.total} งาน</span>
                <span class="green-text">เสร็จ ${comp.completed}</span>
                <span class="red-text">ค้าง ${comp.pending}</span>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
    companyList.innerHTML = companyHtml;
  }

  setText("lastUpdated", "เดือนภาษี: " + THAI_MONTHS[tax.month - 1] + " " + taxYear + " • โหลดจาก Supabase เรียบร้อยแล้ว");

  setConnectionStatus("Connected", "Supabase database", true);
}

function renderPendingTasks() {
  currentPage = "pending";

  const tax = getTaxMonth();
  const taxYear = tax.year;
  const taxMonth = tax.month;

  const allMonthTasks = tasks.filter(t =>
    String(t.buddhist_year) === String(taxYear) &&
    String(t.month) === String(taxMonth)
  );

  const pendingTasks = allMonthTasks.filter(t =>
    t.status === "ยังไม่เริ่ม" || t.status === "กำลังดำเนินการ"
  );

  function countByStatus(taskList) {
    return {
      total: taskList.length,
      completed: taskList.filter(t => t.status === "เสร็จแล้ว").length,
      inProgress: taskList.filter(t => t.status === "กำลังดำเนินการ").length,
      notStarted: taskList.filter(t => t.status === "ยังไม่เริ่ม").length,
      notRelevant: taskList.filter(t => t.status === "ไม่เกี่ยวข้อง").length
    };
  }

  function progressPercent(taskList) {
    const relevant = taskList.filter(t => t.status !== "ไม่เกี่ยวข้อง").length;
    const completed = taskList.filter(t => t.status === "เสร็จแล้ว").length;
    return relevant ? (completed / relevant * 100) : 0;
  }

  function categorizeTaskType(taskType) {
    const tt = String(taskType || "");
    if (tt.includes("ภ.พ.30") || tt.includes("VAT")) return "VAT";
    if (tt.includes("ภ.ง.ด.")) return "ภาษีหัก ณ ที่จ่าย";
    return "งานบัญชีประจำเดือน";
  }

  const categoryOrder = ["ภาษีหัก ณ ที่จ่าย", "VAT", "งานบัญชีประจำเดือน"];

  const allTaskTypes = [...new Set(pendingTasks.map(t => t.task_type).filter(Boolean))];

  const categories = {};
  categoryOrder.forEach(cat => { categories[cat] = []; });
  allTaskTypes.forEach(tt => {
    const cat = categorizeTaskType(tt);
    if (!categories[cat]) categories[cat] = [];
    if (!categories[cat].includes(tt)) categories[cat].push(tt);
  });

  const overallStats = countByStatus(allMonthTasks);

  pageContent.innerHTML = `
    <div class="page-heading">
      <div>
        <div class="eyebrow">ACC TRACKER / WORKSPACE</div>
        <h1>งานยังไม่เสร็จ</h1>
        <p>เดือนภาษี ${THAI_MONTHS[tax.month - 1]} ${taxYear} • รายการงานที่ค้างดำเนินการ</p>
      </div>
      <button class="text-button" onclick="renderDashboard()">กลับสู่ Dashboard</button>
    </div>

    <div class="module-view">
      <div class="progress-summary-card">
        <div class="progress-stats">
          <div class="stat-item">
            <span class="stat-label">งานทั้งหมด</span>
            <span class="stat-value">${overallStats.total}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">เสร็จแล้ว</span>
            <span class="stat-value green-text">${overallStats.completed}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">กำลังดำเนินการ</span>
            <span class="stat-value amber-text">${overallStats.inProgress}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">ยังไม่เริ่ม</span>
            <span class="stat-value red-text">${overallStats.notStarted}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">งานคงเหลือ</span>
            <span class="stat-value">${overallStats.inProgress + overallStats.notStarted}</span>
          </div>
        </div>
        <div class="progress-overall">
          <div class="progress-label">ความคืบหน้ารวม: <span id="pendingOverallPercent">${progressPercent(allMonthTasks).toFixed(1)}%</span></div>
          <div class="progress-track">
            <div class="progress-fill" id="pendingOverallFill" style="width:${progressPercent(allMonthTasks)}%"></div>
          </div>
        </div>
      </div>

      ${categoryOrder.map(category => {
        const typeTaskTypes = categories[category] || [];
        if (typeTaskTypes.length === 0) return "";

        const categoryPending = pendingTasks.filter(t => categorizeTaskType(t.task_type) === category);

        const companies = {};
        categoryPending.forEach(t => {
          const cid = String(t.company_id);
          if (!companies[cid]) {
            companies[cid] = { name: getTaskCompanyName(t), code: t.company_code || "", tasks: [] };
          }
          companies[cid].tasks.push(t);
        });

        return `
          <div class="task-type-section">
            <div class="task-type-header">
              <span class="task-type-name">${escapeHTML(category)}</span>
              <span class="task-type-stats">
                ${typeTaskTypes.join(", ")} • ${categoryPending.length} รายการค้าง
              </span>
              <span class="task-type-progress">${progressPercent(categoryPending).toFixed(1)}%</span>
            </div>
            <div class="task-type-progress-bar">
              <div class="progress-fill" style="width:${progressPercent(categoryPending)}%"></div>
            </div>
            <div class="task-companies">
              ${Object.entries(companies).map(([cid, comp]) => {
                const compTasks = comp.tasks.filter(t => categorizeTaskType(t.task_type) === category);
                const compPending = compTasks.filter(t => t.status === "ยังไม่เริ่ม" || t.status === "กำลังดำเนินการ");
                if (compPending.length === 0) return "";

                return `
                  <div class="task-company-card" onclick="filterPendingByCompany('${escapeHTML(cid)}')">
                    <div class="task-company-header">
                      <span class="task-company-name">${escapeHTML(comp.name)}</span>
                      <span class="task-company-code">${escapeHTML(comp.code)}</span>
                      <span class="task-company-progress">${compPending.length} รายการ</span>
                    </div>
                    <div class="task-company-stats">
                      <span>${compTasks.length} งานในหมวดนี้</span>
                      <span class="red-text">ค้าง ${compPending.length}</span>
                    </div>
                    <div class="task-company-items">
                      ${compPending.map(task => `
                        <div class="task-row">
                          <div class="task-symbol doc">☷</div>
                          <div class="task-info">
                            <strong>${escapeHTML(task.task_type)}</strong>
                            <div class="muted small">${escapeHTML(task.status)}</div>
                          </div>
                          <div class="task-meta">
                            <select class="filter-chip task-status-select" data-task-id="${escapeHTML(task.task_id)}" style="max-width:170px">
                              ${TASK_STATUSES.map(status => `
                                <option value="${escapeHTML(status)}" ${task.status === status ? "selected" : ""}>
                                  ${escapeHTML(status)}
                                </option>
                              `).join("")}
                            </select>
                            <span class="due-date">${getDueDateText(task.task_type, taxYear, taxMonth)}</span>
                            ${task.notes ? `<span class="task-note">${escapeHTML(task.notes)}</span>` : ""}
                          </div>
                        </div>
                      `).join("")}
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
        `;
      }).join("")}

      ${pendingTasks.length === 0 ? `
        <div class="module-empty">
          <div class="empty-icon">✓</div>
          <strong>ไม่มีงานค้างในรอบนี้</strong>
          <p>งานทั้งหมดในเดือนภาษี ${THAI_MONTHS[tax.month - 1]} ${taxYear} เสร็จแล้วหรือไม่เกี่ยวข้อง</p>
        </div>
      ` : ""}
    </div>

    <div class="footer-note">
      ACC TRACKER <span>•</span> VERSION 0.2
    </div>
  `;

  pageContent.querySelectorAll(".task-status-select").forEach(select => {
    select.addEventListener("change", async event => {
      await updateTaskStatus(
        event.target.dataset.taskId,
        event.target.value,
        event.target
      );
      renderPendingTasks();
    });
  });

  location.hash = "pending";
}

function renderTasksByStatus(filterType) {
  currentPage = "tasklist";

  const tax = getTaxMonth();
  const taxYear = tax.year;
  const taxMonth = tax.month;

  const allMonthTasks = tasks.filter(t =>
    String(t.buddhist_year) === String(taxYear) &&
    String(t.month) === String(taxMonth)
  );

  let filteredTasks = [];
  let title = "";

  if (filterType === "completed") {
    filteredTasks = allMonthTasks.filter(t => t.status === "เสร็จแล้ว");
    title = "งานเสร็จแล้ว";
  } else if (filterType === "pending") {
    filteredTasks = allMonthTasks.filter(t =>
      t.status === "ยังไม่เริ่ม" || t.status === "กำลังดำเนินการ"
    );
    title = "งานยังไม่เสร็จ";
  } else {
    filteredTasks = allMonthTasks;
    title = "งานทั้งหมด";
  }

  function categorizeTaskType(taskType) {
    const tt = String(taskType || "");
    if (tt.includes("ภ.พ.30") || tt.includes("VAT")) return "VAT";
    if (tt.includes("ภ.ง.ด.")) return "ภาษีหัก ณ ที่จ่าย";
    return "งานบัญชีประจำเดือน";
  }

  const categoryOrder = ["ภาษีหัก ณ ที่จ่าย", "VAT", "งานบัญชีประจำเดือน"];

  pageContent.innerHTML = `
    <div class="page-heading">
      <div>
        <div class="eyebrow">ACC TRACKER / WORKSPACE</div>
        <h1>${escapeHTML(title)}</h1>
        <p>เดือนภาษี ${THAI_MONTHS[tax.month - 1]} ${taxYear} • ${filteredTasks.length} รายการ</p>
      </div>
      <button class="text-button" onclick="renderDashboard()">กลับสู่ Dashboard</button>
    </div>

    <div class="module-view">
      ${categoryOrder.map(category => {
        const typeTasks = filteredTasks.filter(t => categorizeTaskType(t.task_type) === category);
        if (typeTasks.length === 0) return "";

        return `
          <div class="task-type-section">
            <div class="task-type-header">
              <span class="task-type-name">${escapeHTML(category)}</span>
              <span class="task-type-stats">${typeTasks.length} รายการ</span>
            </div>
            <div class="task-company-items">
              ${typeTasks.map(task => `
                <div class="task-row">
                  <div class="task-symbol doc">☷</div>
                  <div class="task-info">
                    <strong>${escapeHTML(getTaskCompanyName(task))}</strong>
                    <div class="muted small">${escapeHTML(task.company_code || "")} • ${escapeHTML(task.task_type)}</div>
                  </div>
                  <div class="task-meta">
                    <span class="status-pill ${task.status === 'เสร็จแล้ว' ? 'green-text' : ''}">${escapeHTML(task.status)}</span>
                    <span class="due-date">${getDueDateText(task.task_type, taxYear, taxMonth)}</span>
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        `;
      }).join("")}

      ${filteredTasks.length === 0 ? `
        <div class="module-empty">
          <div class="empty-icon">✓</div>
          <strong>ไม่พบงานในหมวดนี้</strong>
          <p>เดือนภาษี ${THAI_MONTHS[tax.month - 1]} ${taxYear}</p>
        </div>
      ` : ""}
    </div>

    <div class="footer-note">
      ACC TRACKER <span>•</span> VERSION 0.2
    </div>
  `;

  location.hash = "tasklist-" + filterType;
}

function renderCompanyDashboard(companyId) {
  currentPage = "company";

  const tax = getTaxMonth();
  const taxYear = tax.year;
  const taxMonth = tax.month;

  const companyTasks = tasks.filter(t =>
    String(t.buddhist_year) === String(taxYear) &&
    String(t.month) === String(taxMonth) &&
    String(t.company_id) === String(companyId)
  );

  const companyName = companyTasks[0] ? getTaskCompanyName(companyTasks[0]) : companyId;
  const companyCode = companyTasks[0]?.company_code || "";

  const total = companyTasks.length;
  const completed = companyTasks.filter(t => t.status === "เสร็จแล้ว").length;
  const pending = companyTasks.filter(t =>
    t.status === "ยังไม่เริ่ม" || t.status === "กำลังดำเนินการ"
  ).length;
  const pct = total ? (completed / total * 100) : 0;

  function categorizeTaskType(taskType) {
    const tt = String(taskType || "");
    if (tt.includes("ภ.พ.30") || tt.includes("VAT")) return "VAT";
    if (tt.includes("ภ.ง.ด.")) return "ภาษีหัก ณ ที่จ่าย";
    return "งานบัญชีประจำเดือน";
  }

  const categoryOrder = ["ภาษีหัก ณ ที่จ่าย", "VAT", "งานบัญชีประจำเดือน"];

  pageContent.innerHTML = `
    <div class="page-heading">
      <div>
        <div class="eyebrow">ACC TRACKER / WORKSPACE</div>
        <h1>งานของ ${escapeHTML(companyName)}</h1>
        <p>${escapeHTML(companyCode)} • เดือนภาษี ${THAI_MONTHS[tax.month - 1]} ${taxYear}</p>
      </div>
      <button class="text-button" onclick="renderDashboard()">กลับสู่ Dashboard</button>
    </div>

    <div class="module-view">
      <div class="progress-summary-card">
        <div class="progress-stats">
          <div class="stat-item">
            <span class="stat-label">งานทั้งหมด</span>
            <span class="stat-value">${total}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">เสร็จแล้ว</span>
            <span class="stat-value green-text">${completed}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">ค้างดำเนินการ</span>
            <span class="stat-value red-text">${pending}</span>
          </div>
        </div>
        <div class="progress-overall">
          <div class="progress-label">ความคืบหน้า: <span>${pct.toFixed(1)}%</span></div>
          <div class="progress-track">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>
        </div>
      </div>

      ${categoryOrder.map(category => {
        const typeTasks = companyTasks.filter(t => categorizeTaskType(t.task_type) === category);
        if (typeTasks.length === 0) return "";

        const typeCompleted = typeTasks.filter(t => t.status === "เสร็จแล้ว").length;
        const typePct = typeTasks.length ? (typeCompleted / typeTasks.length * 100) : 0;

        return `
          <div class="task-type-section">
            <div class="task-type-header">
              <span class="task-type-name">${escapeHTML(category)}</span>
              <span class="task-type-stats">${typeTasks.length} รายการ • เสร็จ ${typeCompleted}</span>
              <span class="task-type-progress">${typePct.toFixed(1)}%</span>
            </div>
            <div class="task-type-progress-bar">
              <div class="progress-fill" style="width:${typePct}%"></div>
            </div>
            <div class="task-company-items">
              ${typeTasks.map(task => `
                <div class="task-row">
                  <div class="task-symbol doc">☷</div>
                  <div class="task-info">
                    <strong>${escapeHTML(task.task_type)}</strong>
                    <div class="muted small">${escapeHTML(task.status)}</div>
                  </div>
                  <div class="task-meta">
                    <select class="filter-chip task-status-select" data-task-id="${escapeHTML(task.task_id)}" style="max-width:170px">
                      ${TASK_STATUSES.map(status => `
                        <option value="${escapeHTML(status)}" ${task.status === status ? "selected" : ""}>
                          ${escapeHTML(status)}
                        </option>
                      `).join("")}
                    </select>
                    <span class="due-date">${getDueDateText(task.task_type, taxYear, taxMonth)}</span>
                    ${task.notes ? `<span class="task-note">${escapeHTML(task.notes)}</span>` : ""}
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        `;
      }).join("")}

      ${companyTasks.length === 0 ? `
        <div class="module-empty">
          <div class="empty-icon">📭</div>
          <strong>ไม่มีงานของบริษัทนี้ในเดือนนี้</strong>
        </div>
      ` : ""}
    </div>

    <div class="footer-note">
      ACC TRACKER <span>•</span> VERSION 0.2
    </div>
  `;

  pageContent.querySelectorAll(".task-status-select").forEach(select => {
    select.addEventListener("change", async event => {
      await updateTaskStatus(
        event.target.dataset.taskId,
        event.target.value,
        event.target
      );
      renderCompanyDashboard(companyId);
    });
  });

  location.hash = "company-" + companyId;
}

function filterPendingByCompany(companyId) {
  currentPage = "pending";

  const tax = getTaxMonth();
  const taxYear = tax.year;
  const taxMonth = tax.month;

  const companyTasks = tasks.filter(t =>
    String(t.buddhist_year) === String(taxYear) &&
    String(t.month) === String(taxMonth) &&
    String(t.company_id) === String(companyId) &&
    (t.status === "ยังไม่เริ่ม" || t.status === "กำลังดำเนินการ")
  );

  const companyName = getTaskCompanyName(companyTasks[0]) || companyId;
  const companyCode = companyTasks[0]?.company_code || "";

  function categorizeTaskType(taskType) {
    const tt = String(taskType || "");
    if (tt.includes("ภ.พ.30") || tt.includes("VAT")) return "VAT";
    if (tt.includes("ภ.ง.ด.")) return "ภาษีหัก ณ ที่จ่าย";
    return "งานบัญชีประจำเดือน";
  }

  const categoryOrder = ["ภาษีหัก ณ ที่จ่าย", "VAT", "งานบัญชีประจำเดือน"];

  pageContent.innerHTML = `
    <div class="page-heading">
      <div>
        <div class="eyebrow">ACC TRACKER / WORKSPACE</div>
        <h1>งานของ ${escapeHTML(companyName)}</h1>
        <p>${escapeHTML(companyCode)} • เดือนภาษี ${THAI_MONTHS[tax.month - 1]} ${taxYear}</p>
      </div>
      <button class="text-button" onclick="renderPendingTasks()">กลับหน้างานค้าง</button>
    </div>

    <div class="module-view">
      ${categoryOrder.map(category => {
        const typeTasks = companyTasks.filter(t => categorizeTaskType(t.task_type) === category);
        if (typeTasks.length === 0) return "";

        return `
          <div class="task-type-section">
            <div class="task-type-header">
              <span class="task-type-name">${escapeHTML(category)}</span>
              <span class="task-type-stats">${typeTasks.length} รายการ</span>
            </div>
            <div class="task-company-items">
              ${typeTasks.map(task => `
                <div class="task-row">
                  <div class="task-symbol doc">☷</div>
                  <div class="task-info">
                    <strong>${escapeHTML(task.task_type)}</strong>
                    <div class="muted small">${escapeHTML(task.status)}</div>
                  </div>
                  <div class="task-meta">
                    <select class="filter-chip task-status-select" data-task-id="${escapeHTML(task.task_id)}" style="max-width:170px">
                      ${TASK_STATUSES.map(status => `
                        <option value="${escapeHTML(status)}" ${task.status === status ? "selected" : ""}>
                          ${escapeHTML(status)}
                        </option>
                      `).join("")}
                    </select>
                    <span class="due-date">${getDueDateText(task.task_type, taxYear, taxMonth)}</span>
                    ${task.notes ? `<span class="task-note">${escapeHTML(task.notes)}</span>` : ""}
                  </div>
                </div>
              `).join("")}
            </div>
          </div>
        `;
      }).join("")}

      ${companyTasks.length === 0 ? `
        <div class="module-empty">
          <div class="empty-icon">✓</div>
          <strong>ไม่มีงานค้างของบริษัทนี้ในเดือนนี้</strong>
        </div>
      ` : ""}
    </div>

    <div class="footer-note">
      ACC TRACKER <span>•</span> VERSION 0.2
    </div>
  `;

  pageContent.querySelectorAll(".task-status-select").forEach(select => {
    select.addEventListener("change", async event => {
      await updateTaskStatus(
        event.target.dataset.taskId,
        event.target.value,
        event.target
      );
      filterPendingByCompany(companyId);
    });
  });

  location.hash = "pending-" + companyId;
}

function setText(id, value) {
  const element = document.getElementById(id);

  if (element) element.textContent = value;
}

function getTaxMonthDisplay() {
  let taxMonthIndex = currentMonthIndex - 1;
  let taxYear = currentBuddhistYear;

  if (taxMonthIndex < 0) {
    taxMonthIndex = 11;
    taxYear -= 1;
  }

  return "เดือนภาษี: " + THAI_MONTHS[taxMonthIndex] + " " + taxYear;
}

function updateMonthDisplay() {
  const processingEl = document.getElementById("processingMonthDisplay");
  const taxEl = document.getElementById("taxMonthDisplay");

  if (processingEl) {
    processingEl.textContent = THAI_MONTHS[currentMonthIndex] + " " + currentBuddhistYear;
  }

  if (taxEl) {
    taxEl.textContent = getTaxMonthDisplay();
  }
}

function initMonthControl() {
  const prevBtn = document.getElementById("prevMonth");
  const nextBtn = document.getElementById("nextMonth");

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      currentMonthIndex -= 1;
      if (currentMonthIndex < 0) {
        currentMonthIndex = 11;
        currentBuddhistYear -= 1;
      }
      updateMonthDisplay();
      renderDashboardData();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      currentMonthIndex += 1;
      if (currentMonthIndex > 11) {
        currentMonthIndex = 0;
        currentBuddhistYear += 1;
      }
      updateMonthDisplay();
      renderDashboardData();
    });
  }

  updateMonthDisplay();
  renderDashboardData();
}


/* 11. NAVIGATION */

function setActive(page) {
  currentPage = page;

  document.querySelectorAll("[data-page]").forEach(el => {
    el.classList.toggle("active", el.dataset.page === page);
  });

  const crumb = document.getElementById("pageCrumb");

  if (crumb) {
    crumb.textContent = pageMeta[page][0];
  }
}

function renderDashboard() {
  const template = document.getElementById("dashboardTemplate");

  if (!template || !pageContent) {
    console.error("Dashboard template or pageContent not found");
    return;
  }

  pageContent.innerHTML = template.innerHTML;

  renderDashboardData();

  initMonthControl();
}

function renderModule(page) {
  if (page === "dashboard") {
    renderDashboard();
    location.hash = "dashboard";
    return;
  }

  if (page === "companies") {
    renderCompaniesPage();
    return;
  }

  if (page === "tasks") {
    renderTasksPage();
    return;
  }

  const [title, desc, icon] = pageMeta[page];

  pageContent.innerHTML = `
    <div class="page-heading">
      <div>
        <div class="eyebrow">ACC TRACKER / WORKSPACE</div>
        <h1>${escapeHTML(title)}</h1>
        <p>${escapeHTML(desc)}</p>
      </div>
    </div>

    <div class="module-view">
      <div class="module-empty">
        <div class="empty-icon">${escapeHTML(icon)}</div>
        <strong>${escapeHTML(title)}</strong>
        <p>โมดูลนี้จะพัฒนาในขั้นตอนถัดไป</p>
      </div>
    </div>

    <div class="footer-note">
      ACC TRACKER <span>•</span> VERSION 0.2
    </div>
  `;

  location.hash = page;
}


/* 12. COMPANIES PAGE */

function renderCompaniesPage() {
  pageContent.innerHTML = `
    <div class="page-heading">
      <div>
        <div class="eyebrow">ACC TRACKER / WORKSPACE</div>
        <h1>Companies</h1>
        <p>บริษัททั้งหมด ${formatNumber(companies.length)} บริษัท</p>
      </div>
    </div>

    <div class="module-view">
      <div class="module-toolbar">
        <input
          class="search-box"
          type="search"
          id="companySearch"
          placeholder="ค้นหาชื่อบริษัทหรือรหัสบริษัท..."
        >
      </div>

      <div id="companyTableContainer"></div>
    </div>

    <div class="footer-note">
      ACC TRACKER <span>•</span> LIVE DATABASE
    </div>
  `;

  document.getElementById("companySearch")
    .addEventListener("input", renderCompanyTable);

  renderCompanyTable();

  location.hash = "companies";
}

function renderCompanyTable() {
  const query = (
    document.getElementById("companySearch")?.value || ""
  ).toLowerCase();

  const filtered = companies.filter(company => {
    return (
      getCompanyName(company).toLowerCase().includes(query) ||
      String(getCompanyCode(company)).toLowerCase().includes(query)
    );
  });

  const container = document.getElementById("companyTableContainer");

  if (!container) return;

  if (!filtered.length) {
    container.innerHTML = `
      <div class="module-empty">ไม่พบข้อมูลบริษัท</div>
    `;
    return;
  }

  container.innerHTML = `
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;min-width:480px">
        <thead>
          <tr>
            <th style="text-align:left;padding:14px">รหัสบริษัท</th>
            <th style="text-align:left;padding:14px">ชื่อบริษัท</th>
          </tr>
        </thead>

        <tbody>
          ${filtered.map(company => `
            <tr style="border-top:1px solid rgba(255,255,255,.08)">
              <td style="padding:14px">
                ${escapeHTML(getCompanyCode(company))}
              </td>

              <td style="padding:14px">
                ${escapeHTML(getCompanyName(company))}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>

    <p class="muted small" style="padding:12px">
      แสดง ${formatNumber(filtered.length)}
      จาก ${formatNumber(companies.length)} บริษัท
    </p>
  `;
}


/* 13. TASKS PAGE */

function renderTasksPage() {
  pageContent.innerHTML = `
    <div class="page-heading">
      <div>
        <div class="eyebrow">ACC TRACKER / WORKSPACE</div>
        <h1>Tasks</h1>
        <p>รายการงานทั้งหมด ${formatNumber(tasks.length)} รายการ</p>
      </div>
    </div>

    <div class="module-view">
      <div class="module-toolbar" style="flex-wrap:wrap">
        <input
          class="search-box"
          type="search"
          id="taskSearch"
          placeholder="ค้นหาบริษัทหรือประเภทงาน..."
        >

        <select class="filter-chip" id="taskStatusFilter">
          <option value="">ทุกสถานะ</option>

          ${TASK_STATUSES.map(status => `
            <option value="${escapeHTML(status)}">
              ${escapeHTML(status)}
            </option>
          `).join("")}
        </select>
      </div>

      <div id="taskTableContainer"></div>
    </div>

    <div class="footer-note">
      ACC TRACKER <span>•</span> LIVE DATABASE
    </div>
  `;

  document.getElementById("taskSearch")
    .addEventListener("input", renderTaskTable);

  document.getElementById("taskStatusFilter")
    .addEventListener("change", renderTaskTable);

  renderTaskTable();

  location.hash = "tasks";
}

function renderTaskTable() {
  const query = (
    document.getElementById("taskSearch")?.value || ""
  ).toLowerCase();

  const statusFilter =
    document.getElementById("taskStatusFilter")?.value || "";

  const filtered = tasks.filter(task => {
    const companyName = getTaskCompanyName(task).toLowerCase();
    const taskType = String(task.task_type || "").toLowerCase();
    const companyCode = String(task.company_code || "").toLowerCase();

    const matchesQuery =
      companyName.includes(query) ||
      taskType.includes(query) ||
      companyCode.includes(query);

    const matchesStatus =
      !statusFilter || task.status === statusFilter;

    return matchesQuery && matchesStatus;
  });

  const container = document.getElementById("taskTableContainer");

  if (!container) return;

  if (!filtered.length) {
    container.innerHTML = `
      <div class="module-empty">ไม่พบรายการงาน</div>
    `;
    return;
  }

  const displayRows = filtered.slice(0, 200);

  container.innerHTML = `
    <div style="overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;min-width:700px">
        <thead>
          <tr>
            <th style="text-align:left;padding:12px">บริษัท</th>
            <th style="text-align:left;padding:12px">ประเภทงาน</th>
            <th style="text-align:left;padding:12px">รอบ</th>
            <th style="text-align:left;padding:12px">สถานะ</th>
          </tr>
        </thead>

        <tbody>
          ${displayRows.map(task => `
            <tr style="border-top:1px solid rgba(255,255,255,.08)">
              <td style="padding:12px">
                <strong>${escapeHTML(getTaskCompanyName(task))}</strong>
                <div class="muted small">
                  ${escapeHTML(task.company_code || "")}
                </div>
              </td>

              <td style="padding:12px">
                ${escapeHTML(task.task_type || "-")}
              </td>

              <td style="padding:12px">
                ${escapeHTML(getTaskPeriod(task))}
              </td>

              <td style="padding:12px">
                <select
                  class="filter-chip task-status-select"
                  data-task-id="${escapeHTML(task.task_id)}"
                  style="max-width:170px"
                >
                  ${TASK_STATUSES.map(status => `
                    <option
                      value="${escapeHTML(status)}"
                      ${task.status === status ? "selected" : ""}
                    >
                      ${escapeHTML(status)}
                    </option>
                  `).join("")}
                </select>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>

    <p class="muted small" style="padding:12px">
      แสดง ${formatNumber(displayRows.length)} รายการ
      จาก ${formatNumber(filtered.length)} รายการที่ค้นพบ
    </p>
  `;

  container.querySelectorAll(".task-status-select").forEach(select => {
    select.addEventListener("change", async event => {
      await updateTaskStatus(
        event.target.dataset.taskId,
        event.target.value,
        event.target
      );
    });
  });
}


/* 14. UPDATE TASK STATUS */

async function updateTaskStatus(taskId, newStatus, selectElement) {
  if (!TASK_STATUSES.includes(newStatus)) return;

  const previousStatus = tasks.find(t =>
    String(t.task_id) === String(taskId)
  )?.status;

  selectElement.disabled = true;

  try {
    const { error } = await sbClient
      .from("work_tasks")
      .update({ status: newStatus })
      .eq("task_id", taskId);

    if (error) throw error;

    const task = tasks.find(t =>
      String(t.task_id) === String(taskId)
    );

    if (task) {
      task.status = newStatus;
    }

    showToast("บันทึกสถานะงานเรียบร้อย");

    if (currentPage === "tasks") {
      renderTaskTable();
    }

    if (currentPage === "dashboard") {
      renderDashboardData();
    }

    if (currentPage === "pending") {
      renderPendingTasks();
    }

  } catch (err) {
    console.error("Update task error:", err);

    showToast("บันทึกไม่สำเร็จ: " + err.message);

    selectElement.disabled = false;

    if (previousStatus) {
      selectElement.value = previousStatus;
    }
  }
}


/* 15. MOBILE SIDEBAR */

function openMenu() {
  sidebar?.classList.add("open");
  scrim?.classList.add("show");
}

function closeMenu() {
  sidebar?.classList.remove("open");
  scrim?.classList.remove("show");
}

document.getElementById("menuToggle")
  ?.addEventListener("click", openMenu);

document.getElementById("closeSidebar")
  ?.addEventListener("click", closeMenu);

scrim?.addEventListener("click", closeMenu);

document.getElementById("mobileMore")
  ?.addEventListener("click", openMenu);


/* 16. GLOBAL PAGE CLICK */

document.addEventListener("click", event => {
  const target = event.target.closest("[data-page]");

  if (!target) return;

  const page = target.dataset.page;

  if (!pageMeta[page]) return;

  setActive(page);
  renderModule(page);
  closeMenu();
});

document.addEventListener("click", event => {
  const target = event.target.closest("[data-click]");

  if (!target) return;

  const action = target.dataset.click;

  if (action === "pending") {
    renderPendingTasks();
    closeMenu();
  }
});

document.addEventListener("click", event => {
  const target = event.target.closest("[data-filter]");

  if (!target) return;

  const filter = target.dataset.filter;

  if (filter === "all") {
    renderTasksByStatus("all");
    closeMenu();
  }

  if (filter === "completed") {
    renderTasksByStatus("completed");
    closeMenu();
  }
});


/* 17. DATE */

document.getElementById("todayButton")
  ?.addEventListener("click", () => {
    showToast(
      new Date().toLocaleDateString("th-TH", {
        dateStyle: "long"
      })
    );
  });


/* 18. INSTALL PWA */

let deferredPrompt;

const installButton =
  document.getElementById("installButton");

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();

  deferredPrompt = event;

  if (installButton) {
    installButton.hidden = false;
  }
});

installButton?.addEventListener("click", async () => {
  if (!deferredPrompt) {
    showToast("ใช้เมนู Add to Home Screen ในเบราว์เซอร์ได้เลย");
    return;
  }

  deferredPrompt.prompt();

  await deferredPrompt.userChoice;

  deferredPrompt = null;
  installButton.hidden = true;
});


/* 19. SERVICE WORKER */

if (
  "serviceWorker" in navigator &&
  (location.protocol === "https:" || location.hostname === "localhost")
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .catch(error => console.warn("SW registration failed", error));
  });
}


/* 20. START APPLICATION */

async function startApplication() {
  if (isLoading) return;

  isLoading = true;

  try {
    setConnectionStatus("Loading...", "กำลังโหลดข้อมูล");

    await Promise.all([
      loadCompanies(),
      loadTasks()
    ]);

    updateNavigationCounts();

    const profileName = document.getElementById("profileName");

    if (profileName && currentUser) {
      profileName.textContent =
        currentUser.email || "Workspace User";
    }

    const logoutButton =
      document.getElementById("logoutButton");

    if (logoutButton) {
      logoutButton.hidden = false;

      logoutButton.addEventListener("click", logout);
    }

    const initial = (location.hash || "#dashboard").slice(1);

    const page = pageMeta[initial] ? initial : "dashboard";

    setActive(page);
    renderModule(page);

    showToast("เชื่อมต่อ ACC Tracker สำเร็จ");

  } catch (error) {
    console.error("Application startup error:", error);

    setConnectionStatus(
      "Database error",
      "ตรวจสอบข้อมูลและสิทธิ์"
    );

    if (pageContent) {
      pageContent.innerHTML = `
        <div class="page-heading">
          <h1>ไม่สามารถโหลดข้อมูลได้</h1>
          <p>เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล</p>
        </div>

        <div class="module-empty">
          <strong>Database Error</strong>
          <p>${escapeHTML(error.message)}</p>
          <button onclick="location.reload()">ลองอีกครั้ง</button>
        </div>
      `;
    }

  } finally {
    isLoading = false;
  }
}


/* 21. INITIAL AUTH CHECK */

(async function initialize() {
  const authenticated = await checkAuthentication();

  if (authenticated) {
    await startApplication();
  }
})();
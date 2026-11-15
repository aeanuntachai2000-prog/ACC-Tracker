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
  import: ["Excel Import", "ตรวจสอบไฟล์ Excel ก่อนนำเข้าระบบ", "file-spreadsheet"],
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
let isLoading;
let taskTypes = [];
let taskStatuses = [];

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

/* 10. LOAD TASK TYPES FROM SUPABASE */
async function loadTaskTypes() {
  const { data, error } = await sbClient
    .from("task_types")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw error;

  // Store with 'name' column from Supabase task_types table
  taskTypes = data || [];
  return taskTypes;
}

/* 11. LOAD TASK STATUSES FROM SUPABASE */
async function loadTaskStatuses() {
  const { data, error } = await sbClient
    .from("task_statuses")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) throw error;

  // Store with 'name' column from Supabase task_statuses table
  taskStatuses = data || [];
  return taskStatuses;
}

/* 9. UPDATE NAVIGATION COUNTS */


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

  // Count by status using fetched taskStatuses
  const statusMap = {};
  taskStatuses.forEach(s => { statusMap[s.name] = 0; });
  filteredTasks.forEach(t => {
    if (statusMap[t.status] !== undefined) {
      statusMap[t.status]++;
    }
  });

  const completed = statusMap["เสร็จแล้ว"] || 0;
  const pending = (statusMap["ยังไม่เริ่ม"] || 0) +
                  (statusMap["กำลังดำเนินการ"] || 0);
  const irrelevant = statusMap["ไม่เกี่ยวข้อง"] || 0;

  // งานที่ต้องดำเนินการจริง
  const requiredTasks = Math.max(totalTasks - irrelevant, 0);

  // งานที่เหลือหลังหักงานที่เสร็จแล้ว
  const remainingTasks = Math.max(requiredTasks - completed, 0);

  // เปอร์เซ็นต์ความคืบหน้า
  const percent = requiredTasks > 0
    ? (completed / requiredTasks) * 100
    : 0;

  setText("statCompanies", formatNumber(totalCompanies));
  setText("statTasks", formatNumber(totalTasks));
  setText("statCompleted", formatNumber(completed));
  setText("statPending", formatNumber(pending));
  setText("completedPercent", percent.toFixed(1) + "%");
  setText("progressPercent", percent.toFixed(1) + "%");
  setText("progressDone", formatNumber(completed));
  setText("progressPending", formatNumber(remainingTasks));

  const progressFill = document.getElementById("progressFill");
  if (progressFill) {
    progressFill.style.width = percent + "%";
  }


  const taskViewMode = window.accDashboardTaskViewMode || "month";

  // กำหนดประเภทงานที่แสดงในแต่ละมุมมอง
  const monthlyTaskTypes = [
    "ภ.ง.ด.1",
    "ภ.ง.ด.3",
    "ภ.ง.ด.53",
    "ภ.พ.30",
    "ประกันสังคม"
  ];

  const yearlyTaskTypes = [
    "ภ.ง.ด.50"
  ];

  const visibleTaskTypes = taskViewMode === "year"
    ? yearlyTaskTypes
    : monthlyTaskTypes;

  // เลือกข้อมูลงานตามปี เดือน และประเภทงาน
  const taskViewTasks = tasks.filter(t => {
    const sameYear =
      String(t.buddhist_year) === String(taxYear);

    const sameMonth =
      String(t.month) === String(taxMonth);

    const allowedType =
      visibleTaskTypes.includes(t.task_type);

    if (taskViewMode === "year") {
      return sameYear && allowedType;
    }

    return sameYear && sameMonth && allowedType;
  });

  // จัดกลุ่มงานตามประเภท
  const taskGroups = {};

  visibleTaskTypes.forEach(type => {
    taskGroups[type] = [];
  });

  taskViewTasks.forEach(t => {
    if (taskGroups[t.task_type]) {
      taskGroups[t.task_type].push(t);
    }
  });

  const list = document.getElementById("dashboardTaskList");
  
  if (list) {
    let html = "";

    
    // ปุ่มเลือกมุมมองรายเดือน / รายปี
    html = `
      <div class="task-view-controls">
        <button type="button"
          class="task-view-button ${taskViewMode === "month" ? "active" : ""}"
          data-task-view="month">
          รายเดือน
        </button>
        <button type="button"
          class="task-view-button ${taskViewMode === "year" ? "active" : ""}"
          data-task-view="year">
          รายปี
        </button>
      </div>
    `;

    Object.entries(taskGroups).forEach(([taskType, typeTasks]) => {
      const companyGroups = {};

      typeTasks.forEach(task => {
        const companyId = String(task.company_id);

        if (!companyGroups[companyId]) {
          companyGroups[companyId] = {
            name: getTaskCompanyName(task),
            code: task.company_code || "",
            tasks: []
          };
        }

        companyGroups[companyId].tasks.push(task);
      });

      // จำนวนบริษัทที่มีงานและไม่ใช่สถานะไม่เกี่ยวข้อง
      const relevantCompanies = Object.values(companyGroups).filter(company =>
        company.tasks.some(task => task.status !== "ไม่เกี่ยวข้อง")
      );

      // จำนวนบริษัทที่ทำงานเสร็จแล้ว
      const typeCompleted = relevantCompanies.filter(company =>
        company.tasks.every(task => task.status === "เสร็จแล้ว" || task.status === "ไม่เกี่ยวข้อง")
      ).length;

      // จำนวนบริษัทที่ต้องทำงานจริง
      const totalTypeCompanies = relevantCompanies.length;

      // คำนวณความคืบหน้า
      const typePercent = totalTypeCompanies
        ? (typeCompleted / totalTypeCompanies) * 100
        : 0;

      html += `
        <details class="task-group">
          <summary class="task-group-header">
            <div class="task-group-heading">
              <span class="task-group-type">${escapeHTML(taskType)}</span>
              <span class="task-group-count">${Object.keys(companyGroups).length}</span>
            </div>

            <div class="task-group-progress">
              <div class="task-group-progress-info">
                <span>เสร็จแล้ว ${typeCompleted}/${totalTypeCompanies} บริษัท</span>
                <span>${typePercent.toFixed(0)}%</span>
              </div>
              <div class="task-group-progress-track">
                <div class="task-group-progress-fill"
                  style="width: ${typePercent}%"></div>
              </div>
            </div>

            <span class="task-group-chevron" aria-hidden="true">⌄</span>
          </summary>

          <div class="task-group-items">
            ${Object.values(companyGroups).map(company => {
              const companyCompleted = company.tasks.filter(
                task => task.status === "เสร็จแล้ว"
              ).length;

              if (taskViewMode === "month") {
                const task = company.tasks[0];

                // ไม่แสดงบริษัทที่สถานะไม่เกี่ยวข้อง
                if (!task || task.status === "ไม่เกี่ยวข้อง") {
                  return "";
                }

                const statusClass = task.status === "เสร็จแล้ว"
                  ? "status-done"
                  : "";

                return `
                  <div class="task-row">
                    <div class="task-symbol doc">☷</div>
                    <div class="task-info">
                      <strong>${escapeHTML(company.name)}</strong>
                      <div class="muted small">${escapeHTML(company.code)}</div>
                    </div>
                    <div class="task-meta">
                      <span class="status-pill ${statusClass}">${escapeHTML(task.status)}</span>
                      <span class="due-date">${getDueDateText(taskType, taxYear, taxMonth)}</span>
                    </div>
                  </div>
                `;
              }

              return `
                <details class="task-year-company">
                  <summary>
                    <div class="task-info">
                      <strong>${escapeHTML(company.name)}</strong>
                      <div class="muted small">${escapeHTML(company.code)}</div>
                    </div>
                    <span class="task-year-count">
                      เสร็จ ${companyCompleted}/${company.tasks.length}
                    </span>
                  </summary>

                  <div class="task-year-months">
                    ${company.tasks.slice()
                      .sort((a, b) => Number(a.month) - Number(b.month))
                      .map(task => `
                        <div class="task-row">
                          <div class="task-info">
                            <strong>${THAI_MONTHS[Number(task.month) - 1] || ""}</strong>
                            <div class="muted small">${task.buddhist_year}</div>
                          </div>
                          <div class="task-meta">
                            <span class="status-pill">${escapeHTML(task.status)}</span>
                          </div>
                        </div>
                      `).join("")}
                  </div>
                </details>
              `;
            }).join("")}
          </div>
        </details>
      `;
    });

    if (taskViewTasks.length === 0) {
      html += `
        <div class="task-row">
          <div class="task-info">
            <strong>ไม่พบงานในช่วงเวลานี้</strong>
            <span>
              ${taskViewMode === "year"
                ? "ปี " + taxYear
                : "เดือนภาษี " + THAI_MONTHS[taxMonth - 1] + " " + taxYear}
            </span>
          </div>
        </div>
      `;
    }

    list.innerHTML = html;

    list.querySelectorAll("[data-task-view]").forEach(button => {
      button.addEventListener("click", () => {
        window.accDashboardTaskViewMode = button.dataset.taskView;
        renderDashboardData();
      });
    });
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
  const todayBtn = document.getElementById("todayButton");

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

  if (todayBtn) {
    todayBtn.addEventListener("click", () => {
      const today = new Date();

      currentMonthIndex = today.getMonth();
      currentBuddhistYear = today.getFullYear() + 543;

      updateMonthDisplay();
      renderDashboardData();

      showToast("กลับสู่เดือนปัจจุบันแล้ว");
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

// ==========================================
// ACC TRACKER - EXCEL IMPORT PREVIEW
// READ ONLY: ยังไม่เขียนข้อมูลลง Supabase
// ==========================================

let accImportPreviewResult = null;
let accImportChangeFilter = "all";
let accImportApprovedRows = new Set();
let accImportNewApprovedRows = new Set();

function accImportValue(value) {
  return String(value ?? "").trim();
}

function accImportNumber(value) {
  if (value === "" || value === null || value === undefined) return NaN;
  return Number(value);
}

function accImportOptionNames(items) {
  return new Set((items || [])
    .filter(item => item && item.is_active !== false)
    .map(item => accImportValue(
      typeof item === "string" ? item : item.name
    ))
    .filter(Boolean));
}

function accImportDate(value) {
  if (value === "" || value === null || value === undefined) return "";

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "number" && window.XLSX) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      const date = new Date(Date.UTC(
        parsed.y, parsed.m - 1, parsed.d,
        parsed.H || 0, parsed.M || 0, Math.floor(parsed.S || 0)
      ));
      return date.toISOString();
    }
  }

  const text = accImportValue(value);
  const thaiDate = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (thaiDate) {
    let year = Number(thaiDate[3]);
    if (year > 2400) year -= 543;

    const date = new Date(Date.UTC(
      year, Number(thaiDate[2]) - 1, Number(thaiDate[1])
    ));

    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function accImportKey(row) {
  return [
    row.buddhist_year,
    row.month,
    row.company_id,
    row.task_type
  ].join("|");
}

function accImportNormalize(row) {
  return {
    buddhist_year: Number(row.buddhist_year),
    month: Number(row.month),
    company_id: accImportValue(row.company_id),
    company_code: accImportValue(row.company_code),
    company_name: accImportValue(row.company_name),
    task_type: accImportValue(row.task_type),
    status: accImportValue(row.status),
    source_updated_at: accImportDate(row.source_updated_at),
    note: accImportValue(row.note)
  };
}

function accImportCompare(excelRow, dbRow) {
  const fields = [
    "buddhist_year",
    "month",
    "company_id",
    "company_code",
    "company_name",
    "task_type",
    "status",
    "source_updated_at",
    "note"
  ];

  return fields
    .map(field => {
      const newValue = excelRow[field] ?? "";
      const oldValue = field === "source_updated_at"
        ? accImportDate(dbRow[field])
        : (dbRow[field] ?? "");

      if (String(newValue) === String(oldValue)) {
        return null;
      }

      return {
        field,
        oldValue,
        newValue
      };
    })
    .filter(Boolean);
}

function accSetImportChangeFilter(value) {
  accImportChangeFilter = value || "all";
  accRenderExcelPreviewResult();
}

function renderExcelImportPage() {
  pageContent.innerHTML = `
    <section class="import-page">
      <div class="panel import-upload-panel">
        <div class="panel-header">
          <div>
            <h2>Excel Import Preview</h2>
            <p>ตรวจสอบข้อมูล Excel เทียบกับฐานข้อมูล ACC Tracker</p>
          </div>
        </div>

        <div class="import-file-area">
          <label for="accImportFile">เลือกไฟล์ Excel</label>
          <input id="accImportFile" type="file" accept=".xlsx,.xls,.xlsm,.xlsb">
          <p class="muted">รองรับชีตชื่อ “รายการงาน” และจะยังไม่มีการบันทึกข้อมูล</p>
        </div>

        <div id="accImportResult">
          <p class="muted">เลือกไฟล์ Excel เพื่อเริ่มตรวจสอบ</p>
        </div>
      </div>
    </section>
  `;

  const fileInput = document.getElementById("accImportFile");
  fileInput.addEventListener("change", accHandleExcelPreview);
}

async function accHandleExcelPreview(event) {
  const file = event.target.files?.[0];
  // ล้างรายการอนุมัติจากไฟล์ก่อนหน้า
accImportApprovedRows.clear();
accImportNewApprovedRows.clear();
  const resultBox = document.getElementById("accImportResult");

  if (!file || !resultBox) return;

  if (!window.XLSX) {
    resultBox.innerHTML = `<p class="import-error">ไม่พบไลบรารี XLSX กรุณาตรวจสอบการโหลด SheetJS</p>`;
    return;
  }

  resultBox.innerHTML = `<p class="muted">กำลังอ่านและตรวจสอบไฟล์...</p>`;

  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, {
      type: "array",
      cellDates: true
    });

    const sheet = workbook.Sheets["รายการงาน"];

    if (!sheet) {
      throw new Error('ไม่พบชีตชื่อ "รายการงาน" ในไฟล์ Excel');
    }

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: ""
    }).filter(row =>
      row.some(value => String(value ?? "").trim() !== "")
    );

    if (rows.length < 2) {
      throw new Error("ไม่พบแถวข้อมูลในไฟล์ Excel");
    }

    const expectedHeaders = [
      "ปี พ.ศ.", "เดือน", "CompanyID", "Company Code",
      "บริษัท", "ประเภทงาน", "สถานะ", "อัปเดตเมื่อ", "หมายเหตุ"
    ];

    const headers = rows[0].map(accImportValue);
    const missingHeaders = expectedHeaders.filter(
      header => !headers.includes(header)
    );

    if (missingHeaders.length) {
      throw new Error("หัวตารางไม่ครบ: " + missingHeaders.join(", "));
    }

    const column = Object.fromEntries(
      expectedHeaders.map(header => [header, headers.indexOf(header)])
    );

    const excelRows = rows.slice(1).map((cells, index) => ({
      excel_row: index + 2,
      buddhist_year: cells[column["ปี พ.ศ."]],
      month: cells[column["เดือน"]],
      company_id: cells[column["CompanyID"]],
      company_code: cells[column["Company Code"]],
      company_name: cells[column["บริษัท"]],
      task_type: cells[column["ประเภทงาน"]],
      status: cells[column["สถานะ"]],
      source_updated_at: cells[column["อัปเดตเมื่อ"]],
      note: cells[column["หมายเหตุ"]]
    })).filter(row => Object.values(row).some(value => accImportValue(value)));

    const companyIds = new Set((companies || []).map(
      company => accImportValue(company.company_id)
    ));
    const validTaskTypes = accImportOptionNames(taskTypes);
    const validStatuses = accImportOptionNames(taskStatuses);

    const normalizedRows = excelRows.map(row => ({
      ...row,
      ...accImportNormalize(row)
    }));

    const keyCounts = new Map();
    normalizedRows.forEach(row => {
      const key = accImportKey(row);
      keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
    });

    const dbByKey = new Map(
      (tasks || []).map(task => [accImportKey(task), task])
    );

    const groups = {
      invalid: [],
      new: [],
      unchanged: [],
      changed: []
    };

    normalizedRows.forEach(row => {
      const reasons = [];
      const key = accImportKey(row);

      if (!Number.isInteger(row.buddhist_year) ||
          row.buddhist_year < 2400 || row.buddhist_year > 2700) {
        reasons.push("ปี พ.ศ. ไม่ถูกต้อง");
      }

      if (!Number.isInteger(row.month) ||
          row.month < 1 || row.month > 12) {
        reasons.push("เดือนไม่ถูกต้อง");
      }

      if (!row.company_id || !companyIds.has(row.company_id)) {
        reasons.push("ไม่พบ CompanyID ในระบบ");
      }

      if (!row.task_type || !validTaskTypes.has(row.task_type)) {
        reasons.push("ไม่พบประเภทงานหรือประเภทงานไม่ได้เปิดใช้งาน");
      }

      if (!row.status || !validStatuses.has(row.status)) {
        reasons.push("ไม่พบสถานะหรือสถานะไม่ได้เปิดใช้งาน");
      }

      if ((keyCounts.get(key) || 0) > 1) {
        reasons.push("พบ Composite Key ซ้ำในไฟล์ Excel");
      }

      if (reasons.length) {
        groups.invalid.push({ ...row, reasons });
        return;
      }

      const existing = dbByKey.get(key);

      if (!existing) {
        groups.new.push(row);
        return;
      }

      const differences = accImportCompare(row, existing);

      if (differences.length) {
        groups.changed.push({
          ...row,

          // รหัสรายการเดิมใน Supabase
          task_id: existing.task_id,

          // ค่าเดิมจาก Supabase เฉพาะฟิลด์ที่เปลี่ยน
          old_values: Object.fromEntries(
            differences.map(diff => [
              diff.field,
              diff.oldValue
            ])
          ),

          // ค่าใหม่จาก Excel เฉพาะฟิลด์ที่เปลี่ยน
          new_values: Object.fromEntries(
            differences.map(diff => [
              diff.field,
              diff.newValue
            ])
          ),

          differences
        });
      } else {
        groups.unchanged.push(row);
      }
    });

    accImportApprovedRows.clear();
    accImportPreviewResult = {
      fileName: file.name,
      total: normalizedRows.length,
      groups
    };

    accRenderExcelPreviewResult();
  } catch (error) {
    resultBox.innerHTML = `
      <p class="import-error">${escapeHTML(error.message || "เกิดข้อผิดพลาดในการอ่านไฟล์")}</p>
    `;
  }
}


function accSetImportRowApproval(excelRow, checked) {
  const rowNumber = Number(excelRow);

  if (!Number.isInteger(rowNumber)) return;

  if (checked) {
    accImportApprovedRows.add(rowNumber);
  } else {
    accImportApprovedRows.delete(rowNumber);
  }

  accRenderExcelPreviewResult();
}


function accSetImportNewRowApproval(excelRow, checked) {
  const rowNumber = Number(excelRow);
  if (!Number.isInteger(rowNumber)) return;

  if (checked) {
    accImportNewApprovedRows.add(rowNumber);
  } else {
    accImportNewApprovedRows.delete(rowNumber);
  }

  accRenderExcelPreviewResult();
}

function accSetImportNewBulkApproval(checked) {
  if (!accImportPreviewResult) return;

  const rows = accImportPreviewResult.groups.new;

  rows.forEach(row => {
    if (checked) {
      accImportNewApprovedRows.add(Number(row.excel_row));
    } else {
      accImportNewApprovedRows.delete(Number(row.excel_row));
    }
  });

  accRenderExcelPreviewResult();
}


function accSetImportBulkApproval(checked) {
  if (!accImportPreviewResult) return;

  const { groups } = accImportPreviewResult;

  const rows = groups.changed.filter(row =>
    accImportChangeFilter === "all" ||
    (row.differences || []).some(
      diff => diff.field === accImportChangeFilter
    )
  );

  rows.forEach(row => {
    if (checked) {
      accImportApprovedRows.add(Number(row.excel_row));
    } else {
      accImportApprovedRows.delete(Number(row.excel_row));
    }
  });

  accRenderExcelPreviewResult();
}



function accRenderExcelPreviewResult() {
  const box = document.getElementById("accImportResult");
  if (!box || !accImportPreviewResult) return;

  const { total, groups, fileName } = accImportPreviewResult;

  const changeFilterOptions = [
    ["all", "ทุกฟิลด์ที่เปลี่ยนแปลง"],
    ["status", "สถานะ"],
    ["company_code", "Company Code"],
    ["company_name", "ชื่อบริษัท"],
    ["company_id", "CompanyID"],
    ["task_type", "ประเภทงาน"],
    ["note", "หมายเหตุ"],
    ["source_updated_at", "วันที่อัปเดต"],
    ["buddhist_year", "ปี พ.ศ."],
    ["month", "เดือน"]
  ];

  const changedItems = groups.changed.filter(row =>
    accImportChangeFilter === "all" ||
    (row.differences || []).some(
      diff => diff.field === accImportChangeFilter
    )
  );

  const approvedCount = groups.changed.filter(row =>
    accImportApprovedRows.has(Number(row.excel_row))
  ).length;

  const approvedItems = groups.changed.filter(row =>
    accImportApprovedRows.has(Number(row.excel_row))
  );

  const approvedNewItems = groups.new.filter(row =>
    accImportNewApprovedRows.has(Number(row.excel_row))
  );

  const filteredApprovedCount = changedItems.filter(row =>
    accImportApprovedRows.has(Number(row.excel_row))
  ).length;

  const allFilteredApproved =
    changedItems.length > 0 &&
    changedItems.every(row =>
      accImportApprovedRows.has(Number(row.excel_row))
    );

  const fieldLabels = {
    buddhist_year: "ปี พ.ศ.",
    month: "เดือน",
    company_id: "CompanyID",
    company_code: "Company Code",
    company_name: "ชื่อบริษัท",
    task_type: "ประเภทงาน",
    status: "สถานะ",
    source_updated_at: "อัปเดตเมื่อ",
    note: "หมายเหตุ"
  };

  const summary = [
    ["ข้อมูลใหม่", groups.new.length],
    ["ข้อมูลเหมือนเดิม", groups.unchanged.length],
    ["ข้อมูลเปลี่ยนแปลง", groups.changed.length],
    ["ข้อมูลผิดปกติ", groups.invalid.length]
  ];

  const details = [
    ["ข้อมูลใหม่", groups.new],
    ["ข้อมูลเปลี่ยนแปลง", changedItems],
    ["ข้อมูลผิดปกติ", groups.invalid]
  ];


  const statusChangedCount = groups.changed.filter(row =>
    (row.differences || []).some(diff => diff.field === "status")
  ).length;

  const otherChangedCount = groups.changed.filter(row =>
    (row.differences || []).some(diff => diff.field !== "status")
  ).length;

  const importPlan = [
    {
      label: "รายการใหม่",
      count: groups.new.length,
      action: "เตรียมเพิ่มข้อมูลใหม่",
      detail: "จะเพิ่มด้วย Composite Key และไม่เขียนทับข้อมูลเดิม"
    },
    {
      label: "รายการเหมือนเดิม",
      count: groups.unchanged.length,
      action: "ข้ามรายการ",
      detail: "ไม่มีความจำเป็นต้องบันทึกซ้ำ"
    },
    {
      label: "รายการเปลี่ยนแปลง",
      count: groups.changed.length,
      action: "รออนุมัติ",
      detail: "ต้องเลือกและตรวจสอบก่อนเปลี่ยนข้อมูล"
    },
    {
      label: "รายการผิดปกติ",
      count: groups.invalid.length,
      action: "ระงับการนำเข้า",
      detail: "ต้องแก้ไขข้อมูลก่อน"
    }
  ];


  box.innerHTML = `
    <div class="import-summary">
      <p>ไฟล์: <strong>${escapeHTML(fileName)}</strong></p>
      <p>จำนวนแถวข้อมูลทั้งหมด:
        <strong>${formatNumber(total)}</strong>
      </p>

      <div class="import-summary-grid">
        ${summary.map(([label, count]) => `
          <div class="import-summary-card">
            <span>${label}</span>
            <strong>${formatNumber(count)}</strong>
          </div>
        `).join("")}
      </div>
    </div>

    ${details.map(([label, items]) => `
      <div class="import-detail-group">
        <h3>${label} (${formatNumber(items.length)})</h3>
        
        ${label === "ข้อมูลเปลี่ยนแปลง" ? `
          <div class="import-change-filter">
            <label for="accImportChangeFilter">
              กรองรายการตามฟิลด์ที่เปลี่ยน
            </label>
            <select
              id="accImportChangeFilter"
              onchange="accSetImportChangeFilter(this.value)"
            >
              ${changeFilterOptions.map(([value, text]) => `
                <option
                  value="${value}"
                  ${accImportChangeFilter === value ? "selected" : ""}
                >${text}</option>
              `).join("")}
            </select>
            
            <span class="muted">
              แสดง ${formatNumber(items.length)}
              จาก ${formatNumber(groups.changed.length)} รายการ
            </span>

            <div class="import-selection-actions">
              <button
                type="button"
                class="btn btn-secondary"
                onclick="accSetImportBulkApproval(true)"
              >
                เลือกทั้งหมดตามตัวกรอง
              </button>

              <button
                type="button"
                class="btn btn-secondary"
                onclick="accSetImportBulkApproval(false)"
              >
                ยกเลิกทั้งหมดตามตัวกรอง
              </button>
            </div>

            <p class="import-selection-count">
              เลือกแล้ว ${formatNumber(filteredApprovedCount)}
              จาก ${formatNumber(items.length)} รายการที่แสดง
              <br>
              รวมเลือกแล้ว ${formatNumber(approvedCount)}
              จาก ${formatNumber(groups.changed.length)} รายการ
            </p>

          </div>
        ` : ""}

        ${label === "ข้อมูลใหม่" ? `
          <div class="import-selection-actions">
            <button
              type="button"
              class="btn btn-secondary"
              onclick="accSetImportNewBulkApproval(true)"
            >
              เลือกข้อมูลใหม่ทั้งหมด
            </button>

            <button
              type="button"
              class="btn btn-secondary"
              onclick="accSetImportNewBulkApproval(false)"
            >
              ยกเลิกข้อมูลใหม่ทั้งหมด
            </button>
          </div>

          <p class="import-selection-count">
            เลือกแล้ว ${formatNumber(approvedNewItems.length)}
            จาก ${formatNumber(groups.new.length)} รายการ
          </p>
        ` : ""}

        ${items.length ? `
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  ${["ข้อมูลเปลี่ยนแปลง", "ข้อมูลใหม่"].includes(label) ? `
                    <th>
                      <input
                        type="checkbox"
                        aria-label="เลือกทั้งหมด"
                        ${
                          label === "ข้อมูลเปลี่ยนแปลง"
                            ? (allFilteredApproved ? "checked" : "")
                            : (
                                items.length > 0 &&
                                items.every(row =>
                                  accImportNewApprovedRows.has(Number(row.excel_row))
                                )
                                  ? "checked"
                                  : ""
                              )
                        }
                        onchange="${
                          label === "ข้อมูลเปลี่ยนแปลง"
                            ? "accSetImportBulkApproval(this.checked)"
                            : "accSetImportNewBulkApproval(this.checked)"
                        }"
                      >
                    </th>
                  ` : ""}
                  <th>แถว Excel</th>
                  <th>ปี</th>
                  <th>เดือน</th>
                  <th>บริษัท</th>
                  <th>ประเภทงาน</th>
                  <th>สถานะ</th>
                  <th>รายละเอียด</th>
                </tr>
              </thead>

              
              <tbody>
                ${items.slice(0, 100).map(row => `
                  <tr>
                    ${label === "ข้อมูลเปลี่ยนแปลง" ? `
                      <td>
                        <input
                          type="checkbox"
                          aria-label="เลือกแถว Excel ${row.excel_row}"
                          ${
                            label === "ข้อมูลเปลี่ยนแปลง"
                              ? (accImportApprovedRows.has(Number(row.excel_row)) ? "checked" : "")
                              : (accImportNewApprovedRows.has(Number(row.excel_row)) ? "checked" : "")
                          }
                          onchange="${
                            label === "ข้อมูลเปลี่ยนแปลง"
                              ? `accSetImportRowApproval(${Number(row.excel_row)}, this.checked)`
                              : `accSetImportNewRowApproval(${Number(row.excel_row)}, this.checked)`
                          }"
                        >
                      </td>
                    ` : ""}
                    <td>${row.excel_row}</td>
                    <td>${escapeHTML(row.buddhist_year)}</td>
                    <td>${escapeHTML(row.month)}</td>
                    <td>${escapeHTML(row.company_name)}</td>
                    <td>${escapeHTML(row.task_type)}</td>
                    <td>${escapeHTML(row.status)}</td>
                    <td>

                      ${
                        row.differences?.length
                          ? `
                            <details>
                              <summary>
                                ดูความแตกต่าง (${row.differences.length})
                              </summary>
                              <table class="data-table">
                                <thead>
                                  <tr>
                                    <th>ฟิลด์</th>
                                    <th>ค่าเดิม (Supabase)</th>
                                    <th>ค่าใหม่ (Excel)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  ${row.differences.map(diff => `
                                    <tr>
                                      <td>${fieldLabels[diff.field] || escapeHTML(diff.field)}</td>
                                      <td>${escapeHTML(String(diff.oldValue ?? "") || "(ว่าง)")}</td>
                                      <td>${escapeHTML(String(diff.newValue ?? "") || "(ว่าง)")}</td>
                                    </tr>
                                  `).join("")}
                                </tbody>
                              </table>
                            </details>
                          `
                          : escapeHTML(
                              (row.reasons || []).join(", ") || "-"
                            )
                      }
                    </td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>

          ${items.length > 100
            ? `<p class="muted">
                แสดง 100 รายการแรกจากทั้งหมด
                ${formatNumber(items.length)} รายการ
              </p>`
            : ""}
        ` : `<p class="muted">ไม่มีรายการ</p>`}
      </div>
    `).join("")}

    <div class="import-approval-preview">
      <h3>ตรวจสอบรายการที่เลือก (${formatNumber(approvedItems.length)})</h3>

      ${
        approvedItems.length
          ? approvedItems.map(row => `
            <div class="import-approval-item">
              <h4>
                Excel แถว ${row.excel_row} -
                ${escapeHTML(row.company_name)}
              </h4>

              <p class="muted">
                ปี ${escapeHTML(row.buddhist_year)}
                เดือน ${escapeHTML(row.month)}
                | ${escapeHTML(row.task_type)}
              </p>

              <table class="data-table">
                <thead>
                  <tr>
                    <th>ฟิลด์</th>
                    <th>ค่าเดิม (Supabase)</th>
                    <th>ค่าใหม่ (Excel)</th>
                  </tr>
                </thead>
                <tbody>
                  ${(row.differences || []).map(diff => `
                    <tr>
                      <td>${fieldLabels[diff.field] || escapeHTML(diff.field)}</td>
                      <td>${escapeHTML(String(diff.oldValue ?? "") || "(ว่าง)")}</td>
                      <td>${escapeHTML(String(diff.newValue ?? "") || "(ว่าง)")}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          `).join("")
          : `<p class="muted">ยังไม่มีรายการที่เลือก กรุณาติ๊กเลือกรายการจากตารางด้านบน</p>`
      }

      <div class="import-approval-actions">
        <button
          type="button"
          class="btn btn-primary"
          id="accImportApplyButton"
          ${approvedItems.length === 0 ? "disabled" : ""}
          onclick="accApplyApprovedExcelChanges()"
        >
          อนุมัติและบันทึก ${formatNumber(approvedItems.length)} รายการ
        </button>

        <p id="accImportSaveStatus" class="muted"></p>
      </div>

      <p class="import-readonly-note">
        รายการนี้เป็นเพียงตัวอย่างการเปลี่ยนแปลงที่เลือกไว้
        ยังไม่มีการบันทึกข้อมูลลง Supabase
      </p>
    </div>

    <div class="import-approval-preview">
      <h3>ตรวจสอบข้อมูลใหม่ที่เลือก (${formatNumber(approvedNewItems.length)})</h3>

      ${
        approvedNewItems.length
          ? approvedNewItems.map(row => `
            <div class="import-approval-item">
              <h4>
                Excel แถว ${row.excel_row} -
                ${escapeHTML(row.company_name)}
              </h4>
              <p class="muted">
                ปี ${escapeHTML(row.buddhist_year)}
                เดือน ${escapeHTML(row.month)}
                | ${escapeHTML(row.task_type)}
              </p>
              <p>สถานะ: ${escapeHTML(row.status)}</p>
            </div>
          `).join("")
          : `<p class="muted">ยังไม่มีข้อมูลใหม่ที่เลือก กรุณาติ๊กเลือกรายการจากตารางด้านบน</p>`
      }

      <div class="import-approval-actions">
        <button
          type="button"
          class="btn btn-primary"
          id="accImportNewApplyButton"
          ${approvedNewItems.length === 0 ? "disabled" : ""}
          onclick="accApplyApprovedNewExcelRows()"
        >
          เพิ่มข้อมูลใหม่ ${formatNumber(approvedNewItems.length)} รายการ
        </button>
        <p id="accImportNewSaveStatus" class="muted"></p>
      </div>
    </div>

    <div class="import-plan">
      <div class="import-plan-header">
        <h3>Import Plan</h3>
        <span class="muted">แผนการนำเข้าข้อมูล</span>
      </div>

      <div class="import-plan-grid">
        ${importPlan.map(item => `
          <div class="import-plan-card">
            <span>${item.label}</span>
            <strong>${formatNumber(item.count)}</strong>
            <b>${item.action}</b>
            <small>${item.detail}</small>
          </div>
        `).join("")}
      </div>

      <div class="import-plan-status">
        <h4>รายละเอียดการเปลี่ยนแปลง</h4>
        <p>
          เปลี่ยนสถานะ:
          <strong>${formatNumber(statusChangedCount)}</strong> รายการ
        </p>
        <p>
          เปลี่ยนฟิลด์อื่น:
          <strong>${formatNumber(otherChangedCount)}</strong> รายการ
        </p>
        <p class="muted">
          รายการที่มีการเปลี่ยนทั้งสถานะและฟิลด์อื่น
          อาจถูกนับอยู่ในทั้งสองประเภท
        </p>
      </div>

      <div class="import-plan-warning">
        <strong>ยังไม่เริ่มนำเข้าข้อมูล</strong>
        <p>
          แผนนี้เป็นการประเมินจากไฟล์ Excel เทียบกับ Supabase เท่านั้น
          ยังไม่มีการ INSERT, UPDATE หรือ DELETE ข้อมูล
        </p>
      </div>
    </div>

    <p class="import-readonly-note">
      ผลลัพธ์นี้เป็นการตรวจสอบแบบ Read Only
      ยังไม่มีการเปลี่ยนแปลงข้อมูลใน Supabase
    </p>

  `;
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

  if (page === "import") {
  renderExcelImportPage();
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
        <h1>งานทั้งหมด</h1>
        <p>ค้นหาและจัดการรายการงานบัญชี</p>
      </div>
    </div>

    <div class="module-view">
      <div class="module-toolbar" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;">

        <input
          class="search-box"
          type="search"
          id="taskSearch"
          placeholder="ค้นหาบริษัท / Company Code / ประเภทงาน"
        >

        <select class="filter-chip" id="taskYearFilter">
          <option value="">ทุกปี</option>
          ${[...new Set(tasks.map(t => String(t.buddhist_year)))].sort((a,b) => Number(b)-Number(a)).map(year => `
            <option value="${escapeHTML(year)}">${escapeHTML(year)}</option>
          `).join("")}
        </select>

        <select class="filter-chip" id="taskMonthFilter">
          <option value="">ทุกเดือน</option>
          ${Array.from({length:12},(_,i) => i+1).map(month => `
            <option value="${month}">${month}</option>
          `).join("")}
        </select>

        <select class="filter-chip" id="taskCompanyFilter">
          <option value="">ทุกบริษัท</option>
          ${companies.map(company => `
            <option value="${escapeHTML(String(company.company_id))}">
              ${escapeHTML(company.company_name || company.company_code || company.company_id)}
            </option>
          `).join("")}
        </select>

        <select class="filter-chip" id="taskTypeFilter">
          <option value="">ทุกประเภทงาน</option>
          ${[...new Set(tasks.map(t => t.task_type).filter(Boolean))].sort().map(type => `
            <option value="${escapeHTML(type)}">
              ${escapeHTML(type)}
            </option>
          `).join("")}
        </select>

        <select class="filter-chip" id="taskStatusFilter">
          <option value="">ทุกสถานะ</option>
          ${TASK_STATUSES.map(status => `
            <option value="${escapeHTML(status)}">
              ${escapeHTML(status)}
            </option>
          `).join("")}
        </select>
      </div>

      <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;">
        <button class="btn btn-primary" id="taskSearchButton">
          ค้นหา
        </button>

        <button class="btn btn-secondary" id="taskResetButton">
          ล้างตัวกรอง
        </button>
      </div>

      <div id="taskTableContainer" style="margin-top:18px;">
        <div class="module-empty">
          <strong>ยังไม่ได้ค้นหา</strong>
          <p>เลือกตัวกรองแล้วกดค้นหาเพื่อแสดงรายการงาน</p>
        </div>
      </div>
    </div>

    <div class="footer-note">
      ACC TRACKER <span>•</span> LIVE DATABASE
    </div>
  `;

  document.getElementById("taskSearchButton")
    .addEventListener("click", renderTaskTable);

  document.getElementById("taskSearch")
    .addEventListener("keydown", event => {
      if (event.key === "Enter") renderTaskTable();
    });

  document.getElementById("taskResetButton")
    .addEventListener("click", () => {
      document.getElementById("taskSearch").value = "";
      document.getElementById("taskYearFilter").value = "";
      document.getElementById("taskMonthFilter").value = "";
      document.getElementById("taskCompanyFilter").value = "";
      document.getElementById("taskTypeFilter").value = "";
      document.getElementById("taskStatusFilter").value = "";

      const container = document.getElementById("taskTableContainer");

      container.innerHTML = `
        <div class="module-empty">
          <strong>ยังไม่ได้ค้นหา</strong>
          <p>เลือกตัวกรองแล้วกดค้นหาเพื่อแสดงรายการงาน</p>
        </div>
      `;
    });

  location.hash = "tasks";
}



function renderTaskTable() {
  const query = (
    document.getElementById("taskSearch")?.value || ""
  ).trim().toLowerCase();

  const yearFilter =
    document.getElementById("taskYearFilter")?.value || "";

  const monthFilter =
    document.getElementById("taskMonthFilter")?.value || "";

  const companyFilter =
    document.getElementById("taskCompanyFilter")?.value || "";

  const typeFilter =
    document.getElementById("taskTypeFilter")?.value || "";

  const statusFilter =
    document.getElementById("taskStatusFilter")?.value || "";

  const filtered = tasks.filter(task => {
    const companyName = getTaskCompanyName(task).toLowerCase();
    const taskType = String(task.task_type || "").toLowerCase();
    const companyCode = String(task.company_code || "").toLowerCase();

    const matchesQuery =
      !query ||
      companyName.includes(query) ||
      taskType.includes(query) ||
      companyCode.includes(query);

    const matchesYear =
      !yearFilter ||
      String(task.buddhist_year) === yearFilter;

    const matchesMonth =
      !monthFilter ||
      String(task.month) === monthFilter;

    const matchesCompany =
      !companyFilter ||
      String(task.company_id) === companyFilter;

    const matchesType =
      !typeFilter ||
      task.task_type === typeFilter;

    const matchesStatus =
      !statusFilter ||
      task.status === statusFilter;

    return (
      matchesQuery &&
      matchesYear &&
      matchesMonth &&
      matchesCompany &&
      matchesType &&
      matchesStatus
    );
  });

  const container = document.getElementById("taskTableContainer");

  if (!container) return;

  if (!filtered.length) {
    container.innerHTML = `
      <div class="module-empty">
        <strong>ไม่พบรายการงาน</strong>
        <p>ไม่พบข้อมูลที่ตรงกับตัวกรองที่เลือก</p>
      </div>
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
      ${filtered.length > 200 ? " (จำกัดการแสดงผล 200 รายการแรก)" : ""}
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

  const task = tasks.find(t =>
    String(t.task_id) === String(taskId)
  );

  if (!task) {
    showToast("ไม่พบข้อมูลงาน");
    return;
  }

  const previousStatus = task.status;

  if (previousStatus === newStatus) return;

  const changedBy = currentUser?.id || null;

  selectElement.disabled = true;

  // Step 1: UPDATE work_tasks
  const { error: updateError } = await sbClient
    .from("work_tasks")
    .update({ status: newStatus })
    .eq("task_id", taskId);

  if (updateError) {
    console.error("Update task error:", updateError);
    showToast("บันทึกไม่สำเร็จ: " + updateError.message);

    selectElement.value = previousStatus;
    selectElement.disabled = false;
    return;
  }

  // UPDATE สำเร็จแล้ว จึงปรับข้อมูลในแอป
  task.status = newStatus;

  // Step 2: INSERT task_history
  const { error: historyError } = await sbClient
    .from("task_history")
    .insert([{
      task_id: taskId,
      old_status: previousStatus,
      new_status: newStatus,
      changed_by: changedBy,
      change_note: null
    }]);

  if (historyError) {
    console.error("History insert error:", historyError);
    showToast(
      "เปลี่ยนสถานะสำเร็จ แต่บันทึกประวัติไม่สำเร็จ: " +
      historyError.message
    );
  } else {
    showToast("บันทึกสถานะงานและประวัติเรียบร้อย");
  }
   
  selectElement.disabled = false;

  // Step 3: Re-render หน้าที่เกี่ยวข้อง
  if (currentPage === "tasks") {
    renderTaskTable();
  }

  if (currentPage === "dashboard") {
    renderDashboardData();
  }

  if (currentPage === "pending") {
    renderPendingTasks();
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
    const today = new Date();

    currentMonthIndex = today.getMonth();
    currentBuddhistYear = today.getFullYear() + 543;

    updateMonthDisplay();
    renderDashboardData();

    showToast("กลับสู่เดือนปัจจุบันแล้ว");
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
      loadTasks(),
      loadTaskTypes(),
      loadTaskStatuses()
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

    // เปิดแอปที่หน้าหลักทุกครั้ง
    location.hash = "dashboard";

    setActive("dashboard");
    renderModule("dashboard");

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

async function accApplyApprovedExcelChanges() {
  const button = document.getElementById("accImportApplyButton");
  const statusBox = document.getElementById("accImportSaveStatus");

  if (!accImportPreviewResult || !button || !statusBox) return;

  const approvedItems = accImportPreviewResult.groups.changed.filter(row =>
    accImportApprovedRows.has(Number(row.excel_row))
  );

  if (!approvedItems.length) {
    statusBox.textContent = "กรุณาเลือกรายการที่ต้องการอนุมัติก่อน";
    return;
  }

  const confirmed = window.confirm(
    `ยืนยันการอัปเดตข้อมูล ${approvedItems.length} รายการลง Supabase หรือไม่?\n\n` +
    "ระบบจะเปลี่ยนเฉพาะรายการที่เลือก และบันทึกประวัติเมื่อมีการเปลี่ยนสถานะ\n\n" +
    "การบันทึกสำเร็จแล้วจะไม่สามารถย้อนกลับด้วยปุ่มยกเลิกได้"
  );

  if (!confirmed) return;

  button.disabled = true;
  statusBox.textContent = "กำลังตรวจสอบและบันทึกข้อมูล...";

  try {
    const { data: sessionData, error: sessionError } =
      await sbClient.auth.getSession();

    if (sessionError) throw sessionError;

    if (!sessionData?.session) {
      throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
    }

    const payload = approvedItems.map(row => ({
      task_id: row.task_id,
      old_values: row.old_values,
      new_values: row.new_values
    }));

    const { data, error } = await sbClient.rpc(
      "acc_apply_excel_changes",
      { p_items: payload }
    );

    if (error) throw error;

    if (!data || data.success !== true) {
      throw new Error("Supabase ไม่ได้ยืนยันผลการบันทึก");
    }

    // ล้างรายการที่เลือกหลังบันทึกสำเร็จ
    approvedItems.forEach(row => {
      accImportApprovedRows.delete(Number(row.excel_row));
    });

    statusBox.textContent =
      `บันทึกสำเร็จ ${formatNumber(data.updated_count)} รายการ` +
      ` | เพิ่มประวัติสถานะ ${formatNumber(data.history_count)} รายการ` +
      " | กรุณาเลือกไฟล์ Excel ใหม่เพื่อตรวจสอบข้อมูลล่าสุด";

    accRenderExcelPreviewResult();

    const updatedStatusBox =
      document.getElementById("accImportSaveStatus");

    if (updatedStatusBox) {
      updatedStatusBox.textContent =
        `บันทึกสำเร็จ ${formatNumber(data.updated_count)} รายการ` +
        ` | เพิ่มประวัติสถานะ ${formatNumber(data.history_count)} รายการ` +
        " | กรุณาเลือกไฟล์ Excel ใหม่เพื่อตรวจสอบข้อมูลล่าสุด";
    }

  } catch (error) {
    console.error("ACC Excel Import Error:", error);

    statusBox.textContent =
      "บันทึกไม่สำเร็จ: " + (error.message || "เกิดข้อผิดพลาด");

  } finally {
    button.disabled = false;
  }
}


async function accApplyApprovedNewExcelRows() {
  const button = document.getElementById("accImportNewApplyButton");
  const statusBox = document.getElementById("accImportNewSaveStatus");

  if (!accImportPreviewResult || !button || !statusBox) return;

  const approvedNewItems = accImportPreviewResult.groups.new.filter(row =>
    accImportNewApprovedRows.has(Number(row.excel_row))
  );

  if (!approvedNewItems.length) {
    statusBox.textContent = "กรุณาเลือกข้อมูลใหม่ที่ต้องการเพิ่มก่อน";
    return;
  }

  const confirmed = window.confirm(
    `ยืนยันการเพิ่มข้อมูลใหม่ ${approvedNewItems.length} รายการลง Supabase หรือไม่?\n\n` +
    "ระบบจะเพิ่มเฉพาะรายการใหม่ และไม่เขียนทับข้อมูลเดิม"
  );

  if (!confirmed) return;

  button.disabled = true;
  statusBox.textContent = "กำลังตรวจสอบและเพิ่มข้อมูลใหม่...";

  try {
    const { data: sessionData, error: sessionError } =
      await sbClient.auth.getSession();

    if (sessionError) throw sessionError;

    if (!sessionData?.session) {
      throw new Error("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่");
    }

    const payload = approvedNewItems.map(row => ({
      buddhist_year: row.buddhist_year,
      month: row.month,
      company_id: row.company_id,
      company_code: row.company_code,
      company_name: row.company_name,
      task_type: row.task_type,
      status: row.status,
      source_updated_at: row.source_updated_at || null,
      note: row.note || null,
      source_file: accImportPreviewResult.fileName,
      source_sheet: "รายการงาน",
      source_row: Number(row.excel_row)
    }));

    const { data, error } = await sbClient.rpc(
      "acc_insert_excel_new",
      { p_items: payload }
    );

    if (error) throw error;

    if (!data || data.success !== true) {
      throw new Error("Supabase ไม่ได้ยืนยันผลการเพิ่มข้อมูล");
    }

    approvedNewItems.forEach(row => {
      accImportNewApprovedRows.delete(Number(row.excel_row));
    });

    const successMessage =
      `เพิ่มข้อมูลสำเร็จ ${formatNumber(data.inserted_count)} รายการ` +
      " | กรุณาเลือกไฟล์ Excel ใหม่เพื่อตรวจสอบข้อมูลล่าสุด";

    accRenderExcelPreviewResult();

    const updatedStatusBox =
      document.getElementById("accImportNewSaveStatus");

    if (updatedStatusBox) {
      updatedStatusBox.textContent = successMessage;
    }

  } catch (error) {
    console.error("ACC Excel New Import Error:", error);

    statusBox.textContent =
      "เพิ่มข้อมูลไม่สำเร็จ: " + (error.message || "เกิดข้อผิดพลาด");

  } finally {
    const currentButton =
      document.getElementById("accImportNewApplyButton");

    if (currentButton) currentButton.disabled = false;
  }
}

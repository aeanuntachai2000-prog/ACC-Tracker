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

function renderDashboardData() {
  const totalCompanies = companies.length;
  const totalTasks = tasks.length;

  const completed = tasks.filter(
    t => t.status === "เสร็จแล้ว"
  ).length;

  const pending = tasks.filter(t =>
    t.status === "ยังไม่เริ่ม" ||
    t.status === "กำลังดำเนินการ"
  ).length;

  const percent = totalTasks
    ? (completed / totalTasks * 100)
    : 0;

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

  const list = document.getElementById("dashboardTaskList");

  if (list) {
    const statusCounts = TASK_STATUSES.map(status => ({
      status,
      count: tasks.filter(t => t.status === status).length
    }));

    list.innerHTML = statusCounts.map(item => `
      <div class="task-row">
        <div class="task-symbol doc">☷</div>
        <div class="task-info">
          <strong>${escapeHTML(item.status)}</strong>
          <span>รายการงานในระบบ</span>
        </div>
        <span class="status-pill">${formatNumber(item.count)}</span>
      </div>
    `).join("");
  }

  setText("lastUpdated", "โหลดข้อมูลจาก Supabase เรียบร้อยแล้ว");

  setConnectionStatus(
    "Connected",
    "Supabase database",
    true
  );
}

function setText(id, value) {
  const element = document.getElementById(id);

  if (element) element.textContent = value;
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
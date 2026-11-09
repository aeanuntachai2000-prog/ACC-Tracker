const pageMeta = {
  dashboard: ["Dashboard","ภาพรวมการจัดการงานบัญชีของทุกบริษัท","▦"],
  companies: ["Companies","จัดการข้อมูลและภาพรวมของบริษัททั้งหมด","▤"],
  tasks: ["Tasks","ติดตามและจัดการงานบัญชีทุกบริษัท","☷"],
  calendar: ["Calendar","ปฏิทินกำหนดส่งและตารางงาน","▦"],
  reports: ["Reports","รายงานและวิเคราะห์ผลการดำเนินงาน","▥"],
  documents: ["Documents","จัดเก็บและค้นหาเอกสารประกอบงาน","▧"],
  notifications: ["Notifications","การแจ้งเตือนและกิจกรรมล่าสุด","♧"],
  settings: ["Settings","ตั้งค่าแอปและการเชื่อมต่อระบบ","⚙"]
};
const pageContent = document.getElementById("pageContent");
const sidebar = document.getElementById("sidebar");
const scrim = document.getElementById("scrim");
const toast = document.getElementById("toast");
let toastTimer;

function showToast(message){
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>toast.classList.remove("show"),2300);
}
function setActive(page){
  document.querySelectorAll("[data-page]").forEach(el=>{
    el.classList.toggle("active",el.dataset.page===page);
  });
  document.querySelectorAll(".nav-item").forEach(el=>{
    el.classList.toggle("active",el.dataset.page===page);
  });
  document.getElementById("pageCrumb").textContent = pageMeta[page][0];
}
function renderModule(page){
  if(page==="dashboard"){ location.hash="dashboard"; renderDashboard(); return; }
  const [title,desc,icon]=pageMeta[page];
  pageContent.innerHTML = `
    <div class="page-heading">
      <div><div class="eyebrow">ACCOUNTING TRACKER / WORKSPACE</div><h1>${title}</h1><p>${desc}</p></div>
    </div>
    <div class="module-view">
      <div class="module-toolbar">
        <input class="search-box" type="search" placeholder="ค้นหา${title}..." aria-label="ค้นหา">
        <button class="filter-chip" id="moduleFilter">ตัวกรอง　⌄</button>
      </div>
      <div class="module-empty">
        <div class="empty-icon">${icon}</div>
        <strong>${title} module is ready for development</strong>
        <p>เตรียมโครงสร้างหน้านี้ไว้แล้ว ขั้นตอนถัดไปจะพัฒนาฟังก์ชันและเชื่อมข้อมูลจริงในโมดูลนี้</p>
      </div>
    </div>
    <div class="footer-note">ACCOUNTING TRACKER <span>•</span> VERSION 0.1 PREVIEW</div>`;
  document.getElementById("moduleFilter")?.addEventListener("click",()=>showToast("ตัวกรองจะเปิดใช้งานเมื่อพัฒนาโมดูลนี้"));
  location.hash=page;
}
function renderDashboard(){
  pageContent.innerHTML = document.getElementById("dashboardTemplate").innerHTML;
}
document.addEventListener("click",e=>{
  const target=e.target.closest("[data-page]");
  if(target){const page=target.dataset.page;if(pageMeta[page]){setActive(page);renderModule(page);closeMenu();}}
});
function openMenu(){sidebar.classList.add("open");scrim.classList.add("show");}
function closeMenu(){sidebar.classList.remove("open");scrim.classList.remove("show");}
document.getElementById("menuToggle").addEventListener("click",openMenu);
document.getElementById("closeSidebar").addEventListener("click",closeMenu);
scrim.addEventListener("click",closeMenu);
document.getElementById("mobileMore").addEventListener("click",openMenu);
document.getElementById("todayButton").addEventListener("click",()=>showToast("วันนี้: 9 พฤศจิกายน 2569"));

let deferredPrompt;
const installButton=document.getElementById("installButton");
window.addEventListener("beforeinstallprompt",e=>{
  e.preventDefault();deferredPrompt=e;installButton.hidden=false;
});
installButton.addEventListener("click",async()=>{
  if(!deferredPrompt){showToast("ใช้เมนู Add to Home Screen ในเบราว์เซอร์ได้เลย");return;}
  deferredPrompt.prompt();await deferredPrompt.userChoice;deferredPrompt=null;installButton.hidden=true;
});
if("serviceWorker" in navigator && (location.protocol==="https:" || location.hostname==="localhost")){
  window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(err=>console.warn("SW registration failed",err)));
}
const initial=(location.hash||"#dashboard").slice(1);
if(pageMeta[initial]){setActive(initial);if(initial!=="dashboard")renderModule(initial);}

/* =========================================================
   ACC Tracker - Diagnose Excel vs Supabase (674 diffs)
   โหมด: Read-only 100%
   วิธีใช้: เปิดแอป ACC Tracker -> Login -> Chrome DevTools Snippets -> วาง -> รัน
   ========================================================= */

(function() {
  'use strict';

  const EXCEL_FILE_NAME = 'AE_ACCOUNTING_WORK_TRACKER.xlsm';
  const SHEET_TASKS = 'รายการงาน';
  const SHEET_COMPANIES = 'ติดตามรายบริษัท';
  const PAGE_SIZE = 1000;

  const COMPARE_FIELDS = [
    'company_code', 'company_name', 'status',
    'task_type', 'buddhist_year', 'month', 'company_id'
  ];

  let results = {
    excelTasks: 0,
    supabaseTasks: 0,
    excelCompanies: 0,
    supabaseCompanies: 0,
    fieldDiffs: {},          // field -> count
    affectedCompanies: new Set(), // CompanyID set
    excelOnly: [],
    supabaseOnly: [],
    detailMismatches: [],
    uuidDuplicates: [],
    companyCodeMismatch: {}, // CompanyID -> { excel, work_tasks, companies }
    errors: []
  };

  function log(msg) { console.log(msg); }
  function error(msg) { console.error('❌ ' + msg); results.errors.push(msg); }
  function success(msg) { console.log('✅ ' + msg); }
  function warn(msg) { console.warn('⚠️ ' + msg); }

  function makeCompositeKey(row) {
    return String(row.buddhist_year || '') + '|' +
           String(row.month || '') + '|' +
           String(row.company_id || '') + '|' +
           String(row.task_type || '');
  }

  function normalize(val) {
    return val !== null && val !== undefined ? String(val).trim() : '';
  }

  // =========================================================
  // ตรวจสอบ Environment
  // =========================================================
  function checkEnvironment() {
    log('=== ขั้นตอนที่ 1: ตรวจสอบ Environment ===');
    if (typeof XLSX === 'undefined') {
      error('SheetJS (XLSX) ยังไม่โหลด');
      return false;
    }
    success('SheetJS พร้อมใช้งาน');
    if (typeof sbClient === 'undefined') {
      error('sbClient (Supabase Client) ไม่พบ');
      return false;
    }
    success('Supabase Client พร้อมใช้งาน');
    return true;
  }

  // =========================================================
  // ตรวจสอบ Session
  // =========================================================
  async function checkSession() {
    log('\n=== ขั้นตอนที่ 2: ตรวจสอบ Session ===');
    try {
      const { data, error: err } = await sbClient.auth.getSession();
      if (err) { error('ไม่สามารถตรวจสอบ session: ' + err.message); return false; }
      if (!data.session) {
        error('ยังไม่ได้ Login กรุณาเข้าสู่ระบบก่อน');
        return false;
      }
      success('ผู้ใช้ได้รับการยืนยันตัวตนแล้ว');
      return true;
    } catch (err) {
      error('เกิดข้อผิดพลาด: ' + err.message);
      return false;
    }
  }

  // =========================================================
  // อ่านไฟล์ Excel
  // =========================================================
  function readExcelFile() {
    return new Promise((resolve, reject) => {
      log('\n=== ขั้นตอนที่ 3: อ่านไฟล์ Excel ===');
      log('กรุณาเลือกไฟล์: ' + EXCEL_FILE_NAME);
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.xlsx,.xlsm';
      input.style.position = 'fixed';
      input.style.left = '-9999px';
      input.style.top = '-9999px';
      input.style.opacity = '0';
      document.body.appendChild(input);

      let resolved = false;

      input.onchange = function(e) {
        if (resolved) return;
        resolved = true;
        const file = e.target.files[0];
        if (!file) { document.body.removeChild(input); reject(new Error('ไม่ได้เลือกไฟล์')); return; }
        const reader = new FileReader();
        reader.onload = function(e) {
          try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });
            if (!workbook.SheetNames.includes(SHEET_TASKS)) {
              error('ไม่พบ Sheet "' + SHEET_TASKS + '"');
              document.body.removeChild(input);
              reject(new Error('ไม่พบ Sheet ' + SHEET_TASKS));
              return;
            }
            document.body.removeChild(input);
            resolve({ workbook, fileName: file.name });
          } catch (err) {
            document.body.removeChild(input);
            error('อ่านไฟล์ Excel ล้มเหลว: ' + err.message);
            reject(err);
          }
        };
        reader.onerror = function() {
          document.body.removeChild(input);
          reject(new Error('FileReader error'));
        };
        reader.readAsArrayBuffer(file);
      };

      input.click();
    });
  }

  // =========================================================
  // ประมวลผล Excel tasks
  // =========================================================
  function processExcelTasks(workbook) {
    log('\n=== ขั้นตอนที่ 4: ประมวลผล Excel ' + SHEET_TASKS + ' ===');
    const worksheet = workbook.Sheets[SHEET_TASKS];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true });
    if (!jsonData || jsonData.length < 2) {
      error('ไฟล์ Excel ไม่มีข้อมูล');
      return false;
    }
    const headerRow = jsonData[0];
    const colMap = {};
    headerRow.forEach((h, idx) => { if (h !== null && h !== undefined) colMap[String(h).trim()] = idx; });
    const requiredCols = ['ปี พ.ศ.', 'เดือน', 'CompanyID', 'Company Code', 'บริษัท', 'ประเภทงาน', 'สถานะ'];
    const missing = requiredCols.filter(c => colMap[c] === undefined);
    if (missing.length > 0) {
      error('ไม่พบคอลัมน์: ' + missing.join(', '));
      return false;
    }
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row || row.every(c => c === null || c === undefined || c === '')) continue;
      const task = {
        buddhist_year: row[colMap['ปี พ.ศ.']],
        month: row[colMap['เดือน']],
        company_id: row[colMap['CompanyID']],
        company_code: row[colMap['Company Code']],
        company_name: row[colMap['บริษัท']],
        task_type: row[colMap['ประเภทงาน']],
        status: row[colMap['สถานะ']],
        excelRowNum: i + 1
      };
      const ck = makeCompositeKey(task);
      results.excelTasks++;
      if (!results.excelTaskMap) results.excelTaskMap = new Map();
      results.excelTaskMap.set(ck, task);
    }
    success('Excel tasks: ' + results.excelTasks + ' รายการ');
    return true;
  }

  // =========================================================
  // ประมวลผล Excel companies
  // =========================================================
  function processExcelCompanies(workbook) {
    log('\n=== ขั้นตอนที่ 5: ประมวลผล Excel ' + SHEET_COMPANIES + ' ===');
    if (!workbook.SheetNames.includes(SHEET_COMPANIES)) {
      warn('ไม่พบ Sheet "' + SHEET_COMPANIES + '" ข้ามการเปรียบเทียบ companies');
      return true;
    }
    const worksheet = workbook.Sheets[SHEET_COMPANIES];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true });
    if (!jsonData || jsonData.length < 2) {
      warn('Sheet ' + SHEET_COMPANIES + ' ไม่มีข้อมูล');
      return true;
    }
    const headerRow = jsonData[0];
    const colMap = {};
    headerRow.forEach((h, idx) => { if (h !== null && h !== undefined) colMap[String(h).trim()] = idx; });
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row || row.every(c => c === null || c === undefined || c === '')) continue;
      const comp = {
        company_id: row[colMap['CompanyID']] !== undefined ? row[colMap['CompanyID']] : row[0],
        company_code: row[colMap['Company Code']] !== undefined ? row[colMap['Company Code']] : row[1],
        company_name: row[colMap['บริษัท']] !== undefined ? row[colMap['บริษัท']] : row[2]
      };
      if (comp.company_id) {
        results.excelCompanies++;
        if (!results.excelCompanyMap) results.excelCompanyMap = new Map();
        results.excelCompanyMap.set(String(comp.company_id), comp);
      }
    }
    success('Excel companies: ' + results.excelCompanies + ' รายการ');
    return true;
  }

  // =========================================================
  // อ่าน Supabase work_tasks
  // =========================================================
  async function readSupabaseTasks() {
    log('\n=== ขั้นตอนที่ 6: อ่าน work_tasks จาก Supabase ===');
    let from = 0, hasMore = true;
    while (hasMore) {
      try {
        const { data, error: err } = await sbClient
          .from('work_tasks')
          .select('*')
          .order('task_id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (err) { error('Supabase error: ' + err.message); return false; }
        const batch = data || [];
        results.supabaseTasks += batch.length;
        batch.forEach(t => {
          const row = {
            task_id: t.task_id,
            buddhist_year: t.buddhist_year,
            month: t.month,
            company_id: t.company_id,
            company_code: t.company_code,
            company_name: t.company_name,
            task_type: t.task_type,
            status: t.status
          };
          const ck = makeCompositeKey(row);
          if (!results.supabaseTaskMap) results.supabaseTaskMap = new Map();
          if (results.supabaseTaskMap.has(ck)) {
            results.uuidDuplicates.push({ key: ck, uuid1: results.supabaseTaskMap.get(ck).task_id, uuid2: t.task_id });
          } else {
            results.supabaseTaskMap.set(ck, row);
          }
        });
        if (batch.length < PAGE_SIZE) hasMore = false; else from += PAGE_SIZE;
      } catch (err) {
        error('เกิดข้อผิดพลาด: ' + err.message);
        return false;
      }
    }
    success('Supabase work_tasks: ' + results.supabaseTasks + ' รายการ');
    return true;
  }

  // =========================================================
  // อ่าน Supabase companies
  // =========================================================
  async function readSupabaseCompanies() {
    log('\n=== ขั้นตอนที่ 7: อ่าน companies จาก Supabase ===');
    try {
      const { data, error: err } = await sbClient
        .from('companies')
        .select('*')
        .order('company_id', { ascending: true });
      if (err) { error('Supabase companies error: ' + err.message); return false; }
      const batch = data || [];
      results.supabaseCompanies = batch.length;
      if (!results.supabaseCompanyMap) results.supabaseCompanyMap = new Map();
      batch.forEach(c => {
        results.supabaseCompanyMap.set(String(c.company_id), {
          company_id: c.company_id,
          company_code: c.company_code,
          company_name: c.company_name
        });
      });
      success('Supabase companies: ' + results.supabaseCompanies + ' รายการ');
      return true;
    } catch (err) {
      error('เกิดข้อผิดพลาด: ' + err.message);
      return false;
    }
  }

  // =========================================================
  // เปรียบเทียบและวินิจฉัย
  // =========================================================
  function diagnose() {
    log('\n=== ขั้นตอนที่ 8: วินิจฉัยความแตกต่าง ===');

    const excelKeys = new Set(results.excelTaskMap.keys());
    const supaKeys = new Set(results.supabaseTaskMap.keys());

    // Excel only
    for (const k of excelKeys) if (!supaKeys.has(k)) results.excelOnly.push(results.excelTaskMap.get(k));
    // Supabase only
    for (const k of supaKeys) if (!excelKeys.has(k)) results.supabaseOnly.push(results.supabaseTaskMap.get(k));

    // Matched keys - compare details
    const matched = new Set([...excelKeys].filter(k => supaKeys.has(k)));
    for (const ck of matched) {
      const e = results.excelTaskMap.get(ck);
      const s = results.supabaseTaskMap.get(ck);
      const diffs = {};
      COMPARE_FIELDS.forEach(f => {
        if (normalize(e[f]) !== normalize(s[f])) diffs[f] = { excel: normalize(e[f]), supabase: normalize(s[f]) };
      });
      if (Object.keys(diffs).length > 0) {
        results.detailMismatches.push({ key: ck, task_id: s.task_id, diffs, excel: e, supabase: s });
        results.affectedCompanies.add(String(e.company_id));
        // Track company_code mismatch specifically
        if (diffs.company_code) {
          const cid = String(e.company_id);
          if (!results.companyCodeMismatch[cid]) {
            results.companyCodeMismatch[cid] = {
              excel: e.company_code,
              work_tasks: s.company_code,
              companies: results.excelCompanyMap ? (results.excelCompanyMap.get(cid) ? results.excelCompanyMap.get(cid).company_code : 'N/A') : 'N/A'
            };
          }
        }
      }
    }

    // Company code: Excel vs companies table
    if (results.excelCompanyMap && results.supabaseCompanyMap) {
      for (const [cid, excelComp] of results.excelCompanyMap) {
        const supaComp = results.supabaseCompanyMap.get(cid);
        if (supaComp && normalize(excelComp.company_code) !== normalize(supaComp.company_code)) {
          if (!results.companyCodeMismatch[cid]) {
            results.companyCodeMismatch[cid] = {
              excel: excelComp.company_code,
              work_tasks: 'N/A',
              companies: supaComp.company_code
            };
          } else {
            results.companyCodeMismatch[cid].companies = supaComp.company_code;
          }
        }
      }
    }

    // Count field diffs
    results.fieldDiffs = {};
    COMPARE_FIELDS.forEach(f => results.fieldDiffs[f] = 0);
    for (const m of results.detailMismatches) {
      Object.keys(m.diffs).forEach(f => { results.fieldDiffs[f] = (results.fieldDiffs[f] || 0) + 1; });
    }
  }

  // =========================================================
  // แสดงสรุป
  // =========================================================
  function showSummary() {
    log('\n' + '='.repeat(70));
    log('สรุปผลการวินิจฉัย Excel vs Supabase');
    log('='.repeat(70));

    log('📊 Excel tasks: ' + results.excelTasks);
    log('📊 Supabase work_tasks: ' + results.supabaseTasks);
    log('📊 Excel companies: ' + results.excelCompanies);
    log('📊 Supabase companies: ' + results.supabaseCompanies);
    log('🔑 Composite Key ตรงกัน: ' + (results.excelTaskMap.size - results.excelOnly.length));
    log('📋 Excel Only: ' + results.excelOnly.length);
    log('📋 Supabase Only: ' + results.supabaseOnly.length);
    log('⚠️ รายละเอียดต่างกัน: ' + results.detailMismatches.length);
    log('🏢 บริษัทที่ได้รับผลกระทบ: ' + results.affectedCompanies.size);
    log('🆔 UUID ซ้ำ: ' + results.uuidDuplicates.length);

    log('\n--- ความแตกต่างแยกตาม Field ---');
    Object.entries(results.fieldDiffs).forEach(([f, c]) => {
      log('  ' + f.padEnd(20) + ': ' + c + ' รายการ');
    });

    log('\n--- Company Code Mismatch (Excel vs work_tasks vs companies) ---');
    const ccEntries = Object.entries(results.companyCodeMismatch);
    log('จำนวนบริษัทที่ company_code ไม่ตรง: ' + ccEntries.length);
    ccEntries.slice(0, 10).forEach(([cid, vals]) => {
      log('  ' + cid + ': Excel=' + vals.excel + ' | work_tasks=' + vals.work_tasks + ' | companies=' + vals.companies);
    });

    log('\n--- ตัวอย่างรายละเอียดต่างกัน (สูงสุด 10 รายการ) ---');
    results.detailMismatches.slice(0, 10).forEach((m, i) => {
      log((i + 1) + '. Key: ' + m.key + ' | UUID: ' + m.task_id + ' | Company: ' + m.excel.company_id);
      Object.entries(m.diffs).forEach(([f, v]) => {
        log('     ' + f + ': Excel="' + v.excel + '" vs Supabase="' + v.supabase + '"');
      });
    });

    const isCompanyCodeOnly = results.detailMismatches.length > 0 &&
      results.detailMismatches.every(m => Object.keys(m.diffs).length === 1 && m.diffs.company_code);
    log('\n🔍 สรุปสาเหตุ: ' + (isCompanyCodeOnly ? 'เกิดจาก company_code อย่างเดียว' : 'มี Field อื่นแตกต่างด้วย'));

    log('\n' + '='.repeat(70));
    log('สิ้นสุดการวินิจฉัย (Read-only - ไม่มีการแก้ไขข้อมูล)');
    log('='.repeat(70));
  }

  // =========================================================
  // Main
  // =========================================================
  async function main() {
    console.clear();
    log('========================================');
    log('ACC Tracker - Diagnose Excel vs Supabase');
    log('โหมด: Read-only 100%');
    log('========================================');

    if (!checkEnvironment()) { log('หยุด: environment ไม่พร้อม'); return; }
    if (!await checkSession()) { log('หยุด: ยังไม่ได้ Login'); return; }

    let wb;
    try { wb = await readExcelFile(); } catch (err) { error('อ่าน Excel ไม่สำเร็จ: ' + err.message); return; }
    if (!processExcelTasks(wb.workbook)) { log('หยุด: ประมวลผล Excel tasks ไม่สำเร็จ'); return; }

    if (!processExcelCompanies(wb.workbook)) { log('หยุด: ประมวลผล Excel companies ไม่สำเร็จ'); return; }
    if (!await readSupabaseTasks()) { log('หยุด: อ่าน Supabase tasks ไม่สำเร็จ'); return; }
    if (!await readSupabaseCompanies()) { log('หยุด: อ่าน Supabase companies ไม่สำเร็จ'); return; }

    diagnose();
    showSummary();
  }

  main();
})();

/* =========================================================
   ACC Tracker - Diagnose Company Master (Excel vs Supabase)
   โหมด: Read-only 100%
   วิธีใช้: เปิดแอป ACC Tracker -> Login -> Chrome DevTools Snippets -> วาง -> รัน
   รองรับ Sheet 'บริษัท' (Header แถว 1) และ Sheet 'ติดตามรายบริษัท' (Header แถว 4)
   ========================================================= */

(function() {
  'use strict';

  const EXCEL_FILE_NAME = 'AE_ACCOUNTING_WORK_TRACKER.xlsm';
  const SHEET_MASTER = 'บริษัท';           // Header แถว 1
  const SHEET_TRACKING = 'ติดตามรายบริษัท'; // Header แถว 4
  const HEADER_ROW_MASTER = 1;
  const HEADER_ROW_TRACKING = 4;
  const PAGE_SIZE = 1000;

  // ตัวตรวจจับอักขระ U+FFFD (� replacement character)
  const REPLACEMENT_CHAR = '\uFFFD';

  let results = {
    excelMasterCount: 0,        // จาก Sheet 'บริษัท'
    excelTrackingCount: 0,      // จาก Sheet 'ติดตามรายบริษัท'
    supabaseCompanies: 0,
    supabaseWorkTasksCompanies: 0,
    masterMap: new Map(),       // CompanyID -> { company_code, company_name, row }
    trackingMap: new Map(),     // CompanyID -> { company_code, company_name, row }
    supabaseCompanyMap: new Map(), // CompanyID -> { company_code, company_name }
    workTasksGrouped: new Map(), // CompanyID -> Set of { company_code, company_name }
    onlyInMaster: [],
    onlyInTracking: [],
    onlyInSupabase: [],
    inAllThree: [],
    codeMismatches: [],         // { company_id, master, tracking, companies, work_tasks }
    nameMismatches: [],         // { company_id, master, tracking, companies, work_tasks }
    replacementCharFound: [],   // { company_id, field, value, source, row }
    allComparisonRows: [],      // รายละเอียดครบทุกบริษัท
    errors: []
  };

  function log(msg) { console.log(msg); }
  function error(msg) { console.error('❌ ' + msg); results.errors.push(msg); }
  function success(msg) { console.log('✅ ' + msg); }
  function info(msg) { console.log('ℹ️ ' + msg); }

  function normalizeKey(key) {
    if (key === null || key === undefined) return '';
    return String(key).trim().toLowerCase();
  }

  function normalizeVal(val) {
    return val !== null && val !== undefined ? String(val).trim() : '';
  }

  function hasReplacementChar(val) {
    return val !== null && val !== undefined && String(val).includes(REPLACEMENT_CHAR);
  }

  // ค้นหาตำแหน่งคอลัมน์จาก header row โดยไม่สนตัวพิมพ์เล็กใหญ่และตัดช่องว่าง
  function findColumnIndices(headerRow, requiredNames) {
    var colMap = {};
    headerRow.forEach(function(h, idx) {
      if (h !== null && h !== undefined) {
        var norm = normalizeKey(h);
        requiredNames.forEach(function(reqName) {
          if (norm === normalizeKey(reqName)) {
            colMap[reqName] = idx;
          }
        });
      }
    });
    return colMap;
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
  // ตรวจสอบ Session ผ่าน sbClient.auth.getSession()
  // =========================================================
  async function checkSession() {
    log('\n=== ขั้นตอนที่ X: ตรวจสอบ Session ===');
    try {
      var { data, error: err } = await sbClient.auth.getSession();
      if (err) {
        error('ไม่สามารถตรวจสอบ session: ' + err.message);
        return false;
      }
      if (!data.session) {
        error('ยังไม่ได้ Login กรุณาเข้าสู่ระบบ ACC Tracker ก่อน');
        return false;
      }
      success('ผู้ใช้ได้รับการยืนยันตัวตนแล้ว (' + (data.session.user.email || 'ไม่ระบุอีเมล') + ')');
      return true;
    } catch (err) {
      error('เกิดข้อผิดพลาดในการตรวจสอบ session: ' + err.message);
      return false;
    }
  }

  // =========================================================
  // สร้าง UI สำหรับเลือกไฟล์ Excel
  // =========================================================
  function createFilePicker() {
    return new Promise(function(resolve, reject) {
      log('\n=== ขั้นตอนที่ 2: เลือกไฟล์ Excel ===');

      var container = document.createElement('div');
      container.id = 'acc-excel-picker';
      container.style.position = 'fixed';
      container.style.top = '20px';
      container.style.left = '50%';
      container.style.transform = 'translateX(-50%)';
      container.style.zIndex = '10000';
      container.style.background = '#1b2021';
      container.style.border = '1px solid #b99a60';
      container.style.borderRadius = '12px';
      container.style.padding = '20px';
      container.style.color = '#f2f0e9';
      container.style.fontFamily = 'inherit';
      container.style.boxShadow = '0 20px 70px rgba(0,0,0,.4)';
      container.style.textAlign = 'center';

      var title = document.createElement('div');
      title.textContent = 'เลือกไฟล์ ' + EXCEL_FILE_NAME;
      title.style.fontWeight = '700';
      title.style.marginBottom = '12px';
      container.appendChild(title);

      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.xlsx,.xlsm';
      input.style.marginBottom = '10px';
      container.appendChild(input);

      var cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'ยกเลิก';
      cancelBtn.style.marginRight = '10px';
      container.appendChild(cancelBtn);

      document.body.appendChild(container);

      var resolved = false;
      input.onchange = function(e) {
        if (resolved) return;
        resolved = true;
        var file = e.target.files[0];
        document.body.removeChild(container);
        if (!file) {
          log('ผู้ใช้ยกเลิกการเลือกไฟล์');
          reject(new Error('ไม่ได้เลือกไฟล์'));
          return;
        }
        resolve(file);
      };

      cancelBtn.onclick = function() {
        if (resolved) return;
        resolved = true;
        document.body.removeChild(container);
        log('ผู้ใช้ยกเลิกการเลือกไฟล์');
        reject(new Error('ผู้ใช้ยกเลิก'));
      };
    });
  }

  // =========================================================
  // อ่านไฟล์ Excel ด้วย FileReader
  // =========================================================
  function readExcelFile(file) {
    return new Promise(function(resolve, reject) {
      var reader = new FileReader();
      reader.onload = function(e) {
        try {
          var data = new Uint8Array(e.target.result);
          var workbook = XLSX.read(data, { type: 'array', cellDates: true });
          resolve({ workbook: workbook, fileName: file.name });
        } catch (err) {
          error('อ่านไฟล์ Excel ล้มเหลว: ' + err.message);
          reject(err);
        }
      };
      reader.onerror = function() {
        reject(new Error('FileReader error'));
      };
      reader.readAsArrayBuffer(file);
    });
  }

  // =========================================================
  // ประมวลผล Sheet 'บริษัท' (Header แถว 1) - Excel Master
  // =========================================================
  function processExcelMaster(workbook) {
    log('\n=== ขั้นตอนที่ 3: ประมวลผล Sheet \'' + SHEET_MASTER + '\' (Header แถว 1) ===');

    if (!workbook.SheetNames.includes(SHEET_MASTER)) {
      warn('ไม่พบ Sheet \'' + SHEET_MASTER + '\' ข้ามการอ่าน Excel Master');
      return true;
    }

    var worksheet = workbook.Sheets[SHEET_MASTER];
    var jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true });

    if (!jsonData || jsonData.length < HEADER_ROW_MASTER) {
      error('Sheet \'' + SHEET_MASTER + '\' ไม่มีข้อมูลเพียงพอ');
      return false;
    }

    // Header อยู่ที่แถว 1 (index 0)
    var headerRow = jsonData[HEADER_ROW_MASTER - 1];
    var colMap = findColumnIndices(headerRow, ['CompanyID', 'CompanyCode', 'CompanyName']);

    // แสดง Header ที่ normalize แล้วและผลลัพธ์ Index สำหรับ debug
    var normHeader = headerRow.map(function(h) { return h !== null && h !== undefined ? String(h).trim() : '(ว่าง)'; });
    log('Header ที่ตรวจพบ (Sheet \'' + SHEET_MASTER + '\'): ' + JSON.stringify(normHeader));
    log('คอลัมน์ที่พบ: CompanyID=' + colMap.CompanyID + ' | CompanyCode=' + colMap.CompanyCode + ' | CompanyName=' + colMap.CompanyName);

    if (colMap.CompanyID === undefined) {
      error('Sheet \'' + SHEET_MASTER + '\' ไม่พบคอลัมน์ CompanyID');
      error('Header ที่พบ: ' + JSON.stringify(headerRow));
      return false;
    }

    for (var i = HEADER_ROW_MASTER; i < jsonData.length; i++) {
      var row = jsonData[i];
      if (!row || row.every(function(c) { return c === null || c === undefined || c === ''; })) continue;

      var cid = normalizeVal(row[colMap.CompanyID]);
      if (!cid) continue;

      var code = colMap.CompanyCode !== undefined ? normalizeVal(row[colMap.CompanyCode]) : '';
      var name = colMap.CompanyName !== undefined ? normalizeVal(row[colMap.CompanyName]) : '';

      results.excelMasterCount++;
      results.masterMap.set(cid, { company_code: code, company_name: name, row: i + 1 });

      // ตรวจสอบอักขระ U+FFFD
      if (hasReplacementChar(code)) {
        results.replacementCharFound.push({ company_id: cid, field: 'company_code', value: code, source: 'Excel ' + SHEET_MASTER, row: i + 1 });
      }
      if (hasReplacementChar(name)) {
        results.replacementCharFound.push({ company_id: cid, field: 'company_name', value: name, source: 'Excel ' + SHEET_MASTER, row: i + 1 });
      }
    }

    success('Excel Master (' + SHEET_MASTER + '): ' + results.excelMasterCount + ' บริษัท');
    return true;
  }

  // =========================================================
  // ประมวลผล Sheet 'ติดตามรายบริษัท' (Header แถว 4) - Excel Tracking
  // =========================================================
  function processExcelTracking(workbook) {
    log('\n=== ขั้นตอนที่ 4: ประมวลผล Sheet \'' + SHEET_TRACKING + '\' (Header แถว 4) ===');

    if (!workbook.SheetNames.includes(SHEET_TRACKING)) {
      warn('ไม่พบ Sheet \'' + SHEET_TRACKING + '\' ข้ามการอ่าน Excel Tracking');
      return true;
    }

    var worksheet = workbook.Sheets[SHEET_TRACKING];
    var jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true });

    if (!jsonData || jsonData.length < HEADER_ROW_TRACKING) {
      error('Sheet \'' + SHEET_TRACKING + '\' ไม่มีข้อมูลเพียงพอ');
      return false;
    }

    // Header อยู่ที่แถว 4 (index 3)
    var headerRow = jsonData[HEADER_ROW_TRACKING - 1];
    var colMap = findColumnIndices(headerRow, ['CompanyID', 'Company Code', 'บริษัท']);

    // แสดง Header ที่ normalize แล้วและผลลัพธ์ Index สำหรับ debug
    var normHeader = headerRow.map(function(h) { return h !== null && h !== undefined ? String(h).trim() : '(ว่าง)'; });
    log('Header ที่ตรวจพบ (Sheet \'' + SHEET_TRACKING + '\'): ' + JSON.stringify(normHeader));
    log('คอลัมน์ที่พบ: CompanyID=' + colMap.CompanyID + ' | Company Code=' + colMap['Company Code'] + ' | บริษัท=' + colMap['บริษัท']);

    if (colMap.CompanyID === undefined) {
      error('Sheet \'' + SHEET_TRACKING + '\' ไม่พบคอลัมน์ CompanyID');
      error('Header ที่พบ: ' + JSON.stringify(headerRow));
      return false;
    }

    for (var i = HEADER_ROW_TRACKING; i < jsonData.length; i++) {
      var row = jsonData[i];
      if (!row || row.every(function(c) { return c === null || c === undefined || c === ''; })) continue;

      var cid = normalizeVal(row[colMap.CompanyID]);
      if (!cid) continue;

      var code = colMap['Company Code'] !== undefined ? normalizeVal(row[colMap['Company Code']]) : '';
      var name = colMap['บริษัท'] !== undefined ? normalizeVal(row[colMap['บริษัท']]) : '';

      results.excelTrackingCount++;
      results.trackingMap.set(cid, { company_code: code, company_name: name, row: i + 1 });

      // ตรวจสอบอักขระ U+FFFD
      if (hasReplacementChar(code)) {
        results.replacementCharFound.push({ company_id: cid, field: 'company_code', value: code, source: 'Excel ' + SHEET_TRACKING, row: i + 1 });
      }
      if (hasReplacementChar(name)) {
        results.replacementCharFound.push({ company_id: cid, field: 'company_name', value: name, source: 'Excel ' + SHEET_TRACKING, row: i + 1 });
      }
    }

    success('Excel Tracking (' + SHEET_TRACKING + '): ' + results.excelTrackingCount + ' บริษัท');
    return true;
  }

  // =========================================================
  // อ่าน Supabase companies
  // =========================================================
  async function readSupabaseCompanies() {
    log('\n=== ขั้นตอนที่ 5: อ่าน companies จาก Supabase ===');
    try {
      var { data, error: err } = await sbClient
        .from('companies')
        .select('*')
        .order('company_id', { ascending: true });
      if (err) { error('Supabase companies error: ' + err.message); return false; }
      var batch = data || [];
      results.supabaseCompanies = batch.length;
      batch.forEach(function(c) {
        var cid = String(c.company_id || '');
        var code = normalizeVal(c.company_code);
        var name = normalizeVal(c.company_name);
        results.supabaseCompanyMap.set(cid, { company_code: code, company_name: name });

        if (hasReplacementChar(code)) {
          results.replacementCharFound.push({ company_id: cid, field: 'company_code', value: code, source: 'Supabase companies' });
        }
        if (hasReplacementChar(name)) {
          results.replacementCharFound.push({ company_id: cid, field: 'company_name', value: name, source: 'Supabase companies' });
        }
      });
      success('Supabase companies: ' + results.supabaseCompanies + ' บริษัท');
      return true;
    } catch (err) {
      error('เกิดข้อผิดพลาด: ' + err.message);
      return false;
    }
  }

  // =========================================================
  // อ่าน work_tasks และจัดกลุ่มตาม company_id (ห้ามนับ task records เป็นจำนวนบริษัท)
  // =========================================================
  async function readWorkTasksCompanies() {
    log('\n=== ขั้นตอนที่ 6: อ่าน work_tasks จาก Supabase (จัดกลุ่มตาม company_id) ===');
    var from = 0, hasMore = true;
    while (hasMore) {
      try {
        var { data, error: err } = await sbClient
          .from('work_tasks')
          .select('company_id, company_code, company_name')
          .order('company_id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (err) { error('Supabase work_tasks error: ' + err.message); return false; }
        var batch = data || [];
        results.supabaseWorkTasksCompanies += batch.length;
        batch.forEach(function(t) {
          var cid = String(t.company_id || '');
          if (!cid) return; // ห้ามนำไปจับคู่ด้วยชื่อบริษัทโดยอัตโนมัติ
          var code = normalizeVal(t.company_code);
          var name = normalizeVal(t.company_name);
          if (!results.workTasksGrouped.has(cid)) {
            results.workTasksGrouped.set(cid, new Set());
          }
          results.workTasksGrouped.get(cid).add({ company_code: code, company_name: name });

          if (hasReplacementChar(code)) {
            results.replacementCharFound.push({ company_id: cid, field: 'company_code', value: code, source: 'Supabase work_tasks' });
          }
          if (hasReplacementChar(name)) {
            results.replacementCharFound.push({ company_id: cid, field: 'company_name', value: name, source: 'Supabase work_tasks' });
          }
        });
        if (batch.length < PAGE_SIZE) hasMore = false; else from += PAGE_SIZE;
      } catch (err) {
        error('เกิดข้อผิดพลาด: ' + err.message);
        return false;
      }
    }
    success('work_tasks company records: ' + results.supabaseWorkTasksCompanies + ' รายการ (จัดกลุ่มเป็น ' + results.workTasksGrouped.size + ' CompanyID ที่ไม่ซ้ำ)');
    return true;
  }

  // =========================================================
  // เปรียบเทียบ Company Master ทั้งสามแหล่ง
  // =========================================================
  function diagnose() {
    log('\n=== ขั้นตอนที่ 7: เปรียบเทียบ Company Master ===');

    var masterIds = new Set(results.masterMap.keys());
    var trackingIds = new Set(results.trackingMap.keys());
    var supaIds = new Set(results.supabaseCompanyMap.keys());
    var wtIds = new Set(results.workTasksGrouped.keys());

    // CompanyID ที่มีเฉพาะใน Master
    masterIds.forEach(function(cid) {
      if (!trackingIds.has(cid)) {
        results.onlyInMaster.push({ company_id: cid, source: 'ไม่มีใน ' + SHEET_TRACKING });
      }
      if (!supaIds.has(cid)) {
        results.onlyInSupabase.push({ company_id: cid, source: 'ไม่มีใน Supabase companies' });
      }
    });

    // CompanyID ที่มีเฉพาะใน Tracking
    trackingIds.forEach(function(cid) {
      if (!masterIds.has(cid)) {
        results.onlyInTracking.push({ company_id: cid, source: 'ไม่มีใน ' + SHEET_MASTER });
      }
    });

    // CompanyID ที่มีในทั้งสามแหล่ง
    masterIds.forEach(function(cid) {
      if (trackingIds.has(cid) && supaIds.has(cid)) {
        results.inAllThree.push(cid);
      }
    });

    // เปรียบเทียบรายละเอียดสำหรับ CompanyID ที่มีใน Master และ Supabase
    masterIds.forEach(function(cid) {
      var m = results.masterMap.get(cid);
      var t = results.trackingMap.get(cid);
      var s = results.supabaseCompanyMap.get(cid);
      var wtSet = results.workTasksGrouped.get(cid);

      // รวม company_code และ company_name จาก work_tasks (อาจมีหลายค่า แต่ไม่ใช่จำนวนบริษัท)
      var wtCodes = wtSet ? Array.from(wtSet).map(function(x) { return x.company_code; }).filter(function(v, i, a) { return a.indexOf(v) === i; }) : [];
      var wtNames = wtSet ? Array.from(wtSet).map(function(x) { return x.company_name; }).filter(function(v, i, a) { return a.indexOf(v) === i; }) : [];

      // company_code mismatch
      var codeMismatch = false;
      if (s && normalizeVal(m.company_code) !== normalizeVal(s.company_code)) codeMismatch = true;
      if (wtSet && wtCodes.length > 0 && wtCodes.some(function(c) { return normalizeVal(c) !== normalizeVal(m.company_code); })) codeMismatch = true;
      if (t && normalizeVal(m.company_code) !== normalizeVal(t.company_code)) codeMismatch = true;

      if (codeMismatch) {
        results.codeMismatches.push({
          company_id: cid,
          master: m.company_code,
          tracking: t ? t.company_code : '(ไม่มีข้อมูล)',
          companies: s ? s.company_code : '(ไม่มีใน Supabase)',
          work_tasks: wtCodes.length > 0 ? wtCodes.join(' | ') : '(ไม่มีข้อมูล)'
        });
      }

      // company_name mismatch
      var nameMismatch = false;
      if (s && normalizeVal(m.company_name) !== normalizeVal(s.company_name)) nameMismatch = true;
      if (wtSet && wtNames.length > 0 && wtNames.some(function(n) { return normalizeVal(n) !== normalizeVal(m.company_name); })) nameMismatch = true;
      if (t && normalizeVal(m.company_name) !== normalizeVal(t.company_name)) nameMismatch = true;

      if (nameMismatch) {
        results.nameMismatches.push({
          company_id: cid,
          master: m.company_name,
          tracking: t ? t.company_name : '(ไม่มีข้อมูล)',
          companies: s ? s.company_name : '(ไม่มีใน Supabase)',
          work_tasks: wtNames.length > 0 ? wtNames.join(' | ') : '(ไม่มีข้อมูล)'
        });
      }

      // สร้างแถวสำหรับตารางเปรียบเทียบเต็ม (ทุกรายการ ไม่จำกัด)
      results.allComparisonRows.push({
        company_id: cid,
        master_code: m.company_code,
        master_name: m.company_name,
        tracking_code: t ? t.company_code : '(ไม่มี)',
        tracking_name: t ? t.company_name : '(ไม่มี)',
        supa_code: s ? s.company_code : '(ไม่มีใน Supabase)',
        supa_name: s ? s.company_name : '(ไม่มีใน Supabase)',
        wt_codes: wtCodes.length > 0 ? wtCodes.join(' | ') : '(ไม่มี)',
        wt_names: wtNames.length > 0 ? wtNames.join(' | ') : '(ไม่มี)',
        codeMatch: codeMismatch ? '❌' : '✅',
        nameMatch: nameMismatch ? '❌' : '✅'
      });
    });
  }

  // =========================================================
  // แสดงสรุป
  // =========================================================
  function showSummary() {
    log('\n' + '='.repeat(80));
    log('สรุปผลการวินิจฉัย Company Master');
    log('='.repeat(80));

    log('📊 Excel Master (' + SHEET_MASTER + '): ' + results.excelMasterCount + ' บริษัท');
    log('📊 Excel Tracking (' + SHEET_TRACKING + '): ' + results.excelTrackingCount + ' บริษัท');
    log('📊 Supabase companies: ' + results.supabaseCompanies + ' บริษัท');
    log('📊 work_tasks records: ' + results.supabaseWorkTasksCompanies + ' รายการ (จัดกลุ่มเป็น ' + results.workTasksGrouped.size + ' CompanyID ที่ไม่ซ้ำ)');
    log('🔑 CompanyID ที่มีในทั้ง 3 แหล่ง: ' + results.inAllThree.length);
    log('📋 มีเฉพาะใน ' + SHEET_MASTER + ': ' + results.onlyInMaster.length);
    log('📋 มีเฉพาะใน ' + SHEET_TRACKING + ': ' + results.onlyInTracking.length);
    log('📋 มีเฉพาะใน Supabase companies: ' + results.onlyInSupabase.length);
    log('🏷️ company_code ไม่ตรงกัน: ' + results.codeMismatches.length);
    log('🏷️ company_name ไม่ตรงกัน: ' + results.nameMismatches.length);
    log('� อักขระ U+FFFD ที่พบ: ' + results.replacementCharFound.length);

    // รายละเอียดครบทุกบริษัท (ไม่แสดงเฉพาะตัวอย่าง)
    log('\n--- ตารางเปรียบเทียบ Company Master ทั้งหมด ---');
    log('CompanyID | Master Code | Master Name | Tracking Code | Tracking Name | Supabase Code | Supabase Name | WT Codes | WT Names | Code | Name');
    log('---|---|---|---|---|---|---|---|---|---|---');
    results.allComparisonRows.forEach(function(r) {
      log(r.company_id + ' | ' + r.master_code + ' | ' + r.master_name + ' | ' +
          r.tracking_code + ' | ' + r.tracking_name + ' | ' +
          r.supa_code + ' | ' + r.supa_name + ' | ' +
          r.wt_codes + ' | ' + r.wt_names + ' | ' +
          r.codeMatch + ' | ' + r.nameMatch);
    });

    if (results.onlyInMaster.length > 0) {
      log('\n--- มีเฉพาะใน ' + SHEET_MASTER + ' (ไม่มีใน ' + SHEET_TRACKING + ') ---');
      results.onlyInMaster.forEach(function(r) { log('  ' + r.company_id + ' | ' + r.source); });
    }

    if (results.onlyInTracking.length > 0) {
      log('\n--- มีเฉพาะใน ' + SHEET_TRACKING + ' (ไม่มีใน ' + SHEET_MASTER + ') ---');
      results.onlyInTracking.forEach(function(r) { log('  ' + r.company_id + ' | ' + r.source); });
    }

    if (results.onlyInSupabase.length > 0) {
      log('\n--- มีเฉพาะใน Supabase companies (ไม่มีใน Excel) ---');
      results.onlyInSupabase.forEach(function(r) { log('  ' + r.company_id + ' | ' + r.source); });
    }

    if (results.codeMismatches.length > 0) {
      log('\n--- company_code ไม่ตรงกัน (ทุกรายการ) ---');
      results.codeMismatches.forEach(function(r) {
        log('  ' + r.company_id + ': Master="' + r.master + '" | Tracking="' + r.tracking + '" | companies="' + r.companies + '" | work_tasks="' + r.work_tasks + '"');
      });
    }

    if (results.nameMismatches.length > 0) {
      log('\n--- company_name ไม่ตรงกัน (ทุกรายการ) ---');
      results.nameMismatches.forEach(function(r) {
        log('  ' + r.company_id + ': Master="' + r.master + '" | Tracking="' + r.tracking + '" | companies="' + r.companies + '" | work_tasks="' + r.work_tasks + '"');
      });
    }

    if (results.replacementCharFound.length > 0) {
      log('\n--- อักขระ U+FFFD (�) ที่พบในชื่อบริษัท ---');
      results.replacementCharFound.forEach(function(r) {
        log('  CompanyID=' + r.company_id + ' | Field=' + r.field + ' | Source=' + r.source + ' | Value="' + r.value + '"' + (r.row ? ' | Row=' + r.row : ''));
      });
    }

    log('\n' + '='.repeat(80));
    log('สิ้นสุดการวินิจฉัย Company Master (Read-only - ไม่มีการแก้ไขข้อมูล)');
    log('='.repeat(80));
  }

  // =========================================================
  // Main
  // =========================================================
  async function main() {
    console.clear();
    log('========================================');
    log('ACC Tracker - Diagnose Company Master');
    log('โหมด: Read-only 100%');
    log('========================================');

    if (!checkEnvironment()) { log('หยุด: environment ไม่พร้อม'); return; }

    // สร้าง UI สำหรับเลือกไฟล์ (มองเห็นได้บนหน้า ACC Tracker)
    var container = document.createElement('div');
    container.id = 'acc-excel-picker';
    container.style.position = 'fixed';
    container.style.top = '20px';
    container.style.left = '50%';
    container.style.transform = 'translateX(-50%)';
    container.style.zIndex = '10000';
    container.style.background = '#1b2021';
    container.style.border = '1px solid #b99a60';
    container.style.borderRadius = '12px';
    container.style.padding = '20px';
    container.style.color = '#f2f0e9';
    container.style.fontFamily = 'inherit';
    container.style.boxShadow = '0 20px 70px rgba(0,0,0,.4)';
    container.style.textAlign = 'center';

    var title = document.createElement('div');
    title.textContent = 'เลือกไฟล์ ' + EXCEL_FILE_NAME;
    title.style.fontWeight = '700';
    title.style.marginBottom = '12px';
    container.appendChild(title);

    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx,.xlsm';
    input.style.marginBottom = '10px';
    container.appendChild(input);

    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'ยกเลิก';
    cancelBtn.style.marginRight = '10px';
    container.appendChild(cancelBtn);

    document.body.appendChild(container);

    var fileSelected = false;

    input.onchange = async function(e) {
      if (fileSelected) return;
      fileSelected = true;

      var file = e.target.files[0];
      if (!file) {
        document.body.removeChild(container);
        log('ผู้ใช้ยกเลิกการเลือกไฟล์ หยุดการทำงาน');
        return;
      }

      document.body.removeChild(container);

      log('\n=== ขั้นตอนที่ 3: อ่านไฟล์ Excel ===');
      log('ไฟล์ที่เลือก: ' + file.name);

      try {
        var wb = await readExcelFile(file);
        if (!processExcelMaster(wb.workbook)) { log('หยุด: ประมวลผล Sheet ' + SHEET_MASTER + ' ไม่สำเร็จ'); return; }
        if (!processExcelTracking(wb.workbook)) { log('หยุด: ประมวลผล Sheet ' + SHEET_TRACKING + ' ไม่สำเร็จ'); return; }

        if (!await checkSession()) { log('หยุด: ยังไม่ได้ Login'); return; }

        if (!await readSupabaseCompanies()) { log('หยุด: อ่าน Supabase companies ไม่สำเร็จ'); return; }
        if (!await readWorkTasksCompanies()) { log('หยุด: อ่าน work_tasks companies ไม่สำเร็จ'); return; }

        diagnose();
        showSummary();
      } catch (err) {
        error(err.message);
      }
    };

    cancelBtn.onclick = function() {
      document.body.removeChild(container);
      log('ผู้ใช้ยกเลิกการเลือกไฟล์ หยุดการทำงาน');
    };
  }

  main();
})();

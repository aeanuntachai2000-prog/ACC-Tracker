/* =========================================================
   ACC Tracker - Diagnose Company Data Conflicts (Read-only)
   วัตถุประสงค์: ตรวจสอบ CompanyCode และ CompanyName ที่ไม่ตรงกัน
   วิธีใช้: เปิดแอป ACC Tracker -> Login -> Chrome DevTools Snippets -> วาง -> รัน
   ========================================================= */

(function() {
  'use strict';

  const EXCEL_FILE_NAME = 'AE_ACCOUNTING_WORK_TRACKER.xlsm';
  const SHEET_MASTER = 'บริษัท';
  const SHEET_TRACKING = 'ติดตามรายบริษัท';
  const HEADER_ROW_MASTER = 1;
  const HEADER_ROW_TRACKING = 4;
  const PAGE_SIZE = 1000;

  const TARGET_COMPANY_CODES = ['CMP0007', 'CMP0013'];
  const TARGET_COMPANY_NAMES = ['CMP0013', 'CMP0016', 'CMP0017'];
  const MAX_EXAMPLES_PER_COMPANY = 10;

  const REPLACEMENT_CHAR = '\uFFFD';

  let results = {
    fileName: '',
    excelMaster: new Map(),      // CompanyID -> { code, name, row }
    excelTracking: new Map(),    // CompanyID -> { code, name, row, cellRefs }
    supabaseCompanies: new Map(), // CompanyID -> { code, name }
    workTasksGrouped: new Map(),  // CompanyID -> { codes: Map<code,count>, names: Map<name,count>, examples: Array<{task_id,month,buddhist_year,name,hasReplacement}> }
    companyCodeConflicts: [],     // { company_id, sources: {excel_master, excel_tracking, supabase_companies, work_tasks} }
    companyNameCorruptions: [],   // { company_id, totalTasks, corruptedTasks, examples: [...] }
    trackingSheetIssues: [],      // { company_id, cellRef, formula, value, isFormula }
    allCompaniesTracking: [],     // { company_id, code, name, cellRef, isFormula }
    replacementCharFound: [],     // { company_id, field, value, source, row }
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

  function colNumToLetter(colNum) {
    var letter = '';
    while (colNum > 0) {
      var remainder = (colNum - 1) % 26;
      letter = String.fromCharCode(65 + remainder) + letter;
      colNum = Math.floor((colNum - 1) / 26);
    }
    return letter;
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
  // UI เลือกไฟล์ Excel
  // =========================================================
  function createFilePicker() {
    return new Promise(function(resolve, reject) {
      log('\n=== ขั้นตอนที่ 3: เลือกไฟล์ Excel ===');

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
  // อ่านไฟล์ Excel
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
  // อ่าน Sheet 'บริษัท' (Header แถว 1) - Excel Master
  // =========================================================
  function processExcelMaster(workbook) {
    log('\n=== ขั้นตอนที่ 4: ประมวลผล Sheet \'' + SHEET_MASTER + '\' (Header แถว 1) ===');

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

    var headerRow = jsonData[HEADER_ROW_MASTER - 1];
    var colMap = findColumnIndices(headerRow, ['CompanyID', 'CompanyCode', 'CompanyName']);

    var normHeader = headerRow.map(function(h) { return h !== null && h !== undefined ? String(h).trim() : '(ว่าง)'; });
    log('Header ที่ตรวจพบ (Sheet \'' + SHEET_MASTER + '\'): ' + JSON.stringify(normHeader));
    log('คอลัมน์ที่พบ: CompanyID=' + colMap.CompanyID + ' | CompanyCode=' + colMap.CompanyCode + ' | CompanyName=' + colMap.CompanyName);

    if (colMap.CompanyID === undefined) {
      error('Sheet \'' + SHEET_MASTER + '\' ไม่พบคอลัมน์ CompanyID');
      return false;
    }

    for (var i = HEADER_ROW_MASTER; i < jsonData.length; i++) {
      var row = jsonData[i];
      if (!row || row.every(function(c) { return c === null || c === undefined || c === ''; })) continue;

      var cid = normalizeVal(row[colMap.CompanyID]);
      if (!cid) continue;

      var code = colMap.CompanyCode !== undefined ? normalizeVal(row[colMap.CompanyCode]) : '';
      var name = colMap.CompanyName !== undefined ? normalizeVal(row[colMap.CompanyName]) : '';

      results.excelMaster.set(cid, { company_code: code, company_name: name, row: i + 1 });

      if (hasReplacementChar(code)) {
        results.replacementCharFound.push({ company_id: cid, field: 'company_code', value: code, source: 'Excel ' + SHEET_MASTER, row: i + 1 });
      }
      if (hasReplacementChar(name)) {
        results.replacementCharFound.push({ company_id: cid, field: 'company_name', value: name, source: 'Excel ' + SHEET_MASTER, row: i + 1 });
      }
    }

    success('Excel Master (' + SHEET_MASTER + '): ' + results.excelMaster.size + ' บริษัท');
    return true;
  }

  // =========================================================
  // อ่าน Sheet 'ติดตามรายบริษัท' (Header แถว 4) - Excel Tracking
  // ตรวจสอบว่า Company Code เป็น Formula หรือค่าคงที่
  // =========================================================
  function processExcelTracking(workbook) {
    log('\n=== ขั้นตอนที่ 5: ประมวลผล Sheet \'' + SHEET_TRACKING + '\' (Header แถว 4) ===');

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

    var headerRow = jsonData[HEADER_ROW_TRACKING - 1];
    var colMap = findColumnIndices(headerRow, ['CompanyID', 'Company Code', 'บริษัท']);

    var normHeader = headerRow.map(function(h) { return h !== null && h !== undefined ? String(h).trim() : '(ว่าง)'; });
    log('Header ที่ตรวจพบ (Sheet \'' + SHEET_TRACKING + '\'): ' + JSON.stringify(normHeader));
    log('คอลัมน์ที่พบ: CompanyID=' + colMap.CompanyID + ' | Company Code=' + colMap['Company Code'] + ' | บริษัท=' + colMap['บริษัท']);

    if (colMap.CompanyID === undefined) {
      error('Sheet \'' + SHEET_TRACKING + '\' ไม่พบคอลัมน์ CompanyID');
      return false;
    }

    for (var i = HEADER_ROW_TRACKING; i < jsonData.length; i++) {
      var row = jsonData[i];
      if (!row || row.every(function(c) { return c === null || c === undefined || c === ''; })) continue;

      var cid = normalizeVal(row[colMap.CompanyID]);
      if (!cid) continue;

      var code = colMap['Company Code'] !== undefined ? normalizeVal(row[colMap['Company Code']]) : '';
      var name = colMap['บริษัท'] !== undefined ? normalizeVal(row[colMap['บริษัท']]) : '';

      var rowNum = i + 1;
      var codeColLetter = colNumToLetter(colMap['Company Code'] + 1);
      var cellRef = codeColLetter + rowNum;

      // ตรวจสอบว่าเป็น Formula หรือค่าคงที่ โดยเข้าถึง cell object โดยตรง
      var cellObj = worksheet[cellRef];
      var isFormula = false;
      var formulaStr = '';
      if (cellObj) {
        if (cellObj.f) {
          isFormula = true;
          formulaStr = cellObj.f;
        }
      }

      results.excelTracking.set(cid, {
        company_code: code,
        company_name: name,
        row: rowNum,
        cellRef: cellRef,
        isFormula: isFormula,
        formula: formulaStr
      });

      results.allCompaniesTracking.push({
        company_id: cid,
        company_code: code,
        company_name: name,
        cellRef: cellRef,
        isFormula: isFormula,
        formula: formulaStr
      });

      if (isFormula) {
        results.trackingSheetIssues.push({
          company_id: cid,
          cellRef: cellRef,
          formula: formulaStr,
          value: code,
          isFormula: true
        });
      }

      if (hasReplacementChar(code)) {
        results.replacementCharFound.push({ company_id: cid, field: 'company_code', value: code, source: 'Excel ' + SHEET_TRACKING, row: rowNum });
      }
      if (hasReplacementChar(name)) {
        results.replacementCharFound.push({ company_id: cid, field: 'company_name', value: name, source: 'Excel ' + SHEET_TRACKING, row: rowNum });
      }
    }

    success('Excel Tracking (' + SHEET_TRACKING + '): ' + results.excelTracking.size + ' บริษัท');
    return true;
  }

  // =========================================================
  // อ่าน Supabase companies
  // =========================================================
  async function readSupabaseCompanies() {
    log('\n=== ขั้นตอนที่ 6: อ่าน companies จาก Supabase ===');
    try {
      var { data, error: err } = await sbClient
        .from('companies')
        .select('*')
        .order('company_id', { ascending: true });
      if (err) { error('Supabase companies error: ' + err.message); return false; }
      var batch = data || [];
      batch.forEach(function(c) {
        var cid = String(c.company_id || '');
        var code = normalizeVal(c.company_code);
        var name = normalizeVal(c.company_name);
        results.supabaseCompanies.set(cid, { company_code: code, company_name: name });

        if (hasReplacementChar(code)) {
          results.replacementCharFound.push({ company_id: cid, field: 'company_code', value: code, source: 'Supabase companies' });
        }
        if (hasReplacementChar(name)) {
          results.replacementCharFound.push({ company_id: cid, field: 'company_name', value: name, source: 'Supabase companies' });
        }
      });
      success('Supabase companies: ' + batch.length + ' บริษัท');
      return true;
    } catch (err) {
      error('เกิดข้อผิดพลาด: ' + err.message);
      return false;
    }
  }

  // =========================================================
  // อ่าน work_tasks และจัดกลุ่มตาม company_id
  // ตรวจหาชื่อที่มีอักขระ U+FFFD
  // =========================================================
  async function readWorkTasksCompanies() {
    log('\n=== ขั้นตอนที่ 7: อ่าน work_tasks จาก Supabase (จัดกลุ่มตาม company_id) ===');
    var from = 0, hasMore = true;
    while (hasMore) {
      try {
        var { data, error: err } = await sbClient
          .from('work_tasks')
          .select('task_id, company_id, company_code, company_name, month, buddhist_year')
          .order('company_id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);
        if (err) { error('Supabase work_tasks error: ' + err.message); return false; }
        var batch = data || [];
        batch.forEach(function(t) {
          var cid = String(t.company_id || '');
          if (!cid) return;
          var code = normalizeVal(t.company_code);
          var name = normalizeVal(t.company_name);
          var month = normalizeVal(t.month);
          var buddhist_year = normalizeVal(t.buddhist_year);
          var task_id = normalizeVal(t.task_id);
          var hasRepl = hasReplacementChar(name);

          if (!results.workTasksGrouped.has(cid)) {
            results.workTasksGrouped.set(cid, {
              codes: new Map(),
              names: new Map(),
              examples: []
            });
          }
          var g = results.workTasksGrouped.get(cid);

          g.codes.set(code, (g.codes.get(code) || 0) + 1);
          g.names.set(name, (g.names.get(name) || 0) + 1);

          if (hasRepl && g.examples.length < MAX_EXAMPLES_PER_COMPANY) {
            g.examples.push({
              task_id: task_id,
              month: month,
              buddhist_year: buddhist_year,
              company_name: name,
              company_code: code
            });
          }
        });
        if (batch.length < PAGE_SIZE) hasMore = false; else from += PAGE_SIZE;
      } catch (err) {
        error('เกิดข้อผิดพลาด: ' + err.message);
        return false;
      }
    }
    success('work_tasks records: ' + results.workTasksGrouped.size + ' CompanyID ที่ไม่ซ้ำ');
    return true;
  }

  // =========================================================
  // วิเคราะห์ CompanyCode Conflict (CMP0007, CMP0013)
  // =========================================================
  function analyzeCompanyCodeConflicts() {
    log('\n=== ขั้นตอนที่ 8: วิเคราะห์ CompanyCode Conflict ===');

    TARGET_COMPANY_CODES.forEach(function(cid) {
      var master = results.excelMaster.get(cid);
      var tracking = results.excelTracking.get(cid);
      var supa = results.supabaseCompanies.get(cid);
      var wt = results.workTasksGrouped.get(cid);

      log('\n--- ' + cid + ' ---');

      var masterCode = master ? master.company_code : '(ไม่มีใน Excel Master)';
      var trackingCode = tracking ? tracking.company_code : '(ไม่มีใน Excel Tracking)';
      var supaCode = supa ? supa.company_code : '(ไม่มีใน Supabase companies)';

      var wtCodesInfo = [];
      if (wt) {
        wt.codes.forEach(function(count, code) {
          wtCodesInfo.push(code + ' (' + count + ' รายการ)');
        });
      } else {
        wtCodesInfo.push('(ไม่มี work_tasks)');
      }

      log('  Excel Master code: ' + masterCode);
      log('  Excel Tracking code: ' + trackingCode + (tracking && tracking.isFormula ? ' [FORMULA: ' + tracking.formula + ']' : ''));
      log('  Supabase companies code: ' + supaCode);
      log('  work_tasks codes: ' + wtCodesInfo.join(' | '));

      // ตรวจสอบความขัดแย้ง
      var sources = {};
      var allCodes = [];
      if (master) { sources.excel_master = master.company_code; allCodes.push(master.company_code); }
      if (tracking) { sources.excel_tracking = tracking.company_code; allCodes.push(tracking.company_code); }
      if (supa) { sources.supabase_companies = supa.company_code; allCodes.push(supa.company_code); }
      if (wt) { wt.codes.forEach(function(count, code) { sources['work_tasks_' + code] = count; allCodes.push(code); }); }

      var uniqueCodes = new Set(allCodes.filter(function(c) { return c !== ''; }));
      if (uniqueCodes.size > 1) {
        results.companyCodeConflicts.push({
          company_id: cid,
          master: masterCode,
          tracking: trackingCode + (tracking && tracking.isFormula ? ' [FORMULA]' : ''),
          supabase_companies: supaCode,
          work_tasks: wtCodesInfo.join(' | '),
          sources: sources
        });
        log('  ⚠️ พบความขัดแย้งของ company_code');
      } else {
        log('  ✅ company_code ตรงกันทุกแหล่ง');
      }
    });
  }

  // =========================================================
  // วิเคราะห์ CompanyName Corruption (CMP0013, CMP0016, CMP0017)
  // =========================================================
  function analyzeCompanyNameCorruptions() {
    log('\n=== ขั้นตอนที่ 9: วิเคราะห์ CompanyName Corruption (U+FFFD) ===');

    TARGET_COMPANY_NAMES.forEach(function(cid) {
      var wt = results.workTasksGrouped.get(cid);
      var master = results.excelMaster.get(cid);
      var tracking = results.excelTracking.get(cid);
      var supa = results.supabaseCompanies.get(cid);

      if (!wt) {
        log('\n--- ' + cid + ': ไม่มี work_tasks ---');
        return;
      }

      var totalTasks = 0;
      wt.codes.forEach(function(count) { totalTasks += count; }); // codes count = tasks count (each task has one code)

      // นับจำนวน task ที่ชื่อเสียหาย
      var corruptedCount = 0;
      wt.names.forEach(function(count, name) {
        if (hasReplacementChar(name)) corruptedCount += count;
      });

      log('\n--- ' + cid + ' ---');
      log('  จำนวน work_tasks ทั้งหมด: ' + totalTasks);
      log('  รายการที่ชื่อเสียหาย (U+FFFD): ' + corruptedCount);
      log('  Excel Master name: ' + (master ? master.company_name : '(ไม่มี)'));
      log('  Excel Tracking name: ' + (tracking ? tracking.company_name : '(ไม่มี)'));
      log('  Supabase companies name: ' + (supa ? supa.company_name : '(ไม่มี)'));

      log('  work_tasks names breakdown:');
      wt.names.forEach(function(count, name) {
        var marker = hasReplacementChar(name) ? ' ⚠️' : '';
        log('    "' + name + '" (' + count + ' รายการ)' + marker);
      });

      if (wt.examples.length > 0) {
        log('  ตัวอย่างรายการที่ชื่อเสียหาย (สูงสุด ' + MAX_EXAMPLES_PER_COMPANY + '):');
        wt.examples.forEach(function(ex) {
          log('    task_id=' + ex.task_id + ' | month=' + ex.month + ' | year=' + ex.buddhist_year +
              ' | code=' + ex.company_code + ' | name="' + ex.company_name + '"');
        });
      }

      results.companyNameCorruptions.push({
        company_id: cid,
        totalTasks: totalTasks,
        corruptedTasks: corruptedCount,
        masterName: master ? master.company_name : '(ไม่มี)',
        trackingName: tracking ? tracking.company_name : '(ไม่มี)',
        supabaseName: supa ? supa.company_name : '(ไม่มี)',
        examples: wt.examples
      });
    });
  }

  // =========================================================
  // ตรวจสอบ Excel Tracking ทั้ง 20 บริษัท
  // =========================================================
  function analyzeExcelTracking() {
    log('\n=== ขั้นตอนที่ 10: ตรวจสอบ Excel Tracking ทั้งหมด ===');

    results.allCompaniesTracking.forEach(function(r) {
      var marker = r.isFormula ? ' [FORMULA: ' + r.formula + ']' : '';
      log('  ' + r.company_id + ' | Code="' + r.company_code + '" | Name="' + r.company_name +
          '" | Cell=' + r.cellRef + marker);
    });

    log('\n  セลล์ที่เป็น Formula: ' + results.trackingSheetIssues.length + ' รายการ');
    results.trackingSheetIssues.forEach(function(r) {
      log('    ' + r.company_id + ' | Cell=' + r.cellRef + ' | Formula="' + r.formula + '" | Value="' + r.value + '"');
    });
  }

  // =========================================================
  // สรุปผล
  // =========================================================
  function showSummary() {
    log('\n' + '='.repeat(80));
    log('สรุปผลการวินิจฉัย Company Data Conflicts');
    log('='.repeat(80));

    log('\n--- ประเภทปัญหา ---');
    log('1. CompanyCode mismatch: ' + results.companyCodeConflicts.length + ' บริษัท');
    results.companyCodeConflicts.forEach(function(r) {
      log('   ' + r.company_id + ': Master="' + r.master + '" | Tracking="' + r.tracking + '" | companies="' + r.supabase_companies + '" | work_tasks="' + r.work_tasks + '"');
    });

    log('\n2. CompanyName corruption (U+FFFD): ' + results.companyNameCorruptions.length + ' บริษัท');
    results.companyNameCorruptions.forEach(function(r) {
      log('   ' + r.company_id + ': งานทั้งหมด=' + r.totalTasks + ' | ชื่อเสียหาย=' + r.corruptedTasks +
          ' | Master="' + r.masterName + '" | companies="' + r.supabaseName + '"');
    });

    log('\n3. Tracking sheet stale / เป็น Formula: ' + results.trackingSheetIssues.length + ' รายการ');
    results.trackingSheetIssues.forEach(function(r) {
      log('   ' + r.company_id + ' | Cell=' + r.cellRef + ' | Formula="' + r.formula + '" | Value="' + r.value + '"');
    });

    log('\n4. อักขระ U+FFFD ที่พบทั้งหมด: ' + results.replacementCharFound.length + ' รายการ');
    results.replacementCharFound.forEach(function(r) {
      log('   ' + r.company_id + ' | ' + r.field + ' | ' + r.source + ' | "' + r.value + '"' + (r.row ? ' | Row=' + r.row : ''));
    });

    log('\n' + '='.repeat(80));
    if (results.errors.length > 0) {
      log('ผลการวินิจฉัย: ⚠️ เสร็จสมบูรณ์แต่มีข้อผิดพลาด ' + results.errors.length + ' รายการ');
      results.errors.forEach(function(e, i) { log('   ' + (i + 1) + '. ' + e); });
    } else {
      log('ผลการวินิจฉัย: ✅ สำเร็จ ไม่พบข้อผิดพลาด');
    }
    log('สิ้นสุดการวินิจฉัย Company Data Conflicts (Read-only - ไม่มีการแก้ไขข้อมูล)');
    log('='.repeat(80));
  }

  // =========================================================
  // Main
  // =========================================================
  async function main() {
    console.clear();
    log('========================================');
    log('ACC Tracker - Diagnose Company Data Conflicts');
    log('โหมด: Read-only 100%');
    log('========================================');

    if (!checkEnvironment()) { log('หยุด: environment ไม่พร้อม'); return; }

    // สร้าง UI สำหรับเลือกไฟล์
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

      log('\n=== ขั้นตอนที่ 4: อ่านไฟล์ Excel ===');
      log('ไฟล์ที่เลือก: ' + file.name);

      try {
        var wb = await readExcelFile(file);
        if (!processExcelMaster(wb.workbook)) { log('หยุด: ประมวลผล Sheet ' + SHEET_MASTER + ' ไม่สำเร็จ'); return; }
        if (!processExcelTracking(wb.workbook)) { log('หยุด: ประมวลผล Sheet ' + SHEET_TRACKING + ' ไม่สำเร็จ'); return; }

        if (!await checkSession()) { log('หยุด: ยังไม่ได้ Login'); return; }

        if (!await readSupabaseCompanies()) { log('หยุด: อ่าน Supabase companies ไม่สำเร็จ'); return; }
        if (!await readWorkTasksCompanies()) { log('หยุด: อ่าน work_tasks companies ไม่สำเร็จ'); return; }

        analyzeCompanyCodeConflicts();
        analyzeCompanyNameCorruptions();
        analyzeExcelTracking();
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

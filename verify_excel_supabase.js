/* =========================================================
   ACC Tracker - Excel vs Supabase Record Verification
   โหมด: Read-only 100%
   วิธีใช้: เปิดแอป ACC Tracker -> Login -> เปิด Console -> วางสคริปต์นี้ -> กด Enter
   ========================================================= */

(function() {
  'use strict';

  const EXCEL_FILE_NAME = 'AE_ACCOUNTING_WORK_TRACKER.xlsm';
  const SHEET_NAME = 'รายการงาน';
  const HEADER_ROW = 1; // Row 1 เป็น header
  const DATA_START_ROW = 2; // ข้อมูลเริ่ม Row 2
  const PAGE_SIZE = 1000;

  // ฟิลด์สำหรับเปรียบเทียบรายละเอียด
  const COMPARE_FIELDS = [
    'buddhist_year', 'month', 'company_id', 'company_code',
    'company_name', 'task_type', 'status'
  ];

  let results = {
    excelRecords: 0,
    supabaseRecords: 0,
    excelKeys: new Map(),      // compositeKey -> row data
    supabaseKeys: new Map(),   // compositeKey -> row data
    excelDuplicates: [],
    supabaseDuplicates: [],
    excelOnly: [],
    supabaseOnly: [],
    detailMismatches: [],
    uuidDuplicates: [],
    uuidMap: new Map(),        // compositeKey -> task_id
    errors: []
  };

  function log(msg) {
    console.log(msg);
  }

  function error(msg) {
    console.error('❌ ' + msg);
    results.errors.push(msg);
  }

  function success(msg) {
    console.log('✅ ' + msg);
  }

  function warn(msg) {
    console.warn('⚠️ ' + msg);
  }

  function makeCompositeKey(row) {
    return String(row.buddhist_year || '') + '|' +
           String(row.month || '') + '|' +
           String(row.company_id || '') + '|' +
           String(row.task_type || '');
  }

  // =========================================================
  // ขั้นตอนที่ 1: ตรวจสอบ Environment
  // =========================================================
  function checkEnvironment() {
    log('=== ขั้นตอนที่ 1: ตรวจสอบ Environment ===');

    // ตรวจสอบ SheetJS
    if (typeof XLSX === 'undefined') {
      error('SheetJS (XLSX) ยังไม่โหลด กรุณารอให้หน้าเว็บโหลดสมบูรณ์แล้วลองใหม่');
      return false;
    }
    success('SheetJS พร้อมใช้งาน');

    // ตรวจสอบ Supabase Client
    if (typeof sbClient === 'undefined') {
      error('sbClient (Supabase Client) ไม่พบในหน้าเว็บ กรุณาเปิดแอป ACC Tracker ก่อน');
      return false;
    }
    success('Supabase Client พร้อมใช้งาน');

    return true;
  }

  // =========================================================
  // ขั้นตอนที่ 2: ตรวจสอบ Session
  // =========================================================
  async function checkSession() {
    log('\n=== ขั้นตอนที่ 2: ตรวจสอบ Session ===');

    try {
      const { data, error } = await sbClient.auth.getSession();
      if (error) {
        error('ไม่สามารถตรวจสอบ session: ' + error.message);
        return false;
      }
      if (!data.session) {
        error('ยังไม่ได้ Login กรุณาเข้าสู่ระบบ ACC Tracker ก่อนรันสคริปต์นี้');
        return false;
      }
      // ไม่แสดง token ตามข้อกำหนด
      success('ผู้ใช้ได้รับการยืนยันตัวตนแล้ว (' + (data.session.user.email || 'ไม่ระบุอีเมล') + ')');
      return true;
    } catch (err) {
      error('เกิดข้อผิดพลาดในการตรวจสอบ session: ' + err.message);
      return false;
    }
  }

  // =========================================================
  // ขั้นตอนที่ 3: อ่านไฟล์ Excel
  // =========================================================
  function readExcelFile() {
    return new Promise((resolve, reject) => {
      log('\n=== ขั้นตอนที่ 3: อ่านไฟล์ Excel ===');
      log('กรุณาเลือกไฟล์: ' + EXCEL_FILE_NAME);

      // สร้าง input type file ชั่วคราว
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.xlsx,.xlsm';
      input.style.display = 'none';
      document.body.appendChild(input);

      input.onchange = function(e) {
        const file = e.target.files[0];
        if (!file) {
          document.body.removeChild(input);
          reject(new Error('ไม่ได้เลือกไฟล์'));
          return;
        }

        if (file.name !== EXCEL_FILE_NAME) {
          warn('ชื่อไฟล์ไม่ตรงกัน: คาดหวัง "' + EXCEL_FILE_NAME + '" ได้ "' + file.name + '"');
        }

        const reader = new FileReader();
        reader.onload = function(e) {
          try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellDates: true });

            if (!workbook.SheetNames.includes(SHEET_NAME)) {
              error('ไม่พบ Sheet "' + SHEET_NAME + '" ในไฟล์ Excel');
              error('Sheet ที่มีอยู่: ' + workbook.SheetNames.join(', '));
              document.body.removeChild(input);
              reject(new Error('ไม่พบ Sheet ' + SHEET_NAME));
              return;
            }

            const worksheet = workbook.Sheets[SHEET_NAME];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true });

            document.body.removeChild(input);
            resolve({ jsonData, fileName: file.name });
          } catch (err) {
            document.body.removeChild(input);
            error('อ่านไฟล์ Excel ล้มเหลว: ' + err.message);
            reject(err);
          }
        };

        reader.onerror = function() {
          document.body.removeChild(input);
          error('ไม่สามารถอ่านไฟล์ได้');
          reject(new Error('FileReader error'));
        };

        reader.readAsArrayBuffer(file);
      };

      input.click();
    });
  }

  // =========================================================
  // ขั้นตอนที่ 4: ประมวลผลข้อมูล Excel
  // =========================================================
  function processExcelData(jsonData) {
    log('\n=== ขั้นตอนที่ 4: ประมวลผลข้อมูล Excel ===');

    if (!jsonData || jsonData.length < 2) {
      error('ไฟล์ Excel ไม่มีข้อมูลหรือมีเฉพาะ header');
      return false;
    }

    const headerRow = jsonData[0];
    log('Header Row: ' + JSON.stringify(headerRow));

    // หาตำแหน่งคอลัมน์จาก header
    const colMap = {};
    headerRow.forEach((h, idx) => {
      if (h !== null && h !== undefined) {
        colMap[String(h).trim()] = idx;
      }
    });

    const requiredCols = ['ปี พ.ศ.', 'เดือน', 'CompanyID', 'Company Code', 'บริษัท', 'ประเภทงาน', 'สถานะ'];
    const missingCols = requiredCols.filter(c => colMap[c] === undefined);
    if (missingCols.length > 0) {
      error('ไม่พบคอลัมน์ที่จำเป็นใน Excel: ' + missingCols.join(', '));
      return false;
    }

    // อ่านข้อมูลตั้งแต่ Row 2 (index 1 ใน array)
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row || row.every(cell => cell === null || cell === undefined || cell === '')) {
        continue; // ข้ามแถวว่าง
      }

      const excelRow = {
        buddhist_year: row[colMap['ปี พ.ศ.']],
        month: row[colMap['เดือน']],
        company_id: row[colMap['CompanyID']],
        company_code: row[colMap['Company Code']],
        company_name: row[colMap['บริษัท']],
        task_type: row[colMap['ประเภทงาน']],
        status: row[colMap['สถานะ']],
        excelRowNum: i + 1
      };

      const ck = makeCompositeKey(excelRow);
      results.excelRecords++;

      // ตรวจสอบ duplicate ใน Excel
      if (results.excelKeys.has(ck)) {
        results.excelDuplicates.push({
          key: ck,
          firstRow: results.excelKeys.get(ck).excelRowNum,
          duplicateRow: excelRow.excelRowNum
        });
      } else {
        results.excelKeys.set(ck, excelRow);
      }
    }

    success('อ่านข้อมูลจาก Excel สำเร็จ: ' + results.excelRecords + ' รายการ');
    log('  Composite Key ที่ไม่ซ้ำ: ' + results.excelKeys.size);
    log('  รายการที่ซ้ำใน Excel: ' + results.excelDuplicates.length);
    return true;
  }

  // =========================================================
  // ขั้นตอนที่ 5: อ่านข้อมูลจาก Supabase (Pagination)
  // =========================================================
  async function readSupabaseTasks() {
    log('\n=== ขั้นตอนที่ 5: อ่าน work_tasks จาก Supabase ===');

    let from = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        const { data, error } = await sbClient
          .from('work_tasks')
          .select('*')
          .order('task_id', { ascending: true })
          .range(from, from + PAGE_SIZE - 1);

        if (error) {
          error('Supabase query error: ' + error.message);
          return false;
        }

        const batch = data || [];
        results.supabaseRecords += batch.length;

        batch.forEach(task => {
          const supabaseRow = {
            task_id: task.task_id,
            buddhist_year: task.buddhist_year,
            month: task.month,
            company_id: task.company_id,
            company_code: task.company_code,
            company_name: task.company_name,
            task_type: task.task_type,
            status: task.status
          };

          const ck = makeCompositeKey(supabaseRow);

          // ตรวจสอบ UUID ซ้ำ
          if (results.uuidMap.has(ck)) {
            const prevId = results.uuidMap.get(ck);
            if (prevId !== task.task_id) {
              results.uuidDuplicates.push({
                key: ck,
                uuid1: prevId,
                uuid2: task.task_id
              });
            }
          } else {
            results.uuidMap.set(ck, task.task_id);
          }

          // ตรวจสอบ duplicate Composite Key ใน Supabase
          if (results.supabaseKeys.has(ck)) {
            results.supabaseDuplicates.push({
              key: ck,
              firstId: results.supabaseKeys.get(ck).task_id,
              duplicateId: task.task_id
            });
          } else {
            results.supabaseKeys.set(ck, supabaseRow);
          }
        });

        if (batch.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          from += PAGE_SIZE;
        }
      } catch (err) {
        error('เกิดข้อผิดพลาดในการอSupabase: ' + err.message);
        return false;
      }
    }

    success('อ่านข้อมูลจาก Supabase สำเร็จ: ' + results.supabaseRecords + ' รายการ');
    log('  Composite Key ที่ไม่ซ้ำ: ' + results.supabaseKeys.size);
    log('  รายการที่ซ้ำใน Supabase: ' + results.supabaseDuplicates.length);
    return true;
  }

  // =========================================================
  // ขั้นตอนที่ 6: เปรียบเทียบ Composite Key
  // =========================================================
  function compareKeys() {
    log('\n=== ขั้นตอนที่ 6: เปรียบเทียบ Composite Key ===');

    const excelKeySet = new Set(results.excelKeys.keys());
    const supabaseKeySet = new Set(results.supabaseKeys.keys());

    // Excel Only
    for (const ck of excelKeySet) {
      if (!supabaseKeySet.has(ck)) {
        results.excelOnly.push(results.excelKeys.get(ck));
      }
    }

    // Supabase Only
    for (const ck of supabaseKeySet) {
      if (!excelKeySet.has(ck)) {
        results.supabaseOnly.push(results.supabaseKeys.get(ck));
      }
    }

    const matchedKeys = new Set([...excelKeySet].filter(ck => supabaseKeySet.has(ck)));

    log('จำนวน Composite Key ที่ตรงกัน: ' + matchedKeys.size);
    log('มีใน Excel แต่ไม่ใน Supabase: ' + results.excelOnly.length);
    log('มีใน Supabase แต่ไม่ใน Excel: ' + results.supabaseOnly.length);
  }

  // =========================================================
  // ขั้นตอนที่ 7: เปรียบเทียบรายละเอียด
  // =========================================================
  function compareDetails() {
    log('\n=== ขั้นตอนที่ 7: เปรียบเทียบรายละเอียด ===');

    const excelKeySet = new Set(results.excelKeys.keys());
    const supabaseKeySet = new Set(results.supabaseKeys.keys());
    const matchedKeys = new Set([...excelKeySet].filter(ck => supabaseKeySet.has(ck)));

    let mismatchCount = 0;

    for (const ck of matchedKeys) {
      const excelRow = results.excelKeys.get(ck);
      const supabaseRow = results.supabaseKeys.get(ck);

      const diffs = {};
      COMPARE_FIELDS.forEach(field => {
        const excelVal = excelRow[field] !== null && excelRow[field] !== undefined
          ? String(excelRow[field]).trim()
          : '';
        const supaVal = supabaseRow[field] !== null && supabaseRow[field] !== undefined
          ? String(supabaseRow[field]).trim()
          : '';

        if (excelVal !== supaVal) {
          diffs[field] = { excel: excelVal, supabase: supaVal };
        }
      });

      if (Object.keys(diffs).length > 0) {
        mismatchCount++;
        results.detailMismatches.push({
          key: ck,
          task_id: supabaseRow.task_id,
          diffs: diffs
        });
      }
    }

    log('รายการที่ Composite Key ตรงกันแต่รายละเอียดต่างกัน: ' + mismatchCount);
  }

  // =========================================================
  // ขั้นตอนที่ 8: แสดงสรุปผล
  // =========================================================
  function showSummary() {
    log('\n' + '='.repeat(70));
    log('สรุปผลการตรวจสอบ Excel กับ Supabase');
    log('='.repeat(70));

    log('📊 Excel Records: ' + results.excelRecords);
    log('📊 Supabase Records: ' + results.supabaseRecords);
    log('🔑 Excel Unique Composite Keys: ' + results.excelKeys.size);
    log('🔑 Supabase Unique Composite Keys: ' + results.supabaseKeys.size);
    log('🔄 Duplicate Keys ใน Excel: ' + results.excelDuplicates.length);
    log('🔄 Duplicate Keys ใน Supabase: ' + results.supabaseDuplicates.length);
    log('📋 Excel Only (ไม่มีใน Supabase): ' + results.excelOnly.length);
    log('📋 Supabase Only (ไม่มีใน Excel): ' + results.supabaseOnly.length);
    log('⚠️ รายละเอียดต่างกัน (จับคู่ Key ได้แต่ข้อมูลต่าง): ' + results.detailMismatches.length);
    log('🆔 UUID ซ้ำ: ' + results.uuidDuplicates.length);

    const totalMatched = results.excelKeys.size - results.excelOnly.length;
    const allMatch = results.excelOnly.length === 0 &&
                     results.supabaseOnly.length === 0 &&
                     results.detailMismatches.length === 0 &&
                     results.uuidDuplicates.length === 0 &&
                     results.excelDuplicates.length === 0 &&
                     results.supabaseDuplicates.length === 0;

    if (allMatch) {
      log('\n🎯 ผลลัพธ์: MATCH ทั้งหมด - ข้อมูลใน Excel ตรงกับ Supabase ทุกประการ');
    } else {
      log('\n⚠️ ผลลัพธ์: พบความแตกต่าง กรุณาตรวจสอบรายละเอียดด้านล่าง');
    }

    // แสดงตัวอย่างความแตกต่าง (ไม่เกิน 10 รายการต่อประเภท)
    if (results.excelOnly.length > 0) {
      log('\n--- ตัวอย่าง Excel Only (สูงสุด 10 รายการ) ---');
      results.excelOnly.slice(0, 10).forEach((r, i) => {
        log((i + 1) + '. ' + r.company_id + ' | ' + r.buddhist_year + '-' + r.month + ' | ' + r.task_type + ' | ' + r.status);
      });
    }

    if (results.supabaseOnly.length > 0) {
      log('\n--- ตัวอย่าง Supabase Only (สูงสุด 10 รายการ) ---');
      results.supabaseOnly.slice(0, 10).forEach((r, i) => {
        log((i + 1) + '. ' + r.company_id + ' | ' + r.buddhist_year + '-' + r.month + ' | ' + r.task_type + ' | ' + r.status + ' | UUID: ' + r.task_id);
      });
    }

    if (results.detailMismatches.length > 0) {
      log('\n--- ตัวอย่างรายละเอียดต่างกัน (สูงสุด 10 รายการ) ---');
      results.detailMismatches.slice(0, 10).forEach((m, i) => {
        log((i + 1) + '. Key: ' + m.key + ' | UUID: ' + m.task_id);
        Object.entries(m.diffs).forEach(([field, vals]) => {
          log('     ' + field + ': Excel="' + vals.excel + '" vs Supabase="' + vals.supabase + '"');
        });
      });
    }

    if (results.uuidDuplicates.length > 0) {
      log('\n--- ตัวอย่าง UUID ซ้ำ (สูงสุด 10 รายการ) ---');
      results.uuidDuplicates.slice(0, 10).forEach((u, i) => {
        log((i + 1) + '. Key: ' + u.key + ' | UUID1: ' + u.uuid1 + ' | UUID2: ' + u.uuid2);
      });
    }

    if (results.errors.length > 0) {
      log('\n--- ข้อผิดพลาด ---');
      results.errors.forEach((e, i) => log((i + 1) + '. ' + e));
    }

    log('\n' + '='.repeat(70));
    log('สิ้นสุดการตรวจสอบ (Read-only - ไม่มีการแก้ไขข้อมูลใดๆ)');
    log('='.repeat(70));
  }

  // =========================================================
  // Main execution
  // =========================================================
  async function main() {
    console.clear();
    log('========================================');
    log('ACC Tracker - Excel vs Supabase Verifier');
    log('โหมด: Read-only 100%');
    log('========================================');

    if (!checkEnvironment()) {
      log('\nหยุดการทำงานเนื่องจาก environment ไม่พร้อม');
      return;
    }

    if (!await checkSession()) {
      log('\nหยุดการทำงานเนื่องจากยังไม่ได้ Login');
      return;
    }

    let excelResult;
    try {
      excelResult = await readExcelFile();
    } catch (err) {
      error('ไม่สามารถอ่านไฟล์ Excel: ' + err.message);
      log('\nหยุดการทำงาน');
      return;
    }

    if (!processExcelData(excelResult.jsonData)) {
      log('\nหยุดการทำงานเนื่องจากประมวลผล Excel ไม่สำเร็จ');
      return;
    }

    if (!await readSupabaseTasks()) {
      log('\nหยุดการทำงานเนื่องจากอ่าน Supabase ไม่สำเร็จ');
      return;
    }

    compareKeys();
    compareDetails();
    showSummary();
  }

  main();
})();

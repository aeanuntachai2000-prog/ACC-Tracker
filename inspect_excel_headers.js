/* =========================================================
   ACC Tracker - Inspect Excel Headers (Read-only Diagnostic)
   วัตถุประสงค์: ตรวจสอบ Sheet และ Header ของไฟล์ Excel
   วิธีใช้: เปิดแอป ACC Tracker -> Chrome DevTools Snippets -> วาง -> รัน
   ========================================================= */

(function() {
  'use strict';

  const EXCEL_FILE_NAME = 'AE_ACCOUNTING_WORK_TRACKER.xlsm';
  const MAX_ROWS_TO_SHOW = 15;
  const SEARCH_TERMS = ['CompanyID', 'Company Code', 'บริษัท', 'company_id', 'company_code', 'company_name'];

  let results = {
    fileName: '',
    sheetNames: [],
    sheetDetails: [],
    foundMatches: [],
    errors: []
  };

  function log(msg) { console.log(msg); }
  function error(msg) { console.error('❌ ' + msg); results.errors.push(msg); }
  function success(msg) { console.log('✅ ' + msg); }
  function info(msg) { console.log('ℹ️ ' + msg); }

  // ตรวจสอบว่า string มีคำที่คล้ายกับ search term หรือไม่ (case-insensitive, trim)
  function matchesSearchTerm(cellValue, term) {
    if (cellValue === null || cellValue === undefined) return false;
    const str = String(cellValue).trim();
    if (str.length === 0) return false;
    return str.toLowerCase() === term.toLowerCase() ||
           str.toLowerCase().includes(term.toLowerCase());
  }

  // =========================================================
  // สร้าง UI สำหรับเลือกไฟล์
  // =========================================================
  function createFilePicker() {
    return new Promise((resolve, reject) => {
      log('กำลังสร้างหน้าต่างเลือกไฟล์...');

      const container = document.createElement('div');
      container.id = 'acc-excel-inspector';
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

      const title = document.createElement('div');
      title.textContent = 'เลือกไฟล์ ' + EXCEL_FILE_NAME;
      title.style.fontWeight = '700';
      title.style.marginBottom = '12px';
      container.appendChild(title);

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.xlsx,.xlsm';
      input.style.marginBottom = '10px';
      container.appendChild(input);

      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'ยกเลิก';
      cancelBtn.style.marginRight = '10px';
      container.appendChild(cancelBtn);

      document.body.appendChild(container);

      let resolved = false;

      input.onchange = function(e) {
        if (resolved) return;
        resolved = true;
        const file = e.target.files[0];
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
  // ตรวจสอบ Workbook
  // =========================================================
  function inspectWorkbook(workbook) {
    log('\n========================================');
    log('ตรวจสอบ Workbook: ' + results.fileName);
    log('========================================');

    results.sheetNames = workbook.SheetNames;
    log('จำนวน Sheet: ' + workbook.SheetNames.length);
    log('ชื่อ Sheet ทั้งหมด: ' + workbook.SheetNames.join(', '));

    workbook.SheetNames.forEach(function(sheetName, sheetIndex) {
      log('\n----------------------------------------');
      log('Sheet #' + (sheetIndex + 1) + ': "' + sheetName + '"');
      log('----------------------------------------');

      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) {
        error('ไม่สามารถเข้าถึง Worksheet: ' + sheetName);
        return;
      }

      // แปลงเป็น JSON array แบบ raw (header: 1 เพื่อได้ตำแหน่งคอลัมน์ที่แน่นอน)
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true });

      if (!jsonData || jsonData.length === 0) {
        log('Sheet นี้ว่างเปล่า');
        results.sheetDetails.push({
          sheetName: sheetName,
          rowCount: 0,
          rows: [],
          matches: []
        });
        return;
      }

      log('จำนวนแถวทั้งหมด: ' + jsonData.length);
      log('จำนวนคอลัมน์สูงสุด: ' + Math.max.apply(null, jsonData.map(function(r) { return r ? r.length : 0; })));

      // แสดง 15 แถวแรก
      log('\n--- ข้อมูล ' + Math.min(MAX_ROWS_TO_SHOW, jsonData.length) + ' แถวแรก ---');
      const rowsToShow = [];
      for (var i = 0; i < Math.min(MAX_ROWS_TO_SHOW, jsonData.length); i++) {
        var row = jsonData[i];
        if (!row) continue;
        var rowDisplay = [];
        row.forEach(function(cell, colIdx) {
          var cellStr = cell === null || cell === undefined ? '' : String(cell);
          // ตัดตัวยาวเกินไป
          if (cellStr.length > 60) cellStr = cellStr.substring(0, 60) + '...';
          rowDisplay.push('Col' + (colIdx + 1) + '=' + JSON.stringify(cellStr));
        });
        var rowStr = 'Row ' + (i + 1) + ': ' + rowDisplay.join(' | ');
        log(rowStr);
        rowsToShow.push({ rowNum: i + 1, cells: row });
      }

      // ค้นหาแถวที่มีคำใกล้เคียงกับ search terms
      log('\n--- ผลการค้นหาคอลัมน์ที่ตรงกับคำค้นหา ---');
      var sheetMatches = [];
      jsonData.forEach(function(row, rowIdx) {
        if (!row) return;
        row.forEach(function(cell, colIdx) {
          SEARCH_TERMS.forEach(function(term) {
            if (matchesSearchTerm(cell, term)) {
              var match = {
                sheetName: sheetName,
                rowNum: rowIdx + 1,
                colNum: colIdx + 1,
                term: term,
                cellValue: cell
              };
              results.foundMatches.push(match);
              sheetMatches.push(match);
              log('  พบ: Row ' + (rowIdx + 1) + ' Col ' + (colIdx + 1) + ' | คำค้นหา="' + term + '" | ค่าในเซลล์="' + String(cell) + '"');
            }
          });
        });
      });

      if (sheetMatches.length === 0) {
        log('  ไม่พบคอลัมน์ที่ตรงกับคำค้นหาใน Sheet นี้');
      }

      results.sheetDetails.push({
        sheetName: sheetName,
        rowCount: jsonData.length,
        rows: rowsToShow,
        matches: sheetMatches
      });
    });
  }

  // =========================================================
  // แสดงสรุป
  // =========================================================
  function showSummary() {
    log('\n========================================');
    log('สรุปผลการตรวจสอบ Excel Headers');
    log('========================================');
    log('ไฟล์: ' + results.fileName);
    log('จำนวน Sheet: ' + results.sheetNames.length);
    log('ชื่อ Sheet: ' + results.sheetNames.join(', '));
    log('จำนวนการพบคำค้นหาทั้งหมด: ' + results.foundMatches.length);

    if (results.foundMatches.length > 0) {
      log('\n--- รายการคอลัมน์ที่พบ (ทั้งหมด) ---');
      results.foundMatches.forEach(function(m) {
        log('  Sheet="' + m.sheetName + '" | Row ' + m.rowNum + ' | Col ' + m.colNum +
            ' | คำค้นหา="' + m.term + '" | ค่า="' + String(m.cellValue) + '"');
      });
    }

    if (results.errors.length > 0) {
      log('\n--- ข้อผิดพลาด ---');
      results.errors.forEach(function(e, i) { log('  ' + (i + 1) + '. ' + e); });
    }

    log('\n========================================');
    log('สิ้นสุดการตรวจสอบ (Read-only - ไม่มีการแก้ไขไฟล์ Excel)');
    log('========================================');
  }

  // =========================================================
  // Main
  // =========================================================
  async function main() {
    console.clear();
    log('========================================');
    log('ACC Tracker - Inspect Excel Headers');
    log('โหมด: Read-only Diagnostic');
    log('========================================');

    if (typeof XLSX === 'undefined') {
      error('SheetJS (XLSX) ยังไม่โหลดบนหน้าเว็บ');
      return;
    }
    success('SheetJS พร้อมใช้งาน');

    try {
      var file = await createFilePicker();
      results.fileName = file.name;

      log('\nไฟล์ที่เลือก: ' + file.name);

      var reader = new FileReader();
      reader.onload = function(e) {
        try {
          var data = new Uint8Array(e.target.result);
          var workbook = XLSX.read(data, { type: 'array', cellDates: true });
          inspectWorkbook(workbook);
          showSummary();
        } catch (err) {
          error('อ่านไฟล์ Excel ล้มเหลว: ' + err.message);
        }
      };
      reader.onerror = function() {
        error('FileReader error');
      };
      reader.readAsArrayBuffer(file);
    } catch (err) {
      log('หยุดการทำงาน: ' + err.message);
    }
  }

  main();
})();

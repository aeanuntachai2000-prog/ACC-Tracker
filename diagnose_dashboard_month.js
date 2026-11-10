/* =========================================================
   ACC Tracker - Diagnose Dashboard Month Filtering (Read-only)
   วิธีใช้: เปิดแอป -> Login -> เปิด Console -> วางสคริปต์นี้ -> กด Enter
   ========================================================= */

(function() {
  'use strict';

  const PAGE_SIZE = 1000;
  let allTasks = [];

  function log(msg) { console.log(msg); }
  function error(msg) { console.error('❌ ' + msg); }
  function success(msg) { console.log('✅ ' + msg); }

  async function loadAllTasks() {
    log('=== กำลังโหลด work_tasks ทั้งหมดจาก Supabase ===');
    let from = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await sbClient
        .from('work_tasks')
        .select('*')
        .order('task_id', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) { error('Supabase error: ' + error.message); return false; }

      const batch = data || [];
      allTasks = allTasks.concat(batch);

      if (batch.length < PAGE_SIZE) { hasMore = false; }
      else { from += PAGE_SIZE; }
    }

    success('โหลด work_tasks สำเร็จ: ' + allTasks.length + ' รายการ');
    return true;
  }

  function analyzeMonthFormat() {
    log('\n=== วิเคราะห์รูปแบบคอลัมน์ month ===');

    const monthValues = new Set();
    allTasks.forEach(t => monthValues.add(t.month));
    const sortedMonths = [...monthValues].sort((a, b) => a - b);

    log('ค่า month ที่พบทั้งหมด (' + sortedMonths.length + ' ค่า): ' + sortedMonths.join(', '));

    const hasZero = sortedMonths.includes(0);
    const hasTwelve = sortedMonths.includes(12);
    const minMonth = Math.min(...sortedMonths);
    const maxMonth = Math.max(...sortedMonths);

    log('ค่าต่ำสุด: ' + minMonth + ' | ค่าสูงสุด: ' + maxMonth);
    log('มีค่า 0 หรือไม่: ' + hasZero);
    log('มีค่า 12 หรือไม่: ' + hasTwelve);

    if (minMonth === 1 && maxMonth === 12 && !hasZero) {
      success('month ใช้รูปแบบ 1–12');
      return '1-12';
    } else if (minMonth === 0 && maxMonth === 11 && !hasTwelve) {
      success('month ใช้รูปแบบ 0–11');
      return '0-11';
    } else {
      error('month มีรูปแบบผิดปกติ (ไม่สอดคล้อง 1–12 หรือ 0–11)');
      return 'unknown';
    }
  }

  function analyzeTaskTypes() {
    log('\n=== วิเคราะห์ task_type ทั้งหมด ===');

    const taskTypes = new Map();
    allTasks.forEach(t => {
      const tt = t.task_type || '(ไม่ระบุ)';
      if (!taskTypes.has(tt)) taskTypes.set(tt, 0);
      taskTypes.set(tt, taskTypes.get(tt) + 1);
    });

    log('พบ ' + taskTypes.size + ' ประเภทงาน:');
    taskTypes.forEach((count, type) => {
      log('  "' + type + '": ' + count + ' รายการ');
    });

    const recognized = ['ภาษีหัก ณ ที่จ่าย', 'VAT', 'งานบัญชีประจำเดือน'];
    const unrecognized = [];
    taskTypes.forEach((count, type) => {
      if (!recognized.includes(type)) unrecognized.push(type);
    });

    if (unrecognized.length > 0) {
      warn('ประเภทงานที่จัดกลุ่มไม่ได้ (ไม่อยู่ใน 3 กลุ่ม): ' + unrecognized.join(', '));
    } else {
      success('ทุกประเภทงานจัดอยู่ใน 3 กลุ่มได้');
    }

    return { taskTypes, unrecognized };
  }

  function analyzeYearMonthDistribution() {
    log('\n=== การกระจายข้อมูลตาม buddhist_year และ month ===');

    const ymMap = new Map();
    allTasks.forEach(t => {
      const key = String(t.buddhist_year) + '-' + String(t.month);
      if (!ymMap.has(key)) ymMap.set(key, 0);
      ymMap.set(key, ymMap.get(key) + 1);
    });

    const entries = [...ymMap.entries()].sort();
    log('พบ ' + entries.length + ' รอบปี-เดือน:');
    entries.forEach(([key, count]) => {
      log('  ' + key + ': ' + count + ' รายการ');
    });

    return ymMap;
  }

  function testMonthFiltering(monthFormat) {
    log('\n=== ทดสอบการกรองตามเดือนภาษี ===');

    const testCases = [
      { processingYear: 2569, processingMonth: 11, desc: 'พฤศจิกายน 2569 → เดือนภาษี ตุลาคม 2569' },
      { processingYear: 2569, processingMonth: 12, desc: 'ธันวาคม 2569 → เดือนภาษี พฤศจิกายน 2569' },
      { processingYear: 2570, processingMonth: 1,  desc: 'มกราคม 2570 → เดือนภาษี ธันวาคม 2569' }
    ];

    testCases.forEach(tc => {
      let taxMonthIndex = tc.processingMonth - 1;
      let taxYear = tc.processingYear;

      if (taxMonthIndex < 0) {
        taxMonthIndex = 11;
        taxYear -= 1;
      }

      // แปลง month index (0-11) เป็นค่าจริงใน DB ตามรูปแบบที่พบ
      let dbMonth;
      if (monthFormat === '1-12') {
        dbMonth = taxMonthIndex + 1;
      } else if (monthFormat === '0-11') {
        dbMonth = taxMonthIndex;
      } else {
        dbMonth = taxMonthIndex + 1; // fallback
      }

      const filtered = allTasks.filter(t =>
        String(t.buddhist_year) === String(taxYear) &&
        String(t.month) === String(dbMonth)
      );

      log(tc.desc);
      log('  → กรองด้วย buddhist_year=' + taxYear + ', month=' + dbMonth);
      log('  → พบ ' + filtered.length + ' รายการ');

      // แยกตาม task_type
      const byType = {};
      filtered.forEach(t => {
        const tt = t.task_type || '(ไม่ระบุ)';
        if (!byType[tt]) byType[tt] = 0;
        byType[tt]++;
      });
      Object.entries(byType).forEach(([type, count]) => {
        log('     ' + type + ': ' + count);
      });

      // สรุปสถานะ
      const completed = filtered.filter(t => t.status === 'เสร็จแล้ว').length;
      const pending = filtered.filter(t => t.status === 'ยังไม่เริ่ม' || t.status === 'กำลังดำเนินการ').length;
      log('     เสร็จแล้ว: ' + completed + ' | คงเหลือ: ' + pending);
    });
  }

  function checkDuplicates() {
    log('\n=== ตรวจสอบงานซ้ำ (Composite Key) ===');
    const keyMap = new Map();
    allTasks.forEach(t => {
      const key = String(t.buddhist_year) + '|' + String(t.month) + '|' + String(t.company_id) + '|' + String(t.task_type);
      if (!keyMap.has(key)) keyMap.set(key, []);
      keyMap.get(key).push(t.task_id);
    });

    let dupCount = 0;
    keyMap.forEach((ids, key) => {
      if (ids.length > 1) {
        dupCount++;
        if (dupCount <= 5) {
          log('  ซ้ำ: ' + key + ' → UUIDs: ' + ids.join(', '));
        }
      }
    });

    if (dupCount === 0) {
      success('ไม่พบงานซ้ำ (Composite Key ไม่ซ้ำ)');
    } else {
      warn('พบงานซ้ำ ' + dupCount + ' รายการ');
    }
  }

  async function main() {
    console.clear();
    log('========================================');
    log('ACC Tracker - Dashboard Month Diagnosis');
    log('โหมด: Read-only 100%');
    log('========================================');

    // ตรวจสอบ session
    try {
      const { data, error } = await sbClient.auth.getSession();
      if (error || !data.session) {
        error('ยังไม่ได้ Login กรุณาเข้าสู่ระบบก่อนรันสคริปต์นี้');
        return;
      }
      success('ผู้ใช้ได้รับการยืนยันตัวตนแล้ว');
    } catch (err) {
      error('ตรวจสอบ session ล้มเหลว: ' + err.message);
      return;
    }

    if (!await loadAllTasks()) return;

    const monthFormat = analyzeMonthFormat();
    analyzeTaskTypes();
    analyzeYearMonthDistribution();
    checkDuplicates();
    testMonthFiltering(monthFormat);

    log('\n' + '='.repeat(70));
    log('สิ้นสุดการวินิจฉัย (Read-only - ไม่มีการแก้ไขข้อมูลใดๆ)');
    log('='.repeat(70));
  }

  main();
})();

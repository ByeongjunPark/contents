const SHEET_NAMES = ["1일차", "2일차", "3일차"];

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function doGet(e) {
  const page = e?.parameter?.page;

  if (page === 'day1') {
    return HtmlService.createHtmlOutputFromFile('day1')
      .setSandboxMode(HtmlService.SandboxMode.IFRAME)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (page === 'day2') {
    return HtmlService.createHtmlOutputFromFile('day2')
      .setSandboxMode(HtmlService.SandboxMode.IFRAME) 
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (page === 'day3') {
    return HtmlService.createHtmlOutputFromFile('day3')
      .setSandboxMode(HtmlService.SandboxMode.IFRAME)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } else if (page === 'verify') {
    return HtmlService.createHtmlOutputFromFile('verify')
      .setSandboxMode(HtmlService.SandboxMode.IFRAME)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setSandboxMode(HtmlService.SandboxMode.IFRAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Step 3: 스크립트 속성 설정 함수 (한 번만 실행)
function setupScriptProperties() {
  const scriptProperties = PropertiesService.getScriptProperties();
  scriptProperties.setProperties({
    'DISABLE_HEADER_TEXT': 'true',
    'CLEAN_OUTPUT': 'true'
  });
  console.log('스크립트 속성이 설정되었습니다.');
}

// Step 4: 설정을 확인하는 함수
function checkSettings() {
  const scriptProperties = PropertiesService.getScriptProperties();
  console.log('현재 설정:', scriptProperties.getProperties());
  
  // 런타임 버전 확인
  console.log('런타임 정보를 확인하세요.');
}

function troubleshootSettings() {
  try {
    // 1. 현재 런타임 확인
    console.log('Utilities 객체 확인:', typeof Utilities);
    
    // 2. 스크립트 속성 확인  
    const props = PropertiesService.getScriptProperties().getProperties();
    console.log('스크립트 속성:', props);
    
    // 3. HTML 서비스 샌드박스 모드 확인
    const testOutput = HtmlService.createHtmlOutput('<p>테스트</p>')
      .setSandboxMode(HtmlService.SandboxMode.IFRAME);
    console.log('HTML 서비스 테스트 완료');
    
    return "설정 확인 완료";
    
  } catch (error) {
    console.error('설정 오류:', error);
    return "설정에 문제가 있습니다: " + error.message;
  }
}

// 성능 최적화된 수강신청 함수
function submitRegistration(data) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const daySheet = spreadsheet.getSheetByName(SHEET_NAMES[data.dayIndex]);
  const timeSheet = spreadsheet.getSheetByName('강의시간');

  const lecture = data.lecture.trim().split('\n')[0];
  const phone = data.phone.trim();
  const sheetDate = SHEET_NAMES[data.dayIndex];

  // ✅ 한 번에 모든 데이터 읽기
  const dayData = daySheet.getDataRange().getValues();
  const timeData = timeSheet.getDataRange().getValues();
  const headers = dayData[1]; // 2행 (인덱스 1)

  // 1. 강의시간 조회
  let targetTime = null;
  for (let i = 1; i < timeData.length; i++) {
    const [date, place, timeRange, title] = timeData[i];
    if (
      date?.toString().trim() === sheetDate &&
      title?.toString().trim() === lecture
    ) {
      targetTime = timeRange?.toString().trim();
      break;
    }
  }

  if (!targetTime) {
    return "❌ 강의 시간 정보를 찾을 수 없습니다.";
  }

  // 2. 시간 파싱
  function parseTime(str) {
    if (!str || typeof str !== 'string') return 0;
    const [h, m] = str.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  }
  
  const timeParts = targetTime.split("~");
  if (timeParts.length !== 2) {
    return "❌ 강의 시간 형식이 올바르지 않습니다.";
  }
  
  const [targetStart, targetEnd] = timeParts.map(parseTime);

  // 3. 겹치는 강의 목록 수집
  const overlappingLectures = new Set();
  for (let i = 1; i < timeData.length; i++) {
    const [date, , timeRange, otherLecture] = timeData[i];
    if (
      !date || !timeRange || !otherLecture ||
      date.toString().trim() !== sheetDate ||
      otherLecture.toString().trim() === lecture
    ) continue;

    const otherTimeParts = timeRange.toString().split("~");
    if (otherTimeParts.length !== 2) continue;
    
    const [start, end] = otherTimeParts.map(parseTime);
    const isOverlap = !(end <= targetStart || start >= targetEnd);

    if (isOverlap) {
      overlappingLectures.add(otherLecture.toString().trim());
    }
  }

  // 4. 메모리에서 중복 확인 (매우 빠름!)
  for (let col = 1; col < headers.length; col += 3) { // B열부터 시작
    const otherLecture = headers[col];
    if (!otherLecture || !overlappingLectures.has(otherLecture.toString().trim())) continue;

    // 해당 강의의 연락처 열에서 중복 확인
    const phoneCol = col + 2; // 연락처 열
    for (let row = 3; row < dayData.length; row++) { // 4행부터 (인덱스 3)
      const savedPhone = dayData[row][phoneCol];
      if (savedPhone && savedPhone.toString().trim() === phone) {
        return `⚠️ 동일 시간대(${targetTime})에 이미 신청한 "${otherLecture}" 강의가 있습니다.`;
      }
    }
  }

  // 5. 동일 강의 중복 신청 확인
  let targetCol = -1;
  for (let col = 1; col < headers.length; col += 3) {
    if (headers[col].toString().trim() === lecture) {
      targetCol = col;
      break;
    }
  }

  if (targetCol === -1) {
    return "❌ 해당 강의를 찾을 수 없습니다: " + lecture;
  }

  const phoneCol = targetCol + 2;
  for (let row = 3; row < dayData.length; row++) {
    const existingPhone = dayData[row][phoneCol];
    if (existingPhone && existingPhone.toString().trim() === phone) {
      return "⚠️ 이미 신청된 강의입니다. 중복 신청할 수 없습니다.";
    }
  }

  // 6. 빈 자리 찾아서 한 번에 저장
  let targetRow = -1;
  for (let row = 3; row < dayData.length; row++) {
    if (!dayData[row][targetCol]) { // 빈 자리 발견
      targetRow = row + 1; // getRange는 1-based
      break;
    }
  }

  // 빈 자리가 없으면 새 행 추가
  if (targetRow === -1) {
    targetRow = dayData.length + 1;
  }

  // ✅ 한 번에 3개 셀 업데이트 (매우 빠름!)
  const range = daySheet.getRange(targetRow, targetCol + 1, 1, 3); // +1은 1-based 변환
  range.setValues([[data.school, data.name, phone]]);

  return "✅ 수강 신청이 완료되었습니다.";
}

// 성능 최적화된 취소 함수
function cancelRegistration(classTitle, phone, day) {
  try {
    const sheetName = `${day}일차`;
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    
    if (!sheet) {
      return {
        success: false,
        message: `"${sheetName}" 시트를 찾을 수 없습니다.`
      };
    }
    
    const data = sheet.getDataRange().getValues();
    const HEADER_ROW = 1;  // 강의명은 2행
    const START_ROW = 3;   // 신청자 데이터는 4행부터
    const BLOCK_WIDTH = 3; // 소속교, 이름, 연락처 3열

    // 1. 강의명에 해당하는 시작열 찾기
    let startCol = -1;
    for (let col = 1; col < data[HEADER_ROW].length; col += BLOCK_WIDTH) {
      const title = data[HEADER_ROW][col];
      if (title && title.toString().trim() === classTitle.trim()) {
        startCol = col;
        break;
      }
    }

    if (startCol === -1) {
      return {
        success: false,
        message: `"${classTitle}" 강의명을 찾을 수 없습니다.`
      };
    }

    const phoneCol = startCol + 2;

    // 2. 해당 강의에서 연락처가 일치하는 행 찾기
    let foundRow = -1;
    for (let row = START_ROW; row < data.length; row++) {
      const cellValue = data[row][phoneCol];
      if (cellValue && cellValue.toString().trim() === phone) {
        foundRow = row + 1; // 1-based 행 번호로 변환
        break;
      }
    }

    if (foundRow === -1) {
      return {
        success: false,
        message: "해당 연락처로 신청된 수강 정보를 찾을 수 없습니다."
      };
    }

    // 3. ✅ 해당 강의의 3개 셀만 비우기 (다른 강의는 건드리지 않음!)
    const targetRange = sheet.getRange(foundRow, startCol + 1, 1, BLOCK_WIDTH);
    targetRange.clearContent();

    console.log(`취소 완료: ${foundRow}행, ${startCol + 1}~${startCol + 3}열 비움`);

    return {
      success: true,
      message: "수강이 성공적으로 취소되었습니다."
    };

  } catch (error) {
    console.error('cancelRegistration 오류:', error);
    return {
      success: false,
      message: `오류가 발생했습니다: ${error.message}`
    };
  }
}

// 🔍 디버깅용 버전 (문제 확인용)
function cancelRegistrationDebug(classTitle, phone, day) {
  try {
    const sheetName = `${day}일차`;
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    
    console.log('=== 취소 시작 ===');
    console.log('강의명:', classTitle);
    console.log('연락처:', phone);
    console.log('일차:', day);
    
    const data = sheet.getDataRange().getValues();
    const HEADER_ROW = 1;
    const START_ROW = 3;
    const BLOCK_WIDTH = 3;

    // 헤더 출력 (디버깅용)
    console.log('헤더 확인:', data[HEADER_ROW]);

    // 강의 위치 찾기
    let startCol = -1;
    for (let col = 1; col < data[HEADER_ROW].length; col += BLOCK_WIDTH) {
      const title = data[HEADER_ROW][col];
      console.log(`col ${col}: "${title}"`);
      if (title && title.toString().trim() === classTitle.trim()) {
        startCol = col;
        console.log('강의 찾음! startCol:', startCol);
        break;
      }
    }

    if (startCol === -1) {
      console.log('강의를 찾지 못함');
      return { success: false, message: "강의를 찾을 수 없습니다." };
    }

    // 연락처 찾기
    const phoneCol = startCol + 2;
    console.log('연락처 열:', phoneCol);
    
    let foundRow = -1;
    for (let row = START_ROW; row < data.length; row++) {
      const cellValue = data[row][phoneCol];
      console.log(`${row + 1}행 연락처: "${cellValue}"`);
      if (cellValue && cellValue.toString().trim() === phone) {
        foundRow = row + 1; // 1-based
        console.log('연락처 찾음! foundRow:', foundRow);
        break;
      }
    }

    if (foundRow === -1) {
      console.log('연락처를 찾지 못함');
      return { success: false, message: "연락처를 찾을 수 없습니다." };
    }

    // 삭제 전 해당 행 데이터 확인
    console.log('삭제 전 해당 행 전체 데이터:', data[foundRow - 1]);

    // ✅ 정확히 3개 셀만 비우기
    console.log(`비울 범위: ${foundRow}행, ${startCol + 1}~${startCol + 3}열`);
    
    const targetRange = sheet.getRange(foundRow, startCol + 1, 1, BLOCK_WIDTH);
    targetRange.clearContent();

    console.log('=== 취소 완료 ===');

    return { success: true, message: "수강이 성공적으로 취소되었습니다." };

  } catch (error) {
    console.error('오류:', error);
    return { success: false, message: `오류: ${error.message}` };
  }
}

// 성능 최적화된 조회 함수
function getRegistrationMap(name, phone) {
  const result = {};
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  for (let day = 0; day < SHEET_NAMES.length; day++) {
    const sheet = spreadsheet.getSheetByName(SHEET_NAMES[day]);
    // ✅ 한 번에 모든 데이터 읽기
    const data = sheet.getDataRange().getValues();
    const headerRow = data[1]; // 2행

    const lectures = [];
    const selectedLectures = [];

    for (let col = 1; col < headerRow.length; col += 3) {
      const lectureTitle = headerRow[col];
      if (!lectureTitle) continue;

      lectures.push(lectureTitle);

      // 메모리에서 검색 (매우 빠름!)
      const phoneCol = col + 2;
      for (let row = 3; row < data.length; row++) { // 4행부터
        const storedPhone = data[row][phoneCol];
        if (storedPhone && storedPhone.toString().trim() === phone) {
          selectedLectures.push(lectureTitle);
          break;
        }
      }
    }

    result[`day${day + 1}`] = lectures;
    result[`selectedDay${day + 1}`] = selectedLectures;
  }

  return result;
}

function loadDayHtml(dayIndex) {
  return HtmlService.createHtmlOutputFromFile(`day${dayIndex}`).getContent();
}

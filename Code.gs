function onOpen() {
  setupSystem(); 
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🛠️ 시스템 관리')
    .addItem('📥 학생용 설치 파일 생성', 'showDownloadDialog')
    .addSeparator()
    .addItem('🧹 접속 로그 전체 삭제', 'deleteAllLogs')
    .addItem('📂 캡처 파일 전체 삭제', 'cleanupCaptures')
    .addItem('🔃 하단 탭 번호순 재정렬', 'reorderTabs')
    .addToUi();
}

function setupSystem() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  if (ss.getName() !== "학생 크롬북 모니터링 프로그램") {
    ss.rename("학생 크롬북 모니터링 프로그램");
  }
  
  let dash = ss.getSheetByName("대시보드") || ss.insertSheet("대시보드", 0);
  if (dash.getRange(1, 1).getValue() !== "번호") {
    const headers = ["번호", "이름", "이메일", "상태", "현재 사이트", "URL", "체류(분)", "화면 잠금", "잠금 메시지", "📸 캡처요청", "최근캡처", "업데이트"];
    dash.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight("bold").setBackground("#d9ead3").setHorizontalAlignment("center");
    dash.setFrozenRows(1);
    dash.setColumnWidths(5, 2, 250);
    
    const cb = SpreadsheetApp.newDataValidation().requireCheckbox().build();
    dash.getRange("H2:H100").setDataValidation(cb);
    dash.getRange("J2:J100").setDataValidation(cb);
  }

  if (dash.getRange("M1").getValue() !== "모니터링 기록") {
    dash.getRange("M1").setValue("모니터링 기록").setFontWeight("bold").setBackground("#fff2cc").setHorizontalAlignment("center");
    const switchCb = SpreadsheetApp.newDataValidation().requireCheckbox().build();
    dash.getRange("N1").setDataValidation(switchCb).setValue(true);
  }

  let temp = ss.getSheetByName("로그_템플릿") || ss.insertSheet("로그_템플릿", 1);
  if (temp.getRange(1, 1).getValue() !== "시간") {
    temp.appendRow(["시간", "사이트 제목", "URL", "머문시간(초)", "캡처본 링크"]);
    temp.getRange("A1:E1").setFontWeight("bold").setBackground("#fff2cc");
    temp.hideSheet();
  }
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const { email, name, studentNo, title, url, duration, image, unlock } = data;
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dash = ss.getSheetByName("대시보드");
  const emails = dash.getRange("C:C").getValues().flat();
  let rowIndex = emails.indexOf(email) + 1;

  const time = Utilities.formatDate(new Date(), "GMT+9", "yyyy-MM-dd HH:mm:ss");
  const isMonitoringOn = dash.getRange("N1").getValue() === true;

  if (rowIndex === 0) {
    dash.appendRow([Number(studentNo) || "", name || "신규", email, "🟢 온라인", title, url, 0, false, "", false, "", time]);
    const lastRow = dash.getLastRow();
    dash.getRange(2, 1, lastRow - 1, 12).sort({column: 1, ascending: true});
    rowIndex = dash.getRange("C:C").getValues().flat().indexOf(email) + 1;
    
    const cb = SpreadsheetApp.newDataValidation().requireCheckbox().build();
    dash.getRange(rowIndex, 8).setDataValidation(cb); 
    dash.getRange(rowIndex, 10).setDataValidation(cb); 
  }

  const studentName = dash.getRange(rowIndex, 2).getDisplayValue();
  let studentSheet = ss.getSheetByName(studentName);

  if (!studentSheet) {
    studentSheet = ss.getSheetByName("로그_템플릿").copyTo(ss).setName(studentName);
    studentSheet.showSheet();
    dash.getRange(rowIndex, 2).setFormula(`=HYPERLINK("#gid=${studentSheet.getSheetId()}", "${studentName}")`);
    reorderTabs();
  }

  if (unlock === true) {
    dash.getRange(rowIndex, 8).setValue(false);
    return ContentService.createTextOutput(JSON.stringify({lock: "OFF"}));
  }

  if (image) {
    const folder = DriveApp.getFoldersByName("학생_화면_캡처").hasNext() ? DriveApp.getFoldersByName("학생_화면_캡처").next() : DriveApp.createFolder("학생_화면_캡처");
    const blob = Utilities.newBlob(Utilities.base64Decode(image.split(',')[1]), 'image/png', `${studentName}_${Date.now()}.png`);
    const fileUrl = folder.createFile(blob).getUrl();
    dash.getRange(rowIndex, 10).setValue(false); 
    dash.getRange(rowIndex, 11).setFormula(`=HYPERLINK("${fileUrl}", "👁️ 보기")`);
    studentSheet.appendRow([time, "📸 화면 캡처", "-", 0, fileUrl]);
  }

  if (isMonitoringOn) {
    dash.getRange(rowIndex, 4, 1, 4).setValues([["🟢 온라인", title, url, Math.floor(duration / 60)]]);
    dash.getRange(rowIndex, 12).setValue(time);
    
    const lastLogRow = studentSheet.getLastRow();
    const lastUrl = lastLogRow > 1 ? studentSheet.getRange(lastLogRow, 3).getValue() : "";
    
    if (lastUrl !== url) {
      studentSheet.appendRow([time, title, url, duration, ""]);
    } else if (lastLogRow > 1) {
      studentSheet.getRange(lastLogRow, 4).setValue(duration); 
    }
  }

  return ContentService.createTextOutput(JSON.stringify({
    lock: dash.getRange(rowIndex, 8).getValue() ? "ON" : "OFF",
    message: dash.getRange(rowIndex, 9).getValue() || "",
    capture: dash.getRange(rowIndex, 10).getValue() ? "REQ" : "OK"
  })).setMimeType(ContentService.MimeType.JSON);
}

function showDownloadDialog() {
  const url = ScriptApp.getService().getUrl();
  if (!url) {
    SpreadsheetApp.getUi().alert("❌ [배포] -> [새 배포]를 먼저 진행해 주세요.");
    return;
  }
  const html = HtmlService.createHtmlOutputFromFile('installDialog').setWidth(400).setHeight(180);
  SpreadsheetApp.getUi().showModalDialog(html, '확장 프로그램 파일 다운로드');
}

function getZipData() {
  const url = ScriptApp.getService().getUrl();
  const manifest = {
    "manifest_version": 3, 
    "name": "크롬 학습 도우미", 
    "version": "1.0",
    "permissions": ["identity", "identity.email", "tabs", "activeTab", "scripting"],
    "host_permissions": ["<all_urls>"], 
    "background": { "service_worker": "background.js" }
  };
  
  const backgroundJs = `
    const GAS_URL = "${url}";
    let currentUrl = "";
    let activeTabStart = Date.now();

    chrome.tabs.onUpdated.addListener((id, info, tab) => { 
      if (info.status === 'complete' && !tab.url.startsWith('chrome:')) send(tab); 
    });
    chrome.tabs.onActivated.addListener(info => { 
      chrome.tabs.get(info.tabId, tab => send(tab)); 
    });
    setInterval(() => { 
      chrome.tabs.query({active:true, currentWindow:true}, t => { if(t[0]) send(t[0]); }); 
    }, 5000);

    function send(tab, extra = {}) {
      if (tab.url && tab.url !== currentUrl) {
        currentUrl = tab.url;
        activeTabStart = Date.now();
      }
      let durationSec = Math.floor((Date.now() - activeTabStart) / 1000);

      chrome.identity.getProfileUserInfo({accountStatus:'ANY'}, user => {
        if (!user.email) return;
        let data = {
          email: user.email,
          title: tab.title || "",
          url: tab.url || "",
          duration: durationSec,
          image: extra.img || null,
          unlock: extra.un || false
        };
        
        fetch(GAS_URL, { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()).then(res => {
          if (res.lock === "ON") {
            chrome.scripting.executeScript({ target: {tabId: tab.id}, func: (m) => {
              if(document.getElementById('t-l')) { document.getElementById('t-m').innerText = m; return; }
              let d = document.createElement('div'); d.id = 't-l';
              d.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:black;z-index:2147483647;display:flex;justify-content:center;align-items:center;color:white;font-family:sans-serif;pointer-events:none;';
              d.innerHTML = '<div style="text-align:center"><h1 id="t-m" style="font-size:50px">' + (m||"") + '</h1></div>';
              document.body.appendChild(d);
            }, args: [res.message] });
          } else {
            chrome.scripting.executeScript({ target: {tabId: tab.id}, func: () => { let d=document.getElementById('t-l'); if(d) d.remove(); } });
          }
          if (res.capture === "REQ") {
            chrome.tabs.captureVisibleTab(null, {format:"png", quality:30}, img => { if(img) send(tab, { img: img }); });
          }
        });
      });
    }
    
    chrome.runtime.onMessage.addListener((m, s) => { if(m.type==="UN") send(s.tab, {un:true}); });
    chrome.tabs.onUpdated.addListener((id, info, tab) => {
      chrome.scripting.executeScript({ target: {tabId: id}, func: () => {
        window.addEventListener('keydown', e => { 
          if (e.altKey && e.shiftKey && e.code === 'KeyK') { 
            if(prompt("암호입력(4021)")==='4021') chrome.runtime.sendMessage({type:"UN"}); 
          } 
        });
      }});
    });
  `;
  const zip = Utilities.zip([
    Utilities.newBlob(JSON.stringify(manifest), 'application/json', 'manifest.json'),
    Utilities.newBlob(backgroundJs, 'application/javascript', 'background.js'),
    Utilities.newBlob('<h1>Success</h1>', 'text/html', 'success.html')
  ]);
  return Utilities.base64Encode(zip.getBytes());
}

function reorderTabs() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dash = ss.getSheetByName("대시보드");
  const data = dash.getRange(2, 1, dash.getLastRow() - 1, 2).getValues();
  data.forEach((row, idx) => {
    const sheet = ss.getSheetByName(row[1]);
    if (sheet) { ss.setActiveSheet(sheet); ss.moveActiveSheet(idx + 2); }
  });
  ss.getSheetByName("대시보드").activate();
}

function deleteAllLogs() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert('경고', '모든 학생의 접속 로그 기록을 완전히 삭제하시겠습니까?\n(대시보드와 템플릿은 유지됩니다.)', ui.ButtonSet.YES_NO);
  
  if (response == ui.Button.YES) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets();
    let deletedCount = 0;
    
    sheets.forEach(sheet => {
      const name = sheet.getName();
      if (name !== "대시보드" && name !== "로그_템플릿") {
        const lastRow = sheet.getLastRow();
        const lastCol = sheet.getLastColumn();
        if (lastRow > 1) {
          sheet.getRange(2, 1, lastRow - 1, lastCol).clearContent();
          deletedCount++;
        }
      }
    });
    
    ui.alert('삭제 완료', `${deletedCount}명 학생의 접속 로그가 삭제되었습니다.`, ui.ButtonSet.OK);
  }
}

function cleanupCaptures() {
  const folders = DriveApp.getFoldersByName("학생_화면_캡처");
  if (!folders.hasNext()) {
    SpreadsheetApp.getUi().alert("폴더가 없습니다.");
    return;
  }
  const files = folders.next().getFiles();
  let count = 0; 
  while (files.hasNext()) { 
    files.next().setTrashed(true); 
    count++; 
  }
  SpreadsheetApp.getUi().alert(`${count}개의 캡처 파일이 휴지통으로 이동되었습니다.`);
}

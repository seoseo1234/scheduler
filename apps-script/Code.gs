/**
 * 우리반 시계 - 구글 캘린더·태스크 연동 (Google Apps Script 웹 앱)
 *
 * 설치 방법
 *  1. https://script.google.com 에서 새 프로젝트를 만들고 이 코드를 붙여넣습니다.
 *  2. 왼쪽 "서비스" + 버튼 → "Google Tasks API" 추가
 *     그다음 위쪽 함수 목록에서 doGet을 고르고 ▶ 실행 → 권한 검토 → 허용
 *     (코드를 새로 붙여넣은 뒤에도 한 번 더 해야 할 일 완료·수정·삭제 권한이 생깁니다)
 *  3. 프로젝트 설정(톱니바퀴) → 스크립트 속성 → TOKEN 추가 (우리반 시계 설정 화면이 만들어 준 값)
 *     TOKEN이 이미 있으면 "스크립트 속성 수정"에서 값만 새 토큰으로 바꿉니다.
 *     (선택) CALENDAR_IDS: 표시할 캘린더 ID를 쉼표로 구분. 비우면 숨기지 않은 모든 캘린더.
 *  4. 배포 → 새 배포 → 유형 "웹 앱", 실행 사용자 "나", 액세스 권한 "모든 사용자"
 *  5. 웹 앱 URL(…/exec)을 우리반 시계 설정 화면에 붙여넣고 "연결 테스트"
 *
 * 코드를 고쳐 붙여넣었다면 배포 → 배포 관리 → 연필(수정) → 버전 "새 버전" → 배포 해야 반영됩니다.
 *
 * 보안: URL을 아는 사람도 TOKEN이 없으면 데이터를 받거나 할 일을 바꿀 수 없습니다.
 */

var DEFAULT_DAYS = 7;
var MAX_DAYS = 60;

function doGet(e) {
  var params = (e && e.parameter) || {};
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TOKEN');
  if (!token || params.token !== token) {
    return json_({ error: 'unauthorized' });
  }

  var days = parseInt(params.days, 10);
  if (!(days >= 1)) days = DEFAULT_DAYS;
  days = Math.min(days, MAX_DAYS);

  try {
    return json_({
      generatedAt: formatDateTime_(new Date()),
      events: getEvents_(days, props.getProperty('CALENDAR_IDS')),
      tasks: getTasks_(),
    });
  } catch (err) {
    return json_({ error: 'failed', message: String(err && err.message ? err.message : err) });
  }
}

/**
 * 교사 위젯에서 할 일을 완료·수정·삭제한다.
 * 본문(JSON): { token, action: 'complete' | 'delete' | 'update', listId, taskId, title?, due?, notes? }
 */
function doPost(e) {
  var body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ error: 'badRequest' });
  }
  var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!token || body.token !== token) {
    return json_({ error: 'unauthorized' });
  }
  try {
    updateTask_(body);
    return json_({ ok: true });
  } catch (err) {
    return json_({ error: 'failed', message: String(err && err.message ? err.message : err) });
  }
}

function updateTask_(b) {
  if (!b.listId || !b.taskId) throw new Error('할 일을 찾을 수 없어요.');
  switch (b.action) {
    case 'complete':
      Tasks.Tasks.patch({ status: 'completed' }, b.listId, b.taskId);
      return;
    case 'delete':
      Tasks.Tasks.remove(b.listId, b.taskId);
      return;
    case 'update':
      // 마감일을 지울 수 있게 전체를 받아 고친 뒤 통째로 저장한다.
      var task = Tasks.Tasks.get(b.listId, b.taskId);
      if (typeof b.title === 'string' && b.title.trim()) task.title = b.title.trim();
      if (typeof b.notes === 'string') task.notes = b.notes;
      if (b.due === null || b.due === '') delete task.due;
      else if (typeof b.due === 'string') task.due = b.due + 'T00:00:00.000Z';
      Tasks.Tasks.update(task, b.listId, b.taskId);
      return;
    default:
      throw new Error('알 수 없는 요청이에요: ' + b.action);
  }
}

/** 오늘 0시부터 days일 동안의 일정 */
function getEvents_(days, calendarIds) {
  var start = new Date();
  start.setHours(0, 0, 0, 0);
  var end = new Date(start.getTime());
  end.setDate(end.getDate() + days);

  var calendars;
  var ids = (calendarIds || '')
    .split(',')
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s; });
  if (ids.length > 0) {
    calendars = ids
      .map(function (id) { return CalendarApp.getCalendarById(id); })
      .filter(function (c) { return c; });
  } else {
    calendars = CalendarApp.getAllCalendars().filter(function (c) { return !c.isHidden(); });
  }

  var events = [];
  calendars.forEach(function (cal) {
    cal.getEvents(start, end).forEach(function (ev) {
      // 내가 거절한 일정은 제외
      try {
        if (ev.getMyStatus() === CalendarApp.GuestStatus.NO) return;
      } catch (ignore) {}
      var allDay = ev.isAllDayEvent();
      events.push({
        id: ev.getId() + '|' + ev.getStartTime().getTime(),
        title: ev.getTitle() || '(제목 없음)',
        start: allDay ? formatDate_(ev.getAllDayStartDate()) : formatDateTime_(ev.getStartTime()),
        end: allDay ? formatDate_(ev.getAllDayEndDate()) : formatDateTime_(ev.getEndTime()),
        allDay: allDay,
        location: ev.getLocation() || '',
        calendar: cal.getName(),
      });
    });
  });
  events.sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });
  return events;
}

/** 모든 목록의 미완료 할 일 (고급 서비스 Tasks 필요) */
function getTasks_() {
  var out = [];
  var listPage;
  do {
    var lists = Tasks.Tasklists.list({ maxResults: 100, pageToken: listPage });
    (lists.items || []).forEach(function (list) {
      var taskPage;
      do {
        var res = Tasks.Tasks.list(list.id, {
          showCompleted: false,
          showHidden: false,
          maxResults: 100,
          pageToken: taskPage,
        });
        (res.items || []).forEach(function (t) {
          if (t.status === 'completed' || !t.title) return;
          out.push({
            id: t.id,
            listId: list.id,
            title: t.title,
            // due는 "2026-10-06T00:00:00.000Z" 형식이며 날짜 부분만 의미가 있다.
            due: t.due ? String(t.due).slice(0, 10) : null,
            notes: t.notes || '',
            list: list.title,
          });
        });
        taskPage = res.nextPageToken;
      } while (taskPage);
    });
    listPage = lists.nextPageToken;
  } while (listPage);
  return out;
}

function formatDateTime_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function formatDate_(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

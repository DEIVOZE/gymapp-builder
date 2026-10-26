'use strict';

/* =====================================================
   ДНЕВНИК ТРЕНИРОВОК — вся логика приложения.

   Как устроено (кратко):
   1. ХРАНИЛИЩЕ   — все данные в localStorage телефона,
                    в виде одного JSON-объекта `state`.
   2. ДАТЫ        — маленькие помощники для работы с датами.
   3. КАЛЕНДАРЬ   — сетка месяца, точка на днях с тренировками,
                    кнопка перехода к сегодняшнему дню.
   4. ЭКРАН ДНЯ   — упражнения (выпадающий список или своё
                    название), подходы со стрелками ±, заметка дня.
   5. ЭКСПОРТ     — текст отчёта, скачивание .txt и копирование
                    в буфер обмена.
   6. БЭКАП JSON  — сохранение и восстановление всех данных.
   7. ПРОГРЕСС    — сравнение первой и последней тренировки
                    каждого упражнения за выбранный период.
   8. МОДАЛКИ     — все обработчики кнопок в одном месте.
   9. PWA         — регистрация service worker'а (офлайн-режим).
   ===================================================== */


/* ---------- 1. ХРАНИЛИЩЕ ---------- */

const STORAGE_KEY = 'gymlog_v1'; // имя ключа в localStorage

// Структура данных:
// state = {
//   workouts: {
//     '2026-10-26': {
//       note: 'выспался, техника норм',     // заметка дня (может не быть)
//       exercises: [
//         { name: 'Жим лёжа',
//           sets: [ { weight: 80, reps: 8, rir: 2 }, ... ] }
//       ]
//     }
//   },
//   exercises: ['Жим лёжа', 'Приседания', ...]  // список для выпадающего меню
// }

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Не удалось прочитать сохранённые данные:', e);
  }
  return { workouts: {}, exercises: [] };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// Вернуть (или создать) объект тренировки за дату ISO '2026-10-26'
function getWorkout(iso) {
  if (!state.workouts[iso]) state.workouts[iso] = { exercises: [] };
  return state.workouts[iso];
}

// Сокращение для document.querySelector
function $(sel) { return document.querySelector(sel); }


/* ---------- 2. ДАТЫ ---------- */

// Date -> '2026-10-26' (такой формат — ключ в workouts и value у <input type=date>)
function toISO(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// '2026-10-26' -> Date (new Date(строку) не используем: он парсит её как UTC)
function fromISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function todayISO() {
  return toISO(new Date());
}

// '2026-10-26' -> '26.10.2026'
function formatDots(iso) {
  return iso.split('-').reverse().join('.');
}

const MONTHS = ['января','февраля','марта','апреля','мая','июня',
                'июля','августа','сентября','октября','ноября','декабря'];
const WEEKDAYS = ['воскресенье','понедельник','вторник','среда',
                  'четверг','пятница','суббота'];

// '2026-10-26' -> '26 октября 2026, понедельник'
function formatDateRu(iso) {
  const d = fromISO(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${WEEKDAYS[d.getDay()]}`;
}

// '2026-10' -> 'Октябрь 2026' (заголовок календаря)
function monthTitle(year, month) {
  const names = ['Январь','Февраль','Март','Апрель','Май','Июнь',
                 'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  return `${names[month]} ${year}`;
}

// Последний день месяца: берём 0-й день следующего месяца
function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

// Дата ровно N месяцев назад (для кнопок периода на странице прогресса)
function monthsAgoISO(n) {
  const now = new Date();
  return toISO(new Date(now.getFullYear(), now.getMonth() - n, now.getDate()));
}


/* ---------- 3. КАЛЕНДАРЬ ---------- */

let calYear, calMonth;          // какой месяц открыт на экране
let selectedDate = todayISO();  // какой день открыт на экране дня

function initCalendar() {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth(); // 0 = январь
}

function renderCalendar() {
  $('#cal-title').textContent = monthTitle(calYear, calMonth);

  const grid = $('#cal-grid');
  grid.innerHTML = '';

  const first = new Date(calYear, calMonth, 1);
  const offset = (first.getDay() + 6) % 7; // сдвиг: понедельник = 0
  const total = daysInMonth(calYear, calMonth);
  const today = todayISO();

  for (let i = 0; i < offset; i++) {
    grid.appendChild(document.createElement('div')); // пустые клетки до 1-го числа
  }

  for (let day = 1; day <= total; day++) {
    const iso = toISO(new Date(calYear, calMonth, day));
    const btn = document.createElement('button');
    btn.className = 'cal-day';
    btn.textContent = day;
    if (iso === today) btn.classList.add('today');

    const workout = state.workouts[iso];
    if (workout && workout.exercises.length > 0) {
      btn.classList.add('has-workout');
      const dot = document.createElement('span');
      dot.className = 'dot';
      btn.appendChild(dot);
    }

    btn.addEventListener('click', () => {
      selectedDate = iso;
      showScreen('day');
    });
    grid.appendChild(btn);
  }
}


/* ---------- ЭКРАНЫ ---------- */

function showScreen(name) {
  $('#screen-calendar').hidden = name !== 'calendar';
  $('#screen-day').hidden = name !== 'day';
  $('#screen-progress').hidden = name !== 'progress';
  if (name === 'calendar') renderCalendar();
  else if (name === 'day') renderDay();
  else renderProgress();
}


/* ---------- 4. ЭКРАН ДНЯ ---------- */

// Шаг и стартовое значение для стрелок у полей подхода:
// кг ± 2.5, повторения и RIR ± 1; при пустом поле — стартовое значение.
const SET_FIELDS = [
  { key: 'weight', placeholder: 'кг',     step: 2.5, start: 20 },
  { key: 'reps',   placeholder: 'повт.',  step: 1,   start: 8 },
  { key: 'rir',    placeholder: 'RIR',    step: 1,   start: 2 },
];

function renderDay() {
  $('#day-title').textContent = formatDateRu(selectedDate);

  const workout = state.workouts[selectedDate];
  const list = $('#ex-list');
  list.innerHTML = ''; // перерисовываем список с нуля

  const isEmpty = !workout || workout.exercises.length === 0;
  $('#day-empty').hidden = !isEmpty;

  $('#day-note').value = workout ? (workout.note || '') : '';
  refreshExercisePicker();

  if (isEmpty) return;
  workout.exercises.forEach((ex, i) => {
    list.appendChild(buildExerciseCard(ex, i));
  });
}

// Заполнить выпадающий список упражнений
function refreshExercisePicker() {
  const select = $('#ex-select');
  select.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— выбери упражнение —';
  select.appendChild(placeholder);

  state.exercises.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });

  const other = document.createElement('option');
  other.value = '__new__';
  other.textContent = '➕ Другое упражнение…';
  select.appendChild(other);
}

// Переключение между «выбрать из списка» и «ввести своё»
function switchExerciseMode(useFreeInput) {
  $('#ex-select').hidden = useFreeInput;
  $('#new-ex-name').hidden = !useFreeInput;
  $('#btn-cancel-new').hidden = !useFreeInput;
  if (useFreeInput) $('#new-ex-name').focus();
}

// Добавление упражнения в день (из списка или своего названия)
function addExercise() {
  let nameValue;
  if (!$('#new-ex-name').hidden) {
    nameValue = $('#new-ex-name').value.trim();
  } else {
    nameValue = $('#ex-select').value;
  }
  if (!nameValue || nameValue === '__new__') {
    alert('Выбери упражнение из списка или введи своё название');
    return;
  }
  getWorkout(selectedDate).exercises.push({ name: nameValue, sets: [] });
  // запоминаем название — теперь оно будет в выпадающем списке
  if (!state.exercises.includes(nameValue)) state.exercises.push(nameValue);
  saveState();

  $('#new-ex-name').value = '';
  $('#ex-select').value = ''; // сброс выбора — после успешного добавления
  switchExerciseMode(false);
  renderDay();
  renderCalendar();
}

// Собирает HTML-карточку одного упражнения вместе с обработчиками
function buildExerciseCard(ex, exIndex) {
  const card = document.createElement('div');
  card.className = 'ex-card';

  // --- шапка: редактируемое название + кнопка удаления ---
  const head = document.createElement('div');
  head.className = 'ex-head';

  const name = document.createElement('input');
  name.className = 'ex-name';
  name.value = ex.name;
  name.addEventListener('input', () => {
    ex.name = name.value;
    saveState();
  });

  const delEx = document.createElement('button');
  delEx.className = 'set-del';
  delEx.textContent = '✕';
  delEx.title = 'Удалить упражнение';
  delEx.addEventListener('click', () => {
    if (!confirm(`Удалить «${ex.name}» со всеми подходами?`)) return;
    state.workouts[selectedDate].exercises.splice(exIndex, 1);
    saveState();
    renderDay();
    renderCalendar(); // возможно, день перестал иметь тренировку
  });

  head.append(name, delEx);
  card.appendChild(head);

  // --- заголовок колонок (над полями ввода) ---
  const setHead = document.createElement('div');
  setHead.className = 'set-head';
  // колонки: номер | − кг + | − повт. + | − RIR + | ✕
  setHead.innerHTML =
    '<span></span><span></span><span>кг</span><span></span>' +
    '<span></span><span>повт.</span><span></span>' +
    '<span></span><span>RIR</span><span></span><span></span>';
  card.appendChild(setHead);

  // --- строки подходов ---
  ex.sets.forEach((set, setIndex) => {
    card.appendChild(buildSetRow(ex, set, setIndex));
  });

  // --- кнопка «+ подход» (новый подход наследует значения последнего) ---
  const addBtn = document.createElement('button');
  addBtn.className = 'add-set-btn';
  addBtn.textContent = '＋ подход';
  addBtn.addEventListener('click', () => {
    const last = ex.sets[ex.sets.length - 1];
    ex.sets.push({
      weight: last ? last.weight : '',
      reps: last ? last.reps : '',
      rir: last ? last.rir : '',
    });
    saveState();
    renderDay();
  });
  card.appendChild(addBtn);

  return card;
}

// Изменить значение поля стрелкой на шаг (с округлением до 0.01,
// чтобы не оставалось хвостов вроде 82.50000000000001)
function stepValue(set, field, dir, input) {
  let v = set[field.key] === '' ? field.start : Number(set[field.key]);
  v = Math.round((v + dir * field.step) * 100) / 100;
  if (v < 0) v = 0;
  set[field.key] = v;
  input.value = v;
  saveState();
}

// Одна строка подхода: номер, три поля со стрелками ±, кнопка удаления
function buildSetRow(ex, set, setIndex) {
  const row = document.createElement('div');
  row.className = 'set-row';

  const num = document.createElement('span');
  num.className = 'set-num';
  num.textContent = setIndex + 1;
  row.appendChild(num);

  for (const field of SET_FIELDS) {
    const minus = document.createElement('button');
    minus.className = 'step-btn';
    minus.textContent = '−';

    const input = document.createElement('input');
    input.type = 'number';
    input.inputMode = 'decimal';
    input.step = 'any';
    input.min = '0';
    input.placeholder = field.placeholder;
    input.value = set[field.key];

    const plus = document.createElement('button');
    plus.className = 'step-btn';
    plus.textContent = '＋';

    minus.addEventListener('click', () => stepValue(set, field, -1, input));
    plus.addEventListener('click', () => stepValue(set, field, +1, input));

    // правка руками тоже работает: каждое изменение сразу пишем в state
    input.addEventListener('input', () => {
      set[field.key] = input.value === '' ? '' : Number(input.value);
      saveState();
    });

    row.append(minus, input, plus);
  }

  const del = document.createElement('button');
  del.className = 'set-del';
  del.textContent = '✕';
  del.addEventListener('click', () => {
    ex.sets.splice(setIndex, 1);
    saveState();
    renderDay();
  });
  row.appendChild(del);
  return row;
}


/* ---------- 5. ЭКСПОРТ ---------- */

// Собрать текстовый отчёт по списку дат ISO (внутри — сортировка)
function buildExportText(dates) {
  dates = [...dates].sort();

  let lines = [`ОТЧЁТ ПО ТРЕНИРОВКАМ`, ``];
  if (dates.length > 0) {
    lines.push(`Период: ${formatDots(dates[0])} — ${formatDots(dates[dates.length - 1])}`);
  }

  let totalSets = 0;
  let workoutsCount = 0;

  for (const iso of dates) {
    const workout = state.workouts[iso];
    if (!workout || workout.exercises.length === 0) continue;
    workoutsCount++;

    lines.push(``, `═══ ${formatDateRu(iso)} ═══`);
    if (workout.note && workout.note.trim()) {
      lines.push(`📝 ${workout.note.trim()}`);
    }

    for (const ex of workout.exercises) {
      lines.push(`${ex.name}:`);
      ex.sets.forEach((set, i) => {
        const w = set.weight !== '' ? `${set.weight} кг` : '—';
        const r = set.reps !== '' ? set.reps : '—';
        const rir = set.rir === '' ? '' : ` (RIR ${set.rir})`;
        lines.push(`   ${i + 1}. ${w} × ${r}${rir}`);
        totalSets++;
      });
      lines.push(`   Итого подходов: ${ex.sets.length}`);
    }
  }

  lines.push(``, `─────────────────────`);
  lines.push(`Тренировок: ${workoutsCount}, всего подходов: ${totalSets}`);
  return lines.join('\n');
}

// Прочитать форму модалки экспорта и вернуть список дат (или null с alert'ом)
function collectExportDates() {
  const mode = document.querySelector('input[name="export-mode"]:checked').value;

  if (mode === 'day') {
    return [$('#export-day-date').value || selectedDate];
  }
  if (mode === 'month') {
    const [y, m] = $('#export-month').value.split('-').map(Number);
    const dates = [];
    for (let d = 1; d <= daysInMonth(y, m); d++) {
      dates.push(toISO(new Date(y, m - 1, d)));
    }
    return dates;
  }
  // период
  const from = $('#export-from').value;
  const to = $('#export-to').value;
  if (!from || !to) {
    alert('Выбери обе даты периода');
    return null;
  }
  // берём все даты между from и to включительно
  // (если пользователь перепутал порядок — меняем местами)
  let [a, b] = [fromISO(from), fromISO(to)];
  if (a > b) [a, b] = [b, a];
  const dates = [];
  for (const d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    dates.push(toISO(d));
  }
  return dates;
}

// Скачать текст как файл (Blob -> временная ссылка -> клик)
function downloadFile(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Копирование в буфер обмена (с запасным способом на случай запретов)
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // запасной путь: невидимое текстовое поле + старая команда копирования
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

function doExportDownload() {
  const dates = collectExportDates();
  if (!dates) return;
  const text = buildExportText(dates);
  downloadFile(`trenirovki_${formatDots(dates[0])}_${formatDots(dates[dates.length - 1])}.txt`,
               text, 'text/plain;charset=utf-8');
  $('#modal-export').hidden = true;
}

async function doExportCopy() {
  const dates = collectExportDates();
  if (!dates) return;
  const ok = await copyToClipboard(buildExportText(dates));
  if (ok) {
    $('#modal-export').hidden = true;
    alert('Скопировано в буфер обмена ✔');
  } else {
    alert('Не удалось скопировать — попробуй скачать файлом');
  }
}


/* ---------- 6. РЕЗЕРВНАЯ КОПИЯ (JSON) ---------- */

function backupExport() {
  const text = JSON.stringify(state, null, 2);
  downloadFile(`gymlog_backup_${todayISO()}.json`, text, 'application/json');
}

function backupImport(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || typeof data !== 'object' || !('workouts' in data)) {
        throw new Error('неверный формат файла');
      }
      if (!confirm('Заменить все текущие данные данными из файла?')) return;
      state = data;
      saveState();
      showScreen('calendar');
      $('#modal-settings').hidden = true;
      alert('Данные восстановлены!');
    } catch (e) {
      alert('Не получилось прочитать файл: ' + e.message);
    }
  };
  reader.readAsText(file, 'utf-8');
}


/* ---------- 7. ПРОГРЕСС ---------- */

// Лучший подход упражнения: максимальный вес, при равном весе — больше повторений
function bestSet(sets) {
  let best = null;
  for (const s of sets) {
    const w = Number(s.weight) || 0;
    const r = Number(s.reps) || 0;
    if (!best ||
        w > (Number(best.weight) || 0) ||
        (w === (Number(best.weight) || 0) && r > (Number(best.reps) || 0))) {
      best = s;
    }
  }
  return best;
}

// Применить одну из быстрых кнопок периода ("месяц", "год", "всё"…)
function setProgressPeriod(months) {
  const to = todayISO();
  const from = months === 'all' ? '0000-01-01' : monthsAgoISO(Number(months));
  $('#progress-from').value = from;
  $('#progress-to').value = to;
  renderProgress();
}

function renderProgress() {
  const from = $('#progress-from').value;
  const to = $('#progress-to').value;
  const list = $('#progress-list');
  const summary = $('#progress-summary');
  list.innerHTML = '';
  if (!from || !to) return;

  // даты в формате 'ГГГГ-ММ-ДД' можно сравнивать как обычные строки
  const dates = Object.keys(state.workouts)
    .filter(iso => iso >= from && iso <= to)
    .sort();

  // имя упражнения -> список его тренировок в периоде (с лучшим подходом)
  const byEx = {};
  let workoutsCount = 0;
  for (const iso of dates) {
    const w = state.workouts[iso];
    if (!w.exercises.length) continue;
    workoutsCount++;
    for (const ex of w.exercises) {
      const best = bestSet(ex.sets);
      if (!best) continue;
      if (!byEx[ex.name]) byEx[ex.name] = [];
      byEx[ex.name].push({ iso, set: best });
    }
  }

  summary.textContent =
    `${formatDots(from)} — ${formatDots(to)} • тренировок: ${workoutsCount} • упражнений: ${Object.keys(byEx).length}`;

  if (workoutsCount === 0) {
    const empty = document.createElement('p');
    empty.className = 'hint';
    empty.textContent = 'За этот период тренировок нет.';
    list.appendChild(empty);
    return;
  }

  const names = Object.keys(byEx).sort();
  for (const name of names) {
    const occ = byEx[name]; // тренировки упражнения по порядку
    const card = document.createElement('div');
    card.className = 'progress-card';

    const head = document.createElement('div');
    head.className = 'progress-name';
    head.textContent = name;
    card.appendChild(head);

    const meta = document.createElement('div');
    meta.className = 'progress-meta';
    meta.textContent = `тренировок в периоде: ${occ.length}`;
    card.appendChild(meta);

    const line = document.createElement('div');
    line.className = 'progress-line';

    if (occ.length < 2) {
      line.classList.add('same');
      const s = occ[0].set;
      line.textContent = `мало данных: ${s.weight !== '' ? s.weight + ' кг' : '—'} × ${s.reps !== '' ? s.reps : '—'}`;
    } else {
      const a = occ[0].set;              // первая тренировка упражнения
      const b = occ[occ.length - 1].set; // последняя
      const w1 = Number(a.weight) || 0;
      const w2 = Number(b.weight) || 0;
      const r1 = Number(a.reps) || 0;
      const r2 = Number(b.reps) || 0;
      const fmt = s => `${s.weight !== '' ? s.weight : '—'} кг × ${s.reps !== '' ? s.reps : '—'}`;

      if (w2 > w1) {
        line.classList.add('up');
        line.textContent = `Вес: ${w1} → ${w2} кг ↑ (+${Math.round((w2 - w1) * 100) / 100} кг)`;
      } else if (w2 < w1) {
        line.classList.add('down');
        line.textContent = `Вес: ${w1} → ${w2} кг ↓`;
      } else if (r2 > r1) {
        line.classList.add('up');
        line.textContent = `Повторения: ${r1} → ${r2} ↑ (+${r2 - r1})`;
      } else if (r2 < r1) {
        line.classList.add('down');
        line.textContent = `Повторения: ${r1} → ${r2} ↓`;
      } else {
        line.classList.add('same');
        line.textContent = `Без изменений: ${fmt(b)}`;
      }
    }
    card.appendChild(line);
    list.appendChild(card);
  }
}


/* ---------- 8. МОДАЛКИ И КНОПКИ ---------- */

function openExportModal(presetDay) {
  // значения по умолчанию: открытый день / открытый месяц / текущий месяц
  $('#export-day-date').value = selectedDate;
  $('#export-month').value =
    `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
  const first = toISO(new Date(calYear, calMonth, 1));
  const last = toISO(new Date(calYear, calMonth, daysInMonth(calYear, calMonth)));
  $('#export-from').value = first;
  $('#export-to').value = last;
  if (presetDay) {
    document.querySelector('input[name="export-mode"][value="day"]').checked = true;
  }
  $('#modal-export').hidden = false;
}

function openSettingsModal() {
  $('#ex-list-editor').value = state.exercises.join('\n');
  $('#modal-settings').hidden = false;
}

function bindEvents() {
  // ----- календарь -----
  $('#cal-prev').addEventListener('click', () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    renderCalendar();
  });
  $('#cal-next').addEventListener('click', () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    renderCalendar();
  });
  // быстрый переход к сегодняшнему дню
  $('#btn-today').addEventListener('click', () => {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
    selectedDate = todayISO();
    showScreen('day');
  });

  // ----- экран дня -----
  $('#btn-back').addEventListener('click', () => showScreen('calendar'));
  $('#btn-add-ex').addEventListener('click', addExercise);
  $('#new-ex-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') addExercise();
  });
  $('#ex-select').addEventListener('change', e => {
    // «➕ Другое упражнение…» переключает на ручной ввод,
    // обычный выбор просто остаётся выбранным до нажатия ＋
    switchExerciseMode(e.target.value === '__new__');
  });
  $('#btn-cancel-new').addEventListener('click', () => switchExerciseMode(false));

  // заметка дня: создаём запись, только если есть текст или сама тренировка
  $('#day-note').addEventListener('input', e => {
    const v = e.target.value;
    if (state.workouts[selectedDate] || v.trim()) {
      getWorkout(selectedDate).note = v;
      saveState();
    }
  });

  // ----- экспорт -----
  $('#btn-export').addEventListener('click', () => openExportModal(false));
  $('#btn-export-day').addEventListener('click', () => openExportModal(true));
  $('#export-cancel').addEventListener('click', () => { $('#modal-export').hidden = true; });
  $('#export-download').addEventListener('click', doExportDownload);
  $('#export-copy').addEventListener('click', doExportCopy);

  // ----- прогресс -----
  $('#btn-progress').addEventListener('click', () => showScreen('progress'));
  $('#btn-progress-back').addEventListener('click', () => showScreen('calendar'));
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      setProgressPeriod(chip.dataset.months);
    });
  });
  // ручная правка дат: снимаем выделение с быстрых кнопок
  for (const id of ['#progress-from', '#progress-to']) {
    $(id).addEventListener('change', () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      renderProgress();
    });
  }

  // ----- настройки -----
  $('#btn-settings').addEventListener('click', openSettingsModal);
  $('#settings-close').addEventListener('click', () => { $('#modal-settings').hidden = true; });

  $('#btn-save-exlist').addEventListener('click', () => {
    state.exercises = $('#ex-list-editor').value
      .split('\n').map(s => s.trim()).filter(Boolean);
    saveState();
    alert('Список сохранён');
  });

  $('#btn-backup-export').addEventListener('click', backupExport);
  $('#btn-backup-import').addEventListener('click', () => $('#backup-file').click());
  $('#backup-file').addEventListener('change', e => {
    if (e.target.files[0]) backupImport(e.target.files[0]);
    e.target.value = '';
  });

  $('#btn-clear-all').addEventListener('click', () => {
    if (confirm('Точно удалить ВСЕ данные без возможности восстановления?')) {
      state = { workouts: {}, exercises: [] };
      saveState();
      showScreen('calendar');
      $('#modal-settings').hidden = true;
    }
  });
}


/* ---------- 9. PWA (офлайн-режим) ---------- */

// Service worker работает только на http(s). Если открыть файл
// напрямую с телефона (file://) — приложение всё равно работает,
// просто без установки иконки и офлайн-кэша.
// window.Capacitor существует только внутри Android-приложения (APK) —
// там офлайн обеспечивает сама оболочка, и service worker не нужен.
if (!window.Capacitor && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(console.error);
  });
}


/* ---------- ЗАПУСК ---------- */

initCalendar();
bindEvents();
renderCalendar();
setProgressPeriod(1); // страница прогресса по умолчанию показывает месяц

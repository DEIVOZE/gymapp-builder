'use strict';

/* ---------- 1. ХРАНИЛИЩЕ ---------- */

const STORAGE_KEY = 'gymlog_v1';

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        workouts: parsed.workouts || {},
        exercises: Array.isArray(parsed.exercises) ? parsed.exercises : []
      };
    }
  } catch (e) {
    console.error('Не удалось прочитать сохранённые данные:', e);
  }
  return { workouts: {}, exercises: [] };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getWorkout(iso) {
  if (!state.workouts[iso]) state.workouts[iso] = { exercises: [] };
  return state.workouts[iso];
}

function $(sel) { return document.querySelector(sel); }


/* ---------- 2. ДАТЫ ---------- */

function toISO(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function fromISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function todayISO() {
  return toISO(new Date());
}

function formatDots(iso) {
  return iso.split('-').reverse().join('.');
}

const MONTHS = ['января','февраля','марта','апреля','мая','июня',
                'июля','августа','сентября','октября','ноября','декабря'];
const WEEKDAYS = ['воскресенье','понедельник','вторник','среда',
                  'четверг','пятница','суббота'];
const WEEKDAYS_SHORT = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];

function formatDateRu(iso) {
  const d = fromISO(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${WEEKDAYS[d.getDay()]}`;
}

function monthTitle(year, month) {
  const names = ['Январь','Февраль','Март','Апрель','Май','Июнь',
                 'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  return `${names[month]} ${year}`;
}

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function monthsAgoISO(n) {
  const now = new Date();
  return toISO(new Date(now.getFullYear(), now.getMonth() - n, now.getDate()));
}


/* ---------- 3. КАЛЕНДАРЬ ---------- */

let calYear, calMonth;
let selectedDate = todayISO();

function initCalendar() {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth();
}

function renderCalendar() {
  $('#cal-title').textContent = monthTitle(calYear, calMonth);

  const grid = $('#cal-grid');
  grid.innerHTML = '';

  const first = new Date(calYear, calMonth, 1);
  const offset = (first.getDay() + 6) % 7;
  const total = daysInMonth(calYear, calMonth);
  const today = todayISO();

  for (let i = 0; i < offset; i++) {
    grid.appendChild(document.createElement('div'));
  }

  for (let day = 1; day <= total; day++) {
    const iso = toISO(new Date(calYear, calMonth, day));
    const btn = document.createElement('button');
    btn.className = 'cal-day';
    btn.textContent = day;
    if (iso === today) btn.classList.add('today');

    const workout = state.workouts[iso];
    if (workout && workout.exercises && workout.exercises.length > 0) {
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


/* ---------- 4. ЭКРАН ДНЯ И ПЕРЕНОС ТРЕНИРОВОК ---------- */

const SET_FIELDS = [
  { key: 'weight', placeholder: 'кг',     step: 2.5, start: 20 },
  { key: 'reps',   placeholder: 'повт.',  step: 1,   start: 8 },
  { key: 'rir',    placeholder: 'RIR',    step: 1,   start: 2 },
];

// Получить список всех дат с непустыми тренировками (от новых к старым), кроме текущего открытого дня
function getPreviousWorkoutDates(excludeIso) {
  return Object.keys(state.workouts)
    .filter(iso => iso !== excludeIso && state.workouts[iso] && state.workouts[iso].exercises && state.workouts[iso].exercises.length > 0)
    .sort((a, b) => (a < b ? 1 : -1));
}

// Найти ближайшую предыдущую тренировку строго до выбранной даты (или самую последнюю вообще)
function getLastWorkoutBefore(targetIso) {
  const allPrev = getPreviousWorkoutDates(targetIso);
  const strictlyBefore = allPrev.filter(iso => iso < targetIso);
  return strictlyBefore.length > 0 ? strictlyBefore[0] : (allPrev[0] || null);
}

// Скопировать упражнения и подходы из одного дня в текущий
function copyWorkoutFrom(sourceIso) {
  const src = state.workouts[sourceIso];
  if (!src || !src.exercises || src.exercises.length === 0) {
    alert('В выбранном дне нет упражнений для переноса.');
    return;
  }

  const current = state.workouts[selectedDate];
  const hasCurrent = current && current.exercises && current.exercises.length > 0;

  let replace = true;
  if (hasCurrent) {
    replace = confirm(
      `В текущем дне уже есть упражнения.\n\n` +
      `Нажми «ОК», чтобы ДОБАВИТЬ упражнения из ${formatDots(sourceIso)} в конец списка.\n` +
      `Нажми «Отмена», если передумал.`
    );
    if (!replace) return;
  }

  // Глубокая копия упражнений и подходов
  const clonedExercises = src.exercises.map(ex => ({
    name: ex.name,
    sets: ex.sets.map(s => ({
      weight: s.weight,
      reps: s.reps,
      rir: s.rir
    }))
  }));

  const target = getWorkout(selectedDate);
  if (hasCurrent) {
    target.exercises.push(...clonedExercises);
  } else {
    target.exercises = clonedExercises;
  }

  // На всякий случай пополняем справочник упражнений
  clonedExercises.forEach(ex => {
    if (ex.name && !state.exercises.includes(ex.name)) {
      state.exercises.push(ex.name);
    }
  });

  saveState();
  renderDay();
  renderCalendar();
}

function renderCopyBar() {
  const bar = $('#copy-workout-bar');
  const prevDates = getPreviousWorkoutDates(selectedDate);

  if (prevDates.length === 0) {
    bar.hidden = true;
    return;
  }

  bar.hidden = false;
  const lastIso = getLastWorkoutBefore(selectedDate);
  const lastBtn = $('#btn-copy-last');
  if (lastIso) {
    const exNames = state.workouts[lastIso].exercises.map(e => e.name).slice(0, 2).join(', ');
    lastBtn.textContent = `⚡ Повторить прошлую (${formatDots(lastIso)}: ${exNames}…)`;
    lastBtn.onclick = () => copyWorkoutFrom(lastIso);
  }

  const sel = $('#copy-source-select');
  sel.innerHTML = '';
  prevDates.slice(0, 25).forEach(iso => {
    const opt = document.createElement('option');
    opt.value = iso;
    const d = fromISO(iso);
    const dayShort = WEEKDAYS_SHORT[d.getDay()];
    const exPreview = state.workouts[iso].exercises.map(e => e.name).join(', ');
    opt.textContent = `${formatDots(iso)} (${dayShort}) — ${exPreview}`;
    sel.appendChild(opt);
  });
}

function renderDay() {
  $('#day-title').textContent = formatDateRu(selectedDate);

  renderCopyBar();

  const workout = state.workouts[selectedDate];
  const list = $('#ex-list');
  list.innerHTML = '';

  const isEmpty = !workout || !workout.exercises || workout.exercises.length === 0;
  $('#day-empty').hidden = !isEmpty;

  $('#day-note').value = workout ? (workout.note || '') : '';
  refreshExercisePicker();
  updateAiReviewButton();

  if (isEmpty) return;
  workout.exercises.forEach((ex, i) => {
    list.appendChild(buildExerciseCard(ex, i));
  });
}

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

function switchExerciseMode(useFreeInput) {
  $('#ex-select').hidden = useFreeInput;
  $('#new-ex-name').hidden = !useFreeInput;
  $('#btn-cancel-new').hidden = !useFreeInput;
  if (useFreeInput) $('#new-ex-name').focus();
}

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
  if (!state.exercises.includes(nameValue)) state.exercises.push(nameValue);
  saveState();

  $('#new-ex-name').value = '';
  $('#ex-select').value = '';
  switchExerciseMode(false);
  renderDay();
  renderCalendar();
}

// Поиск последнего выполнения этого упражнения строго ДО выбранной даты (selectedDate)
function findPreviousExerciseLog(exName, beforeIso) {
  const target = (exName || '').trim().toLowerCase();
  if (!target) return null;

  const prevDates = Object.keys(state.workouts)
    .filter(iso => iso < beforeIso)
    .sort((a, b) => (a < b ? 1 : -1));

  for (const iso of prevDates) {
    const w = state.workouts[iso];
    if (!w || !w.exercises) continue;
    const found = w.exercises.find(
      e => (e.name || '').trim().toLowerCase() === target && e.sets && e.sets.length > 0
    );
    if (found) {
      return { iso, sets: found.sets };
    }
  }
  return null;
}

// Форматирование прошлых подходов:
// Если вес везде один — компактно: "80 кг × 10(RIR 2), 9(RIR 1), 8(RIR 0)"
// Если вес разный — подробно: "75 кг×10(RIR 2) • 80 кг×8(RIR 1)"
function formatPrevSets(sets) {
  if (!sets || sets.length === 0) return '';

  const firstWeight = sets[0].weight;
  const allSameWeight =
    firstWeight !== '' &&
    sets.every(s => String(s.weight) === String(firstWeight));

  if (allSameWeight && sets.length > 1) {
    const repsList = sets.map(s => {
      const r = s.reps !== '' ? s.reps : '—';
      const rir = s.rir !== '' && s.rir !== undefined ? `(RIR ${s.rir})` : '';
      return `${r}${rir}`;
    }).join(', ');
    return `<strong>${firstWeight} кг</strong> × ${repsList}`;
  }

  return sets.map(s => {
    const w = s.weight !== '' ? `${s.weight} кг` : '—';
    const r = s.reps !== '' ? s.reps : '—';
    const rir = s.rir !== '' && s.rir !== undefined ? `(RIR ${s.rir})` : '';
    return `${w}×${r}${rir}`;
  }).join(' • ');
}

function buildExerciseCard(ex, exIndex) {
  const card = document.createElement('div');
  card.className = 'ex-card';

  const head = document.createElement('div');
  head.className = 'ex-head';

  // Выпадающий список для быстрой смены упражнения в любой момент
  const nameSelect = document.createElement('select');
  nameSelect.className = 'ex-name-select';

  function populateNameSelect() {
    nameSelect.innerHTML = '';
    const allNames = [...state.exercises];
    if (ex.name && !allNames.includes(ex.name)) {
      allNames.unshift(ex.name);
    }
    allNames.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n;
      opt.textContent = n;
      if (n === ex.name) opt.selected = true;
      nameSelect.appendChild(opt);
    });
    const customOpt = document.createElement('option');
    customOpt.value = '__custom__';
    customOpt.textContent = '✏️ Переименовать / Своё…';
    nameSelect.appendChild(customOpt);
  }
  populateNameSelect();

  // Поле для ручного переименования (появляется, если выбрали «✏️ Переименовать…»)
  const nameInput = document.createElement('input');
  nameInput.className = 'ex-name';
  nameInput.value = ex.name;
  nameInput.placeholder = 'Название упражнения';
  nameInput.hidden = true;

  const cancelRenameBtn = document.createElement('button');
  cancelRenameBtn.className = 'set-del';
  cancelRenameBtn.textContent = '✓';
  cancelRenameBtn.title = 'Готово';
  cancelRenameBtn.hidden = true;

  const delEx = document.createElement('button');
  delEx.className = 'set-del';
  delEx.textContent = '✕';
  delEx.title = 'Удалить упражнение';
  delEx.addEventListener('click', () => {
    if (!confirm(`Удалить «${ex.name}» со всеми подходами?`)) return;
    state.workouts[selectedDate].exercises.splice(exIndex, 1);
    saveState();
    renderDay();
    renderCalendar();
  });

  head.append(nameSelect, nameInput, cancelRenameBtn, delEx);
  card.appendChild(head);

  // --- Блок подсказки прошлого результата ---
  const prevHint = document.createElement('div');
  prevHint.className = 'ex-prev-hint';

  function updatePrevHint() {
    const prev = findPreviousExerciseLog(ex.name, selectedDate);
    if (!prev) {
      prevHint.hidden = true;
      prevHint.innerHTML = '';
    } else {
      prevHint.hidden = false;
      prevHint.innerHTML = `В прошлый раз <strong>(${formatDots(prev.iso)})</strong>: ${formatPrevSets(prev.sets)}`;
    }
  }

  updatePrevHint();
  card.appendChild(prevHint);

  // Обработка выбора другого упражнения из выпадающего списка
  nameSelect.addEventListener('change', () => {
    if (nameSelect.value === '__custom__') {
      nameSelect.hidden = true;
      nameInput.hidden = false;
      cancelRenameBtn.hidden = false;
      nameInput.value = ex.name;
      nameInput.focus();
      nameInput.select();
      return;
    }
    ex.name = nameSelect.value;
    saveState();
    updatePrevHint();
  });

  // Завершение ручного переименования
  function finishRename() {
    const val = nameInput.value.trim();
    if (val) {
      ex.name = val;
      if (!state.exercises.includes(val)) {
        state.exercises.push(val);
      }
      saveState();
      refreshExercisePicker();
    }
    populateNameSelect();
    updatePrevHint();
    nameInput.hidden = true;
    cancelRenameBtn.hidden = true;
    nameSelect.hidden = false;
  }

  cancelRenameBtn.addEventListener('click', finishRename);
  nameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') finishRename();
  });
  nameInput.addEventListener('blur', () => {
    // небольшая задержка, чтобы клик по кнопке ✓ не конфликтовал с blur
    setTimeout(() => {
      if (!nameInput.hidden) finishRename();
    }, 150);
  });

  // --- Заголовок колонок ---
  const setHead = document.createElement('div');
  setHead.className = 'set-head';
  setHead.innerHTML =
    '<span></span><span></span><span>кг</span><span></span>' +
    '<span></span><span>повт.</span><span></span>' +
    '<span></span><span>RIR</span><span></span><span></span>';
  card.appendChild(setHead);

  // --- Строки подходов ---
  ex.sets.forEach((set, setIndex) => {
    card.appendChild(buildSetRow(ex, set, setIndex));
  });

  // --- Умная кнопка «+ подход» ---
  const addBtn = document.createElement('button');
  addBtn.className = 'add-set-btn';
  addBtn.textContent = '＋ подход';
  addBtn.addEventListener('click', () => {
    const newIndex = ex.sets.length; // индекс добавляемого подхода (0, 1, 2...)
    const lastToday = ex.sets[ex.sets.length - 1];
    const prev = findPreviousExerciseLog(ex.name, selectedDate);
    const prevMatchingSet = prev && prev.sets[newIndex] ? prev.sets[newIndex] : null;
    const prevPrevSet = prev && newIndex > 0 && prev.sets[newIndex - 1] ? prev.sets[newIndex - 1] : null;

    let nextWeight = '';
    let nextReps = '';
    let nextRir = '';

    if (newIndex === 0) {
      // 1-й подход: берем 1-й подход из прошлой тренировки
      if (prevMatchingSet) {
        nextWeight = prevMatchingSet.weight;
        nextReps = prevMatchingSet.reps;
        nextRir = prevMatchingSet.rir;
      }
    } else if (prevMatchingSet && prevPrevSet) {
      // Для 2-го, 3-го и т.д. подходов:
      // Проверяем, менялся ли вес в прошлый раз между (N-1)-м и N-м подходом (пирамида / дроп-сет)
      const weightChangedLastTime = String(prevMatchingSet.weight) !== String(prevPrevSet.weight);
      if (weightChangedLastTime) {
        // Если в прошлый раз менял вес во 2-м/3-м подходе — берем схему прошлого раза
        nextWeight = prevMatchingSet.weight;
      } else {
        // Если в прошлый раз рабочий вес был ровный — сохраняем сегодняшний вес из предыдущего подхода
        nextWeight = lastToday.weight;
      }
      nextReps = prevMatchingSet.reps !== '' ? prevMatchingSet.reps : lastToday.reps;
      nextRir = prevMatchingSet.rir !== '' ? prevMatchingSet.rir : lastToday.rir;
    } else if (lastToday) {
      // Если в прошлый раз подходов было меньше, чем сегодня — просто копируем последний сегодняшний
      nextWeight = lastToday.weight;
      nextReps = lastToday.reps;
      nextRir = lastToday.rir;
    }

    ex.sets.push({
      weight: nextWeight,
      reps: nextReps,
      rir: nextRir,
    });
    saveState();
    renderDay();
  });
  card.appendChild(addBtn);

  return card;
}

function stepValue(set, field, dir, input) {
  let v = set[field.key] === '' ? field.start : Number(set[field.key]);
  v = Math.round((v + dir * field.step) * 100) / 100;
  if (v < 0) v = 0;
  set[field.key] = v;
  input.value = v;
  saveState();
}

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


/* ---------- 5. ЭКСПОРТ И ФАЙЛЫ (С ПОДДЕРЖКОЙ ANDROID APK) ---------- */

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
    if (!workout || !workout.exercises || workout.exercises.length === 0) continue;
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
  const from = $('#export-from').value;
  const to = $('#export-to').value;
  if (!from || !to) {
    alert('Выбери обе даты периода');
    return null;
  }
  let [a, b] = [fromISO(from), fromISO(to)];
  if (a > b) [a, b] = [b, a];
  const dates = [];
  for (const d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    dates.push(toISO(d));
  }
  return dates;
}

// Умное сохранение файла: Web Share API для APK/телефона + fallback на скачивание или буфер
async function shareOrDownloadFile(filename, text, mime) {
  // 1. Пробуем системное меню «Поделиться файлом» (отлично работает на Android)
  try {
    if (navigator.canShare && typeof File !== 'undefined') {
      const file = new File([text], filename, { type: mime });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: filename,
          files: [file]
        });
        return;
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') return; // пользователь сам закрыл шторку «Поделиться»
    console.warn('Share File не сработал, пробуем дальше:', err);
  }

  // 2. Если мы в APK (Capacitor) и шаринг файлом не поддерживается — шарим как текст
  if (window.Capacitor && navigator.share) {
    try {
      await navigator.share({ title: filename, text: text });
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }

  // 3. Классическое скачивание для браузера + страховка копированием в буфер
  try {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);

    // Если это внутри APK, обычный <a download> может молча проигнорироваться WebView,
    // поэтому дублируем в буфер обмена и предупреждаем
    if (window.Capacitor) {
      await copyToClipboard(text);
      alert('В APK прямая загрузка может блокироваться системой, поэтому данные также скопированы в буфер обмена 📋');
    }
  } catch (e) {
    const ok = await copyToClipboard(text);
    if (ok) {
      alert('Не удалось сохранить файлом, но данные скопированы в буфер обмена 📋');
    } else {
      alert('Ошибка при сохранении: ' + e.message);
    }
  }
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

async function doExportDownload() {
  const dates = collectExportDates();
  if (!dates) return;
  const text = buildExportText(dates);
  await shareOrDownloadFile(
    `trenirovki_${formatDots(dates[0])}_${formatDots(dates[dates.length - 1])}.txt`,
    text,
    'text/plain;charset=utf-8'
  );
  $('#modal-export').hidden = true;
}

async function doExportCopy() {
  const dates = collectExportDates();
  if (!dates) return;
  const ok = await copyToClipboard(buildExportText(dates));
  if (ok) {
    $('#modal-export').hidden = true;
    alert('Отчёт скопирован в буфер обмена ✔');
  } else {
    alert('Не удалось скопировать');
  }
}


/* ---------- 6. РЕЗЕРВНАЯ КОПИЯ (JSON) ---------- */

function getBackupJsonString() {
  return JSON.stringify(state, null, 2);
}

async function backupExportFile() {
  const text = getBackupJsonString();
  $('#backup-json-area').value = text;
  await shareOrDownloadFile(`gymlog_backup_${todayISO()}.json`, text, 'application/json');
}

async function backupCopyClipboard() {
  const text = getBackupJsonString();
  $('#backup-json-area').value = text;
  const ok = await copyToClipboard(text);
  if (ok) {
    alert('JSON-код резервной копии скопирован в буфер обмена ✔\nМожешь сохранить его в Заметки или Избранное в Telegram.');
  } else {
    alert('Не удалось скопировать автоматически — скопируй текст из поля ниже вручную.');
  }
}

function restoreFromJsonString(rawJson) {
  try {
    const clean = (rawJson || '').trim();
    if (!clean) {
      alert('Сначала вставь JSON-код резервной копии в текстовое поле!');
      return;
    }
    const data = JSON.parse(clean);
    if (!data || typeof data !== 'object' || !('workouts' in data) || typeof data.workouts !== 'object') {
      throw new Error('в JSON нет объекта workouts');
    }
    if (!confirm('Заменить все текущие данные данными из резервной копии?')) return;

    state = {
      workouts: data.workouts || {},
      exercises: Array.isArray(data.exercises) ? data.exercises : []
    };
    saveState();
    showScreen('calendar');
    $('#modal-settings').hidden = true;
    alert('Данные успешно восстановлены ✔');
  } catch (e) {
    alert('Ошибка формата JSON: ' + e.message);
  }
}

function backupImportFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    restoreFromJsonString(reader.result);
  };
  reader.onerror = () => {
    alert('Не удалось прочитать выбранный файл.');
  };
  reader.readAsText(file, 'utf-8');
}


/* ---------- 6.1. AI-ТРЕНЕР (OpenAI-совместимый API) ---------- */

const AI_CFG_KEY = 'gymlog_ai_cfg';

// Резервный промпт, если prompt.md не удалось загрузить (например, file://)
const SYSTEM_PROMPT_FALLBACK =
  'Ты опытный тренер по гипертрофии и силовым. Сравни сегодняшнюю тренировку ' +
  'с предыдущей по каждому упражнению (вес, повторы, RIR). Дай краткий вердикт ' +
  'без воды, где есть прогресс и где пора менять нагрузку. Отвечай списком, ' +
  'максимум 1500 символов.';

let cachedSystemPrompt = null;

// Читаем prompt.md один раз за сессию; при ошибке используем fallback
async function getSystemPrompt() {
  if (cachedSystemPrompt !== null) return cachedSystemPrompt;
  try {
    const res = await fetch('./prompt.md');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = (await res.text()).trim();
    if (!text) throw new Error('файл пуст');
    cachedSystemPrompt = text;
  } catch (e) {
    console.warn('Не удалось загрузить prompt.md, использую резервный промпт:', e);
    return SYSTEM_PROMPT_FALLBACK;
  }
  return cachedSystemPrompt;
}

// Резервный промпт для анализа периода
const PERIOD_PROMPT_FALLBACK =
  'Ты аналитик силовых тренировок. Оцени прогресс за период: регулярность, ' +
  'рост, плато и откаты по упражнениям, объём и восстановление. Дай конкретный ' +
  'план на следующий цикл. Пиши списком, без воды.';

let cachedPeriodPrompt = null;

async function getPeriodSystemPrompt() {
  if (cachedPeriodPrompt !== null) return cachedPeriodPrompt;
  try {
    const res = await fetch('./prompt-period.md');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = (await res.text()).trim();
    if (!text) throw new Error('файл пуст');
    cachedPeriodPrompt = text;
  } catch (e) {
    console.warn('Не удалось загрузить prompt-period.md, использую резервный промпт:', e);
    return PERIOD_PROMPT_FALLBACK;
  }
  return cachedPeriodPrompt;
}

// Настройки AI живут отдельно от тренировок: ключ не попадает в JSON-бэкап
function loadAiConfig() {
  try {
    const raw = localStorage.getItem(AI_CFG_KEY);
    if (raw) {
      const cfg = JSON.parse(raw);
      return {
        baseUrl: typeof cfg.baseUrl === 'string' ? cfg.baseUrl : '',
        apiKey: typeof cfg.apiKey === 'string' ? cfg.apiKey : '',
        model: typeof cfg.model === 'string' ? cfg.model : ''
      };
    }
  } catch (e) {
    console.error('Не удалось прочитать настройки AI:', e);
  }
  return { baseUrl: '', apiKey: '', model: '' };
}

function saveAiConfig(cfg) {
  try {
    localStorage.setItem(AI_CFG_KEY, JSON.stringify(cfg));
    return true;
  } catch (e) {
    console.error('Не удалось сохранить настройки AI:', e);
    return false;
  }
}

function fillAiConfigForm() {
  const cfg = loadAiConfig();
  $('#ai-base-url').value = cfg.baseUrl;
  $('#ai-api-key').value = cfg.apiKey;
  $('#ai-model').value = cfg.model;
}

// Компактный подход для экономии токенов: 80кг×10(RIR 1)
function formatSetCompact(set) {
  const w = set.weight !== '' && set.weight !== undefined ? `${set.weight}кг` : '—';
  const r = set.reps !== '' && set.reps !== undefined ? set.reps : '—';
  const rir = set.rir !== '' && set.rir !== undefined ? `(RIR ${set.rir})` : '';
  return `${w}×${r}${rir}`;
}

// Минимальный контекст: только текущий день + одно ближайшее прошлое по упражнению
function buildAiPayload() {
  const workout = state.workouts[selectedDate];
  const lines = [];

  if (workout.note && workout.note.trim()) {
    lines.push(`Заметка дня: ${workout.note.trim()}`);
  }

  lines.push(`Тренировка ${formatDots(selectedDate)}:`);
  workout.exercises.forEach(ex => {
    if (!ex.sets || ex.sets.length === 0) return;
    const todaySets = ex.sets.map(formatSetCompact).join(', ');
    const prev = findPreviousExerciseLog(ex.name, selectedDate);
    const prevText = prev
      ? `Пред. [${formatDots(prev.iso)}]: ${prev.sets.map(formatSetCompact).join(', ')}`
      : 'Пред.: нет данных';
    lines.push(`- ${ex.name}: ${todaySets}. ${prevText}`);
  });

  return lines.join('\n');
}

// Экранирование + компактный разбор Markdown → безопасный HTML
function renderMarkdownToHtml(rawText) {
  const escapeHtml = s => s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  let text = escapeHtml(String(rawText || '')).replace(/\r\n?/g, '\n');

  // Инлайн-код прячем, чтобы * и ** внутри него не превращались в разметку
  const codes = [];
  text = text.replace(/`([^`\n]+)`/g, (m, code) => {
    codes.push(code);
    return `\u0000CODE${codes.length - 1}\u0000`;
  });

  const inline = s => s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/\u0000CODE(\d+)\u0000/g, (m, i) =>
      `<code class="md-code">${codes[Number(i)]}</code>`);

  const out = [];
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    out.push(`<p class="md-p">${paragraph.map(inline).join('<br>')}</p>`);
    paragraph = [];
  };

  text.split('\n').forEach(rawLine => {
    const line = rawLine.trim();

    if (!line) {           // пустая строка = новый абзац
      flushParagraph();
      return;
    }

    const heading = line.match(/^#{1,3}\s+(.*)$/);
    if (heading) {
      flushParagraph();
      out.push(`<h4 class="md-h">${inline(heading[1])}</h4>`);
      return;
    }

    const item = line.match(/^(?:[-*]|\d+\.)\s+(.*)$/);
    if (item) {
      flushParagraph();
      out.push(`<div class="md-li">${inline(item[1])}</div>`);
      return;
    }

    paragraph.push(line);
  });
  flushParagraph();

  return out.join('');
}

// Кнопка на экране дня: «открыть готовый разбор» или «запросить новый»
function updateAiReviewButton() {
  const workout = state.workouts[selectedDate];
  const btn = $('#btn-ai-review');
  btn.textContent = workout && workout.aiReview
    ? '📋 Открыть разбор тренировки'
    : '🤖 Оценить тренировку';
}

function setAiReviewBodyText(text, isError) {
  const body = $('#ai-review-body');
  body.classList.toggle('error', !!isError);
  body.textContent = text || '';
}

function renderAiReview(review) {
  const body = $('#ai-review-body');
  body.classList.remove('error');
  body.innerHTML = renderMarkdownToHtml(review);
}

// Контекст открытой модалки: дневной разбор или анализ периода
let aiReviewContext = 'day';
let aiReviewPeriod = null;

function setAiReviewContext(context, fromIso, toIso) {
  aiReviewContext = context;
  aiReviewPeriod = context === 'period' ? { fromIso, toIso } : null;
  $('#ai-review-title').textContent =
    context === 'period' ? 'Разбор периода' : 'Разбор тренера';
}

function openAiReviewModal() {
  const workout = state.workouts[selectedDate];
  if (!workout || !workout.aiReview) return;
  setAiReviewContext('day');
  renderAiReview(workout.aiReview);
  $('#modal-ai-review').hidden = false;
}

function closeAiReviewModal() {
  $('#modal-ai-review').hidden = true;
}

// 🗑 — удалить разбор из дня (иначе он снова появится при открытии дня)
function deleteAiReview() {
  const workout = state.workouts[selectedDate];
  if (!workout || !workout.aiReview) {
    closeAiReviewModal();
    return;
  }
  if (!confirm('Удалить разбор тренера для этого дня?')) return;
  delete workout.aiReview;
  saveState();
  closeAiReviewModal();
  updateAiReviewButton();
}

async function requestWorkoutReview() {
  const cfg = loadAiConfig();
  const baseUrl = (cfg.baseUrl || '').trim();
  const apiKey = (cfg.apiKey || '').trim();
  const model = (cfg.model || '').trim();

  if (!baseUrl || !apiKey || !model) {
    alert('Сначала заполни настройки AI: Base URL, API Key и модель.');
    openSettingsModal();
    return;
  }

  const workout = state.workouts[selectedDate];
  const hasSets = workout && Array.isArray(workout.exercises) &&
    workout.exercises.some(ex => ex.sets && ex.sets.length > 0);
  if (!hasSets) {
    alert('В этом дне пока нет упражнений с подходами — нечего оценивать.');
    return;
  }

  const btn = $('#btn-ai-review');
  const refreshBtn = $('#ai-review-refresh');
  if (btn.disabled) return;

  btn.disabled = true;
  refreshBtn.disabled = true;
  btn.textContent = '⏳ Анализирую...';
  setAiReviewContext('day');
  $('#modal-ai-review').hidden = false;
  setAiReviewBodyText('⏳ Анализирую тренировку…', false);

  try {
    const systemPrompt = await getSystemPrompt();
    const cleanUrl = baseUrl.replace(/\/+$/, '');
    const res = await fetch(`${cleanUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: buildAiPayload() }
        ],
        temperature: 0.3
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      setAiReviewBodyText(`Ошибка API (${res.status}):\n${errText}`.trim(), true);
      return;
    }

    const data = await res.json();
    const content = data && data.choices && data.choices[0] &&
      data.choices[0].message && data.choices[0].message.content;

    if (!content || !String(content).trim()) {
      setAiReviewBodyText('API вернул пустой ответ. Попробуй другую модель или повтори запрос.', true);
      return;
    }

    const review = String(content).trim();
    getWorkout(selectedDate).aiReview = review;
    saveState();
    renderAiReview(review);
    updateAiReviewButton();
  } catch (e) {
    setAiReviewBodyText(`Не удалось получить ответ от AI:\n${e.message}`, true);
  } finally {
    btn.disabled = false;
    refreshBtn.disabled = false;
    updateAiReviewButton();
  }
}


/* ---------- 6.2. AI-РАЗБОР ПЕРИОДА ---------- */

const AI_PERIOD_CACHE_KEY = 'gymlog_ai_period_cache';

function loadPeriodAiCache() {
  try {
    const raw = localStorage.getItem(AI_PERIOD_CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    console.error('Не удалось прочитать кэш AI-разборов периода:', e);
    return {};
  }
}

function getCachedPeriodReview(fromIso, toIso) {
  const value = loadPeriodAiCache()[`${fromIso}_${toIso}`];
  return typeof value === 'string' ? value : '';
}

function cachePeriodReview(fromIso, toIso, review) {
  const cache = loadPeriodAiCache();
  cache[`${fromIso}_${toIso}`] = review;
  try {
    localStorage.setItem(AI_PERIOD_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.error('Не удалось сохранить кэш AI-разбора периода:', e);
  }
}

function dropPeriodReview(fromIso, toIso) {
  const cache = loadPeriodAiCache();
  delete cache[`${fromIso}_${toIso}`];
  try {
    localStorage.setItem(AI_PERIOD_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.error('Не удалось обновить кэш AI-разборов периода:', e);
  }
}

// Компактная сводка периода: без сырых подходов за каждый день
function buildPeriodAiPayload(fromIso, toIso) {
  const dates = Object.keys(state.workouts)
    .filter(iso => iso >= fromIso && iso <= toIso)
    .sort()
    .filter(iso => {
      const w = state.workouts[iso];
      return w && Array.isArray(w.exercises) &&
        w.exercises.some(ex => ex.sets && ex.sets.length > 0);
    });

  if (dates.length < 2) {
    alert('Для анализа периода нужно минимум 2 тренировки');
    return null;
  }

  const lines = [
    `Период: ${formatDots(fromIso)} — ${formatDots(toIso)}`,
    `Тренировок: ${dates.length}`,
    `Даты: ${dates.map(formatDots).join(', ')}`,
    '',
    'Упражнения:'
  ];

  const byEx = {};
  const notes = [];

  for (const iso of dates) {
    const workout = state.workouts[iso];
    if (workout.note && workout.note.trim()) {
      notes.push(`[${formatDots(iso).slice(0, 5)}]: ${workout.note.trim()}`);
    }
    for (const ex of workout.exercises) {
      if (!ex.sets || ex.sets.length === 0) continue;
      if (!byEx[ex.name]) byEx[ex.name] = [];
      byEx[ex.name].push({ iso, sets: ex.sets });
    }
  }

  const fmtSets = sets => sets.map(formatSetCompact).join(', ');

  Object.keys(byEx).sort().forEach(name => {
    const occ = byEx[name];
    const first = occ[0];
    const last = occ[occ.length - 1];

    let best = null;
    for (const item of occ) {
      const candidate = bestSet(item.sets);
      if (!candidate) continue;
      const w = Number(candidate.weight) || 0;
      const r = Number(candidate.reps) || 0;
      if (!best || w > best.w || (w === best.w && r > best.r)) {
        best = { w, r, set: candidate };
      }
    }

    lines.push(
      `- ${name}: тренировок ${occ.length}; ` +
      `первый [${formatDots(first.iso)}]: ${fmtSets(first.sets)}; ` +
      `лучший: ${best ? formatSetCompact(best.set) : '—'}; ` +
      `последний [${formatDots(last.iso)}]: ${fmtSets(last.sets)}`
    );
  });

  if (notes.length) {
    lines.push('', 'Заметки:');
    notes.forEach(note => lines.push(`- ${note}`));
  }

  return lines.join('\n');
}

function openPeriodAiReviewModal(review, fromIso, toIso) {
  setAiReviewContext('period', fromIso, toIso);
  renderAiReview(review);
  $('#modal-ai-review').hidden = false;
}

async function requestPeriodReview(force) {
  const cfg = loadAiConfig();
  const baseUrl = (cfg.baseUrl || '').trim();
  const apiKey = (cfg.apiKey || '').trim();
  const model = (cfg.model || '').trim();

  if (!baseUrl || !apiKey || !model) {
    alert('Сначала заполни настройки AI: Base URL, API Key и модель.');
    openSettingsModal();
    return;
  }

  let from = $('#progress-from').value;
  let to = $('#progress-to').value;
  if (!from || !to) {
    alert('Выбери обе даты периода');
    return;
  }
  if (from > to) [from, to] = [to, from];

  if (!force) {
    const cached = getCachedPeriodReview(from, to);
    if (cached) {
      openPeriodAiReviewModal(cached, from, to);
      return;
    }
  }

  const payload = buildPeriodAiPayload(from, to);
  if (!payload) return;

  const btn = $('#btn-ai-period-review');
  const refreshBtn = $('#ai-review-refresh');
  if (btn.disabled) return;

  const btnText = btn.textContent;
  btn.disabled = true;
  refreshBtn.disabled = true;
  btn.textContent = '⏳ Анализирую...';
  setAiReviewContext('period', from, to);
  $('#modal-ai-review').hidden = false;
  setAiReviewBodyText('⏳ Анализирую прогресс за период…', false);

  try {
    const systemPrompt = await getPeriodSystemPrompt();
    const cleanUrl = baseUrl.replace(/\/+$/, '');
    const res = await fetch(`${cleanUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: payload }
        ],
        temperature: 0.3
      })
    });

    if (!res.ok) {
      const errText = await res.text();
      setAiReviewBodyText(`Ошибка API (${res.status}):\n${errText}`.trim(), true);
      return;
    }

    const data = await res.json();
    const content = data && data.choices && data.choices[0] &&
      data.choices[0].message && data.choices[0].message.content;

    if (!content || !String(content).trim()) {
      setAiReviewBodyText('API вернул пустой ответ. Попробуй другую модель или повтори запрос.', true);
      return;
    }

    const review = String(content).trim();
    cachePeriodReview(from, to, review);
    renderAiReview(review);
  } catch (e) {
    setAiReviewBodyText(`Не удалось получить ответ от AI:\n${e.message}`, true);
  } finally {
    btn.disabled = false;
    refreshBtn.disabled = false;
    btn.textContent = btnText;
  }
}

function refreshCurrentAiReview() {
  if (aiReviewContext === 'period' && aiReviewPeriod) {
    requestPeriodReview(true);
  } else {
    requestWorkoutReview();
  }
}

function deleteCurrentAiReview() {
  if (aiReviewContext === 'period' && aiReviewPeriod) {
    if (!confirm('Удалить разбор прогресса за этот период?')) return;
    dropPeriodReview(aiReviewPeriod.fromIso, aiReviewPeriod.toIso);
    closeAiReviewModal();
    return;
  }
  deleteAiReview();
}


/* ---------- 7. ПРОГРЕСС ---------- */

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

  const dates = Object.keys(state.workouts)
    .filter(iso => iso >= from && iso <= to)
    .sort();

  const byEx = {};
  let workoutsCount = 0;
  for (const iso of dates) {
    const w = state.workouts[iso];
    if (!w || !w.exercises || !w.exercises.length) continue;
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
    const occ = byEx[name];
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
      const a = occ[0].set;
      const b = occ[occ.length - 1].set;
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
  $('#backup-json-area').value = '';
  fillAiConfigForm();
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
    switchExerciseMode(e.target.value === '__new__');
  });
  $('#btn-cancel-new').addEventListener('click', () => switchExerciseMode(false));

  // Кнопка переноса выбранной из выпадающего списка тренировки
  $('#btn-copy-selected').addEventListener('click', () => {
    const sourceIso = $('#copy-source-select').value;
    if (sourceIso) copyWorkoutFrom(sourceIso);
  });

  $('#day-note').addEventListener('input', e => {
    const v = e.target.value;
    if (state.workouts[selectedDate] || v.trim()) {
      getWorkout(selectedDate).note = v;
      saveState();
    }
  });

  // ----- AI-тренер -----
  $('#btn-ai-review').addEventListener('click', () => {
    const workout = state.workouts[selectedDate];
    if (workout && workout.aiReview) openAiReviewModal();
    else requestWorkoutReview();
  });
  $('#ai-review-refresh').addEventListener('click', refreshCurrentAiReview);
  $('#ai-review-delete').addEventListener('click', deleteCurrentAiReview);
  $('#ai-review-close').addEventListener('click', closeAiReviewModal);

  $('#btn-save-ai').addEventListener('click', () => {
    const cfg = {
      baseUrl: $('#ai-base-url').value.trim(),
      apiKey: $('#ai-api-key').value.trim(),
      model: $('#ai-model').value.trim()
    };
    if (!saveAiConfig(cfg)) {
      alert('Не удалось сохранить настройки AI.');
      return;
    }
    $('#ai-api-key').value = cfg.apiKey;
    alert('Настройки AI сохранены ✔');
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
  for (const id of ['#progress-from', '#progress-to']) {
    $(id).addEventListener('change', () => {
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      renderProgress();
    });
  }

  $('#btn-ai-period-review').addEventListener('click', () => requestPeriodReview(false));

  // ----- настройки и бэкап -----
  $('#btn-settings').addEventListener('click', openSettingsModal);
  $('#settings-close').addEventListener('click', () => { $('#modal-settings').hidden = true; });

  $('#btn-save-exlist').addEventListener('click', () => {
    state.exercises = $('#ex-list-editor').value
      .split('\n').map(s => s.trim()).filter(Boolean);
    saveState();
    alert('Список сохранён');
  });

  $('#btn-backup-copy').addEventListener('click', backupCopyClipboard);
  $('#btn-backup-export').addEventListener('click', backupExportFile);
  $('#btn-backup-paste-restore').addEventListener('click', () => {
    restoreFromJsonString($('#backup-json-area').value);
  });
  $('#btn-backup-import').addEventListener('click', () => $('#backup-file').click());
  $('#backup-file').addEventListener('change', e => {
    if (e.target.files[0]) backupImportFile(e.target.files[0]);
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


/* ---------- 9. PWA ---------- */

if (!window.Capacitor && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(console.error);
  });
}


/* ---------- ЗАПУСК ---------- */

initCalendar();
bindEvents();
renderCalendar();
setProgressPeriod(1);
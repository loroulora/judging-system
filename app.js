// === КОНФИГ ФИГУР ===
const CATEGORIES_WITH_FIGURES = {
    "category1": [
        "Кувырок назад",
        "Парус", 
        "Поворот 360", 
        "Волна"
    ],
    "under10": [  
        "Балетная нога",
        "Барракуда",
        "Квадрат",
        "Цветок"
    ],
    "under12": [
        "Балетная нога",
        "Барракуда", 
        "Ариана",
        "Башня"
    ]
};
// === КОНЕЦ КОНФИГА ===
// === ФУНКЦИЯ ОБНОВЛЕНИЯ ФИГУР ===
function updateFigures(selectedCategoryId) {
    const figureSelect = document.getElementById('figureSelect');
    const figureGroup = document.getElementById('figureGroup');
    
    // Очищаем
    figureSelect.innerHTML = '<option value="">-- Выберите фигуру --</option>';
    
    if (CATEGORIES_WITH_FIGURES[selectedCategoryId]) {
        // Добавляем фигуры
        CATEGORIES_WITH_FIGURES[selectedCategoryId].forEach(figureName => {
            const option = document.createElement('option');
            option.value = figureName.toLowerCase().replace(/\s+/g, '_');
            option.textContent = figureName;
            figureSelect.appendChild(option);
        });
        
        figureGroup.style.display = 'block';
    } else {
        figureGroup.style.display = 'none';
        figureSelect.value = "";
    }
}
// === КОНЕЦ ФУНКЦИИ ===

document.addEventListener('DOMContentLoaded', function () {
  // =========================
  // CONFIG
  // =========================
  const API_URL = 'https://script.google.com/macros/s/AKfycbyO4MXymmhXZoNnDa1Sxss2sVsi4gQLhPLWT8MJfUZuAHb8k2t5B24MomehklkLKBsU/exec';

  const STORAGE_KEYS = {
    JUDGE: 'judging_system_judge',
    CATEGORY: 'judging_system_category',
    FIGURE: 'judging_system_figure',
    CURRENT_INDEX: 'judging_system_current_index',
    PARTICIPANTS: 'judging_system_participants',

    // ВАЖНО: теперь оценки храним по категориям
    SCORES_BY_CATEGORY: 'judging_system_scores_by_category',
  };

  // Кеш (можно выключить при дебаге)
  const cache = {
    enabled: true,
    judges: null,
    participants: {}, // categoryText -> participants[]
    lastCacheTime: { judges: 0, participants: {} },
    ttl: 5 * 60 * 1000,
  };

  // Категории, где требуется выбор фигуры (по ТЕКСТУ option)
  const categoriesWithFigures = ['Фигуры «Категория 1»', 'Фигуры «10 лет и моложе»', 'Фигуры «12 лет и моложе»'];

  // =========================
  // STATE
  // =========================
  let judges = [];
  let participants = [];
  let currentIndex = 0;

  let selectedCategory = '';
  let selectedFigure = '';
  let selectedJudge = '';
  let isParticipantsListVisible = false;

  // Оценки по категориям:
  // scoresByCategory[categoryText][participantId] = {score, judgeId, category, figure, timestamp, isFirstTime}
  let scoresByCategory = {}; // plain object для удобного хранения в localStorage

  let isAutoSending = false;
  let autoSendTimer = null;

  // =========================
  // DOM
  // =========================
  const judgeSelect = document.getElementById('judgeSelect');
  const categorySelect = document.getElementById('categorySelect');
  const figureGroup = document.getElementById('figureGroup');
  const figureSelect = document.getElementById('figureSelect');

  const startNumberElement = document.getElementById('startNumber');
  const fullNameElement = document.getElementById('fullName');

  const scoreInput = document.getElementById('scoreInput');
  const submitBtn = document.getElementById('submitBtn');
  const skipBtn = document.getElementById('skipBtn');
  const sendScoresBtn = document.getElementById('sendScoresBtn');

  const statusMessage = document.getElementById('statusMessage');
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');

  const participantsList = document.getElementById('participantsList');
  const participantsListContainer = document.getElementById('participantsListContainer');
  const toggleParticipantsBtn = document.getElementById('toggleParticipantsBtn');

  const remainingCountEl = document.getElementById('remainingCount');
  const evaluatedCountEl = document.getElementById('evaluatedCount');

  const resetSessionBtn = document.getElementById('resetSessionBtn');

  // =========================
  // API HELPER (POST form-urlencoded)
  // =========================
  async function apiRequest(action, params = {}, timeoutMs = 45000) {
    const body = new URLSearchParams({ action, ...params });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body,
        signal: controller.signal,
      });

      const text = await resp.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(`Сервер вернул не-JSON: ${text.slice(0, 300)}`);
      }

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${data?.error || text}`);
      }
      return data;
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Таймаут запроса к серверу');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // =========================
  // INIT
  // =========================
  initApp();

  async function initApp() {
    try {
      restoreFromStorage();

      await loadJudges();
      populateJudgeSelect();
      if (selectedJudge) judgeSelect.value = selectedJudge;

      if (selectedCategory) {
        setCategorySelectByText(selectedCategory);
        await loadParticipants(selectedCategory, true);
      } else {
        participants = [];
        renderParticipantsList();
        updateCounters();
        updateParticipantDisplay();
      }

      setupEventListeners();
      updateParticipantDisplay();
      updateCounters();
      updateSendScoresButton();
    } catch (error) {
      console.error('Ошибка инициализации:', error);
      showStatus('Ошибка загрузки: ' + error.message, 'error', 7000);
    }
  }

  // =========================
  // STORAGE
  // =========================
  function restoreFromStorage() {
    try {
      selectedJudge = localStorage.getItem(STORAGE_KEYS.JUDGE) || '';
      selectedCategory = localStorage.getItem(STORAGE_KEYS.CATEGORY) || '';
      selectedFigure = localStorage.getItem(STORAGE_KEYS.FIGURE) || '';

      const savedIndex = localStorage.getItem(STORAGE_KEYS.CURRENT_INDEX);
      currentIndex = savedIndex ? parseInt(savedIndex, 10) : 0;

      const savedScoresByCategory = localStorage.getItem(STORAGE_KEYS.SCORES_BY_CATEGORY);
      scoresByCategory = savedScoresByCategory ? JSON.parse(savedScoresByCategory) : {};

      const savedParticipants = localStorage.getItem(STORAGE_KEYS.PARTICIPANTS);
      if (savedParticipants) {
        participants = JSON.parse(savedParticipants);
        applyScoresToParticipantsFromCategory();
      }
    } catch (e) {
      console.error('Ошибка восстановления из storage:', e);
      resetAll();
    }
  }

  function saveToStorage() {
    try {
      if (selectedJudge) localStorage.setItem(STORAGE_KEYS.JUDGE, selectedJudge);
      else localStorage.removeItem(STORAGE_KEYS.JUDGE);

      if (selectedCategory) localStorage.setItem(STORAGE_KEYS.CATEGORY, selectedCategory);
      else localStorage.removeItem(STORAGE_KEYS.CATEGORY);

      if (selectedFigure) localStorage.setItem(STORAGE_KEYS.FIGURE, selectedFigure);
      else localStorage.removeItem(STORAGE_KEYS.FIGURE);

      localStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, String(currentIndex));

      localStorage.setItem(STORAGE_KEYS.SCORES_BY_CATEGORY, JSON.stringify(scoresByCategory || {}));

      if (participants.length > 0) localStorage.setItem(STORAGE_KEYS.PARTICIPANTS, JSON.stringify(participants));
      else localStorage.removeItem(STORAGE_KEYS.PARTICIPANTS);
    } catch (e) {
      console.error('Ошибка сохранения в storage:', e);
    }
  }

  function resetAll() {
    Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));

    scoresByCategory = {};

    cache.judges = null;
    cache.participants = {};
    cache.lastCacheTime = { judges: 0, participants: {} };

    selectedJudge = '';
    selectedCategory = '';
    selectedFigure = '';
    currentIndex = 0;
    participants = [];
    judges = [];

    isAutoSending = false;
    autoSendTimer && clearTimeout(autoSendTimer);
    autoSendTimer = null;
  }

  // =========================
  // DATA: Judges / Participants
  // =========================
  async function loadJudges() {
    const now = Date.now();
    if (cache.enabled && cache.judges && now - cache.lastCacheTime.judges < cache.ttl) {
      judges = cache.judges;
      return;
    }

    showStatus('Загрузка судей...', 'info', 0);
    const data = await apiRequest('getJudges');
    if (!data.success) throw new Error(data.error || 'getJudges: unknown error');

    judges = data.judges || [];

    if (cache.enabled) {
      cache.judges = judges;
      cache.lastCacheTime.judges = now;
    }
    hideStatus();
  }

  async function loadParticipants(categoryText, isRestoring = false) {
    const now = Date.now();
    if (
      cache.enabled &&
      cache.participants[categoryText] &&
      now - (cache.lastCacheTime.participants[categoryText] || 0) < cache.ttl &&
      !isRestoring
    ) {
      participants = cache.participants[categoryText];
      applyScoresToParticipantsFromCategory();
      renderParticipantsList();
      updateCounters();
      updateParticipantDisplay();
      return;
    }

    if (!isRestoring) showStatus('Загрузка участников...', 'info', 0);
    const data = await apiRequest('getParticipants', { category: categoryText });
    if (!data.success) throw new Error(data.error || 'getParticipants: unknown error');

    participants = (data.participants || []).map((p) => ({
      ...p,
      score: null,
      scoreId: null,
      isLocal: false,
    }));

    if (cache.enabled) {
      cache.participants[categoryText] = participants;
      cache.lastCacheTime.participants[categoryText] = now;
    }

    // нормализуем индекс при смене категории
    currentIndex = 0;

    applyScoresToParticipantsFromCategory();
    renderParticipantsList();
    updateCounters();
    updateParticipantDisplay();

    if (!isRestoring) {
      hideStatus();
      saveToStorage();
    }
  }

  // =========================
  // UI Helpers
  // =========================
  function populateJudgeSelect() {
    judgeSelect.innerHTML = '<option value="">-- Выберите судью --</option>';
    judges.forEach((j) => {
      const opt = document.createElement('option');
      opt.value = j.id;
      opt.textContent = j.shortName || j.name;
      judgeSelect.appendChild(opt);
    });
  }

  function setCategorySelectByText(text) {
    const options = Array.from(categorySelect.options);
    const found = options.find((o) => o.text === text);
    if (found) categorySelect.value = found.value;
  }

  function getCategoryScoresMap(categoryText) {
    if (!scoresByCategory[categoryText]) scoresByCategory[categoryText] = {};
    return scoresByCategory[categoryText];
  }

  function applyScoresToParticipantsFromCategory() {
    if (!selectedCategory) return;
    const map = getCategoryScoresMap(selectedCategory);

    participants.forEach((p) => {
      const saved = map[String(p.id)];
      if (saved) {
        p.score = saved.score;
        p.scoreId = `local_${saved.timestamp}`;
        p.isLocal = true;
      } else {
        p.score = null;
        p.scoreId = null;
        p.isLocal = false;
      }
    });
  }

  function updateParticipantDisplay() {
    if (participants.length === 0) {
      startNumberElement.textContent = '-';
      fullNameElement.textContent = 'Нет участников';
      scoreInput.value = '';
      progressBar.style.width = '0%';
      progressText.textContent = 'Участник 0 из 0';
      return;
    }

    if (currentIndex < participants.length) {
      const p = participants[currentIndex];
      startNumberElement.textContent = p.number ?? '-';
      fullNameElement.textContent = p.name ?? '-';
      scoreInput.value = p.score !== null ? p.score : '';

      const progress = (currentIndex / participants.length) * 100;
      progressBar.style.width = `${progress}%`;
      progressText.textContent = `Участник ${currentIndex + 1} из ${participants.length}`;

      setTimeout(() => scoreInput.focus(), 30);
    } else {
      startNumberElement.textContent = '-';
      fullNameElement.textContent = 'Все участники пройдены';
      progressBar.style.width = '100%';
      progressText.textContent = `${participants.length} из ${participants.length}`;
      scoreInput.value = '';

      // ТРИГГЕРИМ ПОДТВЕРЖДЕНИЕ ОТПРАВКИ ПРИ ЗАВЕРШЕНИИ
      triggerSendConfirmationIfReady();
    }
  }

  function renderParticipantsList() {
    participantsList.innerHTML = '';

    participants.forEach((p, idx) => {
      const item = document.createElement('div');
      item.className = 'participant-item';
      if (idx === currentIndex) item.classList.add('current');
      if (p.score !== null) item.classList.add('evaluated');
      if (p.isLocal) item.classList.add('local');

      const localBadge = p.isLocal ? `<span class="local-badge">LOCAL</span>` : '';

      item.innerHTML = `
        <div class="participant-info">
          <span>${idx + 1}. ${p.name} (№${p.number}) ${localBadge}</span>
        </div>
        <div class="participant-actions">
          <span class="participant-score">${p.score !== null ? p.score : '—'}</span>
          ${p.score !== null ? `
            <button class="edit-btn" data-id="${p.id}">
              <i class="fas fa-edit"></i> Изменить
            </button>` : ''
          }
        </div>
      `;
      participantsList.appendChild(item);
    });

    document.querySelectorAll('.edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const pid = btn.getAttribute('data-id');
        const p = participants.find((x) => String(x.id) === String(pid));
        if (p) showEditDialog(p);
      });
    });
  }

  function updateCounters() {
    const evaluated = participants.filter((p) => p.score !== null).length;
    const remaining = participants.length - evaluated;
    evaluatedCountEl.textContent = String(evaluated);
    remainingCountEl.textContent = String(remaining);
  }

  function showStatus(message, type, duration = 2000) {
    statusMessage.innerHTML = message;
    statusMessage.className = `status ${type}`;
    statusMessage.style.display = 'block';

    if (duration > 0) {
      setTimeout(() => {
        statusMessage.style.display = 'none';
      }, duration);
    }
  }

  function hideStatus() {
    statusMessage.style.display = 'none';
  }

  // =========================
  // НОВЫЕ ФУНКЦИИ ДЛЯ КНОПКИ ОТПРАВКИ
  // =========================
  function updateSendScoresButton() {
    const hasLocalScores = checkIfHasLocalScores();
    
    if (hasLocalScores && currentIndex >= participants.length) {
        sendScoresBtn.style.display = 'block';
    } else {
        sendScoresBtn.style.display = 'none';
    }
  }

  function checkIfHasLocalScores() {
    if (!selectedCategory) return false;
    const map = getCategoryScoresMap(selectedCategory);
    return Object.keys(map).length > 0;
  }

  function showSendConfirmationDialog() {
    const map = getCategoryScoresMap(selectedCategory);
    const entries = Object.entries(map);
    const newScores = entries.filter(([_, s]) => s.isFirstTime).length;
    const modifiedScores = entries.filter(([_, s]) => !s.isFirstTime).length;
    
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';

    dialog.innerHTML = `
        <h3><i class="fas fa-paper-plane"></i> Отправка оценок</h3>
        <div class="modal-content">
            <p>Вы оценили всех участников. Отправить оценки на сервер?</p>
            <div style="margin: 15px 0; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                <p><strong>Категория:</strong> ${selectedCategory}</p>
                <p><strong>Всего оценок:</strong> ${entries.length}</p>
                <p><strong>Новых оценок:</strong> ${newScores}</p>
                <p><strong>Измененных оценок:</strong> ${modifiedScores}</p>
            </div>
            <p style="color: #666; font-size: 14px;">После отправки оценки будут сохранены в таблице результатов.</p>
        </div>
        <div class="modal-buttons">
            <button id="sendCancel" style="background: #6c757d; color: white;">Отмена</button>
            <button id="sendConfirm" style="background: #28a745; color: white;">✅ Отправить</button>
        </div>
    `;

    modal.appendChild(dialog);
    document.body.appendChild(modal);

    document.getElementById('sendConfirm').addEventListener('click', () => {
        document.body.removeChild(modal);
        saveBatchToSheetsForCategory(selectedCategory);
    });
    
    document.getElementById('sendCancel').addEventListener('click', () => {
        document.body.removeChild(modal);
        // Если отменили - показываем кнопку "Отправить оценки"
        sendScoresBtn.style.display = 'block';
        showStatus('📝 Оценки сохранены локально. Вы можете отправить их позже.', 'info', 3000);
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            document.body.removeChild(modal);
            // Если кликнули вне диалога - показываем кнопку "Отправить оценки"
            sendScoresBtn.style.display = 'block';
            showStatus('📝 Оценки сохранены локально. Вы можете отправить их позже.', 'info', 3000);
        }
    });
  }

  function triggerSendConfirmationIfReady() {
    if (isAutoSending) return;
    if (!selectedCategory) return;

    const map = getCategoryScoresMap(selectedCategory);
    const count = Object.keys(map).length;

    if (count === 0) return;

    // Показываем попап с подтверждением отправки
    setTimeout(() => {
        showSendConfirmationDialog();
    }, 500); // Небольшая задержка для плавности
  }

  // =========================
  // EVENTS
  // =========================
  function setupEventListeners() {
    judgeSelect.addEventListener('change', () => {
      selectedJudge = judgeSelect.value;
      localStorage.setItem(STORAGE_KEYS.JUDGE, selectedJudge);
      renderParticipantsList();
    });

    categorySelect.addEventListener('change', handleCategoryChange);

    figureSelect.addEventListener('change', () => {
      selectedFigure = figureSelect.value;
      localStorage.setItem(STORAGE_KEYS.FIGURE, selectedFigure);
    });
          // Кастомная клавиатура
      const customKeyboard = document.getElementById('customKeyboard');
      const toggleKeyboardBtn = document.getElementById('toggleKeyboardBtn');

      toggleKeyboardBtn.addEventListener('click', function() {
          if (customKeyboard.style.display === 'none') {
              customKeyboard.style.display = 'block';
              this.innerHTML = '<i class="fas fa-keyboard"></i> Скрыть клавиатуру';
          } else {
              customKeyboard.style.display = 'none';
              this.innerHTML = '<i class="fas fa-keyboard"></i> Показать клавиатуру';
          }
      });

      document.querySelectorAll('.keyboard-btn').forEach(btn => {
          btn.addEventListener('click', function() {
              const value = this.getAttribute('data-value');
              if (value === ',') {
                  if (!scoreInput.value.includes(',')) scoreInput.value += ',';
              } else if (this.id === 'keyboardBackspace') {
                  scoreInput.value = scoreInput.value.slice(0, -1);
              } else {
                  scoreInput.value += value;
              }
              scoreInput.dispatchEvent(new Event('input'));
          });
      });
    scoreInput.addEventListener('input', function() {
        if (this.value.includes('.')) {
            this.value = this.value.replace('.', ',');
        }
        // if (this.value.includes('ю')) {
        //     this.value = this.value.replace('ю', ',');          
        // }
      // Список всех символов, которые могут быть введены вместо запятой
    const symbolsToReplace = [
    '.', ';', ':', '/', '\\', '|',
    
    // Все русские буквы строчные
    'а', 'б', 'в', 'г', 'д', 'е', 'ё', 'ж', 'з', 'и', 'й', 'к', 'л', 'м', 'н', 'о', 'п', 
    'р', 'с', 'т', 'у', 'ф', 'х', 'ц', 'ч', 'ш', 'щ', 'ъ', 'ы', 'ь', 'э', 'ю', 'я',
    
    // Все русские буквы прописные
    'А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ё', 'Ж', 'З', 'И', 'Й', 'К', 'Л', 'М', 'Н', 'О', 'П',
    'Р', 'С', 'Т', 'У', 'Ф', 'Х', 'Ц', 'Ч', 'Ш', 'Щ', 'Ъ', 'Ы', 'Ь', 'Э', 'Ю', 'Я',
    
    // Английские буквы строчные
    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
    'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
    
    // Английские буквы прописные
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
    'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
    
    // Спецсимволы
    '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', 
    '-', '_', '=', '+', '[', ']', '{', '}', '"', "'", 
    '?', '<', '>', '`', '~'
];
    
    // Проверяем и заменяем каждый символ
    symbolsToReplace.forEach(symbol => {
        if (this.value.includes(symbol)) {
            this.value = this.value.replace(symbol, ',');
        }
    });
    });

    // Валидация при потере фокуса
    scoreInput.addEventListener('blur', function() {
        let value = this.value.replace(',', '.'); // Временно для вычислений
        const numValue = parseFloat(value);
        
        if (!isNaN(numValue)) {
            // Ограничиваем 0-10
            let corrected = Math.max(0, Math.min(10, numValue));
            // Округляем до одного знака
            corrected = Math.round(corrected * 10) / 10;
            // Возвращаем запятую
            this.value = corrected.toString().replace('.', ',');
        }
    });

    // Валидация при потере фокуса
    scoreInput.addEventListener('blur', function() {
        let value = this.value.replace(',', '.'); // Временно для вычислений
        const numValue = parseFloat(value);
        
        if (!isNaN(numValue)) {
            // Ограничиваем 0-10
            let corrected = Math.max(0, Math.min(10, numValue));
            // Округляем до одного знака
            corrected = Math.round(corrected * 10) / 10;
            // Возвращаем запятую
            this.value = corrected.toString().replace('.', ',');
        }
    });

    toggleParticipantsBtn.addEventListener('click', toggleParticipantsList);
    submitBtn.addEventListener('click', handleSubmit);
    skipBtn.addEventListener('click', handleSkip);
    sendScoresBtn.addEventListener('click', showSendConfirmationDialog);

    scoreInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') submitBtn.click();
    });

    if (resetSessionBtn) {
      resetSessionBtn.addEventListener('click', () => {
        resetAll();

        // сброс UI
        judgeSelect.value = '';
        categorySelect.value = '';
        figureSelect.value = '';
        figureGroup.style.display = 'none';
        sendScoresBtn.style.display = 'none';

        renderParticipantsList();
        updateCounters();
        updateParticipantDisplay();

        showStatus('✅ Сессия сброшена', 'info', 1500);
      });
    }

    window.addEventListener('beforeunload', (e) => {
      // если где-то есть локальные оценки — предупреждаем
      const hasAnyScores = Object.values(scoresByCategory || {}).some((m) => m && Object.keys(m).length > 0);
      if (hasAnyScores && !isAutoSending) {
        e.preventDefault();
        e.returnValue = 'У вас есть несохраненные оценки. Выйти?';
      }
    });
  }

  async function handleCategoryChange() {
    const newCategoryText = categorySelect.options[categorySelect.selectedIndex].text;
    selectedCategory = newCategoryText;
    localStorage.setItem(STORAGE_KEYS.CATEGORY, selectedCategory);

    // фигуры
    selectedFigure = '';
    figureSelect.value = '';
    localStorage.removeItem(STORAGE_KEYS.FIGURE);

    if (categoriesWithFigures.includes(selectedCategory)) {
      figureGroup.style.display = 'block';
    } else {
      figureGroup.style.display = 'none';
    }

    const selectedCategoryValue = categorySelect.value;
    updateFigures(selectedCategoryValue);

    currentIndex = 0;
    await loadParticipants(selectedCategory, false);

    updateParticipantDisplay();
    updateCounters();
    updateSendScoresButton();
    saveToStorage();
  }

  function toggleParticipantsList() {
    isParticipantsListVisible = !isParticipantsListVisible;

    if (isParticipantsListVisible) {
      participantsListContainer.style.display = 'block';
      toggleParticipantsBtn.innerHTML = '<i class="fas fa-chevron-up"></i> Скрыть список участников';
      toggleParticipantsBtn.classList.add('expanded');

      setTimeout(() => {
        const current = document.querySelector('.participant-item.current');
        if (current) current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    } else {
      participantsListContainer.style.display = 'none';
      toggleParticipantsBtn.innerHTML = '<i class="fas fa-chevron-down"></i> Показать список участников';
      toggleParticipantsBtn.classList.remove('expanded');
    }
  }

  // =========================
  // SUBMIT/SKIP
  // =========================
  function validateForm() {
    if (!selectedJudge) {
        showStatus('⚠️ Выберите судью!', 'error', 2500);
        judgeSelect.focus();
        return false;
    }
    if (!selectedCategory || selectedCategory === '-- Выберите категорию --') {
        showStatus('⚠️ Выберите категорию!', 'error', 2500);
        categorySelect.focus();
        return false;
    }
    if (categoriesWithFigures.includes(selectedCategory) && !selectedFigure) {
        showStatus('⚠️ Выберите фигуру!', 'error', 2500);
        figureSelect.focus();
        return false;
    }
    
    // === ВОТ ЗДЕСЬ ЗАМЕНИЛИ БЛОК ===
    let score = scoreInput.value.trim();
    
    // Меняем точку на запятую если есть
    if (score.includes('.')) {
        score = score.replace('.', ',');
        scoreInput.value = score;
    }
    
    if (!score) {
        showStatus('⚠️ Введите балл!', 'error', 2500);
        scoreInput.focus();
        return false;
    }
    
    // Для вычислений меняем запятую на точку
    const scoreForCalc = score.replace(',', '.');
    const n = parseFloat(scoreForCalc);
    
    if (Number.isNaN(n)) {
        showStatus('⚠️ Оценка должна быть числом!', 'error', 2500);
        scoreInput.focus();
        scoreInput.select();
        return false;
    }
    
    if (n < 0 || n > 10) {
        showStatus('⚠️ Оценка должна быть от 0 до 10!', 'error', 2500);
        scoreInput.focus();
        scoreInput.select();
        return false;
    }
    
    // Проверка формата
    const commaCount = (score.match(/,/g) || []).length;
    if (commaCount > 1) {
        showStatus('⚠️ Используйте только одну запятую!', 'error', 2500);
        scoreInput.focus();
        scoreInput.select();
        return false;
    }
    
    if (score.includes(',')) {
        const afterComma = score.split(',')[1];
        if (afterComma && afterComma.length > 1) {
            showStatus('⚠️ Используйте только один знак после запятой!', 'error', 2500);
            scoreInput.focus();
            scoreInput.select();
            return false;
        }
    }
    // === КОНЕЦ ЗАМЕНЕННОГО БЛОКА ===
    
    return true;
}

  function showConfirmationDialog(messageHtml, callback) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';

    dialog.innerHTML = `
      <div style="font-size: 18px; margin-bottom: 20px; color: #2c3e50;">${messageHtml}</div>
      <div class="modal-buttons">
        <button id="confirmCancel" style="background: #6c757d; color: white;">Отмена</button>
        <button id="confirmOk" style="background: #28a745; color: white;">ОК</button>
      </div>
    `;

    modal.appendChild(dialog);
    document.body.appendChild(modal);

    document.getElementById('confirmOk').addEventListener('click', () => {
      document.body.removeChild(modal);
      callback(true);
    });
    document.getElementById('confirmCancel').addEventListener('click', () => {
      document.body.removeChild(modal);
      callback(false);
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
        callback(false);
      }
    });
  }

  async function handleSubmit() {
    if (!validateForm()) return;
    if (currentIndex >= participants.length) return;

    const p = participants[currentIndex];
    const score = scoreInput.value.trim();
    const judge = judges.find((j) => String(j.id) === String(selectedJudge));

    let msg = `Вы уверены, что хотите оценить участника?<br><br>`;
    msg += `<strong>Судья:</strong> ${judge ? judge.shortName : ''}<br>`;
    msg += `<strong>Участник:</strong> ${p.name}<br>`;
    msg += `<strong>Категория:</strong> ${selectedCategory}<br>`;
    if (selectedFigure) {
      const figureText = figureSelect.options[figureSelect.selectedIndex]?.text;
      msg += `<strong>Фигура:</strong> ${figureText}<br>`;
    }
    msg += `<strong>Балл:</strong> ${score}`;

    showConfirmationDialog(msg, (confirmed) => {
      if (!confirmed) return;

      saveScoreForCurrentCategory(p.id, score);

      p.score = score;
      p.scoreId = `local_${Date.now()}`;
      p.isLocal = true;

      updateCounters();
      renderParticipantsList();
      updateSendScoresButton();

      setTimeout(() => goToNextParticipant(), 150);
    });
  }

  function handleSkip() {
    if (currentIndex >= participants.length) return;

    if (!selectedJudge) {
      showStatus('⚠️ Выберите судью!', 'error', 2500);
      judgeSelect.focus();
      return;
    }

    const p = participants[currentIndex];
    const judge = judges.find((j) => String(j.id) === String(selectedJudge));

    showConfirmationDialog(
      `Вы уверены, что хотите пропустить участника?<br><br>
       <strong>Судья:</strong> ${judge ? judge.shortName : ''}<br>
       <strong>Участник:</strong> ${p.name}`,
      (confirmed) => {
        if (!confirmed) return;
        setTimeout(() => goToNextParticipant(), 120);
      }
    );
  }

  function goToNextParticipant() {
    if (currentIndex < participants.length) currentIndex++;
    updateParticipantDisplay();
    renderParticipantsList();
    saveToStorage();
    
    // Обновляем кнопку после перехода
    updateSendScoresButton();

    if (isParticipantsListVisible) {
      setTimeout(() => {
        const cur = document.querySelector('.participant-item.current');
        if (cur) cur.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    }
  }

  function saveScoreForCurrentCategory(participantId, score) {
    const categoryText = selectedCategory || '';
    if (!categoryText) return;

    const map = getCategoryScoresMap(categoryText);
    const existing = map[String(participantId)];
    
    // Определяем, это первая оценка или изменение существующей
    const isFirstTime = !existing;
    
    map[String(participantId)] = {
        score,
        judgeId: selectedJudge,
        category: categoryText,
        figure: selectedFigure || '',
        timestamp: Date.now(),
        // Отмечаем, была ли оценка уже введена ранее
        isFirstTime: isFirstTime
    };

    scoresByCategory[categoryText] = map;
    saveToStorage();
    
    updateSendScoresButton();
  }

  // =========================
  // EDIT DIALOG
  // =========================
  function showEditDialog(participant) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';

    const dialog = document.createElement('div');
    dialog.className = 'modal-dialog';

    dialog.innerHTML = `
      <h3><i class="fas fa-edit"></i> Изменение оценки</h3>
      <div class="modal-content">
        <div class="modal-field">
          <label>Участник:</label>
          <input type="text" value="${participant.name} (№${participant.number})" readonly>
        </div>
        <div class="modal-field">
          <label>Текущая оценка:</label>
          <input type="text" value="${participant.score !== null ? participant.score : '—'}" readonly>
        </div>
        <div class="modal-field">
          <label>Новая оценка:</label>
          <input type="text" id="editScoreInput" placeholder="Введите новую оценку" autofocus>
        </div>
      </div>
      <div class="modal-buttons">
        <button id="editCancel" style="background: #6c757d; color: white;">Отмена</button>
        <button id="editSave" style="background: #28a745; color: white;">Сохранить</button>
      </div>
    `;

    modal.appendChild(dialog);
    document.body.appendChild(modal);

    const input = document.getElementById('editScoreInput');
    input.focus();

    document.getElementById('editSave').addEventListener('click', () => {
        const newScore = input.value.trim();
        const n = parseFloat(newScore.replace(',', '.'));

        if (!newScore) return alert('Введите новую оценку');
        if (Number.isNaN(n) || n < 0 || n > 10) return alert('Оценка должна быть от 0 до 10');

        // При изменении оценки через диалог - это уже не первая оценка
        const categoryText = selectedCategory || '';
        const map = getCategoryScoresMap(categoryText);
        
        map[String(participant.id)] = {
            score: newScore,
            judgeId: selectedJudge,
            category: categoryText,
            figure: selectedFigure || '',
            timestamp: Date.now(),
            // Явно указываем, что это изменение (не первая оценка)
            isFirstTime: false
        };
        
        scoresByCategory[categoryText] = map;
        saveToStorage();

        participant.score = newScore;
        participant.scoreId = `local_${Date.now()}`;
        participant.isLocal = true;

        updateCounters();
        renderParticipantsList();
        updateSendScoresButton();

        document.body.removeChild(modal);
        showStatus('✅ Оценка изменена', 'info', 1200);
    });

    document.getElementById('editCancel').addEventListener('click', () => {
        document.body.removeChild(modal);
    });

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('editSave').click();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) document.body.removeChild(modal);
    });
  }

  // =========================
  // ОТПРАВКА ОЦЕНОК
  // =========================
  async function saveBatchToSheetsForCategory(categoryText) {
    if (isAutoSending) return;

    const map = getCategoryScoresMap(categoryText);
    const entries = Object.entries(map);
    if (entries.length === 0) return;

    isAutoSending = true;
    // Скрываем кнопку на время отправки
    sendScoresBtn.style.display = 'none';
    showStatus(`📤 Отправка оценок (${categoryText}): ${entries.length}...`, 'info', 0);

    try {
        const scoresArray = entries.map(([participantId, s]) => ({
            participantId,
            judgeId: s.judgeId,
            score: s.score,
            category: s.category,
            figure: s.figure,
            timestamp: s.timestamp,
            // Определяем статус на основе isFirstTime
            status: s.isFirstTime ? 'Новая' : 'Измененная'
        }));

        const payload = JSON.stringify({ scores: scoresArray });

        const data = await apiRequest('saveScoresBatch', { data: payload }, 60000);
        if (!data.success) throw new Error(data.error || 'saveScoresBatch: unknown error');

        showStatus(`✅ Отправлено (${categoryText}): ${data.savedCount ?? scoresArray.length}`, 'info', 2200);

        // Чистим ТОЛЬКО текущую категорию
        delete scoresByCategory[categoryText];
        localStorage.setItem(STORAGE_KEYS.SCORES_BY_CATEGORY, JSON.stringify(scoresByCategory));

        // Убираем LOCAL-флаги в текущем UI
        participants.forEach((p) => {
            p.isLocal = false;
            p.scoreId = null;
        });
        renderParticipantsList();
        updateCounters();
        
        // После успешной отправки скрываем кнопку
        updateSendScoresButton();

        isAutoSending = false;
    } catch (error) {
        console.error('Ошибка отправки:', error);
        isAutoSending = false;
        showStatus(`❌ Не удалось отправить (${categoryText}): ${error.message}`, 'error', 9000);
        // Если ошибка, снова показываем кнопку отправки
        sendScoresBtn.style.display = 'block';
    }
  }

  console.log('✅ Система судейства готова к работе!');
});

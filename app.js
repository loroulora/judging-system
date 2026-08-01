// === КОНФИГ БРИГАД ===
const BRIGADES = [
    { value: 'Исполнение', text: 'Исполнение' },
    { value: 'Художественное впечатление', text: 'Художественное впечатление' },
    { value: 'Сложность', text: 'Сложность' }
];
// === КОНЕЦ КОНФИГА БРИГАД ===

// === КОНФИГ ФИГУР ===
const CATEGORIES_WITH_FIGURES = {
    "1": [   // 1 категория
        "Кувырок назад",
        "Парус", 
        "Поворот 360", 
        "Волна"
    ],
    "2": [   // 10 лет и моложе
        "Балетная нога",
        "Барракуда",
        "Квадрат",
        "Цветок"
    ],
    "3": [   // 12 лет и моложе
        "Балетная нога",
        "Барракуда", 
        "Ариана",
        "Башня"
    ],
    "4": [   // 13-15 лет
        "Ипанема",
        "Лондон", 
        "Флай Фиш",
        "Циклон"
    ]
};
// === КОНЕЦ КОНФИГА ===

// === ФУНКЦИЯ ОБНОВЛЕНИЯ ФИГУР ===
function updateFigures(selectedCategoryId) {
    const figureSelect = document.getElementById('figureSelect');
    const figureGroup = document.getElementById('figureGroup');
    
    figureSelect.innerHTML = '<option value="">-- Выберите фигуру --</option>';
    
    if (CATEGORIES_WITH_FIGURES[selectedCategoryId]) {
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
  const API_URL = window.APP_CONFIG?.API_URL || 'https://script.google.com/macros/s/AKfycbyO4MXymmhXZoNnDa1Sxss2sVsi4gQLhPLWT8MJfUZuAHb8k2t5B24MomehklkLKBsU/exec';

  const STORAGE_KEYS = {
    JUDGE: 'judging_system_judge',
    CATEGORY: 'judging_system_category',
    CATEGORY_ID: 'judging_system_category_id',
    FIGURE: 'judging_system_figure',
    BRIGADE: 'judging_system_brigade',
    CURRENT_INDEX: 'judging_system_current_index',
    PARTICIPANTS: 'judging_system_participants',
    SCORES_BY_CATEGORY: 'judging_system_scores_by_category',
  };

  // Кеш
  const cache = {
    enabled: true,
    judges: null,
    categories: null,
    participants: {},
    lastCacheTime: { 
      judges: 0,
      categories: 0,
      participants: {} 
    },
    ttl: 5 * 60 * 1000,
  };

  // Категории где требуется выбор бригады (по ID)
  const categoriesWithBrigade = [
    "5",   // Соло 8 лет и моложе
    "6",   // Соло 10 лет и моложе
    "7",   // Соло 12 лет и моложе
    "8",   // Соло 13-15 лет
    "9",   // Соло Взрослые
    "10",  // Технические соло
    "11",  // Дуэты 8 лет и моложе
    "12",  // Дуэты 10 лет и моложе
    "13",  // Дуэты 12 лет и моложе
    "14",  // Дуэты 13-15 лет
    "15",  // Дуэты Взрослые
    "16",  // Технические дуэты
    "17",  // Группы 8 лет и моложе
    "18",  // Группы 10 лет и моложе
    "19",  // Группы 12 лет и моложе
    "20",  // Группы 13-15 лет
    "21",  // Группы Взрослые
    "22",  // Технические группы
    "23",  // Акробатические группы
    "24",  // Комби 8 лет и моложе
    "25",  // Комби 10 лет и моложе
    "26",  // Комби 12 лет и моложе
    "27",  // Комби 13-15 лет
    "28",  // Комби Взрослые
    "29",  // Трофи Соло
    "30",  // Трофи Дуэты
    "31"   // Трофи Группы
  ];

  // =========================
  // STATE
  // =========================
  let judges = [];
  let participants = [];
  let currentIndex = 0;

  let selectedCategory = '';
  let selectedCategoryId = '';
  let selectedFigure = '';
  let selectedJudge = '';
  let isParticipantsListVisible = false;
  let selectedBrigade = '';

  let scoresByCategory = {};

  let isAutoSending = false;
  let autoSendTimer = null;

  // =========================
  // DOM
  // =========================
  const judgeSelect = document.getElementById('judgeSelect');
  const categorySelect = document.getElementById('categorySelect');
  const figureGroup = document.getElementById('figureGroup');
  const figureSelect = document.getElementById('figureSelect');
  const brigadeGroup = document.getElementById('brigadeGroup');
  const brigadeSelect = document.getElementById('brigadeSelect');

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
  // API HELPER
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

      // Загружаем параллельно но обрабатываем ошибки отдельно
      const [judgesResult, categoriesResult] = await Promise.allSettled([
        loadJudges(),
        loadCategories()
      ]);

      // Судьи
      if (judgesResult.status === 'rejected') {
        console.error('Ошибка загрузки судей:', judgesResult.reason);
        showStatus('Ошибка загрузки судей: ' + judgesResult.reason.message, 'error', 7000);
      }

      populateJudgeSelect();

      // Категории
      if (categoriesResult.status === 'fulfilled') {
        populateCategorySelect(categoriesResult.value);
      } else {
        console.error('Ошибка загрузки категорий:', categoriesResult.reason);
        showStatus('Ошибка загрузки категорий: ' + categoriesResult.reason.message, 'error', 7000);
      }

      if (selectedJudge) judgeSelect.value = selectedJudge;

      if (selectedCategory) {
        setCategorySelectByText(selectedCategory);
        // Восстанавливаем ID категории
        selectedCategoryId = categorySelect.value;
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
      selectedCategoryId = localStorage.getItem(STORAGE_KEYS.CATEGORY_ID) || '';
      selectedFigure = localStorage.getItem(STORAGE_KEYS.FIGURE) || '';
      selectedBrigade = localStorage.getItem(STORAGE_KEYS.BRIGADE) || '';

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

      if (selectedCategoryId) localStorage.setItem(STORAGE_KEYS.CATEGORY_ID, selectedCategoryId);
      else localStorage.removeItem(STORAGE_KEYS.CATEGORY_ID);

      if (selectedFigure) localStorage.setItem(STORAGE_KEYS.FIGURE, selectedFigure);
      else localStorage.removeItem(STORAGE_KEYS.FIGURE);
      
      if (selectedBrigade) localStorage.setItem(STORAGE_KEYS.BRIGADE, selectedBrigade);
      else localStorage.removeItem(STORAGE_KEYS.BRIGADE);

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
    cache.categories = null;
    cache.participants = {};
    cache.lastCacheTime = { judges: 0, categories: 0, participants: {} };

    selectedJudge = '';
    selectedCategory = '';
    selectedCategoryId = '';
    selectedFigure = '';
    selectedBrigade = '';
    currentIndex = 0;
    participants = [];
    judges = [];

    isAutoSending = false;
    autoSendTimer && clearTimeout(autoSendTimer);
    autoSendTimer = null;
    
    if (brigadeSelect) brigadeSelect.value = '';
    if (brigadeGroup) brigadeGroup.style.display = 'none';
    if (figureGroup) figureGroup.style.display = 'none';
  }

  // =========================
  // DATA: Judges / Categories / Participants
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

  async function loadCategories() {
    const now = Date.now();

    if (
      cache.enabled &&
      cache.categories &&
      now - cache.lastCacheTime.categories < cache.ttl
    ) {
      return cache.categories;
    }

    showStatus('Загрузка категорий...', 'info', 0);

    const data = await apiRequest('getCategories');

    if (!data.success) {
      throw new Error(data.error || 'getCategories: unknown error');
    }

    const categories = data.categories || [];

    if (cache.enabled) {
      cache.categories = categories;
      cache.lastCacheTime.categories = now;
    }

    hideStatus();
    return categories;
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
      isSending: false,
    }));

    if (cache.enabled) {
      cache.participants[categoryText] = participants;
      cache.lastCacheTime.participants[categoryText] = now;
    }

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

  function populateCategorySelect(categories) {
    categorySelect.innerHTML = '<option value="">-- Выберите категорию --</option>';
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;        // ID: "1", "2", "3"...
      opt.textContent = cat.name; // Текст: "1 категория", "10 лет и моложе"...
      categorySelect.appendChild(opt);
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

    // Используем сохранённый ID категории
    const catId = selectedCategoryId || categorySelect.value;

    const figureValue = categoriesWithBrigade.includes(catId)
      ? selectedBrigade
      : selectedFigure;

    participants.forEach((p) => {
      const scoreKey = figureValue 
        ? `${p.id}_${figureValue}` 
        : String(p.id);

      const saved = map[scoreKey];

      if (saved) {
        p.score = saved.score;
        p.scoreId = `local_${saved.timestamp}`;
        p.isLocal = true;
        p.isSending = false;
      } else {
        p.score = null;
        p.scoreId = null;
        p.isLocal = false;
        p.isSending = false;
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
      scoreInput.disabled = p.isSending || false;
      submitBtn.disabled = p.isSending || false;

      const progress = (currentIndex / participants.length) * 100;
      progressBar.style.width = `${progress}%`;
      progressText.textContent = `Участник ${currentIndex + 1} из ${participants.length}`;

      setTimeout(() => {
        if (!p.isSending) scoreInput.focus();
      }, 30);
    } else {
      startNumberElement.textContent = '-';
      fullNameElement.textContent = 'Все участники пройдены';
      progressBar.style.width = '100%';
      progressText.textContent = `${participants.length} из ${participants.length}`;
      scoreInput.value = '';
      scoreInput.disabled = false;
      submitBtn.disabled = false;
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
      if (p.isSending) item.classList.add('sending');

      const statusIcon = p.isSending 
        ? '<span class="sending-spinner">⏳</span>' 
        : (p.isLocal ? '<span class="local-badge">💾</span>' : '');

      item.innerHTML = `
        <div class="participant-info">
          <span>${idx + 1}. ${p.name} (№${p.number}) ${statusIcon}</span>
        </div>
        <div class="participant-actions">
          <span class="participant-score">${p.score !== null ? p.score : '—'}</span>
          ${p.score !== null && !p.isSending ? `
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
  // ОТПРАВКА ОДНОЙ ОЦЕНКИ
  // =========================
  async function sendSingleScore(participant, score) {
    if (!participant || !score) return false;
    
    participant.isSending = true;
    renderParticipantsList();
    updateParticipantDisplay();
    
    showStatus(`📤 Отправка оценки для ${participant.name}...`, 'info', 0);
    
    try {
      const catId = selectedCategoryId || categorySelect.value;
      const figureValue = categoriesWithBrigade.includes(catId) 
        ? selectedBrigade 
        : selectedFigure;
      
      const data = {
        judgeId: selectedJudge,
        participantId: participant.id,
        score: score,
        category: selectedCategory,
        figure: figureValue || '',
        brigade: selectedBrigade || ''
      };
      
      const result = await apiRequest('saveScore', data, 30000);
      
      if (result.success) {
        participant.isLocal = false;
        participant.scoreId = result.scoreId || `server_${Date.now()}`;
        
        const map = getCategoryScoresMap(selectedCategory);
        const scoreKey = figureValue 
          ? `${participant.id}_${figureValue}` 
          : String(participant.id);
        delete map[scoreKey];
        scoresByCategory[selectedCategory] = map;
        saveToStorage();
        
        showStatus(`✅ Оценка отправлена!`, 'success', 1500);
        
        participant.isSending = false;
        renderParticipantsList();
        updateParticipantDisplay();
        updateSendScoresButton();
        
        return true;
      } else {
        throw new Error(result.error || 'Неизвестная ошибка');
      }
      
    } catch (error) {
      console.error('Ошибка отправки:', error);
      
      participant.isLocal = true;
      participant.isSending = false;

      const catId = selectedCategoryId || categorySelect.value;
      const figureValue = categoriesWithBrigade.includes(catId) 
        ? selectedBrigade 
        : selectedFigure;
      
      const map = getCategoryScoresMap(selectedCategory);
      const scoreKey = figureValue 
        ? `${participant.id}_${figureValue}` 
        : String(participant.id);

      map[scoreKey] = {
        score: score,
        judgeId: selectedJudge,
        category: selectedCategory,
        figure: selectedFigure || '',
        brigade: selectedBrigade || '',
        timestamp: Date.now(),
        isFirstTime: true,
        participantId: String(participant.id)
      };
      scoresByCategory[selectedCategory] = map;
      saveToStorage();
      
      showStatus(`❌ Ошибка отправки: ${error.message}. Оценка сохранена локально`, 'error', 4000);
      
      renderParticipantsList();
      updateParticipantDisplay();
      updateSendScoresButton();
      
      return false;
    }
  }

  // =========================
  // КНОПКА ОТПРАВКИ ЛОКАЛЬНЫХ ОЦЕНОК
  // =========================
  function updateSendScoresButton() {
    const hasLocalScores = checkIfHasLocalScores();
    sendScoresBtn.style.display = hasLocalScores ? 'block' : 'none';
  }

  function checkIfHasLocalScores() {
    if (!selectedCategory) return false;
    const map = getCategoryScoresMap(selectedCategory);
    return Object.keys(map).length > 0;
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
      applyScoresToParticipantsFromCategory();
      renderParticipantsList();
      updateCounters();
      updateParticipantDisplay();
    });
    
    brigadeSelect.addEventListener('change', () => {
      selectedBrigade = brigadeSelect.value;
      localStorage.setItem(STORAGE_KEYS.BRIGADE, selectedBrigade);
      applyScoresToParticipantsFromCategory();
      renderParticipantsList();
      updateCounters();
      updateParticipantDisplay();
    });
      
    scoreInput.addEventListener('input', function() {
      if (this.value.includes('.')) {
        this.value = this.value.replace('.', ',');
      }
      
      const symbolsToReplace = [
        '.', ';', ':', '/', '\\', '|',
        'а', 'б', 'в', 'г', 'д', 'е', 'ё', 'ж', 'з', 'и', 'й', 'к', 'л', 'м', 'н', 'о', 'п', 
        'р', 'с', 'т', 'у', 'ф', 'х', 'ц', 'ч', 'ш', 'щ', 'ъ', 'ы', 'ь', 'э', 'ю', 'я',
        'А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ё', 'Ж', 'З', 'И', 'Й', 'К', 'Л', 'М', 'Н', 'О', 'П',
        'Р', 'С', 'Т', 'У', 'Ф', 'Х', 'Ц', 'Ч', 'Ш', 'Щ', 'Ъ', 'Ы', 'Ь', 'Э', 'Ю', 'Я',
        'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
        'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
        'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
        'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
        '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', 
        '-', '_', '=', '+', '[', ']', '{', '}', '"', "'", 
        '?', '<', '>', '`', '~'
      ];
      
      symbolsToReplace.forEach(symbol => {
        if (this.value.includes(symbol)) {
          this.value = this.value.replace(new RegExp('\\' + symbol, 'g'), ',');
        }
      });
    });

    scoreInput.addEventListener('blur', function() {
      let value = this.value.replace(',', '.');
      const numValue = parseFloat(value);
      
      if (!isNaN(numValue)) {
        let corrected = Math.max(0, Math.min(10, numValue));
        corrected = Math.round(corrected * 10) / 10;
        this.value = corrected.toString().replace('.', ',');
      }
    });

    toggleParticipantsBtn.addEventListener('click', toggleParticipantsList);
    submitBtn.addEventListener('click', handleSubmit);
    skipBtn.addEventListener('click', handleSkip);
    sendScoresBtn.addEventListener('click', sendAllLocalScores);

    scoreInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && !submitBtn.disabled) submitBtn.click();
    });

    if (resetSessionBtn) {
      resetSessionBtn.addEventListener('click', () => {
        resetAll();

        judgeSelect.value = '';
        categorySelect.value = '';
        figureSelect.value = '';
        figureGroup.style.display = 'none';
        brigadeGroup.style.display = 'none';
        sendScoresBtn.style.display = 'none';

        renderParticipantsList();
        updateCounters();
        updateParticipantDisplay();

        showStatus('✅ Сессия сброшена', 'info', 1500);
      });
    }
    
    // Кастомная клавиатура
    const customKeyboard = document.getElementById('customKeyboard');
    const toggleKeyboardBtn = document.getElementById('toggleKeyboardBtn');
    
    toggleKeyboardBtn.addEventListener('click', function() {
      if (customKeyboard.style.display === 'none' || customKeyboard.style.display === '') {
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
        const scoreInput = document.getElementById('scoreInput');
        
        if (value === ',') {
          if (!scoreInput.value.includes(',')) {
            scoreInput.value += ',';
          }
        } else if (this.id === 'keyboardBackspace') {
          scoreInput.value = scoreInput.value.slice(0, -1);
        } else {
          scoreInput.value += value;
        }
        
        scoreInput.dispatchEvent(new Event('input'));
      });
    });
    
    scoreInput.addEventListener('focus', function() {
      if (customKeyboard.style.display === 'none' || customKeyboard.style.display === '') {
        customKeyboard.style.display = 'block';
        toggleKeyboardBtn.innerHTML = '<i class="fas fa-keyboard"></i> Скрыть клавиатуру';
      }
    });

    window.addEventListener('beforeunload', (e) => {
      const hasAnyScores = Object.values(scoresByCategory || {}).some(
        (m) => m && Object.keys(m).length > 0
      );
      if (hasAnyScores && !isAutoSending) {
        e.preventDefault();
        e.returnValue = 'У вас есть неотправленные оценки. Выйти?';
      }
    });
  }

  // =========================
  // CATEGORY CHANGE
  // =========================
  async function handleCategoryChange() {
    const selectedOption = categorySelect.options[categorySelect.selectedIndex];
    const newCategoryText = selectedOption.text;
    const newCategoryValue = selectedOption.value; // ID: "1", "2"...

    selectedCategory = newCategoryText;
    selectedCategoryId = newCategoryValue;

    localStorage.setItem(STORAGE_KEYS.CATEGORY, selectedCategory);
    localStorage.setItem(STORAGE_KEYS.CATEGORY_ID, selectedCategoryId);

    selectedFigure = '';
    figureSelect.value = '';
    localStorage.removeItem(STORAGE_KEYS.FIGURE);

    // Проверяем по ID
    if (CATEGORIES_WITH_FIGURES[newCategoryValue]) {
      figureGroup.style.display = 'block';
      updateFigures(newCategoryValue);
    } else {
      figureGroup.style.display = 'none';
      figureSelect.innerHTML = '<option value="">-- Выберите фигуру --</option>';
    }
    
    selectedBrigade = '';
    brigadeSelect.value = '';
    localStorage.removeItem(STORAGE_KEYS.BRIGADE);
    
    // Проверяем по ID
    if (categoriesWithBrigade.includes(newCategoryValue)) {
      brigadeGroup.style.display = 'block';
    } else {
      brigadeGroup.style.display = 'none';
    }

    currentIndex = 0;
    await loadParticipants(newCategoryText, false);

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
  // SUBMIT / SKIP
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

    const currentCategoryValue = categorySelect.value; // ID

    if (CATEGORIES_WITH_FIGURES[currentCategoryValue] && !selectedFigure) {
      showStatus('⚠️ Выберите фигуру!', 'error', 2500);
      figureSelect.focus();
      return false;
    }

    if (categoriesWithBrigade.includes(currentCategoryValue) && !selectedBrigade) {
      showStatus('⚠️ Выберите бригаду!', 'error', 2500);
      brigadeSelect.focus();
      return false;
    }
    
    let score = scoreInput.value.trim();
    
    if (score.includes('.')) {
      score = score.replace('.', ',');
      scoreInput.value = score;
    }
    
    if (!score) {
      showStatus('⚠️ Введите балл!', 'error', 2500);
      scoreInput.focus();
      return false;
    }
    
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

    if (p.isSending) {
      showStatus('⏳ Оценка уже отправляется...', 'info', 1500);
      return;
    }

    let msg = `Вы уверены, что хотите оценить участника?<br><br>`;
    msg += `<strong>Судья:</strong> ${judge ? judge.shortName : ''}<br>`;
    msg += `<strong>Участник:</strong> ${p.name}<br>`;
    msg += `<strong>Категория:</strong> ${selectedCategory}<br>`;
    if (selectedFigure) {
      const figureText = figureSelect.options[figureSelect.selectedIndex]?.text;
      msg += `<strong>Фигура:</strong> ${figureText}<br>`;
    }
    if (selectedBrigade) {
      const brigadeText = brigadeSelect.options[brigadeSelect.selectedIndex]?.text;
      msg += `<strong>Бригада:</strong> ${brigadeText}<br>`;
    }
    msg += `<strong>Балл:</strong> ${score}`;

    showConfirmationDialog(msg, async (confirmed) => {
      if (!confirmed) return;

      saveScoreForCurrentCategory(p.id, score);

      p.score = score;
      p.scoreId = `local_${Date.now()}`;
      p.isLocal = true;

      updateCounters();
      renderParticipantsList();
      updateParticipantDisplay();

      const sent = await sendSingleScore(p, score);
      
      if (sent) {
        setTimeout(() => goToNextParticipant(), 500);
      } else {
        showStatus('⚠️ Оценка сохранена локально. Повторите отправку позже.', 'warning', 3000);
      }
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

    const catId = selectedCategoryId || categorySelect.value;
    const figureValue = categoriesWithBrigade.includes(catId) 
      ? selectedBrigade 
      : selectedFigure;

    const scoreKey = figureValue 
      ? `${participantId}_${figureValue}` 
      : String(participantId);

    const existing = map[scoreKey];
    const isFirstTime = !existing;
    
    map[scoreKey] = {
      score,
      judgeId: selectedJudge,
      category: categoryText,
      figure: selectedFigure || '',
      brigade: selectedBrigade || '',
      timestamp: Date.now(),
      isFirstTime: isFirstTime,
      participantId: String(participantId)
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

    document.getElementById('editSave').addEventListener('click', async () => {
      const newScore = input.value.trim();
      const n = parseFloat(newScore.replace(',', '.'));

      if (!newScore) return alert('Введите новую оценку');
      if (Number.isNaN(n) || n < 0 || n > 10) return alert('Оценка должна быть от 0 до 10');

      const categoryText = selectedCategory || '';
      const map = getCategoryScoresMap(categoryText);

      const catId = selectedCategoryId || categorySelect.value;
      const figureValue = categoriesWithBrigade.includes(catId)
        ? selectedBrigade
        : selectedFigure;

      const scoreKey = figureValue
        ? `${participant.id}_${figureValue}`
        : String(participant.id);
      
      map[scoreKey] = {
        score: newScore,
        judgeId: selectedJudge,
        category: categoryText,
        figure: selectedFigure || '',
        brigade: selectedBrigade || '',
        timestamp: Date.now(),
        isFirstTime: false,
        participantId: String(participant.id)
      };
      
      scoresByCategory[categoryText] = map;
      saveToStorage();

      participant.score = newScore;
      participant.scoreId = `local_${Date.now()}`;
      participant.isLocal = true;

      await sendSingleScore(participant, newScore);

      updateCounters();
      renderParticipantsList();
      updateSendScoresButton();

      document.body.removeChild(modal);
      showStatus('✅ Оценка изменена и отправлена', 'info', 1200);
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
  // ОТПРАВКА ВСЕХ ЛОКАЛЬНЫХ ОЦЕНОК
  // =========================
  async function sendAllLocalScores() {
    if (!selectedCategory) return;
    
    const map = getCategoryScoresMap(selectedCategory);
    const entries = Object.entries(map);
    
    if (entries.length === 0) {
      sendScoresBtn.style.display = 'none';
      return;
    }

    const newScores = entries.filter(([_, s]) => s.isFirstTime).length;
    const modifiedScores = entries.filter(([_, s]) => !s.isFirstTime).length;
    
    const confirmMsg = 
      `Отправить все локальные оценки на сервер?\n\n` +
      `Категория: ${selectedCategory}\n` +
      `Всего оценок: ${entries.length}\n` +
      `Новых: ${newScores}\n` +
      `Измененных: ${modifiedScores}`;

    if (!confirm(confirmMsg)) return;

    isAutoSending = true;
    sendScoresBtn.style.display = 'none';
    showStatus(`📤 Отправка ${entries.length} оценок...`, 'info', 0);

    let successCount = 0;
    let failCount = 0;

    for (const [scoreKey, scoreData] of entries) {
      const participant = participants.find(
        p => String(p.id) === String(scoreData.participantId)
      );
      if (!participant) continue;

      participant.isSending = true;
      renderParticipantsList();

      try {
        const data = {
          judgeId: scoreData.judgeId,
          participantId: scoreData.participantId,
          score: scoreData.score,
          category: scoreData.category,
          figure: scoreData.figure || '',
          brigade: scoreData.brigade || ''
        };

        const result = await apiRequest('saveScore', data, 30000);

        if (result.success) {
          successCount++;
          delete map[scoreKey];
          participant.isLocal = false;
          participant.scoreId = result.scoreId || `server_${Date.now()}`;
        } else {
          failCount++;
          participant.isLocal = true;
        }
      } catch (error) {
        console.error('Ошибка отправки:', error);
        failCount++;
        participant.isLocal = true;
      } finally {
        participant.isSending = false;
      }

      await new Promise(resolve => setTimeout(resolve, 300));
    }

    scoresByCategory[selectedCategory] = map;
    saveToStorage();

    renderParticipantsList();
    updateSendScoresButton();
    isAutoSending = false;

    if (failCount === 0) {
      showStatus(`✅ Успешно отправлено ${successCount} оценок!`, 'success', 3000);
    } else {
      showStatus(`⚠️ Отправлено: ${successCount}, ошибок: ${failCount}`, 'warning', 5000);
    }
  }

  console.log('✅ Система судейства готова к работе');
});

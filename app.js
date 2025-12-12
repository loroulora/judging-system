document.addEventListener('DOMContentLoaded', function() {
    // КОНФИГУРАЦИЯ API - берем из config.js
    const API_URL = window.APP_CONFIG?.API_URL || 
        'https://script.google.com/macros/s/AKfycbwLGtk5t5mK-CwR7hEKcYlIDM6R6JqIv1NeKsAztDBTK7zewiLQjbLyxk2CHU3DGqZx/exec';
    
    // Ключи для localStorage
    const STORAGE_KEYS = {
        JUDGE: 'judging_system_judge',
        CATEGORY: 'judging_system_category',
        FIGURE: 'judging_system_figure',
        SCORES: 'judging_system_scores',
        CURRENT_INDEX: 'judging_system_current_index',
        PARTICIPANTS: 'judging_system_participants'
    };
    
    // Кэш для данных
    const cache = {
        judges: null,
        participants: {},
        lastCacheTime: {
            judges: 0,
            participants: {}
        },
        ttl: 5 * 60 * 1000 // 5 минут
    };
    
    // Состояние приложения
    let judges = [];
    let participants = [];
    let currentIndex = 0;
    let selectedCategory = '';
    let selectedFigure = '';
    let selectedJudge = '';
    let isParticipantsListVisible = false;
    
    // Хранилище локальных оценок
    let localScores = new Map(); // participantId -> {score, figure, timestamp}
    let isAutoSending = false; // Флаг для предотвращения повторной отправки
    
    // Элементы DOM
    const judgeSelect = document.getElementById('judgeSelect');
    const categorySelect = document.getElementById('categorySelect');
    const figureGroup = document.getElementById('figureGroup');
    const figureSelect = document.getElementById('figureSelect');
    const startNumberElement = document.getElementById('startNumber');
    const fullNameElement = document.getElementById('fullName');
    const scoreInput = document.getElementById('scoreInput');
    const submitBtn = document.getElementById('submitBtn');
    const skipBtn = document.getElementById('skipBtn');
    const statusMessage = document.getElementById('statusMessage');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const participantsList = document.getElementById('participantsList');
    const participantsListContainer = document.getElementById('participantsListContainer');
    const toggleParticipantsBtn = document.getElementById('toggleParticipantsBtn');
    const remainingCount = document.getElementById('remainingCount');
    const evaluatedCount = document.getElementById('evaluatedCount');
    
    // Категории, где требуется выбор фигуры
    const categoriesWithFigures = ['Фигуры «Категория 1»', 'Фигуры «10 лет и моложе»', 'Фигуры «12 лет и моложе»'];
    
    // Инициализация
    initApp();
    
    // Инициализация приложения
    async function initApp() {
        try {
            // ВОССТАНАВЛИВАЕМ данные из localStorage
            restoreFromStorage();
            
            // Загружаем судей из Google Sheets
            await loadJudges();
            
            // Заполняем выпадающий список судей
            populateJudgeSelect();
            
            // Восстанавливаем выбор судьи
            if (selectedJudge) {
                judgeSelect.value = selectedJudge;
            }
            
            // Если есть сохраненная категория - загружаем участников
            if (selectedCategory) {
                categorySelect.value = selectedCategory;
                await loadParticipants(selectedCategory, true);
            }
            
            // Настройка обработчиков событий
            setupEventListeners();
            
        } catch (error) {
            showStatus('Ошибка загрузки: ' + error.message, 'error');
            console.error('Ошибка инициализации:', error);
        }
    }
    
    // Восстановление данных из localStorage
    function restoreFromStorage() {
        try {
            selectedJudge = localStorage.getItem(STORAGE_KEYS.JUDGE) || '';
            selectedCategory = localStorage.getItem(STORAGE_KEYS.CATEGORY) || '';
            selectedFigure = localStorage.getItem(STORAGE_KEYS.FIGURE) || '';
            
            const savedIndex = localStorage.getItem(STORAGE_KEYS.CURRENT_INDEX);
            currentIndex = savedIndex ? parseInt(savedIndex) : 0;
            
            const savedScores = localStorage.getItem(STORAGE_KEYS.SCORES);
            if (savedScores) {
                const scoresArray = JSON.parse(savedScores);
                localScores = new Map(scoresArray);
                console.log('Восстановлено оценок:', localScores.size);
            }
            
            const savedParticipants = localStorage.getItem(STORAGE_KEYS.PARTICIPANTS);
            if (savedParticipants) {
                participants = JSON.parse(savedParticipants);
                console.log('Восстановлены участники:', participants.length);
                applyLocalScoresToParticipants();
            }
            
        } catch (error) {
            console.error('Ошибка восстановления:', error);
            clearStorage();
        }
    }
    
    // Сохранение данных в localStorage
    function saveToStorage() {
        try {
            if (selectedJudge) localStorage.setItem(STORAGE_KEYS.JUDGE, selectedJudge);
            if (selectedCategory) localStorage.setItem(STORAGE_KEYS.CATEGORY, selectedCategory);
            if (selectedFigure) localStorage.setItem(STORAGE_KEYS.FIGURE, selectedFigure);
            
            localStorage.setItem(STORAGE_KEYS.CURRENT_INDEX, currentIndex.toString());
            
            if (localScores.size > 0) {
                const scoresArray = Array.from(localScores.entries());
                localStorage.setItem(STORAGE_KEYS.SCORES, JSON.stringify(scoresArray));
            } else {
                localStorage.removeItem(STORAGE_KEYS.SCORES);
            }
            
            if (participants.length > 0) {
                localStorage.setItem(STORAGE_KEYS.PARTICIPANTS, JSON.stringify(participants));
            }
            
        } catch (error) {
            console.error('Ошибка сохранения:', error);
        }
    }
    
    // Очистка localStorage
    function clearStorage() {
        Object.values(STORAGE_KEYS).forEach(key => {
            localStorage.removeItem(key);
        });
        localScores.clear();
    }
    
    // Применение локальных оценок к участникам
    function applyLocalScoresToParticipants() {
        participants.forEach(participant => {
            const savedScore = localScores.get(participant.id.toString());
            if (savedScore) {
                participant.score = savedScore.score;
                participant.scoreId = `local_${savedScore.timestamp}`;
                participant.modified = false;
                participant.isLocal = true;
            }
        });
        updateCounters();
    }
    
    // Настройка обработчиков событий
    function setupEventListeners() {
        categorySelect.addEventListener('change', handleCategoryChange);
        
        figureSelect.addEventListener('change', function() {
            selectedFigure = this.value;
            localStorage.setItem(STORAGE_KEYS.FIGURE, selectedFigure);
        });
        
        toggleParticipantsBtn.addEventListener('click', toggleParticipantsList);
        submitBtn.addEventListener('click', handleSubmit);
        skipBtn.addEventListener('click', handleSkip);
        
        scoreInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                submitBtn.click();
            }
        });
        
        // Автосохранение при изменении
        setupAutoSave();
        
        // Предупреждение при закрытии
        window.addEventListener('beforeunload', function(e) {
            if (localScores.size > 0 && !isAutoSending) {
                e.preventDefault();
                e.returnValue = 'У вас есть несохраненные оценки. Выйти?';
            }
        });
        
        // Автоотправка при завершении всех участников
        setupAutoSendCheck();
    }
    
    // Настройка автосохранения
    function setupAutoSave() {
        let saveTimer;
        
        function scheduleSave() {
            clearTimeout(saveTimer);
            saveTimer = setTimeout(saveToStorage, 500);
        }
        
        ['input', 'change', 'click'].forEach(event => {
            document.addEventListener(event, scheduleSave, { passive: true });
        });
    }
    
    // Проверка на завершение всех участников
    function setupAutoSendCheck() {
        // Проверяем каждое изменение currentIndex
        const originalGoToNext = goToNextParticipant;
        goToNextParticipant = function() {
            originalGoToNext();
            
            // Если все участники оценены или пропущены
            if (currentIndex >= participants.length && participants.length > 0) {
                // Ждем 1 секунду и проверяем автоотправку
                setTimeout(() => {
                    checkAutoSend();
                }, 1000);
            }
        };
    }
    
    // Проверка и автоотправка
    async function checkAutoSend() {
        if (isAutoSending || localScores.size === 0) return;
        
        const evaluatedCount = participants.filter(p => p.score !== null).length;
        const totalCount = participants.length;
        
        // Если оценено больше 70% участников - предлагаем отправить
        if (evaluatedCount >= totalCount * 0.7) {
            const confirmed = confirm(
                `Вы оценили ${evaluatedCount} из ${totalCount} участников.\n\n` +
                `Отправить ${localScores.size} оценок в Google Sheets?\n\n` +
                `✅ Все данные сохранятся автоматически\n` +
                `🔄 Страница обновится после отправки`
            );
            
            if (confirmed) {
                await saveBatchToSheets();
            }
        }
    }
    
    // Загрузить судей
    async function loadJudges() {
        const now = Date.now();
        if (cache.judges && (now - cache.lastCacheTime.judges < cache.ttl)) {
            judges = cache.judges;
            console.log('Судьи из кэша');
            return;
        }
        
        try {
            showStatus('Проверка подключения...', 'info');
            
            // Используем API_URL из config.js
            const response = await fetch(`${API_URL}?action=getJudges`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            if (data.judges) {
                judges = data.judges;
                cache.judges = judges;
                cache.lastCacheTime.judges = now;
                statusMessage.style.display = 'none';
                console.log('Судьи загружены:', judges.length);
            } else {
                throw new Error('Неверный формат ответа от сервера');
            }
        } catch (error) {
            console.error('Ошибка загрузки судей:', error);
            
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                showStatus('❌ Ошибка сети. Проверьте подключение к интернету.', 'error');
            } else if (error.message.includes('CORS')) {
                showStatus('❌ Ошибка доступа. Проверьте настройки Google Apps Script.', 'error');
            } else {
                showStatus('❌ Ошибка: ' + error.message, 'error');
            }
            
            // Создаем заглушку для тестирования
            judges = [
                { id: 1, name: 'Тестовый Судья 1', shortName: 'Тест1 Т.Т.' },
                { id: 2, name: 'Тестовый Судья 2', shortName: 'Тест2 Т.Т.' }
            ];
            console.log('Используются тестовые данные судей');
        }
    }
    
    // Заполнить список судей
    function populateJudgeSelect() {
        judgeSelect.innerHTML = '<option value="">-- Выберите судью --</option>';
        
        judges.forEach(judge => {
            const option = document.createElement('option');
            option.value = judge.id;
            option.textContent = judge.shortName || judge.name;
            judgeSelect.appendChild(option);
        });
        
        judgeSelect.addEventListener('change', function() {
            selectedJudge = this.value;
            localStorage.setItem(STORAGE_KEYS.JUDGE, selectedJudge);
            
            if (participants.length > 0) {
                applyLocalScoresToParticipants();
                renderParticipantsList();
            }
        });
    }
    
    // Обработчик изменения категории
    async function handleCategoryChange() {
        const newCategory = categorySelect.options[categorySelect.selectedIndex].text;
        
        if (selectedCategory !== newCategory) {
            // Спрашиваем подтверждение только если есть оценки
            if (localScores.size > 0 && selectedCategory) {
                const confirmed = confirm(
                    `У вас есть ${localScores.size} оценок для "${selectedCategory}".\n` +
                    `Сменить категорию?`
                );
                if (!confirmed) {
                    categorySelect.value = selectedCategory;
                    return;
                }
            }
            
            selectedCategory = newCategory;
            localStorage.setItem(STORAGE_KEYS.CATEGORY, selectedCategory);
            
            selectedFigure = '';
            figureSelect.value = '';
            localStorage.removeItem(STORAGE_KEYS.FIGURE);
            
            // Показываем/скрываем выбор фигуры
            if (categoriesWithFigures.includes(selectedCategory)) {
                figureGroup.style.display = 'block';
            } else {
                figureGroup.style.display = 'none';
            }
            
            await loadParticipants(selectedCategory, false);
            
            currentIndex = 0;
            updateParticipantDisplay();
            updateCounters();
            saveToStorage();
        }
    }
    
    // Загрузить участников
    async function loadParticipants(category, isRestoring = false) {
        const now = Date.now();
        if (cache.participants[category] && 
            (now - (cache.lastCacheTime.participants[category] || 0) < cache.ttl) && !isRestoring) {
            participants = cache.participants[category];
            console.log(`Участники "${category}" из кэша:`, participants.length);
            applyLocalScoresToParticipants();
            renderParticipantsList();
            updateCounters();
            updateParticipantDisplay();
            return;
        }
        
        try {
            if (!isRestoring) showStatus(`Загрузка участников...`, 'info');
            
            // Используем API_URL из config.js
            const response = await fetch(`${API_URL}?action=getParticipants&category=${encodeURIComponent(category)}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            if (data.participants) {
                participants = data.participants.map(p => ({
                    ...p,
                    score: null,
                    modified: false,
                    scoreId: null,
                    isLocal: false
                }));
                
                cache.participants[category] = participants;
                cache.lastCacheTime.participants[category] = now;
                
                console.log(`Участники "${category}" загружены:`, participants.length);
                applyLocalScoresToParticipants();
                renderParticipantsList();
                updateCounters();
                updateParticipantDisplay();
                
                if (!isRestoring) {
                    statusMessage.style.display = 'none';
                    saveToStorage();
                }
            } else {
                // Если нет участников, создаем тестовые данные
                console.log('Нет участников, создаем тестовые данные');
                participants = Array.from({length: 10}, (_, i) => ({
                    id: i + 1,
                    number: i + 1,
                    name: `Тестовый участник ${i + 1}`,
                    program: category,
                    score: null,
                    modified: false,
                    scoreId: null,
                    isLocal: false
                }));
                
                cache.participants[category] = participants;
                applyLocalScoresToParticipants();
                renderParticipantsList();
                updateCounters();
                updateParticipantDisplay();
            }
        } catch (error) {
            console.error('Ошибка загрузки участников:', error);
            
            // Создаем тестовые данные при ошибке
            participants = Array.from({length: 10}, (_, i) => ({
                id: i + 1,
                number: i + 1,
                name: `Тестовый участник ${i + 1}`,
                program: category,
                score: null,
                modified: false,
                scoreId: null,
                isLocal: false
            }));
            
            cache.participants[category] = participants;
            applyLocalScoresToParticipants();
            renderParticipantsList();
            updateCounters();
            updateParticipantDisplay();
            
            showStatus('⚠️ Используются тестовые данные', 'error', 2000);
        }
    }
    
    // Обновить отображение участника
    function updateParticipantDisplay() {
        if (participants.length === 0) {
            startNumberElement.textContent = "-";
            fullNameElement.textContent = "Нет участников";
            scoreInput.value = '';
            return;
        }
        
        if (currentIndex < participants.length) {
            const participant = participants[currentIndex];
            startNumberElement.textContent = participant.number || '-';
            fullNameElement.textContent = participant.name || '-';
            
            // Автозаполнение оценки
            scoreInput.value = participant.score !== null ? participant.score : '';
            
            // Прогресс
            const progress = ((currentIndex) / participants.length) * 100;
            progressBar.style.width = `${progress}%`;
            progressText.textContent = `Участник ${currentIndex + 1} из ${participants.length}`;
            
            // Фокус на поле ввода
            setTimeout(() => scoreInput.focus(), 100);
        } else {
            startNumberElement.textContent = "-";
            fullNameElement.textContent = "Все участники оценены";
            progressBar.style.width = '100%';
            progressText.textContent = "Все участники оценены";
            scoreInput.value = '';
            
            // Показываем сообщение об автоотправке
            if (localScores.size > 0) {
                setTimeout(() => {
                    checkAutoSend();
                }, 500);
            }
        }
    }
    
    // Рендеринг списка участников
    function renderParticipantsList() {
        participantsList.innerHTML = '';
        
        participants.forEach((participant, index) => {
            const participantItem = document.createElement('div');
            participantItem.className = 'participant-item';
            
            if (index === currentIndex) participantItem.classList.add('current');
            if (participant.score !== null) participantItem.classList.add('evaluated');
            if (participant.isLocal) {
                participantItem.classList.add('local');
                participantItem.title = "Оценка сохранена локально";
            }
            
            participantItem.innerHTML = `
                <div class="participant-info">
                    <span>${index + 1}. ${participant.name} (№${participant.number})</span>
                </div>
                <div class="participant-actions">
                    <span class="participant-score">${participant.score !== null ? participant.score : '—'}</span>
                    ${participant.score !== null ? `
                    <button class="edit-btn" data-id="${participant.id}">
                        <i class="fas fa-edit"></i> Изменить
                    </button>
                    ` : ''}
                </div>
            `;
            
            participantsList.appendChild(participantItem);
        });
        
        // Добавляем обработчики для кнопок редактирования
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const participantId = parseInt(this.getAttribute('data-id'));
                const participant = participants.find(p => p.id == participantId);
                if (participant) {
                    showEditDialog(participant);
                }
            });
        });
    }
    
    // Диалог редактирования оценки
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
        
        const editScoreInput = document.getElementById('editScoreInput');
        editScoreInput.focus();
        
        document.getElementById('editSave').addEventListener('click', function() {
            const newScore = editScoreInput.value.trim();
            
            if (!newScore) {
                alert('⚠️ Введите новую оценку!');
                editScoreInput.focus();
                return;
            }
            
            const scoreNum = parseFloat(newScore);
            if (isNaN(scoreNum) || scoreNum < 1 || scoreNum > 10) {
                alert('⚠️ Оценка должна быть от 1 до 10');
                editScoreInput.focus();
                return;
            }
            
            // Сохраняем новую оценку локально
            saveScoreLocally(participant.id, newScore);
            
            // Обновляем участника
            participant.score = newScore;
            participant.scoreId = `local_${Date.now()}`;
            participant.isLocal = true;
            
            // Обновляем интерфейс
            updateCounters();
            renderParticipantsList();
            document.body.removeChild(modal);
            
            showStatus('✅ Оценка изменена', 'info', 1500);
        });
        
        document.getElementById('editCancel').addEventListener('click', function() {
            document.body.removeChild(modal);
        });
        
        editScoreInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                document.getElementById('editSave').click();
            }
        });
        
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }
    
    // Переключение списка
    function toggleParticipantsList() {
        isParticipantsListVisible = !isParticipantsListVisible;
        
        if (isParticipantsListVisible) {
            participantsListContainer.style.display = 'block';
            toggleParticipantsBtn.innerHTML = '<i class="fas fa-chevron-up"></i> Скрыть список';
            toggleParticipantsBtn.classList.add('expanded');
            
            // Скролл к текущему участнику
            setTimeout(() => {
                const currentParticipant = document.querySelector('.participant-item.current');
                if (currentParticipant) {
                    currentParticipant.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
        } else {
            participantsListContainer.style.display = 'none';
            toggleParticipantsBtn.innerHTML = '<i class="fas fa-chevron-down"></i> Показать список';
            toggleParticipantsBtn.classList.remove('expanded');
        }
    }
    
    // Обновить счетчики
    function updateCounters() {
        const evaluated = participants.filter(p => p.score !== null).length;
        const remaining = participants.length - evaluated;
        
        evaluatedCount.textContent = evaluated;
        remainingCount.textContent = remaining;
    }
    
    // Показать статус
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
    
    // Диалог подтверждения
    function showConfirmationDialog(message, callback) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        
        const dialog = document.createElement('div');
        dialog.className = 'modal-dialog';
        
        dialog.innerHTML = `
            <div style="font-size: 18px; margin-bottom: 20px; color: #2c3e50;">${message}</div>
            <div class="modal-buttons">
                <button id="confirmCancel" style="background: #6c757d; color: white;">Отмена</button>
                <button id="confirmOk" style="background: #28a745; color: white;">ОК</button>
            </div>
        `;
        
        modal.appendChild(dialog);
        document.body.appendChild(modal);
        
        document.getElementById('confirmOk').addEventListener('click', function() {
            document.body.removeChild(modal);
            if (callback) callback(true);
        });
        
        document.getElementById('confirmCancel').addEventListener('click', function() {
            document.body.removeChild(modal);
            if (callback) callback(false);
        });
        
        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                document.body.removeChild(modal);
                if (callback) callback(false);
            }
        });
    }
    
    // Обработчик отправки оценки (С ПОДТВЕРЖДЕНИЕМ!)
    async function handleSubmit() {
        if (!validateForm()) return;
        
        const participant = participants[currentIndex];
        const score = scoreInput.value.trim();
        const judge = judges.find(j => j.id == selectedJudge);
        
        // ПОДТВЕРЖДЕНИЕ ОЦЕНКИ
        let confirmMessage = `Вы уверены, что хотите оценить участника?<br><br>`;
        confirmMessage += `<strong>Судья:</strong> ${judge ? judge.shortName : ''}<br>`;
        confirmMessage += `<strong>Участник:</strong> ${participant.name}<br>`;
        confirmMessage += `<strong>Категория:</strong> ${selectedCategory}<br>`;
        
        if (selectedFigure) {
            const figureText = figureSelect.options[figureSelect.selectedIndex]?.text;
            confirmMessage += `<strong>Фигура:</strong> ${figureText}<br>`;
        }
        
        confirmMessage += `<strong>Балл:</strong> ${score}`;
        
        showConfirmationDialog(confirmMessage, function(confirmed) {
            if (confirmed) {
                // Сохраняем локально
                saveScoreLocally(participant.id, score);
                
                // Обновляем участника
                participant.score = score;
                participant.scoreId = `local_${Date.now()}`;
                participant.isLocal = true;
                
                // Обновляем интерфейс
                updateCounters();
                renderParticipantsList();
                
                showStatus('✅ Оценка сохранена', 'info', 1500);
                
                // Переходим к следующему через 0.5 секунды
                setTimeout(() => {
                    goToNextParticipant();
                }, 500);
            }
        });
    }
    
    // Сохранить оценку локально
    function saveScoreLocally(participantId, score) {
        localScores.set(participantId.toString(), {
            score: score,
            judgeId: selectedJudge,
            category: selectedCategory,
            figure: selectedFigure || '',
            timestamp: Date.now()
        });
        saveToStorage();
    }
    
    // Валидация формы
    function validateForm() {
        if (!selectedJudge) {
            showStatus('⚠️ Выберите судью!', 'error');
            judgeSelect.focus();
            return false;
        }
        
        if (!selectedCategory) {
            showStatus('⚠️ Выберите категорию!', 'error');
            categorySelect.focus();
            return false;
        }
        
        if (categoriesWithFigures.includes(selectedCategory) && !selectedFigure) {
            showStatus('⚠️ Выберите фигуру!', 'error');
            figureSelect.focus();
            return false;
        }
        
        const score = scoreInput.value.trim();
        if (!score) {
            showStatus('⚠️ Введите балл!', 'error');
            scoreInput.focus();
            return false;
        }
        
        const scoreNum = parseFloat(score);
        if (isNaN(scoreNum) || scoreNum < 1 || scoreNum > 10) {
            showStatus('⚠️ Оценка должна быть от 1 до 10', 'error');
            scoreInput.focus();
            return false;
        }
        
        return true;
    }
    
    // Пропуск участника
    function handleSkip() {
        if (currentIndex >= participants.length) return;
        
        if (!selectedJudge) {
            showStatus('⚠️ Выберите судью!', 'error');
            judgeSelect.focus();
            return;
        }
        
        const participant = participants[currentIndex];
        const judge = judges.find(j => j.id == selectedJudge);
        
        showConfirmationDialog(
            `Вы уверены, что хотите пропустить участника?<br><br>
            <strong>Судья:</strong> ${judge ? judge.shortName : ''}<br>
            <strong>Участник:</strong> ${participant.name}`,
            function(confirmed) {
                if (confirmed) {
                    setTimeout(() => {
                        goToNextParticipant();
                    }, 300);
                }
            }
        );
    }
    
    // Переход к следующему участнику
    function goToNextParticipant() {
        if (currentIndex < participants.length - 1) {
            currentIndex++;
            updateParticipantDisplay();
            renderParticipantsList();
            saveToStorage();
            
            // Скролл к текущему участнику в списке
            if (isParticipantsListVisible) {
                setTimeout(() => {
                    const currentParticipant = document.querySelector('.participant-item.current');
                    if (currentParticipant) {
                        currentParticipant.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, 100);
            }
        } else if (currentIndex === participants.length - 1) {
            currentIndex++;
            updateParticipantDisplay();
            renderParticipantsList();
            saveToStorage();
        }
    }
    
    // ОТПРАВКА ВСЕХ ОЦЕНОК АВТОМАТИЧЕСКИ
    async function saveBatchToSheets() {
        if (isAutoSending || localScores.size === 0) return;
        
        isAutoSending = true;
        showStatus(`📤 Отправка ${localScores.size} оценок...`, 'info');
        
        try {
            const scoresArray = Array.from(localScores.entries()).map(([participantId, scoreData]) => ({
                participantId: participantId,
                judgeId: scoreData.judgeId,
                score: scoreData.score,
                category: scoreData.category,
                figure: scoreData.figure,
                timestamp: scoreData.timestamp
            }));
            
            // Используем API_URL из config.js
            const response = await fetch(`${API_URL}?action=saveScoresBatch&data=${encodeURIComponent(JSON.stringify({
                scores: scoresArray,
                judgeId: selectedJudge,
                category: selectedCategory
            }))}`);
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                showStatus(`✅ ${localScores.size} оценок отправлены!`, 'info', 3000);
                
                setTimeout(() => {
                    alert(`🎉 Все оценки успешно сохранены!\n\n` +
                          `Судья: ${judges.find(j => j.id == selectedJudge)?.name || ''}\n` +
                          `Категория: ${selectedCategory}\n` +
                          `Оценок: ${localScores.size}`);
                }, 1000);
                
                // Очищаем хранилище
                clearStorage();
                
                // Обновляем статус участников
                participants.forEach(p => {
                    if (p.isLocal) p.isLocal = false;
                });
                
                renderParticipantsList();
                updateCounters();
                
                // Автообновление через 3 секунды
                setTimeout(() => {
                    location.reload();
                }, 3000);
                
            } else {
                throw new Error(data.error || 'Ошибка сервера при сохранении');
            }
            
        } catch (error) {
            isAutoSending = false;
            
            console.error('Ошибка отправки:', error);
            
            if (error.message.includes('Failed to fetch')) {
                showStatus('❌ Ошибка сети. Проверьте подключение.', 'error', 5000);
            } else if (error.message.includes('CORS')) {
                showStatus('❌ Ошибка доступа. Проверьте настройки Google Apps Script.', 'error', 5000);
            } else {
                showStatus(`❌ Ошибка отправки: ${error.message}`, 'error', 5000);
            }
            
            // Предлагаем сохранить оценки локально
            const saveLocally = confirm(
                `Не удалось отправить оценки.\n\n` +
                `Хотите сохранить их локально для последующей отправки?\n\n` +
                `(Все оценки сохранены в localStorage и будут восстановлены при повторном открытии)`
            );
            
            if (saveLocally) {
                showStatus('✅ Оценки сохранены локально', 'info', 3000);
            }
        }
    }
    
    console.log('✅ Система судейства готова к работе!');
});
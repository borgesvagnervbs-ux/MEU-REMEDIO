// ===== INDEXEDDB =====
const DB_NAME = 'LembretesDB';
const STORE_NAME = 'meds';
let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = event => reject("Erro ao abrir o banco de dados.");
    request.onsuccess = event => {
      db = event.target.result;
      resolve(db);
    };
    request.onupgradeneeded = event => {
      db = event.target.result;
      db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
  });
}

async function saveMedIDB(med) {
  const conn = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = conn.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(med);
    request.onsuccess = () => resolve();
    request.onerror = event => reject(event.target.error);
  });
}

async function loadMedsIDB() {
  const conn = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = conn.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = event => resolve(event.target.result);
    request.onerror = event => reject(event.target.error);
  });
}

async function deleteMedIDB(id) {
  const conn = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = conn.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = event => reject(event.target.error);
  });
}

// ===== VARIÁVEIS GLOBAIS =====
const STORAGE_KEY_USER = 'username';
const STORAGE_KEY_ONBOARDING = 'onboarding_complete';
let meds = [];
let lastImage = null;
let lastTriggered = {};
let activeAlarmLoop = null;
let currentActiveMed = null;
let currentSlide = 0;
let currentWizardSlide = 0;
let notificationId = 1;

// ===== RECONHECIMENTO DE VOZ =====
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.lang = 'pt-BR';
  recognition.continuous = false;
  recognition.interimResults = false;
}

function voiceInput(inputId) {
  if (!recognition) {
    alert('Seu navegador não suporta reconhecimento de voz.');
    return;
  }
  const inputElement = document.getElementById(inputId);
  recognition.onresult = (event) => {
    inputElement.value = event.results[0][0].transcript;
  };
  recognition.onerror = () => alert('Erro ao reconhecer a voz.');
  recognition.start();
}

// ===== SPEECH =====
function speak(text) {
  if ('speechSynthesis' in window) {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    speechSynthesis.speak(utterance);
  }
}

// ===== ONBOARDING =====
function nextSlide() {
  const slides = document.querySelectorAll('.onboarding .slide');
  if (currentSlide < slides.length - 1) {
    slides[currentSlide].classList.remove('active');
    currentSlide++;
    slides[currentSlide].classList.add('active');
  }
}

function prevSlide() {
  const slides = document.querySelectorAll('.onboarding .slide');
  if (currentSlide > 0) {
    slides[currentSlide].classList.remove('active');
    currentSlide--;
    slides[currentSlide].classList.add('active');
  }
}

function saveUsername() {
  const username = document.getElementById('usernameSlide').value.trim();
  if (!username) {
    alert('Por favor, digite seu nome.');
    return;
  }
  localStorage.setItem(STORAGE_KEY_USER, username);
  nextSlide();
}

function speakTerms() {
  speak('Termo de Uso. Este aplicativo armazena informações localmente. Consulte sempre seu médico.');
}

function acceptTerms() {
  speak('Termos aceitos.');
  nextSlide();
}

async function requestPermissions() {
  speak('Solicitando permissões.');
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
  localStorage.setItem(STORAGE_KEY_ONBOARDING, 'true');
  document.getElementById('onboarding').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';
  loadMainApp();
}

// ===== INICIALIZAÇÃO =====
window.addEventListener('DOMContentLoaded', async () => {
  const onboardingComplete = localStorage.getItem(STORAGE_KEY_ONBOARDING);
  
  if (onboardingComplete) {
    document.getElementById('onboarding').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    loadMainApp();
  }
  
  try {
    meds = await loadMedsIDB();
    renderList();
  } catch (err) {
    console.error('Erro ao carregar:', err);
  }
});

function loadMainApp() {
  const username = localStorage.getItem(STORAGE_KEY_USER) || 'Você';
  document.getElementById('userGreeting').textContent = `Olá, ${username}!`;
}

// ===== WIZARD =====
function startAddMed() {
  document.getElementById('addMedWizard').style.display = 'block';
  currentWizardSlide = 0;
  updateWizardProgress();
  const now = new Date();
  now.setMinutes(now.getMinutes() + 1);
  const pad = n => n.toString().padStart(2, '0');
  document.getElementById('medStartTime').value = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function cancelAddMed() {
  document.getElementById('addMedWizard').style.display = 'none';
  clearWizardFields();
}

function nextWizard() {
  const slides = document.querySelectorAll('.wizard-slide');
  if (currentWizardSlide === 0 && !document.getElementById('medName').value.trim()) {
    alert('Digite o nome do medicamento.');
    return;
  }
  if (currentWizardSlide === 1 && !document.getElementById('medQuantity').value.trim()) {
    alert('Digite a quantidade.');
    return;
  }
  if (currentWizardSlide < slides.length - 1) {
    slides[currentWizardSlide].classList.remove('active');
    currentWizardSlide++;
    slides[currentWizardSlide].classList.add('active');
    updateWizardProgress();
  }
}

function prevWizard() {
  const slides = document.querySelectorAll('.wizard-slide');
  if (currentWizardSlide > 0) {
    slides[currentWizardSlide].classList.remove('active');
    currentWizardSlide--;
    slides[currentWizardSlide].classList.add('active');
    updateWizardProgress();
  }
}

function updateWizardProgress() {
  const progress = ((currentWizardSlide + 1) / 6) * 100;
  document.getElementById('progressFill').style.width = progress + '%';
  document.getElementById('progressText').textContent = `${currentWizardSlide + 1} de 6`;
}

function previewPhoto() {
  const file = document.getElementById('medPhoto').files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = e => {
      lastImage = e.target.result;
      document.getElementById('photoPreview').innerHTML = `<img src="${lastImage}" alt="Prévia" />`;
    };
    reader.readAsDataURL(file);
  }
}

async function saveMedication() {
  const name = document.getElementById('medName').value.trim();
  const qty = document.getElementById('medQuantity').value.trim();
  const startTime = document.getElementById('medStartTime').value;
  const intervalTime = document.getElementById('medInterval').value;
  const remind = [];
  
  if (document.getElementById('remind5Wizard').checked) remind.push(5);
  if (document.getElementById('remind3Wizard').checked) remind.push(3);
  if (document.getElementById('remind1Wizard').checked) remind.push(1);

  if (!name || !qty || !startTime || !intervalTime) {
    alert('Preencha todos os campos.');
    return;
  }

  const [hours, minutes] = intervalTime.split(':').map(Number);
  const intervalMinutes = hours * 60 + minutes;
  const id = Math.random().toString(36).substring(2, 9) + Date.now();

  const med = { id, name, qty, startTime: new Date(startTime).getTime(), intervalMinutes, img: lastImage, remind, history: [] };

  await saveMedIDB(med);
  meds.push(med);
  renderList();
  
  alert('Lembrete salvo!');
  document.getElementById('addMedWizard').style.display = 'none';
  clearWizardFields();
}

function clearWizardFields() {
  document.getElementById('medName').value = '';
  document.getElementById('medQuantity').value = '';
  document.getElementById('medPhoto').value = '';
  document.getElementById('photoPreview').innerHTML = '<span class="photo-placeholder">📷</span>';
  document.getElementById('remind5Wizard').checked = false;
  document.getElementById('remind3Wizard').checked = false;
  document.getElementById('remind1Wizard').checked = false;
  lastImage = null;
  const slides = document.querySelectorAll('.wizard-slide');
  slides.forEach((slide, i) => slide.classList.toggle('active', i === 0));
  currentWizardSlide = 0;
  updateWizardProgress();
}

// ===== LISTA =====
function renderList() {
  const medList = document.getElementById('medList');
  const emptyState = document.getElementById('emptyState');
  
  if (meds.length === 0) {
    medList.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';
  medList.innerHTML = meds.map(med => {
    const { nextTime } = getNextAlarmTime(med);
    const nextStr = new Date(nextTime).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    
    let historyHTML = '';
    if (med.history && med.history.length > 0) {
      const recent = [...med.history].sort((a, b) => b - a).slice(0, 5);
      historyHTML = `<div class="med-history"><div class="med-history-header"><div class="med-history-title">📊 Histórico</div><div class="med-history-count">${med.history.length}</div></div><div class="med-history-list">${recent.map(t => `<div class="med-history-item"><span class="med-history-icon">✅</span><span>${new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span></div>`).join('')}</div></div>`;
    } else {
      historyHTML = '<div class="med-history"><div class="med-history-header"><div class="med-history-title">📊 Histórico</div><div class="med-history-count">0</div></div><div class="med-history-empty">Nenhuma tomada</div></div>';
    }

    return `<div class="med-card"><div class="med-card-header"><div class="med-image">${med.img ? `<img src="${med.img}" alt="${med.name}"/>` : '💊'}</div><div class="med-info"><div class="med-name">${med.name}</div><div class="med-dose">${med.qty}</div><div class="med-next">📅 ${nextStr}</div></div></div>${historyHTML}<button class="btn-delete" onclick="deleteMed('${med.id}')">🗑️ Excluir</button></div>`;
  }).join('');
}

async function deleteMed(id) {
  if (confirm('Excluir?')) {
    await deleteMedIDB(id);
    meds = meds.filter(m => m.id !== id);
    delete lastTriggered[id];
    renderList();
    alert('Excluído!');
  }
}

// ===== CONFIG =====
function showSettings() {
  document.getElementById('settingsPanel').classList.add('active');
}

function closeSettings() {
  document.getElementById('settingsPanel').classList.remove('active');
}

function testAlarm() {
  if (meds.length) {
    startAlarmLoop(meds[0], Date.now());
    closeSettings();
  } else {
    alert('Cadastre um lembrete primeiro.');
  }
}

async function clearAllData() {
  if (confirm('Excluir TUDO?')) {
    const conn = await openDB();
    const transaction = conn.transaction([STORE_NAME], 'readwrite');
    transaction.objectStore(STORE_NAME).clear();
    meds = [];
    lastTriggered = {};
    stopAlarmLoop();
    renderList();
    alert('Tudo excluído!');
    closeSettings();
  }
}

// ===== ALARME =====
function getNextAlarmTime(med) {
  const now = Date.now();
  const startTime = med.startTime;
  const intervalMs = med.intervalMinutes * 60 * 1000;
  
  if (intervalMs === 0) return { nextTime: startTime };
  
  if (!med.history || med.history.length === 0) {
    if (startTime < now - 600000) {
      const elapsed = now - startTime;
      const passed = Math.floor(elapsed / intervalMs);
      return { nextTime: startTime + (passed + 1) * intervalMs };
    }
    return { nextTime: startTime };
  }
  
  const lastTaken = med.history[med.history.length - 1];
  const nextTime = lastTaken + intervalMs;
  
  if (nextTime < now - 600000) {
    const elapsed = now - lastTaken;
    const passed = Math.floor(elapsed / intervalMs);
    return { nextTime: lastTaken + (passed + 1) * intervalMs };
  }
  return { nextTime };
}

function checkAlarms() {
  const now = Date.now();
  if (activeAlarmLoop) return;
  
  meds.forEach(med => {
    const { nextTime } = getNextAlarmTime(med);
    const diff = nextTime - now;
    if (diff <= 60000 && diff > -60000 && lastTriggered[med.id] !== nextTime) {
      startAlarmLoop(med, nextTime);
      lastTriggered[med.id] = nextTime;
    }
  });
}

function startAlarmLoop(med, nextTime) {
  if (activeAlarmLoop) clearInterval(activeAlarmLoop);
  currentActiveMed = med;

  const alarm = () => {
    const username = localStorage.getItem(STORAGE_KEY_USER) || 'Você';
    const text = `${username}, hora de tomar ${med.qty} de ${med.name}.`;
    document.getElementById('overlayText').innerText = text;
    document.getElementById('overlayImg').src = med.img || '';
    document.getElementById('overlay').style.display = 'flex';
    sendNotification('🚨 ALARME', text);
    speak(text);
    if ('vibrate' in navigator) navigator.vibrate([1000, 500, 1000]);
  };
  
  alarm();
  activeAlarmLoop = setInterval(alarm, 10000);
}

function stopAlarmLoop() {
  if (activeAlarmLoop) clearInterval(activeAlarmLoop);
  activeAlarmLoop = null;
  currentActiveMed = null;
  document.getElementById('overlay').style.display = 'none';
  if ('vibrate' in navigator) navigator.vibrate(0);
  if ('speechSynthesis' in window) speechSynthesis.cancel();
}

// ===== AÇÕES =====
document.getElementById('takenBtn').addEventListener('click', async () => {
  if (currentActiveMed) {
    const med = meds.find(m => m.id === currentActiveMed.id);
    if (med) {
      if (!med.history) med.history = [];
      med.history.push(Date.now());
      await saveMedIDB(med);
      stopAlarmLoop();
      delete lastTriggered[med.id];
      renderList();
      speak('Registrado.');
    }
  }
});

document.getElementById('postpone30').addEventListener('click', () => handlePostpone(30));
document.getElementById('postpone60').addEventListener('click', () => handlePostpone(60));

function handlePostpone(min) {
  if (currentActiveMed) {
    const { nextTime } = getNextAlarmTime(currentActiveMed);
    stopAlarmLoop();
    lastTriggered[currentActiveMed.id] = nextTime + (min * 60000) - 1;
    speak(`Adiado ${min} minutos.`);
    setTimeout(checkAlarms, 1000);
  }
}

document.getElementById('reminderOkBtn').addEventListener('click', () => {
  document.getElementById('reminderOverlay').style.display = 'none';
});

function sendNotification(title, body) {
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="75" font-size="75">💊</text></svg>', vibrate: [200, 100, 200], requireInteraction: true });
  }
}

setInterval(checkAlarms, 10000);
checkAlarms();

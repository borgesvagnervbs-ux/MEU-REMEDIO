// === Registra o service worker ===
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js')
    .then(() => console.log('✅ Service Worker registrado'))
    .catch(err => console.error('Erro SW:', err));
}

// === Elementos principais ===
const STORAGE_KEY = 'meds_v1';
let meds = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
let timers = {};
let currentAlarmMed = null;
let speakInterval = null;

const nameInput = document.getElementById('name');
const qtyInput = document.getElementById('quantity');
const startInput = document.getElementById('startTime');
const intervalInput = document.getElementById('interval');
const photoInput = document.getElementById('photo');
const imgPreview = document.getElementById('imgPreview');
const saveBtn = document.getElementById('saveBtn');
const testNowBtn = document.getElementById('testNow');
const clearAllBtn = document.getElementById('clearAll');
const medList = document.getElementById('medList');
const overlay = document.getElementById('overlay');
const overlayImg = document.getElementById('overlayImg');
const overlayText = document.getElementById('overlayText');
const takenBtn = document.getElementById('takenBtn');
const snoozeBtn = document.getElementById('snoozeBtn');
const micName = document.getElementById('micName');
const micQty = document.getElementById('micQty');

// === Reconhecimento de voz ===
let SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
function startRecognition(onResult) {
  if (!SpeechRecognition) return alert('Reconhecimento de voz não suportado.');
  const rec = new SpeechRecognition();
  rec.lang = 'pt-BR';
  rec.onresult = e => onResult(e.results[0][0].transcript);
  rec.start();
}
micName.onclick = () => startRecognition(text => nameInput.value = text);
micQty.onclick = () => startRecognition(text => qtyInput.value = text);

// === Foto ===
photoInput.addEventListener('change', async e => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  const dataUrl = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(f);
  });
  imgPreview.innerHTML = `<img src="${dataUrl}">`;
  imgPreview.dataset.img = dataUrl;
});

// === Salvar lembrete ===
saveBtn.onclick = () => {
  const name = nameInput.value.trim();
  const qty = qtyInput.value.trim();
  const start = startInput.value;
  const interval = parseInt(intervalInput.value, 10);
  const img = imgPreview.dataset.img || null;
  if (!name || !qty || !start || !interval || !img) return alert('Preencha todos os campos.');

  const med = { id: Date.now().toString(), name, qty, start, intervalMinutes: interval, img };
  meds.push(med);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(meds));
  scheduleMedication(med);
  renderList();
  clearForm();
  requestNotificationPermission();
  alert('Lembrete salvo!');
};

// === Limpar todos ===
clearAllBtn.onclick = () => {
  if (!confirm('Excluir todos os lembretes?')) return;
  for (const id in timers) {
    clearTimeout(timers[id].timeout);
    clearInterval(timers[id].interval);
  }
  meds = [];
  timers = {};
  localStorage.removeItem(STORAGE_KEY);
  renderList();
};

// === Testar agora ===
testNowBtn.onclick = () => {
  const name = nameInput.value.trim() || 'Medicamento';
  const qty = qtyInput.value.trim() || '1 unidade';
  const img = imgPreview.dataset.img || '';
  triggerAlarm({ name, qty, img, id: 'test' });
};

// === Renderiza lista ===
function renderList() {
  medList.innerHTML = '';
  if (meds.length === 0) {
    medList.innerHTML = '<div class="small">Nenhum lembrete cadastrado.</div>';
    return;
  }
  meds.forEach(m => {
    const el = document.createElement('div');
    el.className = 'med-item';
    el.innerHTML = `
      <img src="${m.img}" alt="">
      <div class="med-meta">
        <div style="font-weight:700">${m.name}</div>
        <div class="small">${m.qty}</div>
        <div class="small">Inicia: ${new Date(m.start).toLocaleString()}</div>
        <div class="small">Intervalo: ${m.intervalMinutes} min</div>
      </div>
      <div class="actions">
        <button data-id="${m.id}" class="secondary delBtn">Excluir</button>
      </div>
    `;
    medList.appendChild(el);
  });
  document.querySelectorAll('.delBtn').forEach(b => {
    b.onclick = e => {
      const id = e.target.dataset.id;
      meds = meds.filter(x => x.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(meds));
      if (timers[id]) {
        clearTimeout(timers[id].timeout);
        clearInterval(timers[id].interval);
        delete timers[id];
      }
      renderList();
    };
  });
}

// === Agendamento ===
function scheduleAll() { meds.forEach(scheduleMedication); }
function scheduleMedication(med) {
  if (timers[med.id]) {
    clearTimeout(timers[med.id].timeout);
    clearInterval(timers[med.id].interval);
  }
  const start = new Date(med.start).getTime();
  const intervalMs = med.intervalMinutes * 60000;
  const now = Date.now();
  let next = start <= now ? start + intervalMs : start;
  const delay = next - now;
  const timeout = setTimeout(() => {
    triggerAlarm(med);
    timers[med.id].interval = setInterval(() => triggerAlarm(med), intervalMs);
  }, delay);
  timers[med.id] = { timeout, interval: null };
}

// === Dispara o alarme ===
function triggerAlarm(med) {
  currentAlarmMed = med;
  overlay.style.display = 'flex';
  overlayImg.src = med.img;
  overlayText.textContent = `Hora de tomar ${med.qty} de ${med.name}`;
  if (navigator.vibrate) navigator.vibrate([500, 200, 500]);
  if (speechSynthesis) {
    const u = new SpeechSynthesisUtterance(`Hora de tomar ${med.qty} de ${med.name}`);
    u.lang = 'pt-BR';
    u.rate = 0.95;
    speechSynthesis.speak(u);
    speakInterval = setInterval(() => speechSynthesis.speak(u), 6000);
  }
  // Envia para o Service Worker exibir notificação
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'SHOW_NOTIFICATION',
      title: 'Hora do remédio',
      body: `Hora de tomar ${med.qty} de ${med.name}`,
      icon: med.img
    });
  }
}

// === Overlay ===
takenBtn.onclick = stopAlarm;
snoozeBtn.onclick = () => {
  stopAlarm();
  if (currentAlarmMed) {
    setTimeout(() => triggerAlarm(currentAlarmMed), 10 * 60 * 1000);
    alert('Adiado por 10 minutos');
  }
};
function stopAlarm() {
  overlay.style.display = 'none';
  if (navigator.vibrate) navigator.vibrate(0);
  speechSynthesis.cancel();
  if (speakInterval) clearInterval(speakInterval);
}

// === Utils ===
function clearForm() {
  nameInput.value = '';
  qtyInput.value = '';
  startInput.value = '';
  intervalInput.value = '';
  imgPreview.innerHTML = '<span class="small">Sem foto</span>';
  delete imgPreview.dataset.img;
}

function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default')
    Notification.requestPermission();
}

// === Inicialização ===
renderList();
scheduleAll();
requestNotificationPermission();

// Define horário padrão (1 min à frente)
const now = new Date();
now.setMinutes(now.getMinutes() + 1);
const pad = n => n.toString().padStart(2, '0');
startInput.value = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

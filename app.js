    const firebaseConfig = {
      apiKey: "AIzaSyAbVCQsNeirVMDSh6B8BnlmaIfmUeZMURk",
      authDomain: "wochenplanerv1.firebaseapp.com",
      projectId: "wochenplanerv1",
      storageBucket: "wochenplanerv1.firebasestorage.app",
      messagingSenderId: "357408813271",
      appId: "1:357408813271:web:964ab64a00edc23c594092",
      measurementId: "G-RP5JS8YHGL"
    };

    const NEEDS_SETUP = firebaseConfig.apiKey === "DEIN_API_KEY";
    let db = null, auth = null;
    if (!NEEDS_SETUP) {
      firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
      auth = firebase.auth();
    }
    let currentUser = null;

    function userRoot() { return db.collection('users').doc(currentUser.uid); }

    const WEEKDAYS = [
      { key: 'mon', label: 'Montag' }, { key: 'tue', label: 'Dienstag' }, { key: 'wed', label: 'Mittwoch' },
      { key: 'thu', label: 'Donnerstag' }, { key: 'fri', label: 'Freitag' }, { key: 'sat', label: 'Samstag' }, { key: 'sun', label: 'Sonntag' },
    ];
    const SYMBOLS = ['•', '○', '–', '✓', '!', '✕', '›'];
    const WEATHER_LABELS = ['kein Eintrag', 'sonnig', 'bewölkt', 'Regen', 'Schnee', 'Gewitter'];
    const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    const APP_VERSION = '1.9.0';
    const WEEKDAY_NAMES_FULL = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

    let currentPage = 'cover', weekOffset = 0, monthOffset = 0;
    let pendingFocusId = null;
    let weekData = null, mediaLog = null, monthsCache = {};
    let saveWeekTimer = null, saveMediaTimer = null, saveMonthTimers = {};

    let customColors = JSON.parse(localStorage.getItem('wochenplaner-colors')) || {};
    let darkMode = localStorage.getItem('wochenplaner-darkmode') === 'true';
    let listYearFilter = 'all';
    let yearBarEnabled = localStorage.getItem('wochenplaner-yearbar') !== 'false';
    function toggleYearBar(){ yearBarEnabled = !yearBarEnabled; localStorage.setItem('wochenplaner-yearbar', yearBarEnabled ? 'true' : 'false'); renderApp(); }
    function currentYear(){ return new Date().getFullYear(); }
    function yearSelectHTML(value, onchangeAttr) {
      const cy = currentYear();
      const v = value || cy;
      const years = [];
      for (let y = cy + 1; y >= cy - 14; y--) years.push(y);
      if (!years.includes(v)) years.push(v);
      years.sort((a, b) => b - a);
      return `<select class="year-field" onchange="${onchangeAttr}">${years.map(y => `<option value="${y}"${y === v ? ' selected' : ''}>${y}</option>`).join('')}</select>`;
    }

    const LIGHT_PALETTE = {
      '--paper': '#EDEEE5', '--paper-raised': '#F8F8F2', '--ink': '#28342F', '--ink-soft': '#5C6A62',
      '--moss': '#5B7A5C', '--moss-soft': '#baceb9', '--rule': '#D6D2C2', '--rule-strong': '#C3BEA8', '--done': '#9AA38F'
    };
    const DARK_PALETTE = {
      '--paper': '#1E2422', '--paper-raised': '#262E2B', '--ink': '#E8E6DC', '--ink-soft': '#9CA39C',
      '--moss': '#7FA17F', '--moss-soft': '#33402F', '--rule': '#3A4340', '--rule-strong': '#4A5650', '--done': '#6B7568'
    };

    function applyTheme() {
      const base = darkMode ? DARK_PALETTE : LIGHT_PALETTE;
      Object.keys(base).forEach(key => document.documentElement.style.setProperty(key, base[key]));
      applyCustomColors();
    }
    function toggleDarkMode() {
      darkMode = !darkMode;
      localStorage.setItem('wochenplaner-darkmode', darkMode ? 'true' : 'false');
      applyTheme(); renderApp();
    }

    function applyCustomColors() {
      Object.keys(customColors).forEach(key => {
        document.documentElement.style.setProperty(key, customColors[key]);
      });
    }

    function saveCustomColors() {
      localStorage.setItem('wochenplaner-colors', JSON.stringify(customColors));
      applyCustomColors();
    }

    function resetColors() {
      customColors = {};
      localStorage.removeItem('wochenplaner-colors');
      location.reload();
    }

    function getMonday(o) { const d = new Date(); d.setHours(0, 0, 0, 0); const day = d.getDay() || 7; d.setDate(d.getDate() - (day - 1) + o * 7); return d; }
    function isoWeekNumber(d) { const date = new Date(d.getTime()); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7)); const w1 = new Date(date.getFullYear(), 0, 4); return 1 + Math.round(((date - w1) / 86400000 - 3 + ((w1.getDay() + 6) % 7)) / 7); }
    function fmtDate(d) { return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.'; }
    function weekDocId() { const m = getMonday(weekOffset); return m.getFullYear() + '-' + String(isoWeekNumber(m)).padStart(2, '0'); }
    function weekDocIdForDate(date) {
      const day = date.getDay() || 7;
      const monday = new Date(date);
      monday.setHours(0, 0, 0, 0);
      monday.setDate(monday.getDate() - (day - 1));
      return monday.getFullYear() + '-' + String(isoWeekNumber(monday)).padStart(2, '0');
    }
    function dateToMonthId(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
    function monthIdParts(id) { const [y, m] = id.split('-').map(Number); return { y, m }; }
    function daysInMonthId(id) { const { y, m } = monthIdParts(id); return new Date(y, m, 0).getDate(); }
    function monthLabel(id) { const { y, m } = monthIdParts(id); return MONTH_NAMES[m - 1] + ' ' + y; }
    function currentMonthId(offset) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset); return dateToMonthId(d); }
    function firstWeekdayIndex(id) { const { y, m } = monthIdParts(id); const wd = new Date(y, m - 1, 1).getDay(); return wd === 0 ? 6 : wd - 1; }
    function parseDM(d) { const m = /^(\d{1,2})\.(\d{1,2})\.?$/.exec((d || '').trim()); return m ? { day: parseInt(m[1], 10), month: parseInt(m[2], 10) } : null; }
    function parseDateKey(d) { const p = parseDM(d); return p ? p.month * 100 + p.day : 9999; }
    function genId() { return 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
    function escapeHtml(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    /* ---- generic drag & drop reordering, shared by every list in the app ---- */
    let reorderMode = false;
    function toggleReorderMode() { reorderMode = !reorderMode; renderApp(); }

    let dragSrcKey = null, dragSrcIndex = null;
    function dragStart(e, key, idx) {
      dragSrcKey = key; dragSrcIndex = idx;
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(idx)); } catch (err) { }
      const row = e.target.closest('.row, .habit-row');
      if (row) row.classList.add('dragging');
    }
    function dragEndRow() {
      document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
      document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    }
    function dragOverRow(e) { e.preventDefault(); }
    function dragEnterRow(e, key) {
      if (dragSrcKey !== key) return;
      e.preventDefault();
      e.currentTarget.classList.add('drag-over');
    }
    function dragLeaveRow(e) { e.currentTarget.classList.remove('drag-over'); }
    function dropRow(e, key, idx) {
      e.preventDefault();
      const fromIdx = dragSrcIndex;
      const matched = dragSrcKey === key;
      document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
      dragSrcKey = null; dragSrcIndex = null;
      if (!matched || fromIdx == null || fromIdx === idx) return;
      reorderByKey(key, fromIdx, idx);
    }
    function reorderByKey(key, fromIdx, toIdx) {
      let arr = null, saveFn = null;
      if (key.startsWith('day:')) {
        arr = weekData.days[key.slice(4)]; saveFn = scheduleSaveWeek;
      } else if (key === 'habit') {
        arr = mediaLog.habits; saveFn = scheduleSaveMedia;
      } else if (key.startsWith('list:')) {
        arr = mediaLog[key.slice(5)]; saveFn = scheduleSaveMedia;
      } else if (key.startsWith('customlist:')) {
        const list = mediaLog.customLists.find(l => l.id === key.slice(11));
        arr = list ? list.items : null; saveFn = scheduleSaveMedia;
      }
      if (!arr) return;
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      if (saveFn) saveFn();
      renderApp();
    }
    function dragHandleSVG() {
      return `<svg viewBox="0 0 10 16" width="10" height="16" fill="currentColor"><circle cx="2" cy="2" r="1.3"/><circle cx="8" cy="2" r="1.3"/><circle cx="2" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="2" cy="14" r="1.3"/><circle cx="8" cy="14" r="1.3"/></svg>`;
    }
    function dragHandleHTML(key, idx) {
      if (!reorderMode) return '';
      return `<span class="drag-handle" draggable="true" ondragstart="dragStart(event,'${key}',${idx})" ondragend="dragEndRow()" aria-label="Verschieben" title="Ziehen zum Verschieben">${dragHandleSVG()}</span>`;
    }
    function dragRowAttrs(key, idx) {
      if (!reorderMode) return '';
      return ` ondragover="dragOverRow(event)" ondragenter="dragEnterRow(event,'${key}')" ondragleave="dragLeaveRow(event)" ondrop="dropRow(event,'${key}',${idx})"`;
    }

    function defaultWeatherObj() { const w = {}; WEEKDAYS.forEach(d => w[d.key] = 0); return w; }
    function defaultWeek() { const days = {}; WEEKDAYS.forEach(d => days[d.key] = []); return { focus: ['', '', ''], days, weather: defaultWeatherObj(), reflection: '', brainDump: '' }; }
    function normalizeWeek(w) {
      if (!w.weather) w.weather = {};
      WEEKDAYS.forEach(d => {
        if (!w.days[d.key]) w.days[d.key] = [];
        w.days[d.key].forEach(r => { if (!r.id) r.id = genId(); });
        if (typeof w.weather[d.key] !== 'number') w.weather[d.key] = 0;
      });
      if (!Array.isArray(w.focus)) w.focus = ['', '', ''];
      if (typeof w.reflection !== 'string') w.reflection = '';
      if (typeof w.brainDump !== 'string') w.brainDump = '';
      return w;
    }
    function defaultMediaLog() { return { booksRead: [], booksToRead: [], movies: [], podcasts: [], quotes: [], achievements: [], dates: [], habits: [], customLists: [], textareaSizes: { reflection: null, brainDump: null } }; }
    function normalizeMediaLog(m) {
      if (m.books && !m.booksRead) m.booksRead = m.books;
      ['booksRead', 'booksToRead', 'movies', 'podcasts', 'quotes', 'achievements', 'dates'].forEach(k => { if (!Array.isArray(m[k])) m[k] = []; });
      ['booksRead', 'booksToRead', 'movies', 'podcasts', 'quotes', 'achievements'].forEach(k => {
        m[k].forEach(item => { if (!item.year) item.year = currentYear(); });
      });
      if (!Array.isArray(m.habits) || m.habits.length === 0) {
        m.habits = [{ id: genId(), name: 'Lesen' }, { id: genId(), name: 'Instrument üben' }, { id: genId(), name: 'Projekt / Python' }, { id: genId(), name: 'Bewegung' }];
      }
      if (!Array.isArray(m.customLists)) m.customLists = [];
      m.customLists.forEach(l => {
        if (!Array.isArray(l.items)) l.items = [];
        l.items.forEach(item => { if (!item.year) item.year = currentYear(); });
      });
      if (!m.textareaSizes || typeof m.textareaSizes !== 'object') m.textareaSizes = { reflection: null, brainDump: null };
      return m;
    }

    function weekRef() { return userRoot().collection('weeks').doc(weekDocId()); }
    function weekRefById(id) { return userRoot().collection('weeks').doc(id); }
    function mediaRef() { return userRoot().collection('meta').doc('media'); }
    function monthRef(id) { return userRoot().collection('months').doc(id); }

    let weekCache = {};
    async function loadWeek() {
      const id = weekDocId();
      if (weekCache[id]) { weekData = weekCache[id]; return; }
      try { const snap = await weekRef().get(); weekData = (snap.exists && snap.data().payload) ? normalizeWeek(JSON.parse(snap.data().payload)) : defaultWeek(); }
      catch (e) { weekData = defaultWeek(); }
      weekCache[id] = weekData;
    }
    function weekFullyCached() {
      const id = weekDocId();
      if (!weekCache[id]) return false;
      const monday = getMonday(weekOffset);
      for (let i = 0; i < 7; i++) { const d = new Date(monday); d.setDate(d.getDate() + i); if (!monthsCache[dateToMonthId(d)]) return false; }
      return true;
    }
    async function loadMediaLog() {
      try { const snap = await mediaRef().get(); mediaLog = (snap.exists && snap.data().payload) ? normalizeMediaLog(JSON.parse(snap.data().payload)) : defaultMediaLog(); }
      catch (e) { mediaLog = defaultMediaLog(); }
    }
    async function ensureMonthLoaded(id) {
      if (monthsCache[id]) return;
      try { const snap = await monthRef(id).get(); monthsCache[id] = (snap.exists && snap.data().payload) ? JSON.parse(snap.data().payload) : { marks: {}, mood: [] }; }
      catch (e) { monthsCache[id] = { marks: {}, mood: [] }; }
      if (!monthsCache[id].marks) monthsCache[id].marks = {};
      if (!monthsCache[id].mood) monthsCache[id].mood = [];
    }
    async function ensureMonthsForWeekLoaded() {
      const monday = getMonday(weekOffset); const ids = new Set();
      for (let i = 0; i < 7; i++) { const d = new Date(monday); d.setDate(d.getDate() + i); ids.add(dateToMonthId(d)); }
      await Promise.all([...ids].map(ensureMonthLoaded));
    }

    function scheduleSaveWeek() { clearTimeout(saveWeekTimer); saveWeekTimer = setTimeout(saveWeek, 350); }
    async function saveWeek() { try { await weekRef().set({ payload: JSON.stringify(weekData) }); flashStatus('gespeichert'); } catch (e) { console.error('Woche speichern fehlgeschlagen:', e); flashStatus(e && e.code === 'permission-denied' ? 'Speichern blockiert — Firestore-Regeln prüfen' : 'Speichern fehlgeschlagen — offline?', true); } }
    function scheduleSaveMedia() { clearTimeout(saveMediaTimer); saveMediaTimer = setTimeout(saveMedia, 350); }
    async function saveMedia() { try { await mediaRef().set({ payload: JSON.stringify(mediaLog) }); flashStatus('gespeichert'); } catch (e) { console.error('Medien speichern fehlgeschlagen:', e); flashStatus(e && e.code === 'permission-denied' ? 'Speichern blockiert — Firestore-Regeln prüfen' : 'Speichern fehlgeschlagen — offline?', true); } }
    function scheduleSaveMonth(id) { clearTimeout(saveMonthTimers[id]); saveMonthTimers[id] = setTimeout(() => saveMonth(id), 350); }
    async function saveMonth(id) { try { await monthRef(id).set({ payload: JSON.stringify(monthsCache[id]) }); flashStatus('gespeichert'); } catch (e) { console.error('Monat speichern fehlgeschlagen:', e); flashStatus(e && e.code === 'permission-denied' ? 'Speichern blockiert — Firestore-Regeln prüfen' : 'Speichern fehlgeschlagen — offline?', true); } }
    function flashStatus(t, isError) { const el = document.getElementById('status'); el.textContent = t; el.classList.add('show'); el.classList.toggle('error', !!isError); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), isError ? 4500 : 1600); }

    async function loadAppData() {
      applyTheme();
      document.getElementById('app').innerHTML = '<div class="loading">lädt …</div>';
      await Promise.all([loadMediaLog(), loadWeek()]);
      await ensureMonthsForWeekLoaded();
      await ensureMonthLoaded(currentMonthId(0));
      renderApp();
    }

    let authMode = 'signin'; // 'signin' | 'signup'
    let authError = '';

    function renderAuthScreen() {
      document.getElementById('app').innerHTML = `
    <div class="auth-wrap">
      <div class="header" style="justify-content:center; border:none; margin-bottom:24px;">
        <svg class="leaf" viewBox="0 0 24 24" fill="none" stroke="var(--moss)" stroke-width="1.4"><path d="M4 20C4 12 9 4 20 4C20 14 13 20 4 20Z"/><path d="M5 19C9 14 13 10 19 5"/></svg>
        <h1>Wochenplaner</h1>
      </div>
      <div class="auth-card">
        <div class="auth-error">${escapeHtml(authError)}</div>
        <button class="google-btn" onclick="doGoogleSignIn()">
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.85 2.09-1.81 2.73v2.27h2.92c1.71-1.57 2.69-3.88 2.69-6.64z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.92-2.27c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.34C2.44 15.98 5.48 18 9 18z"/>
            <path fill="#FBBC05" d="M3.97 10.7c-.18-.54-.28-1.11-.28-1.7s.1-1.16.28-1.7V4.96H.96A8.997 8.997 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3.01-2.34z"/>
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z"/>
          </svg>
          Mit Google anmelden
        </button>
        <div class="auth-divider"><span>oder per E-Mail</span></div>
        <input type="email" id="auth-email" placeholder="E-Mail" autocomplete="email">
        <input type="password" id="auth-password" placeholder="Passwort" autocomplete="${authMode === 'signup' ? 'new-password' : 'current-password'}">
        ${authMode === 'signin' ? `<button class="auth-forgot" onclick="doPasswordReset()">Passwort vergessen?</button>` : ''}
        <button class="auth-submit" onclick="${authMode === 'signin' ? 'doSignIn()' : 'doSignUp()'}">${authMode === 'signin' ? 'Anmelden' : 'Konto erstellen'}</button>
        <div class="auth-switch">
          ${authMode === 'signin'
          ? `Noch kein Konto? <button onclick="authMode='signup'; authError=''; renderAuthScreen();">Registrieren</button>`
          : `Schon ein Konto? <button onclick="authMode='signin'; authError=''; renderAuthScreen();">Anmelden</button>`}
        </div>
      </div>
      <div class="legal-links">
        <button onclick="renderLegalScreen('privacy')">Datenschutzerklärung</button> · <button onclick="renderLegalScreen('imprint')">Impressum</button>
      </div>
    </div>`;
    }

    function closeLegalScreen() {
      if (currentUser) { renderApp(); } else { renderAuthScreen(); }
    }

    function buildPrivacyHTML() {
      return `
    <h2>Datenschutzerklärung</h2>
    <p><em>Stand: [DATUM EINTRAGEN]</em></p>

    <h3>1. Verantwortlicher</h3>
    <p>
      [DEIN VOR- UND NACHNAME]<br>
      [DEINE STRASSE UND HAUSNUMMER]<br>
      [DEINE PLZ UND ORT]<br>
      E-Mail: [DEINE E-MAIL-ADRESSE]
    </p>

    <h3>2. Welche Daten wir verarbeiten</h3>
    <p>Bei der Nutzung von Wochenplaner verarbeiten wir folgende Daten:</p>
    <ul>
      <li>E-Mail-Adresse und Passwort (verschlüsselt gespeichert) zur Erstellung und Verwaltung deines Kontos</li>
      <li>Von dir eingegebene Inhalte: Tagebuch-Einträge, Stimmungswerte, Gewohnheiten, Termine, Bücher-/Filme-/Podcast-Listen, Zitate</li>
      <li>Technische Zugriffsdaten (z. B. IP-Adresse, Zeitpunkt des Zugriffs) durch unseren Hosting- und Datenbankanbieter</li>
    </ul>

    <h3>3. Zweck der Verarbeitung</h3>
    <p>Die Verarbeitung erfolgt ausschließlich, um dir die Funktionen von Wochenplaner bereitzustellen — insbesondere die Speicherung und Synchronisierung deiner Einträge über mehrere Geräte hinweg.</p>

    <h3>4. Rechtsgrundlage</h3>
    <p>Die Verarbeitung erfolgt auf Grundlage von Art. 6 Abs. 1 lit. b DSGVO (Erfüllung eines Vertrags bzw. vorvertragliche Maßnahmen), da sie zur Bereitstellung des von dir genutzten Dienstes erforderlich ist.</p>

    <h3>5. Eingesetzte Dienstleister</h3>
    <p>Wir nutzen Google Firebase (Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland, ggf. mit Subdienstleistung durch Google LLC, USA) zur Authentifizierung und Datenspeicherung. Mit Google besteht ein Auftragsverarbeitungsvertrag nach Art. 28 DSGVO. Bei Datenübermittlung in die USA stützen wir uns auf die EU-Standardvertragsklauseln bzw. das EU-US Data Privacy Framework.</p>

    <h3>6. Speicherdauer</h3>
    <p>Deine Daten werden gespeichert, solange dein Konto besteht. In den Einstellungen kannst du dein Konto jederzeit selbst löschen — alle deine Daten werden dabei sofort und unwiderruflich entfernt.</p>

    <h3>7. Deine Rechte</h3>
    <p>Du hast das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18), Datenübertragbarkeit (Art. 20) sowie Widerspruch (Art. 21). Eine Export-Funktion für deine Daten findest du in den Einstellungen. Du hast außerdem das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren.</p>

    <h3>8. Lokale Speicherung im Browser</h3>
    <p>Einige Einstellungen (z. B. Dunkelmodus, Farbschema) werden lokal in deinem Browser (localStorage) gespeichert und nicht an uns übertragen.</p>

    <h3>9. Kontakt</h3>
    <p>Bei Fragen zum Datenschutz wende dich an: [DEINE E-MAIL-ADRESSE]</p>
  `;
    }

    function buildImprintHTML() {
      return `
    <h2>Impressum</h2>
    <h3>Angaben gemäß § 5 DDG</h3>
    <p>
      [DEIN VOR- UND NACHNAME]<br>
      [DEINE STRASSE UND HAUSNUMMER]<br>
      [DEINE PLZ UND ORT]<br>
      Deutschland
    </p>

    <h3>Kontakt</h3>
    <p>
      E-Mail: [DEINE E-MAIL-ADRESSE]<br>
      Telefon: [OPTIONAL]
    </p>

    <h3>Umsatzsteuer</h3>
    <p>
      [FALLS ZUTREFFEND: Umsatzsteuer-Identifikationsnummer gemäß § 27a UStG: ...]<br>
      [ODER, FALLS KLEINUNTERNEHMER: Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.]
    </p>

    <h3>Verantwortlich für den Inhalt</h3>
    <p>[DEIN VOR- UND NACHNAME], Anschrift wie oben</p>

    <h3>Streitschlichtung</h3>
    <p>Die Europäische Kommission stellt eine Plattform zur Online-Streitbeilegung (OS) bereit: <a href="https://ec.europa.eu/consumers/odr/" target="_blank" rel="noopener">ec.europa.eu/consumers/odr</a>. Wir sind nicht verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen.</p>
  `;
    }

    function renderLegalScreen(which) {
      const content = which === 'privacy' ? buildPrivacyHTML() : buildImprintHTML();
      document.getElementById('app').innerHTML = `
    <button class="toggle-btn" onclick="closeLegalScreen()" style="margin-bottom:18px;">← Zurück</button>
    <div class="card legal-text">${content}</div>
  `;
    }

    async function renderChangelogScreen() {
      document.getElementById('app').innerHTML = '<div class="loading">lädt …</div>';
      let content;
      try {
        const res = await fetch('./CHANGELOG.html', { cache: 'no-store' });
        if (!res.ok) throw new Error('CHANGELOG.html nicht gefunden (Status ' + res.status + ')');
        content = await res.text();
      } catch (e) {
        console.error('Changelog konnte nicht geladen werden:', e);
        content = '<p>Changelog konnte nicht geladen werden. Liegt <code>CHANGELOG.html</code> im selben Verzeichnis wie diese Seite auf dem Server?</p>';
      }
      document.getElementById('app').innerHTML = `
    <button class="toggle-btn" onclick="closeLegalScreen()" style="margin-bottom:18px;">← Zurück</button>
    <div class="card legal-text">${content}</div>
  `;
    }

    function authFriendlyError(e) {
      const map = {
        'auth/invalid-email': 'Ungültige E-Mail-Adresse.',
        'auth/user-not-found': 'Kein Konto mit dieser E-Mail gefunden.',
        'auth/wrong-password': 'Falsches Passwort.',
        'auth/invalid-credential': 'E-Mail oder Passwort falsch.',
        'auth/email-already-in-use': 'Diese E-Mail ist bereits registriert.',
        'auth/weak-password': 'Passwort muss mindestens 6 Zeichen haben.',
        'auth/popup-blocked': 'Popup wurde blockiert — bitte Popups für diese Seite erlauben.',
        'auth/account-exists-with-different-credential': 'Diese E-Mail ist bereits mit einem anderen Anmeldeverfahren registriert.',
        'auth/unauthorized-domain': 'Diese Domain ist für Google-Anmeldung noch nicht freigegeben (Firebase Console → Authentication → Settings → Authorized domains).',
      };
      return (e && map[e.code]) || 'Etwas ist schiefgelaufen. Bitte erneut versuchen.';
    }

    function doGoogleSignIn() {
      const provider = new firebase.auth.GoogleAuthProvider();
      authError = '';
      auth.signInWithPopup(provider).catch(e => {
        if (e && (e.code === 'auth/popup-closed-by-user' || e.code === 'auth/cancelled-popup-request')) return;
        console.error('Google Sign-In fehlgeschlagen:', e);
        authError = authFriendlyError(e);
        renderAuthScreen();
      });
    }

    async function doSignUp() {
      const email = document.getElementById('auth-email').value.trim();
      const pw = document.getElementById('auth-password').value;
      authError = '';
      try { await auth.createUserWithEmailAndPassword(email, pw); }
      catch (e) { authError = authFriendlyError(e); renderAuthScreen(); }
    }
    async function doSignIn() {
      const email = document.getElementById('auth-email').value.trim();
      const pw = document.getElementById('auth-password').value;
      authError = '';
      try { await auth.signInWithEmailAndPassword(email, pw); }
      catch (e) { authError = authFriendlyError(e); renderAuthScreen(); }
    }
    async function doPasswordReset() {
      const email = document.getElementById('auth-email').value.trim();
      if (!email) { authError = 'Bitte zuerst E-Mail-Adresse eingeben.'; renderAuthScreen(); return; }
      try { await auth.sendPasswordResetEmail(email); authError = ''; flashStatus('E-Mail zum Zurücksetzen wurde gesendet'); }
      catch (e) { authError = authFriendlyError(e); renderAuthScreen(); }
    }
    function doSignOut() { auth.signOut(); }

    async function submitFeedback() {
      const field = document.getElementById('feedback-text');
      const text = field.value.trim();
      if (!text) { flashStatus('Bitte erst etwas eintragen', true); return; }
      try {
        await db.collection('feedback').add({ text, email: currentUser.email, uid: currentUser.uid, ts: Date.now() });
        field.value = '';
        flashStatus('Danke für dein Feedback!');
      } catch (e) {
        console.error('Feedback senden fehlgeschlagen:', e);
        flashStatus('Senden fehlgeschlagen — bitte später erneut versuchen', true);
      }
    }

    async function deleteAllUserData() {
      const root = userRoot();
      const weeksSnap = await root.collection('weeks').get();
      const monthsSnap = await root.collection('months').get();
      const deletes = [];
      weeksSnap.forEach(doc => deletes.push(doc.ref.delete()));
      monthsSnap.forEach(doc => deletes.push(doc.ref.delete()));
      deletes.push(mediaRef().delete().catch(() => { }));
      await Promise.all(deletes);
    }

    async function deleteAccount() {
      if (!confirm('Deinen Account und ALLE Daten unwiderruflich löschen?\n\nDas betrifft alle Wochen, Monate, Gewohnheiten, Termine, Bücher/Filme/Podcasts und Zitate.')) return;
      if (!confirm('Letzte Sicherheitsabfrage: wirklich endgültig löschen? Es gibt kein Zurück.')) return;
      flashStatus('Lösche Account …');
      try {
        await deleteAllUserData();
        await currentUser.delete();
      } catch (e) {
        console.error('Account-Löschung fehlgeschlagen:', e);
        if (e && e.code === 'auth/requires-recent-login') {
          flashStatus('Aus Sicherheitsgründen bitte einmal abmelden, neu anmelden und dann erneut löschen', true);
        } else {
          flashStatus('Löschen fehlgeschlagen — bitte später erneut versuchen', true);
        }
      }
    }

    function init() {
      if (NEEDS_SETUP) { renderSetupNotice(); return; }
      auth.onAuthStateChanged(user => {
        currentUser = user;
        if (user) { currentPage = 'cover'; loadAppData(); }
        else { renderAuthScreen(); }
      });
    }
    async function switchPage(page) {
      if (page === currentPage) return;
      currentPage = page;
      if (page === 'month' && !monthsCache[currentMonthId(monthOffset)]) {
        document.getElementById('app').innerHTML = '<div class="loading">lädt …</div>';
      }
      if (page === 'month') { await ensureMonthLoaded(currentMonthId(monthOffset)); }
      renderApp();
    }
    async function changeWeek(delta) {
      weekOffset += delta;
      if (!weekFullyCached()) { document.getElementById('app').innerHTML = '<div class="loading">lädt …</div>'; }
      await loadWeek(); await ensureMonthsForWeekLoaded(); renderApp();
    }
    async function goToday() {
      weekOffset = 0;
      if (!weekFullyCached()) { document.getElementById('app').innerHTML = '<div class="loading">lädt …</div>'; }
      await loadWeek(); await ensureMonthsForWeekLoaded(); renderApp();
    }
    async function changeMonth(delta) {
      monthOffset += delta;
      if (!monthsCache[currentMonthId(monthOffset)]) { document.getElementById('app').innerHTML = '<div class="loading">lädt …</div>'; }
      await ensureMonthLoaded(currentMonthId(monthOffset)); renderApp();
    }
    async function goThisMonth() {
      monthOffset = 0;
      if (!monthsCache[currentMonthId(monthOffset)]) { document.getElementById('app').innerHTML = '<div class="loading">lädt …</div>'; }
      await ensureMonthLoaded(currentMonthId(monthOffset)); renderApp();
    }

    function cycleSymbol(dk, idx) {
      const r = weekData.days[dk][idx];
      const oldSym = r.sym;
      const newSym = SYMBOLS[(SYMBOLS.indexOf(r.sym) + 1) % SYMBOLS.length];
      r.sym = newSym;

      if (newSym === '›' && oldSym !== '›') {
        performMigration(dk, idx);
        return;
      }
      if (oldSym === '›' && newSym !== '›') {
        undoMigration(r);
      }
      scheduleSaveWeek();
      renderApp();
    }
    function addRow(dk) { weekData.days[dk].push({ sym: '•', text: '', id: genId() }); pendingFocusId = 'row-' + dk + '-' + (weekData.days[dk].length - 1); scheduleSaveWeek(); renderApp(); }
    function deleteRow(dk, idx) { weekData.days[dk].splice(idx, 1); scheduleSaveWeek(); renderApp(); }
    function updateRowText(dk, idx, v) { weekData.days[dk][idx].text = v; scheduleSaveWeek(); }

    async function migrateEntryAcrossWeek(entry, targetWeekId, targetDayKey) {
      let target;
      if (weekCache[targetWeekId]) {
        target = weekCache[targetWeekId];
      } else {
        try {
          const snap = await weekRefById(targetWeekId).get();
          target = (snap.exists && snap.data().payload) ? normalizeWeek(JSON.parse(snap.data().payload)) : defaultWeek();
        } catch (e) { target = defaultWeek(); }
        weekCache[targetWeekId] = target;
      }
      target.days[targetDayKey].push(entry);
      try { await weekRefById(targetWeekId).set({ payload: JSON.stringify(target) }); }
      catch (e) { console.error('Migration fehlgeschlagen:', e); flashStatus('Migration in nächste Woche fehlgeschlagen', true); }
    }

    async function performMigration(dk, idx) {
      const row = weekData.days[dk][idx];
      if (!row) return;
      if (!row.id) row.id = genId();
      const dayOrder = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
      const curPos = dayOrder.indexOf(dk);
      const monday = getMonday(weekOffset);
      const curDate = new Date(monday); curDate.setDate(curDate.getDate() + curPos);
      const nextDate = new Date(curDate); nextDate.setDate(nextDate.getDate() + 1);

      const newId = genId();
      const newEntry = { sym: '•', text: row.text, id: newId };

      if (curPos < 6) {
        const nextKey = dayOrder[curPos + 1];
        weekData.days[nextKey].push(newEntry);
        row.migratedRef = { weekId: weekDocId(), dayKey: nextKey, id: newId };
        scheduleSaveWeek();
        renderApp();
      } else {
        const targetWeekId = weekDocIdForDate(nextDate);
        await migrateEntryAcrossWeek(newEntry, targetWeekId, 'mon');
        row.migratedRef = { weekId: targetWeekId, dayKey: 'mon', id: newId };
        scheduleSaveWeek();
        renderApp();
      }
    }

    function undoMigration(row) {
      const ref = row.migratedRef;
      if (!ref) return;
      delete row.migratedRef;
      removeMigratedEntry(ref);
    }

    async function removeMigratedEntry(ref) {
      if (ref.weekId === weekDocId()) {
        const arr = weekData.days[ref.dayKey];
        const i = arr.findIndex(e => e.id === ref.id);
        if (i !== -1) arr.splice(i, 1);
        scheduleSaveWeek();
        return;
      }
      let target = weekCache[ref.weekId];
      try {
        if (!target) {
          const snap = await weekRefById(ref.weekId).get();
          target = (snap.exists && snap.data().payload) ? normalizeWeek(JSON.parse(snap.data().payload)) : defaultWeek();
          weekCache[ref.weekId] = target;
        }
        const arr = target.days[ref.dayKey];
        const i = arr.findIndex(e => e.id === ref.id);
        if (i !== -1) arr.splice(i, 1);
        await weekRefById(ref.weekId).set({ payload: JSON.stringify(target) });
      } catch (e) { console.error('Migration zurücknehmen fehlgeschlagen:', e); }
    }

    function updateFocus(i, v) { weekData.focus[i] = v; scheduleSaveWeek(); }
    function updateReflection(v) { weekData.reflection = v; scheduleSaveWeek(); }
    function updateBrainDump(v) { weekData.brainDump = v; scheduleSaveWeek(); }

    function attachTextareaResizeTracking() {
      const map = { 'reflection-textarea': 'reflection', 'braindump-textarea': 'brainDump' };
      Object.keys(map).forEach(id => {
        const el = document.getElementById(id);
        if (!el || typeof ResizeObserver === 'undefined') return;
        let skip = true;
        const ro = new ResizeObserver(entries => {
          if (skip) { skip = false; return; }
          const h = Math.round(entries[0].contentRect.height);
          if (!mediaLog.textareaSizes) mediaLog.textareaSizes = { reflection: null, brainDump: null };
          if (mediaLog.textareaSizes[map[id]] !== h) {
            mediaLog.textareaSizes[map[id]] = h;
            scheduleSaveMedia();
          }
        });
        ro.observe(el);
      });
    }
    function resetTextareaSizes() {
      mediaLog.textareaSizes = { reflection: null, brainDump: null };
      scheduleSaveMedia();
      renderApp();
    }
    function cycleWeather(dk) { weekData.weather[dk] = (weekData.weather[dk] + 1) % WEATHER_LABELS.length; scheduleSaveWeek(); renderApp(); }

    function addHabitDef() { if (mediaLog.habits.length >= 30) return; const newId = genId(); mediaLog.habits.push({ id: newId, name: '' }); pendingFocusId = 'habitname-' + newId; scheduleSaveMedia(); renderApp(); }
    function updateHabitName(id, v) { const h = mediaLog.habits.find(h => h.id === id); if (h) h.name = v; scheduleSaveMedia(); }
    function deleteHabitDef(id) {
      const h = mediaLog.habits.find(h => h.id === id);
      const name = (h && h.name && h.name.trim()) ? h.name.trim() : 'diese Gewohnheit';
      if (!confirm(`„${name}" wirklich löschen?\n\nDer gesamte Verlauf (alle gesetzten Häkchen) geht dabei verloren.`)) return;
      mediaLog.habits = mediaLog.habits.filter(h => h.id !== id); scheduleSaveMedia(); renderApp();
    }
    function getMark(monthId, habitId, dayIdx0) { const m = monthsCache[monthId]; if (!m) return false; const arr = m.marks[habitId]; return arr ? !!arr[dayIdx0] : false; }
    function toggleMark(monthId, habitId, dayIdx0) {
      if (!monthsCache[monthId]) return;
      const len = daysInMonthId(monthId);
      if (!monthsCache[monthId].marks[habitId]) monthsCache[monthId].marks[habitId] = new Array(len).fill(false);
      monthsCache[monthId].marks[habitId][dayIdx0] = !monthsCache[monthId].marks[habitId][dayIdx0];
      scheduleSaveMonth(monthId); renderApp();
    }

    /* ---- MOOD TRACKER ---- */
    const MOOD_SYMBOLS = ['', ':(', ':/', ':)', ':D'];

    function cycleMood(monthId, dayIdx0) {
      if (!monthsCache[monthId]) return;
      if (!monthsCache[monthId].mood) monthsCache[monthId].mood = new Array(daysInMonthId(monthId)).fill(0);
      const cur = monthsCache[monthId].mood[dayIdx0] || 0;
      monthsCache[monthId].mood[dayIdx0] = (cur + 1) % 5;
      scheduleSaveMonth(monthId); renderApp();
    }
    function getMoodForDate(date) {
      const mId = dateToMonthId(date);
      const mood = (monthsCache[mId] || {}).mood;
      return mood ? (mood[date.getDate() - 1] || 0) : 0;
    }
    function cycleMoodByDate(isoStr) {
      const d = new Date(isoStr + 'T00:00:00');
      const mId = dateToMonthId(d), dIdx = d.getDate() - 1;
      if (!monthsCache[mId]) return;
      if (!monthsCache[mId].mood) monthsCache[mId].mood = new Array(daysInMonthId(mId)).fill(0);
      const cur = monthsCache[mId].mood[dIdx] || 0;
      monthsCache[mId].mood[dIdx] = (cur + 1) % 5;
      scheduleSaveMonth(mId); renderApp();
    }

    function buildMoodChartInner(days, offsetWd, getMoodFn, clickFn, xLabelFn) {
      // Layout constants
      const yAxisW = 32, colW = 32, xAxisH = 28, padTop = 8;
      const chartH = 80;
      const totalCols = days;
      const svgW = yAxisW + totalCols * colW;
      const svgH = padTop + chartH + xAxisH;

      // Y scale: mood 1=bottom, 4=top
      const moodY = v => padTop + chartH - ((v - 1) / 3) * chartH;

      // Y axis labels + guide lines
      const yLabels = [{ v: 4, s: ':D' }, { v: 3, s: ':)' }, { v: 2, s: ':/' }, { v: 1, s: ':(' }];
      const yAxis = yLabels.map(l =>
        `<text x="${yAxisW - 5}" y="${moodY(l.v) + 4}" text-anchor="end" font-family="IBM Plex Mono,monospace" font-size="10" fill="var(--ink-soft)">${l.s}</text>`
      ).join('');
      const guides = yLabels.map(l =>
        `<line x1="${yAxisW}" y1="${moodY(l.v)}" x2="${svgW}" y2="${moodY(l.v)}" stroke="var(--rule)" stroke-width="0.6" stroke-dasharray="2,3"/>`
      ).join('');
      const axisLine = `<line x1="${yAxisW}" y1="${padTop}" x2="${yAxisW}" y2="${padTop + chartH}" stroke="var(--rule-strong)" stroke-width="0.8"/>`;

      // Collect data points
      const pts = [];
      for (let i = 0; i < days; i++) {
        const v = getMoodFn(i);
        if (v > 0) {
          const x = yAxisW + (i + 0.5) * colW;
          pts.push({ x, y: moodY(v), v, i });
        }
      }

      const polyline = pts.length >= 2
        ? `<polyline points="${pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" fill="none" stroke="var(--moss)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.8"/>`
        : '';
      const dots = pts.map(p =>
        `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4.5" fill="var(--moss)" stroke="var(--paper-raised)" stroke-width="1.5"/>`
      ).join('');

      // X axis labels (day number + short weekday)
      const xLabels = Array.from({ length: days }, (_, i) => {
        const x = yAxisW + (i + 0.5) * colW;
        const lbl = xLabelFn(i);
        const today = lbl.today;
        const col = today ? 'var(--moss)' : 'var(--ink-soft)';
        return `<text x="${x}" y="${padTop + chartH + 11}" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="9" fill="${col}" font-weight="${today ? '700' : '400'}">${lbl.top}</text>
            <text x="${x}" y="${padTop + chartH + 21}" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="8" fill="${col}" opacity="0.7">${lbl.bot}</text>`;
      }).join('');

      // Clickable columns
      const clicks = Array.from({ length: days }, (_, i) => {
        const x = yAxisW + i * colW;
        return `<rect x="${x}" y="${padTop}" width="${colW}" height="${chartH + xAxisH}" fill="transparent" cursor="pointer" onclick="${clickFn(i)}"/>`;
      }).join('');

      return `<div class="mood-chart-scroll">
    <svg width="${svgW}" height="${svgH}" style="display:block;min-width:${svgW}px;">
      ${guides}${axisLine}${yAxis}${polyline}${dots}${xLabels}${clicks}
    </svg>
  </div>`;
    }

    function buildMonthMoodChart(monthId) {
      const days = daysInMonthId(monthId);
      const offset = firstWeekdayIndex(monthId);
      const mood = (monthsCache[monthId] || {}).mood || [];
      const { y, m } = monthIdParts(monthId);
      const today = new Date(), isCur = dateToMonthId(today) === monthId;

      const getMoodFn = i => mood[i] || 0;
      const clickFn = i => `cycleMood('${monthId}',${i})`;
      const xLabelFn = i => {
        const wd = (offset + i) % 7;
        const isToday = isCur && (i + 1) === today.getDate();
        return { top: String(i + 1), bot: WEEKDAYS[wd].label.slice(0, 2), today: isToday };
      };

      return `<div class="card"><span class="eyebrow">Stimmungsverlauf — ${monthLabel(monthId)}</span>
    ${buildMoodChartInner(days, offset, getMoodFn, clickFn, xLabelFn)}
  </div>`;
    }

    function buildWeekMoodChart(weekDates) {
      const today = new Date();
      const getMoodFn = i => getMoodForDate(weekDates[i]);
      const clickFn = i => {
        const d = weekDates[i];
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return `cycleMoodByDate('${iso}')`;
      };
      const xLabelFn = i => {
        const d = weekDates[i];
        const isToday = d.toDateString() === today.toDateString();
        return { top: String(d.getDate()) + '.' + String(d.getMonth() + 1) + '.', bot: WEEKDAYS[i].label.slice(0, 2), today: isToday };
      };

      return `<div class="card"><span class="eyebrow">Stimmungsverlauf — diese Woche</span>
    ${buildMoodChartInner(7, 0, getMoodFn, clickFn, xLabelFn)}
  </div>`;
    }
    /* ---- END MOOD TRACKER ---- */

    function addItem(cat) { mediaLog[cat].push({ text: '', year: currentYear() }); pendingFocusId = 'item-' + cat + '-' + (mediaLog[cat].length - 1); scheduleSaveMedia(); renderApp(); }
    function deleteItem(cat, idx) { mediaLog[cat].splice(idx, 1); scheduleSaveMedia(); renderApp(); }
    function updateItem(cat, idx, v) { mediaLog[cat][idx].text = v; scheduleSaveMedia(); }
    function updateItemYear(cat, idx, v) { const y = parseInt(v, 10); mediaLog[cat][idx].year = isNaN(y) ? currentYear() : y; scheduleSaveMedia(); renderApp(); }
    function migrateBookToRead(idx) { const item = mediaLog.booksToRead.splice(idx, 1)[0]; mediaLog.booksRead.push(item); scheduleSaveMedia(); renderApp(); }

    function addCustomList() {
      if (mediaLog.customLists.length >= 6) return;
      const newId = genId();
      mediaLog.customLists.push({ id: newId, name: '', items: [] });
      pendingFocusId = 'clname-' + newId;
      scheduleSaveMedia(); renderApp();
    }
    function deleteCustomList(id) {
      const list = mediaLog.customLists.find(l => l.id === id);
      const name = (list && list.name && list.name.trim()) ? list.name.trim() : 'diese Liste';
      if (!confirm(`„${name}" wirklich löschen? Alle Einträge darin gehen verloren.`)) return;
      mediaLog.customLists = mediaLog.customLists.filter(l => l.id !== id);
      scheduleSaveMedia(); renderApp();
    }
    function updateCustomListName(id, v) {
      const list = mediaLog.customLists.find(l => l.id === id);
      if (list) list.name = v;
      scheduleSaveMedia();
    }
    function addCustomListItem(id) {
      const list = mediaLog.customLists.find(l => l.id === id);
      if (!list) return;
      list.items.push({ text: '', year: currentYear() });
      pendingFocusId = 'clitem-' + id + '-' + (list.items.length - 1);
      scheduleSaveMedia(); renderApp();
    }
    function deleteCustomListItem(id, idx) {
      const list = mediaLog.customLists.find(l => l.id === id);
      if (!list) return;
      list.items.splice(idx, 1);
      scheduleSaveMedia(); renderApp();
    }
    function updateCustomListItem(id, idx, v) {
      const list = mediaLog.customLists.find(l => l.id === id);
      if (!list) return;
      list.items[idx].text = v;
      scheduleSaveMedia();
    }
    function updateCustomListItemYear(id, idx, v) {
      const list = mediaLog.customLists.find(l => l.id === id);
      if (!list) return;
      const y = parseInt(v, 10);
      list.items[idx].year = isNaN(y) ? currentYear() : y;
      scheduleSaveMedia(); renderApp();
    }
    function addDate() { mediaLog.dates.push({ date: '', text: '' }); pendingFocusId = 'date-day-' + (mediaLog.dates.length - 1); scheduleSaveMedia(); renderApp(); }
    function addDateForMonth(monthNum) { mediaLog.dates.push({ date: '01.' + String(monthNum).padStart(2, '0') + '.', text: '' }); pendingFocusId = 'date-text-' + (mediaLog.dates.length - 1); scheduleSaveMedia(); renderApp(); }
    function deleteDate(idx) { mediaLog.dates.splice(idx, 1); scheduleSaveMedia(); renderApp(); }
    function updateDateField(idx, field, v) { mediaLog.dates[idx][field] = v; scheduleSaveMedia(); }

    function updateColor(varName, value) {
      customColors[varName] = value;
      saveCustomColors();
    }

    async function exportAllData() {
      flashStatus('Exportiere …');
      try {
        const weeksSnap = await userRoot().collection('weeks').get();
        const monthsSnap = await userRoot().collection('months').get();
        const mediaSnap = await mediaRef().get();
        const data = {
          exportedAt: new Date().toISOString(),
          account: currentUser.email,
          media: (mediaSnap.exists && mediaSnap.data().payload) ? JSON.parse(mediaSnap.data().payload) : null,
          weeks: {}, months: {}
        };
        weeksSnap.forEach(doc => { if (doc.data().payload) data.weeks[doc.id] = JSON.parse(doc.data().payload); });
        monthsSnap.forEach(doc => { if (doc.data().payload) data.months[doc.id] = JSON.parse(doc.data().payload); });
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'wochenplaner-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        flashStatus('Backup heruntergeladen');
      } catch (e) { console.error('Export fehlgeschlagen:', e); flashStatus('Export fehlgeschlagen', true); }
    }

    function triggerImport() {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'application/json';
      input.onchange = async (e) => {
        const file = e.target.files[0]; if (!file) return;
        try {
          const text = await file.text();
          const data = JSON.parse(text);
          if (!confirm('Backup importieren?\n\nBestehende Wochen, Monate und Listen mit gleichen Daten werden überschrieben. Das kann nicht rückgängig gemacht werden.')) return;
          flashStatus('Importiere …');
          const writes = [];
          if (data.media) writes.push(mediaRef().set({ payload: JSON.stringify(data.media) }));
          if (data.weeks) Object.keys(data.weeks).forEach(wId => {
            writes.push(userRoot().collection('weeks').doc(wId).set({ payload: JSON.stringify(data.weeks[wId]) }));
          });
          if (data.months) Object.keys(data.months).forEach(mId => {
            writes.push(userRoot().collection('months').doc(mId).set({ payload: JSON.stringify(data.months[mId]) }));
          });
          await Promise.all(writes);
          flashStatus('Import erfolgreich — Seite wird neu geladen');
          setTimeout(() => location.reload(), 1200);
        } catch (e) { console.error('Import fehlgeschlagen:', e); flashStatus('Import fehlgeschlagen — gültige Backup-Datei?', true); }
      };
      input.click();
    }

    async function testConnection() {
      flashStatus('Teste Verbindung …');
      try {
        const testRef = userRoot().collection('meta').doc('connection-test');
        await testRef.set({ ts: Date.now() });
        const snap = await testRef.get();
        flashStatus(snap.exists ? 'Verbindung funktioniert ✓' : 'Verbindung unklar — bitte prüfen', !snap.exists);
      } catch (e) {
        console.error('Verbindungstest fehlgeschlagen:', e);
        flashStatus(e && e.code === 'permission-denied' ? 'Blockiert — Firestore-Regeln prüfen' : 'Verbindung fehlgeschlagen — offline?', true);
      }
    }

    function getAllYearsInData() {
      const years = new Set();
      const collect = arr => arr.forEach(item => { if (item.year) years.add(item.year); });
      ['booksRead', 'movies', 'podcasts', 'quotes', 'achievements'].forEach(k => collect(mediaLog[k]));
      mediaLog.customLists.forEach(l => collect(l.items));
      years.add(currentYear());
      return Array.from(years).sort((a, b) => a - b);
    }
    function getFilteredIndices(arr) {
      if (listYearFilter === 'all') return arr.map((_, i) => i);
      return arr.reduce((acc, item, i) => { if (item.year === listYearFilter) acc.push(i); return acc; }, []);
    }
    function changeListYear(delta) {
      const years = getAllYearsInData();
      let idx = listYearFilter === 'all' ? years.indexOf(currentYear()) : years.indexOf(listYearFilter);
      if (idx === -1) idx = years.length - 1;
      idx = Math.min(Math.max(idx + delta, 0), years.length - 1);
      listYearFilter = years[idx];
      renderApp();
    }
    function setListYear(y) { listYearFilter = y; renderApp(); }
    function buildYearBar() {
      if (!yearBarEnabled) return '';
      const label = listYearFilter === 'all' ? 'Alle Jahre' : String(listYearFilter);
      return `<div class="subheader">
      <div class="week-meta">${label}</div>
      <div class="nav">
        <button onclick="changeListYear(-1)" aria-label="Voriges Jahr">←</button>
        <button class="toggle-btn${listYearFilter === 'all' ? ' on' : ''}" onclick="setListYear('all')">Gesamt</button>
        <button onclick="changeListYear(1)" aria-label="Nächstes Jahr">→</button>
      </div>
    </div>`;
    }

    function buildTabs() {
      const tabs = [['cover', 'Titelblatt'], ['month', 'Monat'], ['week', 'Woche'], ['dates', 'Termine'], ['media', 'Bücher · Filme · Podcasts'], ['quotes', 'Zitate & Achievements'], ['settings', 'Einstellungen']];
      return `<div class="tabs">${tabs.map(([id, label]) => `<button class="tab-btn${currentPage === id ? ' active' : ''}" onclick="switchPage('${id}')">${label}</button>`).join('')}</div>`;
    }

    function buildCoverPage() {
      const today = new Date();
      const dateStr = WEEKDAY_NAMES_FULL[today.getDay()] + ', ' + today.getDate() + '. ' + MONTH_NAMES[today.getMonth()] + ' ' + today.getFullYear();
      const mId = dateToMonthId(today), dIdx = today.getDate() - 1;
      const total = mediaLog.habits.length;
      const done = mediaLog.habits.filter(h => getMark(mId, h.id, dIdx)).length;
      const quote = pickDailyQuote();
      return `
    <div class="cover">
      <div class="cover-date">${dateStr}</div>
      ${quote ? `<blockquote class="cover-quote">${escapeHtml(quote.text)}</blockquote>` : `<p class="cover-empty">Noch keine Zitate gespeichert — trag eines im Tab „Zitate &amp; Achievements" ein.</p>`}
      ${total > 0 ? `<div class="cover-habit-status">${done} von ${total} Gewohnheiten heute erledigt</div>` : ''}
      <div class="cover-nav">
        <button class="cover-btn" onclick="switchPage('month')">Zum Monat</button>
        <button class="cover-btn" onclick="switchPage('week')">Zur Woche</button>
      </div>
    </div>`;
    }

    function buildMonthHabitTable(monthId) {
      const days = daysInMonthId(monthId);
      const offset = firstWeekdayIndex(monthId);
      const today = new Date(), isCurMonth = monthId === dateToMonthId(today), todayDay = today.getDate();

      let weekdayHeaders = '';
      for (let i = 0; i < offset; i++) weekdayHeaders += '<th></th>';
      for (let day = 1; day <= days; day++) {
        const wd = (offset + day - 1) % 7;
        weekdayHeaders += `<th>${WEEKDAYS[wd].label.slice(0, 2)}<br><span style="font-size:9px;opacity:0.7">${day}</span></th>`;
      }

      const habitRows = mediaLog.habits.map((h, hIdx) => {
        let cells = '';
        for (let i = 0; i < offset; i++) cells += '<td></td>';

        for (let day = 1; day <= days; day++) {
          const idx0 = day - 1;
          const checked = getMark(monthId, h.id, idx0);
          const isToday = isCurMonth && day === todayDay;

          cells += `
        <td>
          <button class="month-habit-month-dot${checked ? ' filled' : ''}${isToday ? ' today' : ''}" 
                  onclick="toggleMark('${monthId}','${h.id}',${idx0})"
                  aria-label="${escapeHtml(h.name || 'Gewohnheit')} ${day}.">
          </button>
        </td>`;
        }

        return `
      <tr class="habit-row"${dragRowAttrs('habit', hIdx)}>
        <td class="habit-name-cell" style="padding:2px 10px 2px 6px; min-width:170px;">
          <div style="display:flex; align-items:center; gap:6px;">
            ${dragHandleHTML('habit', hIdx)}
            <input type="text" id="habitname-${h.id}" value="${escapeHtml(h.name)}" placeholder="Gewohnheit" 
                   oninput="updateHabitName('${h.id}', this.value)" style="width:100%; font-size:13.5px;">
          </div>
        </td>
        ${cells}
        <td style="padding:8px 6px;">
          <button class="habit-del" onclick="deleteHabitDef('${h.id}')" aria-label="Gewohnheit löschen">×</button>
        </td>
      </tr>`;
      }).join('');

      return `
    <table class="month-habit-table">
      <thead>
        <tr>
          <th class="habit-name-header"><p style="font-size: 14px;"> Gewohnheit</p></th>
          ${weekdayHeaders}
          <th></th>
        </tr>
      </thead>
      <tbody>
      ${habitRows}
            <th class="habit-name-header"><p style="font-size: 14px;"></p></th>
          ${weekdayHeaders}
          <th></th>
          </tbody>
    </table>`;
    }

    function buildMonthTermineList(monthId) {
      const { m } = monthIdParts(monthId);
      const withIdx = mediaLog.dates.map((d, i) => ({ date: d.date, text: d.text, _i: i })).filter(d => { const p = parseDM(d.date); return p && p.month === m; });
      withIdx.sort((a, b) => parseDateKey(a.date) - parseDateKey(b.date));
      let rows = withIdx.map(item => `<div class="row">
      <input type="text" id="date-day-${item._i}" class="date-field" value="${escapeHtml(item.date)}" placeholder="TT.MM." oninput="updateDateField(${item._i},'date', this.value)">
      <input type="text" id="date-text-${item._i}" value="${escapeHtml(item.text)}" placeholder="Name / Anlass" oninput="updateDateField(${item._i},'text', this.value)">
      <button class="del-btn" onclick="deleteDate(${item._i})" aria-label="Eintrag löschen">×</button>
    </div>`).join('');
      if (!rows) rows = '<div class="empty-hint">Keine Termine in diesem Monat.</div>';
      return `<div class="card"><span class="eyebrow">Termine in ${monthLabel(monthId)}</span><div class="rows">${rows}</div><button class="add-row" onclick="addDateForMonth(${m})">+ Termin in diesem Monat</button></div>`;
    }

    function buildMonthPage() {
      const monthId = currentMonthId(monthOffset);
      return `
    <div class="subheader">
      <div class="week-meta">${monthLabel(monthId)}</div>
      <div class="nav"><button onclick="changeMonth(-1)" aria-label="Voriger Monat">←</button><button onclick="goThisMonth()">Dieser Monat</button><button onclick="changeMonth(1)" aria-label="Nächster Monat">→</button></div>
    </div>
    <div class="card">
      <span class="eyebrow">Gewohnheiten — ${monthLabel(monthId)}</span>
      <div style="overflow-x:auto; padding:4px 0 12px 0; border-bottom:1px solid var(--rule); margin-bottom:12px;">
        ${buildMonthHabitTable(monthId)}
      </div>
      <button class="add-habit" onclick="addHabitDef()">+ Gewohnheit</button>
    </div>
    ${buildMonthMoodChart(monthId)}
    ${buildMonthTermineList(monthId)}
  `;
    }

    function buildWeekPage() {
      const monday = getMonday(weekOffset), week = isoWeekNumber(monday);
      const sunday = new Date(monday); sunday.setDate(sunday.getDate() + 6);
      const todayIdx = (() => { if (weekOffset !== 0) return -1; const d = new Date().getDay(); return d === 0 ? 6 : d - 1; })();
      const weekDates = []; for (let i = 0; i < 7; i++) { const d = new Date(monday); d.setDate(d.getDate() + i); weekDates.push(d); }

      let daysHtml = '';
      WEEKDAYS.forEach((d, i) => {
        const date = weekDates[i];
        let rowsHtml = '';
        weekData.days[d.key].forEach((row, idx) => {
          const rowClasses = ['row'];
          if (row.sym === '✓' || row.sym === '✕') rowClasses.push('done');
          if (row.sym === '›') rowClasses.push('migrated');
          if (row.sym === '!') rowClasses.push('important');
          const dragKey = 'day:' + d.key;
          rowsHtml += `<div class="${rowClasses.join(' ')}"${dragRowAttrs(dragKey, idx)}>
        ${dragHandleHTML(dragKey, idx)}
        <button class="sym-btn" onclick="cycleSymbol('${d.key}',${idx})" aria-label="Eintragsart ändern">${row.sym}</button>
        <input type="text" id="row-${d.key}-${idx}" value="${escapeHtml(row.text)}" placeholder="…" oninput="updateRowText('${d.key}',${idx}, this.value)">
        <button class="del-btn" onclick="deleteRow('${d.key}',${idx})" aria-label="Eintrag löschen">×</button>
      </div>`;
        });
        daysHtml += `<div class="day-card${i === todayIdx ? ' today' : ''}">
      <div class="day-head"><span class="day-name">${d.label}</span>
        <div class="day-head-right">
          <button class="weather-btn" onclick="cycleWeather('${d.key}')" aria-label="Wetter ändern (aktuell: ${WEATHER_LABELS[weekData.weather[d.key]]})">${weatherIconHTML(weekData.weather[d.key])}</button>
          <span class="day-date">${fmtDate(date)}</span>
        </div>
      </div>
      <div class="rows">${rowsHtml}</div>
      <button class="add-row" onclick="addRow('${d.key}')">+ Eintrag</button>
    </div>`;
      });

      const habitRows = mediaLog.habits.map((h, hIdx) => {
        const cells = weekDates.map((d, ci) => {
          const mId = dateToMonthId(d), dIdx = d.getDate() - 1, checked = getMark(mId, h.id, dIdx);
          const isToday = ci === todayIdx;
          return `<td><button class="dot${checked ? ' filled' : ''}${isToday ? ' today' : ''}" onclick="toggleMark('${mId}','${h.id}',${dIdx})" aria-label="${escapeHtml(h.name) || 'Gewohnheit'} ${fmtDate(d)}"></button></td>`;
        }).join('');
        return `<tr class="habit-row"${dragRowAttrs('habit', hIdx)}><td class="habit-name-cell"><div style="display:flex; align-items:center; gap:6px;">${dragHandleHTML('habit', hIdx)}<input type="text" id="habitname-${h.id}" value="${escapeHtml(h.name)}" placeholder="Gewohnheit" oninput="updateHabitName('${h.id}', this.value)"></div></td>${cells}<td><button class="habit-del" onclick="deleteHabitDef('${h.id}')" aria-label="Gewohnheit löschen">×</button></td></tr>`;
      }).join('');

      const ph = ['z. B. wichtigstes Vorhaben', 'z. B. zweite Priorität', 'z. B. dritte Priorität'];

      return `
    <div class="subheader">
      <div class="week-meta">KW ${week} · ${fmtDate(monday)} – ${fmtDate(sunday)} ${sunday.getFullYear()}</div>
      <div class="nav"><button onclick="changeWeek(-1)" aria-label="Vorige Woche">←</button><button onclick="goToday()">Diese Woche</button><button onclick="changeWeek(1)" aria-label="Nächste Woche">→</button></div>
    </div>
    <div class="card focus-box"><span class="eyebrow">Diese Woche im Fokus</span>
      <div class="focus-grid">
        <input type="text" value="${escapeHtml(weekData.focus[0])}" placeholder="${ph[0]}" oninput="updateFocus(0, this.value)">
        <input type="text" value="${escapeHtml(weekData.focus[1])}" placeholder="${ph[1]}" oninput="updateFocus(1, this.value)">
        <input type="text" value="${escapeHtml(weekData.focus[2])}" placeholder="${ph[2]}" oninput="updateFocus(2, this.value)">
      </div>
    </div>
    <div class="legend"><span class="legend-weather">${weatherIconHTML(0)} antippen, um Wetter zu setzen</span></div>
    <div class="days">${daysHtml}</div>
    <div class="week-trackers-row">
      <div class="card"><span class="eyebrow">Gewohnheiten — diese Woche</span>
        <div style="overflow-x:auto"><table class="habit-table"><thead><tr><th>&nbsp;</th>${WEEKDAYS.map(d => `<th>${d.label.slice(0, 2)}</th>`).join('')}<th>&nbsp;</th></tr></thead><tbody>${habitRows}</tbody></table></div>
        <button class="add-habit" onclick="addHabitDef()">+ Gewohnheit</button>
      </div>
      ${buildWeekMoodChart(weekDates)}
    </div>
    <div class="card textbox"><span class="eyebrow">Wochenrückblick</span>
      <textarea id="reflection-textarea"${mediaLog.textareaSizes && mediaLog.textareaSizes.reflection ? ` style="height:${mediaLog.textareaSizes.reflection}px"` : ''} placeholder="Was lief gut? Was nehme ich mit in die nächste Woche?" oninput="updateReflection(this.value)">${escapeHtml(weekData.reflection)}</textarea>
    </div>
    <div class="card textbox"><span class="eyebrow">Braindump</span>
      <textarea id="braindump-textarea"${mediaLog.textareaSizes && mediaLog.textareaSizes.brainDump ? ` style="height:${mediaLog.textareaSizes.brainDump}px"` : ''} placeholder="Alles, was dir durch den Kopf geht — ohne Struktur, einfach festhalten." oninput="updateBrainDump(this.value)">${escapeHtml(weekData.brainDump)}</textarea>
    </div>
  `;
    }

    function buildDatesPage() {
      const groups = {}; for (let m = 1; m <= 12; m++) groups[m] = [];
      mediaLog.dates.forEach((d, i) => { const p = parseDM(d.date); if (p && p.month >= 1 && p.month <= 12) groups[p.month].push({ date: d.date, text: d.text, _i: i, day: p.day }); });
      let cards = '';
      for (let m = 1; m <= 12; m++) {
        const items = groups[m].slice().sort((a, b) => a.day - b.day);
        let rows = items.map(item => `<div class="row">
        <input type="text" id="date-day-${item._i}" class="date-field" value="${escapeHtml(item.date)}" placeholder="TT.MM." oninput="updateDateField(${item._i},'date', this.value)">
        <input type="text" id="date-text-${item._i}" value="${escapeHtml(item.text)}" placeholder="Name" oninput="updateDateField(${item._i},'text', this.value)">
        <button class="del-btn" onclick="deleteDate(${item._i})" aria-label="Eintrag löschen">×</button>
      </div>`).join('');
        if (!rows) rows = '<div class="empty-hint">—</div>';
        cards += `<div class="month-term-card"><h3>${MONTH_NAMES[m - 1]}</h3><div class="rows">${rows}</div><button class="add-row" onclick="addDateForMonth(${m})">+ Termin</button></div>`;
      }
      return `<div class="card"><span class="eyebrow">Wichtige Termine — gesamtes Jahr</span><div class="term-grid">${cards}</div></div>`;
    }

    function buildMediaCard(label, icon, key, withMigrate, yearFilterable) {
      let rows = '';
      const dragKey = 'list:' + key;
      const allowDrag = !yearFilterable || listYearFilter === 'all';
      const indices = yearFilterable ? getFilteredIndices(mediaLog[key]) : mediaLog[key].map((_, i) => i);
      indices.forEach(idx => {
        const item = mediaLog[key][idx];
        const mig = withMigrate ? `<button class="mig-btn" onclick="migrateBookToRead(${idx})" title="Als gelesen markieren" aria-label="Als gelesen markieren">→</button>` : '';
        const yearInput = yearFilterable ? yearSelectHTML(item.year, `updateItemYear('${key}',${idx}, this.value)`) : '';
        rows += `<div class="row"${allowDrag ? dragRowAttrs(dragKey, idx) : ''}>${allowDrag ? dragHandleHTML(dragKey, idx) : ''}<span class="static-dot">•</span><input type="text" id="item-${key}-${idx}" value="${escapeHtml(item.text)}" placeholder="Titel" oninput="updateItem('${key}',${idx}, this.value)">${yearInput}${mig}<button class="del-btn" onclick="deleteItem('${key}',${idx})" aria-label="Eintrag löschen">×</button></div>`;
      });
      if (!rows && yearFilterable && listYearFilter !== 'all') rows = `<div class="empty-hint">Keine Einträge in ${listYearFilter}.</div>`;
      return `<div class="card"><span class="eyebrow icon-row">${icon} ${label}</span><div class="rows">${rows}</div><button class="add-row" onclick="addItem('${key}')">+ Eintrag</button></div>`;
    }

    function buildCustomListCard(list) {
      const dragKey = 'customlist:' + list.id;
      const allowDrag = listYearFilter === 'all';
      const indices = getFilteredIndices(list.items);
      let rows = indices.map(idx => {
        const item = list.items[idx];
        const yearInput = yearSelectHTML(item.year, `updateCustomListItemYear('${list.id}',${idx}, this.value)`);
        return `<div class="row"${allowDrag ? dragRowAttrs(dragKey, idx) : ''}>${allowDrag ? dragHandleHTML(dragKey, idx) : ''}<span class="static-dot">•</span><input type="text" id="clitem-${list.id}-${idx}" value="${escapeHtml(item.text)}" placeholder="Eintrag" oninput="updateCustomListItem('${list.id}',${idx}, this.value)">${yearInput}<button class="del-btn" onclick="deleteCustomListItem('${list.id}',${idx})" aria-label="Eintrag löschen">×</button></div>`;
      }).join('');
      if (!rows && listYearFilter !== 'all') rows = `<div class="empty-hint">Keine Einträge in ${listYearFilter}.</div>`;
      return `<div class="card">
    <div class="custom-list-head">
      <input type="text" id="clname-${list.id}" class="custom-list-name" value="${escapeHtml(list.name)}" placeholder="Name der Liste, z. B. Brettspiele" oninput="updateCustomListName('${list.id}', this.value)">
      <button class="habit-del" onclick="deleteCustomList('${list.id}')" aria-label="Liste löschen">×</button>
    </div>
    <div class="rows">${rows}</div>
    <button class="add-row" onclick="addCustomListItem('${list.id}')">+ Eintrag</button>
  </div>`;
    }

    function buildCustomListsSection() {
      const lists = mediaLog.customLists.map(buildCustomListCard).join('');
      const addBtn = mediaLog.customLists.length < 6
        ? `<button class="add-habit" onclick="addCustomList()">+ Neue Liste</button>`
        : `<div class="empty-hint">Maximal 6 eigene Listen</div>`;
      return `<div class="card"><span class="eyebrow">Eigene Listen</span>${lists || '<div class="empty-hint">Noch keine eigenen Listen — z. B. Brettspiele, besuchte Orte, was auch immer du tracken willst.</div>'}${addBtn}</div>`;
    }

    function buildMediaPage() {
      return buildYearBar()
        + buildMediaCard('Bücher (gelesen)', bookIconHTML(), 'booksRead', false, true)
        + buildMediaCard('Bücher (geplant)', bookIconHTML(), 'booksToRead', true, false)
        + buildMediaCard('Filme & Serien', filmIconHTML(), 'movies', false, true)
        + buildMediaCard('Podcasts', micIconHTML(), 'podcasts', false, true)
        + buildCustomListsSection();
    }

    function buildQuotesCard() {
      const allowDrag = listYearFilter === 'all';
      const indices = getFilteredIndices(mediaLog.quotes);
      let rows = indices.map(idx => {
        const item = mediaLog.quotes[idx];
        const yearInput = yearSelectHTML(item.year, `updateItemYear('quotes',${idx}, this.value)`);
        return `<div class="row"${allowDrag ? dragRowAttrs('list:quotes', idx) : ''}>${allowDrag ? dragHandleHTML('list:quotes', idx) : ''}<span class="static-dot">"</span><input type="text" id="item-quotes-${idx}" value="${escapeHtml(item.text)}" placeholder="Zitat" oninput="updateItem('quotes',${idx}, this.value)">${yearInput}<button class="del-btn" onclick="deleteItem('quotes',${idx})" aria-label="Eintrag löschen">×</button></div>`;
      }).join('');
      if (!rows && listYearFilter !== 'all') rows = `<div class="empty-hint">Keine Zitate in ${listYearFilter}.</div>`;
      return `<div class="card"><span class="eyebrow">Zitate</span><div class="rows">${rows}</div><button class="add-row" onclick="addItem('quotes')">+ Zitat</button></div>`;
    }
    function buildAchievementsCard() {
      const allowDrag = listYearFilter === 'all';
      const indices = getFilteredIndices(mediaLog.achievements);
      let rows = indices.map(idx => {
        const item = mediaLog.achievements[idx];
        const yearInput = yearSelectHTML(item.year, `updateItemYear('achievements',${idx}, this.value)`);
        return `<div class="row"${allowDrag ? dragRowAttrs('list:achievements', idx) : ''}>${allowDrag ? dragHandleHTML('list:achievements', idx) : ''}<span class="trophy-mark">${trophyIconHTML()}</span><input type="text" id="item-achievements-${idx}" value="${escapeHtml(item.text)}" placeholder="Achievement" oninput="updateItem('achievements',${idx}, this.value)">${yearInput}<button class="del-btn" onclick="deleteItem('achievements',${idx})" aria-label="Eintrag löschen">×</button></div>`;
      }).join('');
      if (!rows && listYearFilter !== 'all') rows = `<div class="empty-hint">Keine Achievements in ${listYearFilter}.</div>`;
      return `<div class="card"><span class="eyebrow">Achievements</span><div class="rows">${rows}</div><button class="add-row" onclick="addItem('achievements')">+ Achievement</button></div>`;
    }

    function buildSettingsPage() {
      const vars = [
        { name: '--paper', label: 'Hintergrund' },
        { name: '--paper-raised', label: 'Karten-Hintergrund' },
        { name: '--ink', label: 'Textfarbe' },
        { name: '--ink-soft', label: 'Grau / Sekundär' },
        { name: '--moss', label: 'Akzentfarbe (Moss)' },
        { name: '--moss-soft', label: 'Akzent hell' },
        { name: '--rule', label: 'Linien dünn' },
        { name: '--rule-strong', label: 'Linien stark' },
        { name: '--done', label: 'Erledigt' },
      ];

      const appearanceCard = `<div class="card">
    <span class="eyebrow">Darstellung</span>
    <div class="settings-row">
      <div>
        <div class="settings-row-title">Dunkelmodus</div>
        <div class="settings-row-sub">${darkMode ? 'Aktuell aktiv' : 'Aktuell aus'}</div>
      </div>
      <button class="toggle-btn${darkMode ? ' on' : ''}" onclick="toggleDarkMode()" aria-pressed="${darkMode}">${darkMode ? 'Dunkel' : 'Hell'}</button>
    </div>
    <div class="settings-row">
      <div>
        <div class="settings-row-title">Jahresleiste</div>
        <div class="settings-row-sub">${yearBarEnabled ? 'Aktuell sichtbar bei Listen' : 'Aktuell ausgeblendet'}</div>
      </div>
      <button class="toggle-btn${yearBarEnabled ? ' on' : ''}" onclick="toggleYearBar()" aria-pressed="${yearBarEnabled}">${yearBarEnabled ? 'Ein' : 'Aus'}</button>
    </div>
    <div class="settings-row">
      <div>
        <div class="settings-row-title">Textfeld-Größen</div>
        <div class="settings-row-sub">Wochenrückblick &amp; Braindump auf Standardgröße zurücksetzen</div>
      </div>
      <button class="toggle-btn" onclick="resetTextareaSizes()">Zurücksetzen</button>
    </div>
    <div class="settings-row">
      <div>
        <div class="settings-row-title">Keys</div>
          <div class="settings-row-sub">
            <div class="settings-row">
              <div>• Aufgabe </div>
              <div>○ Termin </div>
              <div>– Notiz </div>
              <div>✓ Erledigt </div>
            </div>
            <div class="settings-row">
              <div>! Wichtig </div>
              <div>✕ Irrelevant </div>
              <div>› Verschoben</div>
            </div>
          </div>
      </div>
    </div>
  </div>`;

      let colorHtml = `<div class="card"><span class="eyebrow">Farben anpassen</span><div class="settings-grid">`;
      vars.forEach(v => {
        const current = customColors[v.name] || getComputedStyle(document.documentElement).getPropertyValue(v.name).trim();
        colorHtml += `
      <div class="color-field">
        <label>${v.label}</label>
        <input type="color" value="${current}" onchange="updateColor('${v.name}', this.value)">
      </div>`;
      });
      colorHtml += `</div><button class="reset-btn" onclick="resetColors()" style="margin-top:16px;">Alle Farben zurücksetzen</button></div>`;

      const dataCard = `<div class="card">
    <span class="eyebrow">Daten &amp; Sicherung</span>
    <div class="settings-row">
      <div>
        <div class="settings-row-title">Angemeldet als</div>
        <div class="settings-row-sub">${escapeHtml(currentUser.email)}</div>
      </div>
      <button class="toggle-btn" onclick="doSignOut()">Abmelden</button>
    </div>
    <div class="settings-divider"></div>
    <div class="settings-row">
      <div>
        <div class="settings-row-title">Verbindung</div>
        <div class="settings-row-sub">Firestore-Zugriff prüfen</div>
      </div>
      <button class="toggle-btn" onclick="testConnection()">Verbindung testen</button>
    </div>
    <div class="settings-divider"></div>
    <div class="settings-row">
      <div>
        <div class="settings-row-title">Backup erstellen</div>
        <div class="settings-row-sub">Lädt alle Wochen, Monate und Listen als JSON-Datei herunter</div>
      </div>
      <button class="toggle-btn" onclick="exportAllData()">Exportieren</button>
    </div>
    <div class="settings-divider"></div>
    <div class="settings-row">
      <div>
        <div class="settings-row-title">Backup wiederherstellen</div>
        <div class="settings-row-sub">Überschreibt bestehende Einträge mit Daten aus einer JSON-Datei</div>
      </div>
      <button class="toggle-btn" onclick="triggerImport()">Importieren</button>
    </div>
  </div>`;

      const legalCard = `<div class="card">
    <span class="eyebrow">Rechtliches</span>
    <div class="settings-row">
      <div>
        <div class="settings-row-title">Datenschutzerklärung</div>
        <div class="settings-row-sub">Wie deine Daten verarbeitet werden</div>
      </div>
      <button class="toggle-btn" onclick="renderLegalScreen('privacy')">Anzeigen</button>
    </div>
    <div class="settings-divider"></div>
    <div class="settings-row">
      <div>
        <div class="settings-row-title">Impressum</div>
        <div class="settings-row-sub">Anbieterkennzeichnung</div>
      </div>
      <button class="toggle-btn" onclick="renderLegalScreen('imprint')">Anzeigen</button>
    </div>
  </div>`;

      const aboutCard = `<div class="card">
    <span class="eyebrow">Über diese App</span>
    <div class="settings-row">
      <div>
        <div class="settings-row-title">Version ${APP_VERSION}</div>
        <div class="settings-row-sub">Was sich zuletzt geändert hat</div>
      </div>
      <button class="toggle-btn" onclick="renderChangelogScreen()">Changelog</button>
    </div>
  </div>`;

      const feedbackCard = `<div class="card">
    <span class="eyebrow">Feedback</span>
    <textarea id="feedback-text" class="feedback-textarea" placeholder="Was fehlt? Was nervt? Was läuft gut?"></textarea>
    <button class="toggle-btn" onclick="submitFeedback()">Absenden</button>
  </div>`;

      const dangerCard = `<div class="card">
    <span class="eyebrow">Account löschen</span>
    <div class="settings-row">
      <div>
        <div class="settings-row-title">Account und alle Daten löschen</div>
        <div class="settings-row-sub">Unwiderruflich — kann nicht rückgängig gemacht werden</div>
      </div>
      <button class="danger-btn" onclick="deleteAccount()">Löschen</button>
    </div>
  </div>`;

      return appearanceCard + colorHtml + dataCard + legalCard + aboutCard + feedbackCard + dangerCard;
    }

    function weatherIconHTML(idx) {
      const color = idx === 0 ? 'var(--rule-strong)' : 'var(--moss)';
      const cloud = '<path d="M3.8 13.2c-1.4 0-2.5-1-2.5-2.3 0-1.1.8-2 1.9-2.2.3-1.7 1.8-2.9 3.6-2.9 1.6 0 3 1 3.4 2.4h.3c1.3 0 2.4 1 2.4 2.3 0 1.3-1.1 2.3-2.4 2.3H3.8z"/>';
      let inner;
      if (idx === 1) inner = '<circle cx="9" cy="9" r="2.8" fill="' + color + '" stroke="none"/><line x1="9" y1="2.6" x2="9" y2="4.7"/><line x1="9" y1="13.3" x2="9" y2="15.4"/><line x1="2.6" y1="9" x2="4.7" y2="9"/><line x1="13.3" y1="9" x2="15.4" y2="9"/><line x1="4.5" y1="4.5" x2="6.0" y2="6.0"/><line x1="12.0" y1="12.0" x2="13.5" y2="13.5"/><line x1="4.5" y1="13.5" x2="6.0" y2="12.0"/><line x1="12.0" y1="6.0" x2="13.5" y2="4.5"/>';
      else if (idx === 2) inner = cloud;
      else if (idx === 3) inner = cloud + '<line x1="5" y1="15" x2="5" y2="17"/><line x1="9" y1="15" x2="9" y2="17"/><line x1="13" y1="15" x2="13" y2="17"/>';
      else if (idx === 4) inner = cloud + '<circle cx="5" cy="16" r="0.7" fill="' + color + '" stroke="none"/><circle cx="9" cy="16" r="0.7" fill="' + color + '" stroke="none"/><circle cx="13" cy="16" r="0.7" fill="' + color + '" stroke="none"/>';
      else if (idx === 5) inner = cloud + '<path d="M9.5 13.5 L7.8 16.2 L9.6 16.2 L8 18.2"/>';
      else inner = '<circle cx="9" cy="9" r="6" stroke-dasharray="2 2"/>';
      return '<svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="' + color + '" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';
    }
    function trophyIconHTML() {
      return '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="var(--moss)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 2h6v3a3 3 0 0 1-6 0V2z"/><path d="M5 3H3a2 2 0 0 0 2 3"/><path d="M11 3h2a2 2 0 0 1-2 3"/><line x1="8" y1="8" x2="8" y2="10.5"/><line x1="5.5" y1="13" x2="10.5" y2="13"/><line x1="8" y1="10.5" x2="8" y2="13"/></svg>';
    }
    function bookIconHTML() {
      return '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="var(--moss)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3c1.5-1 3.5-1 5 0v9c-1.5-1-3.5-1-5 0V3z"/><path d="M14 3c-1.5-1-3.5-1-5 0v9c1.5-1 3.5-1 5 0V3z"/></svg>';
    }
    function filmIconHTML() {
      return '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="var(--moss)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="12" height="8" rx="1.2"/><path d="M3 6l2-3.2h2L5 6"/><path d="M7 6l2-3.2h2L9 6"/><path d="M11 6l1.6-3.2H13L11.6 6"/></svg>';
    }
    function micIconHTML() {
      return '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="var(--moss)" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="1.5" width="4" height="7" rx="2"/><path d="M4 8a4 4 0 0 0 8 0"/><line x1="8" y1="12" x2="8" y2="14.5"/><line x1="5.5" y1="14.5" x2="10.5" y2="14.5"/></svg>';
    }
    function pickDailyQuote() {
      const valid = (mediaLog.quotes || []).filter(q => q.text && q.text.trim());
      if (!valid.length) return null;
      const start = new Date(new Date().getFullYear(), 0, 0);
      const doy = Math.floor((Date.now() - start) / 86400000);
      return valid[doy % valid.length];
    }

    function renderSetupNotice() {
      document.getElementById('app').innerHTML = `<div class="setup-card"><h2>Fast fertig — noch ein Schritt</h2>
  <p>Damit deine Einträge auf allen Geräten synchron bleiben, brauchst du eine kostenlose Firebase-Verbindung. Trag dazu im Quellcode oben im &lt;script&gt;-Bereich deine Werte ein:</p>
  <ol><li>Projekt anlegen auf <code>console.firebase.google.com</code></li><li>Firestore Database aktivieren</li><li>Web-App registrieren, Config-Werte kopieren</li><li>Bei <code>firebaseConfig</code> einfügen, speichern</li></ol>
  <p>Anleitung dazu steht im Chat mit Claude.</p></div>`;
    }

    function renderApp() {
      let content;
      if (currentPage === 'cover') content = buildCoverPage();
      else if (currentPage === 'month') content = buildMonthPage();
      else if (currentPage === 'week') content = buildWeekPage();
      else if (currentPage === 'dates') content = buildDatesPage();
      else if (currentPage === 'media') content = buildMediaPage();
      else if (currentPage === 'quotes') content = buildYearBar() + buildQuotesCard() + buildAchievementsCard();
      else if (currentPage === 'settings') content = buildSettingsPage();
      else content = buildCoverPage();

      document.getElementById('app').innerHTML = `
    <div class="header">
      <svg class="leaf" viewBox="0 0 24 24" fill="none" stroke="var(--moss)" stroke-width="1.4"><path d="M4 20C4 12 9 4 20 4C20 14 13 20 4 20Z"/><path d="M5 19C9 14 13 10 19 5"/></svg>
      <h1>Wochenplaner</h1>
            <button class="toggle-btn${reorderMode ? ' on' : ''}" id="reorder-toggle" onclick="toggleReorderMode()" style="margin-left:auto;">${reorderMode ? 'Sortieren ✓' : 'Sortieren'}</button>
    </div>
    ${buildTabs()}
    ${content}
  `;

      if (pendingFocusId) {
        const el = document.getElementById(pendingFocusId);
        if (el) el.focus();
        pendingFocusId = null;
      }
      if (currentPage === 'week') attachTextareaResizeTracking();
    }

    init();

(function () {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${location.host}/ws`;
  const logOutput = document.getElementById('log-output');
  const connectionEl = document.getElementById('connection');
  const liveBadge = document.getElementById('live-badge');
  const searchInput = document.getElementById('search');
  const searchClear = document.getElementById('search-clear');
  const btnPause = document.getElementById('btn-pause');
  const btnClear = document.getElementById('btn-clear');
  const soundOnError = document.getElementById('sound-on-error');
  const emptyState = document.getElementById('empty-state');

  const statTotal = document.getElementById('stat-total');
  const statRate = document.getElementById('stat-rate');
  const statErrors = document.getElementById('stat-errors');
  const statInfo = document.getElementById('stat-info');
  const statWarn = document.getElementById('stat-warn');
  const statErrorCount = document.getElementById('stat-error');
  const statDebug = document.getElementById('stat-debug');

  let ws = null;
  let reconnectTimer = null;
  let isPaused = false;
  let pauseBuffer = [];
  const stats = { total: 0, errors: 0, info: 0, warn: 0, error: 0, debug: 0 };
  const rateWindow = [];
  const RATE_WINDOW_MS = 5000;
  let logEntries = [];

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function highlightMatch(text, query) {
    if (!query || !query.trim()) return escapeHtml(text);
    const q = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(${q})`, 'gi');
    return escapeHtml(text).replace(re, '<mark>$1</mark>');
  }

  function relativeTime(iso) {
    const d = new Date(iso);
    const now = Date.now();
    const sec = Math.floor((now - d) / 1000);
    if (sec < 5) return 'just now';
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const h = Math.floor(min / 60);
    return `${h}h ago`;
  }

  function updateRate() {
    const now = Date.now();
    while (rateWindow.length && rateWindow[0] < now - RATE_WINDOW_MS) rateWindow.shift();
    const rate = rateWindow.length / (RATE_WINDOW_MS / 1000);
    statRate.textContent = rate.toFixed(1);
  }

  function updateStats() {
    statTotal.textContent = stats.total;
    statErrors.textContent = stats.errors;
    statInfo.textContent = stats.info;
    statWarn.textContent = stats.warn;
    if (statErrorCount) statErrorCount.textContent = stats.error;
    statDebug.textContent = stats.debug;
    updateRate();
  }

  function playErrorSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 400;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.15);
    } catch (_) {}
  }

  function applySearchFilter() {
    const q = (searchInput.value || '').trim().toLowerCase();
    logOutput.querySelectorAll('.log-line').forEach((el) => {
      const match = !q || el.dataset.searchText.includes(q);
      el.classList.toggle('hidden', !match);
    });
  }

  function renderEntry(entry, query) {
    const line = document.createElement('div');
    line.className = `log-line ${entry.level}`;
    line.dataset.searchText = `${entry.level} ${entry.message} ${entry.timestamp}`.toLowerCase();
    const rel = relativeTime(entry.timestamp);
    line.innerHTML =
      '<button type="button" class="copy-btn" title="Copy line">⎘</button>' +
      '<span class="content">' +
      '<span class="ts" title="' + escapeHtml(entry.timestamp) + '">' + escapeHtml(rel) + '</span> ' +
      '<span class="level ' + escapeHtml(entry.level) + '">' + escapeHtml(entry.level) + '</span> ' +
      '<span class="msg">' + highlightMatch(entry.message, query) + '</span>' +
      '</span>';
    const copyBtn = line.querySelector('.copy-btn');
    copyBtn.addEventListener('click', () => {
      const raw = `${entry.timestamp} ${entry.level.toUpperCase()} ${entry.message}`;
      navigator.clipboard.writeText(raw).then(() => {
        copyBtn.classList.add('copied');
        copyBtn.textContent = '✓';
        setTimeout(() => {
          copyBtn.classList.remove('copied');
          copyBtn.textContent = '⎘';
        }, 1500);
      });
    });
    return line;
  }

  function appendLog(entry) {
    stats.total++;
    rateWindow.push(Date.now());
    if (entry.level === 'error') stats.errors++;
    if (entry.level === 'info') stats.info++;
    if (entry.level === 'warn') stats.warn++;
    if (entry.level === 'error') stats.error++;
    if (entry.level === 'debug') stats.debug++;
    updateStats();

    if (soundOnError && soundOnError.checked && entry.level === 'error') playErrorSound();

    if (emptyState && !emptyState.classList.contains('hidden')) emptyState.classList.add('hidden');

    const query = (searchInput && searchInput.value || '').trim();
    const line = renderEntry(entry, query);
    logEntries.push({ entry, el: line });

    if (isPaused) {
      pauseBuffer.push({ entry, el: line });
      return;
    }

    const shouldShow = !query || `${entry.level} ${entry.message}`.toLowerCase().includes(query.toLowerCase());
    if (!shouldShow) line.classList.add('hidden');
    logOutput.appendChild(line);
    logOutput.scrollTop = logOutput.scrollHeight;
  }

  function flushPauseBuffer() {
    const query = (searchInput && searchInput.value || '').trim();
    pauseBuffer.forEach(({ entry, el }) => {
      const shouldShow = !query || `${entry.level} ${entry.message}`.toLowerCase().includes(query.toLowerCase());
      if (!shouldShow) el.classList.add('hidden');
      logOutput.appendChild(el);
    });
    pauseBuffer = [];
    logOutput.scrollTop = logOutput.scrollHeight;
  }

  function connect() {
    ws = new WebSocket(wsUrl);
    ws.onopen = () => {
      connectionEl.textContent = 'Live';
      liveBadge.classList.add('connected');
      liveBadge.classList.remove('disconnected');
    };
    ws.onclose = () => {
      connectionEl.textContent = 'Reconnecting…';
      liveBadge.classList.remove('connected');
      liveBadge.classList.add('disconnected');
      reconnectTimer = setTimeout(connect, 2000);
    };
    ws.onerror = () => {};
    ws.onmessage = (event) => {
      try {
        const entry = JSON.parse(event.data);
        appendLog(entry);
      } catch (_) {
        const line = document.createElement('div');
        line.className = 'log-line';
        line.textContent = event.data;
        logOutput.appendChild(line);
        logOutput.scrollTop = logOutput.scrollHeight;
      }
    };
  }

  function updateSearchClearVisibility() {
    searchClear.style.visibility = searchInput.value.trim() ? 'visible' : 'hidden';
  }

  searchInput.addEventListener('input', () => {
    updateSearchClearVisibility();
    applySearchFilter();
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      searchInput.blur();
      updateSearchClearVisibility();
      applySearchFilter();
    }
  });
  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchInput.focus();
    updateSearchClearVisibility();
    applySearchFilter();
  });
  updateSearchClearVisibility();

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });

  btnPause.addEventListener('click', () => {
    isPaused = !isPaused;
    btnPause.textContent = isPaused ? 'Resume' : 'Pause';
    btnPause.classList.toggle('paused', isPaused);
    if (!isPaused) flushPauseBuffer();
  });

  btnClear.addEventListener('click', () => {
    logOutput.innerHTML = '';
    pauseBuffer = [];
    logEntries = [];
    if (emptyState) emptyState.classList.remove('hidden');
  });

  document.querySelectorAll('.filters input[name=level]').forEach((input) => {
    input.addEventListener('change', () => {
      const levels = Array.from(document.querySelectorAll('.filters input[name=level]:checked')).map((el) => el.value);
      fetch('/api/levels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ levels }),
      }).catch(() => {});
    });
  });

  setInterval(updateRate, 500);
  connect();
})();

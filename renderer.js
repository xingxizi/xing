(function () {
  'use strict';

  // ============================================
  // ========== 基础设置 ==========
  // ============================================
  const DEFAULT_SETTINGS = {
    focusMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    longBreakInterval: 4,
  };

  function loadSettings() {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem('moyi_settings') || '{}') };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }
  const settings = loadSettings();

  const state = {
    mode: 'focus',
    status: 'idle',
    timeLeft: settings.focusMinutes * 60,
    totalTime: settings.focusMinutes * 60,
    startTime: null,
    pausedTime: 0,
    animId: null,
  };

  const $ = (s) => document.querySelector(s);
  const timeEl = $('#time');
  const labelEl = $('#label');
  const ringEl = $('#ring');
  const btnMain = $('#btn-main');
  const statEl = $('#stat');

  const CIRC = 2 * Math.PI * 68;

  // ============================================
  // ========== 计时器逻辑 ==========
  // ============================================
  function switchMode(mode) {
    if (state.status === 'running') pause();
    state.mode = mode;
    const minutes = settings[mode + 'Minutes'] || 25;
    state.totalTime = minutes * 60;
    state.timeLeft = state.totalTime;
    state.status = 'idle';
    state.pausedTime = 0;
    state.startTime = null;
    updateUI();
  }

  function start() {
    if (state.status === 'idle') {
      state.startTime = Date.now();
      state.pausedTime = 0;
    } else if (state.status === 'paused') {
      state.startTime = Date.now() - state.pausedTime;
    }
    state.status = 'running';
    updateUI();
    tick();
  }

  function pause() {
    state.status = 'paused';
    state.pausedTime = Date.now() - state.startTime;
    cancelAnimationFrame(state.animId);
    updateUI();
  }

  function toggle() {
    state.status === 'running' ? pause() : start();
  }

  function reset() {
    cancelAnimationFrame(state.animId);
    state.status = 'idle';
    state.timeLeft = state.totalTime;
    state.pausedTime = 0;
    state.startTime = null;
    updateUI();
  }

  function skip() {
    if (state.status === 'running' || state.status === 'paused') {
      saveSession(false);
    }
    reset();
  }

  function tick() {
    if (state.status !== 'running') return;
    const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    state.timeLeft = Math.max(0, state.totalTime - elapsed);
    updateUI();
    if (state.timeLeft <= 0) {
      finish();
      return;
    }
    state.animId = requestAnimationFrame(tick);
  }

  function finish() {
    state.status = 'idle';
    cancelAnimationFrame(state.animId);

    const isFocus = state.mode === 'focus';
    if (isFocus) saveSession(true);
    playBeep();

    if (window.moyi) {
      if (isFocus) {
        window.moyi.notify('专注完成 🍅', '莫弈：做得很好，休息一下吧。');
      } else {
        window.moyi.notify('休息结束 ☕', '莫弈：准备好开始新的专注了吗？');
      }
    }

    if (isFocus) {
      const stats = getStats();
      const today = todayKey();
      const pomos = stats[today]?.pomos || 0;
      const next = (pomos % settings.longBreakInterval === 0) ? 'long' : 'short';
      setTimeout(() => switchMode(next), 1200);
    } else {
      setTimeout(() => switchMode('focus'), 1200);
    }
  }

  // ============================================
  // ========== 数据读写 ==========
  // ============================================
  function todayKey() {
    return new Date().toISOString().split('T')[0];
  }
  function getStats() {
    try { return JSON.parse(localStorage.getItem('moyi_stats') || '{}'); }
    catch { return {}; }
  }
  function saveStats(stats) {
    localStorage.setItem('moyi_stats', JSON.stringify(stats));
  }
  function getSessions() {
    try { return JSON.parse(localStorage.getItem('moyi_sessions') || '[]'); }
    catch { return []; }
  }
  function saveSessions(sessions) {
    if (sessions.length > 1000) sessions.length = 1000;
    localStorage.setItem('moyi_sessions', JSON.stringify(sessions));
  }

  function saveSession(completed) {
    const isFocus = state.mode === 'focus';
    const duration = state.startTime
      ? Math.round((Date.now() - state.startTime) / 1000)
      : state.totalTime;

    try {
      const sessions = getSessions();
      sessions.unshift({
        id: Date.now(),
        mode: state.mode,
        startTime: new Date(state.startTime || Date.now()).toISOString(),
        endTime: new Date().toISOString(),
        duration: Math.max(0, duration),
        completed,
      });
      saveSessions(sessions);
    } catch {}

    if (isFocus && completed) {
      const stats = getStats();
      const today = todayKey();
      if (!stats[today]) stats[today] = { pomos: 0, minutes: 0, hours: {} };
      stats[today].pomos = (stats[today].pomos || 0) + 1;
      stats[today].minutes = (stats[today].minutes || 0) + settings.focusMinutes;
      const h = new Date().getHours();
      if (!stats[today].hours) stats[today].hours = {};
      stats[today].hours[h] = (stats[today].hours[h] || 0) + settings.focusMinutes;
      saveStats(stats);
    }
  }

  function updateStatFooter() {
    const stats = getStats();
    const today = todayKey();
    const d = stats[today] || { pomos: 0, minutes: 0 };
    statEl.textContent = `🍅 ${d.pomos || 0} · ${d.minutes || 0} 分`;
  }

  // ============================================
  // ========== 声音 ==========
  // ============================================
  function playBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.15);
      osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.22, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.65);
    } catch {}
  }

  // ============================================
  // ========== UI 更新 ==========
  // ============================================
  function updateUI() {
    const m = Math.floor(state.timeLeft / 60);
    const s = state.timeLeft % 60;
    timeEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

    const progress = state.totalTime > 0
      ? (state.totalTime - state.timeLeft) / state.totalTime
      : 0;
    ringEl.style.strokeDashoffset = CIRC - progress * CIRC;
    ringEl.style.stroke = state.mode === 'focus' ? '#7CB9A8' : '#A8D5BA';

    const labelMap = {
      focus: { idle: '准备开始专注', running: '专注中…', paused: '已暂停' },
      short: { idle: '准备短休', running: '短休中…', paused: '已暂停' },
      long:  { idle: '准备长休', running: '长休中…', paused: '已暂停' },
    };
    labelEl.textContent = labelMap[state.mode][state.status];

    const btnMap = {
      idle: state.mode === 'focus' ? '开始' : '休息',
      running: '暂停',
      paused: '继续',
    };
    btnMain.textContent = btnMap[state.status];

    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.mode === state.mode);
    });

    const avatar = document.getElementById('avatar');
    if (avatar) {
      avatar.classList.toggle('focus-pulse', state.status === 'running' && state.mode === 'focus');
    }

    document.title = `${timeEl.textContent} · ${state.mode === 'focus' ? '专注' : '休息'}`;
  }

  // ============================================
  // ========== 基础事件绑定 ==========
  // ============================================
   // ============================================
  // ========== 圆环拖动与缩放 ============
  // ============================================
  const ringWrapEl = document.querySelector('.ring-wrap');
  const ringSvgEl = document.querySelector('.ring');
  const ringTextEl = document.querySelector('.ring-text');

  // 加载配置
  let ringConfig = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem('moyi_ring_config') || '{}');
      return {
        x: typeof saved.x === 'number' ? saved.x : 12,
        y: typeof saved.y === 'number' ? saved.y : 8,
        size: typeof saved.size === 'number' ? saved.size : 100,
      };
    } catch {
      return { x: 12, y: 8, size: 100 };
    }
  })();

  function applyRingConfig() {
    if (!ringSvgEl || !ringTextEl) return;

    // svg 容器
    ringSvgEl.style.left = ringConfig.x + 'px';
    ringSvgEl.style.top = ringConfig.y + 'px';
    ringSvgEl.style.width = ringConfig.size + 'px';
    ringSvgEl.style.height = ringConfig.size + 'px';

    // 文字容器
    ringTextEl.style.left = ringConfig.x + 'px';
    ringTextEl.style.top = ringConfig.y + 'px';
    ringTextEl.style.width = ringConfig.size + 'px';
    ringTextEl.style.height = ringConfig.size + 'px';

    // 字号跟随大小缩放
    const scale = ringConfig.size / 100;
    timeEl.style.fontSize = (1.15 * scale).toFixed(2) + 'rem';
    labelEl.style.fontSize = (0.5 * scale).toFixed(2) + 'rem';

    localStorage.setItem('moyi_ring_config', JSON.stringify(ringConfig));
  }

  // 判断鼠标是否在圆环上
  function isOnRing(clientX, clientY) {
    if (!ringSvgEl) return false;
    const rect = ringSvgEl.getBoundingClientRect();
    return clientX >= rect.left && clientX <= rect.right &&
           clientY >= rect.top && clientY <= rect.bottom;
  }

  // 拖动
  let ringDragging = false;
  let ringDragStart = { mx: 0, my: 0, rx: 0, ry: 0 };

  if (ringWrapEl) {
    ringWrapEl.addEventListener('mousedown', (e) => {
      if (!isOnRing(e.clientX, e.clientY)) return;
      ringDragging = true;
      ringDragStart.mx = e.clientX;
      ringDragStart.my = e.clientY;
      ringDragStart.rx = ringConfig.x;
      ringDragStart.ry = ringConfig.y;
      e.preventDefault();
    });
  }

  document.addEventListener('mousemove', (e) => {
    if (!ringDragging) return;
    const wrapRect = ringWrapEl.getBoundingClientRect();

    let newX = ringDragStart.rx + (e.clientX - ringDragStart.mx);
    let newY = ringDragStart.ry + (e.clientY - ringDragStart.my);

    // 边界限制（限制在 ring-wrap 内）
    newX = Math.max(0, Math.min(wrapRect.width - ringConfig.size, newX));
    newY = Math.max(0, Math.min(wrapRect.height - ringConfig.size, newY));

    ringConfig.x = newX;
    ringConfig.y = newY;
    applyRingConfig();
  });

  document.addEventListener('mouseup', () => {
    ringDragging = false;
  });

  // 滚轮缩放
  if (ringWrapEl) {
    ringWrapEl.addEventListener('wheel', (e) => {
      if (!isOnRing(e.clientX, e.clientY)) return;
      e.preventDefault();
      const delta = e.deltaY > 0 ? -10 : 10;
      const newSize = Math.max(60, Math.min(240, ringConfig.size + delta));
      if (newSize === ringConfig.size) return;
      ringConfig.size = newSize;
      applyRingConfig();
    }, { passive: false });
  }

  // 初始化应用配置
  applyRingConfig(); 
  btnMain.addEventListener('click', toggle);
  $('#btn-reset').addEventListener('click', reset);
  $('#btn-skip').addEventListener('click', skip);

  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => switchMode(t.dataset.mode));
  });

  const pinBtn = $('#btn-pin');
  pinBtn.classList.add('active');
  pinBtn.addEventListener('click', async () => {
    if (!window.moyi) return;
    const on = await window.moyi.togglePin();
    pinBtn.classList.toggle('active', on);
  });

  $('#btn-hide').addEventListener('click', () => {
    if (window.moyi) window.moyi.hideWindow();
  });
  $('#btn-close').addEventListener('click', () => {
    if (window.moyi) window.moyi.quitApp();
  });

  // ============================================
  // ========== 头像点击跳动 ==========
  // ============================================
  const avatarEl = document.getElementById('avatar');
  if (avatarEl) {
    avatarEl.addEventListener('click', function () {
      this.classList.remove('jump');
      void this.offsetWidth;
      this.classList.add('jump');
      setTimeout(() => this.classList.remove('jump'), 620);
    });
  }

  // ============================================
  // ========== 语录模块 ============
  // ============================================
  let quoteTimer = null;
  let quoteIdx = -1;
  let quoteAutoPlay = true;
  const QUOTE_INTERVAL = 30000;

  function pickQuote() {
    const list = window.MOYI_QUOTES || [];
    if (list.length === 0) return null;
    let idx;
    do { idx = Math.floor(Math.random() * list.length); }
    while (list.length > 1 && idx === quoteIdx);
    quoteIdx = idx;
    return list[idx];
  }

  function showQuote() {
    const q = pickQuote();
    const box = document.getElementById('quote');
    const txt = document.getElementById('quote-text');
    if (!box || !txt) return;

    if (!q) {
      txt.textContent = '暂无语录';
      box.title = '';
      return;
    }
    txt.textContent = q.text;
    box.title = q.text + '\n' + (q.source || '');

    txt.style.opacity = '0';
    requestAnimationFrame(() => {
      txt.style.transition = 'opacity 0.3s';
      txt.style.opacity = '1';
    });

    box.classList.remove('expanded');
  }

  function startQuoteTimer() {
    if (quoteTimer) {
      clearInterval(quoteTimer);
      quoteTimer = null;
    }
    if (!quoteAutoPlay) return;
    quoteTimer = setInterval(showQuote, QUOTE_INTERVAL);
  }

  function updateQuoteToggleUI() {
    const btn = document.getElementById('quote-toggle');
    if (!btn) return;
    if (quoteAutoPlay) {
      btn.textContent = '⏸';
      btn.title = '暂停自动切换';
      btn.classList.remove('paused');
    } else {
      btn.textContent = '▶';
      btn.title = '继续自动切换';
      btn.classList.add('paused');
    }
  }

  function toggleQuoteAutoPlay() {
    quoteAutoPlay = !quoteAutoPlay;
    updateQuoteToggleUI();
    startQuoteTimer();
  }

  function initQuotes() {
    const box = document.getElementById('quote');
    const nextBtn = document.getElementById('quote-next');
    const toggleBtn = document.getElementById('quote-toggle');
    if (!box) return;

    showQuote();
    startQuoteTimer();
    updateQuoteToggleUI();

    box.addEventListener('click', (e) => {
      if (e.target.closest('.quote-btn')) return;
      box.classList.toggle('expanded');
    });

    if (nextBtn) {
      nextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showQuote();
        startQuoteTimer();
      });
    }

    if (toggleBtn) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleQuoteAutoPlay();
      });
    }
  }

  // ============================================
  // ========== 音乐库模块 ============
  // ============================================
  const bgmEl = document.getElementById('bgm');
  const musicBtn = document.getElementById('btn-music');
  const musicNameEl = document.getElementById('music-name');
  const musicPanel = document.getElementById('music-panel');
  const musicListEl = document.getElementById('music-list');
  const musicAddBtn = document.getElementById('music-add');

  let musicLibrary = (() => {
    try { return JSON.parse(localStorage.getItem('moyi_music_library') || '[]'); }
    catch { return []; }
  })();
  let currentMusicIdx = (() => {
    const v = parseInt(localStorage.getItem('moyi_music_idx') || '-1', 10);
    return isNaN(v) ? -1 : v;
  })();
  let currentMusic = musicLibrary[currentMusicIdx] || null;

  try {
    const oldSaved = JSON.parse(localStorage.getItem('moyi_bgm') || 'null');
    if (oldSaved && oldSaved.url && !musicLibrary.find(m => m.url === oldSaved.url)) {
      musicLibrary.push(oldSaved);
      currentMusicIdx = musicLibrary.length - 1;
      currentMusic = oldSaved;
    }
  } catch (e) {}

  function saveMusicLibrary() {
    localStorage.setItem('moyi_music_library', JSON.stringify(musicLibrary));
    localStorage.setItem('moyi_music_idx', String(currentMusicIdx));
  }

  function escapeHtml(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
  }

  function renderMusicList() {
    if (!musicListEl) return;
    if (musicLibrary.length === 0) {
      musicListEl.innerHTML = '<div class="music-empty">音乐库是空的<br>点击右上角 + 添加</div>';
      return;
    }
    musicListEl.innerHTML = musicLibrary.map((m, i) => `
      <div class="music-item ${i === currentMusicIdx ? 'active' : ''}" data-idx="${i}">
        <span class="music-item-name" title="${escapeHtml(m.name)}">${escapeHtml(m.name)}</span>
        <button class="music-item-del" data-del="${i}" title="从音乐库移除">×</button>
      </div>
    `).join('');
    const active = musicListEl.querySelector('.music-item.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  function toggleMusicPanel(force) {
    if (!musicPanel) return;
    const open = force !== undefined ? force : !musicPanel.classList.contains('open');
    musicPanel.classList.toggle('open', open);
    if (open) {
      // 关闭设置面板
      if (settingsPanel) settingsPanel.classList.remove('open');
      renderMusicList();
    }
  }

  async function playMusicAt(idx) {
    if (idx < 0 || idx >= musicLibrary.length) return;
    const item = musicLibrary[idx];

    if (idx === currentMusicIdx && bgmEl.src) {
      if (bgmEl.paused) {
        try { await bgmEl.play(); } catch (e) { console.error(e); }
      } else {
        bgmEl.pause();
      }
      updateMusicUI();
      renderMusicList();
      return;
    }

    currentMusicIdx = idx;
    currentMusic = item;
    try {
      bgmEl.src = item.url;
      bgmEl.volume = 0.5;
      await bgmEl.play();
      saveMusicLibrary();
    } catch (err) {
      console.error('播放失败：', err);
      if (window.moyi && window.moyi.notify) {
        window.moyi.notify('无法播放', `"${item.name}" 文件可能已被移动或删除`);
      }
    }
    updateMusicUI();
    renderMusicList();
  }

  function removeMusicAt(idx) {
    if (idx < 0 || idx >= musicLibrary.length) return;
    const wasCurrent = idx === currentMusicIdx;
    musicLibrary.splice(idx, 1);

    if (wasCurrent) {
      bgmEl.pause();
      bgmEl.removeAttribute('src');
      if (musicLibrary.length === 0) {
        currentMusicIdx = -1;
        currentMusic = null;
      } else {
        currentMusicIdx = Math.min(idx, musicLibrary.length - 1);
        currentMusic = musicLibrary[currentMusicIdx];
      }
    } else if (idx < currentMusicIdx) {
      currentMusicIdx--;
      currentMusic = musicLibrary[currentMusicIdx];
    }

    saveMusicLibrary();
    updateMusicUI();
    renderMusicList();
  }

  async function addMusicFiles() {
    if (!window.moyi) return;
    const files = await window.moyi.pickAudio();
    if (!files || !files.length) return;

    let added = 0;
    files.forEach(f => {
      if (!musicLibrary.find(m => m.url === f.url)) {
        musicLibrary.push(f);
        added++;
      }
    });

    saveMusicLibrary();
    renderMusicList();

    if (added > 0 && currentMusicIdx < 0) {
      playMusicAt(musicLibrary.length - added);
    }
  }

  if (musicBtn) {
    musicBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMusicPanel();
    });
  }

  if (musicPanel) {
    musicPanel.addEventListener('click', (e) => e.stopPropagation());
  }

  if (musicAddBtn) {
    musicAddBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      addMusicFiles();
    });
  }

  if (musicListEl) {
    musicListEl.addEventListener('click', (e) => {
      const delBtn = e.target.closest('[data-del]');
      if (delBtn) {
        e.stopPropagation();
        removeMusicAt(parseInt(delBtn.dataset.del, 10));
        return;
      }
      const item = e.target.closest('.music-item');
      if (item) {
        playMusicAt(parseInt(item.dataset.idx, 10));
      }
    });
  }

  if (musicNameEl) {
    musicNameEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (currentMusicIdx >= 0) playMusicAt(currentMusicIdx);
    });
  }

  function updateMusicUI() {
    if (!musicBtn) return;
    const playing = bgmEl && !bgmEl.paused && bgmEl.src;
    musicBtn.classList.toggle('playing', !!playing);

    if (!currentMusic) {
      musicNameEl.textContent = '';
      musicNameEl.title = '';
      musicBtn.textContent = '🎵';
      musicBtn.title = '音乐库';
      musicNameEl.classList.remove('playing');
    } else {
      musicNameEl.textContent = currentMusic.name;
      musicNameEl.title = currentMusic.name;
      musicBtn.textContent = '🎵';
      musicBtn.title = playing ? '音乐库（播放中）' : '音乐库';
      musicNameEl.classList.toggle('playing', !!playing);
    }
  }

  if (currentMusic && currentMusic.url) {
    bgmEl.src = currentMusic.url;
    bgmEl.volume = 0.5;
    bgmEl.addEventListener('canplay', () => updateMusicUI(), { once: true });
    setTimeout(updateMusicUI, 100);
  }

  bgmEl.addEventListener('play', updateMusicUI);
  bgmEl.addEventListener('pause', updateMusicUI);
  bgmEl.addEventListener('ended', () => {
    if (musicLibrary.length > 1 && currentMusicIdx >= 0) {
      playMusicAt((currentMusicIdx + 1) % musicLibrary.length);
    } else {
      updateMusicUI();
    }
  });

  updateMusicUI();

  // ============================================
  // ========== 设置面板模块 ==========
  // ============================================
  const settingsPanel = document.getElementById('settings-panel');
  const settingsBtn = document.getElementById('btn-settings');
  const settingsCloseBtn = document.getElementById('settings-close');
  const settingsSaveBtn = document.getElementById('settings-save');
  const settingsResetBtn = document.getElementById('settings-reset');

  function loadSettingsToUI() {
    document.getElementById('set-focus').value = settings.focusMinutes;
    document.getElementById('set-short').value = settings.shortBreakMinutes;
    document.getElementById('set-long').value = settings.longBreakMinutes;
    document.getElementById('set-interval').value = settings.longBreakInterval;
  }

  function toggleSettingsPanel(force) {
    if (!settingsPanel) return;
    const open = force !== undefined ? force : !settingsPanel.classList.contains('open');
    settingsPanel.classList.toggle('open', open);
    if (open) {
      // 关闭音乐面板
      if (musicPanel) musicPanel.classList.remove('open');
      loadSettingsToUI();
    }
  }

  function saveSettingsFromUI() {
    const focus = parseInt(document.getElementById('set-focus').value, 10);
    const short = parseInt(document.getElementById('set-short').value, 10);
    const long = parseInt(document.getElementById('set-long').value, 10);
    const interval = parseInt(document.getElementById('set-interval').value, 10);

    settings.focusMinutes = Math.max(1, Math.min(180, focus || 25));
    settings.shortBreakMinutes = Math.max(1, Math.min(60, short || 5));
    settings.longBreakMinutes = Math.max(1, Math.min(120, long || 15));
    settings.longBreakInterval = Math.max(2, Math.min(12, interval || 4));

    localStorage.setItem('moyi_settings', JSON.stringify(settings));

    if (state.status === 'idle') {
      const minutes = settings[state.mode + 'Minutes'] || 25;
      state.totalTime = minutes * 60;
      state.timeLeft = state.totalTime;
      updateUI();
    }

    toggleSettingsPanel(false);
  }

  function resetSettingsToDefault() {
    if (!confirm('恢复默认设置？')) return;
    settings.focusMinutes = 25;
    settings.shortBreakMinutes = 5;
    settings.longBreakMinutes = 15;
    settings.longBreakInterval = 4;
    localStorage.setItem('moyi_settings', JSON.stringify(settings));
    loadSettingsToUI();
    if (state.status === 'idle') {
      state.totalTime = settings[state.mode + 'Minutes'] * 60;
      state.timeLeft = state.totalTime;
      updateUI();
    }
  }

  if (settingsBtn) {
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSettingsPanel();
    });
  }
  if (settingsCloseBtn) {
    settingsCloseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSettingsPanel(false);
    });
  }
  if (settingsSaveBtn) {
    settingsSaveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      saveSettingsFromUI();
    });
  }
  if (settingsResetBtn) {
    settingsResetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      resetSettingsToDefault();
    });
  }
  if (settingsPanel) {
    settingsPanel.addEventListener('click', (e) => e.stopPropagation());
  }

  // ============================================
  // ========== 点击空白处关闭两个面板 ==========
  // ============================================
  document.addEventListener('click', () => {
    if (musicPanel && musicPanel.classList.contains('open')) {
      toggleMusicPanel(false);
    }
    if (settingsPanel && settingsPanel.classList.contains('open')) {
      toggleSettingsPanel(false);
    }
  });

  // ============================================
  // ========== 日志导出模块 ============
  // ============================================
  const exportBtn = document.getElementById('btn-export');

  function collectExportData() {
    const stats = getStats();
    const sessions = getSessions();
    const settingsData = (() => {
      try { return JSON.parse(localStorage.getItem('moyi_settings') || '{}'); }
      catch { return {}; }
    })();

    const dates = Object.keys(stats).filter(k => k.includes('-')).sort();
    let totalPomos = 0, totalMinutes = 0, bestDay = 0;
    dates.forEach(d => {
      totalPomos += stats[d].pomos || 0;
      totalMinutes += stats[d].minutes || 0;
      bestDay = Math.max(bestDay, stats[d].pomos || 0);
    });

    return {
      exportDate: new Date().toISOString(),
      app: 'MoyiTimer',
      version: '1.0.0',
      summary: {
        totalPomos,
        totalMinutes,
        totalHours: (totalMinutes / 60).toFixed(2),
        totalSessions: sessions.length,
        bestDayPomos: bestDay,
        activeDays: dates.length,
        streak: stats.streak || 0,
      },
      settings: settingsData,
      statsByDate: stats,
      sessions,
    };
  }

  function buildJSON() {
    return JSON.stringify(collectExportData(), null, 2);
  }

  function buildCSV() {
    const data = collectExportData();
    const lines = [];

    lines.push('# Study With Moyi · 学习日志导出');
    lines.push(`# 导出时间,${data.exportDate}`);
    lines.push('');
    lines.push('## 汇总');
    lines.push('项目,数值');
    lines.push(`累计番茄,${data.summary.totalPomos}`);
    lines.push(`累计专注分钟,${data.summary.totalMinutes}`);
    lines.push(`累计专注小时,${data.summary.totalHours}`);
    lines.push(`会话总数,${data.summary.totalSessions}`);
    lines.push(`单日最佳番茄,${data.summary.bestDayPomos}`);
    lines.push(`活跃天数,${data.summary.activeDays}`);
    lines.push(`连续天数,${data.summary.streak}`);
    lines.push('');
    lines.push('## 每日统计');
    lines.push('日期,番茄数,专注分钟');
    const dates = Object.keys(data.statsByDate).filter(k => k.includes('-')).sort();
    dates.forEach(d => {
      const s = data.statsByDate[d];
      lines.push(`${d},${s.pomos || 0},${s.minutes || 0}`);
    });
    lines.push('');
    lines.push('## 会话明细');
    lines.push('序号,模式,开始时间,结束时间,时长(秒),时长(格式),是否完成');
    data.sessions.forEach((s, i) => {
      const modeLabel = s.mode === 'focus' ? '专注' : s.mode === 'short' ? '短休' : '长休';
      const dur = s.duration || 0;
      const h = Math.floor(dur / 3600);
      const m = Math.floor((dur % 3600) / 60);
      const sec = dur % 60;
      const durStr = h > 0 ? `${h}h${m}m${sec}s` : m > 0 ? `${m}m${sec}s` : `${sec}s`;
      lines.push([
        i + 1,
        modeLabel,
        s.startTime || '',
        s.endTime || '',
        dur,
        durStr,
        s.completed ? '完成' : '中断',
      ].join(','));
    });

    return '\uFEFF' + lines.join('\n');
  }

  async function doExport(format) {
    if (!window.moyi || !window.moyi.exportData) return;
    const data = format === 'csv' ? buildCSV() : buildJSON();

    const result = await window.moyi.exportData(data, format);
    if (!result) return;

    if (result.ok) {
      if (window.moyi.notify) {
        window.moyi.notify('导出成功 ✅', `已保存到：${result.path}`);
      }
    } else if (!result.canceled) {
      alert('导出失败：' + (result.error || '未知错误'));
    }
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', () => doExport('json'));
    exportBtn.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      doExport('csv');
    });
  }

  // ============================================
  // ========== 日志导入模块 ============
  // ============================================
  const importBtn = document.getElementById('btn-import');

  function isValidImport(obj) {
    if (!obj || typeof obj !== 'object') return false;
    return !!(obj.statsByDate || obj.sessions || obj.settings || obj.moyi_stats);
  }

  function mergeStats(current, incoming) {
    const merged = { ...current };
    Object.keys(incoming || {}).forEach(date => {
      if (date === 'streak') {
        merged.streak = Math.max(merged.streak || 0, incoming.streak || 0);
        return;
      }
      if (!merged[date]) {
        merged[date] = incoming[date];
      } else {
        const a = merged[date];
        const b = incoming[date];
        a.pomos = (a.pomos || 0) + (b.pomos || 0);
        a.minutes = (a.minutes || 0) + (b.minutes || 0);
        if (!a.hours) a.hours = {};
        Object.keys(b.hours || {}).forEach(h => {
          a.hours[h] = (a.hours[h] || 0) + (b.hours[h] || 0);
        });
      }
    });
    return merged;
  }

  function mergeSessions(current, incoming) {
    const map = new Map();
    [...(current || []), ...(incoming || [])].forEach(s => {
      if (s && s.id) map.set(s.id, s);
      else if (s) map.set(JSON.stringify(s), s);
    });
    const merged = Array.from(map.values());
    merged.sort((a, b) => (b.id || 0) - (a.id || 0));
    return merged.slice(0, 1000);
  }

  async function doImport() {
    if (!window.moyi || !window.moyi.importData) return;
    const result = await window.moyi.importData();
    if (!result) return;
    if (result.canceled) return;
    if (!result.ok) {
      alert('读取文件失败：' + (result.error || '未知错误'));
      return;
    }

    let data;
    try {
      data = JSON.parse(result.content);
    } catch (err) {
      alert('解析 JSON 失败：文件可能已损坏或格式不正确。');
      return;
    }

    if (!isValidImport(data)) {
      alert('这不是有效的 MoyiTimer 日志文件。');
      return;
    }

    const mode = confirm(
      '导入方式：\n\n' +
      '【确定】合并 —— 保留现有数据，与导入数据累加\n' +
      '【取消】覆盖 —— 清空现有数据，仅保留导入内容\n\n' +
      `即将导入：${data.summary?.totalPomos || 0} 个番茄 · ${data.summary?.totalSessions || 0} 条记录`
    );
    const isMerge = mode;

    try {
      const currentStats = getStats();
      const currentSessions = getSessions();

      const incomingStats = data.statsByDate || data.moyi_stats || {};
      const incomingSessions = data.sessions || [];

      let finalStats, finalSessions;

      if (isMerge) {
        finalStats = mergeStats(currentStats, incomingStats);
        finalSessions = mergeSessions(currentSessions, incomingSessions);
      } else {
        finalStats = incomingStats;
        finalSessions = incomingSessions.slice(0, 1000);
      }

      saveStats(finalStats);
      saveSessions(finalSessions);

      if (data.settings && typeof data.settings === 'object') {
        localStorage.setItem('moyi_settings', JSON.stringify(data.settings));
      }

      updateStatFooter();

      const modeText = isMerge ? '合并' : '覆盖';
      if (window.moyi.notify) {
        window.moyi.notify(
          `导入成功 ✅（${modeText}）`,
          `${finalSessions.length} 条记录 · ${Object.keys(finalStats).filter(k => k.includes('-')).length} 天数据`
        );
      }
    } catch (err) {
      alert('导入失败：' + err.message);
    }
  }

  if (importBtn) {
    importBtn.addEventListener('click', () => doImport());
  }

  // ============================================
  // ========== 键盘快捷键 ============
  // ============================================
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    else if (e.key === 'r' || e.key === 'R') reset();
    else if (e.key === 's' || e.key === 'S') skip();
    else if (e.key === '1') switchMode('focus');
    else if (e.key === '2') switchMode('short');
    else if (e.key === '3') switchMode('long');
    else if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      toggleMusicPanel();
    }
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'e' || e.key === 'E')) {
      e.preventDefault(); doExport('json');
    }
    else if ((e.ctrlKey || e.metaKey) && (e.key === 'i' || e.key === 'I')) {
      e.preventDefault(); doImport();
    }
  });

  // ============================================
  // ========== 启动 ==========
  // ============================================
  initQuotes();
  switchMode('focus');
  updateStatFooter();
  setInterval(updateStatFooter, 5000);
})();
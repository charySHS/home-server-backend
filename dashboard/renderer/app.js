/* ── State ──────────────────────────────────────────────────────────────────── */

const state = {
    serverUrl: 'http://localhost:3000',
    token: null,
    username: null,
    currentTab: 'overview',
    pollTimer: null,
    isOnline: false,
};

/* ── API client ─────────────────────────────────────────────────────────────── */

async function apiFetch(path, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
    const res = await fetch(state.serverUrl + path, { ...options, headers: { ...headers, ...options.headers } });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw Object.assign(new Error(body.error || `HTTP ${res.status}`), { status: res.status });
    }
    return res.json();
}

const api = {
    health:         ()         => apiFetch('/health'),
    stats:          ()         => apiFetch('/api/v1/admin/stats'),
    devices:        ()         => apiFetch('/api/v1/admin/devices'),
    files:          ()         => apiFetch('/api/v1/files'),
    login:          (u, p)     => apiFetch('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: u, password: p, isDashboard: true }),
    }),
    refresh:        ()         => apiFetch('/api/v1/auth/refresh', { method: 'POST' }),
    setApproval:    (id, val)  => apiFetch(`/api/v1/admin/devices/${id}`, { method: 'PATCH', body: JSON.stringify({ approved: val }) }),
    settings:       ()         => apiFetch('/api/v1/admin/settings'),
    updateSettings: (body)     => apiFetch('/api/v1/admin/settings', { method: 'PATCH', body: JSON.stringify(body) }),
    updateAccount:  (body)     => apiFetch('/api/v1/admin/account',  { method: 'PATCH', body: JSON.stringify(body) }),
    power:          (action)   => apiFetch('/api/v1/admin/power',    { method: 'POST',  body: JSON.stringify({ action }) }),
};

/* ── Helpers ────────────────────────────────────────────────────────────────── */

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return (bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1) + ' ' + sizes[i];
}

function formatUptime(seconds) {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

function timeAgo(ms) {
    const diff = Date.now() - ms;
    const sec = Math.floor(diff / 1000);
    if (sec < 60)   return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60)   return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24)    return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    return `${day}d ago`;
}

function formatDate(ms) {
    return new Date(ms).toLocaleString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function el(id) { return document.getElementById(id); }

function badge(label, cls) {
    return `<span class="badge badge-${cls}">${label}</span>`;
}

function setInnerHTML(id, html) {
    const e = el(id);
    if (e) e.innerHTML = html;
}

function setText(id, text) {
    const e = el(id);
    if (e) e.textContent = text;
}

/* ── Config persistence (via Electron IPC) ──────────────────────────────────── */

async function loadConfig() {
    if (window.dashboard) {
        return window.dashboard.getConfig();
    }
    // Fallback for browser dev mode
    try { return JSON.parse(localStorage.getItem('hs-config') || '{}'); } catch { return {}; }
}

async function saveConfig(cfg) {
    if (window.dashboard) {
        return window.dashboard.saveConfig(cfg);
    }
    localStorage.setItem('hs-config', JSON.stringify(cfg));
}

/* ── Login ──────────────────────────────────────────────────────────────────── */

function showLoginError(msg) {
    const e = el('login-error');
    e.textContent = msg;
    e.classList.remove('hidden');
}

function hideLoginError() {
    el('login-error').classList.add('hidden');
}

async function doLogin() {
    const url  = el('login-url').value.trim().replace(/\/$/, '');
    const user = el('login-username').value.trim();
    const pass = el('login-password').value;

    if (!url || !user || !pass) {
        showLoginError('Please fill in all fields.');
        return;
    }

    state.serverUrl = url;
    hideLoginError();

    const btn = el('login-btn');
    btn.disabled = true;
    btn.textContent = 'Signing in…';

    try {
        const data = await api.login(user, pass);
        state.token    = data.token;
        state.username = user;

        await saveConfig({ serverUrl: state.serverUrl, token: state.token, username: state.username });

        showDashboard();
    } catch (err) {
        const msg = err.status === 401 ? 'Invalid username or password.'
                  : err.status === 403 ? 'Device not approved.'
                  : `Could not connect to server. (${err.message})`;
        showLoginError(msg);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Sign In';
    }
}

/* ── Screens ────────────────────────────────────────────────────────────────── */

function showLoginScreen() {
    el('login-screen').classList.remove('hidden');
    el('dashboard').classList.add('hidden');
    stopPolling();
}

function showDashboard() {
    el('login-screen').classList.add('hidden');
    el('dashboard').classList.remove('hidden');

    el('server-url-display').textContent = state.serverUrl;
    switchTab(state.currentTab);
    startPolling();
    refreshAll();
}

/* ── Tab switching ──────────────────────────────────────────────────────────── */

const TAB_TITLES = {
    overview: 'Overview',
    devices:  'Devices',
    files:    'Files',
    system:   'System',
    settings: 'Settings',
};

function switchTab(name) {
    state.currentTab = name;

    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.tab === name);
    });

    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `tab-${name}`);
    });

    setText('tab-title', TAB_TITLES[name] || name);

    if (name === 'settings') loadSettings();
}

/* ── Status indicator ───────────────────────────────────────────────────────── */

function setStatus(online) {
    state.isOnline = online;
    const dot  = el('status-dot');
    const text = el('status-text');
    dot.className  = `status-dot ${online ? 'online' : 'offline'}`;
    text.textContent = online ? 'Online' : 'Offline';

    const statVal = el('ov-status');
    if (statVal) {
        statVal.textContent  = online ? 'Online' : 'Offline';
        statVal.className    = `stat-value ${online ? 'online' : 'offline'}`;
    }
}

/* ── Render helpers ─────────────────────────────────────────────────────────── */

function renderDeviceRows(devices, tbodyId, maxRows) {
    const tbody = el(tbodyId);
    if (!tbody) return;

    const rows = maxRows ? devices.slice(0, maxRows) : devices;
    const isOverview = tbodyId === 'ov-devices-tbody';

    if (rows.length === 0) {
        const cols = isOverview ? 4 : 6;
        tbody.innerHTML = `<tr class="empty-row"><td colspan="${cols}">No devices registered</td></tr>`;
        return;
    }

    const now = Date.now();
    const recentMs = 15 * 60 * 1000;

    tbody.innerHTML = rows.map(d => {
        const active   = (now - d.lastSeenAt) < recentMs;
        const activity = active ? badge('Active', 'success') : badge('Idle', 'muted');
        const approval = d.approved ? badge('Approved', 'success') : badge('Blocked', 'danger');
        const toggleLabel = d.approved ? 'Block' : 'Approve';
        const toggleCls   = d.approved ? 'btn-block' : 'btn-approve';

        return `
          <tr>
            <td class="wide" style="max-width:none">${escHtml(d.deviceName)}</td>
            <td>${escHtml(d.username)}</td>
            ${!isOverview ? `<td>${formatDate(d.createdAt)}</td>` : ''}
            <td title="${formatDate(d.lastSeenAt)}">${timeAgo(d.lastSeenAt)}</td>
            <td>${isOverview ? activity : approval}</td>
            ${!isOverview ? `<td><button class="btn-row ${toggleCls}" data-id="${escHtml(d.id)}" data-approved="${d.approved}">${toggleLabel}</button></td>` : ''}
          </tr>`;
    }).join('');

    if (!isOverview) {
        tbody.querySelectorAll('.btn-row').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id       = btn.dataset.id;
                const newValue = btn.dataset.approved !== 'true';
                btn.disabled   = true;
                try {
                    await api.setApproval(id, newValue);
                    await refreshAll();
                } catch (err) {
                    alert(`Failed: ${err.message}`);
                    btn.disabled = false;
                }
            });
        });
    }
}

function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ── SVG Charts ─────────────────────────────────────────────────────────────── */

const CHART_W = 600;  // viewBox width (unitless, scales to container)
const CHART_H = 60;

function chartPath(points, maxVal, color, filled) {
    if (!points || points.length < 2) return '';
    const n  = points.length;
    const xs = points.map((_, i) => (i / (n - 1)) * CHART_W);
    const ys = points.map(v => CHART_H - Math.max(0, Math.min(1, v / maxVal)) * (CHART_H - 4) - 2);

    // Smooth line via cubic beziers
    let d = `M ${xs[0]},${ys[0]}`;
    for (let i = 1; i < n; i++) {
        const cpx = (xs[i - 1] + xs[i]) / 2;
        d += ` C ${cpx},${ys[i-1]} ${cpx},${ys[i]} ${xs[i]},${ys[i]}`;
    }

    let out = `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>`;

    if (filled) {
        const area = `${d} L ${xs[n-1]},${CHART_H} L ${xs[0]},${CHART_H} Z`;
        out = `<path d="${area}" fill="${color}" fill-opacity="0.12"/>` + out;
    }
    return out;
}

function setChart(svgId, svgContent) {
    const svg = el(svgId);
    if (!svg) return;
    svg.setAttribute('viewBox', `0 0 ${CHART_W} ${CHART_H}`);
    svg.innerHTML = svgContent;
}

function renderCharts(history) {
    if (!history || history.length === 0) return;

    const cpuData  = history.map(h => h.cpuPct);
    const memData  = history.map(h => h.memPct);
    // Convert bytes per 2s interval → KB/s
    const upData   = history.map(h => h.uploadBytes   / 2 / 1024);
    const downData = history.map(h => h.downloadBytes / 2 / 1024);
    const maxNet   = Math.max(1, ...upData, ...downData);

    const latest   = history[history.length - 1];
    const upKBps   = (latest.uploadBytes   / 2 / 1024).toFixed(1);
    const downKBps = (latest.downloadBytes / 2 / 1024).toFixed(1);

    setText('chart-cpu-val', `${latest.cpuPct}%`);
    setText('chart-mem-val', `${latest.memPct}%`);
    setText('chart-net-val', `↑${upKBps} ↓${downKBps} KB/s`);

    setChart('chart-cpu', chartPath(cpuData,  100,    'var(--accent)',  true));
    setChart('chart-mem', chartPath(memData,  100,    'var(--success)', true));
    setChart('chart-net',
        chartPath(upData,   maxNet, 'var(--warning)', false) +
        chartPath(downData, maxNet, 'var(--accent)',  false)
    );
}

/* ── Power controls ──────────────────────────────────────────────────────────── */

async function doPowerAction(action) {
    const restartBtn  = el('restart-btn');
    const shutdownBtn = el('shutdown-btn');
    const feedback    = el('power-feedback');

    const label = action === 'restart' ? 'Restart' : 'Shut Down';
    if (!confirm(`${label} the server?`)) return;

    restartBtn.disabled  = true;
    shutdownBtn.disabled = true;
    feedback.className   = 'power-feedback hidden';

    try {
        await api.power(action);
        feedback.textContent = action === 'restart'
            ? 'Server is restarting… reconnecting shortly.'
            : 'Server has been shut down.';
        feedback.className = 'power-feedback ok';

        if (action === 'restart') {
            // Attempt to reconnect after a brief pause
            setTimeout(async () => {
                let attempts = 0;
                const try_ = async () => {
                    try {
                        await api.health();
                        feedback.textContent = 'Server is back online.';
                        restartBtn.disabled  = false;
                        shutdownBtn.disabled = false;
                        await refreshAll();
                    } catch {
                        if (++attempts < 15) setTimeout(try_, 2000);
                        else {
                            feedback.textContent = 'Could not reconnect. The server may still be starting.';
                            feedback.className   = 'power-feedback err';
                            restartBtn.disabled  = false;
                            shutdownBtn.disabled = false;
                        }
                    }
                };
                await try_();
            }, 2500);
        }
    } catch (err) {
        feedback.textContent = `Failed: ${err.message}`;
        feedback.className   = 'power-feedback err';
        restartBtn.disabled  = false;
        shutdownBtn.disabled = false;
    }
}

/* ── Data refresh ───────────────────────────────────────────────────────────── */

async function refreshAll() {
    try {
        await api.health();
        setStatus(true);
    } catch {
        setStatus(false);
        setText('last-updated', 'Server unreachable');
        return;
    }

    const tab = state.currentTab;

    try {
        const [statsData, devicesData, filesData] = await Promise.allSettled([
            api.stats(),
            api.devices(),
            api.files(),
        ]);

        if (statsData.status === 'fulfilled') renderStats(statsData.value);
        if (devicesData.status === 'fulfilled') renderDevices(devicesData.value.devices);
        if (filesData.status === 'fulfilled') renderFiles(filesData.value.files);

        // If token expired mid-session, trigger re-login
    } catch (err) {
        if (err.status === 401 || err.status === 403) {
            doLogout();
            return;
        }
    }

    setText('last-updated', 'Updated ' + new Date().toLocaleTimeString());
}

function renderStats(s) {
    // Overview cards
    setText('ov-uptime',   formatUptime(s.server.startedAt ? (Date.now() - s.server.startedAt) / 1000 : s.system.uptime));
    setText('ov-files',    s.storage.totalFiles.toString());
    setText('ov-storage',  formatBytes(s.storage.totalSize));
    setText('ov-uploads',  s.storage.activeUploads.toString());
    setText('ov-devices',  `${s.server.devices.activeLastWeek} / ${s.server.devices.total}`);

    // Charts
    if (s.history) renderCharts(s.history);

    // System tab
    const rows = [
        ['Version',      s.server.version],
        ['Node.js',      s.system.nodeVersion],
        ['Platform',     `${s.system.platform} (${s.system.arch})`],
        ['Hostname',     s.system.hostname],
        ['CPU',          s.system.cpuModel],
        ['CPU Cores',    s.system.cpuCount],
        ['Started At',   formatDate(s.server.startedAt)],
        ['Uptime',       formatUptime(s.system.uptime)],
        ['Total Devices', s.server.devices.total],
        ['Active (7d)',  s.server.devices.activeLastWeek],
    ];

    setInnerHTML('system-info-rows', rows.map(([k, v]) =>
        `<div class="info-row">
           <span class="info-key">${k}</span>
           <span class="info-val">${escHtml(String(v))}</span>
         </div>`
    ).join(''));

    // OS memory bar
    const osUsed = s.system.osMemoryTotal - s.system.osMemoryFree;
    const osPct  = Math.round((osUsed / s.system.osMemoryTotal) * 100);
    const osBar  = el('os-mem-bar');
    if (osBar) {
        osBar.style.width = osPct + '%';
        osBar.className   = `mem-bar-fill${osPct > 90 ? ' crit' : osPct > 70 ? ' warn' : ''}`;
    }
    setText('os-mem-used',  `${formatBytes(osUsed)} used (${osPct}%)`);
    setText('os-mem-total', formatBytes(s.system.osMemoryTotal));

    // Process heap bar
    const procPct = Math.round((s.system.processMemoryUsed / s.system.processMemoryTotal) * 100);
    const procBar = el('proc-mem-bar');
    if (procBar) {
        procBar.style.width = procPct + '%';
        procBar.className   = `mem-bar-fill${procPct > 90 ? ' crit' : procPct > 70 ? ' warn' : ''}`;
    }
    setText('proc-mem-used',  `${formatBytes(s.system.processMemoryUsed)} used (${procPct}%)`);
    setText('proc-mem-total', formatBytes(s.system.processMemoryTotal));
}

function renderDevices(devices) {
    const count = devices.length;
    setText('ov-device-count', count);
    setText('dev-count', count);

    renderDeviceRows(devices, 'ov-devices-tbody', 5);
    renderDeviceRows(devices, 'devices-tbody', null);
}

function renderFiles(files) {
    setText('files-count', files.length);

    const tbody = el('files-tbody');
    if (!tbody) return;

    if (files.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="3">No files stored</td></tr>';
        return;
    }

    const sorted = [...files].sort((a, b) => b.modifiedAt - a.modifiedAt);

    tbody.innerHTML = sorted.map(f =>
        `<tr>
           <td class="wide" style="max-width:none; font-family: Consolas, monospace; font-size:12.5px">${escHtml(f.name)}</td>
           <td>${formatBytes(f.size)}</td>
           <td title="${formatDate(f.modifiedAt)}">${timeAgo(f.modifiedAt)}</td>
         </tr>`
    ).join('');
}

/* ── Settings ───────────────────────────────────────────────────────────────── */

function showFeedback(feedbackEl, msg, ok) {
    feedbackEl.textContent = msg;
    feedbackEl.className = `save-feedback ${ok ? 'ok' : 'err'}`;
    feedbackEl.classList.remove('hidden');
    setTimeout(() => feedbackEl.classList.add('hidden'), 4000);
}

async function loadSettings() {
    try {
        const s = await api.settings();

        el('setting-active-path').value   = s.storageDir           || '';
        el('setting-storage-path').value  = s.storageDirConfigured || s.storageDir || '';
        el('setting-jwt-exp').value       = s.jwtExpiration        || '7d';
        el('setting-debug-logs').checked  = !!s.debugLogs;

        // Show restart banner only when configured path differs from active path
        el('storage-restart-banner').classList.toggle(
            'hidden',
            s.storageDirConfigured === s.storageDir
        );

        // Pre-fill current username from state
        if (state.username) el('setting-username').value = state.username;

    } catch (err) {
        console.error('loadSettings failed:', err);
    }
}

async function saveStorage() {
    const btn      = el('save-storage-btn');
    const feedback = el('storage-feedback');
    const newPath  = el('setting-storage-path').value.trim();

    if (!newPath) { showFeedback(feedback, 'Path cannot be empty.', false); return; }

    btn.disabled    = true;
    btn.textContent = 'Saving…';
    try {
        const result = await api.updateSettings({ storageDir: newPath });
        showFeedback(feedback, 'Saved.', true);
        if (result.restartRequired) {
            el('storage-restart-banner').classList.remove('hidden');
        }
    } catch (err) {
        showFeedback(feedback, err.message, false);
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Save Storage Path';
    }
}

async function saveAccount() {
    const btn         = el('save-account-btn');
    const feedback    = el('account-feedback');
    const username    = el('setting-username').value.trim();
    const newPassword = el('setting-new-password').value;
    const confirmPass = el('setting-confirm-password').value;
    const currentPass = el('setting-current-password').value;

    if (!currentPass) { showFeedback(feedback, 'Current password is required.', false); return; }
    if (!username)    { showFeedback(feedback, 'Username cannot be empty.', false); return; }
    if (newPassword && newPassword !== confirmPass) {
        showFeedback(feedback, 'New passwords do not match.', false);
        return;
    }
    if (newPassword && newPassword.length < 6) {
        showFeedback(feedback, 'Password must be at least 6 characters.', false);
        return;
    }

    btn.disabled    = true;
    btn.textContent = 'Saving…';

    const body = { currentPassword: currentPass, username };
    if (newPassword) body.newPassword = newPassword;

    try {
        await api.updateAccount(body);
        showFeedback(feedback, 'Account updated successfully.', true);
        el('setting-new-password').value     = '';
        el('setting-confirm-password').value = '';
        el('setting-current-password').value = '';
    } catch (err) {
        const msg = err.status === 401 ? 'Current password is incorrect.'
                  : err.status === 409 ? 'That username is already taken.'
                  : err.message;
        showFeedback(feedback, msg, false);
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Update Account';
    }
}

async function saveOptions() {
    const btn           = el('save-options-btn');
    const feedback      = el('options-feedback');
    const jwtExpiration = el('setting-jwt-exp').value.trim();
    const debugLogs     = el('setting-debug-logs').checked;

    if (!jwtExpiration) { showFeedback(feedback, 'Expiration cannot be empty.', false); return; }

    btn.disabled    = true;
    btn.textContent = 'Saving…';
    try {
        const result = await api.updateSettings({ jwtExpiration, debugLogs });
        showFeedback(feedback, 'Saved.', true);
        if (result.restartRequired) {
            el('options-restart-banner').classList.remove('hidden');
        }
    } catch (err) {
        showFeedback(feedback, err.message, false);
    } finally {
        btn.disabled    = false;
        btn.textContent = 'Save Options';
    }
}

/* ── Polling ────────────────────────────────────────────────────────────────── */

function startPolling() {
    stopPolling();
    state.pollTimer = setInterval(refreshAll, 8000);
}

function stopPolling() {
    if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
}

/* ── Logout ─────────────────────────────────────────────────────────────────── */

async function doLogout() {
    state.token    = null;
    state.username = null;
    await saveConfig({ serverUrl: state.serverUrl, token: null, username: null });
    showLoginScreen();
}

/* ── Boot ───────────────────────────────────────────────────────────────────── */

async function boot() {
    const cfg = await loadConfig();

    if (cfg.serverUrl) {
        state.serverUrl = cfg.serverUrl;
        el('login-url').value = cfg.serverUrl;
    }

    // Try restoring saved session
    if (cfg.token) {
        state.token    = cfg.token;
        state.username = cfg.username || null;

        try {
            // Validate token is still good
            await api.health();
            await api.stats(); // will 401 if token dead
            showDashboard();
            return;
        } catch {
            state.token    = null;
            state.username = null;
        }
    }

    showLoginScreen();
}

/* ── Event listeners ────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
    // Login
    el('login-btn').addEventListener('click', doLogin);
    el('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

    // Nav tabs
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', () => switchTab(item.dataset.tab));
    });

    // Logout
    el('logout-btn').addEventListener('click', doLogout);

    // Settings
    el('save-storage-btn').addEventListener('click', saveStorage);
    el('save-account-btn').addEventListener('click', saveAccount);
    el('save-options-btn').addEventListener('click', saveOptions);

    // Power
    el('restart-btn').addEventListener('click',  () => doPowerAction('restart'));
    el('shutdown-btn').addEventListener('click', () => doPowerAction('shutdown'));

    boot();
});

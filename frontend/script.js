/* ============================================================
   Hermes WSL Panel - 前端交互逻辑
   ============================================================ */

let currentProfile = null;
let settings = { theme: 'light', font_size: 14 };
let currentSort = 'ended_at';
let searchTimer = null;
let searchConfirmed = false;

// DOM 引用
const profileTabs = document.getElementById('profileTabs');
const sessionList = document.getElementById('sessionList');
const sessionLoading = document.getElementById('sessionLoading');
const skillsBody = document.getElementById('skillsBody');
const newSessionBtn = document.getElementById('newSessionBtn');
const searchInput = document.getElementById('searchInput');
const searchConfirmBtn = document.getElementById('searchConfirmBtn');
const searchRefreshBtn = document.getElementById('searchRefreshBtn');
const wslBtn = document.getElementById('wslBtn');
const refreshStatusBtn = document.getElementById('refreshStatusBtn');
const fontDisplay = document.getElementById('fontDisplay');
const leftPanel = document.getElementById('leftPanel');
const rightPanel = document.getElementById('rightPanel');
const dragHandle = document.getElementById('dragHandle');
const splashScreen = document.getElementById('splashScreen');

// ============================================================
// 设置管理
// ============================================================
async function loadSettings() {
    try {
        const resp = await fetch('/api/settings');
        settings = await resp.json();
    } catch(e) { settings = { theme: 'light', font_size: 14 }; }
    applySettings();
}

async function saveSetting(key, value) {
    settings[key] = value;
    try { await fetch('/api/settings', { method: 'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({[key]: value}) }); }
    catch(e) {}
    applySettings();
}

function applySettings() {
    document.documentElement.setAttribute('data-theme', settings.theme || 'light');
    document.querySelectorAll('.theme-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.theme === settings.theme);
    });
    const fs = settings.font_size || 14;
    const content = document.querySelector('.main-content');
    if (content) content.style.zoom = fs / 14;
    fontDisplay.textContent = fs;
}

// ============================================================
// API
// ============================================================
async function apiGet(url) {
    try { const r = await fetch(url); if(!r.ok) throw Error(); return await r.json(); }
    catch(e) { return { error: true }; }
}
async function apiPost(url, data) {
    try {
        const r = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(data||{}) });
        if(!r.ok) throw Error(); return await r.json();
    } catch(e) { return { error: true }; }
}

// ============================================================
// 下拉菜单
// ============================================================
document.querySelectorAll('.dropdown').forEach(dd => {
    const trigger = dd.querySelector('.dropdown-trigger');
    const menu = dd.querySelector('.dropdown-menu');
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = menu.classList.contains('open');
        closeAllDropdowns();
        if (!open) menu.classList.add('open');
    });
});

document.addEventListener('click', closeAllDropdowns);
function closeAllDropdowns() {
    document.querySelectorAll('.dropdown-menu.open').forEach(m => m.classList.remove('open'));
}

// ============================================================
// 菜单按钮路由
// ============================================================
document.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllDropdowns();
        const action = item.dataset.action;
        switch (action) {
            case 'new-session': handleNewSession(); break;
            case 'refresh': handleRefresh(); break;
            case 'mcp': openMcpModal(); break;
            case 'skills-browse': openSkillsBrowse(); break;
            case 'log-viewer': openLogViewer(); break;
            case 'diagnose': openDiagnose(); break;
            case 'theme-light': saveSetting('theme', 'light'); break;
            case 'theme-dark': saveSetting('theme', 'dark'); break;
            case 'theme-theme': saveSetting('theme', 'theme'); break;
            case 'font-up': adjustFont(1); break;
            case 'font-down': adjustFont(-1); break;
            case 'shortcuts': openModal('shortcutsModal'); break;
            case 'usage': openModal('usageModal'); break;
            case 'check-update': openUpdateCheck(); break;
            case 'about': openModal('aboutModal'); break;
        }
    });
});

function adjustFont(delta) {
    let fs = settings.font_size || 14;
    fs = Math.max(12, Math.min(24, fs + delta));
    saveSetting('font_size', fs);
}

function openModal(id) {
    document.getElementById(id).classList.remove('hidden');
}

// ============================================================
// 首次设置向导
// ============================================================
async function checkHermesSetup() {
    // 检查是否已配置 Hermes 路径
    if (!settings.hermes_cli) {
        // 自动尝试检测一次
        await runSetupDetection(true);
    }
    // 即使检测失败也继续（用户可手动重试）
}

async function runSetupDetection(autoMode) {
    const setupModal = document.getElementById('setupModal');
    const detectBtn = document.getElementById('setupDetectBtn');
    const retryBtn = document.getElementById('setupRetryBtn');
    const reDetectBtn = document.getElementById('setupRedetectBtn');
    const confirmBtn = document.getElementById('setupConfirmBtn');
    const startArea = document.getElementById('setupStartArea');
    const detectingArea = document.getElementById('setupDetectingArea');
    const resultArea = document.getElementById('setupResultArea');
    const errorArea = document.getElementById('setupErrorArea');
    const statusText = document.getElementById('setupStatusText');

    if (!autoMode) {
        // 手动模式：显示模态框再检测
        setupModal.classList.remove('hidden');
    }

    startArea.style.display = 'none';
    detectingArea.style.display = 'block';
    resultArea.style.display = 'none';
    errorArea.style.display = 'none';
    statusText.textContent = '正在检测...';

    const data = await apiPost('/api/setup/detect');

    detectingArea.style.display = 'none';

    if (data.error) {
        errorArea.style.display = 'block';
        document.getElementById('setupErrorText').textContent = data.error;
        statusText.textContent = '检测失败';
        return;
    }

    // 显示结果
    document.getElementById('setupCliPath').textContent = data.hermes_cli;
    document.getElementById('setupHomePath').textContent = data.hermes_home;
    document.getElementById('setupVersion').textContent = data.version || '未知';
    resultArea.style.display = 'block';
    statusText.textContent = '检测完成，请确认以下信息：';

    // 确认按钮
    confirmBtn.onclick = async () => {
        await saveSetting('hermes_cli', data.hermes_cli);
        await saveSetting('hermes_home', data.hermes_home);
        statusText.textContent = '配置已保存！';
        setupModal.classList.add('hidden');
        // 重新加载主界面
        await loadProfiles();
        const ft = document.querySelector('.profile-tab');
        if (ft) await switchProfile(ft.dataset.profile);
    };

    // 重新检测按钮
    reDetectBtn.onclick = () => runSetupDetection(false);
    retryBtn.onclick = () => runSetupDetection(false);

    if (!autoMode) {
        // 手动模式：显示模态框
        setupModal.classList.remove('hidden');
    } else if (!data.error) {
        // 自动模式检测成功：自动保存并关闭
        await saveSetting('hermes_cli', data.hermes_cli);
        await saveSetting('hermes_home', data.hermes_home);
        statusText.textContent = '自动检测完成！';
        setupModal.classList.add('hidden');
    } else {
        // 自动检测失败：显示设置向导让用户手动操作
        setupModal.classList.remove('hidden');
        startArea.style.display = 'block';
        detectBtn.onclick = () => runSetupDetection(false);
    }
}

// 检测按钮绑定
document.addEventListener('DOMContentLoaded', () => {
    const detectBtn = document.getElementById('setupDetectBtn');
    const retryBtn = document.getElementById('setupRetryBtn');
    if (detectBtn) detectBtn.onclick = () => runSetupDetection(false);
    if (retryBtn) retryBtn.onclick = () => runSetupDetection(false);
});

// ============================================================
// Profile 条
// ============================================================
async function loadProfiles() {
    const data = await apiGet('/api/profiles');
    profileTabs.innerHTML = '';
    const profiles = data.profiles;
    profiles.forEach(p => {
        const tab = document.createElement('div');
        tab.className = 'profile-tab';
        tab.dataset.profile = p.name;
        tab.innerHTML = `${p.name}<span class=\"tab-model\">${p.model}</span>`;
        tab.addEventListener('click', () => switchProfile(p.name));
        profileTabs.appendChild(tab);
    });
}

async function switchProfile(name) {
    currentProfile = name;
    document.querySelectorAll('.profile-tab').forEach(t => t.classList.toggle('active', t.dataset.profile === name));
    saveSetting('last_profile', name);
    await Promise.all([loadSessions(name), loadSkills(name)]);
}

// ============================================================
// 会话列表
// ============================================================
async function loadSessions(name) {
    sessionLoading.style.display = 'flex';
    sessionList.innerHTML = '';
    const search = searchConfirmed ? (searchInput ? searchInput.value.trim() : '') : '';
    const data = await apiGet(`/api/profile/${name}/sessions?sort=${currentSort}&search=${encodeURIComponent(search)}`);
    sessionLoading.style.display = 'none';
    if(data.error || !data.sessions) { sessionList.innerHTML = '<div class="session-loading">加载失败</div>'; return; }
    const sessions = data.sessions;
    if(!sessions.length) { sessionList.innerHTML = '<div class="session-loading">暂无匹配的会话</div>'; return; }
    sessions.forEach(s => sessionList.appendChild(createSessionItem(s, name)));
}

function createSessionItem(session, profileName) {
    const div = document.createElement('div');
    div.className = 'session-item';
    div.dataset.sessionId = session.id;
    const cardNum = Math.floor(Math.random() * 4) + 1;
    div.style.backgroundImage = `url(photos/卡片${cardNum}.jpg)`;

    const header = document.createElement('div');
    header.className = 'session-header';
    header.innerHTML = `
        <div class="session-info">
            <div class="session-title">${esc(session.title||'(无标题)')}</div>
            <div class="session-time">${esc(session.last_active||'')}</div>
        </div>
        <div class="session-actions">
            <button class="session-btn copyid-btn">复制ID</button>
            <button class="session-btn expand-btn">展开</button>
            <button class="session-btn delete-btn">删除</button>
            <button class="session-btn resume-btn">运行</button>
        </div>`;

    const body = document.createElement('div');
    body.className = 'session-body';
    const mc = document.createElement('div');
    mc.className = 'session-messages';
    body.appendChild(mc);
    div.appendChild(header); div.appendChild(body);

    let expanded = false;
    header.querySelector('.expand-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        expanded = !expanded;
        header.querySelector('.expand-btn').textContent = expanded ? '收起' : '展开';
        body.classList.toggle('expanded', expanded);
        if(expanded && !mc.children.length) {
            mc.innerHTML = '<div style="text-align:center;padding:10px;color:var(--text-secondary);font-size:11px;">加载中...</div>';
            await loadSessionMessages(profileName, session.id, mc);
        }
    });

    header.querySelector('.copyid-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const btn = header.querySelector('.copyid-btn');
        navigator.clipboard.writeText(session.id).then(() => {
            btn.textContent = '已复制';
            btn.classList.add('copied');
            setTimeout(() => { btn.textContent = '复制ID'; btn.classList.remove('copied'); }, 1500);
        });
    });

    header.querySelector('.resume-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        const btn = header.querySelector('.resume-btn');
        btn.textContent = '...'; btn.disabled = true;
        await apiPost(`/api/profile/${profileName}/resume/${session.id}`);
        setTimeout(() => { btn.textContent = '运行'; btn.disabled = false; }, 2000);
    });

    header.querySelector('.delete-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!confirm('确定删除此会话？')) return;
        const btn = header.querySelector('.delete-btn');
        btn.textContent = '...'; btn.disabled = true;
        await apiPost(`/api/profile/${profileName}/sessions/${session.id}/delete`);
        div.remove();
    });

    return div;
}

async function loadSessionMessages(profileName, sessionId, container) {
    const data = await apiGet(`/api/profile/${profileName}/sessions/${sessionId}`);
    if(data.error || !data.messages) { container.innerHTML = '<div style="text-align:center;padding:10px;color:var(--text-secondary);font-size:11px;">加载失败</div>'; return; }
    const msgs = data.messages;
    if(!msgs.length) { container.innerHTML = '<div style="text-align:center;padding:10px;color:var(--text-secondary);font-size:11px;">暂无消息</div>'; return; }
    container.innerHTML = '';
    msgs.forEach(m => {
        const d = document.createElement('div');
        d.className = `msg-item msg-${m.role}`;
        const roleMap = {user:'你', assistant:'Hermes', tool:'工具', system:'系统'};
        d.innerHTML = `<div class="msg-role">${roleMap[m.role]||m.role}</div><div class="msg-content">${esc(m.content)}</div>`;
        container.appendChild(d);
    });
}

// ============================================================
// Skills
// ============================================================
let skillsView = 'category';

async function loadSkills(name) {
    const data = await apiGet(`/api/profile/${name}/skills`);
    if(data.error || !data.categories) { skillsBody.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-secondary);font-size:11px;">加载失败</div>'; return; }
    if(skillsView === 'category') renderSkillsByCategory(data);
    else renderSkillsByAlpha(data);
}

function renderSkillsByCategory(data) {
    skillsBody.innerHTML = '';
    const cats = data.categories || {};
    Object.keys(cats).sort().forEach(cat => {
        const items = cats[cat];
        const group = document.createElement('div');
        group.className = 'skill-category';
        const hdr = document.createElement('div');
        hdr.className = 'category-header';
        hdr.innerHTML = `<span class="category-arrow">&#9654;</span><span>${esc(cat)}</span><span class="category-count">${items.length}</span>`;
        const ic = document.createElement('div');
        ic.className = 'category-items';
        items.forEach(sn => {
            const item = document.createElement('div');
            item.className = 'skill-item';
            item.innerHTML = `<span class="skill-dot"></span><span class="skill-name">${esc(sn)}</span><span class="skill-expand-btn">+</span>`;
            let expanded = false;
            item.querySelector('.skill-expand-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                document.getElementById('skillModalTitle').textContent = esc(sn);
                document.getElementById('skillModalBody').innerHTML = `
                    <p><strong>名称：</strong>${esc(sn)}</p>
                    <p><strong>分类：</strong>${esc(cat)}</p>
                    <p><strong>说明：</strong>Hermes 内置 skill，用于 ${esc(cat)} 相关任务。</p>
                    <p style="margin-top:12px;font-size:11px;color:var(--text-secondary)">详细说明请使用命令：<br><code style="background:var(--code-bg);padding:2px 6px;border-radius:3px;">hermes skills inspect ${esc(sn)}</code></p>
                `;
                document.getElementById('skillModal').classList.remove('hidden');
            });
            ic.appendChild(item);
        });
        let open = false;
        hdr.addEventListener('click', () => { open=!open; hdr.querySelector('.category-arrow').classList.toggle('open',open); ic.classList.toggle('open',open); });
        group.appendChild(hdr); group.appendChild(ic);
        skillsBody.appendChild(group);
    });
}

function renderSkillsByAlpha(data) {
    skillsBody.innerHTML = '';
    const skills = data.skills || [];
    const groups = {};
    skills.forEach(s => {
        const letter = (s.name[0]||'#').toUpperCase();
        if(!groups[letter]) groups[letter] = [];
        groups[letter].push(s.name);
    });
    Object.keys(groups).sort().forEach(letter => {
        const grp = document.createElement('div');
        grp.className = 'alpha-group';
        grp.innerHTML = `<div class="alpha-letter">${letter}</div>`;
        groups[letter].sort().forEach(sn => {
            const item = document.createElement('div');
            item.className = 'skill-item';
            item.innerHTML = `<span class="skill-dot"></span><span class="skill-name">${esc(sn)}</span><span class="skill-expand-btn">+</span>`;
            item.querySelector('.skill-expand-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                document.getElementById('skillModalTitle').textContent = esc(sn);
                document.getElementById('skillModalBody').innerHTML = `
                    <p><strong>名称：</strong>${esc(sn)}</p>
                    <p><strong>说明：</strong>Hermes 内置 skill</p>
                    <p style="margin-top:12px;font-size:11px;color:var(--text-secondary)">详细说明请使用命令：<br><code style="background:var(--code-bg);padding:2px 6px;border-radius:3px;">hermes skills inspect ${esc(sn)}</code></p>
                `;
                document.getElementById('skillModal').classList.remove('hidden');
            });
            grp.appendChild(item);
        });
        skillsBody.appendChild(grp);
    });
}

function openSkillsBrowse() {
    if (!currentProfile) return;
}

// ============================================================
// MCP
// ============================================================
function openMcpModal() {
    if (!currentProfile) return;
    const modal = document.getElementById('mcpModal');
    const body = document.getElementById('mcpModalBody');
    body.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-secondary);font-size:12px;">加载中...</div>';
    modal.classList.remove('hidden');
    apiGet(`/api/profile/${currentProfile}/mcp`).then(data => {
        if (data.error) { body.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-secondary);font-size:12px;">加载失败</div>'; return; }
        if (!data.has_servers || !data.servers.length) {
            body.innerHTML = '<div style="text-align:center;padding:30px;color:var(--text-secondary);font-size:13px;">暂无 MCP 服务器配置</div>';
            return;
        }
        body.innerHTML = data.servers.map(s =>
            `<div style="padding:8px 10px;border-bottom:1px solid var(--border-light);font-size:12px;color:var(--text);">${esc(s)}</div>`
        ).join('');
    });
}

// ============================================================
// 日志查看器
// ============================================================
function openLogViewer() {
    if (!currentProfile) return;
    const modal = document.getElementById('logModal');
    document.getElementById('logContent').textContent = '加载中...';
    modal.classList.remove('hidden');
    loadLogContent();
}

async function loadLogContent() {
    if (!currentProfile) return;
    const type = document.getElementById('logTypeSelect').value;
    document.getElementById('logContent').textContent = '加载中...';
    const data = await apiGet(`/api/profile/${currentProfile}/logs?type=${type}&lines=100`);
    document.getElementById('logContent').textContent = data.content || data.error || '无日志内容';
}

document.getElementById('logTypeSelect').addEventListener('change', loadLogContent);
document.getElementById('logRefreshBtn').addEventListener('click', loadLogContent);

// ============================================================
// 网络诊断
// ============================================================
function openDiagnose() {
    const modal = document.getElementById('diagnoseModal');
    document.getElementById('diagnoseBody').innerHTML = '正在检测...';
    modal.classList.remove('hidden');
    runDiagnose();
}

async function runDiagnose() {
    const data = await apiGet('/api/diagnose');
    if (data.error || !data.results) {
        document.getElementById('diagnoseBody').innerHTML = '<div style="color:var(--text-secondary);font-size:12px;">诊断失败</div>';
        return;
    }
    const statusMap = {
        ok: '<span style="color:#22C55E;">&#9679;</span>',
        warn: '<span style="color:#F59E0B;">&#9679;</span>',
        error: '<span style="color:#EF4444;">&#9679;</span>'
    };
    let html = '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    data.results.forEach(r => {
        const dot = statusMap[r.status] || statusMap.error;
        html += `<tr style="border-bottom:1px solid var(--border-light);">
            <td style="padding:6px 8px;width:100px;">${dot} ${esc(r.name)}</td>
            <td style="padding:6px 8px;color:var(--text-secondary);">${esc(r.detail)}</td>
        </tr>`;
    });
    html += '</table>';
    document.getElementById('diagnoseBody').innerHTML = html;
}

document.getElementById('diagnoseRefreshBtn').addEventListener('click', runDiagnose);

// ============================================================
// 检查更新
// ============================================================
async function openUpdateCheck() {
    const modal = document.getElementById('updateModal');
    document.getElementById('updateBody').innerHTML = '正在检查...';
    modal.classList.remove('hidden');
    const data = await apiGet('/api/version/check');
    if (data.error) {
        document.getElementById('updateBody').innerHTML = '<div style="color:var(--text-secondary);font-size:12px;">检查失败</div>';
        return;
    }
    let html = `<p><strong>当前版本：</strong><br>${esc(data.version || '未知')}</p>`;
    html += `<p style="margin-top:8px;">${esc(data.update_info || '')}</p>`;
    if (data.update_available) {
        html += `<p style="margin-top:12px;color:#F59E0B;font-weight:500;">新版本可用！</p>`;
        html += `<p style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">请在 WSL 终端运行：</p>`;
        html += `<div class="code-block">hermes update<button class="copy-btn" data-code="hermes update">复制</button></div>`;
    } else {
        html += `<p style="margin-top:12px;color:#22C55E;font-weight:500;">Hermes 已是最新版本</p>`;
    }
    document.getElementById('updateBody').innerHTML = html;
}

// ============================================================
// 新建会话
// ============================================================
async function handleNewSession() {
    if (!currentProfile) return;
    newSessionBtn.disabled = true;
    newSessionBtn.textContent = '启动中...';
    await apiPost(`/api/profile/${currentProfile}/launch`);
    setTimeout(() => { newSessionBtn.textContent = '新建会话'; newSessionBtn.disabled = false; }, 2000);
}

async function handleRefresh() {
    if (!currentProfile) return;
    await Promise.all([loadSessions(currentProfile), loadSkills(currentProfile)]);
}

newSessionBtn.addEventListener('click', handleNewSession);

// ============================================================
// 排序按钮
// ============================================================
document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentSort = btn.dataset.sort;
        if(currentProfile) loadSessions(currentProfile);
    });
});

// ============================================================
// 搜索输入（防抖 300ms）
// ============================================================
if (searchInput) {
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
            if(currentProfile) loadSessions(currentProfile);
        }, 300);
    });
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            clearTimeout(searchTimer);
            if (!searchConfirmed && currentProfile) {
                searchConfirmed = true;
                if (searchConfirmBtn) {
                    searchConfirmBtn.innerHTML = '&times;';
                    searchConfirmBtn.title = '取消搜索';
                }
            }
            if(currentProfile) loadSessions(currentProfile);
        }
    });
}

// ============================================================
// WSL 启动
// ============================================================
if (wslBtn) {
    wslBtn.addEventListener('click', async () => {
        wslBtn.disabled = true;
        wslBtn.textContent = '启动中...';
        await apiPost('/api/wsl/start');
        setTimeout(() => {
            wslBtn.textContent = '启动 WSL';
            wslBtn.disabled = false;
        }, 2000);
    });
}

// ============================================================
// 全局刷新按钮
// ============================================================
if (refreshStatusBtn) {
    refreshStatusBtn.addEventListener('click', async () => {
        if (!currentProfile) return;
        await loadProfiles();
        document.querySelectorAll('.profile-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.profile === currentProfile);
        });
        await Promise.all([
            loadSessions(currentProfile),
            loadSkills(currentProfile),
        ]);
    });
}

// ============================================================
// 搜索确认/重置按钮
// ============================================================
if (searchConfirmBtn) {
    searchConfirmBtn.addEventListener('click', () => {
        if (!currentProfile) return;
        searchConfirmed = !searchConfirmed;
        if (searchConfirmed) {
            searchConfirmBtn.innerHTML = '&times;';
            searchConfirmBtn.title = '取消搜索';
        } else {
            searchConfirmBtn.innerHTML = '&check;';
            searchConfirmBtn.title = '确认搜索';
            if (searchInput) searchInput.value = '';
        }
        loadSessions(currentProfile);
    });
}

// ============================================================
// 搜索刷新按钮
// ============================================================
if (searchRefreshBtn) {
    searchRefreshBtn.addEventListener('click', () => {
        if (!currentProfile) return;
        loadSessions(currentProfile);
        loadSkills(currentProfile);
    });
}

// ============================================================
// 新建 Profile
// ============================================================
document.getElementById('addProfileBtn').addEventListener('click', () => {
    document.getElementById('newProfileModal').classList.remove('hidden');
    document.getElementById('newProfileName').value = '';
    document.getElementById('newProfileName').focus();
});
document.getElementById('confirmCreateProfile').addEventListener('click', async () => {
    const name = document.getElementById('newProfileName').value.trim();
    if(!name) return;
    const result = await apiPost('/api/profile', { name });
    if(!result.error) {
        document.getElementById('newProfileModal').classList.add('hidden');
        await loadProfiles();
        switchProfile(name);
    } else { alert('创建失败'); }
});
document.getElementById('newProfileName').addEventListener('keydown', (e) => {
    if(e.key === 'Enter') document.getElementById('confirmCreateProfile').click();
});

// ============================================================
// 管理弹窗
// ============================================================
document.getElementById('manageProfileBtn').addEventListener('click', () => {
    document.getElementById('manageProfileModal').classList.remove('hidden');
    loadManageProfiles();
});

async function loadManageProfiles() {
    const data = await apiGet('/api/profiles');
    const body = document.getElementById('manageProfileBody');
    if (data.error || !data.profiles) {
        body.innerHTML = '<div style="padding:12px;color:var(--text-secondary)">加载失败</div>';
        return;
    }
    let html = '<table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<tr style="border-bottom:1px solid var(--border-light)"><th style="padding:6px 8px;text-align:left">名称</th><th style="padding:6px 8px;text-align:left">模型</th><th style="padding:6px 8px">操作</th></tr>';

    for (const p of data.profiles) {
        const detail = await apiGet(`/api/profile/${p.name}`);
        const currentModel = detail.model ? detail.model.split(' ')[0] : p.model;
        const active = p.name === currentProfile ? ' selected' : '';
        html += `<tr style="border-bottom:1px solid var(--border-light)" class="mgmt-row${active}">
            <td style="padding:6px 8px;font-weight:500">${esc(p.name)}</td>
            <td style="padding:6px 8px">
                <input type="text" class="mgmt-model-input" data-profile="${esc(p.name)}" value="${esc(currentModel)}" style="padding:3px 6px;border-radius:4px;border:1px solid var(--border);background:var(--input-bg);color:var(--text);font-size:11px;font-family:inherit;width:140px;">
            </td>
            <td style="padding:6px 8px;text-align:center;display:flex;gap:4px;justify-content:center;">
                <button class="mgmt-switch mgmt-btn" data-profile="${esc(p.name)}">切换</button>
                <button class="mgmt-delete mgmt-btn" data-profile="${esc(p.name)}">删除</button>
            </td>
        </tr>`;
    }
    html += '</table>';
    html += '<p style="margin-top:8px;font-size:10px;color:var(--text-secondary);">修改模型名后按 Enter 确认</p>';
    body.innerHTML = html;

    body.querySelectorAll('.mgmt-switch').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('manageProfileModal').classList.add('hidden');
            switchProfile(btn.dataset.profile);
        });
    });
    body.querySelectorAll('.mgmt-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            const name = btn.dataset.profile;
            if (!confirm(`确定删除 Profile「${name}」？此操作不可恢复。`)) return;
            const result = await apiPost(`/api/profile/${name}/delete`);
            if (!result.error) {
                if (currentProfile === name) currentProfile = null;
                document.getElementById('manageProfileModal').classList.add('hidden');
                await loadProfiles();
            } else { alert('删除失败'); }
        });
    });
    body.querySelectorAll('.mgmt-model-input').forEach(inp => {
        inp.addEventListener('keydown', async (e) => {
            if (e.key !== 'Enter') return;
            const name = inp.dataset.profile;
            const model = inp.value.trim();
            if (!model) return;
            await apiPost(`/api/profile/${name}/model`, { model });
            if (name === currentProfile) {}
        });
    });
}

// ============================================================
// 主题切换
// ============================================================
document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => saveSetting('theme', btn.dataset.theme));
});

// ============================================================
// 字号控制
// ============================================================
document.querySelectorAll('.font-btn').forEach(btn => {
    btn.addEventListener('click', () => adjustFont(btn.dataset.dir === 'plus' ? 1 : -1));
});

// ============================================================
// Skill 视图切换
// ============================================================
document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        skillsView = btn.dataset.view;
        if(currentProfile) loadSkills(currentProfile);
    });
});

// ============================================================
// 弹窗关闭统一处理
// ============================================================
document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
        document.getElementById(btn.dataset.modal).classList.add('hidden');
    });
});
document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', (e) => { if(e.target === m) m.classList.add('hidden'); });
});

// ============================================================
// 复制按钮
// ============================================================
document.addEventListener('click', (e) => {
    if(e.target.classList.contains('copy-btn')) {
        const code = e.target.dataset.code;
        navigator.clipboard.writeText(code).then(() => {
            e.target.textContent = '已复制';
            e.target.classList.add('copied');
            setTimeout(() => { e.target.textContent = '复制'; e.target.classList.remove('copied'); }, 1500);
        });
    }
});

// ============================================================
// 拖拽分割线
// ============================================================
let isDragging = false;
dragHandle.addEventListener('mousedown', () => {
    isDragging = true;
    dragHandle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
});
document.addEventListener('mousemove', (e) => {
    if(!isDragging) return;
    const container = document.querySelector('.main-content');
    const rect = container.getBoundingClientRect();
    let pct = ((e.clientX - rect.left) / rect.width) * 100;
    pct = Math.max(20, Math.min(60, pct));
    leftPanel.style.width = pct + '%';
    leftPanel.style.flex = 'none';
    rightPanel.style.flex = '1';
});
document.addEventListener('mouseup', () => {
    if(isDragging) {
        isDragging = false;
        dragHandle.classList.remove('dragging');
        document.body.style.cursor = '';
    }
});

// ============================================================
// 快捷键
// ============================================================
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        handleNewSession();
    }
    if (e.ctrlKey && e.key === 'w') {
        e.preventDefault();
        const openModals = document.querySelectorAll('.modal-overlay:not(.hidden)');
        if (openModals.length > 0) {
            openModals[openModals.length - 1].classList.add('hidden');
        }
    }
    if (e.ctrlKey && e.key === 'l') {
        e.preventDefault();
        openLogViewer();
    }
    if (e.key === 'Escape') {
        const openModals = document.querySelectorAll('.modal-overlay:not(.hidden)');
        if (openModals.length > 0) {
            openModals[openModals.length - 1].classList.add('hidden');
        }
    }
});

// ============================================================
// 工具
// ============================================================
function esc(t) {
    if(!t) return '';
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}

// ============================================================
// 常用指令
// ============================================================
const COMMANDS = [
    { title: '启动 Hermes', code: 'hermes' },
    { title: '启动 Hermes（TUI 模式）', code: 'hermes --tui' },
    { title: '启动 Hermes（恢复上次会话）', code: 'hermes -c' },
    { title: '启动 Hermes（指定 profile）', code: 'hermes -p {profile}', hasProfile: true },
    { title: '启动 web 面板', code: 'hermes dashboard' },
    { title: '停止 web 面板', code: 'hermes dashboard --stop' },
    { title: '启动网关（前台运行）', code: 'hermes gateway run' },
    { title: '启动网关（后台服务）', code: 'hermes gateway start' },
    { title: '关闭网关', code: 'hermes gateway stop' },
    { title: '重启网关', code: 'hermes gateway restart' },
    { title: '查看网关状态', code: 'hermes gateway status' },
    { title: '查看会话列表', code: 'hermes sessions list' },
    { title: '浏览会话', code: 'hermes sessions browse' },
    { title: '清理旧会话', code: 'hermes sessions prune' },
    { title: '查看所有 profile', code: 'hermes profile list' },
    { title: '查看 profile 详情', code: 'hermes profile show {profile}', hasProfile: true },
    { title: '查看已安装 skills', code: 'hermes skills list' },
    { title: '浏览可用 skills', code: 'hermes skills browse' },
    { title: '查看配置', code: 'hermes config show' },
    { title: '编辑配置', code: 'hermes config edit' },
    { title: '查看日志', code: 'hermes logs' },
    { title: '实时查看日志', code: 'hermes logs -f' },
    { title: '查看错误日志', code: 'hermes logs errors' },
    { title: '运行诊断', code: 'hermes doctor' },
    { title: '查看版本', code: 'hermes --version' },
    { title: '检查更新', code: 'hermes update' },
];

function openCommandModal() {
    const modal = document.getElementById('commandModal');
    const body = document.getElementById('commandBody');
    apiGet('/api/profiles').then(data => {
        const profiles = (data.profiles || []).map(p => p.name);
        const defaultProfile = currentProfile || 'student';
        body.innerHTML = '';
        COMMANDS.forEach((cmd, idx) => {
            const item = document.createElement('div');
            item.className = 'cmd-item';

            const left = document.createElement('div');
            left.className = 'cmd-left';

            const title = document.createElement('div');
            title.className = 'cmd-title';
            title.textContent = cmd.title;

            const meta = document.createElement('div');
            meta.className = 'cmd-meta';

            let currentCode = cmd.code;

            if (cmd.hasProfile) {
                const select = document.createElement('select');
                select.className = 'cmd-profile-select';
                select.dataset.cmdIndex = idx;
                profiles.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p;
                    opt.textContent = p;
                    if (p === defaultProfile) opt.selected = true;
                    select.appendChild(opt);
                });
                currentCode = cmd.code.replace('{profile}', select.value);
                meta.appendChild(select);

                select.addEventListener('change', () => {
                    const newCode = cmd.code.replace('{profile}', select.value);
                    codeSpan.textContent = newCode;
                    copyBtn.dataset.code = newCode;
                });
            }

            const codeSpan = document.createElement('span');
            codeSpan.className = 'cmd-code-display';
            codeSpan.textContent = currentCode;
            meta.appendChild(codeSpan);

            left.appendChild(title);
            left.appendChild(meta);
            item.appendChild(left);

            const copyBtn = document.createElement('button');
            copyBtn.className = 'cmd-copy-btn';
            copyBtn.dataset.code = currentCode;
            copyBtn.textContent = '复制';
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(copyBtn.dataset.code).then(() => {
                    copyBtn.textContent = '已复制';
                    copyBtn.classList.add('copied');
                    setTimeout(() => {
                        copyBtn.textContent = '复制';
                        copyBtn.classList.remove('copied');
                    }, 1200);
                });
            });
            item.appendChild(copyBtn);

            body.appendChild(item);
        });
        modal.classList.remove('hidden');
    });
}

document.getElementById('commandMenuBtn').addEventListener('click', openCommandModal);

// ============================================================
// 启动
// ============================================================
async function init() {
    await loadSettings();
    
    // 检查 Hermes 是否已配置
    if (!settings.hermes_cli) {
        // 未配置：弹出设置向导
        await checkHermesSetup();
    }
    
    await loadProfiles();
    if (settings.last_profile) {
        const tab = document.querySelector(`.profile-tab[data-profile="${settings.last_profile}"]`);
        if (tab) { await switchProfile(settings.last_profile); }
        else { const ft = document.querySelector('.profile-tab'); if (ft) await switchProfile(ft.dataset.profile); }
    } else {
        const ft = document.querySelector('.profile-tab'); if (ft) await switchProfile(ft.dataset.profile);
    }
    // 全部加载完成，渐出启动页
    setTimeout(() => {
        if (splashScreen) splashScreen.classList.add('fade-out');
        setTimeout(() => { if (splashScreen) splashScreen.style.display = 'none'; }, 600);
    }, 200);
}
init();

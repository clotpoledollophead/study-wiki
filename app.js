// ════════════════════════════════════════════════════
//  STORAGE
// ════════════════════════════════════════════════════
const DB_KEY = 'studywiki_v2';

function loadDB() {
  try { return JSON.parse(localStorage.getItem(DB_KEY)) || mkEmptyDB(); }
  catch { return mkEmptyDB(); }
}
function mkEmptyDB() { return { users: {}, wikis: {}, logs: {} }; }
function saveDB() { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
function simpleHash(s) { let h=5381; for(let i=0;i<s.length;i++) h=((h<<5)+h)+s.charCodeAt(i); return(h>>>0).toString(36); }

let db = loadDB();
let me = null; // current username

function userWiki() { return db.wikis[me] || {}; }
function userLogs() { return db.logs[me] || []; }

function addLog(type, text) {
  if (!db.logs[me]) db.logs[me] = [];
  db.logs[me].unshift({ type, text, ts: Date.now() });
  if (db.logs[me].length > 500) db.logs[me] = db.logs[me].slice(0, 500);
  saveDB();
}

function createPage(title) {
  const id = 'p' + Date.now() + Math.random().toString(36).slice(2,6);
  if (!db.wikis[me]) db.wikis[me] = {};
  db.wikis[me][id] = { id, title: title || 'Untitled', content: '', tags: [], created: Date.now(), updated: Date.now() };
  addLog('ingest', `Created page: "${title || 'Untitled'}"`);
  saveDB();
  return id;
}

function savePage(id, title, content, tags) {
  if (!db.wikis[me] || !db.wikis[me][id]) return;
  db.wikis[me][id].title = title;
  db.wikis[me][id].content = content;
  db.wikis[me][id].tags = tags;
  db.wikis[me][id].updated = Date.now();
  saveDB();
}

function deletePage(id) {
  const title = db.wikis[me][id]?.title || id;
  delete db.wikis[me][id];
  addLog('delete', `Deleted page: "${title}"`);
  saveDB();
}

// ════════════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════════════
const authScreen = document.getElementById('auth-screen');
const appEl = document.getElementById('app');
let isSignup = false;

document.getElementById('a-switch').addEventListener('click', () => {
  isSignup = !isSignup;
  document.getElementById('a-btn').textContent = isSignup ? 'Create account' : 'Sign in';
  document.getElementById('a-switch').textContent = isSignup ? 'Sign in instead' : 'Create one';
  document.querySelector('#a-toggle').firstChild.textContent = isSignup ? 'Already have one? ' : 'No account? ';
  document.getElementById('a-err').style.display = 'none';
});

document.getElementById('a-btn').addEventListener('click', doAuth);
document.getElementById('a-pass').addEventListener('keydown', e => e.key === 'Enter' && doAuth());
document.getElementById('a-user').addEventListener('keydown', e => e.key === 'Enter' && document.getElementById('a-pass').focus());

function doAuth() {
  const u = document.getElementById('a-user').value.trim().toLowerCase();
  const p = document.getElementById('a-pass').value;
  const errEl = document.getElementById('a-err');
  if (!u || !p) { showErr('Enter username and password.'); return; }
  const h = simpleHash(u + p);
  if (isSignup) {
    if (db.users[u]) { showErr('Username taken.'); return; }
    db.users[u] = h;
    db.wikis[u] = {};
    db.logs[u] = [];
    saveDB();
  } else {
    if (!db.users[u] || db.users[u] !== h) { showErr('Incorrect credentials.'); return; }
  }
  errEl.style.display = 'none';
  me = u;
  authScreen.style.display = 'none';
  appEl.classList.add('visible');
  document.getElementById('tb-user').textContent = u;
  bootApp();
}

function showErr(msg) {
  const el = document.getElementById('a-err');
  el.textContent = msg; el.style.display = 'block';
}

document.getElementById('tb-signout').addEventListener('click', () => {
  me = null;
  appEl.classList.remove('visible');
  authScreen.style.display = 'flex';
  document.getElementById('a-user').value = '';
  document.getElementById('a-pass').value = '';
  currentPageId = null;
});

// ════════════════════════════════════════════════════
//  APP BOOT
// ════════════════════════════════════════════════════
let currentPageId = null;
let currentView = 'editor';
let autoSaveTimer = null;

function bootApp() {
  renderSidebar();
  const pages = Object.values(userWiki());
  if (pages.length === 0) {
    const id = createPage('Welcome');
    db.wikis[me][id].content = '# Welcome to StudyWiki\n\nThis is your first page. Start writing notes here.\n\nYou can:\n- Create new pages from the sidebar\n- Tag pages using the tag input above\n- Reference other pages with [[page name]]\n- Use the AI panel to summarize and cross-reference\n- Run **Lint** to health-check your wiki\n- See **Graph** for a visual map of your notes';
    saveDB();
    openPage(id);
  } else {
    const sorted = pages.sort((a,b) => b.updated - a.updated);
    openPage(sorted[0].id);
  }
  switchView('editor');
}

// ════════════════════════════════════════════════════
//  VIEW SWITCHING
// ════════════════════════════════════════════════════
const viewIds = { editor: 'editor-view', index: 'index-view', log: 'log-view', graph: 'graph-view', lint: 'lint-view' };

document.querySelectorAll('.tb-tab').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

function switchView(v) {
  currentView = v;
  document.querySelectorAll('.tb-tab').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  const sidebar = document.getElementById('sidebar');
  sidebar.style.display = v === 'editor' ? 'flex' : 'none';

  Object.entries(viewIds).forEach(([k, id]) => {
    const el = document.getElementById(id);
    el.classList.toggle('active', k === v);
    if (k !== 'editor') el.style.display = k === v ? 'block' : 'none';
    if (k === 'editor') el.style.display = k === v ? 'flex' : 'none';
    if (k === 'graph') el.style.display = k === v ? 'flex' : 'none';
  });

  if (v === 'index') renderIndex();
  if (v === 'log') renderLog();
  if (v === 'graph') { setTimeout(renderGraph, 50); }
  if (v === 'lint') renderLintPlaceholder();
}

// ════════════════════════════════════════════════════
//  SIDEBAR
// ════════════════════════════════════════════════════
document.getElementById('sb-new').addEventListener('click', () => {
  const id = createPage('');
  renderSidebar();
  openPage(id);
  document.getElementById('page-title').focus();
});

function renderSidebar() {
  const wiki = userWiki();
  const pages = Object.values(wiki).sort((a,b) => b.updated - a.updated);
  const container = document.getElementById('sb-pages');
  container.innerHTML = '';
  pages.forEach(p => {
    const el = document.createElement('div');
    el.className = 'sb-page' + (p.id === currentPageId ? ' active' : '');
    el.innerHTML = `<span class="sb-page-icon">📄</span><span class="sb-page-name">${esc(p.title || 'Untitled')}</span><button class="sb-page-del" title="Delete">×</button>`;
    el.querySelector('.sb-page-name').addEventListener('click', () => openPage(p.id));
    el.querySelector('.sb-page-del').addEventListener('click', e => { e.stopPropagation(); if(confirm(`Delete "${p.title}"?`)) { deletePage(p.id); if(currentPageId===p.id) { currentPageId=null; showEmptyEditor(); } renderSidebar(); } });
    container.appendChild(el);
  });
  const count = pages.length;
  const words = pages.reduce((s,p) => s + wordCount(p.content), 0);
  document.getElementById('sb-stats').textContent = `${count} page${count!==1?'s':''} · ${words.toLocaleString()} words`;
}

function showEmptyEditor() {
  document.getElementById('editor-empty').style.display = 'flex';
  document.getElementById('editor-active').style.display = 'none';
}

function openPage(id) {
  const p = userWiki()[id];
  if (!p) return;
  currentPageId = id;
  document.getElementById('editor-empty').style.display = 'none';
  document.getElementById('editor-active').style.display = 'flex';
  document.getElementById('page-title').value = p.title;
  document.getElementById('note-content').value = p.content;
  currentTags = [...(p.tags || [])];
  renderTagPills();
  document.getElementById('save-ind').textContent = '';
  document.getElementById('save-ind').className = 'save-indicator';
  renderSidebar();
  switchView('editor');
}

// ════════════════════════════════════════════════════
//  EDITOR INTERACTIONS
// ════════════════════════════════════════════════════
let currentTags = [];

function renderTagPills() {
  const container = document.getElementById('tags-container');
  container.innerHTML = '';
  currentTags.forEach(tag => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.innerHTML = `${esc(tag)}<button class="rm" data-tag="${esc(tag)}">×</button>`;
    pill.querySelector('.rm').addEventListener('click', () => {
      currentTags = currentTags.filter(t => t !== tag);
      renderTagPills();
      scheduleAutoSave();
    });
    container.appendChild(pill);
  });
}

const tagInput = document.getElementById('tag-input');
tagInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && tagInput.value.trim()) {
    const t = tagInput.value.trim().toLowerCase().replace(/\s+/g,'-');
    if (!currentTags.includes(t)) { currentTags.push(t); renderTagPills(); }
    tagInput.value = '';
    scheduleAutoSave();
  }
});

document.getElementById('page-title').addEventListener('input', scheduleAutoSave);
document.getElementById('note-content').addEventListener('input', scheduleAutoSave);

function scheduleAutoSave() {
  clearTimeout(autoSaveTimer);
  document.getElementById('save-ind').textContent = 'Unsaved…';
  document.getElementById('save-ind').className = 'save-indicator';
  autoSaveTimer = setTimeout(doSave, 700);
}

function doSave() {
  if (!currentPageId || !me) return;
  const title = document.getElementById('page-title').value || 'Untitled';
  const content = document.getElementById('note-content').value;
  savePage(currentPageId, title, content, currentTags);
  addLog('edit', `Edited "${title}"`);
  document.getElementById('save-ind').textContent = 'Saved';
  document.getElementById('save-ind').className = 'save-indicator saved';
  renderSidebar();
  setTimeout(() => { if(document.getElementById('save-ind').textContent==='Saved') document.getElementById('save-ind').textContent=''; }, 2000);
}

document.getElementById('export-pdf-btn').addEventListener('click', exportToPDF);

function exportToPDF() {
  const p = userWiki()[currentPageId];
  if (!p) return;

  // 1. Create a temporary container for the PDF content
  const element = document.createElement('div');
  element.style.padding = '40px';
  element.style.color = '#000'; // PDF usually looks better with dark text
  element.style.fontFamily = 'sans-serif';

  // 2. Format the content (Title + Rendered Markdown)
  const htmlContent = `
    <h1 style="font-size: 32px; margin-bottom: 10px;">${p.title}</h1>
    <p style="color: #666; font-size: 12px; margin-bottom: 20px;">
      Tags: ${p.tags.join(', ') || 'None'} | Updated: ${fmtDate(p.updated)}
    </p>
    <hr style="border: 0; border-top: 1px solid #eee; margin-bottom: 20px;">
    <div class="pdf-body">
      ${marked.parse(p.content)}
    </div>
  `;
  element.innerHTML = htmlContent;

  // 3. Configuration options for html2pdf
  const opt = {
    margin:       10,
    filename:     `${p.title.replace(/\s+/g, '_')}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  // 4. Generate and Save
  html2pdf().set(opt).from(element).save();
  
  addLog('query', `Exported "${p.title}" to PDF`);
}

// ════════════════════════════════════════════════════
//  AI PANEL
// ════════════════════════════════════════════════════
document.getElementById('ai-open-btn').addEventListener('click', () => {
  document.getElementById('ai-panel').classList.add('open');
  document.getElementById('ai-input').focus();
});
document.getElementById('ai-close').addEventListener('click', () => document.getElementById('ai-panel').classList.remove('open'));
document.getElementById('ai-send').addEventListener('click', sendAI);
document.getElementById('ai-input').addEventListener('keydown', e => { if(e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendAI(); } });

document.querySelectorAll('.ai-quick-btn').forEach(btn => {
  btn.addEventListener('click', () => { document.getElementById('ai-input').value = btn.dataset.q; sendAI(); });
});

function addAIMsg(text, role) {
  const el = document.createElement('div');
  el.className = 'ai-msg ' + role;

  if (role.includes('assistant')) {
    el.innerHTML = marked.parse(text);
  } else {
    el.textContent = text;
  }

  const msgs = document.getElementById('ai-msgs');
  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;
  return el;
}

async function sendAI() {
  const input = document.getElementById('ai-input');
  const q = input.value.trim();
  if (!q) return;
  input.value = '';
  addAIMsg(q, 'user');

  const loading = addAIMsg('Gemma 4 is thinking...', 'assistant loading');

  const wiki = userWiki();
  const pages = Object.values(wiki);
  const wikiCtx = pages.map(p => `### ${p.title}\n${p.content.slice(0,800)}`).join('\n\n---\n\n');

  const systemPrompt = `You are a study wiki AI assistant. Context:\n${wikiCtx}`;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: q }
        ]
      })
    });

    const data = await res.json();
    loading.className = 'ai-msg assistant';

    let answer = data.response ||
                 data.result?.response ||
                 data.choices?.[0]?.message?.content ||
                 data.result?.choices?.[0]?.message?.content;

    if (answer && answer.includes('<channel|>')) {
        answer = answer.split('<channel|>')[1].trim();
    }

    if (answer) {
        loading.innerHTML = marked.parse(answer);
    } else {
        console.error("Cloudflare AI Raw Data:", data);
        loading.textContent = "Error: Model returned data but no text found. Raw: " + JSON.stringify(data).slice(0, 100);
    }
  } catch (err) {
    loading.className = 'ai-msg assistant';
    loading.textContent = 'Error: Could not reach Cloudflare Workers AI.';
  }
}

// ════════════════════════════════════════════════════
//  INDEX VIEW
// ════════════════════════════════════════════════════
function renderIndex() {
  const pages = Object.values(userWiki()).sort((a,b) => b.updated - a.updated);
  document.getElementById('index-sub').textContent = `${pages.length} pages · ${pages.reduce((s,p)=>s+wordCount(p.content),0).toLocaleString()} total words`;
  const tbody = document.getElementById('index-tbody');
  tbody.innerHTML = '';
  pages.forEach(p => {
    const tr = document.createElement('tr');
    const tagsHtml = (p.tags||[]).map(t=>`<span class="index-tag">${esc(t)}</span>`).join('');
    tr.innerHTML = `
      <td>${esc(p.title||'Untitled')}</td>
      <td><div class="index-tags">${tagsHtml||'—'}</div></td>
      <td>${wordCount(p.content).toLocaleString()}</td>
      <td>${fmtDate(p.updated)}</td>`;
    tr.querySelector('td').style.cursor = 'pointer';
    tr.querySelector('td').addEventListener('click', () => { openPage(p.id); switchView('editor'); });
    tbody.appendChild(tr);
  });
}

// ════════════════════════════════════════════════════
//  LOG VIEW
// ════════════════════════════════════════════════════
function renderLog() {
  const logs = userLogs();
  const container = document.getElementById('log-entries');
  if (logs.length === 0) {
    container.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:20px 0;">No activity yet.</div>';
    return;
  }
  container.innerHTML = logs.map(l => `
    <div class="log-entry">
      <span class="log-time">${fmtDateTime(l.ts)}</span>
      <span class="log-badge ${l.type}">${l.type}</span>
      <span class="log-text">${esc(l.text)}</span>
    </div>`).join('');
}

// ════════════════════════════════════════════════════
//  GRAPH VIEW
// ════════════════════════════════════════════════════
let graphNodes = [], graphEdges = [], dragging = null, dragOffX = 0, dragOffY = 0, panX = 0, panY = 0, panStartX = 0, panStartY = 0, isPanning = false;

function renderGraph() {
  const canvas = document.getElementById('graph-canvas');
  const ctx = canvas.getContext('2d');
  const parent = canvas.parentElement;
  canvas.width = parent.clientWidth;
  canvas.height = parent.clientHeight - 40;

  const wiki = userWiki();
  const pages = Object.values(wiki);
  const allTags = [...new Set(pages.flatMap(p => p.tags || []))];

  const centerX = canvas.width / 2, centerY = canvas.height / 2;
  graphNodes = [];
  graphEdges = [];

  pages.forEach((p, i) => {
    const angle = (2 * Math.PI * i) / Math.max(pages.length, 1) - Math.PI/2;
    const r = Math.min(canvas.width, canvas.height) * 0.3;
    graphNodes.push({ id: p.id, label: p.title || 'Untitled', type: 'page', x: centerX + r * Math.cos(angle), y: centerY + r * Math.sin(angle), r: 18, vx:0, vy:0 });
  });

  allTags.forEach((tag, i) => {
    const angle = (2 * Math.PI * i) / Math.max(allTags.length, 1);
    const r = Math.min(canvas.width, canvas.height) * 0.15;
    graphNodes.push({ id: 'tag:' + tag, label: tag, type: 'tag', x: centerX + r * Math.cos(angle), y: centerY + r * Math.sin(angle), r: 12, vx:0, vy:0 });
  });

  pages.forEach(p => {
    (p.tags || []).forEach(tag => {
      graphEdges.push({ from: p.id, to: 'tag:' + tag });
    });
  });

  pages.forEach(p => {
    const refs = [...(p.content.matchAll(/\[\[([^\]]+)\]\]/g))].map(m => m[1].toLowerCase());
    pages.forEach(other => {
      if (other.id !== p.id && refs.includes(other.title.toLowerCase())) {
        graphEdges.push({ from: p.id, to: other.id, wikilink: true });
      }
    });
  });

  for (let iter = 0; iter < 120; iter++) {
    const nodes = graphNodes;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i+1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y;
        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
        const force = Math.min(500 / (dist*dist), 5);
        nodes[i].vx -= force * dx/dist; nodes[i].vy -= force * dy/dist;
        nodes[j].vx += force * dx/dist; nodes[j].vy += force * dy/dist;
      }
    }
    graphEdges.forEach(e => {
      const a = graphNodes.find(n=>n.id===e.from), b = graphNodes.find(n=>n.id===e.to);
      if(!a||!b) return;
      const dx=b.x-a.x, dy=b.y-a.y, dist=Math.sqrt(dx*dx+dy*dy)||1;
      const target = 100, force = (dist-target)*0.03;
      a.vx += force*dx/dist; a.vy += force*dy/dist;
      b.vx -= force*dx/dist; b.vy -= force*dy/dist;
    });
    nodes.forEach(n => {
      n.x += n.vx * 0.5; n.y += n.vy * 0.5;
      n.vx *= 0.8; n.vy *= 0.8;
      n.x = Math.max(n.r+5, Math.min(canvas.width-n.r-5, n.x));
      n.y = Math.max(n.r+5, Math.min(canvas.height-n.r-5, n.y));
    });
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 1. Fetch current theme colors from the live CSS
    const style = getComputedStyle(document.body);
    const colorPage = style.getPropertyValue('--graph-node-page').trim();
    const colorTag = style.getPropertyValue('--graph-node-tag').trim();
    const colorEdge = style.getPropertyValue('--graph-edge').trim();
    const colorText = style.getPropertyValue('--graph-text').trim();

    ctx.save();
    ctx.translate(panX, panY);

    // 2. Update Edges
    graphEdges.forEach(e => {
      const a = graphNodes.find(n=>n.id===e.from), b = graphNodes.find(n=>n.id===e.to);
      if(!a||!b) return;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = e.wikilink ? 'rgba(124,109,250,0.4)' : colorEdge;
      ctx.lineWidth = e.wikilink ? 1.5 : 1;
      ctx.stroke();
    });

    // 3. Update Nodes and Text
    graphNodes.forEach(n => {
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI*2);
      ctx.fillStyle = n.type === 'page' ? colorPage : colorTag;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = n.type === 'page' ? colorPage : colorTag;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const maxLen = n.type === 'page' ? 14 : 10;
      const label = n.label.length > maxLen ? n.label.slice(0, maxLen)+'…' : n.label;
      
      // 4. Use the dynamic text color (now #1d1d1f in light mode)
      ctx.fillStyle = colorText;
      ctx.font = `${n.type==='page'?'11px':'10px'} "DM Sans", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(label, n.x, n.y + n.r + 12);
    });

    ctx.restore();
  }

  draw();

  canvas.onmousedown = e => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left - panX, my = e.clientY - rect.top - panY;
    const hit = graphNodes.find(n => Math.hypot(n.x-mx, n.y-my) < n.r+4);
    if (hit) { dragging = hit; dragOffX = mx-hit.x; dragOffY = my-hit.y; }
    else { isPanning = true; panStartX = e.clientX - panX; panStartY = e.clientY - panY; }
  };
  canvas.onmousemove = e => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left - panX, my = e.clientY - rect.top - panY;
    if (dragging) { dragging.x = mx - dragOffX; dragging.y = my - dragOffY; draw(); }
    else if (isPanning) { panX = e.clientX - panStartX; panY = e.clientY - panStartY; draw(); }
    else {
      const hit = graphNodes.find(n => Math.hypot(n.x-mx, n.y-my) < n.r+4);
      document.getElementById('graph-info').textContent = hit ? `${hit.type === 'page' ? '📄' : '🏷'} ${hit.label}` : 'Hover a node to inspect';
      canvas.style.cursor = hit ? 'pointer' : isPanning ? 'grabbing' : 'grab';
    }
  };
  canvas.onmouseup = e => {
    if (dragging) {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left - panX, my = e.clientY - rect.top - panY;
      const dist = Math.hypot(mx - (dragging.x + dragOffX), my - (dragging.y + dragOffY));
      if (dist < 4 && dragging.type === 'page') { openPage(dragging.id); switchView('editor'); }
    }
    dragging = null; isPanning = false;
  };
  canvas.onmouseleave = () => { dragging = null; isPanning = false; };
}

// ════════════════════════════════════════════════════
//  LINT VIEW
// ════════════════════════════════════════════════════
function renderLintPlaceholder() {
  if (document.getElementById('lint-results').innerHTML === '') {
    document.getElementById('lint-results').innerHTML = `
      <div class="lint-empty">
        <div class="lint-empty-icon">🔍</div>
        <div>Click "Run lint check" to analyse your wiki</div>
      </div>`;
  }
}

document.getElementById('lint-run').addEventListener('click', runLint);

async function runLint() {
  const btn = document.getElementById('lint-run');
  btn.disabled = true;
  btn.textContent = 'Running…';
  addLog('lint', 'Ran wiki lint check');

  const wiki = userWiki();
  const pages = Object.values(wiki);

  if (pages.length === 0) {
    document.getElementById('lint-results').innerHTML = '<div class="lint-empty"><div class="lint-empty-icon">📭</div><div>No pages to lint yet.</div></div>';
    btn.disabled = false; btn.textContent = 'Run lint check';
    return;
  }

  const issues = { orphans: [], stubs: [], missingLinks: [], duplicateTags: [] };

  if (pages.length > 1) {
    pages.forEach(p => {
      const isLinked = pages.some(other => other.id !== p.id && other.content.toLowerCase().includes(`[[${p.title.toLowerCase()}]]`));
      if (!isLinked && (p.tags||[]).length === 0) issues.orphans.push(p);
    });
  }

  pages.forEach(p => { if (wordCount(p.content) < 30 && p.content.trim()) issues.stubs.push(p); });
  if (wordCount(pages[0]?.content||'') === 0) issues.stubs.push(pages[0]);

  pages.forEach(p => {
    const refs = [...(p.content.matchAll(/\[\[([^\]]+)\]\]/g))].map(m=>m[1]);
    refs.forEach(ref => {
      const found = pages.some(other => other.title.toLowerCase() === ref.toLowerCase());
      if (!found) issues.missingLinks.push({ page: p, ref });
    });
  });

  const wikiSummary = pages.map(p=>`Page: "${p.title}" (${wordCount(p.content)} words, tags: ${(p.tags||[]).join(',')||'none'})\n${p.content.slice(0,400)}`).join('\n---\n');
  let aiIssues = [];
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        system: 'You are a wiki health checker. Analyse the provided wiki pages and return a JSON array of issues. Each issue: { "type": "contradiction"|"gap"|"suggestion", "title": "short title", "detail": "explanation", "page": "page name or null" }. Return ONLY valid JSON array, no markdown, no extra text.',
        messages: [{ role: 'user', content: `Analyse this wiki and find: contradictions between pages, important missing concepts, or suggestions for new pages that would strengthen the knowledge base.\n\nWiki:\n${wikiSummary}` }]
      })
    });
    const data = await res.json();
    const raw = data.content?.find(b=>b.type==='text')?.text || '[]';
    const cleaned = raw.replace(/```json|```/g,'').trim();
    aiIssues = JSON.parse(cleaned);
  } catch { aiIssues = []; }

  renderLintResults(issues, aiIssues);
  btn.disabled = false;
  btn.textContent = 'Run lint check';
}

function renderLintResults(issues, aiIssues) {
  const container = document.getElementById('lint-results');
  const total = issues.orphans.length + issues.stubs.length + issues.missingLinks.length + aiIssues.length;

  if (total === 0) {
    container.innerHTML = `<div class="lint-empty"><div class="lint-empty-icon">✅</div><div>Wiki looks healthy! No issues found.</div></div>`;
    return;
  }

  let html = '';

  if (issues.orphans.length) {
    html += `<div class="lint-section"><div class="lint-section-title">Orphan pages <span class="lint-count">${issues.orphans.length}</span></div>`;
    issues.orphans.forEach(p => {
      html += `<div class="lint-issue"><div class="lint-icon">🔗</div><div class="lint-body"><div class="lint-title">"${esc(p.title)}"</div><div class="lint-detail">No other page links to this page and it has no tags. Consider linking it from a related page or adding tags.</div></div></div>`;
    });
    html += '</div>';
  }

  if (issues.stubs.length) {
    html += `<div class="lint-section"><div class="lint-section-title">Stub pages <span class="lint-count">${issues.stubs.length}</span></div>`;
    issues.stubs.forEach(p => {
      html += `<div class="lint-issue"><div class="lint-icon">📝</div><div class="lint-body"><div class="lint-title">"${esc(p.title)}" (${wordCount(p.content)} words)</div><div class="lint-detail">This page is very short. Consider expanding it with more detail or examples.</div></div></div>`;
    });
    html += '</div>';
  }

  if (issues.missingLinks.length) {
    html += `<div class="lint-section"><div class="lint-section-title">Broken wiki links <span class="lint-count">${issues.missingLinks.length}</span></div>`;
    issues.missingLinks.forEach(({ page, ref }) => {
      html += `<div class="lint-issue"><div class="lint-icon">⚠️</div><div class="lint-body"><div class="lint-title">[[${esc(ref)}]] in "${esc(page.title)}"</div><div class="lint-detail">This page references [[${esc(ref)}]] but no such page exists. Create it or fix the link.</div><span class="lint-fix" data-create="${esc(ref)}">Create page "${esc(ref)}"</span></div></div>`;
    });
    html += '</div>';
  }

  if (aiIssues.length) {
    const byType = {};
    aiIssues.forEach(i => { (byType[i.type] = byType[i.type]||[]).push(i); });
    const labels = { contradiction: 'Contradictions', gap: 'Knowledge gaps', suggestion: 'Suggestions' };
    const icons = { contradiction: '⚡', gap: '🕳', suggestion: '💡' };
    Object.entries(byType).forEach(([type, items]) => {
      html += `<div class="lint-section"><div class="lint-section-title">${labels[type]||type} <span class="lint-count">${items.length}</span></div>`;
      items.forEach(i => {
        html += `<div class="lint-issue"><div class="lint-icon">${icons[type]||'•'}</div><div class="lint-body"><div class="lint-title">${esc(i.title)}${i.page?` <span style="color:var(--text3);font-size:11px;">— ${esc(i.page)}</span>`:''}</div><div class="lint-detail">${esc(i.detail)}</div>${type==='suggestion'?`<span class="lint-fix" data-create="${esc(i.title)}">Create page</span>`:''}</div></div>`;
      });
      html += '</div>';
    });
  }

  container.innerHTML = html;

  container.querySelectorAll('.lint-fix[data-create]').forEach(btn => {
    btn.addEventListener('click', () => {
      const title = btn.dataset.create;
      const id = createPage(title);
      renderSidebar();
      openPage(id);
      switchView('editor');
    });
  });
}

// ════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function wordCount(s) { return (s||'').trim().split(/\s+/).filter(Boolean).length; }
function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' });
}
function fmtDateTime(ts) {
  const d = new Date(ts);
  return d.toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
}

// Window resize: redraw graph
window.addEventListener('resize', () => { if (currentView === 'graph') renderGraph(); });

// ════════════════════════════════════════════════════
//  THEME TOGGLE
// ════════════════════════════════════════════════════
const themeBtn = document.getElementById('theme-toggle');

// Check for saved user preference on load
if (localStorage.getItem('theme') === 'light') {
  document.body.classList.add('light-mode');
}

themeBtn.addEventListener('click', () => {
  document.body.classList.toggle('light-mode');
  
  // Save preference
  if (document.body.classList.contains('light-mode')) {
    localStorage.setItem('theme', 'light');
    addLog('edit', 'Switched to light mode');
  } else {
    localStorage.setItem('theme', 'dark');
    addLog('edit', 'Switched to dark mode');
  }
});

// ════════════════════════════════════════════════════
//  ADVANCED SEARCH & MENTIONS
// ════════════════════════════════════════════════════

// 1. GLOBAL SEARCH LOGIC
const searchModal = document.getElementById('search-modal');
const searchInput = document.getElementById('global-search-input');
const searchResults = document.getElementById('search-results');

// Shortcut: Cmd+K or Ctrl+K
window.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    searchModal.style.display = 'flex';
    searchInput.focus();
  }
  if (e.key === 'Escape') searchModal.style.display = 'none';
});

searchInput.addEventListener('input', () => {
  const query = searchInput.value.toLowerCase();
  const pages = Object.values(userWiki());
  searchResults.innerHTML = '';

  if (!query) return;

  const filtered = pages.filter(p => 
    p.title.toLowerCase().includes(query) || 
    p.content.toLowerCase().includes(query) ||
    p.tags.some(t => t.toLowerCase().includes(query))
  );

  filtered.forEach(p => {
    const el = document.createElement('div');
    el.className = 'search-item';
    const snippet = p.content.substring(0, 80).replace(/\n/g, ' ') + '...';
    el.innerHTML = `<div class="title">${esc(p.title)}</div><div class="snippet">${esc(snippet)}</div>`;
    el.onclick = () => {
      openPage(p.id);
      searchModal.style.display = 'none';
      searchInput.value = '';
    };
    searchResults.appendChild(el);
  });
});

// 2. UNLINKED MENTIONS LOGIC
function renderUnlinkedMentions() {
  const currentP = userWiki()[currentPageId];
  if (!currentP) return;
  
  const list = document.getElementById('mentions-list');
  list.innerHTML = '';
  
  const allPages = Object.values(userWiki());
  const currentTitle = currentP.title.toLowerCase();

  if (!currentTitle || currentTitle === 'untitled') return;

  allPages.forEach(other => {
    // Don't check the current page against itself
    if (other.id === currentPageId) return;

    const content = other.content.toLowerCase();
    // Check if the other page mentions this title BUT doesn't use [[brackets]]
    const hasMention = content.includes(currentTitle);
    const hasStrictLink = content.includes(`[[${currentTitle}]]`);

    if (hasMention && !hasStrictLink) {
      const el = document.createElement('div');
      el.className = 'mention-item';
      el.innerHTML = `<strong>${esc(other.title)}</strong><br><span style="color:var(--text3)">Mentions "${currentTitle}"</span>`;
      el.onclick = () => openPage(other.id);
      list.appendChild(el);
    }
  });

  if (list.innerHTML === '') {
    list.innerHTML = '<div style="color:var(--text3)">No unlinked mentions found.</div>';
  }
}

// 3. HOOK INTO OPEN PAGE
// Update your existing openPage(id) function to call renderUnlinkedMentions()
const originalOpenPage = openPage;
openPage = function(id) {
  originalOpenPage(id);
  renderUnlinkedMentions();
};
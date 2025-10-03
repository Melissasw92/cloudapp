import './style.css';

const API = import.meta.env.VITE_API_URL || '';
const app = document.querySelector('#app');

app.innerHTML = `
  <div style="max-width: 600px; margin: 2rem auto; font-family: sans-serif">
    <h1>Tasks App</h1>
    <p><strong>API:</strong> ${API || '(not set)'}</p>
    <p id="msg">Checking backend…</p>

    <form id="create" style="display:grid; gap:.5rem; margin:.5rem 0 1rem">
      <input id="title" placeholder="title" required />
      <input id="desc" placeholder="description" />
      <button type="submit">Add</button>
    </form>

    <ul id="list" style="padding-left:1rem;"></ul>
  </div>
`;

const msgEl = document.getElementById('msg');
const listEl = document.getElementById('list');
const formEl = document.getElementById('create');
const titleEl = document.getElementById('title');
const descEl = document.getElementById('desc');

async function load() {
  try {
    const h = await fetch(`${API}/health`);
    if (!h.ok) throw new Error('bad status');
    const health = await h.json();
    if (!health.db) {
      msgEl.textContent = 'Backend OK (DB not configured yet)';
      listEl.innerHTML = '';
      return;
    }
    const r = await fetch(`${API}/tasks`);
    const tasks = await r.json();
    listEl.innerHTML = tasks.map(t => `<li>${t.title} — ${t.description ?? ''}</li>`).join('');
    msgEl.textContent = 'Backend OK (DB connected)';
  } catch (e) {
    msgEl.textContent = 'Cannot reach backend';
    listEl.innerHTML = '';
  }
}

formEl.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const r = await fetch(`${API}/tasks`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ title: titleEl.value, description: descEl.value })
    });
    if (!r.ok) {
      msgEl.textContent = 'Create failed (DB not configured yet?)';
      return;
    }
    titleEl.value = '';
    descEl.value = '';
    await load();
  } catch {
    msgEl.textContent = 'Create failed';
  }
});

load();

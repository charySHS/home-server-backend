import { FastifyInstance } from "fastify";
import { db } from "../../../persistence/Database.js";

const PAGE = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Home Server Setup</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', system-ui, sans-serif;
    font-size: 14px;
    background: #0b0d12;
    color: #dde1ed;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
  }
  .card {
    width: 380px;
    background: #111318;
    border: 1px solid #252836;
    border-radius: 12px;
    padding: 36px 32px;
  }
  .logo {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 6px;
  }
  .logo svg { color: #4a8ff5; }
  .logo h1 { font-size: 18px; font-weight: 600; letter-spacing: -0.3px; }
  .subtitle {
    font-size: 13px;
    color: #5e6278;
    margin-bottom: 28px;
  }
  label {
    display: block;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #8b8fa8;
    margin-bottom: 6px;
  }
  .field { margin-bottom: 16px; }
  input {
    width: 100%;
    padding: 9px 12px;
    background: #171a22;
    border: 1px solid #252836;
    border-radius: 5px;
    color: #dde1ed;
    font-size: 14px;
    outline: none;
    transition: border-color 0.15s;
    font-family: inherit;
  }
  input:focus { border-color: #4a8ff5; }
  button {
    width: 100%;
    padding: 10px;
    background: #4a8ff5;
    color: #fff;
    border: none;
    border-radius: 5px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    margin-top: 8px;
    transition: background 0.15s;
    font-family: inherit;
  }
  button:hover  { background: #5a9bf7; }
  button:disabled { opacity: 0.5; cursor: default; }
  .msg {
    margin-top: 16px;
    padding: 10px 12px;
    border-radius: 5px;
    font-size: 13px;
    display: none;
  }
  .msg.err {
    background: rgba(232,64,64,0.12);
    border: 1px solid rgba(232,64,64,0.3);
    color: #e84040;
    display: block;
  }
  .msg.ok {
    background: rgba(45,212,138,0.1);
    border: 1px solid rgba(45,212,138,0.25);
    color: #2dd48a;
    display: block;
  }
  .done { text-align: center; display: none; }
  .done svg { color: #2dd48a; margin-bottom: 14px; }
  .done h2 { font-size: 16px; margin-bottom: 8px; }
  .done p { font-size: 13px; color: #5e6278; line-height: 1.6; }
  .done code {
    font-family: Consolas, monospace;
    font-size: 12px;
    background: #171a22;
    padding: 2px 6px;
    border-radius: 3px;
    color: #4a8ff5;
  }
</style>
</head>
<body>
<div class="card">
  <div id="form-view">
    <div class="logo">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
        <rect x="2" y="3" width="20" height="14" rx="2"/>
        <path d="M8 21h8M12 17v4"/>
      </svg>
      <h1>Home Server</h1>
    </div>
    <p class="subtitle">Create your admin account to get started.</p>
    <div class="field">
      <label>Username</label>
      <input id="username" type="text" autocomplete="username" placeholder="admin">
    </div>
    <div class="field">
      <label>Password</label>
      <input id="password" type="password" autocomplete="new-password" placeholder="Choose a strong password">
    </div>
    <div class="field">
      <label>Confirm Password</label>
      <input id="confirm" type="password" autocomplete="new-password" placeholder="Repeat password">
    </div>
    <button id="btn">Create Admin Account</button>
    <div id="msg" class="msg"></div>
  </div>

  <div id="done-view" class="done">
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
      <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
      <path d="M22 4L12 14.01l-3-3"/>
    </svg>
    <h2>Setup complete</h2>
    <p>Admin account created.<br>
       Open the dashboard or log in at<br>
       <code>http://localhost:3000</code>
    </p>
  </div>
</div>

<script>
  const btn  = document.getElementById('btn');
  const msg  = document.getElementById('msg');

  function showMsg(text, isErr) {
    msg.textContent = text;
    msg.className = 'msg ' + (isErr ? 'err' : 'ok');
  }

  async function submit() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const confirm  = document.getElementById('confirm').value;

    if (!username || !password) { showMsg('Please fill in all fields.', true); return; }
    if (password !== confirm)   { showMsg('Passwords do not match.', true); return; }
    if (password.length < 6)   { showMsg('Password must be at least 6 characters.', true); return; }

    btn.disabled    = true;
    btn.textContent = 'Creating...';

    try {
      const res  = await fetch('/api/v1/auth/setup', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, password }),
      });
      const body = await res.json();

      if (res.ok) {
        document.getElementById('form-view').style.display = 'none';
        document.getElementById('done-view').style.display = 'block';
        return;
      }

      if (body.error === 'SETUP_ALREADY_COMPLETED') {
        showMsg('An admin account already exists.', true);
      } else {
        showMsg(body.error || 'Something went wrong.', true);
      }
    } catch {
      showMsg('Could not reach server.', true);
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Create Admin Account';
    }
  }

  btn.addEventListener('click', submit);
  document.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
</script>
</body>
</html>`;

export async function registerSetupPageRoute(app: FastifyInstance) {
    app.get("/setup", async (_req, reply) => {
        const alreadyDone = db.prepare("SELECT id FROM users WHERE is_admin = 1").get();
        if (alreadyDone) {
            return reply
                .code(200)
                .header("Content-Type", "text/html; charset=utf-8")
                .send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
                    <style>body{font-family:system-ui;background:#0b0d12;color:#dde1ed;display:flex;
                    align-items:center;justify-content:center;height:100vh;margin:0;}
                    .box{text-align:center;}.box h2{margin-bottom:8px;}
                    .box p{color:#5e6278;font-size:13px;}</style></head>
                    <body><div class="box"><h2>Setup already completed</h2>
                    <p>An admin account already exists. Open the dashboard to sign in.</p>
                    </div></body></html>`);
        }
        return reply
            .code(200)
            .header("Content-Type", "text/html; charset=utf-8")
            .send(PAGE);
    });
}

/* ══════════════════════════════════════════════
   TAB SWITCHING
══════════════════════════════════════════════ */
function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');
    document.getElementById('panel-' + tab).classList.add('active');
}

/* ══════════════════════════════════════════════
   TAB 1 — GENERATE CODE
══════════════════════════════════════════════ */
let secretBytes  = null;
let updateInterval = null;
let currentCode  = '';

function renderDigits(code) {
    for (let i = 0; i < 8; i++) {
        const el = document.getElementById('d' + i);
        if (code && code.length === 8) {
            el.textContent = code[i];
            el.classList.remove('empty');
            el.classList.add('filled');
        } else {
            el.textContent = '-';
            el.classList.remove('filled');
            el.classList.add('empty');
        }
    }
}

function hexToBytes(hex) {
    hex = hex.replace(/\s/g, '').toLowerCase();
    if (!/^[0-9a-f]+$/.test(hex)) throw new Error('Invalid hex');
    if (hex.length % 2 !== 0) throw new Error('Odd hex length');
    const bytes = [];
    for (let i = 0; i < hex.length; i += 2)
        bytes.push(parseInt(hex.substr(i, 2), 16));
    return bytes;
}

function generateTOTP(secretHex) {
    const counter    = Math.floor(Math.floor(Date.now() / 1000) / 30);
    const counterHex = counter.toString(16).padStart(16, '0');
    const key  = CryptoJS.enc.Hex.parse(secretHex);
    const msg  = CryptoJS.enc.Hex.parse(counterHex);
    const hmac = CryptoJS.HmacSHA1(msg, key);
    const bytes = [];
    const h = hmac.toString(CryptoJS.enc.Hex);
    for (let i = 0; i < h.length; i += 2) bytes.push(parseInt(h.substr(i, 2), 16));
    const offset = bytes[bytes.length - 1] & 0x0f;
    const code = (
        ((bytes[offset]     & 0x7f) << 24) |
        ((bytes[offset + 1] & 0xff) << 16) |
        ((bytes[offset + 2] & 0xff) << 8)  |
         (bytes[offset + 3] & 0xff)
    );
    return (code % 100000000).toString().padStart(8, '0');
}

function updateDisplay() {
    if (!secretBytes) return;
    try {
        const hex = secretBytes.map(b => b.toString(16).padStart(2, '0')).join('');
        currentCode = generateTOTP(hex);
        renderDigits(currentCode);
        const timeLeft = 30 - (Math.floor(Date.now() / 1000) % 30);
        const bar = document.getElementById('progressBar');
        bar.style.width = ((timeLeft / 30) * 100) + '%';
        bar.classList.toggle('warning', timeLeft <= 5);
        document.getElementById('timeRemaining').textContent = `Refreshes in ${timeLeft}s`;
    } catch (e) { console.error(e); }
}

function startGenerator(input) {
    const errorMsg  = document.getElementById('errorMsg');
    const statusMsg = document.getElementById('statusMsg');
    if (!input || input.length < 10) {
        errorMsg.classList.remove('active');
        statusMsg.classList.remove('active');
        renderDigits('');
        if (updateInterval) { clearInterval(updateInterval); updateInterval = null; }
        secretBytes = null; currentCode = '';
        document.getElementById('progressBar').style.width = '0%';
        document.getElementById('timeRemaining').textContent = 'Refreshes in 30s';
        return;
    }
    try {
        secretBytes = hexToBytes(input);
        errorMsg.classList.remove('active');
        statusMsg.classList.add('active');
        updateDisplay();
        if (updateInterval) clearInterval(updateInterval);
        updateInterval = setInterval(updateDisplay, 1000);
    } catch (e) {
        errorMsg.textContent = 'Invalid private key! Use HEX format.';
        errorMsg.classList.add('active');
        statusMsg.classList.remove('active');
        renderDigits('');
        secretBytes = null; currentCode = '';
    }
}

function copyCode() {
    const btn = document.getElementById('copyKeyBtn');
    if (!currentCode) { flashBtn(btn, 'No code yet'); return; }
    writeToClipboard(currentCode, () => flashBtn(btn, 'Copied!'));
}

async function pasteKey() {
    const btn = document.getElementById('pasteKeyBtn');
    try {
        const text = await navigator.clipboard.readText();
        document.getElementById('secretInput').value = text;
        startGenerator(text.trim());
        flashBtn(btn, 'Pasted!');
    } catch (e) {
        document.getElementById('secretInput').focus();
        const orig = btn.textContent;
        btn.textContent = 'Press Ctrl+V';
        setTimeout(() => btn.textContent = orig, 2000);
    }
}

const secretInput = document.getElementById('secretInput');
secretInput.addEventListener('input', e => startGenerator(e.target.value.trim()));
secretInput.addEventListener('paste', e => setTimeout(() => startGenerator(e.target.value.trim()), 100));

// Auto-load key from ?key= param (set by 404.html redirect)
window.addEventListener('DOMContentLoaded', function() {
    const urlKey = new URLSearchParams(window.location.search).get('key');
    if (urlKey && urlKey.trim().length >= 16) {
        document.getElementById('secretInput').value = urlKey.trim();
        startGenerator(urlKey.trim());
    }
});

/* ══════════════════════════════════════════════
   TAB 2 — GET NEW KEY
══════════════════════════════════════════════ */

function goToStep(n) {
    document.querySelectorAll('.setup-step').forEach(s => s.classList.add('hidden'));
    document.getElementById('setup-step-' + n).classList.remove('hidden');
    document.querySelectorAll('.step').forEach((el, i) => {
        el.classList.remove('active', 'done');
        if (i + 1 < n)  el.classList.add('done');
        if (i + 1 === n) el.classList.add('active');
    });
}

function openLogin() {
    window.open(
        'https://account.battle.net/login/en/?ref=localhost',
        '_blank',
        'width=500,height=700'
    );
}

function extractSSOToken(input) {
    input = input.trim();
    try {
        const url = new URL(input);
        const st = url.searchParams.get('ST');
        if (st) return st;
    } catch (e) {}
    if (input.length > 10 && !input.includes(' ')) return input;
    return null;
}

async function processSSO() {
    const raw   = document.getElementById('ssoUrlInput').value.trim();
    const errEl = document.getElementById('ssoError');
    errEl.classList.remove('active');

    const ssoToken = extractSSOToken(raw);
    if (!ssoToken) {
        errEl.textContent = 'Could not find ST= token in that URL. Make sure you copy the full URL from your browser.';
        errEl.classList.add('active');
        return;
    }

    goToStep(3);
    document.getElementById('setup-loading').classList.remove('hidden');
    document.getElementById('setup-result').classList.add('hidden');
    document.getElementById('setup-error').classList.add('hidden');

    const PROXY = 'https://corsproxy.org/?';

    try {
        const bearerRes = await fetch(PROXY + encodeURIComponent('https://oauth.battle.net/oauth/sso'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
            body: new URLSearchParams({
                client_id: 'baedda12fe054e4abdfc3ad7bdea970a',
                grant_type: 'client_sso',
                scope: 'auth.authenticator',
                token: ssoToken
            })
        });
        const bearerData = await bearerRes.json();

        if (!bearerData.access_token) {
            throw new Error(bearerData.error_description || 'Failed to get bearer token. The SSO token may have expired — try logging in again.');
        }

        const authRes = await fetch(
            PROXY + encodeURIComponent('https://authenticator-rest-api.bnet-identity.blizzard.net/v1/authenticator'),
            {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Authorization': 'Bearer ' + bearerData.access_token
                }
            }
        );
        const authData = await authRes.json();

        if (!authData.deviceSecret) {
            throw new Error(authData.message || 'Failed to attach authenticator. Make sure no authenticator is currently attached to this account.');
        }

        document.getElementById('setup-loading').classList.add('hidden');
        document.getElementById('res-serial').textContent  = authData.serial      || '—';
        document.getElementById('res-restore').textContent = authData.restoreCode  || '—';
        document.getElementById('res-secret').textContent  = authData.deviceSecret || '—';
        document.getElementById('setup-result').classList.remove('hidden');
        document.querySelectorAll('.step').forEach(el => { el.classList.remove('active'); el.classList.add('done'); });

    } catch (e) {
        document.getElementById('setup-loading').classList.add('hidden');
        document.getElementById('setup-error-msg').textContent = e.message || 'Unknown error occurred.';
        document.getElementById('setup-error').classList.remove('hidden');
    }
}

function useThisKey() {
    const secret = document.getElementById('res-secret').textContent.trim();
    if (!secret || secret === '—') return;
    document.getElementById('secretInput').value = secret;
    startGenerator(secret);
    switchTab('generate');
}

function downloadTxt() {
    const serial  = document.getElementById('res-serial').textContent.trim();
    const restore = document.getElementById('res-restore').textContent.trim();
    const secret  = document.getElementById('res-secret').textContent.trim();
    const filename = 'battlenet_backup_' + serial.replace(/-/g, '_') + '.txt';
    const sep = '======================================================================';
    const lines = [sep,'Battle.net Authenticator Backup',sep,'','WARNING: KEEP THIS FILE SECURE! DO NOT SHARE!','',
        'Serial Number:          ' + serial,'Restore Code:           ' + restore,'Device Secret (HEX):    ' + secret,
        '',sep,'Generated by Battle.net Authenticator Tool',sep].join('\n');
    const blob = new Blob([lines], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function resetSetup() {
    document.getElementById('ssoUrlInput').value = '';
    document.getElementById('ssoError').classList.remove('active');
    goToStep(1);
}

function copyField(id) {
    const text = document.getElementById(id).textContent.trim();
    const btn  = event.target;
    writeToClipboard(text, () => {
        const orig = btn.textContent;
        btn.textContent = 'OK';
        setTimeout(() => btn.textContent = orig, 1500);
    });
}

/* ══════════════════════════════════════════════
   SHARED HELPERS
══════════════════════════════════════════════ */
function writeToClipboard(text, cb) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(cb).catch(() => fallback(text, cb));
    } else { fallback(text, cb); }
}
function fallback(text, cb) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); cb(); } catch (e) {}
    document.body.removeChild(ta);
}
function flashBtn(btn, msg) {
    const orig = btn.textContent, origClass = btn.className;
    btn.textContent = msg; btn.classList.add('flash');
    setTimeout(() => { btn.textContent = orig; btn.className = origClass; }, 2000);
}

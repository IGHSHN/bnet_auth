let secretBytes = null;
let updateInterval = null;
let currentCode = '';

// ── Render digits ──
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

// ── TOTP helpers ──
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
    const counter = Math.floor(Math.floor(Date.now() / 1000) / 30);
    const counterHex = counter.toString(16).padStart(16, '0');
    const key = CryptoJS.enc.Hex.parse(secretHex);
    const msg = CryptoJS.enc.Hex.parse(counterHex);
    const hmac = CryptoJS.HmacSHA1(msg, key);
    const bytes = [];
    const h = hmac.toString(CryptoJS.enc.Hex);
    for (let i = 0; i < h.length; i += 2)
        bytes.push(parseInt(h.substr(i, 2), 16));
    const offset = bytes[bytes.length - 1] & 0x0f;
    const code = (
        ((bytes[offset]     & 0x7f) << 24) |
        ((bytes[offset + 1] & 0xff) << 16) |
        ((bytes[offset + 2] & 0xff) << 8)  |
         (bytes[offset + 3] & 0xff)
    );
    return (code % 100000000).toString().padStart(8, '0');
}

// ── Update display every second ──
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
    } catch (e) {
        console.error(e);
    }
}

// ── Start or stop the generator ──
function startGenerator(input) {
    const errorMsg  = document.getElementById('errorMsg');
    const statusMsg = document.getElementById('statusMsg');

    if (!input || input.length < 10) {
        errorMsg.classList.remove('active');
        statusMsg.classList.remove('active');
        renderDigits('');
        if (updateInterval) { clearInterval(updateInterval); updateInterval = null; }
        secretBytes = null;
        currentCode = '';
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
        secretBytes = null;
        currentCode = '';
    }
}

// ── Copy Code ──
function copyCode() {
    const btn = document.getElementById('copyKeyBtn');
    if (!currentCode) { flashBtn(btn, '⚠️ No code yet'); return; }
    writeToClipboard(currentCode, () => flashBtn(btn, '✓ Copied!'));
}

// ── Paste Key ──
async function pasteKey() {
    const btn = document.getElementById('pasteKeyBtn');
    try {
        const text = await navigator.clipboard.readText();
        document.getElementById('secretInput').value = text;
        startGenerator(text.trim());
        flashBtn(btn, '✓ Pasted!');
    } catch (e) {
        document.getElementById('secretInput').focus();
        const orig = btn.textContent;
        btn.textContent = '⌨️ Press Ctrl+V';
        setTimeout(() => btn.textContent = orig, 2000);
    }
}

// ── Clipboard helpers ──
function writeToClipboard(text, cb) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(cb).catch(() => fallback(text, cb));
    } else {
        fallback(text, cb);
    }
}
function fallback(text, cb) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;left:-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); cb(); } catch (e) {}
    document.body.removeChild(ta);
}

// ── Flash button feedback ──
function flashBtn(btn, msg) {
    const orig = btn.textContent;
    const origClass = btn.className;
    btn.textContent = msg;
    btn.classList.add('flash');
    setTimeout(() => { btn.textContent = orig; btn.className = origClass; }, 2000);
}

// ── Input listeners ──
const secretInput = document.getElementById('secretInput');
secretInput.addEventListener('input', e => startGenerator(e.target.value.trim()));
secretInput.addEventListener('paste', e => setTimeout(() => startGenerator(e.target.value.trim()), 100));

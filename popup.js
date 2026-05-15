let screenshotBase64 = null;

// ── On load: restore saved api key and model ──────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['groqApiKey', 'groqModel'], (data) => {
    if (data.groqApiKey) document.getElementById('api-key').value = data.groqApiKey;
    if (data.groqModel) document.getElementById('model').value = data.groqModel;
  });

  // Auto-save api key on change
  document.getElementById('api-key').addEventListener('change', () => {
    chrome.storage.local.set({ groqApiKey: document.getElementById('api-key').value.trim() });
  });

  // Auto-save model on change
  document.getElementById('model').addEventListener('change', () => {
    chrome.storage.local.set({ groqModel: document.getElementById('model').value });
  });
});

// ── Take screenshot of current tab ───────────────────────────────────────────
async function takeScreenshot() {
  const btn = document.getElementById('screenshot-btn');
  btn.innerHTML = '<span class="loader"></span><span>Capturando...</span>';
  btn.style.pointerEvents = 'none';

  try {
    // Get current active tab info for the label
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Capture the visible area
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });

    // Strip the "data:image/png;base64," prefix
    screenshotBase64 = dataUrl.split(',')[1];

    // Show preview
    document.getElementById('preview-img').src = dataUrl;
    document.getElementById('tab-title').textContent =
      tab.title ? tab.title.substring(0, 40) + (tab.title.length > 40 ? '…' : '') : tab.url;

    document.getElementById('screenshot-btn').style.display = 'none';
    document.getElementById('preview-wrap').style.display = 'block';

  } catch (err) {
    alert('Erro ao capturar a tela:\n' + err.message);
    console.error(err);
  }

  btn.innerHTML = '<span class="screenshot-icon">⬡</span><span>Tirar print da aba atual</span>';
  btn.style.pointerEvents = '';
}

// ── Clear screenshot ──────────────────────────────────────────────────────────
function clearScreenshot() {
  screenshotBase64 = null;
  document.getElementById('preview-img').src = '';
  document.getElementById('preview-wrap').style.display = 'none';
  document.getElementById('screenshot-btn').style.display = 'flex';
}

// ── Send to Groq API ──────────────────────────────────────────────────────────
async function sendRequest() {
  const apiKey = document.getElementById('api-key').value.trim();
  const model  = document.getElementById('model').value;
  const prompt = document.getElementById('prompt').value.trim();

  if (!apiKey)         { alert('Insira sua API Key do Groq.'); return; }
  if (!screenshotBase64) { alert('Tire o screenshot primeiro.'); return; }
  if (!prompt)         { alert('Escreva um prompt.'); return; }

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="loader"></span>Analisando...';

  const wrap = document.getElementById('response-wrap');
  wrap.style.display = 'block';
  document.getElementById('meta-row').style.display = 'none';
  document.getElementById('response-text').textContent = '';
  setStatus('loading', 'enviando...');

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${screenshotBase64}` }
            },
            { type: 'text', text: prompt }
          ]
        }],
        max_tokens: 1024
      })
    });

    const data = await res.json();

    if (!res.ok) {
      setStatus('error', 'erro ' + res.status);
      document.getElementById('response-text').textContent =
        '// ERRO:\n' + JSON.stringify(data.error || data, null, 2);
    } else {
      const content = data.choices?.[0]?.message?.content || '(sem resposta)';
      setStatus('', 'concluído');
      document.getElementById('response-text').textContent = content;

      const usage = data.usage || {};
      document.getElementById('tok-in').textContent  = usage.prompt_tokens ?? '—';
      document.getElementById('tok-out').textContent = usage.completion_tokens ?? '—';
      document.getElementById('meta-model').textContent = data.model ?? model;
      document.getElementById('meta-row').style.display = 'flex';
    }

  } catch (err) {
    setStatus('error', 'erro de rede');
    document.getElementById('response-text').textContent = '// ERRO DE REDE:\n' + err.message;
  }

  btn.disabled = false;
  btn.innerHTML = '▶ &nbsp;Analisar screenshot';
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function setStatus(type, text) {
  document.getElementById('status-dot').className = 'status-dot ' + type;
  document.getElementById('status-text').textContent = text;
}

function copyResponse() {
  const text = document.getElementById('response-text').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.querySelector('.copy-btn');
    btn.textContent = '[ copiado! ]';
    setTimeout(() => btn.textContent = '[ copiar ]', 2000);
  });
}

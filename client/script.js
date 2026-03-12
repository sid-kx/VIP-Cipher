const storageKeys = {
  messages: 'vipCipherMessages',
  codename: 'vipCipherCodename',
  sessionStart: 'vipCipherSessionStart',
  authenticated: 'vipCipherAuthenticated'
};

const elements = {
  board: document.getElementById('messageBoard'),
  form: document.getElementById('composerForm'),
  input: document.getElementById('messageInput'),
  charCount: document.getElementById('charCount'),
  template: document.getElementById('messageTemplate'),
  clearBtn: document.getElementById('clearBtn'),
  exportBtn: document.getElementById('exportBtn'),
  userAuthBtn: document.getElementById('userAuthBtn'),
  demoBtn: document.getElementById('demoBtn'),
  sendBtn: document.getElementById('sendBtn'),
  savedCount: document.getElementById('savedCount'),
  vipName: document.getElementById('vipName'),
  lockBtn: document.getElementById('lockBtn'),
  accessText: document.getElementById('accessText'),
  uptime: document.getElementById('uptime'),
  matrixCanvas: document.getElementById('matrixCanvas'),
  globeCanvas: document.getElementById('globeCanvas'),
  authModal: document.getElementById('authModal'),
  authModalBackdrop: document.getElementById('authModalBackdrop'),
  authCloseBtn: document.getElementById('authCloseBtn'),
  authCancelBtn: document.getElementById('authCancelBtn'),
  authForm: document.getElementById('authForm'),
  authEmail: document.getElementById('authEmail'),
  authPassword: document.getElementById('authPassword'),
  authCodename: document.getElementById('authCodename'),
  authCodenameWrap: document.getElementById('authCodenameWrap'),
  authStatus: document.getElementById('authStatus'),
  authSubmitBtn: document.getElementById('authSubmitBtn'),
  loginModeBtn: document.getElementById('loginModeBtn'),
  signupModeBtn: document.getElementById('signupModeBtn')
};

const API_BASE = 'http://127.0.0.1:3000';

const state = {
  messages: [],
  codename: 'Anonymous VIP',
  sessionStart: Date.now(),
  authenticated: false,
  targetCodename: '',
  socket: null,
  authMode: 'login'
};

const formatTime = (date) => new Intl.DateTimeFormat([], {
  hour: '2-digit',
  minute: '2-digit',
  month: 'short',
  day: '2-digit'
}).format(date);

const apiFetch = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    let message = 'Request failed';
    try {
      const data = await response.json();
      message = data.error || message;
    } catch {
      // ignore json parse failure
    }
    throw new Error(message);
  }

  return response;
};

const getTargetCodename = () => elements.vipName.value.trim().replace(/\s+/g, ' ');

const setAuthStatus = (message, type = '') => {
  elements.authStatus.textContent = message;
  elements.authStatus.classList.remove('error', 'success');
  if (type) elements.authStatus.classList.add(type);
};

const syncAuthModeUI = () => {
  const isSignup = state.authMode === 'signup';
  elements.loginModeBtn.classList.toggle('active', !isSignup);
  elements.signupModeBtn.classList.toggle('active', isSignup);
  elements.authCodenameWrap.classList.toggle('hidden', !isSignup);
  elements.authCodename.required = isSignup;
  elements.authPassword.autocomplete = isSignup ? 'new-password' : 'current-password';
  elements.authSubmitBtn.textContent = isSignup ? 'Create Identity' : 'Authenticate';
  setAuthStatus(
    isSignup
      ? 'Create a new operator account to unlock the terminal.'
      : 'Authenticate to unlock the terminal.'
  );
};

const openAuthModal = (mode = 'login') => {
  state.authMode = mode;
  elements.authModal.classList.remove('hidden');
  elements.authModal.setAttribute('aria-hidden', 'false');
  elements.authForm.reset();
  syncAuthModeUI();
  window.requestAnimationFrame(() => {
    elements.authEmail.focus();
  });
};

const closeAuthModal = () => {
  elements.authModal.classList.add('hidden');
  elements.authModal.setAttribute('aria-hidden', 'true');
  elements.authForm.reset();
  setAuthStatus('Authenticate to unlock the terminal.');
};

const hasMessageId = (id) => id != null && state.messages.some((message) => message.id === id);

const ensureSocketClient = async () => {
  if (window.io) return window.io;

  await new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-socket-client="true"]');
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', () => reject(new Error('Socket client failed to load')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = `${API_BASE}/socket.io/socket.io.js`;
    script.dataset.socketClient = 'true';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Socket client failed to load'));
    document.head.appendChild(script);
  });

  return window.io;
};

const disconnectRealtime = () => {
  if (!state.socket) return;
  state.socket.disconnect();
  state.socket = null;
};

const connectRealtime = async () => {
  if (!state.authenticated || !state.codename) return;
  if (state.socket) {
    state.socket.emit('join_codename', state.codename);
    return;
  }

  try {
    const ioClient = await ensureSocketClient();
    const socket = ioClient(API_BASE, {
      withCredentials: true,
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      socket.emit('join_codename', state.codename);
    });

    socket.on('message_received', (payload) => {
      const normalized = {
        id: payload.id,
        author: payload.senderCodename,
        body: payload.body,
        time: Date.parse(payload.createdAt) || Date.now()
      };

      addMessage(normalized, { preserveInput: true });
    });

    state.socket = socket;
  } catch (error) {
    console.error(error);
  }
};

const saveState = () => {
  localStorage.setItem(storageKeys.messages, JSON.stringify(state.messages));
  localStorage.setItem(storageKeys.codename, state.codename);
  localStorage.setItem(storageKeys.sessionStart, String(state.sessionStart));
  localStorage.setItem(storageKeys.authenticated, String(state.authenticated));
};

const loadState = () => {
  try {
    state.messages = JSON.parse(localStorage.getItem(storageKeys.messages) || '[]');
  } catch {
    state.messages = [];
  }
  state.codename = localStorage.getItem(storageKeys.codename) || 'Anonymous VIP';
  state.sessionStart = Number(localStorage.getItem(storageKeys.sessionStart)) || Date.now();
  state.authenticated = localStorage.getItem(storageKeys.authenticated) === 'true';
};

const syncAuthUI = () => {
  elements.input.disabled = !state.authenticated;
  elements.demoBtn.disabled = !state.authenticated;
  elements.sendBtn.disabled = !state.authenticated;
  elements.input.placeholder = state.authenticated
    ? 'Transmit an encrypted message...'
    : 'Authenticate user access to transmit encrypted messages...';
  elements.userAuthBtn.textContent = state.authenticated ? 'User Auth ✓' : 'User Auth';
};

const updateStats = () => {
  elements.savedCount.textContent = String(state.messages.length);
  elements.accessText.textContent = state.authenticated
    ? `VIP authentication active • ${state.codename}`
    : 'User authentication required';
  syncAuthUI();
};

const createMessageNode = ({ author, body, time }) => {
  const node = elements.template.content.firstElementChild.cloneNode(true);
  node.querySelector('.message-author').textContent = author;
  node.querySelector('.message-time').textContent = formatTime(new Date(time));

  const bodyEl = node.querySelector('.message-body');
  const imagePrefix = '[image attached] ';
  const isImageMessage = typeof body === 'string' && body.startsWith(imagePrefix);

  if (isImageMessage) {
    const imageUrl = body.slice(imagePrefix.length).trim();
    bodyEl.textContent = 'Image attachment';

    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = 'Injected attachment';
    img.style.display = 'block';
    img.style.maxWidth = '100%';
    img.style.marginTop = '12px';
    img.style.borderRadius = '12px';
    img.style.border = '1px solid rgba(103, 255, 143, 0.18)';

    bodyEl.appendChild(img);
  } else {
    bodyEl.textContent = body;
  }

  return node;
};

const renderMessages = () => {
  elements.board.querySelectorAll('.message-card').forEach((node) => node.remove());
  state.messages.forEach((message) => elements.board.appendChild(createMessageNode(message)));
  elements.board.scrollTop = elements.board.scrollHeight;
  updateStats();
};

const addMessage = (payload, options = {}) => {
  if (hasMessageId(payload.id)) return;

  state.messages.push(payload);
  saveState();
  elements.board.appendChild(createMessageNode(payload));
  elements.board.scrollTop = elements.board.scrollHeight;

  if (!options.preserveInput) {
    elements.input.value = '';
    updateCharCount();
  }

  updateStats();
};

const loadThreadHistory = async (targetCodename) => {
  if (!state.authenticated) {
    alert('Authenticate first.');
    return;
  }

  try {
    const response = await apiFetch(`/messages/thread/${encodeURIComponent(targetCodename)}`);
    const data = await response.json();

    state.messages = (data.messages || []).map((message) => ({
      id: message.id,
      author: message.senderCodename,
      body: message.body,
      time: Date.parse(message.createdAt) || Date.now()
    }));

    saveState();
    renderMessages();
    updateStats();
    await connectRealtime();
  } catch (error) {
    alert(error.message);
  }
};

const updateCharCount = () => {
  elements.charCount.textContent = `${elements.input.value.length} / 1200`;
};

const authorizeCodename = async () => {
  state.targetCodename = getTargetCodename();
  if (!state.targetCodename) {
    alert('Enter the recipient codename first.');
    elements.vipName.focus();
    return;
  }

  await loadThreadHistory(state.targetCodename);
  elements.input.focus();
};

const toggleUserAuth = async () => {
  if (state.authenticated) {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch (error) {
      alert(error.message);
      return;
    }

    state.authenticated = false;
    state.codename = 'Anonymous VIP';
    disconnectRealtime();
    saveState();
    updateStats();
    return;
  }

  openAuthModal('login');
};
const submitAuthForm = async (event) => {
  event.preventDefault();

  const email = elements.authEmail.value.trim();
  const password = elements.authPassword.value;
  const codename = elements.authCodename.value.trim();
  const isSignup = state.authMode === 'signup';

  if (!email || !password) {
    setAuthStatus('Email and password are required.', 'error');
    return;
  }

  if (isSignup && !codename) {
    setAuthStatus('Codename is required for sign up.', 'error');
    return;
  }

  const body = { email, password };
  if (isSignup) body.codename = codename;

  elements.authSubmitBtn.disabled = true;
  setAuthStatus(isSignup ? 'Creating secure identity...' : 'Authenticating secure identity...');

  try {
    const response = await apiFetch(`/auth/${isSignup ? 'signup' : 'login'}`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
    const data = await response.json();
    state.authenticated = true;
    state.codename = data.user.codename;
    await connectRealtime();
    saveState();
    updateStats();
    setAuthStatus(isSignup ? 'Identity created. Terminal unlocked.' : 'Authentication successful. Terminal unlocked.', 'success');
    closeAuthModal();
    elements.input.focus();
  } catch (error) {
    setAuthStatus(error.message, 'error');
  } finally {
    elements.authSubmitBtn.disabled = false;
  }
};

const exportLogs = async () => {
  const targetCodename = getTargetCodename();
  if (!state.authenticated) {
    alert('Authenticate first.');
    return;
  }
  if (!targetCodename) {
    alert('Enter the recipient codename first.');
    return;
  }

  try {
    const response = await apiFetch(`/export/${encodeURIComponent(targetCodename)}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${targetCodename}-logs.txt`;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    alert(error.message);
  }
};

const injectDemo = async () => {
  if (!state.authenticated) {
    alert('Authenticate first.');
    return;
  }

  const targetCodename = getTargetCodename();
  if (!targetCodename) {
    alert('Enter the recipient codename first.');
    return;
  }

  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'image/*';

  picker.addEventListener('change', async () => {
    const file = picker.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('image', file);

    try {
      const uploadResponse = await apiFetch('/upload/image', {
        method: 'POST',
        body: formData
      });
      const uploadData = await uploadResponse.json();

      const sendResponse = await apiFetch('/messages/send', {
        method: 'POST',
        body: JSON.stringify({
          targetCodename,
          body: `[image attached] ${uploadData.fileUrl}`
        })
      });
      await sendResponse.json();
    } catch (error) {
      alert(error.message);
    }
  });

  picker.click();
};

const purgeMessages = async () => {
  state.messages = [];

  if (state.authenticated) {
    try {
      await apiFetch('/auth/logout', { method: 'POST' });
    } catch (error) {
      alert(error.message);
      return;
    }
  }

  state.authenticated = false;
  state.codename = 'Anonymous VIP';
  disconnectRealtime();
  saveState();
  renderMessages();
};

const tickUptime = () => {
  const elapsed = Math.max(0, Date.now() - state.sessionStart);
  const hours = String(Math.floor(elapsed / 3600000)).padStart(2, '0');
  const minutes = String(Math.floor((elapsed % 3600000) / 60000)).padStart(2, '0');
  const seconds = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, '0');
  elements.uptime.textContent = `${hours}:${minutes}:${seconds}`;
};

const bindEvents = () => {
  elements.form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!state.authenticated) {
      alert('Authenticate first.');
      return;
    }

    const targetCodename = getTargetCodename();
    const body = elements.input.value.trim();

    if (!targetCodename) {
      alert('Enter the recipient codename first.');
      elements.vipName.focus();
      return;
    }

    if (!body) return;

    try {
      const response = await apiFetch('/messages/send', {
        method: 'POST',
        body: JSON.stringify({ targetCodename, body })
      });
      await response.json();
    } catch (error) {
      alert(error.message);
    }
  });

  elements.input.addEventListener('input', updateCharCount);
  elements.clearBtn.addEventListener('click', purgeMessages);
  elements.exportBtn.addEventListener('click', exportLogs);
  elements.userAuthBtn.addEventListener('click', toggleUserAuth);
  elements.demoBtn.addEventListener('click', injectDemo);
  elements.lockBtn.addEventListener('click', authorizeCodename);
  elements.vipName.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      authorizeCodename();
    }
  });

  elements.loginModeBtn.addEventListener('click', () => {
    state.authMode = 'login';
    syncAuthModeUI();
  });

  elements.signupModeBtn.addEventListener('click', () => {
    state.authMode = 'signup';
    syncAuthModeUI();
  });

  elements.authForm.addEventListener('submit', submitAuthForm);
  elements.authCloseBtn.addEventListener('click', closeAuthModal);
  elements.authCancelBtn.addEventListener('click', closeAuthModal);
  elements.authModalBackdrop.addEventListener('click', closeAuthModal);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !elements.authModal.classList.contains('hidden')) {
      closeAuthModal();
    }
  });
};

const initMatrix = () => {
  const canvas = elements.matrixCanvas;
  const ctx = canvas.getContext('2d');
  const chars = '01VIPSECUREACCESSNODEΔΣ#';
  let columns = [];
  let fontSize = 16;

  const resize = () => {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    columns = Array.from({ length: Math.ceil(window.innerWidth / fontSize) }, () => Math.random() * -50);
  };

  const draw = () => {
    ctx.fillStyle = 'rgba(1, 5, 2, 0.08)';
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    ctx.fillStyle = 'rgba(103,255,143,0.28)';
    ctx.font = `${fontSize}px "Share Tech Mono"`;

    columns.forEach((y, index) => {
      const text = chars[Math.floor(Math.random() * chars.length)];
      const x = index * fontSize;
      ctx.fillText(text, x, y * fontSize);
      columns[index] = y * fontSize > window.innerHeight + Math.random() * 500 ? Math.random() * -25 : y + 1;
    });

    requestAnimationFrame(draw);
  };

  resize();
  window.addEventListener('resize', resize);
  draw();
};

const initGlobe = () => {
  const canvas = elements.globeCanvas;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = 145;

  const dots = Array.from({ length: 240 }, () => {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    return { theta, phi };
  });

  const continents = [
    [
      [-0.65, 0.1], [-0.48, -0.16], [-0.25, -0.2], [-0.12, -0.04], [-0.2, 0.16], [-0.38, 0.2]
    ],
    [
      [0.08, -0.14], [0.23, -0.27], [0.46, -0.18], [0.5, 0.05], [0.34, 0.2], [0.16, 0.11]
    ],
    [
      [0.6, -0.36], [0.72, -0.32], [0.8, -0.16], [0.68, -0.08], [0.55, -0.18]
    ]
  ];

  const project = (lon, lat, spin) => {
    const lambda = lon + spin;
    const x = Math.cos(lat) * Math.cos(lambda);
    const y = Math.sin(lat);
    const z = Math.cos(lat) * Math.sin(lambda);
    return {
      x: cx + x * r,
      y: cy + y * r,
      z
    };
  };

  const drawFrame = (time) => {
    const spin = time * 0.00045;
    ctx.clearRect(0, 0, w, h);

    const glow = ctx.createRadialGradient(cx - 35, cy - 40, 10, cx, cy, r + 55);
    glow.addColorStop(0, 'rgba(103,255,143,0.16)');
    glow.addColorStop(1, 'rgba(103,255,143,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 55, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(103,255,143,0.34)';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    for (let lat = -60; lat <= 60; lat += 20) {
      ctx.beginPath();
      for (let lon = -180; lon <= 180; lon += 4) {
        const p = project((lon * Math.PI) / 180, (lat * Math.PI) / 180, spin);
        if (lon === -180) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = 'rgba(103,255,143,0.12)';
      ctx.stroke();
    }

    for (let lon = -150; lon <= 180; lon += 30) {
      ctx.beginPath();
      for (let lat = -90; lat <= 90; lat += 4) {
        const p = project((lon * Math.PI) / 180, (lat * Math.PI) / 180, spin);
        if (lat === -90) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = 'rgba(103,255,143,0.10)';
      ctx.stroke();
    }

    continents.forEach((shape) => {
      ctx.beginPath();
      shape.forEach(([lon, lat], index) => {
        const p = project(lon * Math.PI, lat * Math.PI, spin);
        if (index === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fillStyle = 'rgba(25, 226, 106, 0.16)';
      ctx.strokeStyle = 'rgba(103,255,143,0.26)';
      ctx.fill();
      ctx.stroke();
    });

    dots
      .map((dot) => {
        const p = project(dot.theta, dot.phi - Math.PI / 2, spin);
        return p;
      })
      .sort((a, b) => a.z - b.z)
      .forEach((p) => {
        const alpha = ((p.z + 1) / 2) * 0.9;
        const size = 1.2 + ((p.z + 1) / 2) * 2.4;
        ctx.fillStyle = `rgba(103,255,143,${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
        ctx.fill();
      });

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(186,255,209,0.2)';
    ctx.lineWidth = 2.4;
    ctx.stroke();

    requestAnimationFrame(drawFrame);
  };

  requestAnimationFrame(drawFrame);
};

const hydrateSession = async () => {
  try {
    const response = await apiFetch('/auth/me');
    const data = await response.json();

    if (data.user) {
      state.authenticated = true;
      state.codename = data.user.codename;
      await connectRealtime();
    } else {
      state.authenticated = false;
      state.codename = 'Anonymous VIP';
      disconnectRealtime();
    }
  } catch {
    state.authenticated = false;
    state.codename = 'Anonymous VIP';
    disconnectRealtime();
  }
};

const init = async () => {
  loadState();
  await hydrateSession();
  renderMessages();
  updateCharCount();
  bindEvents();
  syncAuthModeUI();
  updateStats();
  setInterval(tickUptime, 1000);
  tickUptime();
  initMatrix();
  initGlobe();
};

init();

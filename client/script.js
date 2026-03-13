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

const supabaseConfig = window.VIP_CIPHER_CONFIG || {};
const supabaseGlobal = window.supabase;
let supabase = null;

const state = {
  messages: [],
  codename: 'Anonymous VIP',
  sessionStart: Date.now(),
  authenticated: false,
  targetCodename: '',
  authMode: 'login',
  userId: null,
  activeThreadId: null,
  realtimeChannel: null,
  profileCache: new Map()
};

const formatTime = (date) => new Intl.DateTimeFormat([], {
  hour: '2-digit',
  minute: '2-digit',
  month: 'short',
  day: '2-digit'
}).format(date);

const requireSupabase = () => {
  if (supabase) return supabase;

  if (!supabaseGlobal?.createClient) {
    throw new Error('Supabase client script is missing in index.html');
  }

  if (!supabaseConfig.supabaseUrl || !supabaseConfig.supabaseAnonKey) {
    throw new Error('Supabase URL or anon key is missing in index.html');
  }

  supabase = supabaseGlobal.createClient(
    supabaseConfig.supabaseUrl,
    supabaseConfig.supabaseAnonKey
  );

  return supabase;
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

const hasMessageId = (id) => id != null && state.messages.some((message) => message.id === id);

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

const updateCharCount = () => {
  elements.charCount.textContent = `${elements.input.value.length} / 1200`;
};

const escapeFilterValue = (value) => String(value).replace(/,/g, '\\,');

const getProfileByCodename = async (codename) => {
  const client = requireSupabase();
  const { data, error } = await client
    .from('profiles')
    .select('id, codename')
    .eq('codename', codename)
    .maybeSingle();

  if (error) throw error;
  return data;
};

const getProfileCodename = async (userId) => {
  if (state.profileCache.has(userId)) {
    return state.profileCache.get(userId);
  }

  const client = requireSupabase();
  const { data, error } = await client
    .from('profiles')
    .select('codename')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  const codename = data?.codename || 'Unknown Operator';
  state.profileCache.set(userId, codename);
  return codename;
};

const getOrCreateThread = async (targetCodename, { createIfMissing = false } = {}) => {
  const client = requireSupabase();
  const targetProfile = await getProfileByCodename(targetCodename);

  if (!targetProfile) {
    throw new Error('Target codename not found');
  }

  if (targetProfile.id === state.userId) {
    throw new Error('You cannot send packets to your own codename');
  }

  const threadFilter = `and(user_one.eq.${escapeFilterValue(state.userId)},user_two.eq.${escapeFilterValue(targetProfile.id)}),and(user_one.eq.${escapeFilterValue(targetProfile.id)},user_two.eq.${escapeFilterValue(state.userId)})`;

  const { data: existingThread, error: threadError } = await client
    .from('threads')
    .select('id, user_one, user_two')
    .or(threadFilter)
    .maybeSingle();

  if (threadError) throw threadError;
  if (existingThread) {
    return { thread: existingThread, targetProfile };
  }

  if (!createIfMissing) {
    return { thread: null, targetProfile };
  }

  const { data: createdThread, error: createError } = await client
    .from('threads')
    .insert({
      user_one: state.userId,
      user_two: targetProfile.id
    })
    .select('id, user_one, user_two')
    .single();

  if (createError) throw createError;
  return { thread: createdThread, targetProfile };
};

const normalizeMessageRow = async (row) => ({
  id: row.id,
  author: await getProfileCodename(row.sender_id),
  body: row.body,
  time: Date.parse(row.created_at) || Date.now()
});

const disconnectRealtime = async () => {
  if (!state.realtimeChannel) return;
  const client = requireSupabase();
  await client.removeChannel(state.realtimeChannel);
  state.realtimeChannel = null;
};

const connectRealtime = async () => {
  const client = requireSupabase();

  if (!state.authenticated || !state.activeThreadId) {
    await disconnectRealtime();
    return;
  }

  if (state.realtimeChannel?.topic === `vip-thread-${state.activeThreadId}`) {
    return;
  }

  await disconnectRealtime();

  const channel = client
    .channel(`vip-thread-${state.activeThreadId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `thread_id=eq.${state.activeThreadId}`
      },
      async (payload) => {
        try {
          const normalized = await normalizeMessageRow(payload.new);
          addMessage(normalized, { preserveInput: true });
        } catch (error) {
          console.error(error);
        }
      }
    )
    .subscribe();

  state.realtimeChannel = channel;
};

const loadThreadHistory = async (targetCodename) => {
  if (!state.authenticated) {
    alert('Authenticate first.');
    return;
  }

  try {
    const { thread, targetProfile } = await getOrCreateThread(targetCodename, { createIfMissing: false });
    state.targetCodename = targetProfile.codename;

    if (!thread) {
      state.activeThreadId = null;
      state.messages = [];
      saveState();
      renderMessages();
      await disconnectRealtime();
      return;
    }

    state.activeThreadId = thread.id;

    const client = requireSupabase();
    const { data, error } = await client
      .from('messages')
      .select('id, thread_id, sender_id, body, created_at')
      .eq('thread_id', thread.id)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });

    if (error) throw error;

    state.messages = [];
    for (const row of data || []) {
      state.messages.push(await normalizeMessageRow(row));
    }

    saveState();
    renderMessages();
    await connectRealtime();
  } catch (error) {
    alert(error.message || 'Failed to load thread history');
  }
};

const authorizeCodename = async () => {
  const targetCodename = getTargetCodename();
  if (!targetCodename) {
    alert('Enter the recipient codename first.');
    elements.vipName.focus();
    return;
  }

  await loadThreadHistory(targetCodename);
  elements.input.focus();
};

const toggleUserAuth = async () => {
  if (state.authenticated) {
    try {
      const client = requireSupabase();
      const { error } = await client.auth.signOut();
      if (error) throw error;
    } catch (error) {
      alert(error.message);
      return;
    }

    state.authenticated = false;
    state.codename = 'Anonymous VIP';
    state.userId = null;
    state.activeThreadId = null;
    state.messages = [];
    await disconnectRealtime();
    saveState();
    renderMessages();
    return;
  }

  openAuthModal('login');
};

const ensureProtonEmail = (email) => email.toLowerCase().endsWith('@proton.me');

const submitAuthForm = async (event) => {
  event.preventDefault();

  const client = requireSupabase();
  const email = elements.authEmail.value.trim().toLowerCase();
  const password = elements.authPassword.value;
  const codename = elements.authCodename.value.trim();
  const isSignup = state.authMode === 'signup';

  if (!email || !password) {
    setAuthStatus('Email and password are required.', 'error');
    return;
  }

  if (!ensureProtonEmail(email)) {
    setAuthStatus('Only @proton.me addresses are allowed.', 'error');
    return;
  }

  if (isSignup && !codename) {
    setAuthStatus('Codename is required for sign up.', 'error');
    return;
  }

  elements.authSubmitBtn.disabled = true;
  setAuthStatus(isSignup ? 'Creating secure identity...' : 'Authenticating secure identity...');

  try {
    let authUser = null;

    if (isSignup) {
      const { data, error } = await client.auth.signUp({ email, password });
      if (error) throw error;
      authUser = data.user;

      if (!authUser) {
        throw new Error('Sign up did not return a user');
      }

      const { error: profileError } = await client
        .from('profiles')
        .upsert({ id: authUser.id, codename }, { onConflict: 'id' });

      if (profileError) throw profileError;

      if (!data.session) {
        setAuthStatus('Account created. Check your inbox to confirm your email before logging in.', 'success');
        return;
      }
    } else {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      authUser = data.user;
    }

    const sessionResult = await client.auth.getSession();
    const sessionUser = sessionResult.data.session?.user || authUser;

    if (!sessionUser) {
      throw new Error('No active session found after authentication');
    }

    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('codename')
      .eq('id', sessionUser.id)
      .single();

    if (profileError) throw profileError;

    state.authenticated = true;
    state.codename = profile.codename;
    state.userId = sessionUser.id;
    state.profileCache.set(sessionUser.id, profile.codename);
    saveState();
    updateStats();
    setAuthStatus(isSignup ? 'Identity created. Terminal unlocked.' : 'Authentication successful. Terminal unlocked.', 'success');
    closeAuthModal();
    elements.input.focus();
  } catch (error) {
    setAuthStatus(error.message || 'Authentication failed', 'error');
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

  const lines = state.messages.map((message) => (
    `[${new Date(message.time).toISOString()}] ${message.author}: ${message.body}`
  ));

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${targetCodename}-logs.txt`;
  link.click();
  URL.revokeObjectURL(url);
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

    try {
      const { thread } = await getOrCreateThread(targetCodename, { createIfMissing: true });
      state.activeThreadId = thread.id;
      await connectRealtime();

      const client = requireSupabase();
      const filePath = `${state.userId}/${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
      const { error: uploadError } = await client
        .storage
        .from('packet-uploads')
        .upload(filePath, file, { upsert: false });

      if (uploadError) throw uploadError;

      const { data: publicData } = client
        .storage
        .from('packet-uploads')
        .getPublicUrl(filePath);

      const { data: inserted, error: insertError } = await client
        .from('messages')
        .insert({
          thread_id: thread.id,
          sender_id: state.userId,
          body: `[image attached] ${publicData.publicUrl}`
        })
        .select('id, thread_id, sender_id, body, created_at')
        .single();

      if (insertError) throw insertError;
      addMessage(await normalizeMessageRow(inserted));
    } catch (error) {
      alert(error.message || 'Image upload failed');
    }
  });

  picker.click();
};

const purgeMessages = async () => {
  state.messages = [];

  if (state.authenticated) {
    try {
      const client = requireSupabase();
      const { error } = await client.auth.signOut();
      if (error) throw error;
    } catch (error) {
      alert(error.message);
      return;
    }
  }

  state.authenticated = false;
  state.codename = 'Anonymous VIP';
  state.userId = null;
  state.activeThreadId = null;
  await disconnectRealtime();
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
      const client = requireSupabase();
      const { thread } = await getOrCreateThread(targetCodename, { createIfMissing: true });
      state.activeThreadId = thread.id;
      await connectRealtime();

      const { data: inserted, error } = await client
        .from('messages')
        .insert({
          thread_id: thread.id,
          sender_id: state.userId,
          body
        })
        .select('id, thread_id, sender_id, body, created_at')
        .single();

      if (error) throw error;
      addMessage(await normalizeMessageRow(inserted));
    } catch (error) {
      alert(error.message || 'Packet failed');
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
    const client = requireSupabase();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;

    const user = data.session?.user;
    if (!user) {
      state.authenticated = false;
      state.codename = 'Anonymous VIP';
      state.userId = null;
      await disconnectRealtime();
      return;
    }

    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('codename')
      .eq('id', user.id)
      .single();

    if (profileError) throw profileError;

    state.authenticated = true;
    state.codename = profile.codename;
    state.userId = user.id;
    state.profileCache.set(user.id, profile.codename);
  } catch (error) {
    console.error(error);
    state.authenticated = false;
    state.codename = 'Anonymous VIP';
    state.userId = null;
    await disconnectRealtime();
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

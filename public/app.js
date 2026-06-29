// ===== CONFIG & GLOBALS =====
const socket = io({
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

let currentUser = null, currentUsername = null;
let activeChat = null, activeTab = 'chats';
let searchResultUser = null, searchedGroupData = null;
let mediaRecorder = null, audioChunks = [];
let replyingTo = null;
let contextMenuTarget = null;
let myRoleInGroup = null;

// ===== SETTINGS =====
let soundEnabled = true;
let pushNotificationsEnabled = false;
let isDarkMode = true;

// Audio Context for notification sound
let audioCtx = null;
const NOTIFICATION_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3';

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function playNotificationSound() {
  if (!soundEnabled) return;
  try {
    initAudio();
    const audio = new Audio(NOTIFICATION_SOUND_URL);
    audio.volume = 0.3;
    audio.play().catch(() => {});
  } catch (e) {
    console.log('Sound play failed:', e);
  }
}

// ===== PUSH NOTIFICATIONS =====
async function requestPushNotification() {
  if (!('Notification' in window)) {
    alert('متصفحك لا يدعم الإشعارات');
    return false;
  }
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') {
    alert('تم رفض الإشعارات مسبقاً. يرجى تفعيلها من إعدادات المتصفح.');
    return false;
  }
  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

function showPushNotification(title, body, icon) {
  if (!pushNotificationsEnabled || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(title, {
      body: body,
      icon: icon,
      badge: icon,
      tag: 'chat-message',
      requireInteraction: false
    });
  }
}

function togglePushNotifications() {
  const btn = document.getElementById('notifToggleBtn');
  if (!pushNotificationsEnabled) {
    requestPushNotification().then(granted => {
      if (granted) {
        pushNotificationsEnabled = true;
        btn.textContent = '🔔 الإشعارات مفعلة';
        btn.classList.remove('disabled');
        showNotification('✅ تم تفعيل إشعارات المتصفح');
      } else {
        btn.textContent = '🔕 الإشعارات معطلة';
        btn.classList.add('disabled');
      }
    });
  } else {
    pushNotificationsEnabled = false;
    btn.textContent = '🔔 تفعيل الإشعارات';
    btn.classList.add('disabled');
    showNotification('🔕 تم تعطيل إشعارات المتصفح');
  }
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  const btn = document.getElementById('soundToggleBtn');
  if (soundEnabled) {
    btn.textContent = '🔊 الصوت مفعل';
    btn.classList.remove('muted');
    showNotification('🔊 تم تفعيل صوت الإشعارات');
  } else {
    btn.textContent = '🔇 الصوت معطل';
    btn.classList.add('muted');
    showNotification('🔇 تم تعطيل صوت الإشعارات');
  }
}

// ===== THEME TOGGLE =====
function toggleTheme() {
  isDarkMode = !isDarkMode;
  document.body.classList.toggle('light-mode', !isDarkMode);
  const btn = document.getElementById('themeToggle');
  btn.textContent = isDarkMode ? '🌙' : '☀️';
  btn.title = isDarkMode ? 'تبديل للوضع الفاتح' : 'تبديل للوضع الداكن';
  localStorage.setItem('chatTheme', isDarkMode ? 'dark' : 'light');
  showNotification(isDarkMode ? '🌙 الوضع الداكن' : '☀️ الوضع الفاتح');
}

function loadTheme() {
  const savedTheme = localStorage.getItem('chatTheme');
  if (savedTheme === 'light') {
    isDarkMode = false;
    document.body.classList.add('light-mode');
    const btn = document.getElementById('themeToggle');
    if (btn) {
      btn.textContent = '☀️';
      btn.title = 'تبديل للوضع الداكن';
    }
  }
}

// ===== IMAGE PREVIEW =====
function openImagePreview(src) {
  const modal = document.getElementById('imagePreviewModal');
  const img = document.getElementById('imagePreviewImg');
  if (modal && img) {
    img.src = src;
    modal.classList.add('active');
  }
}

function closeImagePreview() {
  const modal = document.getElementById('imagePreviewModal');
  if (modal) modal.classList.remove('active');
}

// ===== TYPING INDICATOR =====
let typingTimeout = null;

function showTypingIndicator() {
  const indicator = document.getElementById('typingIndicator');
  if (indicator) indicator.style.display = 'block';
}

function hideTypingIndicator() {
  const indicator = document.getElementById('typingIndicator');
  if (indicator) indicator.style.display = 'none';
}

function emitTyping() {
  if (!activeChat || !currentUser) return;
  socket.emit('typing', {
    chatId: activeChat.id,
    chatType: activeChat.type,
    userId: currentUser.id,
    userName: currentUser.name
  });
}

function handleTypingInput() {
  if (typingTimeout) clearTimeout(typingTimeout);
  emitTyping();
  typingTimeout = setTimeout(() => {
    // Stop typing after 2 seconds of inactivity
  }, 2000);
}

// ===== UTILITY FUNCTIONS =====
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function showNotification(text) {
  const notif = document.getElementById('notification');
  const notifText = document.getElementById('notifText');
  if (!notif || !notifText) return;

  notifText.textContent = text;
  notif.classList.add('active');

  if (notif._timeout) clearTimeout(notif._timeout);

  notif._timeout = setTimeout(() => {
    notif.classList.remove('active');
  }, 3000);
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

function previewImage(fileInput, previewId) {
  const file = fileInput.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const preview = document.getElementById(previewId);
      if (preview) preview.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }
}

function triggerAttachment() {
  const input = document.getElementById('mediaAttachment');
  if (input) input.click();
}

// ===== SOCKET EVENTS =====
socket.on('connect', () => {
  console.log('Connected to server');
  if (currentUser) socket.emit('join', currentUser.id);
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});

socket.on('connect_error', (err) => {
  console.error('Connection error:', err.message);
});

socket.on('receive-message', (data) => {
  if (activeChat && activeChat.id === data.toId && activeChat.type === data.type) {
    const direction = (data.fromId === currentUser.id) ? 'sent' : 'received';
    appendMessage(data.fromName, data.message, direction, data.fileType, data.id, data.status, data.replyTo);
    if (direction === 'received') {
      socket.emit('mark-as-seen', { readerId: currentUser.id, targetId: data.fromId, type: data.type });
    }
  } else {
    if (data.fromId !== currentUser.id) {
      showNotification(`📩 رسالة جديدة من ${data.fromName}`);
      playNotificationSound();
      showPushNotification(
        `رسالة جديدة من ${data.fromName}`,
        data.fileType === 'text' ? data.message.substring(0, 100) : 'أرسل لك ملفاً',
        data.avatar || 'https://cdn-icons-png.flaticon.com/512/149/149071.png'
      );
    }
  }
});

socket.on('message-status-updated', (data) => {
  const statusElem = document.getElementById(`status-${data.msgId}`);
  if (statusElem) {
    statusElem.className = `msg-status ${data.status}`;
    if (data.status === 'sent') statusElem.textContent = '✓';
    else if (data.status === 'delivered') statusElem.textContent = '✓✓';
    else if (data.status === 'seen') statusElem.textContent = '✓✓';
  }
});

socket.on('message-deleted', (data) => {
  const msgEl = document.getElementById(`msg-container-${data.msgId}`);
  if (msgEl) msgEl.remove();
});

socket.on('group-updated', (data) => {
  if (activeChat && activeChat.type === 'group' && activeChat.id === data.groupId) {
    if (data.kickedId === currentUser.id) {
      alert('❌ لقد غادرت أو تم طردك من هذه المجموعة.');
      closeChatPage();
      loadChats();
    } else {
      const nameEl = document.getElementById('activeChatName');
      const avatarEl = document.getElementById('activeChatAvatar');
      if (nameEl && data.name) nameEl.textContent = data.name;
      if (avatarEl && data.avatar) avatarEl.src = data.avatar;
    }
  } else if (activeTab === 'groups') {
    loadChats();
  }
});

socket.on('user-typing', (data) => {
  if (activeChat && activeChat.id === data.chatId && data.userId !== currentUser.id) {
    showTypingIndicator();
    setTimeout(hideTypingIndicator, 3000);
  }
});

// ===== AUTH FUNCTIONS =====
async function login() {
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value;
  if (!username || !password) return alert('يرجى ملء جميع الحقول');
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      currentUsername = data.username;
      localStorage.setItem('chatUser', JSON.stringify(data.user));
      localStorage.setItem('chatUsername', data.username);
      showApp();
    } else {
      alert(data.error);
    }
  } catch (err) {
    alert('خطأ في الاتصال بالسيرفر: ' + err.message);
  }
}

async function register() {
  const username = document.getElementById('regUsername').value.trim();
  const name = document.getElementById('regName').value.trim();
  const pass = document.getElementById('regPass').value;
  const pass2 = document.getElementById('regPass2').value;

  if (!username || !name || !pass) return alert('يرجى ملء جميع الحقول');
  if (pass !== pass2) return alert('كلمة المرور غير متطابقة');
  if (pass.length < 6) return alert('كلمة المرور يجب أن تكون 6 أحرف على الأقل');

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: pass, name })
    });
    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      currentUsername = username;
      localStorage.setItem('chatUser', JSON.stringify(data.user));
      localStorage.setItem('chatUsername', username);
      showApp();
    } else {
      alert(data.error);
    }
  } catch (err) {
    alert('خطأ في الاتصال بالسيرفر: ' + err.message);
  }
}

function showRegister() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('registerScreen').style.display = 'flex';
}

function showLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('registerScreen').style.display = 'none';
}

function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('registerScreen').style.display = 'none';
  document.getElementById('app').classList.add('active');
  document.getElementById('sidebarName').textContent = currentUser.name;
  document.getElementById('sidebarId').textContent = 'ID: ' + currentUser.id;
  document.getElementById('sidebarAvatar').src = currentUser.avatar;
  socket.emit('join', currentUser.id);
  loadTheme();
  loadChats();
}

function logout() {
  if (socket.connected) socket.disconnect();
  localStorage.removeItem('chatUser');
  localStorage.removeItem('chatUsername');
  location.reload();
}

// ===== TAB SWITCHING =====
function switchTab(tab) {
  activeTab = tab;
  document.getElementById('tab-chats').classList.remove('active');
  document.getElementById('tab-groups').classList.remove('active');
  document.getElementById(`tab-${tab}`).classList.add('active');
  const pBtn = document.getElementById('primarySidebarBtn');
  const sBtn = document.getElementById('secondarySidebarBtn');
  if (tab === 'chats') {
    pBtn.textContent = '➕ صديق';
    pBtn.setAttribute('onclick', "openModal('addFriendModal')");
    sBtn.style.display = 'none';
  } else {
    pBtn.textContent = '🔍 بحث جروب';
    pBtn.setAttribute('onclick', "openModal('searchGroupModal')");
    sBtn.style.display = 'block';
    sBtn.textContent = '👥 جروب';
  }
  loadChats();
}

// ===== LOAD CHATS =====
async function loadChats() {
  const list = document.getElementById('chatList');
  list.innerHTML = '<div class="loading">جاري التحميل...</div>';

  if (activeTab === 'chats') {
    if (currentUser.friends && currentUser.friends.length > 0) {
      let html = '';
      for (const fId of currentUser.friends) {
        try {
          const r = await fetch('/api/user/' + encodeURIComponent(fId));
          const d = await r.json();
          if (d.success) {
            html += `<div class="chat-item" onclick="openPrivateChat('${d.user.id}', '${escapeHtml(d.user.name)}', '${d.user.avatar}')">
              <img src="${d.user.avatar}" class="chat-avatar" onerror="this.src='https://cdn-icons-png.flaticon.com/512/149/149071.png'">
              <div class="chat-info"><div class="chat-name">${escapeHtml(d.user.name)}</div><div class="chat-preview">انقر لفتح المحادثة</div></div>
            </div>`;
          }
        } catch (err) {
          console.error('Error loading friend:', err);
        }
      }
      list.innerHTML = html || '<div style="padding:20px;text-align:center;color:#666;">لا يوجد أصدقاء بعد.</div>';
    } else {
      list.innerHTML = '<div style="padding:20px;text-align:center;color:#666;">لا يوجد أصدقاء بعد.</div>';
    }
  } else {
    try {
      const r = await fetch('/api/user-groups/' + currentUser.id);
      const d = await r.json();
      if (d.success && d.groups.length > 0) {
        let html = '';
        d.groups.forEach(g => {
          html += `<div class="chat-item" onclick="openGroupChat('${g.id}')">
            <img src="${g.avatar}" class="chat-avatar" onerror="this.src='https://cdn-icons-png.flaticon.com/512/32/32441.png'">
            <div class="chat-info"><div class="chat-name">${escapeHtml(g.name)}</div><div class="chat-preview">ID: ${g.id} - ${escapeHtml(g.description)}</div></div>
          </div>`;
        });
        list.innerHTML = html;
      } else {
        list.innerHTML = '<div style="padding:20px;text-align:center;color:#666;">لم تشترك في أي جروب بعد.</div>';
      }
    } catch (err) {
      console.error('Error loading groups:', err);
      list.innerHTML = '<div style="padding:20px;text-align:center;color:#666;">خطأ في تحميل الجروبات.</div>';
    }
  }
}

// ===== CHAT FUNCTIONS =====
async function openPrivateChat(id, name, avatar) {
  activeChat = { id, type: 'private', name, avatar, toId: id };
  document.getElementById('groupSettingsBtn').style.display = 'none';
  setupChatWindow(name, `المعرف: ${id}`, avatar);
  socket.emit('mark-as-seen', { readerId: currentUser.id, targetId: id, type: 'private' });
  try {
    const res = await fetch(`/api/messages?fromId=${currentUser.id}&toId=${id}&type=private`);
    const data = await res.json();
    if (data.success) {
      data.history.forEach(msg => {
        const direction = (msg.fromId === currentUser.id) ? 'sent' : 'received';
        appendMessage(msg.fromName, msg.message, direction, msg.fileType, msg.id, msg.status, msg.replyTo);
      });
    }
  } catch (err) {
    console.error('Error loading messages:', err);
  }
}

async function openGroupChat(groupId) {
  try {
    const r = await fetch('/api/user-groups/' + currentUser.id);
    const d = await r.json();
    if (!d.success) return;
    const group = d.groups.find(g => g.id === groupId);
    if (!group) return;
    activeChat = { id: groupId, type: 'group', group, toId: groupId };
    document.getElementById('groupSettingsBtn').style.display = 'block';
    setupChatWindow(group.name, `ID المجموعة: ${group.id}`, group.avatar);

    const roleRes = await fetch(`/api/groups/my-role/${groupId}?userId=${currentUser.id}`);
    const roleData = await roleRes.json();
    if (roleData.success) myRoleInGroup = roleData.role;

    const res = await fetch(`/api/messages?fromId=${currentUser.id}&toId=${groupId}&type=group`);
    const data = await res.json();
    if (data.success) {
      data.history.forEach(msg => {
        const direction = (msg.fromId === currentUser.id) ? 'sent' : 'received';
        appendMessage(msg.fromName, msg.message, direction, msg.fileType, msg.id, msg.status, msg.replyTo);
      });
    }
  } catch (err) {
    console.error('Error opening group:', err);
  }
}

function setupChatWindow(title, status, avatar) {
  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('chatHeader').style.display = 'flex';
  document.getElementById('messages').style.display = 'flex';
  document.getElementById('inputArea').style.display = 'flex';
  document.getElementById('activeChatName').textContent = title;
  document.getElementById('activeChatStatus').textContent = status;
  document.getElementById('activeChatAvatar').src = avatar;
  document.getElementById('messages').innerHTML = '';
  document.getElementById('app').classList.add('chat-open');
}

function closeChatPage() {
  document.getElementById('app').classList.remove('chat-open');
  activeChat = null;
  myRoleInGroup = null;
  cancelReply();
}

// ===== MESSAGE FUNCTIONS =====
function sendMessage() {
  const input = document.getElementById('messageInput');
  const text = input.value.trim();
  if (!text || !activeChat) return;
  const msgData = {
    toId: activeChat.toId,
    message: text,
    fromId: currentUser.id,
    fromName: currentUser.name,
    type: activeChat.type,
    fileType: 'text'
  };
  if (replyingTo) {
    msgData.replyTo = {
      msgId: replyingTo.msgId,
      author: replyingTo.author,
      text: replyingTo.text,
      fileType: replyingTo.fileType
    };
  }
  socket.emit('send-message', msgData, (ack) => {
    appendMessage(currentUser.name, text, 'sent', 'text', ack.msgId, ack.status, msgData.replyTo);
  });
  input.value = '';
  cancelReply();
}

function appendMessage(author, text, dir, fileType = 'text', msgId = '', status = 'sent', replyTo = null) {
  const box = document.getElementById('messages');
  if (msgId && document.getElementById(`msg-container-${msgId}`)) return;

  const msg = document.createElement('div');
  msg.className = `message ${dir}`;
  if (msgId) msg.id = `msg-container-${msgId}`;
  msg.setAttribute('data-text', text);
  msg.setAttribute('data-file-type', fileType);
  msg.addEventListener('contextmenu', (e) => {
    showContextMenu(e, msgId, (dir === 'sent' ? currentUser.id : null), msg);
  });

  const time = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  let content = escapeHtml(text);
  if (fileType === 'image') {
    content = `<img src="${text}" onclick="openImagePreview('${text}')" style="cursor:pointer;" onerror="this.style.display='none'">`;
  } else if (fileType === 'video') content = `<video src="${text}" controls onerror="this.style.display='none'"></video>`;
  else if (fileType === 'audio') content = `<audio src="${text}" controls onerror="this.style.display='none'"></audio>`;

  let tick = '✓';
  if (status === 'delivered') tick = '✓✓';
  else if (status === 'seen') tick = '✓✓';

  const footerHTML = `<div class="message-footer"><span>${time}</span>${dir === 'sent' ? `<span id="status-${msgId}" class="msg-status ${status}">${tick}</span>` : ''}</div>`;

  let replyHTML = '';
  if (replyTo) {
    let replyText = replyTo.text;
    if (replyTo.fileType === 'image') replyText = '📷 صورة';
    else if (replyTo.fileType === 'video') replyText = '🎥 فيديو';
    else if (replyTo.fileType === 'audio') replyText = '🎤 رسالة صوتية';
    replyHTML = `<div class="reply-box"><div class="reply-author">${escapeHtml(replyTo.author)}</div><div class="reply-text">${escapeHtml(replyText)}</div></div>`;
  }

  if (activeChat && activeChat.type === 'group' && dir === 'received') {
    msg.innerHTML = `${replyHTML}<div class="message-author">${escapeHtml(author)}</div>${content}${footerHTML}`;
  } else {
    msg.innerHTML = `${replyHTML}${content}${footerHTML}`;
  }
  box.appendChild(msg);
  box.scrollTop = box.scrollHeight;
}

function sendMediaFile(input) {
  const file = input.files[0];
  if (!file || !activeChat) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    const fType = file.type.startsWith('image/') ? 'image' : 'video';
    const msgData = {
      toId: activeChat.toId,
      message: e.target.result,
      fromId: currentUser.id,
      fromName: currentUser.name,
      type: activeChat.type,
      fileType: fType
    };
    if (replyingTo) {
      msgData.replyTo = {
        msgId: replyingTo.msgId,
        author: replyingTo.author,
        text: replyingTo.text,
        fileType: replyingTo.fileType
      };
    }
    socket.emit('send-message', msgData, (ack) => {
      appendMessage(currentUser.name, e.target.result, 'sent', fType, ack.msgId, ack.status, msgData.replyTo);
    });
  };
  reader.onerror = function() {
    alert('فشل في قراءة الملف');
  };
  reader.readAsDataURL(file);
  input.value = '';
}

// ===== VOICE RECORDING =====
async function toggleVoiceRecord() {
  const btn = document.getElementById('voiceBtn');
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    btn.classList.remove('recording');
    btn.innerText = '🎤';
    return;
  }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return alert('متصفحك لا يدعم تسجيل الصوت');
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    let options = { mimeType: 'audio/webm' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) options = { mimeType: 'audio/ogg' };
    if (!MediaRecorder.isTypeSupported(options.mimeType)) options = {};
    mediaRecorder = new MediaRecorder(stream, options);

    mediaRecorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });
      const reader = new FileReader();
      reader.onload = function(e) {
        const msgData = {
          toId: activeChat.toId,
          message: e.target.result,
          fromId: currentUser.id,
          fromName: currentUser.name,
          type: activeChat.type,
          fileType: 'audio'
        };
        if (replyingTo) {
          msgData.replyTo = {
            msgId: replyingTo.msgId,
            author: replyingTo.author,
            text: replyingTo.text,
            fileType: replyingTo.fileType
          };
        }
        socket.emit('send-message', msgData, (ack) => {
          appendMessage(currentUser.name, e.target.result, 'sent', 'audio', ack.msgId, ack.status, msgData.replyTo);
        });
      };
      reader.readAsDataURL(audioBlob);
      stream.getTracks().forEach(track => track.stop());
      mediaRecorder = null;
    };

    mediaRecorder.onerror = (e) => {
      console.error('MediaRecorder error:', e);
      alert('خطأ في تسجيل الصوت');
      mediaRecorder = null;
    };

    mediaRecorder.start(1000);
    btn.classList.add('recording');
    btn.innerText = '🛑';
  } catch (err) {
    alert('خطأ في الوصول للميكروفون: ' + err.message);
  }
}

// ===== CONTEXT MENU =====
function showContextMenu(e, msgId, fromId, element) {
  e.preventDefault();
  e.stopPropagation();
  contextMenuTarget = { msgId, fromId, element };
  const menu = document.getElementById('contextMenu');
  let x = e.clientX;
  let y = e.clientY;
  if (x + 180 > window.innerWidth) x = window.innerWidth - 190;
  if (y + 100 > window.innerHeight) y = window.innerHeight - 110;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
  menu.classList.add('active');
}

function hideContextMenu() {
  const menu = document.getElementById('contextMenu');
  if (menu) menu.classList.remove('active');
}

document.addEventListener('click', (e) => {
  const menu = document.getElementById('contextMenu');
  if (menu && menu.classList.contains('active') && !menu.contains(e.target)) hideContextMenu();
});

// ===== REPLY FUNCTIONS =====
function showReplyPreview(author, text, fileType) {
  let displayText = text;
  if (fileType === 'image') displayText = '📷 صورة';
  else if (fileType === 'video') displayText = '🎥 فيديو';
  else if (fileType === 'audio') displayText = '🎤 رسالة صوتية';
  document.getElementById('replyPreviewAuthor').textContent = author;
  document.getElementById('replyPreviewText').textContent = displayText;
  document.getElementById('replyPreview').classList.add('active');
}

function cancelReply() {
  replyingTo = null;
  const preview = document.getElementById('replyPreview');
  if (preview) preview.classList.remove('active');
}

function replyToMessage() {
  if (!contextMenuTarget || !activeChat) return;
  hideContextMenu();
  const msgEl = contextMenuTarget.element;
  const author = msgEl.querySelector('.message-author')?.textContent ||
    (msgEl.classList.contains('sent') ? currentUser.name : activeChat.name);
  const text = msgEl.getAttribute('data-text') || '';
  const fileType = msgEl.getAttribute('data-file-type') || 'text';
  replyingTo = { msgId: contextMenuTarget.msgId, author: author, text: text, fileType: fileType };
  showReplyPreview(author, text, fileType);
  const input = document.getElementById('messageInput');
  if (input) input.focus();
}

// ===== DELETE MESSAGE FUNCTIONS =====
function deleteMessage() {
  if (!contextMenuTarget) return;
  hideContextMenu();
  const msgEl = contextMenuTarget.element;
  const isMyMessage = msgEl.classList.contains('sent');
  let canDeleteForEveryone = false;
  if (activeChat.type === 'private') {
    canDeleteForEveryone = isMyMessage;
  } else if (activeChat.type === 'group') {
    canDeleteForEveryone = isMyMessage || myRoleInGroup === 'admin' || myRoleInGroup === 'owner';
  }
  const delBtn = document.getElementById('deleteForEveryoneBtn');
  if (delBtn) delBtn.style.display = canDeleteForEveryone ? 'block' : 'none';
  openModal('deleteConfirmModal');
}

async function confirmDeleteMessage() {
  if (contextMenuTarget) {
    const msgEl = document.getElementById(`msg-container-${contextMenuTarget.msgId}`);
    if (msgEl) msgEl.remove();
  }
  closeModal('deleteConfirmModal');
  contextMenuTarget = null;
}

async function confirmDeleteForEveryone() {
  if (!contextMenuTarget) return;
  try {
    const res = await fetch('/api/messages/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgId: contextMenuTarget.msgId,
        userId: currentUser.id,
        chatType: activeChat?.type,
        chatId: activeChat?.id
      })
    });
    const data = await res.json();
    if (data.success) {
      const msgEl = document.getElementById(`msg-container-${contextMenuTarget.msgId}`);
      if (msgEl) msgEl.remove();
      showNotification('🗑️ تم حذف الرسالة');
    } else {
      alert(data.error || 'فشل حذف الرسالة');
    }
  } catch (err) {
    alert('خطأ في حذف الرسالة: ' + err.message);
  }
  closeModal('deleteConfirmModal');
  contextMenuTarget = null;
}

// ===== GROUP SETTINGS =====
async function openGroupSettings() {
  if (!activeChat || activeChat.type !== 'group') return;
  try {
    const res = await fetch(`/api/groups/details/${activeChat.id}`);
    const data = await res.json();
    if (!data.success) return alert('فشل جلب بيانات الجروب');
    const group = data.group;
    const myRole = data.membersInfo.find(m => m.id === currentUser.id)?.role;

    if (myRole === 'owner' || myRole === 'admin') {
      document.getElementById('groupAdminSection').style.display = 'block';
      document.getElementById('groupNotAdminNotice').style.display = 'none';
      document.getElementById('groupSettingsName').value = group.name;
      document.getElementById('groupSettingsDesc').value = group.description;
      document.getElementById('groupEditImgPreview').src = group.avatar;
    } else {
      document.getElementById('groupAdminSection').style.display = 'none';
      document.getElementById('groupNotAdminNotice').style.display = 'block';
    }

    const container = document.getElementById('groupMembersContainer');
    container.innerHTML = '';
    data.membersInfo.forEach(m => {
      const roleBadge = m.role === 'owner' ? '👑 مالك' : (m.role === 'admin' ? '⭐ مشرف' : '👤 عضو');
      let actionButtons = '';
      if (m.id !== currentUser.id) {
        if (myRole === 'owner') {
          if (m.role !== 'admin') actionButtons += `<button class="m-btn promote" onclick="changeMemberRole('${group.id}', '${m.id}', 'admin')">ترقية مشرف</button>`;
          else actionButtons += `<button class="m-btn promote" style="background:#ffaa00;" onclick="changeMemberRole('${group.id}', '${m.id}', 'member')">تنزيل لعضو</button>`;
          actionButtons += `<button class="m-btn kick" onclick="kickMember('${group.id}', '${m.id}')">طرد</button>`;
        } else if (myRole === 'admin' && m.role === 'member') {
          actionButtons += `<button class="m-btn kick" onclick="kickMember('${group.id}', '${m.id}')">طرد</button>`;
        }
      }
      container.innerHTML += `<div class="member-item"><img src="${m.avatar}" onerror="this.src='https://cdn-icons-png.flaticon.com/512/149/149071.png'"><div class="member-info"><div>${escapeHtml(m.name)}</div><span class="member-role">${roleBadge}</span></div><div class="m-actions">${actionButtons}</div></div>`;
    });
    openModal('groupSettingsModal');
  } catch (err) {
    alert('خطأ في فتح إعدادات الجروب');
  }
}

async function saveGroupSettings() {
  const name = document.getElementById('groupSettingsName').value.trim();
  const desc = document.getElementById('groupSettingsDesc').value.trim();
  const avatar = document.getElementById('groupEditImgPreview').src;
  if (!name) return alert('اسم المجموعة مطلوب');
  try {
    const res = await fetch('/api/groups/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId: activeChat.id, name, description: desc, avatar, userId: currentUser.id })
    });
    const data = await res.json();
    if (data.success) {
      showNotification('⚙️ تم تحديث بيانات المجموعة بنجاح');
      closeModal('groupSettingsModal');
      openGroupChat(activeChat.id);
    } else {
      alert(data.error);
    }
  } catch (err) {
    alert('خطأ في حفظ الإعدادات');
  }
}

async function changeMemberRole(groupId, targetUserId, newRole) {
  try {
    const res = await fetch('/api/groups/change-role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, targetUserId, newRole, requestUserId: currentUser.id })
    });
    const data = await res.json();
    if (data.success) {
      showNotification('⭐ تم تعديل رتبة العضو');
      openGroupSettings();
    } else {
      alert(data.error);
    }
  } catch (err) {
    alert('خطأ في تعديل الرتبة');
  }
}

async function kickMember(groupId, targetUserId) {
  if (!confirm('هل أنت متأكد من طرد هذا العضو؟')) return;
  try {
    const res = await fetch('/api/groups/kick', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId, targetUserId, requestUserId: currentUser.id })
    });
    const data = await res.json();
    if (data.success) {
      showNotification('❌ تم طرد العضو بنجاح');
      openGroupSettings();
    } else {
      alert(data.error);
    }
  } catch (err) {
    alert('خطأ في طرد العضو');
  }
}

async function leaveCurrentGroup() {
  if (!activeChat || activeChat.type !== 'group') return;
  if (!confirm('🚪 هل أنت متأكد تماماً أنك تريد الخروج ومغادرة هذه المجموعة؟')) return;
  try {
    const res = await fetch('/api/groups/leave', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId: activeChat.id, userId: currentUser.id })
    });
    const data = await res.json();
    if (data.success) {
      closeModal('groupSettingsModal');
      closeChatPage();
      showNotification('🚪 تم خروجك من المجموعة بنجاح');
      loadChats();
    } else {
      alert(data.error);
    }
  } catch (err) {
    alert('خطأ في مغادرة المجموعة');
  }
}

// ===== FRIEND FUNCTIONS =====
async function searchFriend() {
  const query = document.getElementById('friendIdInput').value.trim();
  if (!query) return alert('يرجى إدخال بيانات البحث أولاً');
  try {
    const res = await fetch('/api/user/' + encodeURIComponent(query));
    const data = await res.json();
    if (data.success) {
      if (data.user.id === currentUser.id) return alert('لا يمكنك إضافة نفسك!');
      searchResultUser = data.user;
      document.getElementById('searchAvatar').src = data.user.avatar;
      document.getElementById('searchName').textContent = data.user.name;
      document.getElementById('searchId').textContent = 'ID: ' + data.user.id;
      document.getElementById('searchResult').style.display = 'flex';
    } else {
      alert(data.error);
    }
  } catch (err) {
    alert('خطأ في البحث');
  }
}

async function addFriend() {
  if (!searchResultUser) return;
  try {
    const res = await fetch('/api/add-friend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ myUsername: currentUsername, friendId: searchResultUser.id })
    });
    const data = await res.json();
    if (data.success) {
      currentUser = data.updatedUser;
      loadChats();
      closeModal('addFriendModal');
      showNotification('✅ تمت إضافة الصديق بنجاح');
    }
  } catch (err) {
    alert('خطأ في إضافة الصديق');
  }
}

// ===== GROUP FUNCTIONS =====
async function searchGroupById() {
  const gId = document.getElementById('groupIdSearchInput').value.trim();
  if (!gId) return alert('يرجى إدخال الـ ID الخاص بالجروب');
  try {
    const res = await fetch(`/api/groups/search/${gId}?userId=${currentUser.id}`);
    const data = await res.json();
    if (data.success) {
      searchedGroupData = data.group;
      document.getElementById('searchGroupAvatar').src = data.group.avatar;
      document.getElementById('searchGroupName').textContent = data.group.name;
      document.getElementById('searchGroupId').textContent = 'ID: ' + data.group.id;
      const joinBtn = document.getElementById('joinGroupBtn');
      if (data.isMember) {
        joinBtn.textContent = 'أنت عضو بالفعل';
        joinBtn.disabled = true;
        joinBtn.style.background = '#333';
        joinBtn.style.color = '#888';
      } else {
        joinBtn.textContent = 'انضمام';
        joinBtn.disabled = false;
        joinBtn.style.background = '#00ff41';
        joinBtn.style.color = '#000';
      }
      document.getElementById('groupSearchResult').style.display = 'flex';
    } else {
      alert(data.error);
    }
  } catch (err) {
    alert('خطأ في البحث عن الجروب');
  }
}

async function joinSearchedGroup() {
  if (!searchedGroupData) return;
  try {
    const res = await fetch('/api/groups/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId: searchedGroupData.id, userId: currentUser.id })
    });
    const data = await res.json();
    if (data.success) {
      closeModal('searchGroupModal');
      showNotification('👥 تم انضمامك للجروب بنجاح!');
      loadChats();
    } else {
      alert(data.error);
    }
  } catch (err) {
    alert('خطأ في الانضمام');
  }
}

async function submitAddMemberToGroup() {
  const targetId = document.getElementById('newMemberIdInput').value.trim();
  if (!targetId) return alert('يرجى كتابة ID العضو');
  try {
    const res = await fetch('/api/groups/add-member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId: activeChat.id, targetUserId: targetId, requestUserId: currentUser.id })
    });
    const data = await res.json();
    if (data.success) {
      closeModal('addMemberToGroupModal');
      showNotification('✅ تم إضافة العضو للمجموعة بنجاح');
      openGroupSettings();
    } else {
      alert(data.error);
    }
  } catch (err) {
    alert('خطأ في إضافة العضو');
  }
}

async function submitCreateGroup() {
  const name = document.getElementById('groupNameInput').value.trim();
  const description = document.getElementById('groupDescInput').value.trim();
  const avatar = document.getElementById('groupCreateImgPreview').src;
  if (!name) return alert('يرجى كتابة اسم المجموعة');
  try {
    const res = await fetch('/api/groups/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, avatar, creatorId: currentUser.id, creatorUsername: currentUsername })
    });
    const data = await res.json();
    if (data.success) {
      closeModal('createGroupModal');
      if (!currentUser.groups) currentUser.groups = [];
      currentUser.groups.push(data.group.id);
      switchTab('groups');
      showNotification('👥 تم إنشاء المجموعة بنجاح!');
    } else {
      alert(data.error);
    }
  } catch (err) {
    alert('خطأ في إنشاء المجموعة');
  }
}

// ===== SETTINGS FUNCTIONS =====
function openSettings() {
  if (!currentUser) return alert("يرجى تسجيل الدخول أولاً");
  document.getElementById('settingsName').value = currentUser.name;
  document.getElementById('profileImgPreview').src = currentUser.avatar;
  openModal('settingsModal');
}

async function saveSettings() {
  const name = document.getElementById('settingsName').value.trim();
  const avatar = document.getElementById('profileImgPreview').src;
  if (!name) return alert("الاسم مطلوب");
  if (!currentUsername) return alert("خطأ: لم يتم تحديد اسم المستخدم");
  try {
    const res = await fetch('/api/update-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: currentUsername, name: name, avatar: avatar })
    });
    const data = await res.json();
    if (data.success) {
      currentUser = data.user;
      // Update localStorage with fresh data from server
      localStorage.setItem('chatUser', JSON.stringify(data.user));
      document.getElementById('sidebarName').textContent = currentUser.name;
      document.getElementById('sidebarAvatar').src = currentUser.avatar;
      closeModal('settingsModal');
      showNotification('⚙️ تم تعديل البيانات بنجاح');
    } else {
      alert(data.error || "فشل تحديث البيانات الشخصية");
    }
  } catch (err) {
    alert('خطأ في حفظ الإعدادات: ' + err.message);
  }
}

// ===== WINDOW INIT =====
window.onload = function() {
  const secBtn = document.getElementById('secondarySidebarBtn');
  if (secBtn) secBtn.style.display = 'none';

  // Load theme immediately
  loadTheme();

  const savedUser = localStorage.getItem('chatUser');
  const savedUsername = localStorage.getItem('chatUsername');
  if (savedUser && savedUsername) {
    try {
      const parsedUser = JSON.parse(savedUser);
      currentUsername = savedUsername;
      // Fetch fresh user data from server to get updated avatar/name
      fetch('/api/user/' + encodeURIComponent(parsedUser.id))
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            currentUser = data.user;
            // Update localStorage with fresh data
            localStorage.setItem('chatUser', JSON.stringify(data.user));
            showApp();
          } else {
            // Fallback to localStorage if server fails
            currentUser = parsedUser;
            showApp();
          }
        })
        .catch(() => {
          // Fallback to localStorage if no connection
          currentUser = parsedUser;
          showApp();
        });
    } catch (e) {
      console.error('Error parsing saved user:', e);
      localStorage.removeItem('chatUser');
      localStorage.removeItem('chatUsername');
    }
  }

  // Initialize audio on first user interaction
  document.addEventListener('click', () => {
    initAudio();
  }, { once: true });

  // Add typing listener to message input
  const msgInput = document.getElementById('messageInput');
  if (msgInput) {
    msgInput.addEventListener('input', handleTypingInput);
  }
};

document.addEventListener('contextmenu', (e) => {
  if (e.target.tagName === 'IMG' && e.target.closest('.message')) {
    e.preventDefault();
  }
});


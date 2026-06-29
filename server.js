const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });

app.use(express.json({ limit: '100mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const GROUPS_FILE = path.join(DATA_DIR, 'groups.json');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function loadData() {
    let users = {}, groups = {}, messages = [];
    try { if (fs.existsSync(USERS_FILE)) users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch(e) {}
    try { if (fs.existsSync(GROUPS_FILE)) groups = JSON.parse(fs.readFileSync(GROUPS_FILE, 'utf8')); } catch(e) {}
    try { if (fs.existsSync(MESSAGES_FILE)) messages = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8')); } catch(e) {}
    return { users, groups, messages };
}

function saveData(users, groups, messages) {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        fs.writeFileSync(GROUPS_FILE, JSON.stringify(groups, null, 2));
        fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
    } catch(e) { console.error('Save error:', e); }
}

let { users, groups } = loadData();
let messagesHistory = loadData().messages || [];
let usersById = {};

function rebuildIdCache() {
    usersById = {};
    Object.values(users).forEach(u => { usersById[u.id] = u; });
}
rebuildIdCache();

function generateNumericId() {
    let id; do { id = Math.floor(10000 + Math.random() * 90000).toString(); } while (usersById[id]); return id;
}
function generateGroup7DigitId() {
    let id; do { id = Math.floor(1000000 + Math.random() * 9000000).toString(); } while (groups[id]); return id;
}
function sanitize(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

// ========== APIs ==========
app.post('/api/register', async (req, res) => {
    const { username, password, name } = req.body;
    if (!username || !password || !name) return res.json({ success: false, error: "يرجى ملء جميع الحقول" });
    if (username.length < 3) return res.json({ success: false, error: "اسم المستخدم قصير جداً" });
    if (password.length < 6) return res.json({ success: false, error: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });
    if (users[username]) return res.json({ success: false, error: "اسم المستخدم محجوز" });

    const userId = generateNumericId();
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = {
        id: userId, username: sanitize(username), password: hashedPassword, name: sanitize(name),
        avatar: "https://cdn-icons-png.flaticon.com/512/149/149071.png", friends: [], groups: []
    };
    users[username] = newUser;
    saveData(users, groups, messagesHistory);
    rebuildIdCache();
    const { password: _, ...userWithoutPass } = newUser;
    res.json({ success: true, user: userWithoutPass, username });
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    let user = users[username] || usersById[username];
    if (!user) return res.json({ success: false, error: "بيانات الدخول خاطئة" });
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.json({ success: false, error: "بيانات الدخول خاطئة" });
    const { password: _, ...userWithoutPass } = user;
    res.json({ success: true, user: userWithoutPass, username: user.username });
});

app.get('/api/user/:id', (req, res) => {
    const user = usersById[req.params.id];
    if (user) { const { password: _, ...u } = user; res.json({ success: true, user: u }); }
    else res.json({ success: false, error: "لم يتم العثور على المستخدم" });
});

app.post('/api/add-friend', (req, res) => {
    const { myUsername, friendId } = req.body;
    const me = users[myUsername];
    const friend = usersById[friendId];
    if (!me || !friend) return res.json({ success: false, error: "خطأ بالإضافة" });
    if (!me.friends.includes(friendId)) me.friends.push(friendId);
    if (!friend.friends.includes(me.id)) friend.friends.push(me.id);
    saveData(users, groups, messagesHistory);
    const { password: _, ...meWP } = me;
    res.json({ success: true, updatedUser: meWP });
});

app.post('/api/update-profile', (req, res) => {
    const { username, name, avatar } = req.body;
    const user = users[username];
    if (!user) return res.json({ success: false, error: "المستخدم غير موجود" });
    if (name) user.name = sanitize(name);
    if (avatar) user.avatar = avatar;
    saveData(users, groups, messagesHistory);
    rebuildIdCache();
    const { password: _, ...uWP } = user;
    res.json({ success: true, user: uWP });
});

// Groups
app.post('/api/groups/create', (req, res) => {
    const { name, description, avatar, creatorId, creatorUsername } = req.body;
    const user = users[creatorUsername];
    if (!name || !user) return res.json({ success: false, error: "الاسم مطلوب" });
    if (name.length > 50) return res.json({ success: false, error: "اسم المجموعة طويل جداً" });
    const groupId = generateGroup7DigitId();
    const newGroup = {
        id: groupId, name: sanitize(name), description: sanitize(description) || "لا يوجد وصف",
        avatar: avatar || "https://cdn-icons-png.flaticon.com/512/32/32441.png",
        members: [creatorId], roles: { [creatorId]: 'owner' }, createdAt: new Date().toISOString()
    };
    groups[groupId] = newGroup;
    if (!user.groups) user.groups = [];
    user.groups.push(groupId);
    saveData(users, groups, messagesHistory);
    res.json({ success: true, group: newGroup });
});

app.get('/api/groups/search/:groupId', (req, res) => {
    const groupId = req.params.groupId;
    if (!/^\d{7}$/.test(groupId)) return res.json({ success: false, error: "معرف المجموعة يجب أن يكون 7 أرقام" });
    const group = groups[groupId];
    if (!group) return res.json({ success: false, error: "لم يتم العثور على مجموعة بهذا الرقم" });
    const userId = req.query.userId;
    const isMember = group.members.includes(userId);
    res.json({ success: true, group, isMember });
});

app.post('/api/groups/join', (req, res) => {
    const { groupId, userId } = req.body;
    const group = groups[groupId];
    if (!group) return res.json({ success: false, error: "المجموعة غير موجودة" });
    if (!group.members.includes(userId)) { group.members.push(userId); group.roles[userId] = 'member'; }
    const user = usersById[userId];
    if (user) { if (!user.groups) user.groups = []; if (!user.groups.includes(groupId)) user.groups.push(groupId); }
    saveData(users, groups, messagesHistory);
    res.json({ success: true });
});

app.post('/api/groups/add-member', (req, res) => {
    const { groupId, targetUserId, requestUserId } = req.body;
    const group = groups[groupId];
    if (!group) return res.json({ success: false, error: "المجموعة غير موجودة" });
    const myRole = group.roles[requestUserId];
    if (myRole !== 'owner' && myRole !== 'admin') return res.json({ success: false, error: "لا تملك صلاحية إضافة أعضاء" });
    const targetUser = usersById[targetUserId];
    if (!targetUser) return res.json({ success: false, error: "لم يتم العثور على المستخدم" });
    if (group.members.includes(targetUserId)) return res.json({ success: false, error: "المستخدم عضو بالفعل" });
    group.members.push(targetUserId); group.roles[targetUserId] = 'member';
    if (!targetUser.groups) targetUser.groups = []; targetUser.groups.push(groupId);
    saveData(users, groups, messagesHistory);
    res.json({ success: true });
});

app.get('/api/user-groups/:userId', (req, res) => {
    const userId = req.params.userId;
    const userGroups = Object.values(groups).filter(g => g.members.includes(userId));
    res.json({ success: true, groups: userGroups });
});

app.get('/api/groups/details/:groupId', (req, res) => {
    const group = groups[req.params.groupId];
    if (!group) return res.json({ success: false, error: "الجروب غير موجود" });
    const membersInfo = group.members.map(mId => {
        const u = usersById[mId];
        return { id: mId, name: u ? sanitize(u.name) : "مستخدم غير معروف", avatar: u ? u.avatar : "https://cdn-icons-png.flaticon.com/512/149/149071.png", role: group.roles[mId] || 'member' };
    });
    res.json({ success: true, group, membersInfo });
});

app.get('/api/groups/my-role/:groupId', (req, res) => {
    const group = groups[req.params.groupId];
    const userId = req.query.userId;
    if (!group) return res.json({ success: false, error: "الجروب غير موجود" });
    res.json({ success: true, role: group.roles[userId] || 'member' });
});

app.post('/api/groups/update', (req, res) => {
    const { groupId, name, description, avatar, userId } = req.body;
    const group = groups[groupId];
    if (!group) return res.json({ success: false, error: "المجموعة غير موجودة" });
    const userRole = group.roles[userId];
    if (userRole !== 'owner' && userRole !== 'admin') return res.json({ success: false, error: "ليس لديك صلاحية تعديل المجموعة" });
    if (name) group.name = sanitize(name);
    if (description !== undefined) group.description = sanitize(description);
    if (avatar) group.avatar = avatar;
    saveData(users, groups, messagesHistory);
    io.emit('group-updated', { groupId, name: group.name, avatar: group.avatar });
    res.json({ success: true });
});

app.post('/api/groups/change-role', (req, res) => {
    const { groupId, targetUserId, newRole, requestUserId } = req.body;
    const group = groups[groupId];
    if (!group) return res.json({ success: false, error: "المجموعة غير موجودة" });
    if (group.roles[requestUserId] !== 'owner') return res.json({ success: false, error: "المالك فقط من يملك صلاحية إدارة الرتب" });
    if (!['owner', 'admin', 'member'].includes(newRole)) return res.json({ success: false, error: "رتبة غير صالحة" });
    group.roles[targetUserId] = newRole;
    saveData(users, groups, messagesHistory);
    res.json({ success: true });
});

app.post('/api/groups/kick', (req, res) => {
    const { groupId, targetUserId, requestUserId } = req.body;
    const group = groups[groupId];
    if (!group) return res.json({ success: false, error: "المجموعة غير موجودة" });
    const myRole = group.roles[requestUserId];
    const targetRole = group.roles[targetUserId] || 'member';
    if (myRole !== 'owner' && myRole !== 'admin') return res.json({ success: false, error: "لا تملك الصلاحية لطرد الأعضاء" });
    if (myRole === 'admin' && targetRole !== 'member') return res.json({ success: false, error: "كمشرف، لا يمكنك طرد المشرفين الآخرين أو المالك" });
    group.members = group.members.filter(mId => mId !== targetUserId);
    if(group.roles[targetUserId]) delete group.roles[targetUserId];
    const targetUser = usersById[targetUserId];
    if(targetUser && targetUser.groups) targetUser.groups = targetUser.groups.filter(gId => gId !== groupId);
    saveData(users, groups, messagesHistory);
    io.emit('group-updated', { groupId, kickedId: targetUserId, name: group.name, avatar: group.avatar });
    res.json({ success: true });
});

app.post('/api/groups/leave', (req, res) => {
    const { groupId, userId } = req.body;
    const group = groups[groupId];
    if (!group) return res.json({ success: false, error: "المجموعة غير موجودة" });
    if (!group.members.includes(userId)) return res.json({ success: false, error: "أنت لست عضواً في هذه المجموعة بالفعل" });
    if (group.roles[userId] === 'owner' && group.members.length > 1) return res.json({ success: false, error: "أنت مالك المجموعة. يرجى نقل الملكية لعضو آخر أولاً قبل الخروج." });
    group.members = group.members.filter(mId => mId !== userId);
    if (group.roles[userId]) delete group.roles[userId];
    const user = usersById[userId];
    if (user && user.groups) user.groups = user.groups.filter(gId => gId !== groupId);
    if (group.members.length === 0) delete groups[groupId];
    saveData(users, groups, messagesHistory);
    io.emit('group-updated', { groupId, kickedId: userId, name: group.name, avatar: group.avatar });
    res.json({ success: true });
});

// Messages
app.get('/api/messages', (req, res) => {
    const { fromId, toId, type } = req.query;
    if (!fromId || !toId || !type) return res.json({ success: false, error: "معاملات ناقصة" });
    let history = [];
    if (type === 'private') history = messagesHistory.filter(msg => msg.type === 'private' && ((msg.fromId === fromId && msg.toId === toId) || (msg.fromId === toId && msg.toId === fromId)));
    else if (type === 'group') history = messagesHistory.filter(msg => msg.type === 'group' && msg.toId === toId);
    history = history.slice(-100);
    res.json({ success: true, history });
});

app.post('/api/messages/delete', (req, res) => {
    const { msgId, userId, chatType, chatId } = req.body;
    if (!msgId) return res.json({ success: false, error: "معرف الرسالة مطلوب" });
    const msgIndex = messagesHistory.findIndex(m => m.id === msgId);
    if (msgIndex === -1) return res.json({ success: false, error: "الرسالة غير موجودة" });
    const msg = messagesHistory[msgIndex];
    let canDelete = false;
    if (msg.fromId === userId) canDelete = true;
    else if (chatType === 'group') {
        const group = groups[chatId];
        if (group) { const userRole = group.roles[userId]; if (userRole === 'admin' || userRole === 'owner') canDelete = true; }
    }
    if (!canDelete) return res.json({ success: false, error: "ليس لديك صلاحية حذف هذه الرسالة" });
    messagesHistory.splice(msgIndex, 1);
    saveData(users, groups, messagesHistory);
    if (chatType === 'private') { io.to(msg.toId).emit('message-deleted', { msgId }); io.to(msg.fromId).emit('message-deleted', { msgId }); }
    else if (chatType === 'group') { io.to(`group_${chatId}`).emit('message-deleted', { msgId }); }
    res.json({ success: true });
});

// Socket.IO
const connectedUsers = {};

io.on('connection', (socket) => {
    let currentSocketUser = null;

    socket.on('join', (userId) => {
        if (!userId) return;
        socket.join(userId);
        currentSocketUser = userId;
        connectedUsers[userId] = socket.id;

        const user = usersById[userId];
        if (user && user.groups) {
            user.groups.forEach(gId => {
                socket.join(`group_${gId}`);
            });
        }

        messagesHistory.forEach(msg => {
            if(msg.type === 'private' && msg.toId === userId && msg.status === 'sent') {
                msg.status = 'delivered';
                socket.to(msg.fromId).emit('message-status-updated', { msgId: msg.id, status: 'delivered' });
            }
        });
        saveData(users, groups, messagesHistory);
    });

    socket.on('typing', (data) => {
        if (data.chatType === 'private') {
            socket.to(data.chatId).emit('user-typing', data);
        } else if (data.chatType === 'group') {
            socket.to(`group_${data.chatId}`).emit('user-typing', data);
        }
    });

    socket.on('send-message', (data, callback) => {
        if (!data || !data.fromId || !data.toId) { if (callback) callback({ error: 'بيانات غير كاملة' }); return; }
        const msgId = 'msg_' + Math.random().toString(36).substr(2, 9) + Date.now();
        let initialStatus = 'sent';
        if (data.type === 'private' && connectedUsers[data.toId]) initialStatus = 'delivered';
        const messageObject = {
            id: msgId, fromId: data.fromId, fromName: sanitize(data.fromName || 'مستخدم'), toId: data.toId,
            message: data.message, type: data.type, fileType: data.fileType || 'text',
            timestamp: new Date().toISOString(), status: initialStatus, replyTo: data.replyTo || null
        };
        messagesHistory.push(messageObject);
        if (messagesHistory.length > 5000) messagesHistory = messagesHistory.slice(-5000);
        saveData(users, groups, messagesHistory);
        if(callback) callback({ msgId, status: initialStatus });

        if (data.type === 'private') {
            socket.to(data.toId).emit('receive-message', messageObject);
        } else if (data.type === 'group') {
            socket.to(`group_${data.toId}`).emit('receive-message', messageObject);
        }
    });

    socket.on('mark-as-seen', (data) => {
        const { readerId, targetId, type } = data;
        if (type === 'private') {
            messagesHistory.forEach(msg => {
                if (msg.type === 'private' && msg.fromId === targetId && msg.toId === readerId && msg.status !== 'seen') {
                    msg.status = 'seen';
                    socket.to(targetId).emit('message-status-updated', { msgId: msg.id, status: 'seen' });
                }
            });
        }
        saveData(users, groups, messagesHistory);
    });

    socket.on('disconnect', () => {
        if(currentSocketUser && connectedUsers[currentSocketUser] === socket.id) delete connectedUsers[currentSocketUser];
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log("================================");
    console.log(`🚀 Chat Server is running!`);
    console.log(`🔗 http://localhost:${PORT}`);
    console.log("================================");
});


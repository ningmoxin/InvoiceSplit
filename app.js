// ===== Firebase Configuration =====
const firebaseConfig = {
    apiKey: "AIzaSyCrrm45SzhPgLtkqspiXkpWC_rb0Q6MnAM",
    authDomain: "matchplay-8a324.firebaseapp.com",
    databaseURL: "https://matchplay-8a324-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "matchplay-8a324",
    storageBucket: "matchplay-8a324.firebasestorage.app",
    messagingSenderId: "477387192568",
    appId: "1:477387192568:web:5cdd491ee498f7ab03e30d"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ===== Utility Functions =====
function showLoading() {
    document.getElementById('loadingOverlay').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.add('hidden');
}

function showToast(message, type = '') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast' + (type ? ` ${type}` : '');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function hashPassword(password) {
    // Simple hash for demo - in production use proper hashing
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
        const char = password.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash.toString();
}

function formatCurrency(amount) {
    return '$' + Math.round(amount).toLocaleString();
}

// ===== Storage Functions =====
function saveToStorage(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
}

function getFromStorage(key) {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : null;
}

// ===== Page Detection =====
const isIndexPage = window.location.pathname.endsWith('index.html') ||
                    window.location.pathname.endsWith('/') ||
                    window.location.pathname === '';
const isRoomPage = window.location.pathname.endsWith('room.html');

// ===== Index Page Logic =====
if (isIndexPage) {
    document.addEventListener('DOMContentLoaded', initIndexPage);
}

function initIndexPage() {
    const createForm = document.getElementById('createForm');
    const joinForm = document.getElementById('joinForm');

    // Check if coming back from room
    const urlParams = new URLSearchParams(window.location.search);
    const roomCode = urlParams.get('room');
    if (roomCode) {
        document.getElementById('roomCode').value = roomCode.toUpperCase();
    }

    // Create Event Form
    createForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoading();

        const eventName = document.getElementById('eventName').value.trim();
        const adminPassword = document.getElementById('adminPassword').value;
        const creatorName = document.getElementById('creatorName').value.trim();

        try {
            // Generate unique room code
            let roomCode;
            let exists = true;
            while (exists) {
                roomCode = generateRoomCode();
                const snapshot = await db.ref(`rooms/${roomCode}`).once('value');
                exists = snapshot.exists();
            }

            const memberId = generateId();
            const now = Date.now();

            // Create room data
            const roomData = {
                info: {
                    name: eventName,
                    createdAt: now,
                    createdBy: memberId,
                    adminPassword: hashPassword(adminPassword),
                    status: 'active'
                },
                members: {
                    [memberId]: {
                        name: creatorName,
                        joinedAt: now,
                        isTemp: false
                    }
                }
            };

            await db.ref(`rooms/${roomCode}`).set(roomData);

            // Save user info
            saveToStorage('currentUser', {
                odId: memberId,
                name: creatorName,
                roomCode: roomCode,
                isAdmin: true
            });

            showToast('活動建立成功！', 'success');
            window.location.href = `room.html?room=${roomCode}`;

        } catch (error) {
            console.error('Create room error:', error);
            showToast('建立失敗，請重試', 'error');
        } finally {
            hideLoading();
        }
    });

    // Join Event Form
    joinForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        showLoading();

        const roomCode = document.getElementById('roomCode').value.trim().toUpperCase();
        const memberName = document.getElementById('memberName').value.trim();

        try {
            // Check if room exists
            const snapshot = await db.ref(`rooms/${roomCode}`).once('value');
            if (!snapshot.exists()) {
                showToast('找不到此活動代碼', 'error');
                hideLoading();
                return;
            }

            const roomData = snapshot.val();

            // Check if room is ended
            if (roomData.info.status === 'ended') {
                showToast('此活動已結束', 'error');
                hideLoading();
                return;
            }

            // Check if name already exists
            const members = roomData.members || {};
            let existingMemberId = null;
            for (const [id, member] of Object.entries(members)) {
                if (member.name === memberName && !member.isTemp) {
                    existingMemberId = id;
                    break;
                }
            }

            let memberId;
            let isAdmin = false;

            if (existingMemberId) {
                // Returning member
                memberId = existingMemberId;
                isAdmin = roomData.info.createdBy === memberId;
            } else {
                // New member
                memberId = generateId();
                await db.ref(`rooms/${roomCode}/members/${memberId}`).set({
                    name: memberName,
                    joinedAt: Date.now(),
                    isTemp: false
                });
            }

            // Check if admin
            isAdmin = roomData.info.createdBy === memberId;

            // Save user info
            saveToStorage('currentUser', {
                odId: memberId,
                name: memberName,
                roomCode: roomCode,
                isAdmin: isAdmin
            });

            showToast('加入成功！', 'success');
            window.location.href = `room.html?room=${roomCode}`;

        } catch (error) {
            console.error('Join room error:', error);
            showToast('加入失敗，請重試', 'error');
        } finally {
            hideLoading();
        }
    });

    // Auto uppercase room code
    document.getElementById('roomCode').addEventListener('input', (e) => {
        e.target.value = e.target.value.toUpperCase();
    });
}

// ===== Room Page Logic =====
if (isRoomPage) {
    document.addEventListener('DOMContentLoaded', initRoomPage);
}

// Global state for room page
let currentRoom = null;
let currentUser = null;
let members = {};
let expenses = {};
let payments = {};

function initRoomPage() {
    // Get room code from URL
    const urlParams = new URLSearchParams(window.location.search);
    const roomCode = urlParams.get('room');

    if (!roomCode) {
        window.location.href = 'index.html';
        return;
    }

    // Get current user
    currentUser = getFromStorage('currentUser');
    if (!currentUser || currentUser.roomCode !== roomCode) {
        window.location.href = `index.html?room=${roomCode}`;
        return;
    }

    // Initialize UI
    document.getElementById('roomCode').textContent = roomCode;
    document.getElementById('currentUserName').textContent = currentUser.name;

    // Setup listeners
    setupTabNavigation();
    setupModalHandlers();
    setupEventListeners();

    // Load room data
    loadRoomData(roomCode);
}

function setupTabNavigation() {
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Update active content
            const tabContents = document.querySelectorAll('.tab-content');
            tabContents.forEach(content => content.classList.remove('active'));

            const tabName = tab.dataset.tab;
            document.getElementById(`${tabName}Tab`).classList.add('active');
        });
    });
}

function setupModalHandlers() {
    // Close modal handlers
    document.querySelectorAll('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.modal').forEach(modal => {
                modal.classList.add('hidden');
            });
        });
    });

    // Close on backdrop click
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
        backdrop.addEventListener('click', () => {
            backdrop.closest('.modal').classList.add('hidden');
        });
    });
}

function setupEventListeners() {
    // Copy code button
    document.getElementById('copyCodeBtn').addEventListener('click', () => {
        const code = document.getElementById('roomCode').textContent;
        navigator.clipboard.writeText(code).then(() => {
            showToast('已複製代碼', 'success');
        });
    });

    // Share button
    document.getElementById('shareBtn').addEventListener('click', () => {
        const url = window.location.href;
        if (navigator.share) {
            navigator.share({
                title: currentRoom?.info?.name || 'InvoiceSplit',
                text: '加入分帳活動',
                url: url
            });
        } else {
            navigator.clipboard.writeText(url).then(() => {
                showToast('已複製連結', 'success');
            });
        }
    });

    // QR Code button
    document.getElementById('qrBtn').addEventListener('click', () => {
        showQRModal();
    });

    // Add expense button
    document.getElementById('addExpenseBtn').addEventListener('click', () => {
        if (currentRoom?.info?.status === 'ended') {
            showToast('活動已結束，無法新增費用', 'error');
            return;
        }
        showExpenseModal();
    });

    // Expense form
    document.getElementById('expenseForm').addEventListener('submit', handleExpenseSubmit);

    // Split method change
    document.getElementById('splitMethod').addEventListener('change', updateSplitDetails);

    // Add temp member button
    document.getElementById('addTempMemberBtn').addEventListener('click', () => {
        document.getElementById('tempMemberModal').classList.remove('hidden');
    });

    // Temp member form
    document.getElementById('tempMemberForm').addEventListener('submit', handleTempMemberSubmit);

    // End event button
    document.getElementById('endEventBtn').addEventListener('click', () => {
        document.getElementById('endEventModal').classList.remove('hidden');
    });

    // End event form
    document.getElementById('endEventForm').addEventListener('submit', handleEndEvent);

    // Confirm payment button
    document.getElementById('confirmPaymentBtn').addEventListener('click', handleConfirmPayment);
}

async function loadRoomData(roomCode) {
    showLoading();

    try {
        // Setup realtime listeners
        const roomRef = db.ref(`rooms/${roomCode}`);

        roomRef.on('value', (snapshot) => {
            if (!snapshot.exists()) {
                showToast('活動不存在', 'error');
                window.location.href = 'index.html';
                return;
            }

            currentRoom = snapshot.val();
            currentRoom.code = roomCode;
            members = currentRoom.members || {};
            expenses = currentRoom.expenses || {};
            payments = currentRoom.payments || {};

            // Update current user admin status
            currentUser.isAdmin = currentRoom.info.createdBy === currentUser.odId;
            saveToStorage('currentUser', currentUser);

            updateRoomUI();
            hideLoading();
        });

    } catch (error) {
        console.error('Load room error:', error);
        showToast('載入失敗', 'error');
        hideLoading();
    }
}

function updateRoomUI() {
    // Update room name
    document.getElementById('roomName').textContent = currentRoom.info.name;

    // Update ended status
    const isEnded = currentRoom.info.status === 'ended';
    document.getElementById('endedBanner').classList.toggle('hidden', !isEnded);
    document.getElementById('addExpenseBtn').disabled = isEnded;

    // Update admin section
    document.getElementById('adminSection').classList.toggle('hidden', !currentUser.isAdmin || isEnded);

    // Update user balance
    updateUserBalance();

    // Update all tabs
    updateExpensesList();
    updateMembersList();
    updateSettlement();
}

function updateUserBalance() {
    const balances = calculateBalances();
    const userBalance = balances[currentUser.odId] || 0;

    const balanceEl = document.getElementById('userBalance');
    if (userBalance > 0) {
        balanceEl.textContent = `應收 ${formatCurrency(userBalance)}`;
        balanceEl.className = 'user-balance positive';
    } else if (userBalance < 0) {
        balanceEl.textContent = `應付 ${formatCurrency(Math.abs(userBalance))}`;
        balanceEl.className = 'user-balance negative';
    } else {
        balanceEl.textContent = '已結清';
        balanceEl.className = 'user-balance';
    }
}

function calculateBalances() {
    const balances = {};

    // Initialize balances
    Object.keys(members).forEach(id => {
        balances[id] = 0;
    });

    // Calculate from expenses
    Object.values(expenses).forEach(expense => {
        const amount = expense.amount;
        const participants = expense.participants || {};
        const participantIds = Object.keys(participants);

        if (participantIds.length === 0) return;

        // Calculate each participant's share
        let shares = {};
        if (expense.splitMethod === 'equal') {
            const share = amount / participantIds.length;
            participantIds.forEach(id => {
                shares[id] = share;
            });
        } else if (expense.splitMethod === 'ratio') {
            const totalRatio = participantIds.reduce((sum, id) => sum + (participants[id].ratio || 1), 0);
            participantIds.forEach(id => {
                shares[id] = amount * (participants[id].ratio || 1) / totalRatio;
            });
        } else if (expense.splitMethod === 'exact') {
            participantIds.forEach(id => {
                shares[id] = participants[id].amount || 0;
            });
        }

        // Update balances - Payers get credit (支援多付款人)
        if (expense.payers) {
            // 新格式：多付款人
            Object.entries(expense.payers).forEach(([payerId, payerData]) => {
                balances[payerId] = (balances[payerId] || 0) + (payerData.amount || 0);
            });
        } else if (expense.paidBy) {
            // 舊格式：單一付款人
            balances[expense.paidBy] = (balances[expense.paidBy] || 0) + amount;
        }

        // Participants get debit
        Object.entries(shares).forEach(([id, share]) => {
            balances[id] = (balances[id] || 0) - share;
        });
    });

    // Adjust for payments
    Object.values(payments).forEach(payment => {
        if (payment.paidAt) {
            balances[payment.from] = (balances[payment.from] || 0) + payment.amount;
            balances[payment.to] = (balances[payment.to] || 0) - payment.amount;
        }
    });

    return balances;
}

function calculateTransfers() {
    const balances = calculateBalances();
    const transfers = [];

    // Separate debtors and creditors
    const debtors = [];
    const creditors = [];

    Object.entries(balances).forEach(([id, balance]) => {
        if (balance < -0.01) {
            debtors.push({ id, amount: Math.abs(balance) });
        } else if (balance > 0.01) {
            creditors.push({ id, amount: balance });
        }
    });

    // Sort by amount
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    // Match debtors to creditors
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
        const debtor = debtors[i];
        const creditor = creditors[j];
        const amount = Math.min(debtor.amount, creditor.amount);

        if (amount > 0.01) {
            transfers.push({
                from: debtor.id,
                to: creditor.id,
                amount: Math.round(amount)
            });
        }

        debtor.amount -= amount;
        creditor.amount -= amount;

        if (debtor.amount < 0.01) i++;
        if (creditor.amount < 0.01) j++;
    }

    return transfers;
}

function updateExpensesList() {
    const listEl = document.getElementById('expensesList');

    if (Object.keys(expenses).length === 0) {
        listEl.innerHTML = '<p class="empty-state">尚無費用記錄</p>';
        return;
    }

    // Sort by createdAt descending
    const sortedExpenses = Object.entries(expenses)
        .sort((a, b) => b[1].createdAt - a[1].createdAt);

    listEl.innerHTML = sortedExpenses.map(([id, expense]) => {
        // 取得付款人顯示文字（支援多付款人）
        let payerText = '';
        if (expense.payers) {
            const payerNames = Object.keys(expense.payers)
                .map(payerId => members[payerId]?.name || '未知');
            payerText = payerNames.length > 2
                ? `${payerNames[0]} 等${payerNames.length}人`
                : payerNames.join('、');
        } else if (expense.paidBy) {
            payerText = members[expense.paidBy]?.name || '未知';
        }

        const participantCount = Object.keys(expense.participants || {}).length;
        const isCreator = expense.createdBy === currentUser.odId;
        const isEnded = currentRoom?.info?.status === 'ended';

        let splitText = '';
        if (expense.splitMethod === 'equal') {
            splitText = `${participantCount}人均分`;
        } else if (expense.splitMethod === 'ratio') {
            splitText = `${participantCount}人比例分`;
        } else {
            splitText = `${participantCount}人指定`;
        }

        return `
            <div class="expense-card" data-id="${id}">
                <div class="expense-header">
                    <span class="expense-title">${escapeHtml(expense.title)}</span>
                    <span class="expense-amount">${formatCurrency(expense.amount)}</span>
                </div>
                <div class="expense-meta">
                    <span>${escapeHtml(payerText)} 付款 · ${splitText}</span>
                    <div class="expense-actions">
                        ${isCreator && !isEnded ? `
                            <button class="btn-icon" onclick="editExpense('${id}')" title="編輯">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                </svg>
                            </button>
                            <button class="btn-icon" onclick="deleteExpense('${id}')" title="刪除">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function updateMembersList() {
    const listEl = document.getElementById('membersList');
    const balances = calculateBalances();

    if (Object.keys(members).length === 0) {
        listEl.innerHTML = '<p class="empty-state">尚無成員</p>';
        return;
    }

    const sortedMembers = Object.entries(members)
        .sort((a, b) => a[1].joinedAt - b[1].joinedAt);

    listEl.innerHTML = sortedMembers.map(([id, member]) => {
        const balance = balances[id] || 0;
        const initial = member.name.charAt(0).toUpperCase();
        const isAdmin = currentRoom.info.createdBy === id;
        const isEnded = currentRoom?.info?.status === 'ended';

        // 檢查此成員是否有參與任何費用
        const hasExpenses = Object.values(expenses).some(expense =>
            expense.paidBy === id || (expense.participants && expense.participants[id])
        );

        // 檢查此成員是否有付款記錄
        const hasPayments = Object.values(payments).some(payment =>
            payment.from === id || payment.to === id
        );

        // 只有臨時成員、無費用關聯、活動未結束時可刪除
        const canDelete = member.isTemp && !hasExpenses && !hasPayments && !isEnded;

        let balanceText = '';
        let balanceClass = '';
        if (balance > 0.01) {
            balanceText = `應收 ${formatCurrency(balance)}`;
            balanceClass = 'positive';
        } else if (balance < -0.01) {
            balanceText = `應付 ${formatCurrency(Math.abs(balance))}`;
            balanceClass = 'negative';
        } else {
            balanceText = '已結清';
        }

        return `
            <div class="member-card">
                <div class="member-info">
                    <div class="member-avatar ${member.isTemp ? 'temp' : ''}">${initial}</div>
                    <span class="member-name">
                        ${escapeHtml(member.name)}
                        ${isAdmin ? '<span class="member-tag">管理者</span>' : ''}
                        ${member.isTemp ? '<span class="member-tag">臨時</span>' : ''}
                    </span>
                </div>
                <div class="member-actions">
                    <span class="member-balance ${balanceClass}">${balanceText}</span>
                    ${canDelete ? `
                        <button class="btn-icon" onclick="deleteTempMember('${id}')" title="刪除">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function updateSettlement() {
    const balances = calculateBalances();
    const transfers = calculateTransfers();

    // Update summary
    const summaryEl = document.getElementById('summaryContent');
    const sortedBalances = Object.entries(balances)
        .filter(([id]) => members[id])
        .sort((a, b) => b[1] - a[1]);

    if (sortedBalances.length === 0) {
        summaryEl.innerHTML = '<p class="empty-state">尚無費用可結算</p>';
    } else {
        summaryEl.innerHTML = sortedBalances.map(([id, balance]) => {
            const member = members[id];
            let status = '';
            let statusClass = '';
            if (balance > 0.01) {
                status = `應收 ${formatCurrency(balance)}`;
                statusClass = 'positive';
            } else if (balance < -0.01) {
                status = `應付 ${formatCurrency(Math.abs(balance))}`;
                statusClass = 'negative';
            } else {
                status = '已結清';
            }

            return `
                <div class="summary-row">
                    <span>${escapeHtml(member.name)}</span>
                    <span class="member-balance ${statusClass}">${status}</span>
                </div>
            `;
        }).join('');
    }

    // Update transfer list
    const transferEl = document.getElementById('transferList');

    if (transfers.length === 0) {
        transferEl.innerHTML = '<p class="empty-state">無需轉帳</p>';
    } else {
        transferEl.innerHTML = transfers.map(transfer => {
            const fromName = members[transfer.from]?.name || '未知';
            const toName = members[transfer.to]?.name || '未知';
            const isCurrentUser = transfer.from === currentUser.odId;

            // Check payment status
            const existingPayment = Object.entries(payments).find(([_, p]) =>
                p.from === transfer.from && p.to === transfer.to && Math.abs(p.amount - transfer.amount) < 1
            );

            let statusHtml = '';
            let actionHtml = '';

            if (existingPayment) {
                const [paymentId, payment] = existingPayment;
                if (payment.confirmed) {
                    statusHtml = '<span class="transfer-status confirmed">已確認</span>';
                } else if (payment.paidAt) {
                    statusHtml = '<span class="transfer-status paid">已付款</span>';
                    if (transfer.to === currentUser.odId) {
                        actionHtml = `<button class="btn btn-sm btn-outline" onclick="confirmReceived('${paymentId}')">確認收款</button>`;
                    }
                }
            } else if (isCurrentUser) {
                actionHtml = `<button class="btn btn-sm btn-primary" onclick="markPaid('${transfer.from}', '${transfer.to}', ${transfer.amount})">標記已付</button>`;
            } else {
                statusHtml = '<span class="transfer-status pending">待付款</span>';
            }

            return `
                <div class="transfer-item">
                    <div class="transfer-info">
                        <span>${escapeHtml(fromName)}</span>
                        <span class="transfer-arrow">→</span>
                        <span>${escapeHtml(toName)}</span>
                        <span class="transfer-amount">${formatCurrency(transfer.amount)}</span>
                    </div>
                    <div class="transfer-actions">
                        ${statusHtml}
                        ${actionHtml}
                    </div>
                </div>
            `;
        }).join('');
    }
}

function showExpenseModal(expenseId = null) {
    const modal = document.getElementById('expenseModal');
    const form = document.getElementById('expenseForm');
    const titleEl = document.getElementById('expenseModalTitle');

    // Reset form
    form.reset();
    document.getElementById('expenseId').value = '';
    document.getElementById('splitDetails').classList.add('hidden');
    document.getElementById('payerAmounts').classList.add('hidden');

    // Update payers checkboxes (多付款人)
    const payersCheckbox = document.getElementById('payersCheckbox');
    payersCheckbox.innerHTML = Object.entries(members).map(([id, member]) =>
        `<div class="checkbox-item">
            <input type="checkbox" id="payer_${id}" value="${id}">
            <label for="payer_${id}">${escapeHtml(member.name)}</label>
        </div>`
    ).join('');

    // Update participants checkboxes
    const checkboxGroup = document.getElementById('participantsCheckbox');
    checkboxGroup.innerHTML = Object.entries(members).map(([id, member]) =>
        `<div class="checkbox-item">
            <input type="checkbox" id="participant_${id}" value="${id}">
            <label for="participant_${id}">${escapeHtml(member.name)}</label>
        </div>`
    ).join('');

    if (expenseId && expenses[expenseId]) {
        // Edit mode
        titleEl.textContent = '編輯費用';
        const expense = expenses[expenseId];

        document.getElementById('expenseId').value = expenseId;
        document.getElementById('expenseTitle').value = expense.title;
        document.getElementById('expenseAmount').value = expense.amount;
        document.getElementById('splitMethod').value = expense.splitMethod;

        // Check payers and fill amounts (支援新舊格式)
        if (expense.payers) {
            // 新格式：多付款人
            Object.keys(expense.payers).forEach(id => {
                const checkbox = document.getElementById(`payer_${id}`);
                if (checkbox) checkbox.checked = true;
            });
            updatePayerAmounts();
            Object.entries(expense.payers).forEach(([id, data]) => {
                const input = document.querySelector(`#payerAmounts input[data-payer="${id}"]`);
                if (input) input.value = data.amount;
            });
        } else if (expense.paidBy) {
            // 舊格式：單一付款人
            const checkbox = document.getElementById(`payer_${expense.paidBy}`);
            if (checkbox) checkbox.checked = true;
            updatePayerAmounts();
            const input = document.querySelector(`#payerAmounts input[data-payer="${expense.paidBy}"]`);
            if (input) input.value = expense.amount;
        }

        // Check participants
        Object.keys(expense.participants || {}).forEach(id => {
            const checkbox = document.getElementById(`participant_${id}`);
            if (checkbox) checkbox.checked = true;
        });

        updateSplitDetails();

        // Fill split details
        if (expense.splitMethod !== 'equal') {
            Object.entries(expense.participants || {}).forEach(([id, data]) => {
                const input = document.querySelector(`#splitDetails input[data-member="${id}"]`);
                if (input) {
                    input.value = expense.splitMethod === 'ratio' ? data.ratio : data.amount;
                }
            });
        }
    } else {
        titleEl.textContent = '新增費用';
    }

    modal.classList.remove('hidden');
}

function updatePayerAmounts() {
    const payerAmountsEl = document.getElementById('payerAmounts');
    const checkedPayers = document.querySelectorAll('#payersCheckbox input:checked');

    if (checkedPayers.length === 0) {
        payerAmountsEl.classList.add('hidden');
        return;
    }

    // 只有多人付款時才顯示金額輸入
    if (checkedPayers.length === 1) {
        payerAmountsEl.classList.add('hidden');
        return;
    }

    payerAmountsEl.classList.remove('hidden');
    payerAmountsEl.innerHTML = '<p class="split-hint">請輸入每人付款金額：</p>' +
        Array.from(checkedPayers).map(checkbox => {
            const memberId = checkbox.value;
            const memberName = members[memberId]?.name || '';
            return `
                <div class="split-row">
                    <label>${escapeHtml(memberName)}</label>
                    <input type="number" data-payer="${memberId}" placeholder="0" min="0" step="1">
                </div>
            `;
        }).join('');
}

function updateSplitDetails() {
    const method = document.getElementById('splitMethod').value;
    const detailsEl = document.getElementById('splitDetails');
    const checkboxes = document.querySelectorAll('#participantsCheckbox input:checked');

    if (method === 'equal' || checkboxes.length === 0) {
        detailsEl.classList.add('hidden');
        return;
    }

    detailsEl.classList.remove('hidden');

    const label = method === 'ratio' ? '比例' : '金額';
    const placeholder = method === 'ratio' ? '1' : '0';

    detailsEl.innerHTML = Array.from(checkboxes).map(checkbox => {
        const memberId = checkbox.value;
        const memberName = members[memberId]?.name || '';

        return `
            <div class="split-row">
                <label>${escapeHtml(memberName)}</label>
                <input type="number" data-member="${memberId}" placeholder="${placeholder}" min="${method === 'ratio' ? '1' : '0'}" step="${method === 'ratio' ? '1' : '0.01'}">
            </div>
        `;
    }).join('');
}

async function handleExpenseSubmit(e) {
    e.preventDefault();
    showLoading();

    const expenseId = document.getElementById('expenseId').value || generateId();
    const title = document.getElementById('expenseTitle').value.trim();
    const amount = parseFloat(document.getElementById('expenseAmount').value);
    const splitMethod = document.getElementById('splitMethod').value;

    // Get payers (多付款人)
    const checkedPayers = document.querySelectorAll('#payersCheckbox input:checked');
    if (checkedPayers.length === 0) {
        showToast('請選擇至少一位付款人', 'error');
        hideLoading();
        return;
    }

    const payers = {};
    if (checkedPayers.length === 1) {
        // 單一付款人，金額就是總金額
        const payerId = checkedPayers[0].value;
        payers[payerId] = { amount: amount };
    } else {
        // 多付款人，從輸入框取得各自金額
        let payerTotal = 0;
        checkedPayers.forEach(checkbox => {
            const payerId = checkbox.value;
            const input = document.querySelector(`#payerAmounts input[data-payer="${payerId}"]`);
            const payerAmount = parseFloat(input?.value) || 0;
            payers[payerId] = { amount: payerAmount };
            payerTotal += payerAmount;
        });

        // 驗證付款人金額總和
        if (Math.abs(payerTotal - amount) > 0.01) {
            showToast(`付款人金額總和 (${formatCurrency(payerTotal)}) 必須等於費用金額 (${formatCurrency(amount)})`, 'error');
            hideLoading();
            return;
        }
    }

    // Get participants
    const checkedBoxes = document.querySelectorAll('#participantsCheckbox input:checked');
    if (checkedBoxes.length === 0) {
        showToast('請選擇至少一位參與者', 'error');
        hideLoading();
        return;
    }

    const participants = {};
    checkedBoxes.forEach(checkbox => {
        const memberId = checkbox.value;

        if (splitMethod === 'ratio') {
            const input = document.querySelector(`#splitDetails input[data-member="${memberId}"]`);
            participants[memberId] = { ratio: parseInt(input?.value) || 1 };
        } else if (splitMethod === 'exact') {
            const input = document.querySelector(`#splitDetails input[data-member="${memberId}"]`);
            participants[memberId] = { amount: parseFloat(input?.value) || 0 };
        } else {
            // equal - 給一個標記值，避免 Firebase 忽略空物件
            participants[memberId] = { included: true };
        }
    });

    // Validate exact amounts
    if (splitMethod === 'exact') {
        const total = Object.values(participants).reduce((sum, p) => sum + (p.amount || 0), 0);
        if (Math.abs(total - amount) > 0.01) {
            showToast(`指定金額總和 (${formatCurrency(total)}) 必須等於費用金額 (${formatCurrency(amount)})`, 'error');
            hideLoading();
            return;
        }
    }

    const expenseData = {
        title,
        amount,
        payers,  // 新格式：多付款人
        createdBy: document.getElementById('expenseId').value ? expenses[expenseId].createdBy : currentUser.odId,
        createdAt: document.getElementById('expenseId').value ? expenses[expenseId].createdAt : Date.now(),
        splitMethod,
        participants
    };

    try {
        await db.ref(`rooms/${currentRoom.code}/expenses/${expenseId}`).set(expenseData);
        showToast(document.getElementById('expenseId').value ? '費用已更新' : '費用已新增', 'success');
        document.getElementById('expenseModal').classList.add('hidden');
    } catch (error) {
        console.error('Save expense error:', error);
        showToast('儲存失敗', 'error');
    } finally {
        hideLoading();
    }
}

async function handleTempMemberSubmit(e) {
    e.preventDefault();
    showLoading();

    const name = document.getElementById('tempMemberName').value.trim();

    // Check if name exists
    const exists = Object.values(members).some(m => m.name === name);
    if (exists) {
        showToast('此姓名已存在', 'error');
        hideLoading();
        return;
    }

    const memberId = generateId();

    try {
        await db.ref(`rooms/${currentRoom.code}/members/${memberId}`).set({
            name,
            joinedAt: Date.now(),
            isTemp: true
        });
        showToast('成員已新增', 'success');
        document.getElementById('tempMemberModal').classList.add('hidden');
        document.getElementById('tempMemberForm').reset();

        // Refresh expense modal if open
        if (!document.getElementById('expenseModal').classList.contains('hidden')) {
            showExpenseModal(document.getElementById('expenseId').value || null);
        }
    } catch (error) {
        console.error('Add temp member error:', error);
        showToast('新增失敗', 'error');
    } finally {
        hideLoading();
    }
}

function editExpense(expenseId) {
    showExpenseModal(expenseId);
}

async function deleteExpense(expenseId) {
    if (!confirm('確定要刪除此費用？')) return;

    showLoading();
    try {
        await db.ref(`rooms/${currentRoom.code}/expenses/${expenseId}`).remove();
        showToast('費用已刪除', 'success');
    } catch (error) {
        console.error('Delete expense error:', error);
        showToast('刪除失敗', 'error');
    } finally {
        hideLoading();
    }
}

async function deleteTempMember(memberId) {
    const member = members[memberId];
    if (!member || !member.isTemp) {
        showToast('只能刪除臨時成員', 'error');
        return;
    }

    // 再次確認此成員沒有參與任何費用
    const hasExpenses = Object.values(expenses).some(expense =>
        expense.paidBy === memberId || (expense.participants && expense.participants[memberId])
    );

    if (hasExpenses) {
        showToast('此成員有參與費用，無法刪除', 'error');
        return;
    }

    if (!confirm(`確定要刪除臨時成員「${member.name}」？`)) return;

    showLoading();
    try {
        await db.ref(`rooms/${currentRoom.code}/members/${memberId}`).remove();
        showToast('成員已刪除', 'success');
    } catch (error) {
        console.error('Delete member error:', error);
        showToast('刪除失敗', 'error');
    } finally {
        hideLoading();
    }
}

async function handleEndEvent(e) {
    e.preventDefault();
    showLoading();

    const password = document.getElementById('endEventPassword').value;

    if (hashPassword(password) !== currentRoom.info.adminPassword) {
        showToast('密碼錯誤', 'error');
        hideLoading();
        return;
    }

    try {
        await db.ref(`rooms/${currentRoom.code}/info/status`).set('ended');
        showToast('活動已結束', 'success');
        document.getElementById('endEventModal').classList.add('hidden');
    } catch (error) {
        console.error('End event error:', error);
        showToast('操作失敗', 'error');
    } finally {
        hideLoading();
    }
}

function showQRModal() {
    const modal = document.getElementById('qrModal');
    const qrContainer = document.getElementById('qrCode');

    // Clear previous QR code
    qrContainer.innerHTML = '';

    // Generate new QR code
    const url = window.location.href;
    new QRCode(qrContainer, {
        text: url,
        width: 200,
        height: 200,
        colorDark: '#111827',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.L
    });

    modal.classList.remove('hidden');
}

let pendingPayment = null;

function markPaid(fromId, toId, amount) {
    pendingPayment = { from: fromId, to: toId, amount };

    document.getElementById('paymentTo').textContent = members[toId]?.name || '未知';
    document.getElementById('paymentAmount').textContent = formatCurrency(amount);
    document.getElementById('paymentModal').classList.remove('hidden');
}

async function handleConfirmPayment() {
    if (!pendingPayment) return;

    showLoading();

    const paymentId = generateId();
    const paymentData = {
        from: pendingPayment.from,
        to: pendingPayment.to,
        amount: pendingPayment.amount,
        paidAt: Date.now(),
        confirmed: false
    };

    try {
        await db.ref(`rooms/${currentRoom.code}/payments/${paymentId}`).set(paymentData);
        showToast('已標記付款', 'success');
        document.getElementById('paymentModal').classList.add('hidden');
        pendingPayment = null;
    } catch (error) {
        console.error('Mark paid error:', error);
        showToast('操作失敗', 'error');
    } finally {
        hideLoading();
    }
}

async function confirmReceived(paymentId) {
    showLoading();

    try {
        await db.ref(`rooms/${currentRoom.code}/payments/${paymentId}/confirmed`).set(true);
        showToast('已確認收款', 'success');
    } catch (error) {
        console.error('Confirm received error:', error);
        showToast('操作失敗', 'error');
    } finally {
        hideLoading();
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Add event listener for checkbox changes
document.addEventListener('change', (e) => {
    if (e.target.matches('#participantsCheckbox input[type="checkbox"]')) {
        updateSplitDetails();
    }
    if (e.target.matches('#payersCheckbox input[type="checkbox"]')) {
        updatePayerAmounts();
    }
});

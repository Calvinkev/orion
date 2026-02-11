// api.js - API Helper Functions with Environment Detection

// Automatically detect the correct API URL based on environment
// Priority: meta[name="api-base-url"] -> window.ORION_API_BASE_URL -> same-origin /api
const API_BASE_URL = (() => {
    const metaTag = document.querySelector('meta[name="api-base-url"]');
    let baseUrl = '';
    
    if (metaTag && metaTag.content) {
        baseUrl = metaTag.content.replace(/\/$/, '');
    } else if (window.ORION_API_BASE_URL) {
        baseUrl = window.ORION_API_BASE_URL.replace(/\/$/, '');
    } else {
        return `${window.location.protocol}//${window.location.host}/api`;
    }
    
    // Ensure the URL ends with /api
    if (!baseUrl.endsWith('/api')) {
        baseUrl = baseUrl + '/api';
    }
    
    return baseUrl;
})();


// Get token from localStorage
function getToken() {
    return localStorage.getItem('token');
}

// Set token to localStorage
function setToken(token) {
    localStorage.setItem('token', token);
}

// Remove token from localStorage
function removeToken() {
    localStorage.removeItem('token');
}

// Get user data from localStorage
function getUserData() {
    const userData = localStorage.getItem('userData');
    return userData ? JSON.parse(userData) : null;
}

// Set user data to localStorage
function setUserData(userData) {
    localStorage.setItem('userData', JSON.stringify(userData));
}

// Remove user data from localStorage
function removeUserData() {
    localStorage.removeItem('userData');
}

// Generic API request function
async function apiRequest(endpoint, options = {}) {
    const token = getToken();
    
    console.log('🟣 API REQUEST:', {
        baseUrl: API_BASE_URL,
        endpoint: endpoint,
        fullUrl: `${API_BASE_URL}${endpoint}`
    });
    
    const defaultHeaders = {
        'Content-Type': 'application/json',
    };

    if (token) {
        defaultHeaders['Authorization'] = `Bearer ${token}`;
    }

    // If there's a body and it's FormData, remove Content-Type header
    if (options.body instanceof FormData) {
        delete defaultHeaders['Content-Type'];
    }

    const config = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers,
        },
    };

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        console.log('🟣 API RESPONSE status:', response.status);
        const text = await response.text();
        let data = null;
        if (text) {
            try {
                data = JSON.parse(text);
                console.log('🟣 API RESPONSE data (first 200 chars):', JSON.stringify(data).substring(0, 200));
            } catch (parseError) {
                data = { raw: text };
            }
        }

        if (!response.ok) {
            const message = (data && data.message) ? data.message : (data && data.error) ? data.error : (data && data.raw) ? data.raw : 'Request failed';
            const error = new Error(message);
            // Preserve ALL error data from backend response (for negative balance trigger, etc.)
            if (data) {
                Object.keys(data).forEach(key => {
                    error[key] = data[key];
                });
            }
            throw error;
        }

        return data;
    } catch (error) {
        throw error;
    }
}

// ==================== AUTH API ====================

const authAPI = {
    async register(username, email, password, inviteCode, withdrawPassword) {
        return await apiRequest('/auth/register', {
            method: 'POST',
            body: JSON.stringify({ username, email, password, inviteCode, withdrawPassword }),
        });
    },

    async login(username, password) {
        const data = await apiRequest('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        });
        
        if (data.token) {
            setToken(data.token);
            setUserData(data.user);
        }
        
        return data;
    },

    async getMe() {
        return await apiRequest('/auth/me', {
            method: 'GET',
        });
    },

    logout() {
        removeToken();
        removeUserData();
        window.location.href = 'index.html';
    }
};

// ==================== USER API ====================

const userAPI = {
    async getDashboard() {
        return await apiRequest('/user/dashboard', {
            method: 'GET',
        });
    },

    async submitToday() {
        return await apiRequest('/user/submit-today', {
            method: 'POST',
        });
    },

    async submitProduct(productAssignmentId) {
        return await apiRequest(`/user/submit-product/${productAssignmentId}`, {
            method: 'POST',
        });
    },

    async startProduct(productAssignmentId) {
        return await apiRequest(`/user/start-product/${productAssignmentId}`, {
            method: 'POST',
        });
    },

    async getHistory() {
        return await apiRequest('/user/history', {
            method: 'GET',
        });
    },

    async getPublicProducts() {
        return await apiRequest('/user/products-public', {
            method: 'GET',
        });
    },

    async requestWithdrawal(amount, walletAddress, withdrawPassword, withdrawType) {
        return await apiRequest('/user/withdraw-request', {
            method: 'POST',
            body: JSON.stringify({ amount, wallet_address: walletAddress, withdrawPassword, withdraw_type: withdrawType }),
        });
    },

    async getWithdrawals() {
        return await apiRequest('/user/withdrawals', {
            method: 'GET',
        });
    },

    async getDeposits() {
        return await apiRequest('/user/deposits', {
            method: 'GET',
        });
    },

    async updateProfile(paymentName, cryptoWallet, walletAddress) {
        return await apiRequest('/user/profile', {
            method: 'PUT',
            body: JSON.stringify({ paymentName, cryptoWallet, walletAddress }),
        });
    },

    async changePassword(currentPassword, newPassword) {
        return await apiRequest('/user/change-password', {
            method: 'POST',
            body: JSON.stringify({ currentPassword, newPassword }),
        });
    },

    async changeWithdrawPassword(currentWithdrawPassword, newWithdrawPassword) {
        return await apiRequest('/user/change-withdraw-password', {
            method: 'POST',
            body: JSON.stringify({ currentWithdrawPassword, newWithdrawPassword }),
        });
    },

    async resetWithdrawPassword(otp, newWithdrawPassword) {
        return await apiRequest('/user/reset-withdraw-password', {
            method: 'POST',
            body: JSON.stringify({ otp, newWithdrawPassword }),
        });
    },

    async getLevelProgress() {
        return await apiRequest('/user/level-progress', {
            method: 'GET',
        });
    },

    async getPopups() {
        return await apiRequest('/user/popups', {
            method: 'GET',
        });
    },

    async clickPopup(popupId) {
        return await apiRequest(`/user/popup/${popupId}/click`, {
            method: 'POST',
        });
    },

    async dismissPopup(popupId) {
        return await apiRequest(`/user/popup/${popupId}/dismiss`, {
            method: 'POST',
        });
    },

    async getNotifications() {
        return await apiRequest('/user/notifications', {
            method: 'GET',
        });
    },

    async markNotificationRead(notificationId) {
        return await apiRequest(`/user/notifications/${notificationId}/read`, {
            method: 'PATCH',
        });
    },

    async getGlobalPopup() {
        return await apiRequest('/user/global-popup', {
            method: 'GET',
        });
    },

    async dismissGlobalPopup(popupId) {
        return await apiRequest(`/user/global-popup/${popupId}/dismiss`, {
            method: 'POST',
        });
    },

    async getPaymentMethod() {
        return await apiRequest('/user/payment-method', {
            method: 'GET',
        });
    },

    async savePaymentMethod(withdrawType, walletAddress) {
        return await apiRequest('/user/payment-method', {
            method: 'PUT',
            body: JSON.stringify({ withdrawType, walletAddress }),
        });
    },

    async uploadProfilePicture(formData) {
        return await apiRequest('/user/profile-picture', {
            method: 'POST',
            body: formData,
        });
    },

    async markBonusShown() {
        return await apiRequest('/user/bonus-shown', {
            method: 'POST',
        });
    },

    async deposit(amount) {
        return await apiRequest('/user/deposit', {
            method: 'POST',
            body: JSON.stringify({ amount }),
        });
    }
};

// ==================== ADMIN API ====================

const adminAPI = {
    async getUsers(search = '') {
        const query = search ? `?search=${encodeURIComponent(search)}` : '';
        return await apiRequest(`/admin/users${query}`, {
            method: 'GET',
        });
    },

    async getUser(userId) {
        return await apiRequest(`/admin/users/${userId}`, {
            method: 'GET',
        });
    },

    async updateUserBalance(userId, balance) {
        return await apiRequest(`/admin/users/${userId}/balance`, {
            method: 'PUT',
            body: JSON.stringify({ balance }),
        });
    },

    async updateUserCommission(userId, commission) {
        return await apiRequest(`/admin/users/${userId}/commission`, {
            method: 'PUT',
            body: JSON.stringify({ commission }),
        });
    },

    async updateUserLevel(userId, level) {
        return await apiRequest(`/admin/users/${userId}/level`, {
            method: 'PUT',
            body: JSON.stringify({ level }),
        });
    },

    async updateUserStatus(userId, status) {
        return await apiRequest(`/admin/users/${userId}/status`, {
            method: 'PUT',
            body: JSON.stringify({ status }),
        });
    },

    async resetUserPassword(userId, newPassword) {
        return await apiRequest(`/admin/users/${userId}/reset-password`, {
            method: 'POST',
            body: JSON.stringify({ newPassword }),
        });
    },

    async getProducts() {
        return await apiRequest('/admin/products', {
            method: 'GET',
        });
    },

    async uploadProduct(formData) {
        return await apiRequest('/admin/products', {
            method: 'POST',
            body: formData,
        });
    },

    async updateProduct(productId, formData) {
        return await apiRequest(`/admin/products/${productId}`, {
            method: 'PUT',
            body: formData,
        });
    },

    async toggleProductStatus(productId) {
        return await apiRequest(`/admin/products/${productId}/status`, {
            method: 'PUT',
        });
    },

    async deleteProduct(productId) {
        return await apiRequest(`/admin/products/${productId}`, {
            method: 'DELETE',
        });
    },

    async getWithdrawals() {
        return await apiRequest('/admin/withdrawals', {
            method: 'GET',
        });
    },

    async approveWithdrawal(withdrawalId) {
        return await apiRequest(`/admin/withdrawals/${withdrawalId}/approve`, {
            method: 'PUT',
        });
    },

    async rejectWithdrawal(withdrawalId, adminNotes = '') {
        return await apiRequest(`/admin/withdrawals/${withdrawalId}/reject`, {
            method: 'PUT',
            body: JSON.stringify({ adminNotes }),
        });
    },

    async setPendingWithdrawal(withdrawalId) {
        return await apiRequest(`/admin/withdrawals/${withdrawalId}/pending`, {
            method: 'PUT',
        });
    },

    async getCommissionRates() {
        return await apiRequest('/admin/commission-rates', {
            method: 'GET',
        });
    },

    async updateCommissionRates(rates) {
        return await apiRequest('/admin/commission-rates', {
            method: 'PUT',
            body: JSON.stringify({ rates }),
        });
    },

    async getLevelSettings() {
        return await apiRequest('/admin/level-settings', {
            method: 'GET',
        });
    },

    async updateLevelSettings(settings) {
        return await apiRequest('/admin/level-settings', {
            method: 'PUT',
            body: JSON.stringify({ settings }),
        });
    },

    async createAdmin(username, email, password) {
        return await apiRequest('/admin/create-admin', {
            method: 'POST',
            body: JSON.stringify({ username, email, password }),
        });
    },

    async getStats() {
        return await apiRequest('/admin/stats', {
            method: 'GET',
        });
    },

    async triggerAssignment() {
        return await apiRequest('/admin/trigger-assignment', {
            method: 'POST',
        });
    },

    async assignProducts(productIds) {
        return await apiRequest('/admin/assign-products', {
            method: 'POST',
            body: JSON.stringify({ productIds }),
        });
    },

    async assignProductToUser(userId, productId, manualBonus = 0, customPrice = null) {
        return await apiRequest('/admin/assign-product-to-user', {
            method: 'POST',
            body: JSON.stringify({ userId, productId, manualBonus, customPrice }),
        });
    },

    async getChatUsers() {
        return await apiRequest('/admin/chat/users', {
            method: 'GET',
        });
    },

    async getChatMessages(userId) {
        return await apiRequest(`/admin/chat/messages/${userId}`, {
            method: 'GET',
        });
    },

    async sendChatMessage(userId, message) {
        return await apiRequest('/admin/chat/send', {
            method: 'POST',
            body: JSON.stringify({ userId, message }),
        });
    },

    async clearChat(userId) {
        return await apiRequest(`/admin/chat/clear/${userId}`, {
            method: 'DELETE',
        });
    },

    async getChatUnreadCount() {
        return await apiRequest('/admin/chat/unread-count', {
            method: 'GET',
        });
    },

    async deleteUser(userId) {
        return await apiRequest(`/admin/users/${userId}`, {
            method: 'DELETE',
        });
    },

    async setNegativeBalanceTrigger(userId, setNumber, submissionNumber, amount) {
        return await apiRequest(`/admin/users/${userId}/negative-balance-trigger`, {
            method: 'PUT',
            body: JSON.stringify({ setNumber, submissionNumber, amount }),
        });
    },

    async generateWithdrawOTP(userId) {
        return await apiRequest(`/admin/users/${userId}/withdraw-otp`, {
            method: 'POST',
        });
    },

    async resetUserTasks(userId) {
        return await apiRequest('/admin/reset-user-tasks', {
            method: 'POST',
            body: JSON.stringify({ userId }),
        });
    },

    async generateInviteCode(userId = null) {
        return await apiRequest('/admin/generate-invite-code', {
            method: 'POST',
            body: JSON.stringify({ userId }),
        });
    },

    async sendPopup(userId, title, message, url = null, voucherId = null) {
        return await apiRequest('/admin/popup', {
            method: 'POST',
            body: JSON.stringify({ userId, title, message, url, voucherId }),
        });
    },

    async sendNotification(userId, title, message) {
        return await apiRequest('/admin/notify', {
            method: 'POST',
            body: JSON.stringify({ userId, title, message }),
        });
    },

    async getVouchers() {
        return await apiRequest('/admin/vouchers', {
            method: 'GET',
        });
    },

    async uploadVoucher(formData) {
        return await apiRequest('/admin/vouchers', {
            method: 'POST',
            body: formData,
        });
    },

    async getVoucherClicks() {
        return await apiRequest('/admin/voucher-clicks', {
            method: 'GET',
        });
    },

    async markVoucherClicksRead(ids) {
        return await apiRequest('/admin/voucher-clicks/mark-read', {
            method: 'POST',
            body: JSON.stringify({ ids }),
        });
    },

    async getGlobalPopups() {
        return await apiRequest('/admin/global-popups', {
            method: 'GET',
        });
    },

    async createGlobalPopup(voucherId, title, message, expiresInDays = null) {
        return await apiRequest('/admin/global-popup', {
            method: 'POST',
            body: JSON.stringify({ voucherId, title, message, expiresInDays }),
        });
    },

    async toggleGlobalPopup(popupId) {
        return await apiRequest(`/admin/global-popup/${popupId}/toggle`, {
            method: 'PUT',
        });
    },

    async deleteGlobalPopup(popupId) {
        return await apiRequest(`/admin/global-popup/${popupId}`, {
            method: 'DELETE',
        });
    },

    async getEvents() {
        return await apiRequest('/admin/events', {
            method: 'GET',
        });
    },

    async createEvent(formData) {
        return await apiRequest('/admin/events', {
            method: 'POST',
            body: formData,
        });
    },

    async updateEvent(eventId, formData) {
        return await apiRequest(`/admin/events/${eventId}`, {
            method: 'PUT',
            body: formData,
        });
    },

    async deleteEvent(eventId) {
        return await apiRequest(`/admin/events/${eventId}`, {
            method: 'DELETE',
        });
    },

    async getNegativeBalances() {
        return await apiRequest('/admin/negative-balances', {
            method: 'GET',
        });
    },

    async getBalanceEvents(userId = null) {
        const query = userId ? `?userId=${userId}` : '';
        return await apiRequest(`/admin/balance-events${query}`, {
            method: 'GET',
        });
    },

    async changeAdminPassword(currentPassword, newPassword) {
        return await apiRequest('/admin/change-password', {
            method: 'POST',
            body: JSON.stringify({ currentPassword, newPassword }),
        });
    },

    async sendChatImageMessage(userId, message, imageFile) {
        const formData = new FormData();
        formData.append('userId', userId);
        formData.append('message', message);
        if (imageFile) formData.append('image', imageFile);
        return await apiRequest('/admin/chat/send-image', {
            method: 'POST',
            body: formData,
        });
    },

    async getLevelIcons() {
        return await apiRequest('/level-icons', {
            method: 'GET',
        });
    },

    async uploadLevelIcon(level, formData) {
        return await apiRequest(`/admin/level-icons/${level}`, {
            method: 'POST',
            body: formData,
        });
    },

    async deleteLevelIcon(level) {
        return await apiRequest(`/admin/level-icons/${level}`, {
            method: 'DELETE',
        });
    }
};

// Chat API for users
const chatAPI = {
    async sendMessage(message) {
        return await apiRequest('/user/chat/send', {
            method: 'POST',
            body: JSON.stringify({ message }),
        });
    },

    async getMessages() {
        return await apiRequest('/user/chat/messages', {
            method: 'GET',
        });
    },

    async getUnreadCount() {
        return await apiRequest('/user/chat/unread-count', {
            method: 'GET',
        });
    },

    async sendImageMessage(message, imageFile) {
        const formData = new FormData();
        formData.append('message', message);
        if (imageFile) formData.append('image', imageFile);
        return await apiRequest('/user/chat/send-image', {
            method: 'POST',
            body: formData,
        });
    }
};

// Events API (public)
const eventsAPI = {
    async getEvents() {
        return await apiRequest('/events', {
            method: 'GET',
        });
    }
};

// Product Images API (public)
const productsAPI = {
    async getProductImages() {
        return await apiRequest('/products/images', {
            method: 'GET',
        });
    }
};

// Check if user is authenticated
function isAuthenticated() {
    return !!getToken();
}

// Check if user is admin
function isAdmin() {
    const userData = getUserData();
    return userData?.isAdmin === true;
}

// Redirect to login if not authenticated
function requireAuth() {
    if (!isAuthenticated()) {
        window.location.href = 'index.html';
        return false;
    }
    return true;
}

// Redirect to user dashboard if not admin
function requireAdmin() {
    if (!requireAuth()) return false;
    
    if (!isAdmin()) {
        window.location.href = 'index.html';
        return false;
    }
    return true;
}
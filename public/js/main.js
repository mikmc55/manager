// Initial setup
document.addEventListener('DOMContentLoaded', () => {
    // Set up form event listeners
    const loginForm = document.getElementById('loginFormElement');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    const stremioRegForm = document.getElementById('stremioRegisterForm');
    if (stremioRegForm) {
        stremioRegForm.addEventListener('submit', handleStremioRegister);
    }
    
    const userForm = document.getElementById('userForm');
    if (userForm) {
        userForm.addEventListener('submit', handleAddUser);
    }
    
    const addonForm = document.getElementById('addonForm');
    if (addonForm) {
        addonForm.addEventListener('submit', handleAddAddon);
    }
    
    const importFile = document.getElementById('importFile');
    if (importFile) {
        importFile.addEventListener('change', handleImportFile);
    }

    checkLoginStatus();
});

// UI State Management
function showMainContent() {
    const loginForm = document.getElementById('loginForm');
    const root = document.getElementById('root');
    
    if (loginForm) loginForm.classList.add('hidden');
    if (root) {
        root.classList.remove('hidden');
        // Render the React component and initialize icons
        ReactDOM.render(React.createElement(SidebarLayout), root, () => {
            window.initIcons();
        });
    }
}

function showLoginForm() {
    const loginForm = document.getElementById('loginForm');
    const root = document.getElementById('root');
    
    if (loginForm) loginForm.classList.remove('hidden');
    if (root) root.classList.add('hidden');
}

// Authentication Functions
async function handleLogin(event) {
    event.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            showMainContent();
            updateAddonList();
            updateUsersList();
            updateDashboardStats();
        } else {
            const error = data.error || 'Login failed';
            alert(error);
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('Login failed: ' + error.message);
    }
}

async function handleLogout() {
    try {
        const response = await fetch('/api/logout', {
            method: 'POST',
            credentials: 'include'
        });
        
        if (response.ok) {
            window.location.reload();
        }
    } catch (error) {
        console.error('Logout error:', error);
        alert('Logout failed: ' + error.message);
    }
}

async function checkLoginStatus() {
    try {
        const response = await fetch('/api/auth/status', {
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.isAuthenticated) {
            showMainContent();
            updateDashboardStats();
        } else {
            showLoginForm();
        }
    } catch (error) {
        console.error('Error checking login status:', error);
        showLoginForm();
    }
}

// Dashboard Functions
async function updateDashboardStats() {
    try {
        const [usersResponse, addonsResponse] = await Promise.all([
            fetch('/api/users', { credentials: 'include' }),
            fetch('/api/addons', { credentials: 'include' })
        ]);

        const users = await usersResponse.json();
        const addons = await addonsResponse.json();

        // Update user count
        document.getElementById('totalUsers').textContent = users.length;

        // Update addon count
        document.getElementById('activeAddons').textContent = addons.length;

        // Update last sync time
        if (users.length > 0) {
            const lastSyncDate = users
                .map(user => user.lastSync)
                .filter(date => date)
                .sort((a, b) => new Date(b) - new Date(a))[0];
            
            document.getElementById('lastSync').textContent = lastSyncDate 
                ? new Date(lastSyncDate).toLocaleString()
                : 'Never';
        }
    } catch (error) {
        console.error('Error updating dashboard:', error);
    }
}

// User Management Functions
async function updateUsersList() {
    const loadingState = document.getElementById('loadingUsers');
    const usersList = document.getElementById('usersList');
    
    if (!usersList) return;

    try {
        if (loadingState) loadingState.classList.remove('hidden');
        usersList.innerHTML = '';
        
        const response = await fetch('/api/users', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch users');
        }
        
        const users = await response.json();
        
        if (users.length === 0) {
            usersList.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i data-lucide="users" class="w-12 h-12 mx-auto mb-2"></i>
                    <p>No users registered</p>
                </div>`;
            window.initIcons();
            return;
        }
        
        users.forEach(user => {
            const div = document.createElement('div');
            div.className = 'py-4 flex items-center justify-between';
            
            const lastSync = user.lastSync ? new Date(user.lastSync).toLocaleString() : 'Never';
            
            div.innerHTML = `
                <div class="user-info-section">
                    <h3 class="font-medium">${user.email}</h3>
                    <div class="text-sm text-gray-500">Last Sync: ${lastSync}</div>
                </div>
                <div class="flex gap-2">
                    <button onclick="syncUser('${user.email}')" 
                            class="p-2 text-blue-600 hover:bg-blue-50 rounded-lg">
                        <i data-lucide="refresh-cw" class="w-5 h-5"></i>
                    </button>
                    <button onclick="deleteUser('${user.email}')" 
                            class="p-2 text-red-600 hover:bg-red-50 rounded-lg">
                        <i data-lucide="trash-2" class="w-5 h-5"></i>
                    </button>
                </div>`;
            usersList.appendChild(div);
        });
        
        window.initIcons();
    } catch (error) {
        console.error('Error:', error);
        usersList.innerHTML = `
            <div class="p-4 bg-red-50 text-red-600 rounded-lg">
                <div class="flex items-center">
                    <i data-lucide="alert-circle" class="w-5 h-5 mr-2"></i>
                    Error loading users. Please try again.
                </div>
            </div>`;
        window.initIcons();
    } finally {
        if (loadingState) loadingState.classList.add('hidden');
    }
}
async function handleAddUser(event) {
    event.preventDefault();
    
    const email = document.getElementById('userEmail').value;
    const password = document.getElementById('userPassword').value;
    
    try {
        const response = await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('User added successfully');
            document.getElementById('userForm').reset();
            updateUsersList();
            updateDashboardStats();
        } else {
            alert(data.error || 'Failed to add user');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error adding user: ' + error.message);
    }
}

async function syncUser(email) {
    try {
        const response = await fetch(`/api/users/${encodeURIComponent(email)}/sync`, {
            method: 'POST',
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('User synced successfully');
            updateUsersList();
            updateDashboardStats();
        } else {
            alert(data.error || 'Failed to sync user');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error syncing user: ' + error.message);
    }
}

async function deleteUser(email) {
    if (!confirm('Are you sure you want to delete this user?')) return;
    
    try {
        const response = await fetch(`/api/users/${encodeURIComponent(email)}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (response.ok) {
            alert('User deleted successfully');
            updateUsersList();
            updateDashboardStats();
        } else {
            const data = await response.json();
            alert(data.error || 'Failed to delete user');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error deleting user: ' + error.message);
    }
}

// Addon Management Functions
async function updateAddonList() {
    const loadingState = document.getElementById('loadingState');
    const addonsList = document.getElementById('addons');
    
    if (!addonsList) return;

    try {
        if (loadingState) loadingState.classList.remove('hidden');
        addonsList.innerHTML = '';
        
        const response = await fetch('/api/addons', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch addons');
        }
        
        const addons = await response.json();
        
        if (!Array.isArray(addons) || addons.length === 0) {
            addonsList.innerHTML = `
                <div class="col-span-full text-center py-8 text-gray-500">
                    <i data-lucide="package" class="w-12 h-12 mx-auto mb-2"></i>
                    <p>No addons installed</p>
                </div>`;
            window.initIcons();
            return;
        }
        
        addons.forEach(addon => {
            const div = document.createElement('div');
            div.className = 'bg-white p-6 rounded-lg shadow-sm';
            
            let logo = addon.manifest.logo || addon.manifest.icon || '';
            
            div.innerHTML = `
                <div class="flex items-center justify-between mb-4">
                    ${logo ? `<img src="${logo}" alt="${addon.manifest.name} logo" 
                                 class="w-10 h-10 rounded" 
                                 onerror="this.style.display='none'">` : 
                           `<i data-lucide="package" class="w-10 h-10 text-gray-400"></i>`}
                    <button onclick="deleteAddon('${addon.manifest.id}')" 
                            class="text-red-600 hover:bg-red-50 p-2 rounded-lg">
                        <i data-lucide="trash-2" class="w-5 h-5"></i>
                    </button>
                </div>
                <h3 class="font-semibold text-lg mb-1">${addon.manifest.name}</h3>
                <div class="text-sm text-gray-500 mb-2">Version: ${addon.manifest.version}</div>
                <p class="text-gray-600 mb-4">${addon.manifest.description || 'No description available'}</p>
                <div class="text-xs text-gray-500 break-all pt-4 border-t">
                    URL: ${addon.transportUrl}
                </div>`;
            addonsList.appendChild(div);
        });
        
        window.initIcons();
    } catch (error) {
        console.error('Error:', error);
        addonsList.innerHTML = `
            <div class="col-span-full p-4 bg-red-50 text-red-600 rounded-lg">
                <div class="flex items-center mb-2">
                    <i data-lucide="alert-circle" class="w-5 h-5 mr-2"></i>
                    <strong>Error loading addons</strong>
                </div>
                <p class="text-sm">${error.message}</p>
            </div>`;
        window.initIcons();
    } finally {
        if (loadingState) loadingState.classList.add('hidden');
    }
}
// Stremio Auth functions
async function handleStremioRegister(event) {
    event.preventDefault();
    
    const email = document.getElementById('stremioRegEmail').value;
    const password = document.getElementById('stremioRegPassword').value;
    const gdprConsent = document.getElementById('gdprConsent').checked;
    
    if (!gdprConsent) {
        alert('Please accept the Terms of Service and Privacy Policy');
        return;
    }

    try {
        const response = await fetch('/api/stremio/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ 
                email, 
                password 
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('Successfully registered with Stremio! Now you can add this account to the managed accounts.');
            // Auto-fill the user management form
            document.getElementById('userEmail').value = email;
            document.getElementById('userPassword').value = password;
            document.getElementById('stremioRegisterForm').reset();
        } else {
            alert(data.error || 'Failed to register with Stremio');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error registering with Stremio: ' + error.message);
    }
}

async function handleAddAddon(event) {
    event.preventDefault();
    
    const url = document.getElementById('manifestUrl').value.trim();
    
    // Validate URL format
    try {
        new URL(url);
    } catch (e) {
        alert('Please enter a valid URL');
        return;
    }

    try {
        const response = await fetch('/api/addons', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ url })
        });

        const data = await response.json();
        
        if (response.ok && data.success) {
            alert('Addon added successfully');
            document.getElementById('addonForm').reset();
            updateAddonList();
            updateDashboardStats();
        } else {
            throw new Error(data.error || 'Failed to add addon');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error adding addon: ' + error.message);
    }
}

async function deleteAddon(id) {
    if (!confirm('Are you sure you want to delete this addon?')) return;
    
    try {
        const response = await fetch(`/api/addons/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (response.ok) {
            alert('Addon deleted successfully');
            updateAddonList();
            updateDashboardStats();
        } else {
            const data = await response.json();
            alert(data.error || 'Failed to delete addon');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error deleting addon: ' + error.message);
    }
}

// Import/Export Functions
async function handleImportFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
        const text = await file.text();
        const response = await fetch('/api/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: text
        });
        
        if (response.ok) {
            const result = await response.json();
            alert(`Import completed:\nSuccessful: ${result.results.success}\nFailed: ${result.results.failed}\nDuplicates: ${result.results.duplicates}`);
            updateAddonList();
            updateDashboardStats();
        } else {
            const error = await response.json();
            alert(error.error || 'Import failed');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Error importing addons: ' + error.message);
    }
    event.target.value = '';
}

async function exportAddons() {
    try {
        const response = await fetch('/api/export', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to export addons');
        }

        const data = await response.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'stremio-addons.json';
        a.click();
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error:', error);
        alert('Error exporting addons: ' + error.message);
    }
}

// Sync All Users
async function syncAllUsersWithProgress() {
    const progressContainer = document.getElementById('syncProgress');
    const progressBar = progressContainer.querySelector('.progress-fill');
    const statusText = progressContainer.querySelector('.sync-status');
    
    try {
        const response = await fetch('/api/users', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch users');
        }
        
        const users = await response.json();
        
        if (users.length === 0) {
            alert('No users to sync');
            return;
        }
        
        progressContainer.classList.remove('hidden');
        let completed = 0;
        
        for (const user of users) {
            statusText.textContent = `Syncing ${user.email}... (${completed + 1}/${users.length})`;
            progressBar.style.width = `${(completed / users.length) * 100}%`;
            
            try {
                await syncUser(user.email);
                completed++;
            } catch (error) {
                console.error(`Failed to sync user ${user.email}:`, error);
                statusText.textContent = `Error syncing ${user.email}. Continuing...`;
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        progressBar.style.width = '100%';
        statusText.textContent = `Completed syncing ${completed} out of ${users.length} users`;
        
        setTimeout(() => {
            progressContainer.classList.add('hidden');
            progressBar.style.width = '0';
            updateDashboardStats();
        }, 3000);
        
    } catch (error) {
        console.error('Error syncing all users:', error);
        alert('Error: ' + error.message);
        progressContainer.classList.add('hidden');
    }
}

// Make functions globally available
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.handleStremioRegister = handleStremioRegister;
window.handleAddUser = handleAddUser;
window.syncUser = syncUser;
window.deleteUser = deleteUser;
window.handleAddAddon = handleAddAddon;
window.deleteAddon = deleteAddon;
window.updateUsersList = updateUsersList;
window.updateAddonList = updateAddonList;
window.handleImportFile = handleImportFile;
window.exportAddons = exportAddons;
window.syncAllUsersWithProgress = syncAllUsersWithProgress;
window.updateDashboardStats = updateDashboardStats;

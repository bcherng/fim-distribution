document.addEventListener('DOMContentLoaded', function() {
    const machineSelect = document.getElementById('machineSelect');
    const machineIdInput = document.getElementById('machineId');
    const goBtn = document.getElementById('goBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const machineInfo = document.getElementById('machineInfo');
    const infoContent = document.getElementById('infoContent');
    const viewLogsBtn = document.getElementById('viewLogsBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const userWelcome = document.getElementById('userWelcome');

    // Check authentication
    const token = localStorage.getItem('fim_token');
    const user = JSON.parse(localStorage.getItem('fim_user') || '{}');
    
    if (!token) {
        window.location.href = '/login';
        return;
    }

    userWelcome.textContent = `Welcome, ${user.username}`;

    // Event listeners
    refreshBtn.addEventListener('click', loadMachines);
    goBtn.addEventListener('click', handleGoClick);
    machineSelect.addEventListener('change', handleMachineSelect);
    viewLogsBtn.addEventListener('click', handleViewLogs);
    logoutBtn.addEventListener('click', handleLogout);

    // Load machines on page load
    loadMachines();

    async function loadMachines() {
        try {
            machineSelect.innerHTML = '<option value="">Loading machines...</option>';
            machineSelect.disabled = true;
            refreshBtn.disabled = true;

            const response = await fetch('/api/clients', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.status === 401) {
                handleAuthError();
                return;
            }
            
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}`);
            }
            
            const data = await response.json();
            
            if (data.clients && data.clients.length > 0) {
                machineSelect.innerHTML = '<option value="">Select a machine...</option>';
                
                data.clients.forEach(client => {
                    const option = document.createElement('option');
                    option.value = client.client_id;
                    option.textContent = `${client.client_id} (${client.status}) - ${formatDate(client.last_seen)}`;
                    machineSelect.appendChild(option);
                });
                
                machineSelect.disabled = false;
            } else {
                machineSelect.innerHTML = '<option value="">No machines found</option>';
            }
        } catch (error) {
            console.error('Error loading machines:', error);
            machineSelect.innerHTML = '<option value="">Error loading machines</option>';
        } finally {
            refreshBtn.disabled = false;
        }
    }

    function handleGoClick() {
        const machineId = machineIdInput.value.trim();
        if (machineId) {
            loadMachineInfo(machineId);
        } else {
            alert('Please enter a Machine ID');
        }
    }

    function handleMachineSelect() {
        const selectedMachine = machineSelect.value;
        if (selectedMachine) {
            machineIdInput.value = selectedMachine;
            loadMachineInfo(selectedMachine);
        }
    }

    async function loadMachineInfo(machineId) {
        try {
            machineInfo.style.display = 'none';
            goBtn.disabled = true;
            
            const response = await fetch(`/api/clients/${encodeURIComponent(machineId)}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.status === 401) {
                handleAuthError();
                return;
            }
            
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error('Machine not found');
                }
                throw new Error(`Server returned ${response.status}`);
            }
            
            const data = await response.json();
            displayMachineInfo(data.client);
            
        } catch (error) {
            console.error('Error loading machine info:', error);
            alert(error.message);
        } finally {
            goBtn.disabled = false;
        }
    }

    function displayMachineInfo(client) {
        infoContent.innerHTML = `
            <div class="info-grid">
                <div class="info-item">
                    <strong>Client ID</strong>
                    ${escapeHtml(client.client_id)}
                </div>
                <div class="info-item">
                    <strong>Status</strong>
                    <span class="status-${client.status}">${escapeHtml(client.status)}</span>
                </div>
                <div class="info-item">
                    <strong>Last Seen</strong>
                    ${formatDate(client.last_seen)}
                </div>
                <div class="info-item">
                    <strong>File Count</strong>
                    ${client.file_count || 0}
                </div>
                <div class="info-item">
                    <strong>Current Root Hash</strong>
                    ${client.current_root_hash ? client.current_root_hash.substring(0, 16) + '...' : 'N/A'}
                </div>
                <div class="info-item">
                    <strong>Baseline ID</strong>
                    ${client.baseline_id || 1}
                </div>
            </div>
        `;
        
        machineInfo.style.display = 'block';
        viewLogsBtn.onclick = () => {
            window.location.href = `/machine/${encodeURIComponent(client.client_id)}`;
        };
    }

    function handleViewLogs() {
        const machineId = machineIdInput.value.trim();
        if (machineId) {
            window.location.href = `/machine/${encodeURIComponent(machineId)}`;
        } else {
            alert('Please select or enter a machine ID first');
        }
    }

    async function handleLogout() {
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            localStorage.removeItem('fim_token');
            localStorage.removeItem('fim_user');
            window.location.href = '/';
        }
    }

    function handleAuthError() {
        localStorage.removeItem('fim_token');
        localStorage.removeItem('fim_user');
        window.location.href = '/login';
    }

    // Utility functions
    function formatDate(dateString) {
        if (!dateString) return 'Never';
        const date = new Date(dateString);
        return date.toLocaleString();
    }

    function escapeHtml(unsafe) {
        if (unsafe === null || unsafe === undefined) return '';
        return unsafe.toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});
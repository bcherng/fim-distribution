document.addEventListener('DOMContentLoaded', function() {
    const machineIdDisplay = document.getElementById('machineIdDisplay');
    const machineStatus = document.getElementById('machineStatus');
    const lastSeen = document.getElementById('lastSeen');
    const eventsList = document.getElementById('eventsList');
    const refreshEventsBtn = document.getElementById('refreshEventsBtn');
    const eventLimit = document.getElementById('eventLimit');
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

    // Get machine ID from URL
    const pathParts = window.location.pathname.split('/');
    const machineId = pathParts[pathParts.length - 1];

    if (!machineId || machineId === 'machine') {
        window.location.href = '/dashboard';
        return;
    }

    // Event listeners
    refreshEventsBtn.addEventListener('click', loadEvents);
    eventLimit.addEventListener('change', loadEvents);
    logoutBtn.addEventListener('click', handleLogout);

    // Load machine info and events
    loadMachineInfo();
    loadEvents();

    async function loadMachineInfo() {
        try {
            machineIdDisplay.textContent = decodeURIComponent(machineId);
            
            const response = await fetch(`/api/clients/${machineId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (response.status === 401) {
                handleAuthError();
                return;
            }
            
            if (response.ok) {
                const data = await response.json();
                const client = data.client;
                
                machineStatus.innerHTML = `Status: <span class="status-${client.status}">${client.status}</span>`;
                lastSeen.textContent = `Last Seen: ${formatDate(client.last_seen)}`;
            }
        } catch (error) {
            console.error('Error loading machine info:', error);
        }
    }

    async function loadEvents() {
        try {
            eventsList.innerHTML = '<div class="loading">Loading events...</div>';
            refreshEventsBtn.disabled = true;

            const limit = eventLimit.value;
            const response = await fetch(`/api/clients/${machineId}/events?limit=${limit}`, {
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
            displayEvents(data.events);
            
        } catch (error) {
            console.error('Error loading events:', error);
            eventsList.innerHTML = `<div class="error-message">Error loading events: ${error.message}</div>`;
        } finally {
            refreshEventsBtn.disabled = false;
        }
    }

    function displayEvents(events) {
        if (!events || events.length === 0) {
            eventsList.innerHTML = '<div class="loading">No events found for this machine.</div>';
            return;
        }

        eventsList.innerHTML = events.map(event => `
            <div class="event-item">
                <div class="event-header">
                    <span class="event-type ${event.event_type}">${event.event_type}</span>
                    <span class="event-time">${formatDate(event.timestamp)}</span>
                </div>
                <div class="event-path">${escapeHtml(event.file_path || 'N/A')}</div>
                ${event.old_hash ? `<div class="event-hash">Old Hash: ${event.old_hash}</div>` : ''}
                ${event.new_hash ? `<div class="event-hash">New Hash: ${event.new_hash}</div>` : ''}
                ${event.root_hash ? `<div class="event-hash">Root Hash: ${event.root_hash.substring(0, 16)}...</div>` : ''}
            </div>
        `).join('');
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
        if (!dateString) return 'Unknown';
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
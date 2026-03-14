import { escapeHtml, checkAuth, logout, showToast } from './utils.js';

/**
 * Main application logic for the Machine Detail View.
 */
document.addEventListener('DOMContentLoaded', function () {
    const tabs = document.querySelectorAll('.tab-btn');
    const views = document.querySelectorAll('.view-section');
    const machineIdDisplay = document.getElementById('machineIdDisplay');
    const approvalContainer = document.getElementById('approvalContainer');
    const logTableBody = document.getElementById('logTableBody');
    const graphContainer = document.getElementById('graphContainer');

    const auth = checkAuth();
    if (!auth) return;
    const { token, user } = auth;

    const pathParts = window.location.pathname.split('/');
    const clientId = decodeURIComponent(pathParts[pathParts.length - 1]);

    machineIdDisplay.textContent = `Machine: ${clientId}`;
    document.getElementById('userWelcome').textContent = `Welcome, ${user.username}`;

    let currentGraphDate = null;
    const datePicker = document.getElementById('graphDatePicker');
    const prevDayBtn = document.getElementById('prevDayBtn');
    const nextDayBtn = document.getElementById('nextDayBtn');
    const todayBtn = document.getElementById('todayBtn');

    /**
     * Approves an event for the machine.
     * @param {string} eventId - The ID of the event to approve.
     */
    async function approveEvent(eventId) {
        try {
            const res = await fetch(`/api/events/${eventId}/review`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ approved: true })
            });

            if (res.ok) {
                loadApprovalQueue();
                showToast('Event approved successfully', 'success');
            } else {
                showToast('Failed to approve event', 'error');
            }
        } catch (err) {
            showToast(err.message, 'error');
        }
    }

    /**
     * fetus and displays the pending approval queue for the current machine.
     */
    async function loadApprovalQueue() {
        approvalContainer.innerHTML = '<div class="loading">Loading pending events...</div>';
        try {
            const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}/events?unreviewed_only=true&sort=asc&limit=50`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            const events = data.events || [];

            if (events.length === 0) {
                approvalContainer.innerHTML = '<p>No pending events to approve. System is clean.</p>';
                return;
            }

            const currentEvent = events[0];
            const remainingCount = events.length - 1;

            approvalContainer.innerHTML = `
                <div class="approval-card">
                    <h3>Pending Change (${remainingCount + 1} total)</h3>
                    <p><strong>Timestamp:</strong> ${new Date(currentEvent.timestamp).toLocaleString()}</p>
                    <p><strong>Type:</strong> ${currentEvent.event_type.toUpperCase()}</p>
                    <p><strong>File:</strong> ${escapeHtml(currentEvent.file_path)}</p>
                    <p><strong>Hash:</strong> <code>${currentEvent.new_hash ? currentEvent.new_hash.substring(0, 16) + '...' : 'N/A'}</code></p>
                    
                    <div class="approval-actions">
                        <button id="approveBtn" class="btn btn-success" style="background:#2ecc71; color:white; border:none; padding:10px 20px; border-radius:4px; cursor:pointer;">
                            Approve & Next
                        </button>
                    </div>
                </div>
            `;

            document.getElementById('approveBtn').onclick = () => approveEvent(currentEvent.id);

        } catch (err) {
            approvalContainer.innerHTML = `<p class="error">Error: ${err.message}</p>`;
        }
    }

    /**
     * fetus and displays the full event logs for the machine.
     */
    async function loadFullLogs() {
        logTableBody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';
        try {
            const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}/events?limit=200`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            const events = data.events || [];

            logTableBody.innerHTML = events.map(e => `
                <tr>
                    <td>${new Date(e.timestamp).toLocaleString()}</td>
                    <td>${e.event_type}</td>
                    <td title="${escapeHtml(e.file_path)}">${escapeHtml(e.file_path)}</td>
                    <td>
                        <span class="${e.verification_status === 'MISMATCH' ? 'status-mismatch' : (e.verification_status === 'UNVERIFIED' ? 'status-unverified' : 'status-verified')}">
                            ${e.verification_status || 'VERIFIED'}
                        </span>
                    </td>
                </tr>
            `).join('');
        } catch (err) {
            logTableBody.innerHTML = `<tr><td colspan="4">Error: ${err.message}</td></tr>`;
        }
    }

    /**
     * Renders a 24-hour activity graph for a specific machine and date.
     * @param {object} data - The uptime and event data from the API.
     * @param {Date} targetDate - The date to render for.
     */
    function render24hGraph(data, targetDate) {
        const events = data.events || [];
        const uptime = data.uptime || [];
        graphContainer.innerHTML = '';

        const dayStart = new Date(targetDate);
        dayStart.setHours(0, 0, 0, 0);

        const track = document.createElement('div');
        track.className = 'timeline-track';
        track.style.cssText = 'position: relative; height: 60vh; min-height: 60vh; background: #f1f2f6; border-radius: 4px; overflow: hidden; display: flex; width: 100%; align-items: stretch;';

        const SLOT_COUNT = 96;
        const SLOT_MS = 15 * 60 * 1000;

        for (let i = 0; i < SLOT_COUNT; i++) {
            const slotStart = new Date(dayStart.getTime() + i * SLOT_MS);
            const slotEnd = new Date(slotStart.getTime() + SLOT_MS);

            const block = document.createElement('div');
            block.style.flex = '1';
            block.style.height = '60vh';
            block.style.borderRight = '1px solid rgba(255,255,255,0.1)';
            block.style.transition = 'background 0.3s ease';

            let state = 'NO_DATA';
            for (const ut of uptime) {
                const start = new Date(ut.start_time);
                const end = ut.end_time ? new Date(ut.end_time) : new Date();

                if (slotStart < end && slotEnd > start) {
                    state = ut.state;
                }
            }

            let color = '#dfe4ea';
            if (state === 'UP') color = '#2ecc71';
            if (state === 'DOWN') color = '#e74c3c';
            if (state === 'SUSPECT') color = '#f1c40f';

            block.style.background = color;

            const slotEvents = events.filter(e => {
                const t = new Date(e.timestamp);
                return t >= slotStart && t < slotEnd;
            });

            if (slotEvents.length > 0) {
                const hasIntegrity = slotEvents.some(e => ['created', 'modified', 'deleted', 'directory_created', 'directory_modified', 'directory_deleted', 'directory_monitored_changed'].includes(e.event_type));
                const hasAlert = slotEvents.some(e => ['chain_conflict', 'unauthorized_change'].includes(e.event_type));

                if (hasAlert) {
                    block.style.background = '#2f3542';
                } else if (hasIntegrity) {
                    const pip = document.createElement('div');
                    pip.style.cssText = 'width: 4px; height: 4px; background: #e67e22; border-radius: 50%; margin: 2px auto; min-width: 4px; min-height: 4px;';
                    block.appendChild(pip);
                }

                const types = [...new Set(slotEvents.map(e => e.event_type))].join(', ');
                block.title = `${slotStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}: ${state} - Events: ${types}`;
            } else {
                block.title = `${slotStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}: ${state}`;
            }

            track.appendChild(block);
        }

        const labels = document.createElement('div');
        labels.style.cssText = 'display: flex; justify-content: space-between; margin-top: 10px; font-size: 0.75rem; color: #7f8c8d;';

        for (let i = 0; i <= 6; i++) {
            const t = new Date(dayStart.getTime() + (i * 4 * 60 * 60 * 1000));
            const span = document.createElement('span');
            span.textContent = i === 6 ? '23:59' : t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            labels.appendChild(span);
        }

        graphContainer.appendChild(track);
        graphContainer.appendChild(labels);
    }

    /**
     * fetus and displays the uptime/activity graph for the machine.
     */
    async function loadGraph() {
        if (!graphContainer) return;
        graphContainer.innerHTML = '<div class="loading">Loading graph...</div>';
        try {
            const dateStr = datePicker.value;
            const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}/uptime?date=${dateStr}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            render24hGraph(data, currentGraphDate);
        } catch (err) {
            graphContainer.innerHTML = `<p class="error">Error: ${err.message}</p>`;
        }
    }

    /**
     * Updates the date picker value based on the current graph date.
     */
    function updateDatePicker() {
        if (!datePicker) return;
        const yyyy = currentGraphDate.getFullYear();
        const mm = String(currentGraphDate.getMonth() + 1).padStart(2, '0');
        const dd = String(currentGraphDate.getDate()).padStart(2, '0');
        datePicker.value = `${yyyy}-${mm}-${dd}`;
    }

    tabs.forEach(btn => {
        btn.addEventListener('click', () => {
            tabs.forEach(b => b.classList.remove('active'));
            views.forEach(v => v.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`${btn.dataset.tab}View`).classList.add('active');

            if (btn.dataset.tab === 'approval') loadApprovalQueue();
            if (btn.dataset.tab === 'log') loadFullLogs();
            if (btn.dataset.tab === 'graph') {
                if (!currentGraphDate) {
                    currentGraphDate = new Date();
                    updateDatePicker();
                }
                loadGraph();
            }
        });
    });

    if (datePicker) {
        datePicker.addEventListener('change', (e) => {
            currentGraphDate = new Date(e.target.value + 'T00:00:00');
            loadGraph();
        });
    }

    if (prevDayBtn) {
        prevDayBtn.addEventListener('click', () => {
            currentGraphDate.setDate(currentGraphDate.getDate() - 1);
            updateDatePicker();
            loadGraph();
        });
    }

    if (nextDayBtn) {
        nextDayBtn.addEventListener('click', () => {
            currentGraphDate.setDate(currentGraphDate.getDate() + 1);
            updateDatePicker();
            loadGraph();
        });
    }

    if (todayBtn) {
        todayBtn.addEventListener('click', () => {
            currentGraphDate = new Date();
            updateDatePicker();
            loadGraph();
        });
    }

    document.getElementById('logoutBtn').addEventListener('click', () => logout(token));
    loadApprovalQueue();
});
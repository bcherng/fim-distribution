document.addEventListener('DOMContentLoaded', function () {
    const tabs = document.querySelectorAll('.tab-btn');
    const views = document.querySelectorAll('.view-section');
    const machineIdDisplay = document.getElementById('machineIdDisplay');
    const approvalContainer = document.getElementById('approvalContainer');
    const logTableBody = document.getElementById('logTableBody');
    const graphContainer = document.getElementById('graphContainer');

    // Auth & Client ID
    const token = localStorage.getItem('fim_token');
    const user = JSON.parse(localStorage.getItem('fim_user') || '{}');
    const pathParts = window.location.pathname.split('/');
    const clientId = decodeURIComponent(pathParts[pathParts.length - 1]); // /machine/:id

    if (!token) { window.location.href = '/login'; return; }
    document.getElementById('userWelcome').textContent = `Welcome, ${user.username}`;
    document.getElementById('logoutBtn').addEventListener('click', () => {
        localStorage.removeItem('fim_token');
        window.location.href = '/';
    });

    machineIdDisplay.textContent = `Machine: ${clientId}`;

    // Tab Switching
    tabs.forEach(btn => {
        btn.addEventListener('click', () => {
            tabs.forEach(b => b.classList.remove('active'));
            views.forEach(v => v.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(`${btn.dataset.tab}View`).classList.add('active');

            // Reload data for the view
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

    // -------- GRAPH MODE (Date Selection) --------
    let currentGraphDate = null;
    const datePicker = document.getElementById('graphDatePicker');
    const prevDayBtn = document.getElementById('prevDayBtn');
    const nextDayBtn = document.getElementById('nextDayBtn');
    const todayBtn = document.getElementById('todayBtn');

    function updateDatePicker() {
        if (!datePicker) return;
        const yyyy = currentGraphDate.getFullYear();
        const mm = String(currentGraphDate.getMonth() + 1).padStart(2, '0');
        const dd = String(currentGraphDate.getDate()).padStart(2, '0');
        datePicker.value = `${yyyy}-${mm}-${dd}`;
    }

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

    // -------- APPROVAL MODE --------
    async function loadApprovalQueue() {
        approvalContainer.innerHTML = '<div class="loading">Loading pending events...</div>';
        try {
            // Fetch oldest unreviewed first
            const res = await fetch(`/api/clients/${encodeURIComponent(clientId)}/events?unreviewed_only=true&sort=asc&limit=50`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            const events = data.events || [];

            if (events.length === 0) {
                approvalContainer.innerHTML = '<p>No pending events to approve. System is clean.</p>';
                return;
            }

            // Show oldest event specifically for approval
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
                // Refresh immediately to show next
                loadApprovalQueue();
            } else {
                alert('Failed to approve event');
            }
        } catch (err) {
            alert(err.message);
        }
    }

    // -------- LOG MODE --------
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
                        <span class="${e.reviewed ? 'status-reviewed' : 'status-pending'}">
                            ${e.reviewed ? 'Approved' : 'Pending'}
                        </span>
                    </td>
                </tr>
            `).join('');
        } catch (err) {
            logTableBody.innerHTML = `<tr><td colspan="4">Error: ${err.message}</td></tr>`;
        }
    }

    // -------- GRAPH MODE (24h) --------
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

    function render24hGraph(data, targetDate) {
        const events = data.events || [];
        const uptime = data.uptime || [];
        graphContainer.innerHTML = '';

        const dayStart = new Date(targetDate);
        dayStart.setHours(0, 0, 0, 0);

        const track = document.createElement('div');
        track.className = 'timeline-track';
        track.style = 'position: relative; height: 40px; background: #f1f2f6; border-radius: 4px; overflow: hidden; display: flex;';

        const SLOT_COUNT = 96;
        const SLOT_MS = 15 * 60 * 1000;

        // Snapping helper: snaps a date to the nearest 15m interval relative to day start
        function getSnappedSlotIndex(date) {
            const t = new Date(date).getTime();
            const diff = t - dayStart.getTime();
            return Math.round(diff / SLOT_MS);
        }

        for (let i = 0; i < SLOT_COUNT; i++) {
            const slotStart = new Date(dayStart.getTime() + i * SLOT_MS);
            const slotEnd = new Date(slotStart.getTime() + SLOT_MS);

            const block = document.createElement('div');
            block.style.flex = '1';
            block.style.height = '100%';
            block.style.borderRight = '1px solid rgba(255,255,255,0.1)';
            block.style.transition = 'background 0.3s ease';

            // 1. Determine base health color from uptime table
            let state = 'NO_DATA';
            for (const ut of uptime) {
                const start = new Date(ut.start_time);
                const end = ut.end_time ? new Date(ut.end_time) : new Date(); // Treat open as current

                // Snap boundaries
                const startSlot = getSnappedSlotIndex(start);
                const endSlot = Math.max(getSnappedSlotIndex(end), startSlot + (start.getTime() === end.getTime() ? 0 : 1));

                if (i >= startSlot && i < endSlot) {
                    state = ut.state;
                    // Don't break yet - let later records in the array (newer start times) overwrite if they overlap
                }
            }

            let color = '#dfe4ea'; // Gray
            if (state === 'UP') color = '#2ecc71'; // Green
            if (state === 'DOWN') color = '#e74c3c'; // Red
            if (state === 'SUSPECT') color = '#f1c40f'; // Yellow

            block.style.background = color;

            // 2. Overlay Events (Integrity, Attestation, etc.)
            const slotEvents = events.filter(e => {
                const t = new Date(e.timestamp);
                return t >= slotStart && t < slotEnd;
            });

            if (slotEvents.length > 0) {
                const hasIntegrity = slotEvents.some(e => ['created', 'modified', 'deleted', 'directory_created', 'directory_modified', 'directory_deleted', 'directory_monitored_changed'].includes(e.event_type));
                const hasAlert = slotEvents.some(e => ['attestation_failed', 'unauthorized_change'].includes(e.event_type));

                if (hasAlert) {
                    block.style.background = '#2f3542'; // Dark Grey/Black for serious alerts
                } else if (hasIntegrity) {
                    // Create an orange pip
                    const pip = document.createElement('div');
                    pip.style = 'width: 4px; height: 4px; background: #e67e22; border-radius: 50%; margin: 2px auto;';
                    block.appendChild(pip);
                }

                const types = [...new Set(slotEvents.map(e => e.event_type))].join(', ');
                block.title = `${slotStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}: ${state} - Events: ${types}`;
            } else {
                block.title = `${slotStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}: ${state}`;
            }

            track.appendChild(block);
        }

        // Add Time Labels (Every 4 hours)
        const labels = document.createElement('div');
        labels.style.display = 'flex';
        labels.style.justifyContent = 'space-between';
        labels.style.marginTop = '10px';
        labels.style.fontSize = '0.75rem';
        labels.style.color = '#7f8c8d';

        for (let i = 0; i <= 6; i++) {
            const t = new Date(dayStart.getTime() + (i * 4 * 60 * 60 * 1000));
            const span = document.createElement('span');
            span.textContent = i === 6 ? '23:59' : t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            labels.appendChild(span);
        }

        graphContainer.appendChild(track);
        graphContainer.appendChild(labels);
    }

    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    // Initial Load
    loadApprovalQueue();

    // Real-time updates via Pusher
    // (Requires config endpoint similar to dashboard, omitting for brevity unless requested, 
    // but the approval button callback handles the immediate refresh which is the critical real-time part for the user flow)
});
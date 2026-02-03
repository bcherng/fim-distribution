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
            const events = data.events || [];

            render24hGraph(events, currentGraphDate);
        } catch (err) {
            graphContainer.innerHTML = `<p class="error">Error: ${err.message}</p>`;
        }
    }

    function render24hGraph(events, targetDate) {
        graphContainer.innerHTML = '';

        // Define day boundaries in local time
        const dayStart = new Date(targetDate);
        dayStart.setHours(0, 0, 0, 0);

        const track = document.createElement('div');
        track.className = 'timeline-track';
        track.style.position = 'relative';
        track.style.height = '40px';
        track.style.background = '#f1f2f6';
        track.style.borderRadius = '4px';
        track.style.overflow = 'hidden';
        track.style.display = 'flex';

        if (events.length === 0) {
            track.innerHTML = '<div style="text-align: center; width: 100%; color: #95a5a6; padding-top: 10px;">No activity recorded for this date.</div>';
            graphContainer.appendChild(track);
            return;
        }

        // Divide day into 96 slots (15 mins each)
        const SLOT_COUNT = 96;
        const SLOT_MS = 15 * 60 * 1000;

        for (let i = 0; i < SLOT_COUNT; i++) {
            const slotStart = new Date(dayStart.getTime() + i * SLOT_MS);
            const slotEnd = new Date(slotStart.getTime() + SLOT_MS);

            // Collect events in this slot
            const slotEvents = events.filter(e => {
                const t = new Date(e.timestamp);
                return t >= slotStart && t < slotEnd;
            });

            const block = document.createElement('div');
            block.style.flex = '1';
            block.style.height = '100%';
            block.style.borderRight = '1px solid rgba(255,255,255,0.1)';

            if (slotEvents.length > 0) {
                // Determine types
                const types = new Set(slotEvents.map(e => {
                    if (['created', 'modified', 'deleted', 'directory_created', 'directory_modified', 'directory_deleted', 'directory_monitored_changed'].includes(e.event_type)) return 'INTEGRITY';
                    if (e.event_type === 'heartbeat') return 'UP';
                    if (e.event_type === 'heartbeat_missed') return 'DOWN';
                    if (e.event_type === 'attestation_failed') return 'SUSPECT';
                    return 'OTHER';
                }));

                // Color Logic
                let color = '#dfe4ea'; // default
                if (types.size > 1) {
                    color = '#2f3542'; // Conflict: Black
                } else {
                    const type = Array.from(types)[0];
                    if (type === 'UP') color = '#2ecc71'; // Green
                    else if (type === 'DOWN') color = '#e74c3c'; // Red
                    else if (type === 'SUSPECT') color = '#f1c40f'; // Yellow
                    else if (type === 'INTEGRITY') color = '#e67e22'; // Orange
                }

                block.style.background = color;

                // Tooltip
                const timeStr = `${slotStart.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                const eventCount = slotEvents.length;
                block.title = `${timeStr}: ${eventCount} event(s) - ${Array.from(types).join(', ')}`;
            } else {
                block.style.background = '#dfe4ea'; // Gray: No Data
                block.title = `No activity`;
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
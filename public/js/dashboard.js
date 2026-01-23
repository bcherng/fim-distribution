document.addEventListener('DOMContentLoaded', function () {
    const machineTableBody = document.getElementById('machineTableBody');
    const machineInfo = document.getElementById('machineInfo');
    const detailMachineId = document.getElementById('detailMachineId');
    const infoContent = document.getElementById('infoContent');
    const viewLogsBtn = document.getElementById('viewLogsBtn');
    const reviewBtn = document.getElementById('reviewBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const userWelcome = document.getElementById('userWelcome');
    const liveStatus = document.getElementById('liveStatus');
    const lastUpdated = document.getElementById('lastUpdated');
    const modalBackdrop = document.getElementById('modalBackdrop');
    const closeModalBtn = document.getElementById('closeModalBtn');

    // Removal elements
    const removalModal = document.getElementById('removalModal');
    const removalMachineId = document.getElementById('removalMachineId');
    const adminUsernameInput = document.getElementById('adminUsername');
    const adminPasswordInput = document.getElementById('adminPassword');
    const closeRemovalModalBtn = document.getElementById('closeRemovalModalBtn');
    const cancelRemovalBtn = document.getElementById('cancelRemovalBtn');
    const confirmRemovalBtn = document.getElementById('confirmRemovalBtn');

    // Real-time update state
    let dirtyClients = new Set();
    let clientToDelete = null;
    let pusher = null;
    let channel = null;

    // Check authentication
    const token = localStorage.getItem('fim_token');
    const user = JSON.parse(localStorage.getItem('fim_user') || '{}');

    if (!token) {
        window.location.href = '/login';
        return;
    }

    userWelcome.textContent = `Welcome, ${user.username}`;

    // Event listeners
    logoutBtn.addEventListener('click', handleLogout);
    reviewBtn.addEventListener('click', handleReview);

    // Modal closing logic
    const closeModal = () => {
        machineInfo.style.display = 'none';
        modalBackdrop.style.display = 'none';
    };

    closeModalBtn.addEventListener('click', closeModal);
    modalBackdrop.addEventListener('click', closeModal);

    // Removal Logic
    const closeRemovalModal = () => {
        removalModal.style.display = 'none';
        modalBackdrop.style.display = 'none';
        clientToDelete = null;
        adminUsernameInput.value = '';
        adminPasswordInput.value = '';
    };

    closeRemovalModalBtn.addEventListener('click', closeRemovalModal);
    cancelRemovalBtn.addEventListener('click', closeRemovalModal);
    confirmRemovalBtn.addEventListener('click', handleConfirmRemoval);

    // Initialize systems
    initPusher();
    setInterval(processBatchedUpdates, 5000);
    loadMachines();

    // Search Logic
    const searchInput = document.getElementById('searchInput');
    let machinesCache = []; // Store fetched machines for filtering

    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();
        filterAndRender(term);
    });

    function filterAndRender(term) {
        if (!term) {
            renderMachineTable(machinesCache);
            return;
        }
        const filtered = machinesCache.filter(m =>
            m.client_id.toLowerCase().includes(term) ||
            m.status.toLowerCase().includes(term)
        );
        renderMachineTable(filtered, true); // true = don't update cache
    }

    // Real-time Update Logic (Pusher)
    async function initPusher() {
        try {
            liveStatus.textContent = 'Pusher Connecting...';
            liveStatus.className = 'live-badge status-yellow';

            const configRes = await fetch('/api/config');
            const config = await configRes.json();

            if (!config.pusher || !config.pusher.key) {
                console.warn('[Pusher] Config missing, falling back to polling');
                liveStatus.textContent = 'Polling (Ready)';
                return;
            }

            pusher = new Pusher(config.pusher.key, {
                cluster: config.pusher.cluster,
                forceTLS: true
            });

            channel = pusher.subscribe('fim-updates');

            channel.bind('client_updated', (data) => {
                console.log('[Pusher] Event received:', data);
                if (data.clientId) {
                    dirtyClients.add(data.clientId);
                } else if (data.type === 'client_registered' || data.type === 'client_removed' || data.type === 'clients_timed_out') {
                    dirtyClients.add('__all__');
                }
            });

            pusher.connection.bind('connected', () => {
                console.log('[Pusher] Connected');
                liveStatus.textContent = 'Pusher (Live)';
                liveStatus.className = 'live-badge status-green';
            });

            pusher.connection.bind('disconnected', () => {
                console.log('[Pusher] Disconnected');
                liveStatus.textContent = 'Pusher (Offline)';
                liveStatus.className = 'live-badge status-red';
            });

            pusher.connection.bind('error', (err) => {
                console.error('[Pusher] Error:', err);
                liveStatus.textContent = 'Pusher Error';
                liveStatus.className = 'live-badge status-red';
            });

        } catch (error) {
            console.error('[Pusher] Init failed:', error);
            liveStatus.textContent = 'Pusher Error';
            liveStatus.className = 'live-badge status-red';
        }
    }

    async function processBatchedUpdates() {
        if (dirtyClients.size === 0) return;

        const currentDirty = new Set(dirtyClients);
        const needsFullRefresh = currentDirty.has('__all__');
        dirtyClients.clear();

        try {
            const response = await fetch('/api/clients', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const data = await response.json();
                if (needsFullRefresh) {
                    renderMachineTable(data.clients || []);
                } else {
                    updateSpecificRows(data.clients || [], currentDirty);
                }
                updateLastUpdatedTime();
            }
        } catch (error) {
            console.error('Error processing batched updates:', error);
        }
    }

    function updateSpecificRows(machines, dirtySet) {
        machines.forEach(m => {
            if (!dirtySet.has(m.client_id)) return;

            console.log(`[Dashboard] Updating row for ${m.client_id}, Last Seen: ${m.last_seen}, Status: ${m.status}`);

            const row = document.querySelector(`tr[data-client-id="${m.client_id}"]`);
            if (row) {
                console.log('[WS] Updating row for machine:', m.client_id);
                // Create temp table to parse new row HTML
                const newRowHtml = generateRowHtml(m);
                const tempTable = document.createElement('tbody');
                tempTable.innerHTML = newRowHtml;
                const newRow = tempTable.firstElementChild;
                if (newRow) {
                    row.replaceWith(newRow);
                }
            } else {
                renderMachineTable(machines);
            }
        });
    }

    function updateLastUpdatedTime() {
        const now = new Date();
        lastUpdated.textContent = `Last updated: ${now.toLocaleTimeString()}`;
    }

    // ... existing initPusher ...

    async function loadMachines() {
        try {
            machineTableBody.innerHTML = '<tr><td colspan="6" class="loading">Loading machines...</td></tr>';
            const response = await fetch('/api/clients', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.status === 401) {
                handleAuthError();
                return;
            }

            if (!response.ok) throw new Error(`Server returned ${response.status}`);

            const data = await response.json();
            machinesCache = data.clients || []; // Update cache
            // If search is active, re-apply it
            if (searchInput.value.trim()) {
                filterAndRender(searchInput.value.toLowerCase().trim());
            } else {
                renderMachineTable(machinesCache);
            }

        } catch (error) {
            console.error('Error loading machines:', error);
            machineTableBody.innerHTML = `<tr><td colspan="6" class="error">Error: ${error.message}</td></tr>`;
        }
    }

    // Use shared render logic
    function renderMachineTable(machines, skipCacheUpdate = false) {
        if (!skipCacheUpdate) machinesCache = machines;

        if (!machines || machines.length === 0) {
            machineTableBody.innerHTML = '<tr><td colspan="6" class="loading">No machines found.</td></tr>';
            return;
        }
        machineTableBody.innerHTML = machines.map(m => generateRowHtml(m)).join('');
        updateLastUpdatedTime();
    }

    function generateRowHtml(m) {
        let reachStatus = 'Healthy', reachColor = 'green';

        // Use server-side "latching" properties if available, or fallback to simple logic
        // The server now sends: status = 'online' | 'warning' | 'offline' | 'deregistered'

        if (m.status === 'deregistered') {
            reachStatus = 'Deregistered'; reachColor = 'grey';
        } else if (m.status === 'offline') {
            reachStatus = 'Offline'; reachColor = 'red';
        } else if (m.status === 'warning') { // Server-side latched warning
            reachStatus = 'Warning'; reachColor = 'yellow';
        } else if (m.missed_heartbeat_count >= 4) { // Fallback/Legacy logic
            reachStatus = 'Offline'; reachColor = 'red';
        } else if (m.missed_heartbeat_count >= 1) { // Fallback/Legacy logic
            reachStatus = 'Warning'; reachColor = 'yellow';
        }

        let attestStatus = 'Valid', attestColor = 'green';
        if (m.attestation_error_count > 0 || m.attestation_valid === false) { attestStatus = 'Failed'; attestColor = 'red'; }

        let integStatus = 'Clean', integColor = 'green';
        if (m.integrity_change_count > 1) { integStatus = `High Activity (${m.integrity_change_count})`; integColor = 'red'; }
        else if (m.integrity_change_count === 1) { integStatus = 'Modified (1)'; integColor = 'yellow'; }

        // Disable actions if deregistered
        const actionsDisabled = m.status === 'deregistered' ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : '';
        const removeBtn = m.status === 'deregistered'
            ? `<span title="Pending removal">⏳</span>`
            : `<button onclick="window.initiateRemoval('${m.client_id}')" class="btn-remove" title="Deregister machine">&times;</button>`;

        return `
            <tr data-client-id="${escapeHtml(m.client_id)}" style="${m.status === 'deregistered' ? 'opacity: 0.6;' : ''}">
                <td class="col-name"><div class="machine-name-cell" title="${escapeHtml(m.client_id)}">${escapeHtml(m.client_id)}</div></td>
                <td class="col-status">
                    <div class="status-wrapper" title="Reachability: ${reachStatus}">
                        <div class="status-circle status-${reachColor}" style="${reachColor === 'grey' ? 'background: #ccc;' : ''}"></div>
                        <span class="status-label">${reachStatus}</span>
                    </div>
                </td>
                <td class="col-status">
                    <div class="status-wrapper" title="Attestation: ${attestStatus}">
                        <div class="status-circle status-${attestColor}"></div>
                        <span class="status-label">${attestStatus}</span>
                    </div>
                </td>
                <td class="col-status">
                    <div class="status-wrapper" title="Integrity: ${integStatus}">
                        <div class="status-circle status-${integColor}"></div>
                        <span class="status-label">${integStatus}</span>
                    </div>
                </td>
                <td class="col-seen">${formatDate(m.last_seen)}</td>
                <td class="col-actions">
                    <button onclick="window.showMachineDetails('${m.client_id}')" class="btn btn-secondary" ${actionsDisabled}>Details</button>
                    ${removeBtn}
                </td>
            </tr>
        `;
    }

    // ... existing code ...

    async function handleConfirmRemoval() {
        if (!clientToDelete) return;

        const username = adminUsernameInput.value;
        const password = adminPasswordInput.value;

        if (!username || !password) {
            alert('Admin credentials are required for removal.');
            return;
        }

        const originalBtnText = confirmRemovalBtn.innerHTML;

        try {
            confirmRemovalBtn.disabled = true;
            confirmRemovalBtn.innerHTML = '<div class="spinner"></div>'; // Show spinner

            const response = await fetch(`/api/clients/${encodeURIComponent(clientToDelete)}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();
            if (response.ok) {
                // Change UI to indicate success/pending state without page reload if possible
                alert('Machine deregistered. It will stop communicating shortly.');
                closeRemovalModal();
                loadMachines(); // Reload to see "Deregistered" state
            } else {
                throw new Error(data.error || 'Failed to remove machine');
            }
        } catch (error) {
            alert(error.message);
        } finally {
            confirmRemovalBtn.disabled = false;
            confirmRemovalBtn.innerHTML = originalBtnText;
        }
    }



    window.showMachineDetails = function (clientId) {
        // Parallel fetch for details and uptime history
        Promise.all([
            fetch(`/api/clients/${encodeURIComponent(clientId)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }).then(r => r.json()),
            fetch(`/api/clients/${encodeURIComponent(clientId)}/uptime`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }).then(r => r.json())
        ])
            .then(([clientData, uptimeData]) => {
                const client = clientData.client;
                detailMachineId.textContent = client.client_id;

                infoContent.innerHTML = `
                <div class="info-grid" style="margin-bottom: 20px;">
                    <div class="info-item"><strong>Reachability</strong> ${client.status} (${client.missed_heartbeat_count} misses)</div>
                    <div class="info-item"><strong>Attestation</strong> ${client.attestation_error_count > 0 ? 'FAIL' : 'OK'}</div>
                    <div class="info-item"><strong>Integrity</strong> ${client.integrity_change_count} changes</div>
                    <div class="info-item"><strong>Files</strong> ${client.file_count || 0}</div>
                    <div class="info-item"><strong>Root Hash</strong> <code class="hash-code">${client.current_root_hash || 'N/A'}</code></div>
                    <div class="info-item"><strong>Last Review</strong> ${formatDate(client.last_reviewed_at)}</div>
                </div>
                <div class="chart-container" style="position: relative; height: 200px; width: 100%;">
                    <canvas id="uptimeChart"></canvas>
                </div>
            `;

                machineInfo.style.display = 'block';
                modalBackdrop.style.display = 'block';

                viewLogsBtn.onclick = () => window.location.href = `/machine/${encodeURIComponent(client.client_id)}`;
                reviewBtn.setAttribute('data-client-id', client.client_id);

                // Render Chart
                renderUptimeChart(uptimeData.intervals);
            })
            .catch(err => alert(err.message));
    };

    function renderUptimeChart(intervals) {
        const container = document.querySelector('.chart-container');
        container.innerHTML = ''; // Clear canvas
        container.style.height = 'auto'; // Adapt height

        const wrapper = document.createElement('div');
        wrapper.className = 'timeline-container';

        const today = new Date();
        today.setHours(23, 59, 59, 999); // End of today

        // Generate last 7 days
        for (let i = 0; i < 7; i++) {
            const dayEnd = new Date(today);
            dayEnd.setDate(dayEnd.getDate() - i);
            const dayStart = new Date(dayEnd);
            dayStart.setHours(0, 0, 0, 0);

            const row = document.createElement('div');
            row.className = 'timeline-row';

            const label = document.createElement('div');
            label.className = 'timeline-label';
            label.textContent = dayStart.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

            const track = document.createElement('div');
            track.className = 'timeline-track';
            track.title = 'No Data'; // Grey base

            // Filter intervals overlapping this day
            intervals.forEach(inv => {
                if (inv.state !== 'UP' && inv.state !== 'SUSPECT') return; // Only draw UP/SUSPECT as white blocks

                const invStart = new Date(inv.start);
                const invEnd = inv.end ? new Date(inv.end) : new Date();

                // Check overlap
                if (invEnd < dayStart || invStart > dayEnd) return;

                // Clip to day boundaries
                const drawStart = invStart < dayStart ? dayStart : invStart;
                const drawEnd = invEnd > dayEnd ? dayEnd : invEnd;

                // Calculate Position percentages
                const totalDayMs = 24 * 60 * 60 * 1000;
                const startMs = drawStart - dayStart;
                const durationMs = drawEnd - drawStart;

                if (durationMs <= 0) return;

                const leftPct = (startMs / totalDayMs) * 100;
                const widthPct = (durationMs / totalDayMs) * 100;

                const block = document.createElement('div');
                block.className = 'timeline-block block-up';
                block.style.left = `${leftPct}%`;
                block.style.width = `${widthPct}%`;
                block.title = `${inv.state}: ${drawStart.toLocaleTimeString()} - ${drawEnd.toLocaleTimeString()}`;

                track.appendChild(block);
            });

            row.appendChild(label);
            row.appendChild(track);
            // Append in reverse order (Today first)
            wrapper.appendChild(row);
        }

        container.appendChild(wrapper);
    }

    async function handleReview() {
        const clientId = reviewBtn.getAttribute('data-client-id');
        if (!clientId) return;

        try {
            reviewBtn.disabled = true;
            const response = await fetch(`/api/clients/${encodeURIComponent(clientId)}/review`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                alert('Review completed.');
                loadMachines();
                closeModal();
            } else {
                throw new Error('Failed to submit review');
            }
        } catch (error) {
            alert(error.message);
        } finally {
            reviewBtn.disabled = false;
        }
    }

    async function handleLogout() {
        try {
            await fetch('/api/auth/logout', { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
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

    function formatDate(dateString) {
        if (!dateString) return 'Never';
        return new Date(dateString).toLocaleString();
    }

    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe.toString()
            .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }
});

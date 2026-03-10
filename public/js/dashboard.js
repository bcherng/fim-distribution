import { escapeHtml, formatDate, checkAuth, logout, showToast } from './utils.js';

/**
 * Main application logic for the FIM Dashboard.
 */
document.addEventListener('DOMContentLoaded', function () {
    const machineTableBody = document.getElementById('machineTableBody');
    const machineInfo = document.getElementById('machineInfo');
    const detailMachineId = document.getElementById('detailMachineId');
    const infoContent = document.getElementById('infoContent');
    const viewLogsBtn = document.getElementById('viewLogsBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const userWelcome = document.getElementById('userWelcome');
    const liveStatus = document.getElementById('liveStatus');
    const lastUpdated = document.getElementById('lastUpdated');
    const modalBackdrop = document.getElementById('modalBackdrop');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const searchInput = document.getElementById('searchInput');

    const removalModal = document.getElementById('removalModal');
    const removalMachineId = document.getElementById('removalMachineId');
    const adminUsernameInput = document.getElementById('adminUsername');
    const adminPasswordInput = document.getElementById('adminPassword');
    const closeRemovalModalBtn = document.getElementById('closeRemovalModalBtn');
    const cancelRemovalBtn = document.getElementById('cancelRemovalBtn');
    const confirmRemovalBtn = document.getElementById('confirmRemovalBtn');

    let dirtyClients = new Set();
    let clientToDelete = null;
    let pusher = null;
    let channel = null;
    let machinesCache = [];

    const auth = checkAuth();
    if (!auth) return;
    const { token, user } = auth;

    userWelcome.textContent = `Welcome, ${user.username}`;

    /**
     * Closes the machine details modal.
     */
    const closeModal = () => {
        machineInfo.style.display = 'none';
        modalBackdrop.style.display = 'none';
    };

    /**
     * Closes the machine removal confirmation modal.
     */
    const closeRemovalModal = () => {
        removalModal.style.display = 'none';
        modalBackdrop.style.display = 'none';
        clientToDelete = null;
        adminUsernameInput.value = '';
        adminPasswordInput.value = '';
    };

    /**
     * Updates the "Last updated" timestamp on the UI.
     */
    function updateLastUpdatedTime() {
        const now = new Date();
        lastUpdated.textContent = `Last updated: ${now.toLocaleTimeString()}`;
    }

    /**
     * Generates the HTML for a single machine row in the table.
     * @param {object} m - The machine object.
     * @returns {string} The HTML string for the table row.
     */
    function generateRowHtml(m) {
        let reachStatus = 'Healthy', reachColor = 'green';

        if (m.status === 'deregistered') {
            reachStatus = 'Deregistered'; reachColor = 'grey';
        } else if (m.status === 'offline') {
            reachStatus = 'Offline'; reachColor = 'red';
        } else if (m.status === 'warning') {
            reachStatus = 'Warning'; reachColor = 'yellow';
        } else if (m.missed_heartbeat_count >= 4) {
            reachStatus = 'Offline'; reachColor = 'red';
        } else if (m.missed_heartbeat_count >= 1) {
            reachStatus = 'Warning'; reachColor = 'yellow';
        }

        let attestStatus = 'Valid', attestColor = 'green';
        if (m.attestation_error_count > 0 || m.is_attested === false) {
            attestStatus = 'Conflict'; attestColor = 'red';
        }

        let integStatus = m.integrity_state || 'CLEAN';
        let integColor = 'green';
        if (integStatus === 'TAMPERED') {
            integColor = 'red';
        } else if (integStatus === 'MODIFIED' || m.integrity_change_count > 0) {
            integStatus = `Modified (${m.integrity_change_count})`;
            integColor = 'yellow';
        }

        const actionsDisabled = m.status === 'deregistered' ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : '';

        let removeBtn;
        if (m.status === 'deregistered') {
            removeBtn = `<span title="Pending deregistration" class="pending-icon" style="font-size: 1.2rem; cursor: help; margin-right: 15px;">⏳</span>`;
        } else if (m.status === 'uninstalled') {
            return '';
        } else {
            removeBtn = `<button onclick="window.initiateRemoval(event, '${m.client_id}')" class="btn-remove" title="Deregister machine">&times;</button>`;
        }

        return `
            <tr data-client-id="${escapeHtml(m.client_id)}" style="cursor: pointer; ${m.status === 'deregistered' ? 'opacity: 0.6;' : ''}" onclick="window.navigateToMachine(event, '${escapeHtml(m.client_id)}')">
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
                    <button onclick="window.showMachineDetails(event, '${m.client_id}')" class="btn btn-secondary" ${actionsDisabled}>Details</button>
                    ${removeBtn}
                </td>
            </tr>
        `;
    }

    /**
     * Navigates to the specific machine view on row click.
     * @param {Event} e - The click event.
     * @param {string} clientId - The ID of the machine.
     */
    window.navigateToMachine = function (e, clientId) {
        // Don't navigate if clicking on an interactive element inside the row
        if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
            return;
        }
        window.location.href = `/machine/${encodeURIComponent(clientId)}`;
    };

    /**
     * Renders the entire machine table.
     * @param {Array} machines - The list of machine objects to render.
     * @param {boolean} skipCacheUpdate - If true, the internal machines cache will not be updated.
     */
    function renderMachineTable(machines, skipCacheUpdate = false) {
        if (!skipCacheUpdate) machinesCache = machines;

        if (!machines || machines.length === 0) {
            machineTableBody.innerHTML = '<tr><td colspan="6" class="loading">No machines found. Monitoring is currently inactive.</td></tr>';
            updateLastUpdatedTime();
            return;
        }
        machineTableBody.innerHTML = machines.map(m => generateRowHtml(m)).join('');
        updateLastUpdatedTime();
    }

    /**
     * Filters the machines cache based on the search term and re-renders the table.
     * @param {string} term - The search term.
     */
    function filterAndRender(term) {
        if (!term) {
            renderMachineTable(machinesCache);
            return;
        }
        const filtered = machinesCache.filter(m =>
            m.client_id.toLowerCase().includes(term) ||
            m.status.toLowerCase().includes(term)
        );
        renderMachineTable(filtered, true);
    }

    /**
     * fetish list of machines from the API and renders them.
     */
    async function loadMachines() {
        try {
            machineTableBody.innerHTML = '<tr><td colspan="6" class="loading">Loading machines...</td></tr>';
            const response = await fetch('/api/clients', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.status === 401) {
                logout(token);
                return;
            }

            if (!response.ok) throw new Error(`Server returned ${response.status}`);

            const data = await response.json();
            machinesCache = data.clients || [];
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

    /**
     * Updates specific rows in the machine table without a full re-render.
     * @param {Array} machines - The list of machine objects.
     * @param {Set} dirtySet - The set of laundry client IDs that need updating.
     */
    function updateSpecificRows(machines, dirtySet) {
        machines.forEach(m => {
            if (!dirtySet.has(m.client_id)) return;

            const row = document.querySelector(`tr[data-client-id="${m.client_id}"]`);
            if (row) {
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

    /**
     * Processes batched real-time updates from Pusher.
     */
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

    /**
     * Initializes the Pusher real-time update system.
     */
    async function initPusher() {
        try {
            liveStatus.textContent = 'Pusher Connecting...';
            liveStatus.className = 'live-badge status-yellow';

            const configRes = await fetch('/api/config');
            const config = await configRes.json();

            if (!config.pusher || !config.pusher.key) {
                liveStatus.textContent = 'Polling (Ready)';
                return;
            }

            pusher = new Pusher(config.pusher.key, {
                cluster: config.pusher.cluster,
                forceTLS: true
            });

            channel = pusher.subscribe('fim-updates');

            channel.bind('client_updated', (data) => {
                if (['client_registered', 'client_removed', 'client_uninstalled', 'client_reregistered'].includes(data.type)) {
                    dirtyClients.add('__all__');
                } else if (data.clientId) {
                    dirtyClients.add(data.clientId);
                }
            });

            pusher.connection.bind('connected', () => {
                liveStatus.textContent = 'Pusher (Live)';
                liveStatus.className = 'live-badge status-green';
            });

            pusher.connection.bind('disconnected', () => {
                liveStatus.textContent = 'Pusher (Offline)';
                liveStatus.className = 'live-badge status-red';
            });

            pusher.connection.bind('error', () => {
                liveStatus.textContent = 'Pusher Error';
                liveStatus.className = 'live-badge status-red';
            });

        } catch (error) {
            console.error('[Pusher] Init failed:', error);
            liveStatus.textContent = 'Pusher Error';
            liveStatus.className = 'live-badge status-red';
        }
    }

    /**
     * Handles the machine removal confirmation.
     */
    async function handleConfirmRemoval() {
        if (!clientToDelete) return;

        const username = adminUsernameInput.value;
        const password = adminPasswordInput.value;

        if (!username || !password) {
            showToast('Admin credentials are required for removal.', 'error');
            return;
        }

        const originalBtnText = confirmRemovalBtn.innerHTML;

        try {
            confirmRemovalBtn.disabled = true;
            confirmRemovalBtn.innerHTML = '<div class="spinner"></div>';

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
                showToast('Machine deregistered. It will stop communicating shortly.', 'success');
                closeRemovalModal();
                loadMachines();
            } else {
                throw new Error(data.error || 'Failed to remove machine');
            }
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            confirmRemovalBtn.disabled = false;
            confirmRemovalBtn.innerHTML = originalBtnText;
        }
    }

    /**
     * Displays details for a specific machine in a modal.
     * @param {Event} e - The click event.
     * @param {string} clientId - The ID of the machine to show details for.
     */
    window.showMachineDetails = function (e, clientId) {
        if (e) e.stopPropagation(); // prevent row click

        fetch(`/api/clients/${encodeURIComponent(clientId)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(r => r.json())
            .then(clientData => {
                const client = clientData.client;
                detailMachineId.textContent = client.client_id;

                infoContent.innerHTML = `
                <div class="info-grid" style="margin-bottom: 20px;">
                    <h4 style="margin-top:0; margin-bottom:15px; grid-column: 1/-1;">Machine Trust & Integrity: ${formatDate(client.last_reviewed_at)}</h4>
                    <div class="info-item"><strong>Reachability</strong> ${client.status}</div>
                    <div class="info-item"><strong>Downtime Intervals</strong> ${client.missed_heartbeat_count} (15 min)</div>
                    <div class="info-item"><strong>Trust (Attestation)</strong> ${client.attestation_status === 'FAILED' ? '<span style="color:red">CONFLICT</span>' : '<span style="color:green">VERIFIED</span>'}</div>
                    <div class="info-item"><strong>Data Integrity</strong> ${client.integrity_state === 'TAMPERED' ? '<span style="color:red">TAMPERED</span>' : (client.integrity_change_count > 0 ? `<span style="color:orange">MODIFIED (${client.integrity_change_count})</span>` : '<span style="color:green">CLEAN</span>')}</div>
                    <div class="info-item"><strong>Root Hash</strong> <code class="hash-code">${client.current_root_hash || 'N/A'}</code></div>
                </div>
            `;

                machineInfo.style.display = 'block';
                modalBackdrop.style.display = 'block';

                viewLogsBtn.onclick = () => window.location.href = `/machine/${encodeURIComponent(client.client_id)}`;
            })
            .catch(err => showToast(err.message, 'error'));
    };

    /**
     * Initiates the machine removal process by showing the confirmation modal.
     * @param {Event} e - The click event.
     * @param {string} clientId - The ID of the machine to remove.
     */
    window.initiateRemoval = function (e, clientId) {
        if (e) e.stopPropagation(); // prevent row click

        clientToDelete = clientId;
        removalMachineId.textContent = clientId;
        removalModal.style.display = 'block';
        modalBackdrop.style.display = 'block';
    };

    logoutBtn.addEventListener('click', () => logout(token));
    closeModalBtn.addEventListener('click', closeModal);
    modalBackdrop.addEventListener('click', closeModal);
    closeRemovalModalBtn.addEventListener('click', closeRemovalModal);
    cancelRemovalBtn.addEventListener('click', closeRemovalModal);
    confirmRemovalBtn.addEventListener('click', handleConfirmRemoval);

    searchInput.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase().trim();
        filterAndRender(term);
    });

    initPusher();
    setInterval(processBatchedUpdates, 5000);
    loadMachines();
});

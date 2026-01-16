document.addEventListener('DOMContentLoaded', function () {
    const machineTableBody = document.getElementById('machineTableBody');
    const refreshBtn = document.getElementById('refreshBtn');
    const machineInfo = document.getElementById('machineInfo');
    const detailMachineId = document.getElementById('detailMachineId');
    const infoContent = document.getElementById('infoContent');
    const viewLogsBtn = document.getElementById('viewLogsBtn');
    const reviewBtn = document.getElementById('reviewBtn');
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
    logoutBtn.addEventListener('click', handleLogout);
    reviewBtn.addEventListener('click', handleReview);

    // Load machines on page load
    loadMachines();

    async function loadMachines() {
        try {
            machineTableBody.innerHTML = '<tr><td colspan="6" class="loading">Loading machines...</td></tr>';
            refreshBtn.disabled = true;

            const response = await fetch('/api/clients', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.status === 401) {
                handleAuthError();
                return;
            }

            if (!response.ok) throw new Error(`Server returned ${response.status}`);

            const data = await response.json();
            renderMachineTable(data.clients || []);

        } catch (error) {
            console.error('Error loading machines:', error);
            machineTableBody.innerHTML = `<tr><td colspan="6" class="error">Error: ${error.message}</td></tr>`;
        } finally {
            refreshBtn.disabled = false;
        }
    }

    function renderMachineTable(machines) {
        if (!machines || machines.length === 0) {
            machineTableBody.innerHTML = '<tr><td colspan="6" class="loading">No machines found.</td></tr>';
            return;
        }

        machineTableBody.innerHTML = machines.map(m => {
            // Reachability Logic
            let reachStatus = 'Healthy';
            let reachColor = 'green';
            if (m.status === 'offline') {
                reachStatus = 'Down';
                reachColor = 'red';
            } else if (m.missed_heartbeat_count > 0) {
                reachStatus = 'Incidents';
                reachColor = 'yellow';
            }

            // Attestation Logic
            let attestStatus = 'Valid';
            let attestColor = 'green';
            if (m.attestation_error_count > 0 || m.attestation_valid === false) {
                attestStatus = 'Failed';
                attestColor = 'red';
            }

            // Integrity Logic
            let integStatus = 'Clean';
            let integColor = 'green';
            if (m.integrity_change_count > 1) {
                integStatus = `High Activity (${m.integrity_change_count})`;
                integColor = 'red';
            } else if (m.integrity_change_count === 1) {
                integStatus = 'Modified (1)';
                integColor = 'yellow';
            }

            return `
                <tr>
                    <td class="col-name"><div class="machine-name-cell" title="${escapeHtml(m.client_id)}">${escapeHtml(m.client_id)}</div></td>
                    <td class="col-status">
                        <div class="status-wrapper" title="Reachability: ${reachStatus}">
                            <div class="status-circle status-${reachColor}"></div>
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
                        <button onclick="window.showMachineDetails('${m.client_id}')" class="btn btn-secondary">Details</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Expose showMachineDetails to window for the onclick handler
    window.showMachineDetails = function (clientId) {
        fetch(`/api/clients/${encodeURIComponent(clientId)}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(response => {
                if (response.status === 401) {
                    handleAuthError();
                    throw new Error('Authentication failed');
                }
                if (!response.ok) throw new Error('Failed to fetch details');
                return response.json();
            })
            .then(data => {
                const client = data.client;
                if (!client) throw new Error('Client data missing');

                detailMachineId.textContent = client.client_id;
                infoContent.innerHTML = `
                <div class="info-grid">
                    <div class="info-item"><strong>Reachability Status</strong> ${client.status} (${client.missed_heartbeat_count} misses)</div>
                    <div class="info-item"><strong>Attestation Status</strong> ${client.attestation_error_count > 0 ? 'FAIL' : 'OK'}</div>
                    <div class="info-item"><strong>Integrity Count</strong> ${client.integrity_change_count} changes</div>
                    <div class="info-item"><strong>File Count</strong> ${client.file_count || 0}</div>
                    <div class="info-item"><strong>Current Root Hash</strong> <code class="hash-code">${client.current_root_hash || 'N/A'}</code></div>
                    <div class="info-item"><strong>Last Review</strong> ${formatDate(client.last_reviewed_at)}</div>
                </div>
            `;
                machineInfo.style.display = 'block';
                machineInfo.scrollIntoView({ behavior: 'smooth' });

                viewLogsBtn.onclick = () => window.location.href = `/machine/${encodeURIComponent(client.client_id)}`;
                reviewBtn.setAttribute('data-client-id', client.client_id);
            })
            .catch(err => alert(err.message));
    };

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
                alert('Review completed. Indicators reset.');
                loadMachines();
                machineInfo.style.display = 'none';
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
            await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
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
        const date = new Date(dateString);
        return date.toLocaleString();
    }

    function escapeHtml(unsafe) {
        if (!unsafe) return '';
        return unsafe.toString()
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});

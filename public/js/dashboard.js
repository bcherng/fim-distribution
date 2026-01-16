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

    function renderMachineTable(clients) {
        if (clients.length === 0) {
            machineTableBody.innerHTML = '<tr><td colspan="6" class="empty">No machines registered</td></tr>';
            return;
        }

        machineTableBody.innerHTML = '';
        clients.forEach(client => {
            const tr = document.createElement('tr');
            tr.className = 'machine-row';
            tr.onclick = () => showMachineDetails(client);

            // Reachability Logic
            let reachStatus = 'green';
            let reachText = 'Healthy';
            if (client.status === 'offline') {
                reachStatus = 'red';
                reachText = 'Down';
            } else if (client.missed_heartbeat_count > 0) {
                reachStatus = 'yellow';
                reachText = `Incidents (${client.missed_heartbeat_count})`;
            }

            // Attestation Logic
            let attStatus = client.attestation_error_count > 0 ? 'red' : 'green';
            let attText = client.attestation_error_count > 0 ? `Failed (${client.attestation_error_count})` : 'Valid';

            // Integrity Logic
            let intStatus = 'green';
            let intText = 'Clean';
            if (client.integrity_change_count > 1) {
                intStatus = 'red';
                intText = `High Activity (${client.integrity_change_count})`;
            } else if (client.integrity_change_count === 1) {
                intStatus = 'yellow';
                intText = 'Modified (1)';
            }

            tr.innerHTML = `
                <td><strong>${escapeHtml(client.client_id)}</strong></td>
                <td><span class="status-indicator status-${reachStatus}">${reachText}</span></td>
                <td><span class="status-indicator status-${attStatus}">${attText}</span></td>
                <td><span class="status-indicator status-${intStatus}">${intText}</span></td>
                <td>${formatDate(client.last_seen)}</td>
                <td><button class="btn btn-small btn-secondary">Details</button></td>
            `;
            machineTableBody.appendChild(tr);
        });
    }

    function showMachineDetails(client) {
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

        viewLogsBtn.onclick = () => {
            window.location.href = `/machine/${encodeURIComponent(client.client_id)}`;
        };

        // Update review button for this specific client
        reviewBtn.setAttribute('data-client-id', client.client_id);
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
                alert('Review completed. Indicators reset.');
                loadMachines(); // Refresh list
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

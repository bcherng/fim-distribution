document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const errorMessage = document.getElementById('errorMessage');

    loginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = new FormData(loginForm);
        const username = formData.get('username');
        const password = formData.get('password');

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok) {
                // Store token and redirect to dashboard
                localStorage.setItem('fim_token', data.token);
                localStorage.setItem('fim_user', JSON.stringify(data.user));
                window.location.href = '/dashboard';
            } else {
                showError(data.error);
            }
        } catch (error) {
            showError('Network error. Please try again.');
        }
    });

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
    }

    // Check if already logged in
    const token = localStorage.getItem('fim_token');
    if (token) {
        window.location.href = '/dashboard';
    }
});
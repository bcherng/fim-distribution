import { showToast } from './utils.js';

/**
 * Initializes the login page and handles the authentication form submission.
 */
document.addEventListener('DOMContentLoaded', function () {
    const loginForm = document.getElementById('loginForm');

    /**
     * Displays an error message on the login form.
     * @param {string} message - The error message to show.
     */
    function showError(message) {
        showToast(message, 'error');
    }

    loginForm.addEventListener('submit', async function (e) {
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

    const token = localStorage.getItem('fim_token');
    if (token) {
        window.location.href = '/dashboard';
    }
});
// Placeholder download URLs (replace with GitHub release redirects)
const linuxInstaller = '/downloads/linux';
const windowsInstaller = '/downloads/windows';

document.getElementById('linuxDownload').href = linuxInstaller;
document.getElementById('windowsDownload').href = windowsInstaller;

// Login button redirect to dashboard
document.getElementById('loginBtn').addEventListener('click', () => {
  window.location.href = '/dashboard';
});


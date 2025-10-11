const express = require('express');
const path = require('path');
const app = express();

const downloadsPath = path.join(__dirname, '..', 'public', 'downloads');

app.use('/downloads', express.static(downloadsPath, {
  index: false, // Disable directory indexing
  dotfiles: 'deny', // Deny access to dotfiles
  setHeaders: (res, path) => {
    // Set proper MIME type for .exe files
    if (path.endsWith('.exe')) {
      res.set('Content-Type', 'application/vnd.microsoft.portable-executable');
      res.set('Content-Disposition', 'attachment; filename="FIM-Daemon-Setup.exe"');
    }
  }
}));

app.get('/downloads/*/', (req, res) => {
  const originalUrl = req.originalUrl;
  const cleanUrl = originalUrl.replace(/\/+$/, '');
  res.redirect(301, cleanUrl);
});

app.get('/', (req, res) => {
  res.send(`
    <h1>FIM Distribution</h1>
    <p><a href="/downloads/fim-daemon.deb">Linux Installer(.deb)</a></p>
    <p><a href="/downloads/FIM-Daemon-Setup.exe">Windows Installer(.exe)</a></p>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

const express = require('express');
const path = require('path');
const app = express();

const downloadsPath = path.join(__dirname, '..', 'public', 'downloads', 'src', 'Output');

app.get('/downloads/FIM-Daemon-Setup.exe', (req, res) => {
  const file = path.join(downloadsPath, 'FIM-Daemon-Setup.exe');
  res.download(file); // Express handles everything automatically
});

app.get('/downloads/fim-daemon.deb', (req, res) => {
  const file = path.join(downloadsPath, 'fim-daemon.deb');
  res.download(file);
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

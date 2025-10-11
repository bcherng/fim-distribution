const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

const downloadsPath = path.join(__dirname, '..', 'public', 'downloads');
const filePath = path.join(downloadsPath, 'FIM-Daemon-Setup.exe');

console.log('Server directory:', __dirname);
console.log('Downloads path:', downloadsPath);
console.log('Full file path:', filePath);
console.log('File exists:', fs.existsSync(filePath));

app.use('/downloads', express.static(downloadsPath));

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

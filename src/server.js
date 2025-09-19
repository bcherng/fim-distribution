const express = require('express');
const path = require('path');
const app = express();

app.use('/downloads', express.static(path.join(__dirname, '../public/downloads')));

app.get('/', (req, res) => {
  res.send(`
    <h1>FIM Distribution</h1>
    <p><a href="/downloads/fim-daemon.deb">Linux Installer(.deb)</a></p>
    <p><a href="/downloads/fim-daemon-setup.exe">Windows Installer (.exe)</a></p>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

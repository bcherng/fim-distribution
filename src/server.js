const express = require('express');
const path = require('path');
const fetch = require('node-fetch');  
const app = express();

const REPO_OWNER = 'bcherng';
const REPO_NAME = 'fim-daemon';
const ASSET_WINDOWS_PATTERN = /\.exe$/i;
const ASSET_LINUX_PATTERN = /\.deb$/i;
const GITHUB_API = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`;

app.get('/', async (req, res) => {
  try {
    const response = await fetch(GITHUB_API, {
      headers: { 'Accept': 'application/vnd.github+json' }
    });
    if (!response.ok) {
      throw new Error(`GitHub API responded ${response.status}`);
    }
    const release = await response.json();

    const assets = release.assets || [];
    const windowsAsset = assets.find(a => ASSET_WINDOWS_PATTERN.test(a.name));
    const linuxAsset   = assets.find(a => ASSET_LINUX_PATTERN.test(a.name));

    const winUrl = windowsAsset ? windowsAsset.browser_download_url : '#';
    const linuxUrl = linuxAsset ? linuxAsset.browser_download_url : '#';
    const version = release.tag_name;

    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>FIM Distribution</title>
        <style>
          body { font-family: Arial, sans-serif; background: #f4f4f4; color: #333; text-align: center; padding: 40px; }
          .container { background: #fff; padding: 20px 40px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); display: inline-block; }
          h1 { margin-bottom: 0.2em; }
          p.version { color: #888; font-size: 0.9em; }
          a.button { display: inline-block; margin: 10px 20px; padding: 12px 24px; background: #0070f3; color: white; text-decoration: none; border-radius: 4px; }
          a.button:hover { background: #005bb5; }
          .footer { margin-top: 40px; font-size: 0.8em; color: #aaa; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>FIM Distribution</h1>
          <p class="version">Latest version: <strong>${version}</strong></p>
          <p><a class="button" href="${winUrl}">Download Windows Installer (.exe)</a></p>
          <p><a class="button" href="${linuxUrl}">Download Linux Package (.deb)</a></p>
        </div>
        <div class="footer">
          Built from <a href="https://github.com/${REPO_OWNER}/${REPO_NAME}/releases">${REPO_OWNER}/${REPO_NAME} Releases</a>.
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Error fetching release data:', err);
    res.status(500).send('Error retrieving latest release information');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

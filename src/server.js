// server.js
import express from 'express';
import path from 'path';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Function to fetch the latest release assets from GitHub
async function getLatestReleaseAssets() {
  const owner = 'YOUR_GITHUB_USERNAME';
  const repo = 'fim-daemon';
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;

  try {
    const res = await fetch(apiUrl, {
      headers: { 'Accept': 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
    const data = await res.json();
    return data.assets; // Array of release assets
  } catch (err) {
    console.error('Error fetching GitHub release:', err);
    return [];
  }
}

app.get('/downloads/windows', async (req, res) => {
  const assets = await getLatestReleaseAssets();
  const winAsset = assets.find(a => a.name.endsWith('.exe'));
  if (!winAsset) return res.status(404).send('Windows installer not found');
  res.redirect(winAsset.browser_download_url); // Redirect to GitHub download URL
});

app.get('/downloads/linux', async (req, res) => {
  const assets = await getLatestReleaseAssets();
  const debAsset = assets.find(a => a.name.endsWith('.deb'));
  if (!debAsset) return res.status(404).send('Linux installer not found');
  res.redirect(debAsset.browser_download_url);
});

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>FIM Distribution</title>
        <style>
          body { font-family: sans-serif; max-width: 600px; margin: auto; padding: 2rem; }
          h1 { color: #2c3e50; }
          a.button {
            display: inline-block;
            padding: 0.5rem 1rem;
            margin: 0.5rem 0;
            background: #3498db;
            color: white;
            text-decoration: none;
            border-radius: 4px;
          }
          a.button:hover { background: #2980b9; }
        </style>
      </head>
      <body>
        <h1>FIM Distribution</h1>
        <p><a class="button" href="/downloads/linux">Linux Installer (.deb)</a></p>
        <p><a class="button" href="/downloads/windows">Windows Installer (.exe)</a></p>
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});

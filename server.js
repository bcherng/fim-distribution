import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.static(path.join(__dirname, 'public')));

// Index page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Dashboard page
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Machine page
app.get('/machine/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'machine.html'));
});


// Function to fetch the latest release assets from GitHub
async function getLatestReleaseAssets() {
  const owner = 'bcherng';
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
  const winAsset = assets.find(a => a.name.toLowerCase().endsWith('.exe'));
  if (!winAsset) return res.status(404).send('Windows installer not found');
  res.redirect(winAsset.browser_download_url);
});

app.get('/downloads/linux', async (req, res) => {
  const assets = await getLatestReleaseAssets();
  const debAsset = assets.find(a => a.name.toLowerCase().endsWith('.deb'));
  if (!debAsset) return res.status(404).send('Linux installer not found');
  res.redirect(debAsset.browser_download_url);
});
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

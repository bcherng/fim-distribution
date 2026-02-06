import { getLatestReleaseAssets } from '../../services/github.js';

export const downloadWindows = async (req, res) => {
    const assets = await getLatestReleaseAssets();
    const winAsset = assets.find(a => a.name.toLowerCase().endsWith('.exe'));
    if (!winAsset) return res.status(404).send('Windows installer not found');
    res.redirect(winAsset.browser_download_url);
};

export const downloadLinux = async (req, res) => {
    const assets = await getLatestReleaseAssets();
    const debAsset = assets.find(a => a.name.toLowerCase().endsWith('.deb'));
    if (!debAsset) return res.status(404).send('Linux installer not found');
    res.redirect(debAsset.browser_download_url);
};

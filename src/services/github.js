/**
 * @desc Get the latest release assets from GitHub for downloads
 */
export async function getLatestReleaseAssets() {
    const owner = 'bcherng';
    const repo = 'fim-daemon';
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;

    try {
        const res = await fetch(apiUrl, {
            headers: { 'Accept': 'application/vnd.github+json' }
        });

        if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);

        const data = await res.json();
        return data.assets;
    } catch (err) {
        console.error('Error fetching GitHub release:', err);
        return [];
    }
}

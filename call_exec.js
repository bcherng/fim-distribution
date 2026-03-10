import fs from 'fs';

async function main() {
    try {
        const r = await fetch('https://fim-distribution.vercel.app/api/diag/test_insert?bust=999');
        const t = await r.text();
        fs.writeFileSync('out.json', t);
        console.log("Saved to out.json");
    } catch (e) {
        console.error("Fetch failed:", e);
    }
}
main();

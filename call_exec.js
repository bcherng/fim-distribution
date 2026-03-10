import fs from 'fs';

async function main() {
    const query = process.argv[2] || "SELECT table_name, view_definition FROM information_schema.views WHERE table_schema = 'public'";
    console.log("Executing:", query);

    try {
        const r = await fetch('https://fim-distribution.vercel.app/api/diag/exec?secret=tempadmin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query })
        });
        const t = await r.text();
        fs.writeFileSync('out.json', t);
        console.log("Saved to out.json");
    } catch (e) {
        console.error("Fetch failed:", e);
    }
}
main();

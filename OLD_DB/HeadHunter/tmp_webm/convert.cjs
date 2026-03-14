const fs = require('fs');
const https = require('https');
const { execSync } = require('child_process');

(async () => {
    try {
        console.log("Downloading GIF...");
        const fetch = require('node-fetch');
        const res = await fetch("https://hh.nerou.fun/assets/chest.gif", {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
                "Accept": "image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
            }
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const buffer = await res.buffer();
        fs.writeFileSync("chest.gif", buffer);
        console.log(`Downloaded ${buffer.length} bytes`);

        console.log("Converting to WebM VP9...");
        execSync("../server/ffmpeg-7.0.2-amd64-static/ffmpeg -y -i chest.gif -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 500k -minrate 500k -maxrate 500k -lossless 1 -auto-alt-ref 0 -speed 2 -vf 'scale=512:512,fps=30' chest.webm", { stdio: 'inherit' });

        console.log("Conversion complete.");
    } catch (e) {
        console.error(e);
    }
})();

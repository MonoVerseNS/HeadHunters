const fs = require('fs');
const zlib = require('zlib');
const { execSync } = require('child_process');

console.log("Extracting one frame to PNG...");
try { fs.unlinkSync("frame.png"); } catch (e) { }
execSync("../server/ffmpeg-7.0.2-amd64-static/ffmpeg -y -i new_gif.gif -vframes 1 -vf 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0' frame.png");

const pngData = fs.readFileSync("frame.png").toString('base64');
const base64Str = "data:image/png;base64," + pngData;

const lottieJson = {
    "v": "5.5.2",
    "fr": 30,
    "ip": 0,
    "op": 60,
    "w": 512,
    "h": 512,
    "nm": "Static Image",
    "ddd": 0,
    "assets": [
        {
            "id": "image_0",
            "w": 512,
            "h": 512,
            "u": "",
            "p": base64Str,
            "e": 1
        }
    ],
    "layers": [
        {
            "ty": 2, // Image layer
            "nm": "Image",
            "refId": "image_0",
            "ind": 1,
            "ip": 0,
            "op": 60,
            "st": 0,
            "bm": 0,
            "ks": {
                "o": { "a": 0, "k": 100 },
                "r": { "a": 0, "k": 0 },
                "p": { "a": 0, "k": [256, 256, 0] },
                "a": { "a": 0, "k": [256, 256, 0] },
                "s": { "a": 0, "k": [100, 100, 100] }
            }
        }
    ]
};

const jsonStr = JSON.stringify(lottieJson);
const gzipped = zlib.gzipSync(jsonStr);
fs.writeFileSync("custom.tgs", gzipped);

console.log("custom.tgs created successfully. Size:", gzipped.length, "bytes");

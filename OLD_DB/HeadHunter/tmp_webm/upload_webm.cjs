const { Api, TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const fs = require("fs");

const apiId = 34961217;
const apiHash = "457da57bdb5b16fd43740703f8b0ad21";
const botToken = "8437729919:AAF-NRihptuYhFIhcberNiJ0kD746Cdlv3Y";
const stringSession = new StringSession("");

(async () => {
    try {
        console.log("Connecting...");
        const client = new TelegramClient(stringSession, apiId, apiHash, {
            connectionRetries: 5,
        });
        await client.start({
            botAuthToken: botToken,
        });
        console.log("Connected.");

        const buffer = fs.readFileSync("new_sticker.webm");
        const { CustomFile } = require("telegram/client/uploads");
        const toUpload = new CustomFile("new_sticker.webm", buffer.length, "", buffer);

        console.log("Uploading...");
        const message = await client.sendFile("-5283470646", {
            file: toUpload,
            forceDocument: true,
            mimeType: "video/webm",
            attributes: [
                new Api.DocumentAttributeSticker({
                    alt: "🎁",
                    stickerset: new Api.InputStickerSetEmpty(),
                }),
                new Api.DocumentAttributeVideo({
                    roundMessage: false,
                    supportsStreaming: true,
                    w: 512,
                    h: 512,
                    duration: 2,
                })
            ]
        });

        console.log("Message sent", message.id);
        if (message.document) {
            console.log("id:", message.document.id.toString());
            console.log("accessHash:", message.document.accessHash.toString());
            console.log("fileReference:", message.document.fileReference.toString('hex'));
            console.log("mimeType:", message.document.mimeType);
            console.log("size:", message.document.size.toString());
            console.log("attributes:", JSON.stringify(message.document.attributes.map(a => a.className)));
        }

    } catch (e) {
        console.error(e);
    }
    process.exit(0);
})();

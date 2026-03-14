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

        const buffer = fs.readFileSync("custom.tgs");
        const { CustomFile } = require("telegram/client/uploads");
        const toUpload = new CustomFile("custom.tgs", buffer.length, "", buffer);

        console.log("Uploading file to Telegram Cloud...");
        const uploadedFile = await client.uploadFile({
            file: toUpload,
            workers: 1,
        });

        console.log("Sending explicit TGS Sticker Media...");
        const result = await client.invoke(
            new Api.messages.SendMedia({
                peer: "-5283470646",
                media: new Api.InputMediaUploadedDocument({
                    file: uploadedFile,
                    mimeType: "application/x-tgsticker",
                    attributes: [
                        new Api.DocumentAttributeSticker({
                            alt: "🎁",
                            stickerset: new Api.InputStickerSetEmpty(),
                        }),
                        new Api.DocumentAttributeFilename({
                            fileName: "sticker.tgs"
                        })
                    ],
                    forceFile: false
                }),
                message: "Here is the raw TGS sticker",
                randomId: BigInt(Math.floor(Math.random() * 100000000000)),
            })
        );

        console.log("Result received");
        let msg = result.updates.find(u => u.message && u.message.media && u.message.media.document);
        if (!msg && result.updates.length > 0) {
            msg = result.updates[0];
        }

        if (msg && msg.message && msg.message.media) {
            const doc = msg.message.media.document;
            if (doc) {
                console.log("id:", doc.id.toString());
                console.log("accessHash:", doc.accessHash.toString());
                console.log("fileReference:", doc.fileReference.toString('hex'));
                console.log("mimeType:", doc.mimeType);
                console.log("size:", doc.size.toString());
                console.log("attributes:", JSON.stringify(doc.attributes.map(a => a.className)));
            } else {
                console.log("Media found but no document", msg.message.media);
            }
        } else {
            console.log("No message with media found in updates", result);
        }

    } catch (e) {
        console.error(e);
    }
    process.exit(0);
})();

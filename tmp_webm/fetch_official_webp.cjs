const { Api, TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");

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

        // Fetch a well known static sticker set to extract a guaranteed valid WebP Document
        const result = await client.invoke(
            new Api.messages.GetStickerSet({
                stickerset: new Api.InputStickerSetShortName({
                    shortName: "Animals", // very old static WebP sticker pack
                }),
                hash: 0,
            })
        );

        if (result && result.documents && result.documents.length > 0) {
            const doc = result.documents[0];
            console.log("--- Official Static WEBP Sticker ---");
            console.log("id:", doc.id.toString());
            console.log("accessHash:", doc.accessHash.toString());
            console.log("fileReference:", doc.fileReference.toString('hex'));
            console.log("mimeType:", doc.mimeType);
            console.log("size:", doc.size.toString());
            console.log("attributes:", JSON.stringify(doc.attributes.map(a => a.className)));

            doc.attributes.forEach(attr => {
                if (attr.className === "DocumentAttributeImageSize") {
                    console.log("  ImageSize w:", attr.w, "h:", attr.h);
                }
            });
            console.log("------------------------------------");
        } else {
            console.log("No documents found in static sticker set.");
        }

    } catch (e) {
        console.error("Failed:", e.message);
    }
    process.exit(0);
})();

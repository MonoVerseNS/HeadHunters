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

        // Find a popular sticker set (e.g. animated animals or gifts)
        // Let's search for some gifts sticker set
        const result = await client.invoke(
            new Api.messages.GetStickerSet({
                stickerset: new Api.InputStickerSetShortName({
                    shortName: "AnimatedStickers",
                }),
                hash: 0,
            })
        );

        if (result && result.documents && result.documents.length > 0) {
            const doc = result.documents[0];
            console.log("id:", doc.id.toString());
            console.log("accessHash:", doc.accessHash.toString());
            console.log("fileReference:", doc.fileReference.toString('hex'));
            console.log("mimeType:", doc.mimeType);
            console.log("size:", doc.size.toString());
            console.log("attributes:", JSON.stringify(doc.attributes.map(a => a.className)));
        } else {
            console.log("No documents found in sticker set.");
        }

    } catch (e) {
        console.error(e);
    }
    process.exit(0);
})();

const { Api, TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const apiId = 34961217;
const apiHash = '457da57bdb5b16fd43740703f8b0ad21';
const botToken = '8437729919:AAF-NRihptuYhFIhcberNiJ0kD746Cdlv3Y';
const stringSession = new StringSession('');

(async () => {
    try {
        const botFetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
        const botRes = await botFetch(`https://api.telegram.org/bot${botToken}/getStickerSet?name=hh_nfts_by_HeadHuntersC_bot`);
        const botData = await botRes.json();
        const botStickers = botData.result.stickers;

        const botVidRes = await botFetch(`https://api.telegram.org/bot${botToken}/getStickerSet?name=hh_vid_nfts_by_HeadHuntersC_bot`);
        let botVidStickers = [];
        if (botVidRes.status === 200) {
            const botVidData = await botVidRes.json();
            if (botVidData.ok) botVidStickers = botVidData.result.stickers;
        }

        const client = new TelegramClient(stringSession, apiId, apiHash, {
            connectionRetries: 1,
        });
        await client.start({ botAuthToken: botToken });

        let docs = {};

        // 1. Process Static Sticker Set
        const staticResult = await client.invoke(
            new Api.messages.GetStickerSet({
                stickerset: new Api.InputStickerSetShortName({
                    shortName: 'hh_nfts_by_HeadHuntersC_bot',
                }),
                hash: 0,
            })
        );
        for (let i = 0; i < Math.min(staticResult.documents.length, botStickers.length); i++) {
            const doc = staticResult.documents[i];
            const botS = botStickers[i];
            const entry = {
                id: doc.id.toString(),
                access_hash: doc.accessHash.toString(),
                file_reference: doc.fileReference.toString('hex'),
                size: doc.size.toNumber ? doc.size.toNumber() : Number(doc.size)
            };
            docs[botS.file_unique_id] = entry;
            docs[botS.file_id] = entry;
            docs[doc.id.toString()] = entry; // Key by MTProto doc ID for legacy plugin lookup
        }

        // 2. Process Video Sticker Set (if it exists)
        try {
            const vidResult = await client.invoke(
                new Api.messages.GetStickerSet({
                    stickerset: new Api.InputStickerSetShortName({
                        shortName: 'hh_vid_nfts_by_HeadHuntersC_bot',
                    }),
                    hash: 0,
                })
            );
            for (let i = 0; i < Math.min(vidResult.documents.length, botVidStickers.length); i++) {
                const doc = vidResult.documents[i];
                const botS = botVidStickers[i];
                const entry = {
                    id: doc.id.toString(),
                    access_hash: doc.accessHash.toString(),
                    file_reference: doc.fileReference.toString('hex')
                };
                docs[botS.file_unique_id] = entry;
                docs[botS.file_id] = entry;
                docs[doc.id.toString()] = entry;
            }
        } catch (e) { }

        console.log(JSON.stringify(docs, null, 2));
        process.exit(0);
    } catch (e) {
        console.error(e.message);
        process.exit(1);
    }
})();

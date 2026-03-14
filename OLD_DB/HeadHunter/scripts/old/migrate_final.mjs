import { mnemonicNew, mnemonicToWalletKey, mnemonicToPrivateKey } from '@ton/crypto';
import { WalletContractV5R1, internal, toNano } from '@ton/ton';
import fetch from 'node-fetch';

async function main() {
    const newMnemonicArray = await mnemonicNew(24);
    const newMnemonic = newMnemonicArray.join(' ');

    // Tonkeeper path
    const newKeyPair = await mnemonicToPrivateKey(newMnemonic.split(' '), "m/44'/396'/0'/0/0");
    const newWallet = WalletContractV5R1.create({ workchain: 0, publicKey: newKeyPair.publicKey });
    const newAddressStr = newWallet.address.toString({ testOnly: true, bounceable: false });

    console.log("== NEW WALLET ==");
    console.log("Mnemonic:", newMnemonic);
    console.log("Address:", newAddressStr);

    const oldMnemonic = 'cloth okay wagon gauge result catalog connect rifle raven turkey solar satoshi chair remove cause essay grit direct kangaroo submit better trick burst behave';
    const oldKeyPair = await mnemonicToWalletKey(oldMnemonic.split(' '));
    const oldWallet = WalletContractV5R1.create({ workchain: 0, publicKey: oldKeyPair.publicKey });

    try {
        const addressHex = oldWallet.address.toString({ testOnly: true });
        const res = await fetch(`https://testnet.toncenter.com/api/v2/getAddressInformation?address=${addressHex}`);
        const info = await res.json();

        let seqno = null;
        if (info.result && info.result.data) {
            // Basic hack to try to guess seqno or just fetch it
            const resSeqno = await fetch(`https://testnet.toncenter.com/api/v2/runGetMethod`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: addressHex, method: "seqno", stack: [] })
            });
            const seqnoData = await resSeqno.json();
            if (seqnoData.ok && seqnoData.result.stack[0]) {
                seqno = parseInt(seqnoData.result.stack[0][1], 16);
            }
        }
        if (seqno === null) seqno = 8; // fallback

        console.log("Using seqno:", seqno);
        const bal = parseInt(info.result?.balance || "0");
        console.log("Current balance:", bal / 1e9);

        if (bal > 20000000) { // > 0.02 TON
            const transferAmount = BigInt(bal) - toNano('0.02');
            const msg = oldWallet.createTransfer({
                seqno,
                secretKey: oldKeyPair.secretKey,
                messages: [internal({
                    to: newAddressStr,
                    value: transferAmount,
                    bounce: false,
                    body: 'Migration to new Platform Wallet'
                })],
                sendMode: 3
            });
            const bocBase64 = msg.toBoc({ idx: false }).toString('base64');
            const sendRes = await fetch('https://testnet.tonapi.io/v2/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ boc: bocBase64 })
            });
            console.log("TonAPI Status:", sendRes.status);
            if (sendRes.status !== 200 && sendRes.status !== 202) {
                console.log(await sendRes.json());
            }
        } else {
            console.log("Not enough balance to transfer.");
        }
    } catch (e) {
        console.error("Error migrating:", e.message);
    }
}
main();

import { TonClient, WalletContractV5R1, internal, toNano } from '@ton/ton';
import { mnemonicToWalletKey } from '@ton/crypto';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envConfig = JSON.parse(readFileSync(join(__dirname, 'env.json'), 'utf-8'));

async function run() {
    const mnemonic = envConfig.ton.platformMnemonic;
    const keyPair = await mnemonicToWalletKey(mnemonic.split(' '));
    const wallet = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0 });

    // Check seqno
    const walletAddress = wallet.address.toString({ testOnly: true, bounceable: false });
    console.log('Wallet Address:', walletAddress);

    const toncenterBase = 'https://testnet.toncenter.com';
    const seqnoPayload = JSON.stringify({ address: walletAddress, method: 'seqno', stack: [] });
    const seqnoOut = execSync(
        `curl -s -X POST '${toncenterBase}/api/v2/runGetMethod' -H 'Content-Type: application/json' -d '${seqnoPayload}'`,
        { encoding: 'utf-8' }
    );
    const seqnoData = JSON.parse(seqnoOut);
    let freshSeqno = 0;
    if (seqnoData.ok && seqnoData.result?.stack?.[0]?.[1]) {
        freshSeqno = parseInt(seqnoData.result.stack[0][1], 16);
    }
    console.log('Current Seqno:', freshSeqno);

    const msg = wallet.createTransfer({
        seqno: freshSeqno,
        secretKey: keyPair.secretKey,
        sendMode: 3,
        messages: [
            internal({
                to: wallet.address,
                value: toNano('0.01'),
                bounce: false,
                body: 'Test V5 Transfer'
            })
        ]
    });

    // Strategy 1: msg.toBoc({ idx: false })
    const boc1 = msg.toBoc({ idx: false }).toString('base64');
    console.log('\nTesting BOC (idx: false)...');
    try {
        const res1 = execSync(
            `curl -s -X POST '${toncenterBase}/api/v2/sendBoc' -H 'Content-Type: application/json' -d '${JSON.stringify({ boc: boc1 })}'`,
            { encoding: 'utf-8' }
        );
        console.log('Response 1:', res1.trim());
    } catch (e) {
        console.log('Error 1:', e.message);
    }

    // Strategy 2: msg.toBoc() - default
    const boc2 = msg.toBoc().toString('base64');
    console.log('\nTesting BOC (default)...');
    try {
        const res2 = execSync(
            `curl -s -X POST '${toncenterBase}/api/v2/sendBoc' -H 'Content-Type: application/json' -d '${JSON.stringify({ boc: boc2 })}'`,
            { encoding: 'utf-8' }
        );
        console.log('Response 2:', res2.trim());
    } catch (e) {
        console.log('Error 2:', e.message);
    }
}

run();

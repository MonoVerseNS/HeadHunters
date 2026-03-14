import { TonClient, WalletContractV5R1, internal } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import TonWeb from 'tonweb';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Cell as CoreCell } from '@ton/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { Cell, utils } = TonWeb.boc;

function createMintBody(TonWeb, params) {
    const BN = TonWeb.utils.BN;
    const body = new Cell();
    body.bits.writeUint(21, 32); // mint op
    body.bits.writeUint(0, 64);
    body.bits.writeAddress(params.toAddress);
    body.bits.writeCoins(params.amount); // TON assigned to the message

    // Internal transfer msg
    const masterMsg = new Cell();
    masterMsg.bits.writeUint(0x178d4519, 32); // internal_transfer op
    masterMsg.bits.writeUint(0, 64);
    masterMsg.bits.writeCoins(params.tokenAmount); // token amount
    masterMsg.bits.writeAddress(params.fromAddress || null);
    masterMsg.bits.writeAddress(params.responseAddress || null);
    masterMsg.bits.writeCoins(params.forwardAmount || new BN(0));
    masterMsg.bits.writeBit(false); // extra payloads

    body.refs.push(masterMsg);
    return body;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function withRetry(fn, retries = 5) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (err) {
            if (i === retries - 1) throw err;
            console.log(`[Rate Limit / Network Error] Retrying in 5s... (${i + 1}/${retries})`);
            await sleep(5000);
        }
    }
}

async function main() {
    const env = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../env.json'), 'utf-8'));
    const adminMnemonic = env.ton.adminMnemonic;
    const isMainnet = env.ton.network === 'mainnet';
    const endpoint = env.ton.rpcEndpoint;

    const client = new TonClient({ endpoint: endpoint + '/jsonRPC', apiKey: env.ton.toncenterApiKey });
    const tonweb = new TonWeb(new TonWeb.HttpProvider(endpoint + '/jsonRPC'));

    console.log('Initializing Admin V5R1 Wallet...');
    const keyPair = await mnemonicToPrivateKey(adminMnemonic.split(' '));
    const wallet = WalletContractV5R1.create({ publicKey: keyPair.publicKey, workchain: 0, walletId: { networkGlobalId: -239 } });
    const walletContract = client.open(wallet);

    const walletAddress = wallet.address.toString({ bounceable: true, testOnly: !isMainnet });
    console.log(`Deployer Wallet Address: ${walletAddress}`);

    await sleep(2500);
    const balanceNano = await withRetry(() => walletContract.getBalance());
    console.log(`Deployer Balance: ${Number(balanceNano) / 1e9} TON`);

    const jettonMinterAddressStr = env.ton.jettonMasterAddress;
    console.log(`Jetton Minter: ${jettonMinterAddressStr}`);

    const JETTON_WALLET_CODE_HEX = 'B5EE9C7241021201000328000114FF00F4A413F4BCF2C80B0102016202030202CC0405001BA0F605DA89A1F401F481F481A8610201D40607020148080900BB0831C02497C138007434C0C05C6C2544D7C0FC02F83E903E900C7E800C5C75C87E800C7E800C00B4C7E08403E29FA954882EA54C4D167C0238208405E3514654882EA58C511100FC02780D60841657C1EF2EA4D67C02B817C12103FCBC2000113E910C1C2EBCB853600201200A0B020120101101F500F4CFFE803E90087C007B51343E803E903E90350C144DA8548AB1C17CB8B04A30BFFCB8B0950D109C150804D50500F214013E809633C58073C5B33248B232C044BD003D0032C032483E401C1D3232C0B281F2FFF274013E903D010C7E801DE0063232C1540233C59C3E8085F2DAC4F3208405E351467232C7C6600C03F73B51343E803E903E90350C0234CFFE80145468017E903E9014D6F1C1551CDB5C150804D50500F214013E809633C58073C5B33248B232C044BD003D0032C0327E401C1D3232C0B281F2FFF274140371C1472C7CB8B0C2BE80146A2860822625A020822625A004AD822860822625A028062849F8C3C975C2C070C008E00D0E0F009ACB3F5007FA0222CF165006CF1625FA025003CF16C95005CC2391729171E25008A813A08208989680AA008208989680A0A014BCF2E2C504C98040FB001023C85004FA0258CF1601CF16CCC9ED5400705279A018A182107362D09CC8CB1F5230CB3F58FA025007CF165007CF16C9718018C8CB0524CF165006FA0215CB6A14CCC971FB0010241023000E10491038375F040076C200B08E218210D53276DB708010C8CB055008CF165004FA0216CB6A12CB1F12CB3FC972FB0093356C21E203C85004FA0258CF1601CF16CCC9ED5400DB3B51343E803E903E90350C01F4CFFE803E900C145468549271C17CB8B049F0BFFCB8B0A0822625A02A8005A805AF3CB8B0E0841EF765F7B232C7C572CFD400FE8088B3C58073C5B25C60063232C14933C59C3E80B2DAB33260103EC01004F214013E809633C58073C5B3327B55200083200835C87B51343E803E903E90350C0134C7E08405E3514654882EA0841EF765F784EE84AC7CB8B174CFCC7E800C04E81408F214013E809633C58073C5B3327B55205ECCF23D';
    const jettonMinter = new TonWeb.token.ft.JettonMinter(tonweb.provider, {
        ownerAddress: new TonWeb.utils.Address(walletAddress),
        jettonContentUri: 'https://raw.githubusercontent.com/ton-community/tutorials/main/03-client/test/json/jetton.json', // same as the fallback 
        jettonWalletCodeHex: JETTON_WALLET_CODE_HEX,
        adminAddress: new TonWeb.utils.Address(walletAddress)
    });

    await sleep(2500);
    const jettonState = await withRetry(() => tonweb.provider.getAddressInfo(jettonMinterAddressStr));
    let stateInitBoc = null;
    if (jettonState.state !== 'active') {
        console.log('Minter needs deployment...');
        stateInitBoc = await (await jettonMinter.createStateInit()).stateInit.toBoc(false);
    } else {
        console.log('Minter is already deployed!');
    }

    console.log('Constructing Fixed Mint Message...');
    // The critical fix: `amount` should be ~0.04 TON (fee for internal operations), NOT tokenAmount.
    const mintBodyCell = createMintBody(TonWeb, {
        toAddress: new TonWeb.utils.Address(walletAddress),
        amount: TonWeb.utils.toNano('0.04'),   // 0.04 TON for gas/storage of internal msgs
        tokenAmount: TonWeb.utils.toNano('1000000000'), // 1B tokens
        fromAddress: new TonWeb.utils.Address(walletAddress),
        responseAddress: new TonWeb.utils.Address(walletAddress),
        forwardAmount: TonWeb.utils.toNano('0.01')
    });

    const mintPayloadBoc = await mintBodyCell.toBoc(false);
    const mintPayloadCellCore = CoreCell.fromBoc(Buffer.from(mintPayloadBoc))[0];

    let msgInit = undefined;
    if (stateInitBoc) {
        const stateInitCellCore = CoreCell.fromBoc(Buffer.from(stateInitBoc))[0];
        msgInit = { code: stateInitCellCore.refs[0], data: stateInitCellCore.refs[1] };
    }

    await sleep(2500);
    const seqno = await withRetry(() => walletContract.getSeqno());

    console.log('Sending transaction...');
    await withRetry(() => walletContract.sendTransfer({
        seqno,
        secretKey: keyPair.secretKey,
        messages: [
            internal({
                to: jettonMinterAddressStr,
                value: '0.08', // TON sent with total message (0.04 for mint + 0.04 for minter gas)
                body: mintPayloadCellCore,
                init: msgInit,
                bounce: false // prevent bouncing if contract is not yet active
            })
        ]
    }));

    console.log('Fix transaction sent. Wait 20 seconds...');
    await sleep(20000);

    const data = await withRetry(() => tonweb.provider.call2(jettonMinterAddressStr, 'get_jetton_data'));
    if (data[0]) {
        console.log(`Successfully minted! Current Supply (nanoJettons): ${data[0].toString()}`);
        console.log(`Supply (Jettons): ${Number(data[0].toString()) / 1e9}`);
    } else {
        console.log('Jetton Minter still not fully responsive. Check Tonviewer.');
    }
}

main().catch(console.error);

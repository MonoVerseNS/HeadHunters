import { WalletContractV1R1, WalletContractV2R1, WalletContractV3R1, WalletContractV3R2, WalletContractV4, WalletContractV5R1 } from '@ton/ton';

async function main() {
    const pubKeys = [
        { id: 0, hex: 'dfba6673fd7d1ce62ff8c122d8bd04413994d926debc6b7688691fd8bbffef99' },
        { id: 1, hex: 'e2c4983a93ce7ea3a24fbb751c0c059da735eca41b5bff9e5dbeedc110f3b140' },
        { id: 2, hex: 'a246d73189b007e567e08ada7c8e27bc38496d50372f402b1d65203faed51306' },
        { id: 3, hex: '909e2158bd8256765dcfef56eeff314e3e19afc93994af040fd3fcd5311f01e4' },
        { id: 5, hex: '38558aa0f84a35a63f6a930c44a2ee8f14bff86cad85635795e829baa4ddf7e6' }
    ];
    const target = '0QAmnJu2ZiCmDjIeT4_OMH-Rc-OiolGvhdUKtjMPG6-dmwoa';

    const contracts = [
        { name: 'V1R1', c: WalletContractV1R1 },
        { name: 'V2R1', c: WalletContractV2R1 },
        { name: 'V3R1', c: WalletContractV3R1 },
        { name: 'V3R2', c: WalletContractV3R2 },
        { name: 'V4', c: WalletContractV4 },
        { name: 'V5', c: WalletContractV5R1 },
    ];

    for (const pk of pubKeys) {
        const publicKey = Buffer.from(pk.hex, 'hex');
        console.log(`Checking User ${pk.id}...`);
        for (const item of contracts) {
            const wallet = item.c.create({ publicKey: publicKey, workchain: 0 });
            const addr = wallet.address.toString({ testOnly: true, bounceable: false });
            if (addr === target) {
                console.log(`MATCH FOUND! User ${pk.id}, Version ${item.name}`);
                return;
            }
        }
    }
    console.log('No match found for target in existing custodial public keys.');
}
main();

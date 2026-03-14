import { mnemonicToWalletKey } from '@ton/crypto';
import { WalletContractV4 } from '@ton/ton';

async function main() {
    const mnemonic = "identify fence east benefit huge swarm faint oval blossom wheel labor curve laugh worth urban panic viable giraffe school road daring grit local obey";
    const keyPair = await mnemonicToWalletKey(mnemonic.split(' '));
    const wallet = WalletContractV4.create({ workchain: 0, publicKey: keyPair.publicKey });
    console.log("Platform Mainnet:", wallet.address.toString({ testOnly: false, bounceable: true }));
    console.log("Platform Testnet Bounceable:", wallet.address.toString({ testOnly: true, bounceable: true }));
    console.log("Platform Testnet NonBouncy:", wallet.address.toString({ testOnly: true, bounceable: false }));
}
main();

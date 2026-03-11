import { TonClient, WalletContractV5R1, toNano } from '@ton/ton';
import { mnemonicToWalletKey } from '@ton/crypto';
import { getHttpEndpoint } from '@orbs-network/ton-access';

async function main() {
    const mnemonic = "tip accuse tornado comfort firm analyst burst sign nose net fun reveal roof bracket icon together category hand park sail fashion believe battle egg";
    const keyPair = await mnemonicToWalletKey(mnemonic.split(' '));

    const endpoint = await getHttpEndpoint({ network: 'testnet' });
    const client = new TonClient({ endpoint });

    const wallet = WalletContractV5R1.create({
        publicKey: keyPair.publicKey,
        workchain: 0
    });

    const contract = client.open(wallet);

    console.log(`Deploying wallet ${wallet.address.toString()}...`);

    // To deploy, we just need to send a transaction with stateInit.
    // sendTransfer handles this if we provide the secretKey and the wallet is not yet active.

    try {
        await contract.sendTransfer({
            seqno: 0,
            secretKey: keyPair.secretKey,
            messages: [], // Empty message just to initialize
            sendMode: 3
        });
        console.log("Deployment transaction sent!");
    } catch (e) {
        console.error("Deployment failed:", e);
    }
}

main().catch(console.error);

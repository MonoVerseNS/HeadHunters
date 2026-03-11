const { TonClient, Address } = require('@ton/ton');
const { getHttpEndpoint } = require('@orbs-network/ton-access');

async function main() {
    const endpoint = await getHttpEndpoint();
    const client = new TonClient({ endpoint });

    const userWallet = Address.parse('EQB3gaAA3pF1mMQSPDLRJt6_Qdtd7BQPmq-Wwyo2PBh31-up');

    console.log("Fetching transactions for:", userWallet.toString());
    const txs = await client.getTransactions(userWallet, { limit: 5 });

    for (const tx of txs) {
        console.log("-----------------------------------------");
        console.log("Hash:", tx.hash().toString('hex'));
        console.log("Time:", new Date(tx.now * 1000).toISOString());
        console.log("Out messages count:", tx.outMessagesCount);

        if (tx.description.type === 'generic') {
            const compute = tx.description.computePhase;
            console.log("Compute Phase Status:", compute.type);
            if (compute.type === 'skipped') {
                console.log("Reason:", compute.reason);
            } else {
                console.log("Exit Code:", compute.exitCode);
                console.log("Success:", compute.success);
            }
        }

        // Inspect out messages
        for (const [id, msg] of tx.outMessages) {
            if (msg.info.type === 'internal') {
                console.log("Out Msg ->", msg.info.dest.toString());
                console.log("Value:", Number(msg.info.value.coins) / 1e9, "TON");
                console.log("Body Hash:", msg.body.hash().toString('hex'));
            }
        }
    }
}
main().catch(console.error);

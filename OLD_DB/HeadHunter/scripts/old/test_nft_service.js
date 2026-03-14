import nftService from './server/nftService.js';

async function test() {
    try {
        console.log("Fetching next item index...");
        const index = await nftService.getNextItemIndex();
        console.log("SUCCESS! Next Item Index is:", index);
    } catch (e) {
        console.error("FAILED:", e.message);
    }
    process.exit(0);
}
test();

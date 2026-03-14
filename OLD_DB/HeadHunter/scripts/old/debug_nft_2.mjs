import { open } from 'sqlite'
import sqlite3 from 'sqlite3'
import { join } from 'path'

const DB_PATH = './server/headhunter.db'

async function main() {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database })
    const nft = await db.get('SELECT * FROM nfts WHERE on_chain_index = 2')
    console.log('NFT #2:', JSON.stringify(nft, null, 2))
}
main().catch(console.error)

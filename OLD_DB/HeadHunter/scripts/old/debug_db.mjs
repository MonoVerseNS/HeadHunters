import { open } from 'sqlite'
import sqlite3 from 'sqlite3'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, 'server', 'headhunter.db')

async function main() {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database })
    const nfts = await db.all('SELECT id, name, on_chain_index, status, first_name, last_name, owner_id FROM nfts ORDER BY on_chain_index DESC LIMIT 10')
    console.log('Recent NFTs:', JSON.stringify(nfts, null, 2))

    const users = await db.all('SELECT id, first_name, last_name FROM users LIMIT 5')
    console.log('Users sample:', JSON.stringify(users, null, 2))

    const nftCount = await db.get('SELECT COUNT(*) as count FROM nfts')
    console.log('Total NFTs:', nftCount.count)
}
main().catch(console.error)

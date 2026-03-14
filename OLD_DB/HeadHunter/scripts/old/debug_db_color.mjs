import { open } from 'sqlite'
import sqlite3 from 'sqlite3'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, 'server', 'headhunter.db')

async function main() {
    const db = await open({ filename: DB_PATH, driver: sqlite3.Database })
    const nfts = await db.all('SELECT id, name, on_chain_index, color, first_name, last_name FROM nfts ORDER BY on_chain_index DESC LIMIT 10')
    console.log('NFTs Data:', JSON.stringify(nfts, null, 2))
}
main().catch(console.error)

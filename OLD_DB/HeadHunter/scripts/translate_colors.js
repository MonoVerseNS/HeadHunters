import { fileURLToPath } from 'url'
import { join } from 'path'
import fs from 'fs'
import sqlite3pkg from 'sqlite3'
const sqlite3 = sqlite3pkg.verbose()

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const DB_PATH = join(__dirname, '..', 'server', 'data', 'database.sqlite')

if (!fs.existsSync(DB_PATH)) {
    console.error(`Database not found at ${DB_PATH}`)
    process.exit(1)
}

const db = new sqlite3.Database(DB_PATH)

const MAPPINGS = {
    // English -> Russian mappings based on what was likely in the old config
    "Cyber Blue": "Голубой",
    "Neon Green": "Лайм",
    "Plasma Pink": "Розовый",
    "Void Black": "Чёрный",
    "Sunset Orange": "Оранжевый",
    "Crimson Red": "Алый",
    "Deep Purple": "Пурпурный",
    "Golden Yellow": "Золотой",
    "Ocean Teal": "Бирюзовый",
    "Silver Gray": "Серебро"
}

console.log("Starting color translation migration...")

db.serialize(() => {
    let updatedCount = 0;

    db.each("SELECT id, color FROM nfts WHERE color IS NOT NULL", (err, row) => {
        if (err) {
            console.error("Error reading row:", err)
            return
        }

        let newColor = row.color
        if (MAPPINGS[row.color]) {
            newColor = MAPPINGS[row.color]
        } else if (row.color && /^[a-zA-Z\s]+$/.test(row.color)) {
            // Also try matching by hex translation fallback if exact string isn't in MAPPINGS
            // E.g., if there were others we missed
            if (row.color.toLowerCase().includes('blue')) newColor = 'Голубой'
            else if (row.color.toLowerCase().includes('red')) newColor = 'Красный'
            else if (row.color.toLowerCase().includes('green')) newColor = 'Зелёный'
            else if (row.color.toLowerCase().includes('purple')) newColor = 'Фиолетовый'
            else if (row.color.toLowerCase().includes('pink')) newColor = 'Розовый'
            else if (row.color.toLowerCase().includes('yellow')) newColor = 'Жёлтый'
            else if (row.color.toLowerCase().includes('orange')) newColor = 'Оранжевый'
            else if (row.color.toLowerCase().includes('black')) newColor = 'Чёрный'
            else if (row.color.toLowerCase().includes('white')) newColor = 'Белый'
            else if (row.color.toLowerCase().includes('gray') || row.color.toLowerCase().includes('grey')) newColor = 'Серебро'
        }

        if (newColor !== row.color) {
            db.run("UPDATE nfts SET color = ? WHERE id = ?", [newColor, row.id], function (err) {
                if (err) {
                    console.error(`Failed to update NFT ${row.id}:`, err)
                } else {
                    console.log(`Updated NFT ${row.id}: "${row.color}" -> "${newColor}"`)
                    updatedCount++
                }
            })
        }
    }, () => {
        // Complete
        console.log(`Migration complete. Translating color operation triggered.`)
        // The script exits after DB is closed
    })
})

import sqlite3 from 'sqlite3'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const CWD = process.cwd()
console.log(`Запуск из: ${CWD}`)

async function setRole(dbFileName, tgId, role = 'admin') {
  const dbPath = path.resolve(__dirname, '..', 'server', 'data', dbFileName)
  console.log(`\n=== DB: ${dbFileName} (путь: ${dbPath}) ===`)
  
  if (!fs.existsSync(dbPath)) {
    console.log('❌ БД не найдена, пропуск')
    return false
  }

  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath)
    db.get(`SELECT id, telegram_id, role FROM users WHERE telegram_id = ?`, [tgId], (err, user) => {
      if (err) {
        console.error('Ошибка запроса:', err.message)
        db.close()
        return reject(err)
      }
      
      console.log(`Найден:`, user ? `ID ${user.id}, роль: '${user.role}'` : '👤 Пользователь не найден')
      
      if (!user) {
        // Создать пользователя
        db.run(`INSERT INTO users (telegram_id, role, balance) VALUES (?, ?, 0)`, [tgId, role], function(err) {
          if (err) {
            console.error('Ошибка создания:', err.message)
            db.close()
            return reject(err)
          }
          console.log(`✅ Создан новый admin ID ${this.lastID}`)
          db.close()
          resolve(true)
        })
      } else if (user.role !== role) {
        // Обновить роль
        db.run(`UPDATE users SET role = ? WHERE telegram_id = ?`, [role, tgId], function(err) {
          if (err) {
            console.error('Ошибка обновления:', err.message)
            db.close()
            return reject(err)
          }
          console.log(`✅ Обновлено на '${role}' (изменено: ${this.changes})`)
          db.close()
          resolve(true)
        })
      } else {
        console.log('ℹ️ Уже имеет роль admin')
        db.close()
        resolve(true)
      }
    })
  })
}

async function main() {
  const TG_ID = '5178670546'
  try {
    // Prod DB
    await setRole('headhunter.db', TG_ID)
    // Test DB
    await setRole('headhunter_test.db', TG_ID)
    console.log('\n🎉 Admin setup complete для всех БД!')
  } catch (e) {
    console.error('💥 Ошибка:', e)
    process.exit(1)
  }
}

main()

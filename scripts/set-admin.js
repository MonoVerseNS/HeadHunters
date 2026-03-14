import sqlite3 from 'sqlite3'

async function setRole(dbPath, tgId, role = 'admin') {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath)
    db.get(`SELECT id, telegram_id, role FROM users WHERE telegram_id = ?`, [tgId], (err, user) => {
      if (err) {
        reject(err)
      } else {
        console.log(`DB ${dbPath.split(/[/\\]/).pop()}:`, user ? `ID ${user.id}, role: ${user.role}` : 'User not found')
        if (user && user.role !== 'admin') {
          db.run(`UPDATE users SET role = ? WHERE telegram_id = ?`, [role, tgId], function(err) {
            if (err) reject(err)
            else console.log(`Updated to admin ✅ (changed: ${this.changes})`)
            db.close()
            resolve(true)
          })
        } else {
          console.log('Already admin or not found')
          db.close()
          resolve(true)
        }
      }
    })
  })
}

async function main() {
  try {
    await setRole('../server/data/headhunter.db', '5178670546')
    try {
      await setRole('../server/data/headhunter_test.db', '5178670546')
    } catch (e) {
      console.log('Test DB not exists, OK')
    }
    console.log('Admin setup complete!')
  } catch (e) {
    console.error('Error:', e)
  }
}

main()

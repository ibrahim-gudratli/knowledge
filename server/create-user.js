require('dotenv').config()
const bcrypt = require('bcrypt')
const { Pool } = require('pg')

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
})

async function createUser() {
  const username = 'slava'
  const password = 'Slava2005.'

  const passwordHash = await bcrypt.hash(password, 12)

  await pool.query(
    'INSERT INTO users (username, password_hash) VALUES ($1, $2)',
    [username, passwordHash]
  )

  console.log(`User "${username}" created successfully.`)
  await pool.end()
}

createUser().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
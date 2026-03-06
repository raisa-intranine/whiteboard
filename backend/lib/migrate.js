// lib/migrate.js — Run database migrations
// Usage: node lib/migrate.js
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const pool = require('./db')

async function migrate() {
    const client = await pool.connect()
    try {
        const sqlPath = path.join(__dirname, '..', 'migrations', '001_init.sql')
        const sql = fs.readFileSync(sqlPath, 'utf8')
        console.log('Running migration: 001_init.sql ...')
        await client.query(sql)
        console.log('✅ Migration complete.')
    } catch (err) {
        console.error('❌ Migration failed:', err.message)
        process.exit(1)
    } finally {
        client.release()
        await pool.end()
    }
}

migrate()

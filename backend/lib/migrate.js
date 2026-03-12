// lib/migrate.js — Run database migrations
// Usage: node lib/migrate.js
require('dotenv').config()
const fs = require('fs')
const path = require('path')
const pool = require('./db')

async function migrate() {
    const client = await pool.connect()
    try {
        // Create migrations tracking table if it doesn't exist
        await client.query(`
            CREATE TABLE IF NOT EXISTS migrations (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                applied_at BIGINT NOT NULL
            )
        `)
        
        // Get list of already applied migrations
        const applied = await client.query('SELECT name FROM migrations')
        const appliedNames = new Set(applied.rows.map(m => m.name))
        
        // Get all migration files
        const migrationsDir = path.join(__dirname, '..', 'migrations')
        const files = fs.readdirSync(migrationsDir)
            .filter(f => f.endsWith('.sql'))
            .sort()
        
        // Run pending migrations
        for (const file of files) {
            if (appliedNames.has(file)) {
                console.log(`⏭️  Skipping ${file} (already applied)`)
                continue
            }
            
            console.log(`Running migration: ${file} ...`)
            const sqlPath = path.join(migrationsDir, file)
            const sql = fs.readFileSync(sqlPath, 'utf8')
            
            // Execute migration
            await client.query(sql)
            
            // Record migration as applied
            await client.query(
                'INSERT INTO migrations (name, applied_at) VALUES ($1, $2)',
                [file, Date.now()]
            )
            
            console.log(`✅ ${file} complete`)
        }
        
        console.log('✅ All migrations complete.')
    } catch (err) {
        console.error('❌ Migration failed:', err.message)
        console.error(err.stack)
        process.exit(1)
    } finally {
        client.release()
        await pool.end()
    }
}

migrate()
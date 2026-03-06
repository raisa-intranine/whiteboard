// lib/db.js — Neon Postgres connection pool
require('dotenv').config()
const { Pool } = require('pg')

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },  // required for Neon
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
})

module.exports = pool

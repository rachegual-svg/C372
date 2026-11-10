const mysql = require('mysql2');

// Shared MySQL connection pool.
// pool.query(...) works the same as before for normal queries.
// pool.getConnection(...) gives one connection for a transaction (service booking).
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'Stex12345',
  database: 'petcare',
  waitForConnections: true,
  connectionLimit: 10
});

module.exports = pool;

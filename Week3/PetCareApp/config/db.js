const mysql = require('mysql2');

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Stex12345',
  database: 'petcare'
});

module.exports = connection;

import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "9944779374", // Set your MySQL password here
  database: "chatapp",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export default pool;
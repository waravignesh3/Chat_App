import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

// Support both individual connection params and DATABASE_URL
let poolConfig;

if (process.env.DATABASE_URL) {
  // Parse DATABASE_URL for services like Render, Railway, etc.
  // Format: mysql://user:password@host:port/database
  const url = new URL(process.env.DATABASE_URL);
  poolConfig = {
    host: url.hostname,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    port: url.port || 3306,
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,
    queueLimit: 0,
  };
} else {
  // Fallback to individual environment variables
  poolConfig = {
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "chatapp",
    port: process.env.DB_PORT || 3306,
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10,
    queueLimit: 0,
  };
}

const pool = mysql.createPool(poolConfig);

export default pool;
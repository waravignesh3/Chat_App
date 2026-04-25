import mysql from "mysql2/promise";
import dotenv from "dotenv";

dotenv.config();

const databaseUrl  = process.env.DATABASE_URL?.trim();
const dbHost       = process.env.DB_HOST?.trim();
const dbUser       = process.env.DB_USER?.trim();
const dbName       = process.env.DB_NAME?.trim();
const dbPort       = process.env.DB_PORT?.trim();
const dbPassword   = process.env.DB_PASSWORD ?? "";
const connectionLimit = parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 10;

export const hasDatabaseConfig = Boolean(
  databaseUrl || (dbHost && dbUser && dbName)
);

let pool;

if (hasDatabaseConfig) {
  const poolConfig = databaseUrl
    ? (() => {
        const url = new URL(databaseUrl);
        return {
          host:             url.hostname,
          user:             url.username,
          password:         url.password,
          database:         url.pathname.slice(1),
          port:             Number(url.port || 3306),
          waitForConnections: true,
          connectionLimit,
          queueLimit:       0,
          ssl:              process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
        };
      })()
    : {
        host:             dbHost,
        user:             dbUser,
        password:         dbPassword,
        database:         dbName,
        port:             Number(dbPort || 3306),
        waitForConnections: true,
        connectionLimit,
        queueLimit:       0,
        ssl:              process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
      };

  pool = mysql.createPool(poolConfig);
} else {
  pool = {
    async getConnection() { throw new Error("No database configured"); },
    async query()         { throw new Error("No database configured"); },
  };
}

export default pool;
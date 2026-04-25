# Deployment Guide

This guide explains how to deploy the ChatApp backend to Render with a MySQL database.

## Prerequisites

- Render account (render.com)
- MySQL database (either hosted or local)
- GitHub repository with this code

## Option 1: Deploy with PlanetScale MySQL (Recommended for Render)

PlanetScale is a serverless MySQL platform compatible with Render.

### Step 1: Create PlanetScale Database

1. Sign up at [planetscale.com](https://www.planetscale.com)
2. Create a new database
3. Select MySQL 8.0
4. Create a password and note the connection string

### Step 2: Get Connection String

1. Go to **Connect** → **Node.js**
2. Copy the connection string (it looks like `mysql://user:password@host/database?ssl={"rejectUnauthorized":true}`)

### Step 3: Deploy on Render

1. Push code to GitHub
2. Go to [render.com/dashboard](https://render.com/dashboard)
3. Click **+ New** → **Web Service**
4. Select your GitHub repository
5. Configure:
   - **Name**: `chat-app-backend` (or your choice)
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free tier works for testing

### Step 4: Add Environment Variables

In Render dashboard, go to **Environment** and add:

```
DATABASE_URL=mysql://user:password@host/database?ssl={"rejectUnauthorized":true}
PORT=10000
NODE_ENV=production
CLIENT_URLS=http://localhost:5173,https://your-frontend-url.com
```

> **Important**: The `DATABASE_URL` must use the format: `mysql://user:password@host/port/database`

### Step 5: Deploy

Click **Deploy** and monitor the logs. The server should start successfully even if the database isn't immediately connected. It will retry every 5 seconds.

## Option 2: AWS RDS MySQL

1. Create an RDS MySQL instance
2. Allow inbound traffic on port 3306 from Render's IP range
3. Use the RDS endpoint as your `DATABASE_URL`
4. Format: `mysql://admin:password@your-rds-endpoint:3306/chatapp`

## Option 3: Railway.app MySQL

1. Create a new project on Railway
2. Add MySQL as a service
3. Copy the `DATABASE_URL` from the MySQL service variables
4. Add to Render environment variables

## Health Check

The server provides a health check endpoint:

```
GET https://your-render-url.onrender.com/health
```

Response when database is connected:
```json
{
  "status": "healthy",
  "database": "connected",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

Response when database is disconnected (degraded mode):
```json
{
  "status": "degraded",
  "database": "disconnected",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Troubleshooting

### Server starts but database shows as disconnected

- Verify your `DATABASE_URL` is correct
- Check that the database server is running and accessible from Render
- For PlanetScale, ensure SSL is properly configured
- Check Render logs: `Logs` tab in dashboard

### Connection refused errors

- Ensure the database host is publicly accessible (for cloud databases)
- Verify firewall rules allow connections from Render's IP
- Check that port 3306 (or custom port) is not blocked

### Server takes time to start

The server now waits for database connection but doesn't block startup. It will:
1. Start serving HTTP requests immediately
2. Return 503 errors if database operations are needed and DB is unavailable
3. Retry database connection every 5 seconds
4. Operate in "degraded mode" until database is available

## Local Development

For local development, keep using individual environment variables:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=chatapp
```

Or use a local DATABASE_URL:
```env
DATABASE_URL=mysql://root:password@localhost:3306/chatapp
```

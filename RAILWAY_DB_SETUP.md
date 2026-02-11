# Railway Database Setup Instructions

## Import Clean Database to Railway

After you've created your Railway MySQL database, follow these steps:

### Option 1: Using Railway CLI (Recommended)

1. **Install Railway CLI** (if not already installed):
```bash
npm install -g @railway/cli
```

2. **Login to Railway**:
```bash
railway login
```

3. **Link to your project**:
```bash
railway link
```

4. **Import the database**:
```bash
railway run mysql -h $MYSQLHOST -P $MYSQLPORT -u $MYSQLUSER -p$MYSQLPASSWORD $MYSQLDATABASE < orion_clean.sql
```

### Option 2: Using MySQL Client

1. **Get your Railway MySQL credentials** from the Railway dashboard

2. **Import using mysql command**:
```bash
mysql -h your_railway_host -P 3306 -u root -p your_database_name < orion_clean.sql
```

### Option 3: Using phpMyAdmin or MySQL Workbench

1. **Connect to your Railway MySQL database** using the credentials from Railway dashboard
2. **Import** the `orion_clean.sql` file through the GUI

## Database Contents

This clean export includes:

✅ **Full database structure** (all 18 tables)
✅ **2 users only**:
   - **admin** (username: `admin`, password: `admin123`)
   - **demo** (username: `demo`, password: `demo123`)
✅ **Commission rates table** (with default rates)
✅ **Level settings table** (with 5 levels configured)

All other tables are **empty** and ready for production use.

## After Import

1. **Change default passwords** immediately for security
2. **Verify the import** by logging into your app
3. **Start adding products** through the admin panel

## Default Credentials

### Admin Login
- Username: `admin`
- Password: `admin123`

### Demo User Login
- Username: `demo`
- Password: `demo123`

⚠️ **Security Warning**: Change these passwords immediately after first login!

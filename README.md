# ORION Music Promotion Platform

A full-stack music promotion platform built with Node.js, Express, MySQL, and vanilla JavaScript.

## Features

- 🎵 **Product Promotion System** - Users can start and submit product promotions to earn commissions
- 💰 **Wallet & Commission System** - Balance management with commission tracking
- 🏆 **Level System** - 5 VIP levels with different commission rates
- 💸 **Withdraw System** - Cryptocurrency withdrawals (BTC, ETH, USDT, etc.) with password protection
- 💳 **Deposit System** - Deposit tracking and history
- 👥 **Referral System** - Earn 10% of referrals' first deposit + 20% ongoing commission
- 📊 **Negative Balance System** - Trigger mechanism with 10x commission bonus reward
- 💬 **Chat Support** - Real-time messaging with image support
- 🎉 **Events System** - Admin-managed promotional events
- 🔔 **Notifications** - Individual and global popup notifications
- 🎫 **Voucher System** - Promotional vouchers with click tracking

## Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MySQL
- **Authentication**: JWT + bcrypt
- **File Storage**: Multer
- **Scheduling**: node-cron

## Railway Deployment

### 1. Create Railway Project
1. Go to [Railway.app](https://railway.app)
2. Create a new project
3. Add a MySQL database from the "New" button

### 2. Deploy from GitHub
1. Connect your GitHub repository
2. Railway will auto-detect the configuration

### 3. Set Environment Variables
In Railway dashboard, add these variables:

| Variable | Description |
|----------|-------------|
| `JWT_SECRET` | Secure random string for JWT tokens |
| `NODE_ENV` | Set to `production` |

**Note**: Railway automatically provides MySQL variables (`MYSQLHOST`, `MYSQLPORT`, etc.) when you add a MySQL database.

### 4. Deploy
Railway will automatically deploy when you push to your main branch.

## Local Development

### Prerequisites
- Node.js 18+
- MySQL 8.0+

### Setup

1. Clone the repository:
```bash
git clone https://github.com/YOUR_USERNAME/orion.git
cd orion
```

2. Install dependencies:
```bash
cd backend
npm install
```

3. Create environment file:
```bash
cp .env.example .env
# Edit .env with your local MySQL credentials
```

4. Set up the database:
```bash
mysql -u root -p < schema.sql
```

5. Start the server:
```bash
npm start
```

6. Access the app:
- User interface: http://localhost:5000
- Admin panel: http://localhost:5000/admin.html

## Project Structure

```
orion/
├── index.html          # Landing page
├── app.html            # User application
├── admin.html          # Admin dashboard
├── css/
│   └── styles.css      # Global styles
├── js/
│   ├── api.js          # API client library
│   └── script.js       # Shared utilities
├── backend/
│   ├── server.js       # Express server
│   ├── schema.sql      # Database schema
│   ├── package.json    # Backend dependencies
│   └── uploads/        # User uploaded files
│       ├── products/
│       ├── vouchers/
│       ├── events/
│       ├── chat/
│       ├── profilepictures/
│       └── levelicons/
├── railway.json        # Railway deployment config
├── Procfile            # Process file for deployment
└── package.json        # Root package.json
```

## Default Admin Credentials

- **Username**: `admin`
- **Password**: `admin123`

⚠️ **Change these immediately in production!**

## API Endpoints

### Public
- `GET /api/test` - API health check
- `GET /api/health` - Detailed health status
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/events` - Get active events
- `GET /api/level-icons` - Get level icons

### User (requires authentication)
- `GET /api/user/dashboard` - User dashboard data
- `POST /api/products/start/:id` - Start a product
- `POST /api/products/submit/:assignmentId` - Submit a product
- `POST /api/withdrawals/request` - Request withdrawal
- `GET /api/user/withdrawals` - Withdrawal history
- `GET /api/user/deposits` - Deposit history

### Admin (requires admin authentication)
- `GET /api/admin/stats` - Platform statistics
- `GET /api/admin/users` - All users
- `POST /api/admin/products` - Upload product
- `GET /api/admin/withdrawals` - All withdrawals
- And many more...

## License

ISC

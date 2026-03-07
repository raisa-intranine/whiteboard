# Deploy Backend to Render

## Prerequisites
1. A Render account (sign up at https://render.com)
2. Your Neon PostgreSQL database URL
3. JWT secret key
4. Ably API key (for realtime features)

## Deployment Steps

### 1. Install Express dependency
```bash
cd backend
npm install express
```

### 2. Push code to GitHub
Make sure all changes are committed and pushed to your GitHub repository.

### 3. Create a new Web Service on Render

1. Go to https://dashboard.render.com
2. Click "New +" → "Web Service"
3. Connect your GitHub repository (raisa-intranine/whiteboard)
4. Configure the service:
   - **Name**: `whiteboard-backend`
   - **Region**: Singapore (closest to India)
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free

### 4. Add Environment Variables

In the Render dashboard, add these environment variables:

- `DATABASE_URL` = Your Neon PostgreSQL connection string
  - Format: `postgresql://user:password@host/database?sslmode=require`
  
- `JWT_SECRET` = A random secret string (generate with: `openssl rand -base64 32`)
  
- `ABLY_API_KEY` = Your Ably API key
  - Get from: https://ably.com/dashboard
  
- `FRONTEND_URL` = Your Netlify frontend URL
  - Example: `https://raisa-whiteboard-app.netlify.app`
  
- `NODE_ENV` = `production`

### 5. Deploy

Click "Create Web Service" and Render will automatically:
- Build your application
- Deploy it
- Provide you with a URL like: `https://whiteboard-backend-xxxx.onrender.com`

### 6. Update Frontend API URL

Update your frontend `.env` file or environment variables:

```env
VITE_API_URL=https://whiteboard-backend-xxxx.onrender.com
```

Then redeploy your frontend to Netlify.

## Testing

Test your API endpoints:

```bash
# Health check
curl https://your-render-url.onrender.com/

# Signup
curl -X POST https://your-render-url.onrender.com/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123"}'
```

## Important Notes

- **Free tier limitations**: Render free tier spins down after 15 minutes of inactivity. First request after spin-down may take 30-60 seconds.
- **Database**: Make sure your Neon database is accessible from Render's IP addresses.
- **CORS**: The backend is configured to accept requests from your FRONTEND_URL.

## Troubleshooting

### Check logs
```bash
# View logs in Render dashboard or use Render CLI
render logs -s whiteboard-backend
```

### Common issues
1. **Database connection fails**: Check DATABASE_URL format and Neon firewall settings
2. **CORS errors**: Verify FRONTEND_URL matches your Netlify URL exactly
3. **500 errors**: Check environment variables are set correctly

## Monitoring

- View logs in Render dashboard
- Set up health check monitoring
- Enable email notifications for deployment failures

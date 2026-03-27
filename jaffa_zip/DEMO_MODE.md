# 🔧 Jaffa Demo Mode

The Jaffa frontend automatically enters **DEMO MODE** when the backend is not available. This allows you to test and explore all UI features without a running backend server.

## How It Works

1. **Automatic Detection**: When you try to login and the backend fetch fails, the app automatically switches to mock mode
2. **Mock Data**: All API calls return realistic mock data
3. **Full Functionality**: You can test all features including login, matches, predictions, leaderboards, and rewards

## Testing the App

### Login Flow

1. Go to the login page
2. Enter any phone number (e.g., `+91 9876543210`)
3. Click "SEND OTP"
4. When prompted, enter one of these test OTPs:
   - **123456** (default)
   - **111111** (alternative)
5. Continue through the flow to explore the app

### Joining a Match

1. After logging in, you'll see the Match Lobby with 2 upcoming matches
2. Click on any match to join
3. When prompted for a match code, enter **any code** (e.g., `ABC123`)
4. In demo mode, all match codes are valid
5. You'll be taken to the match page where you can see predictions and leaderboards

### Available Mock Data

- **Matches**: 2 upcoming IPL matches (Mumbai Indians vs Chennai Super Kings, Royal Challengers vs Kolkata Knight Riders)
- **Live Game**: Active predictions with questions, options, and odds
- **Leaderboard**: Sample rankings with your mock user in 3rd place
- **Rewards**: 2 sample rewards (Free Coffee, 20% Off Food)
- **Points**: Your mock user has 2500 points and rank #12

## Connecting to Real Backend

When your backend is ready:

1. Update the API URL in your environment:
   ```bash
   VITE_API_URL=https://your-backend-url.com
   ```

2. The app will automatically use the real backend instead of mock data

3. To force mock mode even with a backend available:
   ```bash
   VITE_USE_MOCK=true
   ```

## Console Logs

In demo mode, you'll see helpful console logs:
- `🔧 Backend unavailable, switching to MOCK MODE` - when backend is not available
- `📱 MOCK API: /api/endpoint` - for each mock API call
- `⚠️ No mock data for: /api/endpoint` - if an endpoint needs mock data added

## Features Available in Demo Mode

✅ **Login with OTP** - Full authentication flow  
✅ **Match Lobby** - Browse upcoming matches  
✅ **Live Game** - See prediction questions and submit answers  
✅ **Leaderboards** - View round and match rankings  
✅ **Rewards** - Browse and redeem mock rewards  
✅ **Profile** - View user stats and history  
✅ **Café Mode** - Test venue-scoped flows  
✅ **Admin Dashboard** - View venue stats and manage matches  
✅ **TV Display** - See the live leaderboard display mode  

## Notes

- Mock data is stored in `/src/app/lib/api.ts`
- Network calls have a 500ms simulated delay for realistic testing
- All mock responses follow the same schema as the real backend
- User state persists in localStorage (token, userId, etc.)

Happy testing! 🏏🎉
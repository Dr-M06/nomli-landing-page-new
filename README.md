# Nomli Mingle

A social networking app for users to connect, share experiences, and plan meetups with their community.

## Features

- **User Profiles**: Create and customize your profile with interests, bio, and avatar
- **Discover**: Find other users based on location and shared interests
- **Real-time Messaging**: Connect with friends and community members through real-time chat
- **Video/Audio Calls**: Make voice and video calls with other users
- **Events**: Create and join community events and meetups
- **Push Notifications**: Get notified of messages and calls even when the app is closed
- **Country-based Chat**: Join public chats based on your country
- **Real-time Status**: See when users are online and active

## Tech Stack

- React Native / Expo
- TypeScript
- Supabase for backend (authentication, database, real-time subscriptions, storage)
- Expo Notifications for push notifications
- Expo Router for navigation
- Zustand for state management
- React Native Reanimated for animations
- Lucide React Native for icons

## Getting Started

### Prerequisites

- Node.js
- npm or yarn
- Expo Go app (for mobile testing)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/Dr-M06/nomli-mingle.git
cd nomli-mingle
```

2. Run the automated setup script:
```bash
node setup.js
```

3. Install dependencies:
```bash
npm install
# or
yarn install
```

4. Configure your environment variables:
   - Edit the `.env` file created by the setup script
   - Add your actual API keys (see Environment Variables section below)

5. Start the development server:
```bash
npx expo start --clear
# or
yarn dev
```

6. Open the app on your mobile device using Expo Go or in a simulator.

### Quick Setup for Developers

If you're setting up the project for the first time:

```bash
# Clone and setup
git clone https://github.com/Dr-M06/nomli-mingle.git
cd nomli-mingle
node setup.js

# Install and start
npm install
npx expo start --clear
```

## Screenshots

[Add app screenshots here]

## Environment Variables

This project uses environment variables to handle API keys and sensitive credentials. To set up the project properly:

1. Create a `.env` file in the project root:

```env
# Supabase Configuration (required for authentication and database)
EXPO_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Expo Notifications
# No OneSignal or FCM configuration required

# Other API keys
EXPO_GEOAPIFY_API_KEY=your-geoapify-api-key
```

2. **Supabase Setup**:
   - Log in to [Supabase Dashboard](https://app.supabase.com)
   - Create a new project or select your existing project
   - Go to "Project Settings" > "API"
   - Copy the "URL" and "anon/public" key

3. **Push Notifications**:
   - Uses Expo Push service via `expo-notifications`
   - Requires a real device for token issuance
   - Create a new app for React Native
   - Get your App ID and REST API Key from the dashboard
   - See `NOTIFICATION_SETUP.md` for detailed setup instructions

4. **Restart your development server**:
   ```bash
   npx expo start --clear
   ```

⚠️ **Important**: 
- Never commit your `.env` file to version control
- Never commit build artifacts (`.apk`, `.aab`, `.ipa` files)
- The setup script automatically installs Git hooks to prevent this

## Building and Deployment

### Development Build
```bash
# Start development server
npx expo start

# Run on specific platform
npx expo start --ios
npx expo start --android
```

### Production Build
```bash
# Build for production (requires EAS CLI)
npm install -g @expo/eas-cli
eas login
eas build --platform all
```

### Publishing Updates
```bash
# Publish over-the-air updates
eas update --branch production
```

### Cleaning Build Artifacts

The repository includes scripts to keep your project clean:

```bash
# Remove all build artifacts (recommended before committing)
./cleanup.sh

# Or use npm scripts
npm run clean-artifacts

# Complete clean (removes node_modules too)
npm run clean-all

# Fresh start (clean + setup + start)
npm run fresh-start
```

**Why clean build artifacts?**
- Keeps repository size small
- Prevents deployment issues
- Avoids version conflicts
- Improves Git performance

## Documentation

Technical documentation lives in the **`docs/`** folder:

| Document | Purpose |
|----------|--------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System overview, tech stack, data flow |
| [docs/API.md](docs/API.md) | Supabase & Edge Functions reference |
| [docs/DATABASE_SCHEMA.md](docs/DATABASE_SCHEMA.md) | Database tables and relationships |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Build, deploy, and release runbook |
| [docs/ONBOARDING.md](docs/ONBOARDING.md) | Developer onboarding guide |

See [docs/README.md](docs/README.md) for the full index.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contact

- GitHub: [@Dr-M06](https://github.com/Dr-M06) 
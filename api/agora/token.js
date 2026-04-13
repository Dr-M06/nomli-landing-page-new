// API endpoint for Agora token generation
// This keeps sensitive data on the server side

const { RtcTokenBuilder, RtcRole } = require('agora-token');
require('dotenv').config({ path: '.env.backend' });

export default function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { channelName, uid, role = 'publisher' } = req.body;
    
    // Validate required fields
    if (!channelName || !uid) {
      return res.status(400).json({ 
        error: 'Missing required fields: channelName and uid are required' 
      });
    }

    // TODO: Add user authentication here
    // const user = authenticateUser(req);
    // if (!user) {
    //   return res.status(401).json({ error: 'Unauthorized' });
    // }
    
    // TODO: Add channel access control here
    // if (!hasChannelAccess(user.id, channelName)) {
    //   return res.status(403).json({ error: 'Access denied' });
    // }
    
    // Generate token using server-side environment variables
    const token = RtcTokenBuilder.buildTokenWithUid(
      process.env.AGORA_APP_ID,
      process.env.AGORA_APP_CERTIFICATE,
      channelName,
      parseInt(uid),
      RtcRole.PUBLISHER,
      Math.floor(Date.now() / 1000) + 3600 // 1 hour expiration
    );
    
    res.json({
      success: true,
      data: {
        token,
        appId: process.env.AGORA_APP_ID,
        channelName,
        uid: parseInt(uid),
        expirationTime: Math.floor(Date.now() / 1000) + 3600
      }
    });
  } catch (error) {
    console.error('Token generation error:', error);
    res.status(500).json({ error: 'Token generation failed' });
  }
}

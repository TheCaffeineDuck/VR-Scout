/**
 * LiveKit token generation — SERVER-SIDE ONLY.
 *
 * This file is a placeholder documenting what the server endpoint
 * POST /api/vr/tokens/livekit must do. This code must NOT run in
 * the client bundle — it requires the LIVEKIT_API_SECRET which
 * must only exist on the server.
 *
 * Server implementation (e.g., Firebase Function or Cloudflare Worker):
 *
 *   import { AccessToken } from 'livekit-server-sdk'
 *
 *   export async function generateLiveKitToken(
 *     req: { uid: string; displayName: string; roomName: string }
 *   ): Promise<string> {
 *     const apiKey = process.env.LIVEKIT_API_KEY       // public key
 *     const apiSecret = process.env.LIVEKIT_API_SECRET // SECRET — server only
 *
 *     const token = new AccessToken(apiKey, apiSecret, {
 *       identity: req.uid,
 *       name: req.displayName,
 *     })
 *     token.addGrant({
 *       roomJoin: true,
 *       room: req.roomName,
 *       canPublish: true,
 *       canSubscribe: true,
 *     })
 *
 *     return token.toJwt()
 *   }
 *
 * Client-side usage (in useVoiceChat.ts or collaboration.ts):
 *
 *   const idToken = await getAuth().currentUser?.getIdToken()
 *   const res = await fetch('/api/vr/tokens/livekit', {
 *     method: 'POST',
 *     headers: {
 *       'Content-Type': 'application/json',
 *       'Authorization': `Bearer ${idToken}`,
 *     },
 *     body: JSON.stringify({ roomName, displayName }),
 *   })
 *   const { token } = await res.json()
 *   // Use token to connect: room.connect(livekitUrl, token)
 */

export type _LiveKitTokenPlaceholder = never

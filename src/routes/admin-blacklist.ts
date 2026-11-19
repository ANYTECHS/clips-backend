/**
 * POST /admin/nfts/blacklist
 * Admin-only endpoint to blacklist malicious clip IDs.
 *
 * @openapi
 * /admin/nfts/blacklist:
 *   post:
 *     summary: Blacklist a malicious clip
 *     description: Prevents future minting of specified clip
 *     security:
 *       - adminAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - clipId
 *               - reason
 *             properties:
 *               clipId:
 *                 type: string
 *                 description: The clip ID to blacklist
 *               reason:
 *                 type: string
 *                 description: Reason for blacklisting
 *     responses:
 *       200:
 *         description: Clip blacklisted successfully
 *       401:
 *         description: Unauthorized - admin authentication required
 *       409:
 *         description: Clip already blacklisted
 */

import { BlacklistService } from '../blacklist.service';

// Initialize with admin addresses (in production, these come from config/DB)
const blacklistService = new BlacklistService([
  // Admin addresses loaded from environment/config
]);

/**
 * POST /admin/nfts/blacklist
 */
export async function handleBlacklistClip(req: {
  body: { clipId: string; reason: string };
  headers: { authorization?: string };
}): Promise<{ status: number; body: unknown }> {
  try {
    // Admin authentication check
    const adminAddress = extractAdminFromAuth(req.headers.authorization);
    if (!adminAddress) {
      return {
        status: 401,
        body: { error: 'Unauthorized: admin authentication required' },
      };
    }

    const { clipId, reason } = req.body;
    if (!clipId || !reason) {
      return {
        status: 400,
        body: { error: 'Missing required fields: clipId, reason' },
      };
    }

    const entry = blacklistService.blacklistClip(clipId, reason, adminAddress);
    return {
      status: 200,
      body: {
        message: `Clip ${clipId} blacklisted successfully`,
        entry,
      },
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (message.includes('Unauthorized')) {
      return { status: 401, body: { error: message } };
    }
    if (message.includes('already blacklisted')) {
      return { status: 409, body: { error: message } };
    }
    return { status: 500, body: { error: message } };
  }
}

/**
 * GET /admin/nfts/blacklist
 * List all blacklisted clips (admin only)
 */
export async function handleGetBlacklist(req: {
  headers: { authorization?: string };
}): Promise<{ status: number; body: unknown }> {
  const adminAddress = extractAdminFromAuth(req.headers.authorization);
  if (!adminAddress) {
    return {
      status: 401,
      body: { error: 'Unauthorized: admin authentication required' },
    };
  }

  const entries = blacklistService.getAllBlacklisted();
  return {
    status: 200,
    body: {
      count: entries.length,
      blacklisted: entries,
    },
  };
}

function extractAdminFromAuth(auth?: string): string | null {
  // In production: verify JWT or API key
  if (!auth) return null;
  if (auth.startsWith('Bearer ')) {
    const token = auth.slice(7);
    // Verify admin token (placeholder)
    return token.length > 0 ? 'admin-verified' : null;
  }
  return null;
}

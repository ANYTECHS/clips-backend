/**
 * NFT Blacklist Service
 * Allows administrators to blacklist malicious clip IDs to prevent
 * future minting of copyright-violating or abusive content.
 *
 * @see https://github.com/ANYTECHS/clips-backend/issues/681
 */

export interface BlacklistEntry {
  clipId: string;
  reason: string;
  blacklistedBy: string;
  blacklistedAt: string;
  expiresAt?: string;
}

export interface BlacklistAction {
  type: 'blacklist' | 'unblacklist';
  clipId: string;
  adminAddress: string;
  timestamp: string;
}

export class BlacklistService {
  private blacklistedClips: Map<string, BlacklistEntry> = new Map();
  private adminAddresses: Set<string> = new Set();

  constructor(initialAdmins: string[] = []) {
    for (const admin of initialAdmins) {
      this.adminAddresses.add(admin);
    }
  }

  /**
   * Add an admin address authorized to manage blacklist.
   */
  addAdmin(address: string): void {
    this.adminAddresses.add(address);
    this.emitEvent('AdminAdded', { address });
  }

  /**
   * Remove an admin address.
   */
  removeAdmin(address: string): void {
    this.adminAddresses.delete(address);
    this.emitEvent('AdminRemoved', { address });
  }

  /**
   * Check if an address is an admin.
   */
  isAdmin(address: string): boolean {
    return this.adminAddresses.has(address);
  }

  /**
   * Blacklist a clip ID. Only callable by admin.
   * Emits Blacklist event on success.
   */
  blacklistClip(clipId: string, reason: string, adminAddress: string): BlacklistEntry {
    if (!this.isAdmin(adminAddress)) {
      throw new Error(`Unauthorized: ${adminAddress} is not an admin`);
    }

    if (this.blacklistedClips.has(clipId)) {
      throw new Error(`Clip ${clipId} is already blacklisted`);
    }

    const entry: BlacklistEntry = {
      clipId,
      reason,
      blacklistedBy: adminAddress,
      blacklistedAt: new Date().toISOString(),
    };

    this.blacklistedClips.set(clipId, entry);
    this.emitEvent('Blacklist', { clipId, reason, adminAddress, timestamp: entry.blacklistedAt });

    return entry;
  }

  /**
   * Remove a clip from the blacklist. Only callable by admin.
   */
  unblacklistClip(clipId: string, adminAddress: string): void {
    if (!this.isAdmin(adminAddress)) {
      throw new Error(`Unauthorized: ${adminAddress} is not an admin`);
    }

    if (!this.blacklistedClips.has(clipId)) {
      throw new Error(`Clip ${clipId} is not blacklisted`);
    }

    this.blacklistedClips.delete(clipId);
    this.emitEvent('Unblacklist', { clipId, adminAddress, timestamp: new Date().toISOString() });
  }

  /**
   * Check if a clip is blacklisted.
   * Call before minting to prevent blacklisted clips.
   */
  isBlacklisted(clipId: string): boolean {
    return this.blacklistedClips.has(clipId);
  }

  /**
   * Prevent minting of blacklisted clips.
   * Throws if clip is blacklisted.
   */
  validateCanMint(clipId: string): void {
    if (this.isBlacklisted(clipId)) {
      const entry = this.blacklistedClips.get(clipId)!;
      throw new Error(
        `Cannot mint clip ${clipId}: blacklisted by ${entry.blacklistedBy} (reason: ${entry.reason})`
      );
    }
  }

  /**
   * Get blacklist entry for a clip.
   */
  getBlacklistEntry(clipId: string): BlacklistEntry | undefined {
    return this.blacklistedClips.get(clipId);
  }

  /**
   * Get all blacklisted clips.
   */
  getAllBlacklisted(): BlacklistEntry[] {
    return Array.from(this.blacklistedClips.values());
  }

  /**
   * Get blacklist count.
   */
  getBlacklistCount(): number {
    return this.blacklistedClips.size;
  }

  /**
   * Emit an event for API/Swagger integration.
   */
  private emitEvent(eventName: string, data: Record<string, unknown>): void {
    console.log(`[BlacklistEvent] ${eventName}:`, JSON.stringify(data));
    // In production, this would emit a proper event for:
    // - POST /admin/nfts/blacklist
    // - Admin audit logging
  }
}

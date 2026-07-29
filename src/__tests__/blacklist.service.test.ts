import { BlacklistService } from '../blacklist.service';

describe('BlacklistService', () => {
  let service: BlacklistService;
  const admin = 'GABCDEF1234567890';

  beforeEach(() => {
    service = new BlacklistService([admin]);
  });

  describe('addAdmin', () => {
    it('should add a new admin', () => {
      service.addAdmin('NEW_ADMIN');
      expect(service.isAdmin('NEW_ADMIN')).toBe(true);
    });
  });

  describe('removeAdmin', () => {
    it('should remove an admin', () => {
      service.addAdmin('TEMP_ADMIN');
      service.removeAdmin('TEMP_ADMIN');
      expect(service.isAdmin('TEMP_ADMIN')).toBe(false);
    });
  });

  describe('blacklistClip', () => {
    it('should blacklist a clip when called by admin', () => {
      const entry = service.blacklistClip('clip-123', 'Copyright violation', admin);
      expect(entry.clipId).toBe('clip-123');
      expect(entry.reason).toBe('Copyright violation');
      expect(entry.blacklistedBy).toBe(admin);
      expect(service.isBlacklisted('clip-123')).toBe(true);
    });

    it('should throw if caller is not admin', () => {
      expect(() => {
        service.blacklistClip('clip-456', 'Bad content', 'not-an-admin');
      }).toThrow('Unauthorized');
    });

    it('should throw if clip already blacklisted', () => {
      service.blacklistClip('clip-789', 'First reason', admin);
      expect(() => {
        service.blacklistClip('clip-789', 'Second reason', admin);
      }).toThrow('already blacklisted');
    });
  });

  describe('unblacklistClip', () => {
    it('should remove a clip from blacklist', () => {
      service.blacklistClip('clip-abc', 'Test', admin);
      service.unblacklistClip('clip-abc', admin);
      expect(service.isBlacklisted('clip-abc')).toBe(false);
    });

    it('should throw if clip not blacklisted', () => {
      expect(() => {
        service.unblacklistClip('nonexistent', admin);
      }).toThrow('not blacklisted');
    });

    it('should throw if caller is not admin', () => {
      service.blacklistClip('clip-xyz', 'Test', admin);
      expect(() => {
        service.unblacklistClip('clip-xyz', 'not-admin');
      }).toThrow('Unauthorized');
    });
  });

  describe('validateCanMint', () => {
    it('should allow minting non-blacklisted clips', () => {
      expect(() => service.validateCanMint('safe-clip')).not.toThrow();
    });

    it('should prevent minting blacklisted clips', () => {
      service.blacklistClip('bad-clip', 'Copyright', admin);
      expect(() => service.validateCanMint('bad-clip')).toThrow('Cannot mint');
    });
  });

  describe('getAllBlacklisted', () => {
    it('should return empty array when no clips blacklisted', () => {
      expect(service.getAllBlacklisted()).toEqual([]);
    });

    it('should return all blacklisted entries', () => {
      service.blacklistClip('a', 'reason1', admin);
      service.blacklistClip('b', 'reason2', admin);
      expect(service.getAllBlacklisted()).toHaveLength(2);
    });
  });
});

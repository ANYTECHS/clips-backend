import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  constructor(private readonly appConfig: AppConfigService) {
    const secret = appConfig.encryptionSecret;
    if (!secret) {
      throw new Error('ENCRYPTION_SECRET environment variable is required');
    }

    // Use SHA-256 to ensure we have exactly 32 bytes for AES-256
    this.key = crypto.createHash('sha256').update(secret).digest();
  }

  /**
   * Encrypts sensitive data using AES-256-GCM
   * @param text - Plain text to encrypt
   * @returns Base64 encoded encrypted data with IV and auth tag
   */
  encrypt(text: string): string {
    if (!text) return text;
    
    const iv = crypto.randomBytes(16); // 128-bit IV for GCM
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    cipher.setAAD(Buffer.from('clips-backend', 'utf8')); // Additional authenticated data
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag();
    
    // Combine IV + authTag + encrypted data
    const combined = Buffer.concat([iv, authTag, Buffer.from(encrypted, 'hex')]);
    
    return combined.toString('base64');
  }

  /**
   * Decrypts sensitive data using AES-256-GCM
   * @param encryptedData - Base64 encoded encrypted data with IV and auth tag
   * @returns Decrypted plain text
   */
  decrypt(encryptedData: string): string {
    if (!encryptedData) return encryptedData;
    
    try {
      const combined = Buffer.from(encryptedData, 'base64');
      
      // Extract IV, authTag, and encrypted data
      const iv = combined.slice(0, 16);
      const authTag = combined.slice(16, 32);
      const encrypted = combined.slice(32);
      
      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAAD(Buffer.from('clips-backend', 'utf8'));
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted.toString('binary'), 'binary', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      throw new Error('Failed to decrypt sensitive data');
    }
  }

  /**
   * Encrypts an object's specific sensitive fields
   * @param obj - Object to encrypt
   * @param fields - Array of field names to encrypt
   * @returns Object with encrypted fields
   */
  encryptObjectFields<T>(obj: T, fields: (keyof T)[]): T {
    const result = { ...obj };
    
    for (const field of fields) {
      const value = result[field];
      if (typeof value === 'string') {
        (result as any)[field] = this.encrypt(value);
      }
    }
    
    return result;
  }

  /**
   * Decrypts an object's specific sensitive fields
   * @param obj - Object to decrypt
   * @param fields - Array of field names to decrypt
   * @returns Object with decrypted fields
   */
  decryptObjectFields<T>(obj: T, fields: (keyof T)[]): T {
    const result = { ...obj };
    
    for (const field of fields) {
      const value = result[field];
      if (typeof value === 'string') {
        try {
          (result as any)[field] = this.decrypt(value);
        } catch {
          // If decryption fails, keep original value
          // This handles cases where data isn't encrypted yet
        }
      }
    }
    
    return result;
  }
}

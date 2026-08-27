import { Injectable, Logger } from '@nestjs/common';

export interface AyrsharePostResult {
  platform: string;
  success: boolean;
  postId?: string;
  error?: string;
}

/**
 * Thin wrapper around the Ayrshare Social API.
 * Docs: https://docs.ayrshare.com/rest-api/endpoints/post
 *
 * Set AYRSHARE_API_KEY in your environment.
 */
@Injectable()
export class AyrshareService {
  private readonly logger = new Logger(AyrshareService.name);
  private readonly apiKey = process.env.AYRSHARE_API_KEY ?? '';
  private readonly baseUrl = 'https://app.ayrshare.com/api';

  async post(
    mediaUrl: string,
    caption: string,
    platforms: string[],
  ): Promise<AyrsharePostResult[]> {
    const body = JSON.stringify({
      post: caption,
      platforms,
      mediaUrls: [mediaUrl],
    });

    let data: any;
    try {
      const res = await fetch(`${this.baseUrl}/post`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body,
      });
      data = await res.json();
    } catch (err: any) {
      this.logger.error('Ayrshare API request failed', err?.message);
      return platforms.map((p) => ({
        platform: p,
        success: false,
        error: err?.message ?? 'Network error',
      }));
    }

    // Ayrshare returns { postIds: { tiktok: { id, status }, ... }, errors: [...] }
    const results: AyrsharePostResult[] = platforms.map((platform) => {
      const platformData = data?.postIds?.[platform];
      if (platformData?.id) {
        return { platform, success: true, postId: String(platformData.id) };
      }
      const errMsg =
        data?.errors?.find((e: any) => e.platform === platform)?.message ??
        'Unknown error';
      return { platform, success: false, error: errMsg };
    });

    return results;
  }
}

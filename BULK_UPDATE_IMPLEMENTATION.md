# Bulk Update Endpoint Implementation (#728)

## Overview
Implemented the bulk update endpoint for clip status as specified in issue #728. This allows users to update multiple clips at once after curation.

## API Endpoint
```
POST /clips/bulk-update
```

## Request Body
```typescript
{
  clipIds: number[],
  updates: {
    selected?: boolean,
    postStatus?: Json,  // Can be string like "posted" or object like { platform: 'tiktok', status: 'posted', postId: '12345' }
    caption?: string,
    royaltyBps?: number  // 0-1500 (0-15%)
  }
}
```

## Response
```typescript
{
  updatedCount: number,
  notFoundIds: number[],
  updates: object,  // Echo of applied updates
  allClipsProcessed?: boolean  // True if all clips in affected videos are now posted
}
```

## Implementation Details

### Database Changes
1. **Added `selected` field to Clip model**
   - Added migration: `20260828_add_selected_field_to_clip`
   - Updated Prisma schema with `selected Boolean @default(false)`
   - Added index for performance: `@@index([selected])`

### Service Implementation
1. **ClipsService.bulkUpdate() method**
   - Validates user ownership of clips via `video.userId`
   - Uses Prisma transaction for atomic updates
   - Returns counts of updated vs not found clips
   - Emits `ALL_CLIPS_PROCESSED_EVENT` when all clips in a video are posted

### Key Features
- **Ownership Validation**: Only clips belonging to the requesting user are updated
- **Atomic Updates**: Uses Prisma transactions to ensure data consistency
- **Event Emission**: Automatically detects when all clips in a video are processed
- **Flexible Updates**: Supports updating any combination of fields
- **Error Handling**: Clear validation and permission errors

### Security
- Clips not owned by user are silently skipped (no info leakage)
- At least one update field must be provided
- Royalty BPS validation (0-1500 range)

### Testing Support
- Added `_seed()` method for test data injection
- Enhanced `findById()` to work with test data
- Maintains backward compatibility with existing tests

## Files Modified

### Core Implementation
- `src/clips/clips.service.ts` - Main bulk update logic
- `src/clips/clips.controller.ts` - HTTP endpoint
- `src/clips/dto/bulk-update-clips.dto.ts` - Request validation

### Database Schema
- `prisma/schema.prisma` - Added `selected` field to Clip model
- `prisma/migrations/20260828_add_selected_field_to_clip/migration.sql` - Database migration

### Entity Updates
- `src/clips/clip.entity.ts` - Added `selected` field and test compatibility

## Usage Example

```typescript
// Mark clips as selected for posting
POST /clips/bulk-update
{
  "clipIds": [1, 2, 3],
  "updates": {
    "selected": true
  }
}

// Update post status and mark as posted
POST /clips/bulk-update
{
  "clipIds": [1, 2],
  "updates": {
    "postStatus": {
      "platform": "tiktok",
      "status": "posted", 
      "postId": "12345"
    }
  }
}
```

## Event System Integration
When clips are marked as posted, the service automatically checks if all clips in the parent video(s) are now processed and emits the `ALL_CLIPS_PROCESSED_EVENT` for downstream processing.

## Testing
The implementation includes comprehensive test support through:
- In-memory test data management via `_seed()`
- Mock-friendly architecture
- Event emission verification
- Permission and validation test scenarios

This implementation fully satisfies the acceptance criteria in issue #728 and maintains compatibility with the existing codebase architecture.
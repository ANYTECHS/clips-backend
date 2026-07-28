# Prisma Query Optimization Guide

This guide covers best practices for writing efficient Prisma queries in the ClipCash backend.

## Table of Contents

- [Select vs Include](#select-vs-include)
- [Query Optimization Patterns](#query-optimization-patterns)
- [Indexing Strategy](#indexing-strategy)
- [N+1 Query Prevention](#n1-query-prevention)
- [Pagination Best Practices](#pagination-best-practices)
- [Performance Monitoring](#performance-monitoring)

---

## Select vs Include

### The Problem

Using `include` fetches **all fields** from related tables, which can lead to:
- Unnecessary database load
- Larger payloads over the network
- Slower query execution
- Higher memory consumption

### Rule of Thumb

**Use `select` when you need specific fields. Use `include` only when you need all fields from a relation.**

### ❌ Bad: Using `include` when only userId is needed

```typescript
const clip = await this.prisma.clip.findUnique({
  where: { id: clipId },
  include: { video: true }, // Fetches ALL video fields
});

// Only using video.userId
if (clip.video.userId !== userId) {
  throw new ForbiddenException('Not your clip');
}
```

**Problem:** Fetches `title`, `description`, `sourceUrl`, `thumbnail`, `duration`, `fileSize`, `status`, `processingError`, `processingStats`, `targetPlatforms`, `createdAt`, `updatedAt` — but only uses `userId`.

### ✅ Good: Using `select` to fetch only needed fields

```typescript
const clip = await this.prisma.clip.findUnique({
  where: { id: clipId },
  select: {
    id: true,
    video: {
      select: { userId: true },
    },
  },
});

if (clip.video.userId !== userId) {
  throw new ForbiddenException('Not your clip');
}
```

**Benefit:** Only fetches `clip.id` and `video.userId` — significantly less data transferred.

---

## Query Optimization Patterns

### Pattern 1: Authorization Checks

**Use case:** Verify ownership before performing an operation.

```typescript
// ❌ Bad: Fetches entire video object
const clip = await this.prisma.clip.findUnique({
  where: { id: clipId },
  include: { video: true },
});
if (clip.video.userId !== userId) throw new ForbiddenException();

// ✅ Good: Fetch only userId
const clip = await this.prisma.clip.findUnique({
  where: { id: clipId },
  select: {
    id: true,
    video: { select: { userId: true } },
  },
});
if (clip.video.userId !== userId) throw new ForbiddenException();

// ✅ Best: Use where clause to filter in database
const clip = await this.prisma.clip.findFirst({
  where: {
    id: clipId,
    video: { userId },
  },
});
if (!clip) throw new ForbiddenException();
```

### Pattern 2: Listing Resources with Relations

**Use case:** Fetch clips with video titles for a list view.

```typescript
// ❌ Bad: Fetches all video fields
const clips = await this.prisma.clip.findMany({
  where: { video: { userId } },
  include: { video: true },
});

// ✅ Good: Fetch only needed fields
const clips = await this.prisma.clip.findMany({
  where: { video: { userId } },
  select: {
    id: true,
    clipUrl: true,
    thumbnail: true,
    duration: true,
    viralityScore: true,
    createdAt: true,
    video: {
      select: {
        id: true,
        title: true,
      },
    },
  },
});
```

### Pattern 3: Nested Relations

**Use case:** Fetch earning with clip and video information.

```typescript
// ❌ Bad: Multiple includes load everything
const earning = await this.prisma.earning.findUnique({
  where: { id: earningId },
  include: {
    clip: {
      include: {
        video: true,
      },
    },
  },
});

// ✅ Good: Select only needed fields at each level
const earning = await this.prisma.earning.findUnique({
  where: { id: earningId },
  select: {
    id: true,
    amount: true,
    currency: true,
    date: true,
    clip: {
      select: {
        id: true,
        clipUrl: true,
        video: {
          select: {
            userId: true,
            title: true,
          },
        },
      },
    },
  },
});
```

### Pattern 4: Authentication Queries

**Use case:** Load user for JWT validation.

```typescript
// ❌ Bad: Loads user with all relations
const token = await this.prisma.refreshToken.findUnique({
  where: { tokenHash },
  include: { user: true },
});

// ✅ Good: Load only needed user fields
const token = await this.prisma.refreshToken.findUnique({
  where: { tokenHash },
  select: {
    id: true,
    expiresAt: true,
    revokedAt: true,
    user: {
      select: {
        id: true,
        email: true,
        role: true,
        mfaEnabled: true,
      },
    },
  },
});
```

---

## Indexing Strategy

### Current Indexes (from schema.prisma)

Review existing indexes regularly:

```prisma
model Video {
  @@index([userId])
  @@index([status])
}

model Clip {
  @@index([videoId])
}

model Payout {
  @@index([status])
  @@index([payoutMethodId])
}
```

### Adding Indexes

**When to add an index:**
- Columns frequently used in `WHERE` clauses
- Foreign keys used in `JOIN` operations
- Columns used in `ORDER BY` clauses
- Composite indexes for common multi-column queries

**Example: Optimize clip filtering by status and user**

```prisma
model Clip {
  // ... fields
  
  @@index([videoId])
  @@index([nftStatus])              // Add if filtering by nftStatus
  @@index([videoId, createdAt])     // Composite for pagination
}
```

**After adding indexes, create a migration:**

```bash
npx prisma migrate dev --name add_clip_indexes
```

---

## N+1 Query Prevention

### The N+1 Problem

Fetching a list of items, then fetching related data for each item in a loop.

```typescript
// ❌ Bad: N+1 queries (1 query for clips + N queries for videos)
const clips = await this.prisma.clip.findMany({
  where: { /* ... */ },
});

for (const clip of clips) {
  const video = await this.prisma.video.findUnique({
    where: { id: clip.videoId },
  });
  console.log(video.title);
}
```

### Solution: Use Relations

```typescript
// ✅ Good: Single query with join
const clips = await this.prisma.clip.findMany({
  where: { /* ... */ },
  select: {
    id: true,
    clipUrl: true,
    video: {
      select: {
        id: true,
        title: true,
      },
    },
  },
});

clips.forEach(clip => {
  console.log(clip.video.title);
});
```

---

## Pagination Best Practices

### Cursor-Based Pagination (Recommended)

**Best for:** Infinite scroll, real-time data, large datasets

```typescript
async findClipsPaginated(
  userId: number,
  cursor?: number,
  take = 20,
) {
  const clips = await this.prisma.clip.findMany({
    where: { video: { userId } },
    select: {
      id: true,
      clipUrl: true,
      thumbnail: true,
      duration: true,
      createdAt: true,
    },
    take: take + 1, // Fetch one extra to check if there's a next page
    cursor: cursor ? { id: cursor } : undefined,
    orderBy: { createdAt: 'desc' },
  });

  const hasMore = clips.length > take;
  const items = hasMore ? clips.slice(0, take) : clips;

  return {
    items,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  };
}
```

### Offset-Based Pagination

**Best for:** Traditional page numbers, known total count

```typescript
async findClipsPaginated(
  userId: number,
  page = 1,
  pageSize = 20,
) {
  const skip = (page - 1) * pageSize;

  const [clips, total] = await Promise.all([
    this.prisma.clip.findMany({
      where: { video: { userId } },
      select: {
        id: true,
        clipUrl: true,
        thumbnail: true,
        duration: true,
      },
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    this.prisma.clip.count({
      where: { video: { userId } },
    }),
  ]);

  return {
    items: clips,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
```

---

## Performance Monitoring

### 1. Enable Prisma Query Logging

In development, log slow queries:

```typescript
// prisma/prisma.service.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'stdout', level: 'error' },
    { emit: 'stdout', level: 'warn' },
  ],
});

prisma.$on('query', (e) => {
  if (e.duration > 100) { // Log queries taking >100ms
    console.warn(`Slow query detected (${e.duration}ms): ${e.query}`);
  }
});
```

### 2. Use EXPLAIN ANALYZE

For complex queries, analyze the execution plan:

```typescript
// In development only
const result = await this.prisma.$queryRaw`
  EXPLAIN ANALYZE
  SELECT * FROM "Clip"
  WHERE "videoId" IN (
    SELECT id FROM "Video" WHERE "userId" = ${userId}
  )
`;
console.log(result);
```

### 3. Monitor with Prometheus

Track query performance in production:

```typescript
const queryTimer = histogram.startTimer();
const result = await this.prisma.clip.findMany({ /* ... */ });
queryTimer({ operation: 'findClips', status: 'success' });
```

---

## Code Review Checklist

Before merging Prisma queries, check:

- [ ] Does the query use `select` instead of `include` when possible?
- [ ] Are only necessary fields being fetched?
- [ ] Is there a potential N+1 query issue?
- [ ] Are frequently queried columns indexed?
- [ ] Is pagination implemented for list queries?
- [ ] Are authorization checks pushed to the database layer when possible?
- [ ] Has the query been tested with realistic data volumes?

---

## Common Optimization Opportunities

### Opportunity 1: Count Queries

```typescript
// ❌ Bad: Fetches all records then counts in memory
const clips = await this.prisma.clip.findMany({
  where: { video: { userId } },
});
const count = clips.length;

// ✅ Good: Count in database
const count = await this.prisma.clip.count({
  where: { video: { userId } },
});
```

### Opportunity 2: Existence Checks

```typescript
// ❌ Bad: Fetches entire record just to check existence
const clip = await this.prisma.clip.findUnique({
  where: { id: clipId },
});
const exists = !!clip;

// ✅ Good: Use findFirst with minimal select
const exists = !!(await this.prisma.clip.findFirst({
  where: { id: clipId },
  select: { id: true },
}));
```

### Opportunity 3: Batch Operations

```typescript
// ❌ Bad: Multiple individual queries
for (const clipId of clipIds) {
  await this.prisma.clip.delete({ where: { id: clipId } });
}

// ✅ Good: Single batch operation
await this.prisma.clip.deleteMany({
  where: { id: { in: clipIds } },
});
```

---

## Further Reading

- [Prisma Performance Best Practices](https://www.prisma.io/docs/guides/performance-and-optimization)
- [PostgreSQL EXPLAIN Documentation](https://www.postgresql.org/docs/current/sql-explain.html)
- [Database Indexing Strategies](https://use-the-index-luke.com/)

---

## Contributing

When adding new Prisma queries:

1. **Review this guide** before writing the query
2. **Use `select` by default** — only use `include` with justification
3. **Add comments** explaining why specific fields are needed
4. **Test with production-like data volumes**
5. **Update this guide** if you discover new patterns or optimizations

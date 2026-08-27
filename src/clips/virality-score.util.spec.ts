import { calculateViralityScore } from './virality-score.util';

describe('calculateViralityScore', () => {
  it('ideal clip (15–60s, mid-video, 5+ keywords) scores 100', () => {
    const score = calculateViralityScore({
      durationSeconds: 30, // +40
      positionRatio: 0.5, // +35
      transcript: 'amazing hack secret trick tip best', // 6 keywords → +25
    });
    expect(score).toBe(100);
  });

  it('short clip at start with no transcript scores 20', () => {
    const score = calculateViralityScore({
      durationSeconds: 5, // +10
      positionRatio: 0.05, // +10
    });
    expect(score).toBe(20);
  });

  it('mid-range clip with 1 keyword scores 70', () => {
    const score = calculateViralityScore({
      durationSeconds: 45, // +40
      positionRatio: 0.2, // +20
      transcript: 'a great tip here', // 1 keyword → +10
    });
    expect(score).toBe(70);
  });

  it('score is clamped to 100 maximum', () => {
    const score = calculateViralityScore({
      durationSeconds: 30,
      positionRatio: 0.5,
      transcript:
        'amazing incredible shocking unbelievable secret hack trick tip mistake never',
    });
    expect(score).toBeLessThanOrEqual(100);
  });

  it('score is never below 0', () => {
    const score = calculateViralityScore({
      durationSeconds: 0,
      positionRatio: 0,
    });
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

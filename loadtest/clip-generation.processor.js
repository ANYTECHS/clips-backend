/**
 * #1029 — Artillery `afterResponse` hook.
 * Records queue wait time (time between enqueue and first progress update)
 * and processing time so they can be reported as custom Artillery metrics.
 */
module.exports = {
  recordQueueWaitTime(requestParams, response, context, ee, next) {
    try {
      const body = typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
      if (body && typeof body.waitTimeMs === 'number') {
        ee.emit('custom stat', { stat: 'queue.wait_time', value: body.waitTimeMs });
      }
      if (body && typeof body.processingTimeMs === 'number') {
        ee.emit('custom stat', { stat: 'queue.processing_time', value: body.processingTimeMs });
      }
      if (body && typeof body.progress === 'number') {
        ee.emit('custom stat', { stat: 'queue.progress', value: body.progress });
      }
    } catch (e) {
      // Non-JSON responses (429/401) are counted by http codes instead.
    }
    next();
  },
};

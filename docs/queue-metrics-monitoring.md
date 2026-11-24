# Queue Metrics & Monitoring Guide

Operational guide for ClipCash queue metrics collection, Prometheus exposition, and alerting infrastructure (Issue #1274).

---

## 1. Overview

The ClipCash application uses Prometheus metrics to track BullMQ queue health, worker memory, processing durations, throughput, and error rates. Metrics are collected periodically by `QueueCollectorService` and exposed via the HTTP endpoint `/metrics` on `MetricsController`.

---

## 2. Collected Queue Metrics

All metrics follow Prometheus naming conventions with the prefix `clipcash_queue_`:

| Metric Name | Type | Labels | Description |
|-------------|------|--------|-------------|
| `clipcash_queue_job_count` | Gauge | `queue`, `state` | Current number of jobs in queue by state (`waiting`, `active`, `completed`, `failed`, `delayed`, `prioritized`). |
| `clipcash_queue_active_jobs` | Gauge | `queue` | Number of jobs currently being executed by active workers. |
| `clipcash_queue_depth` | Gauge | `queue` | Total backlog depth awaiting execution (`waiting` + `delayed` jobs). |
| `clipcash_queue_total_jobs` | Gauge | `queue` | Total cumulative count of jobs across all states for each queue. |
| `clipcash_queue_failure_rate` | Gauge | `queue` | Ratio of failed jobs over total processed (`failed / (completed + failed)`), from 0.0 to 1.0. |
| `clipcash_queue_job_throughput_per_minute` | Gauge | `queue` | Throughput of completed jobs per minute. |
| `clipcash_queue_job_duration_seconds` | Histogram | `queue`, `status` | Job processing execution duration in seconds. Buckets: 0.1s, 0.5s, 1s, 5s, 10s, 30s, 1m, 5m, 10m, 30m, 1h. |
| `clipcash_queue_job_completions_total` | Counter | `queue` | Cumulative total of successfully completed jobs. |
| `clipcash_queue_job_failures_total` | Counter | `queue`, `reason` | Cumulative total of failed jobs tagged by failure reason. |
| `clipcash_queue_job_retry_count` | Gauge | `queue` | Average retry count for failed jobs in queue. |
| `clipcash_queue_failure_reason_count` | Gauge | `queue`, `reason` | Frequency breakdown of top error messages sampled from failed jobs. |
| `clipcash_queue_jobs_cleaned_total` | Counter | `queue`, `job_type` | Total count of purged completed or failed jobs. |
| `clipcash_queue_worker_memory_bytes` | Gauge | `type` | Node.js process memory utilization (`rss`, `heapTotal`, `heapUsed`, `external`). |

---

## 3. Metrics Endpoint Security & Access

The metrics endpoint is exposed at:
```http
GET /metrics
```

### Security & Authentication

Operational metrics reveal queue depth, queue names, and error traces. To protect this sensitive operational data:
1. Access requires the HTTP header `x-metrics-token`.
2. The server compares the header against the `METRICS_TOKEN` environment variable.
3. Requests missing or presenting an incorrect token receive `403 Forbidden`.

Example authenticated curl request:
```bash
curl -H "x-metrics-token: your-secure-metrics-token" http://localhost:3000/metrics
```

### Response Format

The response is returned in Prometheus text exposition format (MIME type `text/plain; version=0.0.4; charset=utf-8`):

```prometheus
# HELP clipcash_queue_active_jobs Number of active jobs currently being processed by workers
# TYPE clipcash_queue_active_jobs gauge
clipcash_queue_active_jobs{queue="clip-generation"} 2
clipcash_queue_active_jobs{queue="nft-mint"} 1

# HELP clipcash_queue_depth Total queue depth (waiting and delayed jobs) awaiting execution
# TYPE clipcash_queue_depth gauge
clipcash_queue_depth{queue="clip-generation"} 7
clipcash_queue_depth{queue="nft-mint"} 0

# HELP clipcash_queue_failure_rate Job failure rate ratio
# TYPE clipcash_queue_failure_rate gauge
clipcash_queue_failure_rate{queue="clip-generation"} 0.02
clipcash_queue_failure_rate{queue="nft-mint"} 0.00
```

---

## 4. Prometheus Scraper Configuration

Add the following job to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'clipcash-backend'
    scrape_interval: 15s
    scrape_timeout: 10s
    metrics_path: '/metrics'
    static_configs:
      - targets: ['api.clipcash.internal:3000']
    http_headers:
      x-metrics-token: '${METRICS_TOKEN}'
```

---

## 5. Recommended Prometheus Alert Rules

```yaml
groups:
  - name: clipcash_queue_alerts
    rules:
      - alert: QueueDepthHigh
        expr: clipcash_queue_depth > 50
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High queue depth in {{ $labels.queue }}"
          description: "Queue {{ $labels.queue }} depth is {{ $value }} awaiting execution for >5 minutes."

      - alert: QueueFailureRateCritical
        expr: clipcash_queue_failure_rate > 0.15
        for: 3m
        labels:
          severity: critical
        annotations:
          summary: "High job failure rate in {{ $labels.queue }}"
          description: "Failure rate for queue {{ $labels.queue }} is {{ $value | humanizePercentage }} (threshold 15%)."

      - alert: WorkerMemoryHigh
        expr: clipcash_queue_worker_memory_bytes{type="rss"} > 1073741824
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Worker process memory RSS above 1GB"
          description: "Worker memory is currently {{ $value | humanize1024 }}B."
```

---

## 6. Grafana Dashboard Panels

Recommended queries for dashboard visualizations:
- **Queue Depth:** `clipcash_queue_depth`
- **Active Workers:** `clipcash_queue_active_jobs`
- **Throughput:** `rate(clipcash_queue_job_completions_total[5m]) * 60`
- **Failure Rate:** `clipcash_queue_failure_rate * 100` (%)
- **P95 Processing Duration:** `histogram_quantile(0.95, sum(rate(clipcash_queue_job_duration_seconds_bucket[5m])) by (le, queue))`

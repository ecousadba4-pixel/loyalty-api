const client = require('prom-client');

// ✅ Автоматические метрики (CPU, память, event loop и т.п.)
client.collectDefaultMetrics();

// ✅ Гистограмма времени ответа
const httpRequestDuration = new client.Histogram({
  name: 'loyalty_api_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5]
});

// ✅ Middleware для замера всех запросов
const requestDurationMiddleware = (req, res, next) => {
  // исключаем сам endpoint /metrics, чтобы не было рекурсии
  if (req.path === '/metrics') return next();

  const end = httpRequestDuration.startTimer();

  res.on('finish', () => {
    const route =
      (req.route && req.route.path) ||
      req.path ||
      'unknown';

    end({
      method: req.method,
      route,
      status_code: res.statusCode
    });
  });

  next();
};

// ✅ Handler для /metrics — ВОТ ЭТОГО ТЕБЕ И НЕ ХВАТАЛО!
const metricsHandler = async (req, res) => {
  try {
    res.set('Content-Type', client.register.contentType);
    const metrics = await client.register.metrics();
    res.end(metrics);
  } catch (err) {
    res.status(500).end(err.message);
  }
};

module.exports = {
  client,
  httpRequestDuration,
  requestDurationMiddleware,
  metricsHandler
};

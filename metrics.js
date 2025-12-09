const client = require('prom-client');
client.collectDefaultMetrics();

const httpRequestDuration = new client.Histogram({
  name: 'loyalty_api_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5]
});

const requestDurationMiddleware = (req, res, next) => {
  // skip metrics endpoint itself
  if (req.path === '/metrics') return next();

  const end = httpRequestDuration.startTimer();
  res.on('finish', () => {
    const route = (req.route && req.route.path) || req.path || 'unknown';
    end({ method: req.method, route, status_code: res.statusCode });
  });
  next();
};

module.exports = {
  client,
  httpRequestDuration,
  requestDurationMiddleware
};

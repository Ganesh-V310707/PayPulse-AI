function notFound(req, res) {
  res.status(404).json({ error: 'NOT_FOUND', message: `No route for ${req.method} ${req.originalUrl}` });
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  const status = Number(error.status || error.statusCode || 500);
  if (status >= 500) console.error(`[${req.requestId || 'no-request-id'}]`, error);
  res.status(status).json({
    error: error.code || (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_ERROR'),
    message: status >= 500 && process.env.NODE_ENV === 'production' ? 'The server could not complete the request.' : error.message,
    requestId: req.requestId
  });
}

module.exports = { notFound, errorHandler };

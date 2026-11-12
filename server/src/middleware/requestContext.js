const crypto = require('node:crypto');

function requestContext(req, res, next) {
  const supplied = String(req.headers['x-request-id'] || '');
  // Never reflect arbitrary user input into a response header.
  req.requestId = /^[A-Za-z0-9._:-]{1,100}$/.test(supplied)
    ? supplied
    : crypto.randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
}

module.exports = { requestContext };

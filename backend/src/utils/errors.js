// Standardizes every error response as { success:false, error:CODE, message }
// so the frontend (and anyone else calling this API) always knows what shape
// to expect, and so we never leak stack traces or internals to the client.

function sendError(res, status, code, message) {
  return res.status(status).json({ success: false, error: code, message });
}

module.exports = { sendError };

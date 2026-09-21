const LOCAL_WEBKIT_SSE_PROXY_ERROR = /\/(?:localhost|127\.0\.0\.1):\d+\/api\/inventory\/events\?clientId=[^\s]+ due to access control checks\.$/;

export function actionablePageErrors(errors, engine) {
  const messages = Array.isArray(errors) ? errors.map((value) => String(value ?? "")) : [];
  if (engine !== "webkit") return messages;
  return messages.filter((message) => !LOCAL_WEBKIT_SSE_PROXY_ERROR.test(message));
}

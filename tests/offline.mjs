// All automated application tests are offline; localhost is the HTTP fixture server.
const localFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error(`External network forbidden in tests: ${url.hostname}`);
  return localFetch(input, options);
};

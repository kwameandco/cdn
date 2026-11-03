// Runs ONLY when no file matches: Workers static assets answers every real file itself, before this
// script, and _headers sets those headers. Without this, a 404 would pick up the year-long
// immutable Cache-Control from _headers, and a browser that asked for a version a moment before it
// was deployed would remember the 404 for a year. No logging, no cookies, nothing stored.
export default {
  fetch() {
    return new Response('Not found\n', {
      status: 404,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
        'X-Content-Type-Options': 'nosniff',
        'X-Robots-Tag': 'noindex',
      },
    });
  },
};

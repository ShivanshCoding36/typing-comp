const request = require('supertest');
const app = require('../src/app');

describe('GET /', () => {
  it('should return 200 and serve the participant page', async () => {
    const res = await request(app).get('/');
    expect(res.statusCode).toBe(200);
    expect(res.header['content-type']).toMatch(/html/);
  });
});

describe('GET /api/health', () => {
    // Note: The original generic fallback is serving html, so we check if 404s or explicit routes work.
    // Since there is no health endpoint, let's verify a known route like /api/auth which might fail without creds but show the router is mounted.
    // Actually, let's just stick to the main page for now as a "Smoke Test".
});

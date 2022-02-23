import * as nock from 'nock';
import Bottleneck from 'bottleneck';
import { limiterWithRateLimitRetries } from '../../src/lib/request-with-rate-limit';

beforeEach(() => {
  return nock('https://testUrlOkResponse')
    .persist()
    .get(/.*/)
    .reply(200, (uri) => {
      switch (uri) {
        case '/?x=%D1%88%D0%B5%D0%BB%D0%BB%D1%8B%20%F0%9F%9B%A0':
          return ['test 3'];
        case '/':
          return ['test1', 'test2'];
      }
    });
});

beforeEach(() => {
  return nock('https://testUrlRateLimitResponse')
    .persist()
    .get(/.*/)
    .reply(429, 'Rate limit reached');
});

describe('Testing requestWithRateLimitRetries', () => {
  const limiter = new Bottleneck({
    maxConcurrent: 1,
    minTime: 500,
  });
  test('Test requestWithRateLimitRetries iterates returns an array when response code is 200', async () => {
    const data = await limiterWithRateLimitRetries(
      'get',
      'https://testUrlOkResponse',
      {},
      limiter,
      600,
    );
    expect(data.body).toHaveLength(2);
  }, 20000);
  test('Test requestWithRateLimitRetries with unescape charaters iterates returns an array when response code is 200', async () => {
    const url = 'https://testUrlOkResponse/?x=шеллы 🛠';
    const data = await limiterWithRateLimitRetries(
      'get',
      url,
      {},
      limiter,
      600,
    );
    expect(data.body).toHaveLength(1);
  }, 20000);
  test('Test requestWithRateLimitRetries iterates 7 times when response code is 429', async () => {
    const data = await limiterWithRateLimitRetries(
      'get',
      'https://testUrlRateLimitResponse',
      {},
      limiter,
      600,
    );
    expect((data as any).body.toString()).toEqual('Rate limit reached');
  }, 20000);
});

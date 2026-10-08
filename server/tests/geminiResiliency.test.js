const { generateContentWithRetry } = require('../lib/gemini');
const geminiConfig = require('../lib/geminiConfig');

describe('Gemini Model Resolution, 404 Handling & Fallback Order Tests', () => {

  beforeEach(() => {
    geminiConfig.resetConfigForTesting();
  });

  // Test 1: Startup Model Selection
  test('Startup model selection picks first available model from preference list if configured model is missing', async () => {
    const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const mockClient = {
      models: {
        list: async function* () {
          yield { name: 'models/gemini-3.7-flash', supportedActions: ['generateContent'] };
          yield { name: 'models/gemini-3.5-flash-lite', supportedActions: ['generateContent'] };
        }
      }
    };

    process.env.GEMINI_MODEL = 'gemini-non-existent-model';
    process.env.GEMINI_FALLBACK_MODEL = 'gemini-3.5-flash-lite';

    const config = await geminiConfig.resolveModels({
      forceRefresh: true,
      customClient: mockClient
    });

    expect(config.mainModel).toBe('gemini-3.7-flash');
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Using model gemini-3.7-flash instead of gemini-non-existent-model')
    );

    consoleLogSpy.mockRestore();
  });

  // Test 2: 404 NOT_FOUND Error Handling (Immediate Switch, No 4 Retries)
  test('404 NOT_FOUND error on primary model is not retryable and switches immediately to fallback model', async () => {
    const mainModel = geminiConfig.getModels().mainModel;
    const fallbackModel = geminiConfig.getModels().fallbackModel;
    let primaryAttempts = 0;
    let fallbackAttempts = 0;

    const mockClient = {
      models: {
        generateContent: jest.fn().mockImplementation(({ model }) => {
          if (model === mainModel) {
            primaryAttempts++;
            const err = new Error(`404 NOT_FOUND: Model ${mainModel} does not exist`);
            err.status = 404;
            throw err;
          }
          if (model === fallbackModel) {
            fallbackAttempts++;
            return Promise.resolve({
              text: 'Fallback successful'
            });
          }
          throw new Error(`Unknown model ${model}`);
        })
      }
    };

    const res = await generateContentWithRetry({
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
      customClient: mockClient,
      customDelays: [1, 1, 1, 1]
    });

    // Primary model should be attempted EXACTLY ONCE (no retries on 404)
    expect(primaryAttempts).toBe(1);
    // Fallback model should be called and succeed
    expect(fallbackAttempts).toBe(1);
    expect(res.text).toBe('Fallback successful');
    expect(res.modelUsed).toBe(fallbackModel);
  });

  // Test 3: Model Fallback Order (Main -> Fallback -> Auto-selected)
  test('Gemini generateContent falls back sequentially from main to fallback on retriable 503 error', async () => {
    const mainModel = geminiConfig.getModels().mainModel;
    const fallbackModel = geminiConfig.getModels().fallbackModel;
    let primaryAttempts = 0;
    let fallbackAttempts = 0;

    const mockClient = {
      models: {
        generateContent: jest.fn().mockImplementation(({ model }) => {
          if (model === mainModel) {
            primaryAttempts++;
            const err = new Error('503 Service Unavailable');
            err.status = 503;
            throw err;
          }
          if (model === fallbackModel) {
            fallbackAttempts++;
            return Promise.resolve({
              text: 'Recovered on fallback model'
            });
          }
          throw new Error(`Unexpected model call ${model}`);
        })
      }
    };

    const res = await generateContentWithRetry({
      contents: [{ role: 'user', parts: [{ text: 'Test' }] }],
      customClient: mockClient,
      customDelays: [1, 1, 1, 1]
    });

    // Primary model attempted 4 times before moving to fallback
    expect(primaryAttempts).toBe(4);
    expect(fallbackAttempts).toBe(1);
    expect(res.text).toBe('Recovered on fallback model');
    expect(res.modelUsed).toBe(fallbackModel);
  });
});

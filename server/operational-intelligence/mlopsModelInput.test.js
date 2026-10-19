import { cleanModelInput, MODEL_PROVIDERS } from './mlopsModelInput.js';
import { MODEL_PROVIDERS as FORM_PROVIDERS } from '../../src/components/mlops/AddModelForm.jsx';

test('keeps the name, provider and purpose, with version 1 by default', () => {
  expect(cleanModelInput({ modelName: '  Price predictor ', provider: 'Anthropic', purpose: ' Sets shop prices ' }))
    .toEqual({ model: { modelName: 'Price predictor', provider: 'Anthropic', purpose: 'Sets shop prices', version: '1' } });
});

test('a missing name or unknown provider comes back as a plain-words problem', () => {
  expect(cleanModelInput({ modelName: '   ' }).problem).toBe('Give the model a name.');
  expect(cleanModelInput({ modelName: 'X', provider: 'Acme AI' }).problem).toMatch(/Pick a provider/);
  expect(cleanModelInput({ modelName: 'x'.repeat(81) }).problem).toMatch(/under 80/);
});

test('callers that send no provider still work, filed under Other', () => {
  expect(cleanModelInput({ modelName: 'Churn', version: 3 }).model).toMatchObject({ provider: 'Other', version: '3' });
});

test('the form offers exactly the providers the server accepts', () => {
  expect(FORM_PROVIDERS).toEqual(MODEL_PROVIDERS);
});

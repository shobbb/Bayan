/**
 * No key to call the hosted model with. Its own module so that anything needing
 * it (round generation, article definitions) can import it without importing
 * each other.
 */
export class MissingApiKeyError extends Error {
  constructor() {
    super('No API key set. Add one in Settings to generate rounds.');
    this.name = 'MissingApiKeyError';
  }
}

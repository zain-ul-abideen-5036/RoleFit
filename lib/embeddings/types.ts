/**
 * The embedding provider contract.
 *
 * One method, batched. Batching is not an optimisation detail here — a resume
 * has tens of spans and a posting tens of requirements, and one request per
 * pair would be both slow and expensive enough to matter.
 */

export type EmbeddingProviderName = 'none' | 'openai'

export interface EmbeddingProvider {
  readonly name: EmbeddingProviderName
  readonly model: string
  /** Length of every returned vector. Fixed per model. */
  readonly dimensions: number

  /**
   * Embeds each input, in order.
   *
   * Returns one vector per input. Throws rather than returning a short array:
   * a caller pairing vectors back to inputs by index cannot detect a gap.
   */
  embed(texts: readonly string[]): Promise<number[][]>
}

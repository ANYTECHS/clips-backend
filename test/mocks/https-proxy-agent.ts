/**
 * Jest stub for `https-proxy-agent` (used by the Pact provider Verifier).
 *
 * The vendored ESM build inside @pact-foundation/pact cannot be parsed by
 * Jest's CJS runtime, and provider verification in tests never needs a real
 * proxy. Mapped via `moduleNameMapper` in package.json.
 */
export class HttpsProxyAgent {
  constructor(public readonly uri?: string) {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public protocol: string = 'https:';
}

export default HttpsProxyAgent;

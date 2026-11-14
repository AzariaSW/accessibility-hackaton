/**
 * Replace this mock with an RRS/NIDP integration only after written authorization,
 * documented API access, and an approved data-sharing/security arrangement.
 */
export class IdentityProvider {
  async verify(_input) { throw new Error('Identity provider not implemented'); }
}
export class MockIdentityProvider extends IdentityProvider {
  async verify(input) {
    // Deliberately never claims a real-world identity has been verified.
    if (!input.finNumber) return { status: 'manual_review', providerReference: null };
    return { status: 'mock_pending', providerReference: `mock_${Date.now()}` };
  }
}
export const identityProvider = new MockIdentityProvider();

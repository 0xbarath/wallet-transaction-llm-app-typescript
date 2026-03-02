export function hasLiveCredentials(): boolean {
  return !!(
    process.env.ALCHEMY_API_KEY &&
    process.env.ALCHEMY_RPC_URL &&
    process.env.ANTHROPIC_API_KEY
  );
}

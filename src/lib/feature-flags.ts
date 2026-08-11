/**
 * Premium add-on modules (VIP group, Instagram, blocking) are not part of this
 * client's base package. Flip an entry to `true` and redeploy to activate it
 * once the client pays for the upgrade.
 */
export const FEATURE_FLAGS = {
  vip: false,
  instagram: false,
  blocked: false,
};

export const PLAY_PACKAGE = 'app.bunyan.residential';
export const PLAY_PRODUCTS = { elomara_building_monthly: 'monthly', elomara_building_annual: 'annual' };
export function verifiedEntitlement(purchase, now = Date.now()) {
  const items = purchase.lineItems;
  if (!Array.isArray(items) || items.length !== 1) throw new Error('Unexpected Play line items');
  const item = items[0];
  const plan = PLAY_PRODUCTS[item.productId];
  if (!plan || item.offerDetails?.basePlanId !== plan || item.offerDetails?.offerId) throw new Error('Unconfigured Play product or discount');
  const expiry = Date.parse(item.expiryTime);
  const pending = purchase.subscriptionState === 'SUBSCRIPTION_STATE_PENDING';
  if (!pending && !Number.isFinite(expiry)) throw new Error('Missing Play expiration');
  const active = ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED'].includes(purchase.subscriptionState) && expiry > now;
  return { plan, product: item.productId, basePlan: item.offerDetails.basePlanId, state: purchase.subscriptionState,
    active, pending, expiresAt: Number.isFinite(expiry) ? new Date(expiry).toISOString() : null,
    autoRenewing: item.autoRenewingPlan?.autoRenewEnabled === true };
}

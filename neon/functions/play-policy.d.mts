export const PLAY_PACKAGE: string;
export const PLAY_PRODUCTS: Record<string,string>;
export interface PlaySubscription {
 lineItems?: Array<{productId?:string;expiryTime?:string;offerDetails?:{basePlanId?:string;offerId?:string};autoRenewingPlan?:{autoRenewEnabled?:boolean}}>;
 subscriptionState?:string;
}
export function verifiedEntitlement(purchase: PlaySubscription, now?: number): {plan:string;product:string;basePlan:string;state:string;active:boolean;pending:boolean;expiresAt:string|null;autoRenewing:boolean};

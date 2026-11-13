package app.bunyan.residential;

import com.android.billingclient.api.*;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.*;

/** Native transport only. Entitlements are granted exclusively by the Neon backend. */
@CapacitorPlugin(name = "PlayBilling")
public class PlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private BillingClient billing;
    private final Map<String, ProductDetails> products = new HashMap<>();
    private PluginCall purchaseCall;
    @Override public void load() {
        billing = BillingClient.newBuilder(getContext()).setListener(this)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            .enableAutoServiceReconnection().build();
    }
    private void connected(PluginCall call, Runnable action) {
        if (billing.isReady()) { action.run(); return; }
        billing.startConnection(new BillingClientStateListener() {
            public void onBillingSetupFinished(BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) action.run();
                else call.reject("Google Play unavailable", "PLAY_UNAVAILABLE");
            }
            public void onBillingServiceDisconnected() { }
        });
    }
    @PluginMethod public void catalog(PluginCall call) {
        connected(call, () -> {
            List<QueryProductDetailsParams.Product> requested = new ArrayList<>();
            for (String id : Arrays.asList("elomara_building_monthly", "elomara_building_annual"))
                requested.add(QueryProductDetailsParams.Product.newBuilder().setProductId(id).setProductType(BillingClient.ProductType.SUBS).build());
            billing.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(requested).build(), (result, details) -> {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { call.reject("Unable to load Play prices"); return; }
                products.clear();
                JSArray list = new JSArray();
                for (ProductDetails p : details.getProductDetailsList()) {
                    products.put(p.getProductId(), p);
                    for (ProductDetails.SubscriptionOfferDetails offer : p.getSubscriptionOfferDetails()) {
                        // Discount offers require separate server eligibility/configuration; never infer them from a code.
                        if (offer.getOfferId() != null || !offer.getBasePlanId().equals(p.getProductId().endsWith("monthly") ? "monthly" : "annual")) continue;
                        List<ProductDetails.PricingPhase> phases = offer.getPricingPhases().getPricingPhaseList();
                        if (phases.size() != 1 || phases.get(0).getRecurrenceMode() != ProductDetails.RecurrenceMode.INFINITE_RECURRING) continue;
                        ProductDetails.PricingPhase phase = phases.get(0);
                        String expected = p.getProductId().endsWith("monthly") ? "P1M" : "P1Y";
                        if (!expected.equals(phase.getBillingPeriod())) continue;
                        list.put(new JSObject().put("productId", p.getProductId()).put("basePlanId", offer.getBasePlanId())
                            .put("price", phase.getFormattedPrice()).put("offerToken", offer.getOfferToken()));
                    }
                }
                call.resolve(new JSObject().put("products", list));
            });
        });
    }
    @PluginMethod public void purchase(PluginCall call) {
        connected(call, () -> getActivity().runOnUiThread(() -> {
            if (purchaseCall != null) { call.reject("Purchase already in progress"); return; }
            ProductDetails p = products.get(call.getString("productId"));
            String token = call.getString("offerToken");
            String account = call.getString("accountId", "");
            String profile = call.getString("profileId", "");
            if (p == null || token == null || !account.matches("[a-f0-9]{64}") || !profile.matches("[a-f0-9]{64}")) { call.reject("Reload the plans first"); return; }
            boolean valid = false;
            for (ProductDetails.SubscriptionOfferDetails o : p.getSubscriptionOfferDetails())
                if (o.getOfferId() == null && token.equals(o.getOfferToken())) valid = true;
            if (!valid) { call.reject("Invalid offer"); return; }
            purchaseCall = call;
            BillingResult result = billing.launchBillingFlow(getActivity(), BillingFlowParams.newBuilder()
                .setObfuscatedAccountId(account).setObfuscatedProfileId(profile)
                .setProductDetailsParamsList(Collections.singletonList(BillingFlowParams.ProductDetailsParams.newBuilder()
                    .setProductDetails(p).setOfferToken(token).build())).build());
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                purchaseCall = null; call.reject("Google Play could not start purchase", String.valueOf(result.getResponseCode()));
            }
        }));
    }
    private JSObject purchases(List<Purchase> purchases) {
        JSArray list = new JSArray();
        if (purchases != null) for (Purchase p : purchases)
            list.put(new JSObject().put("token", p.getPurchaseToken()).put("pending", p.getPurchaseState() == Purchase.PurchaseState.PENDING));
        return new JSObject().put("purchases", list);
    }
    @Override public void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        PluginCall call = purchaseCall; purchaseCall = null;
        if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) {
            JSObject data = purchases(purchases);
            notifyListeners("purchasesUpdated", data);
            if (call != null) call.resolve(data);
        } else if (call != null) call.reject(result.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED ? "Purchase cancelled" : "Purchase failed", String.valueOf(result.getResponseCode()));
    }
    @PluginMethod public void restore(PluginCall call) {
        connected(call, () -> billing.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(), (result, list) -> {
            if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) call.resolve(purchases(list));
            else call.reject("Unable to restore purchases");
        }));
    }
    @Override protected void handleOnDestroy() { if (billing != null) billing.endConnection(); }
}

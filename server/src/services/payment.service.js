import { PAYMENT_METHODS } from '../constants/index.js';
import { onlineMethodInfo } from './payments/onlinePayment.service.js';
import { storeSettings, codArea } from './storeSettings.service.js';

/**
 * Which payment methods checkout offers.
 *
 * Cash on Delivery when it is switched on in Settings (up to its order-value
 * limit, and — when the city rule is on — only for deliveries to that city). Online payment only when PhonePe is configured on
 * this server — otherwise the option is shown disabled, never faked. The whole
 * online flow (attempts, verification) lives in
 * services/payments/onlinePayment.service.js.
 */
export const paymentService = {
  availableMethods() {
    return [
      {
        method: PAYMENT_METHODS.COD,
        label: 'Cash on Delivery',
        enabled: storeSettings().shipping.codEnabled,
        // 0 means no limit.
        maxOrderValue: storeSettings().shipping.codMaxOrderValue || null,
        // null = any address; otherwise COD only for deliveries here.
        area: codArea(),
      },
      onlineMethodInfo(),
    ];
  },
};

export default paymentService;

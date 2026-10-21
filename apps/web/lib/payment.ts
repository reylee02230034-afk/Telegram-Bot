export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}

export async function processPayment(params: {
  amount: number;
  currency: string;
  description: string;
  metadata?: Record<string, unknown>;
}): Promise<PaymentResult> {
  const useRealGateway = process.env.PAYMENT_GATEWAY === 'real';

  if (!useRealGateway) {
    const txId = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    console.log(`[SIM PAYMENT] ${params.amount} ${params.currency} - ${params.description} → ${txId}`);
    return { success: true, transactionId: txId };
  }

  return {
    success: false,
    error: '真实支付网关未配置。请设置 PAYMENT_GATEWAY=real 并配置相应密钥。',
  };
}

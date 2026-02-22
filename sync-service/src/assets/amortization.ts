export interface AmortizationPayment {
  month: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
  date: string;
}

export interface AmortizationSummary {
  monthlyPayment: number;
  currentBalance: number;
  totalPaid: number;
  totalInterestPaid: number;
  payoffDate: string;
  monthsRemaining: number;
  schedule?: AmortizationPayment[];
}

export function calculateAmortization(
  principal: number,
  annualRate: number,
  termMonths: number,
  startDate: string,
  paymentsMadeCount?: number,
  includeSchedule = false
): AmortizationSummary {
  const monthlyRate = annualRate / 100 / 12;

  // Monthly payment formula
  let monthlyPayment: number;
  if (monthlyRate === 0) {
    monthlyPayment = principal / termMonths;
  } else {
    monthlyPayment = principal * (monthlyRate * Math.pow(1 + monthlyRate, termMonths)) /
      (Math.pow(1 + monthlyRate, termMonths) - 1);
  }

  // Auto-calculate payments made from start date if not provided
  if (paymentsMadeCount === undefined) {
    const start = new Date(startDate);
    const now   = new Date();
    const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    paymentsMadeCount = Math.max(0, Math.min(months, termMonths));
  }

  const schedule: AmortizationPayment[] = [];
  let balance = principal;
  let totalPaid = 0;
  let totalInterestPaid = 0;
  const startDt = new Date(startDate);

  for (let m = 1; m <= termMonths; m++) {
    const interest  = balance * monthlyRate;
    const prinPay   = Math.min(monthlyPayment - interest, balance);
    balance         = Math.max(0, balance - prinPay);
    totalPaid       += monthlyPayment;
    totalInterestPaid += interest;

    const payDate = new Date(startDt);
    payDate.setMonth(payDate.getMonth() + m);

    if (includeSchedule) {
      schedule.push({
        month: m,
        payment: parseFloat(monthlyPayment.toFixed(2)),
        principal: parseFloat(prinPay.toFixed(2)),
        interest: parseFloat(interest.toFixed(2)),
        balance: parseFloat(balance.toFixed(2)),
        date: payDate.toISOString().split('T')[0],
      });
    }

    if (balance <= 0) break;
  }

  // Current balance = balance after paymentsMadeCount payments
  let currentBalance = principal;
  let totalPaidToDate = 0;
  let totalInterestToDate = 0;
  for (let m = 0; m < paymentsMadeCount; m++) {
    const interest = currentBalance * monthlyRate;
    const prinPay  = Math.min(monthlyPayment - interest, currentBalance);
    currentBalance = Math.max(0, currentBalance - prinPay);
    totalPaidToDate += monthlyPayment;
    totalInterestToDate += interest;
    if (currentBalance <= 0) break;
  }

  const monthsRemaining = Math.max(0, termMonths - paymentsMadeCount);
  const payoffDt = new Date(startDate);
  payoffDt.setMonth(payoffDt.getMonth() + termMonths);

  return {
    monthlyPayment: parseFloat(monthlyPayment.toFixed(2)),
    currentBalance: parseFloat(currentBalance.toFixed(2)),
    totalPaid: parseFloat(totalPaidToDate.toFixed(2)),
    totalInterestPaid: parseFloat(totalInterestToDate.toFixed(2)),
    payoffDate: payoffDt.toISOString().split('T')[0],
    monthsRemaining,
    schedule: includeSchedule ? schedule : undefined,
  };
}

type GenericRecord = Record<string, unknown>;

export function sumNumbers(values: Array<number | string | null | undefined>) {
  return values.reduce((sum, value) => sum + Number(value || 0), 0);
}

export function buildCashReconciliation(input: {
  ledger: GenericRecord[];
  sales: GenericRecord[];
  operationsActualBalance: number;
  operationsComputedBalance: number;
  investAvailable: number;
}) {
  const shopLedger = (input.ledger || []).filter((entry) => entry?.shop_id);

  const drawerOpening = sumNumbers(
    shopLedger
      .filter((entry) => entry.category === "Cash Drawer Opening")
      .map((entry) => entry.amount)
  );

  const salesCash = sumNumbers((input.sales || []).map((sale) => sale.total_with_tax));

  const drawerExpenses = sumNumbers(
    shopLedger
      .filter((entry) => String(entry.type || "").toLowerCase() === "expense")
      .map((entry) => entry.amount)
  );

  const postedToOperations = sumNumbers(
    shopLedger
      .filter((entry) => entry.category === "Operations Transfer")
      .map((entry) => entry.amount)
  );

  const drawerExpectedCash = drawerOpening + salesCash - drawerExpenses - postedToOperations;
  const totalTrackedCash =
    drawerExpectedCash +
    Number(input.operationsActualBalance || 0) +
    Number(input.investAvailable || 0);

  return {
    drawerOpening,
    salesCash,
    drawerExpenses,
    postedToOperations,
    drawerExpectedCash,
    operationsActualBalance: Number(input.operationsActualBalance || 0),
    operationsComputedBalance: Number(input.operationsComputedBalance || 0),
    operationsDelta:
      Number(input.operationsActualBalance || 0) -
      Number(input.operationsComputedBalance || 0),
    investAvailable: Number(input.investAvailable || 0),
    totalTrackedCash,
  };
}

// YorWare Books: the categorizer and the bank CSV reader, ported with their
// tests from Open Books (MIT), an open-source bookkeeping app.
import { categorize, defaultClassifiers } from "../src/lib/yorware/books/engine.js";
import { parseAmountCents, parseCsv, parseDate, rowsFromCsv } from "../src/lib/yorware/books/csv.js";
import { isGenericMerchant, merchantKey, normalizeDescription } from "../src/lib/yorware/books/normalize.js";

const auto = (description, amountCents, rules = []) =>
  categorize({ description, amountCents }, defaultClassifiers(rules));

describe("normalizeDescription", () => {
  it("strips card boilerplate, dates, and store numbers", () => {
    expect(normalizeDescription("POS DEBIT 10/14 SQ *BLUE BOTTLE COF 12345 OAKLAND CA")).toBe("BLUE BOTTLE COF OAKLAND CA");
    expect(normalizeDescription("PURCHASE AUTHORIZED ON 03/02 SHELL OIL 57444 AUSTIN TX")).toBe("SHELL OIL AUSTIN TX");
    expect(normalizeDescription("STARBUCKS STORE #08812")).toBe("STARBUCKS STORE");
  });

  it("gives the same merchant key across locations", () => {
    expect(merchantKey("STARBUCKS STORE #08812 SEATTLE WA")).toBe(merchantKey("STARBUCKS STORE 1234 PORTLAND OR"));
    expect(merchantKey("TST* JOE'S PIZZA 9988 BROOKLYN NY")).toBe("JOE'S PIZZA");
  });
});

describe("keyword categorization", () => {
  const cases = [
    ["SHELL OIL 57444 AUSTIN TX", -4512, "car_truck"],
    ["STARBUCKS STORE #08812", -675, "meals"],
    ["UBER EATS HELP.UBER.COM", -2899, "meals"],
    ["UBER *TRIP HELP.UBER.COM", -1830, "travel"],
    ["DELTA AIR 0062345 ATLANTA", -48900, "travel"],
    ["DELTA DENTAL OF CA", -5400, "se_health_insurance"],
    ["GOOGLE *ADS1234567", -15000, "advertising"],
    ["GOOGLE *GSUITE_ACME", -1440, "software"],
    ["AMAZON WEB SERVICES AWS.AMAZON.CO", -2210, "software"],
    ["ADOBE *CREATIVE CLD", -5999, "software"],
    ["STRIPE TRANSFER ST-A1B2C3", 125000, "gross_receipts"],
    ["STRIPE", -2900, "commissions_fees"],
    ["SHOPIFY PAYOUT", 98000, "gross_receipts"],
    ["SHOPIFY* 123456789", -3900, "software"],
    ["UPWORK -123456789REF", -50000, "contract_labor"],
    ["IRS USATAXPYMT 270556123", -250000, "income_tax_payment"],
    ["PAYMENT THANK YOU - WEB", 150000, "transfer"],
    ["ONLINE TRANSFER TO SAVINGS XXXXX1234", -100000, "transfer"],
    ["MONTHLY SERVICE FEE", -1500, "bank_fees"],
    ["USPS PO 0512345", -1265, "office_expense"],
    ["COMCAST CABLE COMM", -8999, "utilities"],
    ["GUSTO PAYROLL", -420000, "wages"],
    ["LEGALZOOM.COM", -14900, "legal_professional"],
    ["CA SECRETARY OF STATE", -2000, "taxes_licenses"],
    ["WEWORK MEMBERSHIP", -45000, "rent_property"],
    ["THE HOME DEPOT #4521", -8743, "supplies"],
    ["INTEREST CHARGE ON PURCHASES", -1832, "interest_other"],
  ];
  it.each(cases)("%s (%i) -> %s", (description, amount, expected) => {
    expect(auto(description, amount).categoryId).toBe(expected);
  });

  it("treats money back from an expense merchant as a refund in the same category", () => {
    const s = auto("THE HOME DEPOT RETURN", 2500);
    expect(s.categoryId).toBe("supplies");
    expect(s.reason).toMatch(/Refund/);
  });

  it("flags ambiguous merchants for review", () => {
    expect(auto("AMZN MKTP US*2K4", -3499).confidence).toBeLessThan(0.7);
    expect(auto("WALMART SUPERCENTER", -5000).confidence).toBeLessThan(0.7);
  });

  it("falls back to income for unknown deposits and uncategorized for unknown spending, both flagged", () => {
    const deposit = auto("ACME CORP", 50000);
    expect(deposit.categoryId).toBe("gross_receipts");
    expect(deposit.confidence).toBeLessThan(0.7);
    const spend = auto("ZXQW HOLDINGS", -5000);
    expect(spend.categoryId).toBe("uncategorized");
  });
});

describe("user rules", () => {
  const rules = [
    { id: 1, pattern: "ACME CORP", matchType: "contains", direction: "in", categoryId: "gross_receipts" },
    { id: 2, pattern: "STARBUCKS", matchType: "contains", direction: "out", categoryId: "owner_draw" },
  ];

  it("beat built-in keywords", () => {
    const s = auto("STARBUCKS STORE #1", -500, rules);
    expect(s.categoryId).toBe("owner_draw");
    expect(s.source).toBe("rule");
    expect(s.ruleId).toBe(2);
  });

  it("respect direction", () => {
    expect(auto("ACME CORP INVOICE 42", -500, rules).source).not.toBe("rule");
    expect(auto("ACME CORP INVOICE 42", 500, rules).confidence).toBe(0.99);
  });

  it("match whole words only", () => {
    expect(auto("ACME CORPORATE TRAVEL", 500, rules).source).not.toBe("rule");
  });
});

describe("isGenericMerchant", () => {
  it("flags payment-rail descriptions so they are not remembered by default", () => {
    expect(isGenericMerchant(merchantKey("MOBILE DEPOSIT REF 99812"))).toBe(true);
    expect(isGenericMerchant(merchantKey("ZELLE PAYMENT FROM JOHN"))).toBe(true);
    expect(isGenericMerchant(merchantKey("STARBUCKS STORE #1"))).toBe(false);
  });
});


describe("parseCsv", () => {
  it("handles quotes, embedded commas, escaped quotes, and CRLF", () => {
    expect(parseCsv('a,"b, c","say ""hi"""\r\n1,2,3\r\n')).toEqual([
      ["a", "b, c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });
});

describe("parsers", () => {
  it("reads amounts", () => {
    expect(parseAmountCents("$1,234.56")).toBe(123456);
    expect(parseAmountCents("-12.5")).toBe(-1250);
    expect(parseAmountCents("(12.00)")).toBe(-1200);
    expect(parseAmountCents("45.00 DR")).toBe(-4500);
    expect(parseAmountCents("abc")).toBeNull();
  });
  it("reads dates", () => {
    expect(parseDate("2026-03-04")).toBe("2026-03-04");
    expect(parseDate("3/4/2026")).toBe("2026-03-04");
    expect(parseDate("03/04/26")).toBe("2026-03-04");
    expect(parseDate("13/45/2026")).toBeNull();
  });
});

describe("rowsFromCsv", () => {
  it("reads a signed-amount export (Chase style)", () => {
    const csv = "Transaction Date,Post Date,Description,Category,Type,Amount,Memo\n03/02/2026,03/03/2026,SHELL OIL 57444,Gas,Sale,-45.12,\n03/05/2026,03/05/2026,Payment Thank You-Mobile,,Payment,500.00,\n";
    const { rows, errors } = rowsFromCsv(csv);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      { date: "2026-03-02", description: "SHELL OIL 57444", amountCents: -4512 },
      { date: "2026-03-05", description: "Payment Thank You-Mobile", amountCents: 50000 },
    ]);
  });

  it("reads debit and credit columns and skips preamble lines", () => {
    const csv = "Account: Business Checking\n\nDate,Description,Debit,Credit,Balance\n2026-01-02,STRIPE TRANSFER,,1200.00,5000\n2026-01-03,ADOBE,59.99,,4940.01\n";
    const { rows } = rowsFromCsv(csv);
    expect(rows.map((r) => r.amountCents)).toEqual([120000, -5999]);
  });

  it("can flip signs for card exports that show charges as positive", () => {
    const { rows } = rowsFromCsv("Date,Description,Amount\n01/02/2026,ADOBE,59.99\n", { flipSigns: true });
    expect(rows[0].amountCents).toBe(-5999);
  });

  it("explains when columns cannot be found", () => {
    expect(rowsFromCsv("foo,bar\n1,2\n").errors[0]).toMatch(/Could not find/);
  });
});

describe("bank file amount layouts", () => {
  const amounts = (csv) => rowsFromCsv(csv).rows.map((r) => r.amountCents);

  test('split "Debit Amount" / "Credit Amount" columns: purchases are money out, deposits are kept', () => {
    const csv = "Transaction Date,Description,Debit Amount,Credit Amount,Balance\n03/02/2026,SHELL OIL,45.12,,954.88\n03/04/2026,STRIPE TRANSFER,,1200.00,2154.88\n03/05/2026,BANK FEE,0.00,,2154.88\n";
    const { rows, errors } = rowsFromCsv(csv);
    expect(errors).toEqual([]);
    expect(rows.map((r) => [r.description, r.amountCents])).toEqual([["SHELL OIL", -4512], ["STRIPE TRANSFER", 120000], ["BANK FEE", 0]]);
  });

  test("split columns named Withdrawals / Deposits", () => {
    expect(amounts("Date,Description,Withdrawals,Deposits\n03/02/2026,SHELL,$45.12,\n03/03/2026,CLIENT,,\"$1,200.00\"\n")).toEqual([-4512, 120000]);
  });

  test("one signed amount column, including parentheses and DR/CR", () => {
    expect(amounts("Date,Description,Amount\n03/02/2026,A,-45.12\n03/02/2026,B,(45.12)\n03/02/2026,C,$-6.50\n03/02/2026,D,\"1,200.00\"\n03/02/2026,E,10.00 DR\n03/02/2026,F,10.00 CR\n"))
      .toEqual([-4512, -4512, -650, 120000, -1000, 1000]);
  });

  test("one amount column with a debit/credit type column", () => {
    expect(amounts("Date,Description,Amount,Credit Debit Indicator\n03/02/2026,SHELL,45.12,Debit\n03/04/2026,STRIPE,1200.00,Credit\n")).toEqual([-4512, 120000]);
  });
});

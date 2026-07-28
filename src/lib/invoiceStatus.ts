import { Decimal } from "@prisma/client/runtime/library";
import type { InvoiceStatus } from "@prisma/client";

export function deriveInvoiceStatus(input: {
  amount: Decimal | number | string;
  amountPaid: Decimal | number | string;
  currentStatus?: InvoiceStatus;
}): InvoiceStatus {
  if (input.currentStatus === "WAIVED" || input.currentStatus === "CANCELLED") {
    return input.currentStatus;
  }

  const amount = Number(input.amount);
  const paid = Number(input.amountPaid);

  if (paid <= 0) {
    // Preserve OVERDUE until paid; otherwise PENDING
    if (input.currentStatus === "OVERDUE") return "OVERDUE";
    return "PENDING";
  }
  if (paid + 0.0001 >= amount) return "PAID";
  if (input.currentStatus === "OVERDUE") return "OVERDUE";
  return "PARTIAL";
}

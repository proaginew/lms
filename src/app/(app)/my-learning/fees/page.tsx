import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function MyFeesPage() {
  const user = await getCurrentAppUser();
  if (!user) redirect("/signin");

  const invoices = await prisma.invoice.findMany({
    where: { enrollment: { userId: user.id } },
    include: {
      enrollment: { include: { course: true } },
      feeStructure: true,
      payments: { orderBy: { paidAt: "desc" } },
    },
    orderBy: { dueDate: "asc" },
  });

  const overdue = invoices.filter((i) => i.status === "OVERDUE");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/my-learning" className="text-sm text-[var(--yt-muted)] hover:underline">
          ← My Learning
        </Link>
        <h2 className="mt-2 text-xl font-semibold sm:text-2xl">My fees</h2>
        <p className="yt-meta mt-1">Invoices and payment history for your enrollments.</p>
      </div>

      {overdue.length > 0 && (
        <div className="yt-card border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          You have overdue fees. Recording access may be blocked until balances are cleared.
          Contact admin to record a payment.
        </div>
      )}

      <div className="yt-card yt-table-scroll">
        <table className="yt-table">
          <thead>
            <tr>
              <th>Course</th>
              <th>Fee</th>
              <th>Amount</th>
              <th>Paid</th>
              <th>Due</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-[var(--yt-muted)]">
                  No invoices yet.
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.enrollment.course.name}</td>
                  <td>{inv.feeStructure?.title || "—"}</td>
                  <td>₹{Number(inv.amount).toFixed(2)}</td>
                  <td>₹{Number(inv.amountPaid).toFixed(2)}</td>
                  <td>{inv.dueDate.toLocaleDateString()}</td>
                  <td>{inv.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

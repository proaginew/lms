import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentAppUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function AdminStudentFeesPage({ params }: PageProps) {
  const user = await getCurrentAppUser();
  if (!user) redirect("/signin");
  if (user.role !== "ADMIN") redirect("/");

  const { id } = await params;
  const student = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true },
  });
  if (!student) redirect("/admin/fees");

  const invoices = await prisma.invoice.findMany({
    where: { enrollment: { userId: id } },
    include: {
      enrollment: { include: { course: true } },
      feeStructure: true,
      payments: { orderBy: { paidAt: "desc" } },
    },
    orderBy: { dueDate: "asc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/fees" className="text-sm text-[var(--yt-muted)] hover:underline">
          ← Fees
        </Link>
        <h2 className="mt-2 text-xl font-semibold sm:text-2xl">
          Fee ledger · {student.name || student.email || "Student"}
        </h2>
        <p className="yt-meta mt-1">{student.email}</p>
      </div>

      <div className="yt-card yt-table-scroll">
        <table className="yt-table">
          <thead>
            <tr>
              <th>Course</th>
              <th>Fee</th>
              <th>Amount</th>
              <th>Paid</th>
              <th>Status</th>
              <th>Due</th>
              <th>Payments</th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[var(--yt-muted)]">
                  No invoices for this student.
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id}>
                  <td>{inv.enrollment.course.name}</td>
                  <td>{inv.feeStructure?.title || "—"}</td>
                  <td>₹{Number(inv.amount).toFixed(2)}</td>
                  <td>₹{Number(inv.amountPaid).toFixed(2)}</td>
                  <td>{inv.status}</td>
                  <td>{inv.dueDate.toLocaleDateString()}</td>
                  <td className="text-xs text-[var(--yt-muted)]">
                    {inv.payments.length === 0
                      ? "—"
                      : inv.payments
                          .map(
                            (p) =>
                              `₹${Number(p.amount).toFixed(2)} ${p.method} ${p.paidAt.toLocaleDateString()}`,
                          )
                          .join(" · ")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

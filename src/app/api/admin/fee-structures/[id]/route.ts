import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

type RouteParams = { params: Promise<{ id: string }> };

async function assertEditable(id: string) {
  const fee = await prisma.feeStructure.findUnique({
    where: { id },
    include: { _count: { select: { invoices: true } } },
  });
  if (!fee) return { error: NextResponse.json({ message: "Not found" }, { status: 404 }) };
  if (fee._count.invoices > 0) {
    return {
      error: NextResponse.json(
        {
          message:
            "Cannot edit or delete a fee structure that already has invoices. Create a new structure instead.",
        },
        { status: 409 },
      ),
    };
  }
  return { fee };
}

export async function PATCH(request: Request, { params }: RouteParams) {
  try {
    await requireAdmin();
    const { id } = await params;
    const check = await assertEditable(id);
    if (check.error) return check.error;

    const body = (await request.json()) as {
      title?: string;
      amount?: number | string;
      currency?: string;
      dueDate?: string | null;
      sequence?: number;
      isActive?: boolean;
    };

    const data: Prisma.FeeStructureUpdateInput = {};
    if (typeof body.title === "string") data.title = body.title.trim();
    if (body.amount !== undefined) {
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        return NextResponse.json({ message: "Invalid amount" }, { status: 400 });
      }
      data.amount = new Prisma.Decimal(amount);
    }
    if (typeof body.currency === "string") data.currency = body.currency.trim() || "INR";
    if (body.dueDate !== undefined) {
      data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
    }
    if (body.sequence !== undefined && Number.isFinite(body.sequence)) {
      data.sequence = Number(body.sequence);
    }
    if (typeof body.isActive === "boolean") data.isActive = body.isActive;

    const feeStructure = await prisma.feeStructure.update({
      where: { id },
      data,
    });
    return NextResponse.json({ feeStructure });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    await requireAdmin();
    const { id } = await params;
    const check = await assertEditable(id);
    if (check.error) return check.error;

    await prisma.feeStructure.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json({ message: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ message }, { status: 500 });
  }
}

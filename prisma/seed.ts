import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const templates = [
  {
    key: "FEE_DUE_REMINDER",
    channel: "BOTH" as const,
    subject: "Fee reminder: {{courseName}} due {{dueDate}}",
    body: "Hi {{studentName}}, your fee of {{amount}} for {{courseName}} is due on {{dueDate}}. Please arrange payment to avoid access interruption.",
  },
  {
    key: "INVOICE_OVERDUE",
    channel: "BOTH" as const,
    subject: "Overdue fee: {{courseName}}",
    body: "Hi {{studentName}}, your fee of {{amount}} for {{courseName}} was due on {{dueDate}} and is now overdue. Please clear dues to restore recording access.",
  },
  {
    key: "PAYMENT_RECEIVED",
    channel: "BOTH" as const,
    subject: "Payment received — {{courseName}}",
    body: "Hi {{studentName}}, we received {{amount}} for {{courseName}}. Thank you. Current invoice status: {{status}}.",
  },
  {
    key: "NEW_COURSE_ANNOUNCEMENT",
    channel: "EMAIL" as const,
    subject: "{{title}}",
    body: "Hi {{studentName}}, {{description}}",
  },
  {
    key: "INVOICE_ISSUED",
    channel: "EMAIL" as const,
    subject: "Invoice issued — {{courseName}}",
    body: "Hi {{studentName}}, an invoice of {{amount}} for {{courseName}} is due on {{dueDate}}.",
  },
];

async function main() {
  for (const template of templates) {
    await prisma.notificationTemplate.upsert({
      where: { key: template.key },
      create: template,
      update: {
        channel: template.channel,
        subject: template.subject,
        body: template.body,
      },
    });
  }
  console.log(`Seeded ${templates.length} notification templates`);
  console.log("Users:", await prisma.user.count());
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

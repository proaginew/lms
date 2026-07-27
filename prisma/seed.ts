import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("No DB course seed — courses are loaded at runtime.");
  console.log("Users:", await prisma.user.count());
  console.log("Access requests:", await prisma.accessRequest.count());
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
